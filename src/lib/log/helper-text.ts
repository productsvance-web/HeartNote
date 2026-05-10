// Pure helper-text resolver. Given a field + value + minimal context,
// returns the tone and copy line for the VitalCard helper. Every
// threshold imports from src/lib/clinical/thresholds.ts. Every copy
// line is either a mockup-verbatim string or has a research citation.
//
// Caller (LogPageClient) passes the context. This file has no I/O.

import {
  WEIGHT_GAIN_TIER_2_7D_LB,
  WEIGHT_CALM_BAND_LB,
  SPO2_TIER_1_911,
  SPO2_TIER_1_WITH_DYSPNEA,
  SPO2_WATCH_BAND_LOW,
  SPO2_WATCH_BAND_HIGH,
  HR_TIER_2_HIGH,
  HR_TIER_2_VERY_HIGH,
  HR_TIER_2_LOW,
  SBP_TIER_2_LOW,
} from '../clinical/thresholds.ts';

// 'urgent' (NOT 'alert') to disambiguate from VitalCardState.alert (the
// corner-pip variant). Tone is the helper-text color tier; State is the
// card chassis variant. (R10)
export type Tone = 'calm' | 'watch' | 'urgent';

export type WeightContext = {
  valueLb: number | null;
  baselineLb: number | null;
  gainLb14d: number | null; // value - baseline_14d_ago
  baselineFreshDays: number; // 0 if no baseline yet (cold-start)
};

export type Spo2Context = {
  valuePct: number | null;
  hasNewDyspnea?: boolean;
};

export type PillowsContext = {
  countToday: number | null;
  baselineCount: number; // patients.normal_pillow_count
};

export type HrContext = {
  valueBpm: number | null;
  baselineBand: [number, number] | null;
};

export type BpContext = {
  systolic: number | null;
  diastolic: number | null;
  baselineSysBand: [number, number] | null;
};

type FieldContextMap = {
  weight: WeightContext;
  spo2: Spo2Context;
  pillows: PillowsContext;
  hr: HrContext;
  bp: BpContext;
};

export function resolveHelperText<K extends keyof FieldContextMap>(
  field: K,
  ctx: FieldContextMap[K],
): { tone: Tone; copy: string } {
  switch (field) {
    case 'weight':
      return resolveWeight(ctx as WeightContext);
    case 'spo2':
      return resolveSpo2(ctx as Spo2Context);
    case 'pillows':
      return resolvePillows(ctx as PillowsContext);
    case 'hr':
      return resolveHr(ctx as HrContext);
    case 'bp':
      return resolveBp(ctx as BpContext);
    default:
      // Exhaustive switch; TS guarantees this is unreachable.
      return { tone: 'calm', copy: '' };
  }
}

// ─── Weight ────────────────────────────────────────────────────────────────

function resolveWeight(ctx: WeightContext): { tone: Tone; copy: string } {
  // Cold-start: no baseline → never trend phrases. Just confirm the reading.
  if (ctx.baselineLb === null || ctx.baselineFreshDays === 0) {
    if (ctx.valueLb === null) {
      return { tone: 'calm', copy: 'First reading — tap to log.' }; // mockup-verbatim
    }
    // mockup-verbatim seed copy
    return { tone: 'calm', copy: `First reading on file — ${ctx.valueLb.toFixed(1)} lb.` };
  }

  if (ctx.valueLb === null) {
    return {
      tone: 'calm',
      // mockup-verbatim
      copy: `Last on file: ${ctx.baselineLb.toFixed(1)} lb.`,
    };
  }

  const gain = ctx.gainLb14d ?? ctx.valueLb - ctx.baselineLb;

  // cited: research/chf-source-of-truth.md §2 Tier 2 / §3 — "Weight up
  // >5 lb/week" is the 7-day threshold. Phase 1 mockup uses the 14-day
  // window for trend visibility; helper text fires "watch" tone above
  // the same numeric floor (rounded to 4 lb in the mockup) so the
  // caregiver sees a hint before the engine fires the same-day call.
  // The watch threshold here is 4 lb so the helper text starts nudging
  // ahead of T2.3's 5-lb floor — gives the caregiver a heads-up before
  // the alert banner does.
  const WATCH_GAIN_LB = WEIGHT_GAIN_TIER_2_7D_LB - 1; // 4 lb

  if (gain >= WATCH_GAIN_LB) {
    return {
      tone: 'watch',
      // cited: research §2 Tier 2 — "rapid weight gain" framed as fluid retention
      copy: `Up ${gain.toFixed(1)} lb in 14 days — could be water gain.`,
    };
  }

  if (Math.abs(gain) <= WEIGHT_CALM_BAND_LB) {
    // mockup-verbatim
    return {
      tone: 'calm',
      copy: `Within ${WEIGHT_CALM_BAND_LB} lb of baseline (${ctx.baselineLb.toFixed(1)} lb).`,
    };
  }

  // cited: research §3 — sub-threshold gain still worth surfacing as drift
  return {
    tone: 'calm',
    copy: `Drift from baseline — ${gain >= 0 ? 'up' : 'down'} ${Math.abs(gain).toFixed(1)} lb.`,
  };
}

// ─── SpO2 ──────────────────────────────────────────────────────────────────

