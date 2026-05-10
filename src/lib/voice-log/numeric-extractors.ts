// Live numeric extraction for the recording-time tiles.
//
// Approach: scan the transcript for vital-related KEYWORDS and NUMBERS, then
// assign each number to the closest keyword (preceding or following) within
// ~80 characters. This handles natural-language phrasings where the number
// and keyword aren't adjacent — e.g. "Mom's oxygen went down a little bit.
// It's now wet. 97%" — without grabbing wrong numbers from competing
// keywords (a tighter window or per-tile regex would either miss the value
// or attribute it to the wrong tile).
//
// Visual-feedback-only. Values here are overwritten by Claude's structured
// extraction at end-of-recording. No domain validation; the algorithm
// either finds a keyword-number pair or it doesn't.

export type NumericTiles = {
  weight_lb?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  resting_hr?: number;
  spo2?: number;
  pillow_count?: number;
};

type FieldKey = 'weight_lb' | 'resting_hr' | 'spo2' | 'pillow_count';

// Keyword groups per field. Each entry contributes potential anchors for
// the nearest-keyword pass below. BP is handled separately (two-number
// pattern) and isn't in this list.
const KEYWORD_GROUPS: { field: FieldKey; rx: RegExp }[] = [
  {
    field: 'weight_lb',
    rx: /\b(?:weigh(?:s|ed|ing)?|weight|pounds?|lbs?)\b/gi,
  },
  {
    field: 'resting_hr',
    rx: /\b(?:heart\s*rate|heartbeat|heart\s*beat|pulse|bpm|beats\s+per\s+minute)\b/gi,
  },
  {
    field: 'spo2',
    rx: /\b(?:oxygen|spo2|sp02|pulse\s*ox|pulse\s*oximeter|o2|sats?|saturation)\b/gi,
  },
  {
    field: 'pillow_count',
    rx: /\bpillows?\b/gi,
  },
];

// "X over Y" / "X / Y" — two numbers belong together. Ran before the
// nearest-keyword pass so 102 and 80 don't get attributed to a different
// keyword by mistake.
const BP_RE = /\b(\d{2,3})\s*(?:over|\/)\s*(\d{2,3})\b/i;

// Single number. {1,3} digits with optional decimal — same range as before.
const NUMBER_RE = /\b(\d{1,3}(?:\.\d)?)\b/g;

const WORD_TO_NUMBER: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

// "two pillows" / "five pillows" — words instead of digits. Run after the
// nearest-keyword pass; only fills if pillow_count wasn't already captured.
const PILLOW_WORD_RE =
  /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+pillows?\b/i;

// Per-field plausibility ranges. Numbers outside these are ignored — keeps
// the algorithm from attributing a stray digit ("for 5 minutes") to a
// vital field.
const FIELD_RANGE: Record<FieldKey, [number, number]> = {
  weight_lb: [50, 1000],
  resting_hr: [30, 220],
  spo2: [50, 100],
  pillow_count: [0, 20],
};

const NEAREST_KEYWORD_WINDOW = 80;

type Anchor = { field: FieldKey; start: number; end: number };

function findAnchors(transcript: string): Anchor[] {
  const anchors: Anchor[] = [];
  for (const group of KEYWORD_GROUPS) {
    // matchAll requires global flag; rx is /…/gi above.
    for (const m of transcript.matchAll(group.rx)) {
      anchors.push({
        field: group.field,
        start: m.index ?? 0,
        end: (m.index ?? 0) + m[0].length,
      });
    }
  }
  // Sort by position so we can scan left-to-right.
  anchors.sort((a, b) => a.start - b.start);
  // Drop any anchor fully contained inside another (e.g. "pulse" inside
  // "pulse ox") so the more specific keyword wins on overlapping matches.
  return anchors.filter(
    (a) =>
      !anchors.some(
        (b) =>
          b !== a &&
          b.start <= a.start &&
          b.end >= a.end &&
          b.end - b.start > a.end - a.start
      )
  );
}

function nearestAnchor(
  numStart: number,
  numEnd: number,
  anchors: Anchor[]
): { anchor: Anchor; distance: number } | null {
  let best: { anchor: Anchor; distance: number } | null = null;
  for (const a of anchors) {
    let distance: number;
    if (a.end <= numStart) {
      // Anchor is before the number.
      distance = numStart - a.end;
    } else if (a.start >= numEnd) {
      // Anchor is after the number.
      distance = a.start - numEnd;
    } else {
      // Anchor straddles the number — should be impossible with our regexes,
      // but treat as zero distance.
      distance = 0;
    }
    if (distance > NEAREST_KEYWORD_WINDOW) continue;
    if (!best || distance < best.distance) {
      best = { anchor: a, distance };
    }
  }
  return best;
}

export function extractNumericTiles(transcript: string): NumericTiles {
  const out: NumericTiles = {};

  // 1. Blood pressure first — paired-number pattern owns its two digits
  //    before the nearest-keyword pass runs over them.
  const bp = BP_RE.exec(transcript);
  let bpRange: [number, number] | null = null;
  if (bp) {
    const sys = Number(bp[1]);
    const dia = Number(bp[2]);
    if (Number.isFinite(sys) && Number.isFinite(dia)) {
      out.systolic_bp = sys;
      out.diastolic_bp = dia;
      bpRange = [bp.index ?? 0, (bp.index ?? 0) + bp[0].length];
    }
  }

  // 2. Nearest-keyword pass for the single-value fields. For each field we
  //    keep the number whose anchor is *closest* — not the first one seen —
  //    so phrases like "walked 60 feet, pulse 72" don't lock the field to
  //    the wrong digit.
  const anchors = findAnchors(transcript);
  const bestPerField: Partial<
    Record<FieldKey, { value: number; distance: number }>
  > = {};
  for (const m of transcript.matchAll(NUMBER_RE)) {
    const numStart = m.index ?? 0;
    const numEnd = numStart + m[0].length;
    // Skip digits already consumed by the BP match.
    if (bpRange && numStart >= bpRange[0] && numEnd <= bpRange[1]) continue;

    const hit = nearestAnchor(numStart, numEnd, anchors);
    if (!hit) continue;

    const value = Number(m[1]);
    if (!Number.isFinite(value)) continue;

    const [min, max] = FIELD_RANGE[hit.anchor.field];
    if (value < min || value > max) continue;

    const existing = bestPerField[hit.anchor.field];
    if (!existing || hit.distance < existing.distance) {
      bestPerField[hit.anchor.field] = { value, distance: hit.distance };
    }
  }
  for (const [field, picked] of Object.entries(bestPerField) as [
    FieldKey,
    { value: number; distance: number }
  ][]) {
    out[field] = picked.value;
  }

  // 3. Pillow word-to-number — "two pillows" etc.
  if (out.pillow_count == null) {
    const pw = PILLOW_WORD_RE.exec(transcript);
    if (pw) {
      const n = WORD_TO_NUMBER[pw[1].toLowerCase()];
      if (n != null && n >= 0 && n <= 20) out.pillow_count = n;
    }
  }

  return out;
}
