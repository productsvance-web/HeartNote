// Server-only Claude extraction: transcript + patient context → structured CHF
// observations + caregiver-friendly summary.
//
// - Haiku 4.5 with prompt caching against research/chf-source-of-truth.md.
// - tool_use with tool_choice forces a single structured call.
// - Output shape: { readings[], symptom_events[], day_level{}, ... }
//   Each multi-reading vital becomes one row in daily_log_readings.
//   Each symptom report becomes one row in daily_log_symptom_events.
//   day_level fields stay on daily_logs (sparse — only fields the caregiver
//   actually mentioned).
// - Hard guardrails baked into the system prompt: no diagnosis, no dose
//   advice, no treatment recommendations, no alarming language. Grelief test
//   in the prompt because that's where it's enforced.
// - Research file is read once per process; cache_control on the system block
//   means the FIRST call writes (~1.25× cost) and subsequent calls within 5
//   min read (~0.1× cost).

import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const anthropic = new Anthropic();

let cachedResearch: string | null = null;
async function loadResearch(): Promise<string> {
  if (cachedResearch) return cachedResearch;
  const researchPath = path.join(process.cwd(), 'research', 'chf-source-of-truth.md');
  cachedResearch = await readFile(researchPath, 'utf-8');
  return cachedResearch;
}

