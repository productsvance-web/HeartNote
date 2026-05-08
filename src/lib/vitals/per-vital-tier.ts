// Per-vital tier classifier for the home VitalsList card and the Trends
// page. Drives the colored pip + sub-line on each row.
//
// SOURCE OF TRUTH: the alert engine (src/lib/alerts/evaluate.ts). This
// classifier reads `daily_assessments.triggers` — the engine's already-
// computed verdict — and maps known rule_ids to per-vital rows. When no
// relevant rule fired but data was reported, the row is `good`. When no
// data was reported, the row is `unknown`.
//
// This is intentional: by reading the engine's verdict instead of
// rerunning thresholds, the row pip can NEVER disagree with the
// home-screen headline tier. Per .claude/rules/code-quality.md rule #3
// (database is the source of truth) — daily_assessments is canonical.
//
// Rule → vital mapping:
//   T2.1 / T2.2 / T2.3 → weight (alert)   24h / 48h / 7d weight gain
//   T3.1                → weight (watch)   1–2 lb/day for 3+ consecutive days
//   T2.6                → swelling (alert) new/worsened, doesn't resolve overnight
//   T3.3                → swelling (watch) evening-only, resolves overnight
//   T2.7                → breathing (alert) severe activity step-change
//   T2.5                → breathing (alert) PND in last 48h
//   T3.2                → breathing (watch) mild slowdown
//   T2.4                → pillows (alert)  more pillows than baseline
//   T2.8                → cough (alert)    new nocturnal cough
//
// Citations for the underlying rules live in research/chf-source-of-truth.md
// and are quoted in `src/lib/alerts/evaluate.ts`. This file does not invent
// thresholds; it does not import constants from `lib/clinical/thresholds.ts`
// directly because it doesn't compute — it reads the engine's output.

import type { TodaySnapshot } from './today-snapshot';

export type Tier = 'good' | 'watch' | 'alert' | 'unknown';
export type VitalKey = 'weight' | 'swelling' | 'breathing' | 'pillows' | 'cough';

export type TriggerRow = {
  rule_id: string;
  label: string;
  evidence: Record<string, unknown>;
};

export type BaselineCtx = {
  weight7dAgoLb: number | null;
  pillow7dMax: number | null;
  pillowBaseline: number | null;
  swellingPriorWeekDays: number;
  coughNocturnalPriorWeekNights: number;
  coldStart: boolean;
};

export type PerVitalRow = {
  key: VitalKey;
  tier: Tier;
  label: string;
  value: string;
  sub: string;
};

const WEIGHT_ALERT_RULES = new Set(['T2.1', 'T2.2', 'T2.3']);
const WEIGHT_WATCH_RULES = new Set(['T3.1']);
const SWELLING_ALERT_RULES = new Set(['T2.6']);
const SWELLING_WATCH_RULES = new Set(['T3.3']);
const BREATHING_ALERT_RULES = new Set(['T2.5', 'T2.7']);
const BREATHING_WATCH_RULES = new Set(['T3.2']);
const PILLOWS_ALERT_RULES = new Set(['T2.4']);
const COUGH_ALERT_RULES = new Set(['T2.8']);

export function classifyVitals(
  snap: TodaySnapshot,
  triggers: TriggerRow[],
  baseline: BaselineCtx,
): PerVitalRow[] {
  const ids = new Set(triggers.map((t) => t.rule_id));
  const hits = (set: Set<string>) => triggers.filter((t) => set.has(t.rule_id));

  const weightTier: Tier = anyIn(ids, WEIGHT_ALERT_RULES)
    ? 'alert'
    : anyIn(ids, WEIGHT_WATCH_RULES)
      ? 'watch'
      : snap.weightLb === null
        ? 'unknown'
        : 'good';
  const weight: PerVitalRow = {
    key: 'weight',
    tier: weightTier,
    label: 'Weight',
    value: snap.weightLb === null ? '—' : `${snap.weightLb.toFixed(1)} lb`,
    sub:
      snap.weightLb === null
        ? 'no reading yet'
        : weightSub(snap.weightLb, baseline.weight7dAgoLb, hits(WEIGHT_ALERT_RULES).concat(hits(WEIGHT_WATCH_RULES))),
  };

  const swellingTier: Tier = anyIn(ids, SWELLING_ALERT_RULES)
    ? 'alert'
    : anyIn(ids, SWELLING_WATCH_RULES)
      ? 'watch'
      : snap.swelling === null
        ? 'unknown'
        : snap.swelling.present
          ? 'watch'
          : 'good';
  const swelling: PerVitalRow = {
    key: 'swelling',
    tier: swellingTier,
    label: 'Swelling',
    value: swellingValue(snap.swelling),
    sub: swellingSub(snap.swelling, baseline.swellingPriorWeekDays),
  };

  const breathingTier: Tier = anyIn(ids, BREATHING_ALERT_RULES)
    ? 'alert'
    : anyIn(ids, BREATHING_WATCH_RULES)
      ? 'watch'
      : breathingDataTier(snap);
  const breathing: PerVitalRow = {
    key: 'breathing',
    tier: breathingTier,
    label: 'Breathing',
    value: breathingValue(snap),
    sub: breathingSub(snap),
  };

  const pillowsTier: Tier = anyIn(ids, PILLOWS_ALERT_RULES)
    ? 'alert'
    : snap.pillowCount === null
      ? 'unknown'
      : 'good';
  const pillows: PerVitalRow = {
    key: 'pillows',
    tier: pillowsTier,
    label: 'Pillows',
    value: snap.pillowCount === null ? '—' : `${snap.pillowCount} tonight`,
    sub: pillowsSub(snap.pillowCount, baseline, pillowsTier === 'alert'),
  };

  const coughTier: Tier = anyIn(ids, COUGH_ALERT_RULES)
    ? 'alert'
    : snap.cough === null
      ? 'unknown'
      : snap.cough.present
        ? 'watch'
        : 'good';
  const cough: PerVitalRow = {
    key: 'cough',
    tier: coughTier,
    label: 'Cough',
    value: coughValue(snap.cough),
    sub: coughSub(snap.cough, baseline.coughNocturnalPriorWeekNights),
  };

  return [weight, swelling, breathing, pillows, cough];
}