function resolveSpo2(ctx: Spo2Context): { tone: Tone; copy: string } {
  if (ctx.valuePct === null) {
    // mockup-verbatim. The 88 number is cited from thresholds.
    // cited: research/chf-source-of-truth.md §2 Tier 1 — SpO2 < 88
    return { tone: 'calm', copy: `Tap if measured. Below ${SPO2_TIER_1_911} is the floor.` };
  }

  // cited: research §2 Tier 1 — SpO2 < 88 is tier-1
  if (ctx.valuePct < SPO2_TIER_1_911) {
    return {
      tone: 'urgent',
      copy: `Below ${SPO2_TIER_1_911}% — call the cardiologist now.`,
    };
  }

  // cited: research §2 Tier 1 — SpO2 < 90 with new dyspnea
  if (ctx.valuePct < SPO2_TIER_1_WITH_DYSPNEA && ctx.hasNewDyspnea) {
    return {
      tone: 'urgent',
      copy: `Below ${SPO2_TIER_1_WITH_DYSPNEA}% with new shortness of breath — call now.`,
    };
  }

  // cited: research §3 — 91–94% is the watch band
  if (
    ctx.valuePct >= SPO2_WATCH_BAND_LOW &&
    ctx.valuePct <= SPO2_WATCH_BAND_HIGH &&
    ctx.hasNewDyspnea
  ) {
    return {
      tone: 'watch',
      copy: `${ctx.valuePct}% with new shortness of breath — watch today.`,
    };
  }

  // cited: research §2 — SpO2 ≥ 95 is the calm range; floor is 88.
  return {
    tone: 'calm',
    copy: `${ctx.valuePct}% — calm range. Floor is ${SPO2_TIER_1_911}%.`,
  };
}

// ─── Pillows ───────────────────────────────────────────────────────────────

function resolvePillows(ctx: PillowsContext): { tone: Tone; copy: string } {
  if (ctx.countToday === null) {
    // mockup-verbatim
    return {
      tone: 'calm',
      copy: `Held at ${ctx.baselineCount} for the past week.`,
    };
  }

  // cited: research §2 Tier 2 — orthopnea = "more pillows than last week"
  if (ctx.countToday > ctx.baselineCount) {
    const delta = ctx.countToday - ctx.baselineCount;
    return {
      tone: 'watch',
      copy: `Up ${delta} from baseline — orthopnea sign worth watching.`,
    };
  }

  if (ctx.countToday === ctx.baselineCount) {
    return {
      tone: 'calm',
      copy: `Held at ${ctx.baselineCount} for the past week.`,
    };
  }

  return {
    tone: 'calm',
    copy: `Down from ${ctx.baselineCount} — sleeping flatter.`,
  };
}

// ─── Heart rate ────────────────────────────────────────────────────────────

function resolveHr(ctx: HrContext): { tone: Tone; copy: string } {
  if (ctx.valueBpm === null) {
    if (ctx.baselineBand) {
      const [lo, hi] = ctx.baselineBand;
      // mockup-verbatim shape
      return { tone: 'calm', copy: `Usual range ${lo}–${hi} bpm.` };
    }
    return { tone: 'calm', copy: 'Tap if measured.' };
  }

  // cited: research §2 Tier 2 / §3 — HR > 120 = tier 2
  if (ctx.valueBpm > HR_TIER_2_VERY_HIGH) {
    return {
      tone: 'watch',
      copy: `${ctx.valueBpm} bpm — above ${HR_TIER_2_VERY_HIGH}, call cardiologist today.`,
    };
  }

  // cited: research §2 Tier 2 — HR > 100 with symptoms = tier 2; helper
  // surfaces watch tone whenever HR exceeds the high band so the caregiver
  // sees context before the banner.
  if (ctx.valueBpm > HR_TIER_2_HIGH) {
    return {
      tone: 'watch',
      copy: `${ctx.valueBpm} bpm — above ${HR_TIER_2_HIGH}, watch today.`,
    };
  }

  // cited: research §2 Tier 2 — HR < 50 with symptoms = tier 2
  if (ctx.valueBpm < HR_TIER_2_LOW) {
    return {
      tone: 'watch',
      copy: `${ctx.valueBpm} bpm — below ${HR_TIER_2_LOW}, watch today.`,
    };
  }

  if (ctx.baselineBand) {
    const [lo, hi] = ctx.baselineBand;
    return { tone: 'calm', copy: `${ctx.valueBpm} bpm — usual range ${lo}–${hi}.` };
  }

  return { tone: 'calm', copy: `${ctx.valueBpm} bpm — calm range.` };
}

// ─── Blood pressure ────────────────────────────────────────────────────────

function resolveBp(ctx: BpContext): { tone: Tone; copy: string } {
  if (ctx.systolic === null || ctx.diastolic === null) {
    if (ctx.baselineSysBand) {
      const [lo, hi] = ctx.baselineSysBand;
      return { tone: 'calm', copy: `Usual systolic ${lo}–${hi}.` };
    }
    return { tone: 'calm', copy: 'Tap if measured.' };
  }

  // cited: research §2 Tier 2 / §3 — SBP < 90 with symptoms = tier 2
  if (ctx.systolic < SBP_TIER_2_LOW) {
    return {
      tone: 'watch',
      copy: `${ctx.systolic}/${ctx.diastolic} — low systolic, watch today.`,
    };
  }

  if (ctx.baselineSysBand) {
    const [lo, hi] = ctx.baselineSysBand;
    return {
      tone: 'calm',
      copy: `${ctx.systolic}/${ctx.diastolic} — usual systolic ${lo}–${hi}.`,
    };
  }

  return { tone: 'calm', copy: `${ctx.systolic}/${ctx.diastolic} — calm range.` };
}
