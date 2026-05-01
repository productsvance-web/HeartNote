// Server-only Claude extraction: transcript + patient context → structured CHF
// observations + caregiver-friendly summary.
//
// - Haiku 4.5 with prompt caching against research/chf-source-of-truth.md.
//   The extraction is a single forced tool call against a strict schema —
//   Haiku handles structured output well and runs 2-3x faster than Sonnet,
//   which makes the post-recording wait feel snappy. CLAUDE.md only locks
//   Sonnet for trend synthesis and Opus for visit reports; voice-log
//   extraction isn't pinned. The hard guardrails in the system prompt
//   carry across models.
// - tool_use with tool_choice forces a single structured call. The tool input shape
//   mirrors daily_logs columns 1:1 so the upsert is mechanical.
// - Hard guardrails baked into the system prompt: no diagnosis, no dose advice,
//   no treatment recommendations, no alarming language. The "grelief test" is in
//   the prompt because that's where it's enforced — pass it during generation,
//   not as a post-hoc filter.
// - Research file is read once per process; cache_control on the system block
//   means the FIRST call writes (~1.25× cost) and subsequent calls within 5 min
//   read (~0.1× cost).

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
    'Extract structured CHF observations from a caregiver\'s voice log transcript and produce a brief caregiver-friendly summary. Every field is optional — only fill what the caregiver actually mentioned. Use null/omit instead of guessing.',
  input_schema: {
    type: 'object',
    properties: {
      // Vitals
      weight_lb: { type: 'number', description: 'Weight in pounds, if mentioned.' },
      systolic_bp: { type: 'integer', description: 'Systolic BP, if mentioned.' },
      diastolic_bp: { type: 'integer', description: 'Diastolic BP, if mentioned.' },
      resting_hr: { type: 'integer', description: 'Resting heart rate (bpm), if mentioned.' },
      spo2: { type: 'integer', description: 'Pulse oximeter reading (0–100), if mentioned.' },

      // Subjective baseline
      feeling_score: {
        type: 'integer',
        minimum: 1,
        maximum: 5,
        description: '1–5 scale of how the patient seemed overall today (5=best). Only fill if the caregiver gave enough cues to score this confidently.',
      },

      // Respiratory (tier-1 trip lines live here)
      dyspnea_level: {
        type: 'integer',
        minimum: 0,
        maximum: 4,
        description:
          'Shortness of breath. 0=none. 1=on heavy exertion. 2=on normal walking. 3=on minimal activity. 4=at rest, can\'t finish sentences (TIER-1).',
      },
      pillow_count: { type: 'integer', description: 'Pillows the patient slept with last night, if mentioned.' },
      pnd_episode: {
        type: 'boolean',
        description: 'Did the patient wake up gasping for breath 1–3 hours after lying down? (Paroxysmal nocturnal dyspnea — high-specificity decompensation sign.)',
      },
      cough_present: { type: 'boolean', description: 'Is the patient coughing today?' },
      cough_nocturnal: { type: 'boolean', description: 'Is the cough specifically at night?' },
      sputum_color: {
        type: 'string',
        enum: ['clear', 'white', 'pink_frothy'],
        description: 'Color of any sputum produced. PINK FROTHY is a tier-1 (911) sign of acute pulmonary edema.',
      },

      // Circulatory
      swelling_severity: {
        type: 'integer',
        minimum: 0,
        maximum: 4,
        description:
          'Peripheral edema severity. 0=none. 1=mild ankle. 2=moderate (calf). 3=severe (knee+). 4=anasarca/abdominal distension.',
      },
      extremities_cold_clammy: { type: 'boolean', description: 'Are extremities cold or clammy? (Low-output sign.)' },
      cyanosis: { type: 'boolean', description: 'Are lips or fingers blue / cyanotic? TIER-1.' },

      // Acute neurological — tier-1 trip lines
      chest_pain: { type: 'boolean', description: 'New chest pain or pressure? TIER-1.' },
      chest_pain_character: { type: 'string', description: 'Brief description if mentioned (location, quality, radiation).' },
      syncope: { type: 'boolean', description: 'Did the patient faint? TIER-1.' },

      // Constitutional / GI / urinary
      appetite_change: { type: 'string', enum: ['decreased', 'unchanged', 'increased'] },
      early_satiety: { type: 'boolean', description: 'Filled up after only a few bites? (Gut-congestion sign.)' },
      fatigue_level: { type: 'integer', minimum: 0, maximum: 4, description: 'Fatigue. 0=none. 1=mild. 2=moderate. 3=severe. 4=can\'t move from chair.' },
      urine_output_change: { type: 'string', enum: ['decreased', 'unchanged', 'increased'] },

      // Cognitive / mood
      cognition_change: {
        type: 'string',
        enum: ['none', 'mild_fog', 'confusion', 'severe'],
        description: 'Cognitive change vs. their baseline. mild_fog = tier-3. confusion = tier-2. severe / unable to recognize family = tier-1.',
      },

      // Activity tolerance — capture the caregiver's actual words
      activity_tolerance_change: {
        type: 'string',
        description: 'The caregiver\'s exact phrase about what the patient can or can\'t do today (e.g. "stopped halfway up the stairs", "she walked to the bathroom fine"). Empty string if not mentioned.',
      },

      // AI commentary fields
      caregiver_summary: {
        type: 'string',
        description:
          'A 1–2 sentence confirmation of what was logged, in warm caregiver-friendly language. PASS THE GRELIEF TEST: must read right at the top of the caregiver\'s rollercoaster AND at the bottom. Examples of good: "Got it — Mom is at 162 today, two pillows, and ankles look puffier than yesterday." / "Logged: BP 110/70, no swelling, breakfast eaten. Steady day." NEVER include diagnosis, medication recommendations, treatment advice, or alarming language. NEVER use phrases like "this looks serious" or "you should worry."',
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
    required: ['caregiver_summary', 'ai_reasoning'],
  },
};

const SYSTEM_PROMPT_HEADER = `You are HeartNote's clinical extraction assistant. Your job is ONE thing: take a caregiver's voice log transcript about a patient with congestive heart failure (CHF) and call the log_observation tool exactly once with the structured fields you can extract plus a brief caregiver-friendly summary.

# HARD GUARDRAILS — never violate

1. NEVER diagnose. You may identify PATTERNS (e.g. "weight is up 4 lb in 5 days") but never say "this is decompensation," "she has heart failure exacerbation," or any diagnostic claim.
2. NEVER recommend dose changes, medication changes, starting/stopping a med, or any treatment. The strongest medical guidance you may give is "talk to the cardiologist" or "call the cardiologist's office today."
3. NEVER recommend the ER, 911, or any specific medical action. HeartNote's tier-detection logic (separate from you) handles emergency triage based on the structured fields you extract.
4. NEVER use alarming language ("this is bad," "you should worry," "she's in trouble"). The GRELIEF TEST: every sentence has to work at the top of a caregiver's emotional rollercoaster AND at the bottom — sit with the oscillation, not amplify it. No chirpy "great job!" either.
5. ALWAYS attribute clinical claims to the source (AHA, Cleveland Clinic, ESC, the research file). Never invent thresholds.
6. ONLY fill structured fields the caregiver actually mentioned IN THIS TRANSCRIPT. If the caregiver didn't say anything about pillows, do not fill pillow_count — even if you know the patient's "normal" pillow count from prior context. Guessing or inferring numbers contaminates trend data and breaks the alert engine that runs on these columns. When in doubt, OMIT the field — partial data is better than fabricated data.

# Anti-hallucination examples — read carefully

❌ WRONG (Claude inferring from prior context):
Transcript: "She had a good night's rest."
DO NOT fill: pillow_count, dyspnea_level, fatigue_level. The caregiver said nothing about pillows, breathing, or fatigue. "Good rest" is too vague to populate any of those structured fields.

✅ CORRECT:
Transcript: "She had a good night's rest."
Fill: nothing. caregiver_summary: "Logged: a good night's rest." No structured fields populated.

❌ WRONG:
Transcript: "Her breathing is fine."
DO NOT fill dyspnea_level=0 from "fine." "Fine" is the caregiver's word, not a numeric scale value.

✅ CORRECT:
Transcript: "Her breathing is fine."
Fill: dyspnea_level=0 (this IS a direct mapping — "fine breathing" = no shortness of breath).
But: do NOT also infer pillow_count from this. They didn't mention pillows.

# Tone reference

✅ Good caregiver_summary examples:
- "Got it — Mom is at 162 today, two pillows, and ankles look puffier than yesterday."
- "Logged: BP 110/70, no swelling, she ate breakfast. Steady day."
- "Logged today: weight up 3 from yesterday and a new dry cough at night. I caught both."

❌ Avoid:
- "This is concerning — please call the cardiologist immediately!" (alarming + medical recommendation)
- "Great job logging today!" (chirpy / fails grelief test)
- "Your mom appears to be experiencing decompensation." (diagnostic)
- "Skip her diuretic today." (treatment recommendation)

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
  // Note: normal_pillow_count exists on the patient row (set at onboarding,
  // used by future orthopnea-creep alerting) but is intentionally NOT
  // passed to Claude here. Including it in the user-message context led
  // the model to autofill pillow_count from "she slept fine" — clinical
  // data integrity bug. Re-introduce only with model-side guards proven.
};

export type ExtractionResult = {
  structuredFields: Record<string, unknown>;
  caregiverSummary: string;
  aiReasoning: string;
  followUpQuestion: string;
};

export async function extractWithClaude(
  transcript: string,
  patientContext: PatientContext
): Promise<ExtractionResult> {
  const research = await loadResearch();

  const userMessage = `# Patient context (for reasoning only — do not autofill structured fields from this; only extract what the caregiver actually said in the transcript)
- Refers to patient as: ${patientContext.displayName}
- Relationship to caregiver: ${patientContext.relationship ?? 'unknown'}
- Cardiologist-set dry weight: ${patientContext.dryWeightLb ? `${patientContext.dryWeightLb} lb` : 'not set'}
- NYHA functional class: ${patientContext.nyhaClass ?? 'unknown'}

# Caregiver's voice log transcript
"""
${transcript}
"""

Extract structured observations from the transcript and write the caregiver-friendly summary. Call log_observation now.

REMINDER: only fill fields the caregiver explicitly mentioned. Do NOT autofill pillow_count, weight, vitals, or any other field from the patient context above — that context is for INTERPRETATION (e.g., comparing today's weight to dry weight in ai_reasoning), not for structured-field defaults. If the caregiver didn't say it, omit the field.`;

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

  const input = toolUseBlock.input as Record<string, unknown> & {
    caregiver_summary: string;
    ai_reasoning: string;
    follow_up_question?: string;
  };

  const {
    caregiver_summary,
    ai_reasoning,
    follow_up_question,
    ...structuredFields
  } = input;

  return {
    structuredFields,
    caregiverSummary: caregiver_summary,
    aiReasoning: ai_reasoning,
    followUpQuestion: follow_up_question ?? '',
  };
}