const LOG_OBSERVATION_TOOL: Anthropic.Tool = {
  name: 'log_observation',
  description:
    "Extract structured CHF observations from a caregiver's voice log transcript and produce a brief caregiver-friendly summary. Each array is empty if the caregiver mentioned nothing in that category. Day-level fields are omitted unless mentioned. Use null/omit instead of guessing.",
  input_schema: {
    type: 'object',
    properties: {
      readings: {
        type: 'array',
        description:
          'Numeric vitals the caregiver explicitly stated. One entry per measurement. Omit any vital the caregiver did not mention. Do not guess. If multiple readings of the same vital are given in this transcript, include each as a separate entry.',
        items: {
          type: 'object',
          properties: {
            field: {
              type: 'string',
              enum: ['weight_lb', 'resting_hr', 'spo2', 'systolic_bp', 'diastolic_bp'],
            },
            value: {
              type: 'number',
              description:
                'The numeric value the caregiver stated. weight_lb in pounds, resting_hr in bpm, spo2 0–100, systolic_bp/diastolic_bp in mmHg.',
            },
          },
          required: ['field', 'value'],
        },
      },
      symptom_events: {
        type: 'array',
        description:
          'Symptoms the caregiver explicitly addressed (either present or explicitly absent). One entry per symptom mentioned in this transcript. If the caregiver said nothing about a symptom, OMIT it entirely — do not include a present=false event for symptoms that were never raised.',
        items: {
          type: 'object',
          properties: {
            symptom: {
              type: 'string',
              enum: [
                'dyspnea',
                'cough',
                'chest_pain',
                'swelling',
                'fatigue',
                'pnd',
                'syncope',
                'cognition_change',
                'extremities_cold_clammy',
                'cyanosis',
                'early_satiety',
              ],
              description:
                'The symptom referenced. dyspnea=shortness of breath. pnd=paroxysmal nocturnal dyspnea (waking up gasping 1–3h after lying down). cyanosis=blue lips/fingers (TIER-1). syncope=fainted (TIER-1).',
            },
            present: {
              type: 'boolean',
              description:
                'true = symptom is present (any severity, including severity=0 for explicitly-confirmed-absent graded symptoms like "breathing is fine"). false = explicitly denied ("no chest pain"). The "explicitly denied" form has clinical value — record it.',
            },
            severity: {
              type: 'integer',
              minimum: 0,
              maximum: 4,
              description:
                "For graded symptoms (dyspnea, swelling, fatigue, cognition_change). Use the per-symptom anchors below. Omit for non-graded boolean symptoms (cough, chest_pain, pnd, syncope, extremities_cold_clammy, cyanosis, early_satiety). DYSPNEA: 0=none/breathing fine. 1=on heavy exertion. 2=on normal walking. 3=on minimal activity. 4=at rest, can't finish sentences (TIER-1). SWELLING: 0=none. 1=mild ankle. 2=moderate (calf). 3=severe (knee+). 4=anasarca/abdominal. FATIGUE: 0=none. 1=mild. 2=moderate. 3=severe. 4=can't move from chair. COGNITION_CHANGE: 0=none. 1=mild fog (tier-3). 2=confusion (tier-2). 4=severe / unable to recognize family (TIER-1).",
            },
            body_region: {
              type: 'string',
              description:
                'Where on the body, if mentioned (e.g. "left calf" for swelling, "left arm" for chest pain radiation). Omit if not mentioned.',
            },
            nocturnal: {
              type: 'boolean',
              description:
                'true if the caregiver indicated the symptom happened at night ("coughed all night," "woke up coughing," "shortness of breath at 3 AM"). Omit when there is no nighttime cue. Most relevant for cough — new persistent nocturnal cough is a tier-2 signal in the research file.',
            },
            sputum_color: {
              type: 'string',
              enum: ['clear', 'white', 'pink_frothy'],
              description:
                'For cough events only. PINK FROTHY is a TIER-1 (911) sign of acute pulmonary edema. If the caregiver mentions pink frothy sputum without saying "cough," still record this as a cough event with present=true and sputum_color=pink_frothy — the sputum implies coughing.',
            },
            chest_pain_character: {
              type: 'string',
              description:
                'For chest_pain events only. Brief description if mentioned (location, quality, radiation).',
            },
          },
          required: ['symptom', 'present'],
        },
      },
      day_level: {
        type: 'object',
        description:
          "Fields that are summary-level for the day (not events). Each is OPTIONAL — only include fields the caregiver actually mentioned in this transcript.",
        properties: {
          pillow_count: {
            type: 'integer',
            description:
              'Pillows the patient slept with last night. RULES: (a) caregiver said NOTHING about pillows → OMIT. (b) caregiver said "pillows were normal" / "her usual pillows" / "same as always" → fill with the patient\'s normal value from context. (c) caregiver named a specific number → fill that number. (d) caregiver said something general like "she had a good night\'s rest" with no pillow mention → OMIT.',
          },
          appetite_change: {
            type: 'string',
            enum: ['decreased', 'unchanged', 'increased'],
          },
          urine_output_change: {
            type: 'string',
            enum: ['decreased', 'unchanged', 'increased'],
          },
          activity_tolerance_change: {
            type: 'string',
            description:
              "The caregiver's exact phrase about what the patient can or can't do today (e.g. \"stopped halfway up the stairs\", \"she walked to the bathroom fine\"). Omit if not mentioned.",
          },
        },
      },
      caregiver_summary: {
        type: 'string',
        description:
          'A 1–2 sentence confirmation of what was logged, in warm caregiver-friendly language. PASS THE GRELIEF TEST: must read right at the top of the caregiver\'s rollercoaster AND at the bottom. Examples: "Got it — Mom is at 162 today, two pillows, and ankles look puffier than yesterday." / "Logged: BP 110/70, no swelling, breakfast eaten. Steady day." NEVER include diagnosis, medication recommendations, treatment advice, or alarming language. NEVER use phrases like "this looks serious" or "you should worry."',
      },
      ai_reasoning: {
        type: 'string',
        description:
          'A 1–2 sentence note describing any patterns you noticed, with attribution to the research source-of-truth (AHA, Cleveland Clinic, etc.). Examples: "Weight is up 3 lb in 24 hours, which the AHA flags as worth a call to the cardiologist today." / "Pillow count up from 1 to 2 — orthopnea is a tier-2 decompensation signal per the research file." / "No concerning patterns today." NEVER recommend dose changes or treatments. ALWAYS direct serious concerns to the cardiologist.',
      },
      follow_up_question: {
        type: 'string',
        description:
          'OPTIONAL. ONE completeness question if something obvious is missing (e.g., "You mentioned weight but not how she\'s breathing — anything to note?"). Empty string if nothing important is missing. NEVER ask more than one. NEVER ask leading or alarming questions.',
      },
    },
    required: ['readings', 'symptom_events', 'day_level', 'caregiver_summary', 'ai_reasoning'],
  },
};