function anyIn(set: Set<string>, target: Set<string>) {
  for (const id of target) if (set.has(id)) return true;
  return false;
}

function weightSub(today: number, weekAgo: number | null, weightTriggers: TriggerRow[]): string {
  if (weightTriggers.length > 0) {
    // Engine already wrote a plain-English label; show its short form.
    const t = weightTriggers[0];
    const delta = (t.evidence as { delta_lb?: number }).delta_lb;
    if (typeof delta === 'number') {
      return delta >= 0 ? `▲ ${delta.toFixed(1)} lb` : `▼ ${Math.abs(delta).toFixed(1)} lb`;
    }
    return t.label;
  }
  if (weekAgo === null) return 'no baseline yet';
  const delta = today - weekAgo;
  if (Math.abs(delta) < 0.1) return 'steady · 7d';
  return delta > 0
    ? `▲ ${delta.toFixed(1)} lb / 7d`
    : `▼ ${Math.abs(delta).toFixed(1)} lb / 7d`;
}

function swellingValue(o: TodaySnapshot['swelling']): string {
  if (!o) return '—';
  if (!o.present) return 'None today';
  if (o.severity === null) return 'Reported';
  if (o.severity >= 3) return 'Significant';
  if (o.severity === 2) return 'Moderate';
  return 'Mild';
}

function swellingSub(o: TodaySnapshot['swelling'], priorWeekDays: number): string {
  if (!o) return 'not reported today';
  if (!o.present) return priorWeekDays > 0 ? `noted ${priorWeekDays} of last 7d` : '';
  const region = o.bodyRegion ? `${o.bodyRegion}` : '';
  const overnight =
    o.resolvesOvernight === true
      ? 'resolves overnight'
      : o.resolvesOvernight === false
        ? "doesn't resolve overnight"
        : '';
  return [region, overnight].filter(Boolean).join(' · ');
}

function breathingDataTier(snap: TodaySnapshot): Tier {
  if (snap.dyspnea === null && snap.activityStepChange === null) return 'unknown';
  if (snap.dyspnea?.present || snap.activityStepChange === 'mild_slowdown') return 'watch';
  return 'good';
}

function breathingValue(snap: TodaySnapshot): string {
  if (snap.activityStepChange === 'severe_change') return 'Big drop';
  if (snap.activityStepChange === 'mild_slowdown') return 'Slower';
  if (snap.dyspnea?.present) {
    const sev = snap.dyspnea.severity ?? 0;
    if (sev >= 3) return 'Labored';
    if (sev >= 1) return 'Mild';
    return 'Reported';
  }
  if (snap.dyspnea !== null || snap.activityStepChange !== null) return 'Normal';
  return '—';
}

function breathingSub(snap: TodaySnapshot): string {
  if (snap.activityStepChange === 'severe_change') return 'big change today';
  if (snap.activityStepChange === 'mild_slowdown') return 'a step slower';
  if (snap.dyspnea?.present) return 'on exertion';
  if (snap.dyspnea === null && snap.activityStepChange === null) return 'not reported today';
  return 'steady';
}

function pillowsSub(
  count: number | null,
  baseline: BaselineCtx,
  isAlert: boolean,
): string {
  if (count === null) return 'not reported today';
  if (isAlert) {
    const ref = baseline.pillow7dMax ?? baseline.pillowBaseline;
    if (ref !== null) return `▲ ${count - ref} vs ${ref}-pillow normal`;
    return 'more than usual';
  }
  if (baseline.coldStart) return 'learning baseline';
  if (baseline.pillow7dMax !== null && count === baseline.pillow7dMax) return `same as 7d max`;
  return `usual ${baseline.pillowBaseline ?? count}`;
}

function coughValue(o: TodaySnapshot['cough']): string {
  if (!o) return '—';
  if (!o.present) return 'None today';
  if (o.nocturnal === true) return 'Nighttime';
  return 'Daytime';
}

function coughSub(o: TodaySnapshot['cough'], priorWeekNights: number): string {
  if (!o) return 'not reported today';
  if (!o.present) {
    return priorWeekNights > 0
      ? `${priorWeekNights} nighttime / 7d`
      : '0 nighttime / 7d';
  }
  if (o.nocturnal === true) return 'wakes at night';
  return 'during the day';
}
