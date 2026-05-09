// Alert reasoning v0.5 — Anthropic Opus 4.7 generates a 1–2 sentence
// caregiver-facing explanation of WHY today's triggers are concerning.
//
// Closes CLAUDE.md rule #4 ("AI alerts must show their reasoning"). The
// rules engine's `Trigger.label` is the headline; this layer adds the
// pattern-level synthesis ("weight up 4 lb over 5 days AND extra pillows
// logged AND nocturnal cough — pattern often precedes decompensation").
//
// Hard guardrails per CLAUDE.md rule #6 (never recommend dose changes):
//   - System prompt forbids dose-change language and diagnosis claims
//   - Response is post-validated against a forbidden-phrase regex
//   - On any guard violation we return null, not a degraded reasoning
//
// Prompt caching per CLAUDE.md rule #3: the system prompt (rules + register)
// is marked `cache_control: ephemeral` so subsequent calls within the
// 5-minute TTL pay only for the dynamic user-message tokens.

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { Assessment, AlertTier, Trigger } from './evaluate';

const anthropic = new Anthropic();

// Opus 4.7 per CLAUDE.md rule #3 ("Opus 4.7 for visit-report drafting") —
// alert reasoning is a clinical-pattern synthesis task; same tier of care.
const MODEL = 'claude-opus-4-7';

// Caregiver-readable, never recommends action beyond the engine's CTA.
// Note: we describe forbidden categories rather than quote forbidden phrases
// — keeping forbidden text out of source so static scans stay clean.
const SYSTEM_PROMPT = `You write the AI reasoning that appears under a HeartNote alert headline.

HeartNote is a daily-check-in app for adult children caring for a parent with congestive heart failure. The rules engine has already evaluated today's data and decided this is an actionable alert. Your job is to explain — in 1 to 2 sentences — why this specific combination of signals is concerning, in language a sleep-deprived caregiver can take in at a glance.

# Hard constraints

You ABSOLUTELY MUST NOT:
- Suggest any medication change of any kind: starting a med, stopping a med, raising or lowering a dose, doubling, halving, or skipping a dose. The prescribing cardiologist owns every medication decision.
- Make a diagnosis or use clinical-decision language. Do not name a condition the patient "has." Do not write "this means…" framings.
- Tell the caregiver what to do. The engine's CTA already provides the action ("call cardiologist" or "call 911"). Your scope is the WHY, not the WHAT.
- Speculate beyond the trigger evidence the engine reports. If the evidence shows weight, talk about weight. Don't invent symptoms.
- Cite percentages, mortality stats, or hospitalization-risk numbers.

You MUST:
- Ground every claim in the trigger evidence supplied below.
- Connect multiple triggers into a coherent pattern when more than one is present (the value of this layer is showing the combination, not restating each line).
- Stay matter-of-fact. No chirpy "great job logging." No funeral-serious doom. The caregiver is on edge; sit with the oscillation.
- Use the patient's first name if provided.
- Keep total length to ≤ 240 characters across at most 2 sentences.

# Tone

Describe the observable pattern. Connect it to what cardiologists watch for ("the kind of pattern that often precedes a decompensation episode" / "an early warning the cardiologist tracks"). Direct concern toward the prescriber via the engine's CTA, not via your own action prescription.

Return only the reasoning sentence(s). No preamble. No markdown.`;

export async function generateAlertReasoning(args: {
  assessment: Assessment;
  patientFirstName: string | null;
  dryWeightLb: number | null;
  normalPillowCount: number | null;
  nyhaClass: string | null;
}): Promise<string | null> {
  const { assessment, patientFirstName, dryWeightLb, normalPillowCount, nyhaClass } = args;
  if (!isActionableTier(assessment.tier)) return null;
  if (assessment.triggers.length === 0) return null;

  const userMessage = renderUserMessage({
    triggers: assessment.triggers,
    tier: assessment.tier,
    patientFirstName,
    dryWeightLb,
    normalPillowCount,
    nyhaClass,
  });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 220,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === 'text',
  );
  if (!textBlock) return null;

  const cleaned = sanitize(textBlock.text);
  if (!cleaned) return null;
  if (containsForbiddenPhrase(cleaned)) return null;
  // 240 to match the system-prompt ceiling. Some slop allowed (quotes
  // stripped via sanitize) but this is the hard cap for the UI block.
  if (cleaned.length > 240) return null;
  return cleaned;
}

function isActionableTier(tier: AlertTier): boolean {
  return tier === 'tier_1_911' || tier === 'tier_2_today' || tier === 'tier_3_48hr';
}