const SYSTEM_PROMPT_HEADER = `You are HeartNote's clinical extraction assistant. Your job is ONE thing: take a caregiver's voice log transcript about a patient with congestive heart failure (CHF) and call the log_observation tool exactly once with the structured fields you can extract plus a brief caregiver-friendly summary.

# HARD GUARDRAILS — never violate

1. NEVER diagnose. You may identify PATTERNS (e.g. "weight is up 4 lb in 5 days") but never say "this is decompensation," "she has heart failure exacerbation," or any diagnostic claim.
2. NEVER recommend dose changes, medication changes, starting/stopping a med, or any treatment. The strongest medical guidance you may give is "talk to the cardiologist" or "call the cardiologist's office today."
3. NEVER recommend the ER, 911, or any specific medical action. HeartNote's tier-detection logic (separate from you) handles emergency triage based on the structured fields you extract.
4. NEVER use alarming language ("this is bad," "you should worry," "she's in trouble"). The GRELIEF TEST: every sentence has to work at the top of a caregiver's emotional rollercoaster AND at the bottom — sit with the oscillation, not amplify it. No chirpy "great job!" either.
5. ALWAYS attribute clinical claims to the source (AHA, Cleveland Clinic, ESC, the research file). Never invent thresholds.
6. ONLY include readings/events/day_level fields the caregiver actually mentioned IN THIS TRANSCRIPT. Patient context (dry_weight, normal_pillow_count) is a LOOKUP for resolving phrases like "pillows were normal" — NOT a default. If the caregiver said nothing about a topic, OMIT it.

# How to fill the output

## readings[]
- Each numeric vital the caregiver explicitly stated → one entry.
- "her weight was 174" → { field: "weight_lb", value: 174 }
- "BP 120 over 80" → two entries: { field: "systolic_bp", value: 120 } and { field: "diastolic_bp", value: 80 }
- Multiple readings of the same vital in one transcript → multiple entries.
- "weight was normal" / "BP was fine" → OMIT (not a number).

## symptom_events[]
- Each symptom the caregiver explicitly addressed → one entry. Both "she has X" and "she does NOT have X" are recordable; the second has clinical value.
- "dry cough today" → { symptom: "cough", present: true }
- "no cough" → { symptom: "cough", present: false }
- "her breathing is fine" → { symptom: "dyspnea", present: true, severity: 0 }
- "winded climbing stairs" → { symptom: "dyspnea", present: true, severity: 1 or 2 }
- "out of breath at rest, can't finish sentences" → { symptom: "dyspnea", present: true, severity: 4 } (TIER-1)
- "swelling in her left calf" → { symptom: "swelling", present: true, severity: 2, body_region: "left calf" }
- "coughed all night" / "woke up coughing" → { symptom: "cough", present: true, nocturnal: true } (TIER-2 if persistent over days)
- "pink frothy sputum" (with or without saying "cough") → { symptom: "cough", present: true, sputum_color: "pink_frothy" } (TIER-1 pulmonary edema)
- "no chest pain" → { symptom: "chest_pain", present: false }
- "she fainted" → { symptom: "syncope", present: true } (TIER-1)
- "she's been confused all morning" → { symptom: "cognition_change", present: true, severity: 2 }
- Symptoms with severity scales: dyspnea, swelling, fatigue, cognition_change. Other symptoms (cough, chest_pain, pnd, syncope, extremities_cold_clammy, cyanosis, early_satiety) are boolean — fill present, omit severity.
- Caregiver said nothing about a symptom → DO NOT include it. Empty array is correct when nothing was said.

## day_level
- pillow_count: see the field rule below.
- appetite_change / urine_output_change: only if the caregiver named one of decreased / unchanged / increased.
- activity_tolerance_change: capture the caregiver's actual phrase if they described what the patient could or couldn't do.
- Omit any field the caregiver didn't address. day_level: {} is valid.

# pillow_count rules — read carefully
- Caregiver said NOTHING about pillows / sleeping position → OMIT pillow_count.
- "pillows were normal" / "her usual pillows" / "same as always" → fill day_level.pillow_count with the patient's normal value from context. THIS IS THE ONE CASE WHERE YOU USE THE ONBOARDING VALUE.
- Specific number ("she slept on 5 pillows") → fill that number.
- "she had a good night's rest" with no pillow mention → OMIT.

# Tone reference

✅ Good caregiver_summary examples:
- "Got it — Mom is at 162 today, two pillows, and ankles look puffier than yesterday."
- "Logged: BP 110/70, no swelling, she ate breakfast. Steady day."
- "Logged today: weight up 3 from yesterday and a new dry cough at night. I caught both."

❌ Avoid:
- "This is concerning — please call the cardiologist immediately!" (alarming + medical recommendation)
- "Great job logging today!" (chirpy / fails grelief test)
- "Your mom appears to be experiencing decompensation." (diagnostic)
- Anything that tells the caregiver to change, hold, start, stop, or adjust a medication. The prescriber decides what to do; you only surface what was observed.

# How to use ai_reasoning

Surface real patterns with research attribution. If nothing's notable, say so plainly:
- "Weight is up 3 lb in 24 hours — the AHA flags >2 lb/day as worth a call to the cardiologist today."
- "Pillow count went 1→2 plus a new nocturnal cough; the research file calls this a tier-2 compound pattern (orthopnea + cough)."
- "No concerning patterns today."

# Knowledge base — CHF source-of-truth

The reference document below is your knowledge base. Use it for thresholds, decompensation patterns, medication watchpoints, and caregiver language. You may reference it in ai_reasoning. The only output is the tool call.

`;

