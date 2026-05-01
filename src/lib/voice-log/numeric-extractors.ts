// Lightweight regex extraction for numeric tile values during dictation.
//
// Deepgram's `keyterm` biasing handles WORDS (caregiver-language symptom
// phrasings, drug names). Numeric values still need pattern matching —
// "she weighed 174 today" → 174 lb. Five patterns total, each tied to
// exactly one tile. Anything else stays in the transcript and gets picked
// up by Claude's authoritative extraction at end-of-recording.
//
// These functions are visual-feedback-only. The values they emit are
// overwritten by Claude's structured output when the recording stops.
// Don't add domain logic here (no "is this a plausible weight" checks);
// the regex either matches or it doesn't.

export type NumericTiles = {
  weight_lb?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  resting_hr?: number;
  spo2?: number;
  pillow_count?: number;
};

// Two acceptable shapes: "<number> lb/pounds" OR "weigh(s|ed|ing)/weight (is|was|at|of)? <number>".
// The context-prefix form catches "she weighs 174" / "weight is 174" where the unit is implied.
const WEIGHT_RE_UNIT = /\b(\d{2,3}(?:\.\d)?)\s*(?:lb|lbs|pound|pounds)\b/i;
const WEIGHT_RE_CONTEXT =
  /\b(?:weigh(?:s|ed|ing)?|weight)\s+(?:is\s+|was\s+|at\s+|of\s+)?(\d{2,3}(?:\.\d)?)\b/i;
const BP_RE = /\b(\d{2,3})\s*(?:over|\/)\s*(\d{2,3})\b/i;
const HR_RE = /\b(?:heart\s*rate|pulse|heartbeat)\D{0,15}(\d{2,3})\b/i;
const O2_RE =
  /\b(?:oxygen|spo2|pulse\s*ox|pulse\s*oximeter|o2|sats?)\D{0,15}(\d{2,3})\b/i;
const PILLOW_RE = /\b(\d|one|two|three|four)\s*pillow/i;

const WORD_TO_NUMBER: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
};

export function extractNumericTiles(transcript: string): NumericTiles {
  const out: NumericTiles = {};

  const weight = WEIGHT_RE_UNIT.exec(transcript) ?? WEIGHT_RE_CONTEXT.exec(transcript);
  if (weight) {
    const n = Number(weight[1]);
    if (Number.isFinite(n)) out.weight_lb = n;
  }

  const bp = BP_RE.exec(transcript);
  if (bp) {
    const sys = Number(bp[1]);
    const dia = Number(bp[2]);
    if (Number.isFinite(sys) && Number.isFinite(dia)) {
      out.systolic_bp = sys;
      out.diastolic_bp = dia;
    }
  }

  const hr = HR_RE.exec(transcript);
  if (hr) {
    const n = Number(hr[1]);
    if (Number.isFinite(n)) out.resting_hr = n;
  }

  const o2 = O2_RE.exec(transcript);
  if (o2) {
    const n = Number(o2[1]);
    if (Number.isFinite(n)) out.spo2 = n;
  }

  const pillow = PILLOW_RE.exec(transcript);
  if (pillow) {
    const raw = pillow[1].toLowerCase();
    const n = /^\d$/.test(raw) ? Number(raw) : WORD_TO_NUMBER[raw];
    if (Number.isFinite(n)) out.pillow_count = n;
  }

  return out;
}