function renderUserMessage(args: {
  triggers: Trigger[];
  tier: AlertTier;
  patientFirstName: string | null;
  dryWeightLb: number | null;
  normalPillowCount: number | null;
  nyhaClass: string | null;
}): string {
  // Rule IDs (T2.1, T3.4, etc.) are intentionally NOT in the user message —
  // a model under load will parrot them into the output, which violates
  // .claude/rules/plain-english-explanations.md. The label is already plain
  // English; the evidence carries the numeric specifics.
  const triggerLines = args.triggers
    .map(
      (t, i) =>
        `${i + 1}. ${t.label}\n   evidence: ${stableStringify(t.evidence)}`,
    )
    .join('\n');

  const ctxLines = [
    args.patientFirstName ? `- Patient first name: ${args.patientFirstName}` : null,
    `- Cardiologist-set dry weight: ${args.dryWeightLb !== null ? `${args.dryWeightLb} lb` : 'not on file'}`,
    `- Normal pillow count for sleep: ${args.normalPillowCount ?? 'unknown'}`,
    `- NYHA class: ${args.nyhaClass ?? 'unknown'}`,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  return `Tier the rules engine selected: ${args.tier}

Patient context:
${ctxLines}

Today's triggers (rule_id, label, evidence):
${triggerLines}

Write the 1–2 sentence reasoning. Plain text only.`;
}

function sanitize(raw: string): string {
  return raw.trim().replace(/^["'`]|["'`]$/g, '').trim();
}

// Last-line defense against a model that ignores the system prompt.
// Conservative on purpose — false positives drop the reasoning paragraph
// entirely (caregiver still sees the rule-derived headline), while a false
// negative leaks medication-change language into a clinical artifact.
//
// Categories covered:
//   - explicit dose verbs (raise/lower/increase/decrease/adjust/change)
//   - quantity verbs against a med noun (double/halve/hold/skip/another)
//   - unit-flagged dosing ("X mg," "milligrams")
//   - start/stop/switch language
//   - "more/extra/less" before either a med noun OR a known CHF drug class
//   - rule-IDs (T2.1, T3.4, etc.) — caregivers don't read schema labels
const MED_NOUN = '(?:dose|dosage|pill|tablet|medication|med|diuretic|lasix|furosemide|metoprolol|carvedilol|spironolactone|entresto|sacubitril|valsartan|lisinopril|losartan|warfarin|coumadin|eliquis|apixaban)';
const FORBIDDEN_PATTERNS: RegExp[] = [
  // raise / lower / increase / decrease / adjust / change <med>
  new RegExp(`\\b(?:in|de)crease\\s+(?:the\\s+|her\\s+|his\\s+)?${MED_NOUN}\\b`, 'i'),
  new RegExp(`\\b(?:up|down|raise|lower|adjust|change|tweak|modify)\\s+(?:the\\s+|her\\s+|his\\s+)?${MED_NOUN}\\b`, 'i'),
  // double / halve / hold / skip / give another <med>
  new RegExp(`\\b(?:double|halve|halv|hold|skip|withhold|pause)\\s+(?:the\\s+|her\\s+|his\\s+|tonight'?s\\s+|today'?s\\s+|that\\s+)?${MED_NOUN}\\b`, 'i'),
  /\b(?:give\s+(?:her|him)\s+|take\s+)?another\s+(?:dose|pill|tablet)\b/i,
  // more / extra / less / additional + (dose|pill|medication|drug-name)
  new RegExp(`\\b(?:more|extra|less|additional|extra\\s+\\d+\\s*mg|an?\\s+additional)\\s+(?:of\\s+(?:her|his|the)\\s+)?${MED_NOUN}\\b`, 'i'),
  /\b(?:more|extra|less|additional)\s+\d+\s*(?:mg|milligrams|milligram)\b/i,
  // milligram dosing language at all
  /\b\d+\s*(?:mg|milligrams|milligram)\b/i,
  // start / stop / switch
  /\bstop\s+taking\b/i,
  /\bstart\s+taking\b/i,
  /\bswitch\s+(?:to|from|off|onto)\s+\w+/i,
  /\b(?:dose|dosage)\s+adjustment\b/i,
  // rule-IDs leak (T2.1, T3.4, etc.)
  /\bT\d+\.\d+[a-z]?\b/,
];

function containsForbiddenPhrase(text: string): boolean {
  return FORBIDDEN_PATTERNS.some((re) => re.test(text));
}

// Deterministic JSON for the prompt — same evidence object should produce
// the same string each call so the cache hits when only context shifts.
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = (v as Record<string, unknown>)[k];
          return acc;
        }, {});
    }
    return v;
  });
}