export type PatientContext = {
  displayName: string;
  relationship: string | null;
  dryWeightLb: number | null;
  nyhaClass: string | null;
  // Set at onboarding. Used by Claude ONLY to resolve caregiver phrases
  // like "pillows were normal" → fill day_level.pillow_count with this value.
  // Never used as a default when pillows aren't mentioned at all.
  normalPillowCount: number | null;
};

export type ReadingExtraction = {
  field: 'weight_lb' | 'resting_hr' | 'spo2' | 'systolic_bp' | 'diastolic_bp';
  value: number;
};

export type SymptomEventExtraction = {
  symptom:
    | 'dyspnea'
    | 'cough'
    | 'chest_pain'
    | 'swelling'
    | 'fatigue'
    | 'pnd'
    | 'syncope'
    | 'cognition_change'
    | 'extremities_cold_clammy'
    | 'cyanosis'
    | 'early_satiety';
  present: boolean;
  severity?: number;
  body_region?: string;
  nocturnal?: boolean;
  sputum_color?: 'clear' | 'white' | 'pink_frothy';
  chest_pain_character?: string;
};

export type DayLevelExtraction = {
  pillow_count?: number;
  appetite_change?: 'decreased' | 'unchanged' | 'increased';
  urine_output_change?: 'decreased' | 'unchanged' | 'increased';
  activity_tolerance_change?: string;
};

export type ExtractionResult = {
  readings: ReadingExtraction[];
  symptomEvents: SymptomEventExtraction[];
  dayLevel: DayLevelExtraction;
  caregiverSummary: string;
  aiReasoning: string;
  followUpQuestion: string;
};

export async function extractWithClaude(
  transcript: string,
  patientContext: PatientContext
): Promise<ExtractionResult> {
  const research = await loadResearch();

  const userMessage = `# Patient context (lookup table — apply per the field-by-field rules in the system prompt; do NOT use as defaults)
- Refers to patient as: ${patientContext.displayName}
- Relationship to caregiver: ${patientContext.relationship ?? 'unknown'}
- Cardiologist-set dry weight: ${patientContext.dryWeightLb ? `${patientContext.dryWeightLb} lb` : 'not set'}
- NYHA functional class: ${patientContext.nyhaClass ?? 'unknown'}
- Patient's normal pillow count when sleeping: ${patientContext.normalPillowCount ?? 'unknown'} (use ONLY when caregiver says "pillows were normal" or equivalent — never as a default)

# Caregiver's voice log transcript
"""
${transcript}
"""

Extract observations from the transcript and write the caregiver-friendly summary. Call log_observation now.

REMINDER: only include readings, symptom_events, and day_level fields the caregiver explicitly mentioned. Empty arrays / empty day_level are valid. The patient context above is a LOOKUP for resolving phrases like "pillows were normal" — it is NOT a source of default values.`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT_HEADER + research,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [LOG_OBSERVATION_TOOL],
    tool_choice: { type: 'tool', name: 'log_observation' },
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === 'tool_use' && block.name === 'log_observation'
  );
  if (!toolUseBlock) {
    throw new Error(`Claude did not call log_observation. stop_reason=${response.stop_reason}`);
  }

  const input = toolUseBlock.input as {
    readings?: ReadingExtraction[];
    symptom_events?: SymptomEventExtraction[];
    day_level?: DayLevelExtraction;
    caregiver_summary: string;
    ai_reasoning: string;
    follow_up_question?: string;
  };

  return {
    readings: input.readings ?? [],
    symptomEvents: input.symptom_events ?? [],
    dayLevel: input.day_level ?? {},
    caregiverSummary: input.caregiver_summary,
    aiReasoning: input.ai_reasoning,
    followUpQuestion: input.follow_up_question ?? '',
  };
}
