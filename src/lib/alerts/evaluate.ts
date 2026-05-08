// Phase 1 alert engine — rules-only.
//
// What this does, in plain English:
//   The engine looks at everything the caregiver has logged for a patient
//   over the last week or two and answers one question: "is anything
//   different today?" If yes, it returns the urgency level (call 911, call
//   cardiologist today, call cardiologist within 48 hrs) plus the specific
//   reasons why. If no, it returns "steady today" — or "we don't have
//   enough history yet" if the patient is new.
//
// What this does NOT do:
//   - No LLM reasoning. v0 is rules. The v0.5 LLM layer reads these
//     trigger labels and writes the cardiologist_script and ai_reasoning
//     into the alerts table.
//   - No notifications. Push wiring is the next phase.
//   - No dose recommendations. Ever. Per CLAUDE.md rule 6.
//
// Every numeric threshold imports from src/lib/clinical/thresholds.ts.
// Every rule cites the section in research/chf-source-of-truth.md it
// derives from. If a clinical claim isn't traceable, it doesn't ship.
//
// Shape:
//   - `evaluateAlertTier(supabase, patientId, logDate)` is the DB-fed entry.
//     It calls `loadInputs()` then `evaluateRules()`.
//   - `evaluateRules(inputs)` is a pure function — no I/O. It's exported so
//     unit tests can drive every rule from synthetic fixtures.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import {
  WEIGHT_GAIN_TIER_2_24H_LB,
  WEIGHT_GAIN_TIER_2_48H_LB,
  WEIGHT_GAIN_TIER_2_7D_LB,
  WEIGHT_GAIN_TIER_3_DAILY_LB,
  WEIGHT_GAIN_TIER_3_DAILY_MAX_LB,
  WEIGHT_GAIN_TIER_3_CONSECUTIVE_DAYS,
  WEIGHT_WINDOW_24H_MIN_HOURS,
  WEIGHT_WINDOW_24H_MAX_HOURS,
  WEIGHT_WINDOW_48H_MIN_HOURS,
  WEIGHT_WINDOW_48H_MAX_HOURS,
  WEIGHT_WINDOW_7D_MIN_DAYS,
  WEIGHT_WINDOW_7D_MAX_DAYS,
  SBP_TIER_2_LOW,
  HR_TIER_2_HIGH,
  HR_TIER_2_VERY_HIGH,
  HR_TIER_2_LOW,
  SPO2_TIER_1_911,
  SPO2_TIER_1_WITH_DYSPNEA,
  SPO2_FRESHNESS_HOURS,
  COLD_START_MIN_LOG_DAYS,
  COLD_START_LOOKBACK_DAYS,
  ROLLING_BASELINE_DAYS,
  READING_FRESHNESS_HOURS,
  PND_LOOKBACK_HOURS,
} from '@/lib/clinical/thresholds';

// ─── Deferred rules (research §2 vs Phase 1 v0) ─────────────────────────────
//
// Knowingly NOT implemented in v0. Each is traceable to a research §2 line.
// Listed here so the next pass doesn't re-discover them as gaps.
//
// - §2 Tier 2 "Step-change worsening of dyspnea on exertion (NYHA creep)":
//   needs cross-day comparison of dyspnea severity. Schema supports it
//   (severity 0–4 on dyspnea events); engine doesn't yet compute the trend.
// - §2 Tier 2 "New nausea / early satiety persisting >24 hr": nausea fires
//   T2.12 on a single same-day event (over-fires); early_satiety has no
//   rule. Both need a multi-event rolling-window check.
// - §2 Tier 2 "Mild new confusion or lethargy": confusion is covered by
//   T2.13 (cognition_change severity 1/2). "Lethargy" is not its own
//   symptom; the closest fit is fatigue + activity_step_change=mild_slowdown
//   (currently fires T3.2). Defer until we decide whether lethargy → its
//   own symptom or stays mapped to fatigue+functional change.
// - Fatigue frequency-vs-baseline: needs a multi-day baseline window.

export type AlertTier = Database['public']['Enums']['alert_tier'];

export type Trigger = {
  rule_id: string;
  label: string;
  evidence: Record<string, unknown>;
};

export type Assessment = {
  tier: AlertTier;
  triggers: Trigger[];
  coldStart: boolean;
};

export type Reading = {
  field: 'weight_lb' | 'resting_hr' | 'spo2' | 'systolic_bp' | 'diastolic_bp';
  value: number;
  recorded_at: string;
  log_date: string;
};

export type SymptomEvent = {
  symptom: string;
  present: boolean;
  severity: number | null;
  body_region: string | null;
  nocturnal: boolean | null;
  sputum_color: string | null;
  chest_pain_character: string | null;
  resolves_overnight: boolean | null;
  postural: boolean | null;
  recorded_at: string;
  log_date: string;
};

export type DayLevel = {
  pillow_count: number | null;
  appetite_change: 'decreased' | 'unchanged' | 'increased' | null;
  urine_output_change: 'decreased' | 'unchanged' | 'increased' | null;
  activity_step_change: 'none' | 'mild_slowdown' | 'severe_change' | null;
};

export type Patient = {
  normal_pillow_count: number | null;
};

export interface EngineInputs {
  readings: Reading[];
  symptomEvents: SymptomEvent[];
  dayLevel: DayLevel;
  patient: Patient;
  distinctPriorLogDays: number;
  logDate: string;
  // Pre-computed prior-window aggregates over ROLLING_BASELINE_DAYS, ending
  // the day before logDate. Computed by loadInputs so evaluateRules stays
  // pure and synchronous.
  priorWindowMaxes: {
    pillowCount: number | null;
    swellingSeverity: number | null;
    dyspneaEventCount: number;
    coughEventCount: number;
  };
  // Override "now" for the 48h PND window. Tests pass a fixed value so the
  // window is deterministic; production omits it (uses Date.now()).
  nowMs?: number;
}

const TIER_RANK: Record<AlertTier, number> = {
  tier_1_911: 1,
  tier_2_today: 2,
  tier_3_48hr: 3,
  tier_4_log: 4,
};

type RuleHit = Trigger & { tier: AlertTier };

// ─── Public entry point (DB-fed) ────────────────────────────────────────────

export async function evaluateAlertTier(
  supabase: SupabaseClient<Database>,
  patientId: string,
  logDate: string
): Promise<Assessment> {
  const inputs = await loadInputs(supabase, patientId, logDate);
  return evaluateRules(inputs);
}

// ─── Pure rule engine ───────────────────────────────────────────────────────

export function evaluateRules(inputs: EngineInputs): Assessment {
  const {
    readings,
    symptomEvents,
    dayLevel,
    patient,
    distinctPriorLogDays,
    logDate,
    priorWindowMaxes,
    nowMs,
  } = inputs;

  const coldStart = distinctPriorLogDays < COLD_START_MIN_LOG_DAYS;

  const todayEvents = symptomEvents.filter((e) => e.log_date === logDate);

  // Tighten the 48h window from "now" rather than "end-of-(logDate-2 UTC)".
  // The DB query loads everything in the broader window for cheap; we
  // re-filter here so an early-morning dictation doesn't pull a 70h-old PND.
  const referenceNowMs = nowMs ?? Date.now();
  const fortyEightHoursAgoMs = referenceNowMs - PND_LOOKBACK_HOURS * 3600_000;
  const last48hEvents = symptomEvents.filter(
    (e) => new Date(e.recorded_at).getTime() >= fortyEightHoursAgoMs
  );

  const hits: RuleHit[] = [];

  // ── TIER 1 ────────────────────────────────────────────────────────────────
  // Acute single-event rules. Fire even when cold-start.

  for (const e of todayEvents.filter((e) => e.symptom === 'dyspnea' && e.present && e.severity === 4)) {
    hits.push({
      tier: 'tier_1_911',
      rule_id: 'T1.1',
      label: 'Severe shortness of breath at rest — 911',
      evidence: { recorded_at: e.recorded_at },
    });
  }

  for (const e of todayEvents.filter(
    (e) => e.symptom === 'cough' && e.present && (e.sputum_color === 'pink_frothy' || e.sputum_color === 'white_frothy')
  )) {
    hits.push({
      tier: 'tier_1_911',
      rule_id: 'T1.2',
      label: 'Pink or white frothy sputum — 911',
      evidence: { sputum_color: e.sputum_color, recorded_at: e.recorded_at },
    });
  }

  for (const e of todayEvents.filter((e) => e.symptom === 'chest_pain' && e.present)) {
    hits.push({
      tier: 'tier_1_911',
      rule_id: 'T1.3',
      label: 'New chest pain or pressure — 911',
      evidence: { chest_pain_character: e.chest_pain_character, recorded_at: e.recorded_at },
    });
  }

  for (const e of todayEvents.filter((e) => e.symptom === 'cognition_change' && e.present && e.severity === 4)) {
    hits.push({
      tier: 'tier_1_911',
      rule_id: 'T1.4',
      label: 'Severe confusion or unresponsiveness — 911',
      evidence: { recorded_at: e.recorded_at },
    });
  }

  for (const e of todayEvents.filter((e) => e.symptom === 'syncope' && e.present)) {
    hits.push({
      tier: 'tier_1_911',
      rule_id: 'T1.5',
      label: 'Fainting episode — 911',
      evidence: { recorded_at: e.recorded_at },
    });
  }

  for (const e of todayEvents.filter((e) => e.symptom === 'cyanosis' && e.present)) {
    hits.push({
      tier: 'tier_1_911',
      rule_id: 'T1.6',
      label: 'Blue lips or fingers — 911',
      evidence: { recorded_at: e.recorded_at },
    });
  }

  // T1.7 — SpO2 thresholds. Use freshest spo2 reading within window.
  const freshestSpo2 = freshestReading(readings, 'spo2', SPO2_FRESHNESS_HOURS, logDate);
  if (freshestSpo2 && freshestSpo2.value < SPO2_TIER_1_911) {
    hits.push({
      tier: 'tier_1_911',
      rule_id: 'T1.7a',
      label: `Oxygen ${freshestSpo2.value}% — 911`,
      evidence: { spo2: freshestSpo2.value, recorded_at: freshestSpo2.recorded_at },
    });
  } else if (
    freshestSpo2 &&
    freshestSpo2.value < SPO2_TIER_1_WITH_DYSPNEA &&
    todayEvents.some((e) => e.symptom === 'dyspnea' && e.present)
  ) {
    // Research §2 Tier 1 says "<90% with NEW dyspnea" — gate on the absence
    // of dyspnea events in the prior 7 days so chronic NYHA-III dyspnea
    // doesn't trip 911 every morning the spo2 cuff reads 89.
    if (priorWindowMaxes.dyspneaEventCount === 0) {
      hits.push({
        tier: 'tier_1_911',
        rule_id: 'T1.7b',
        label: `Oxygen ${freshestSpo2.value}% with new shortness of breath — 911`,
        evidence: { spo2: freshestSpo2.value, recorded_at: freshestSpo2.recorded_at },
      });
    }
  }

  // T1.8 — fast irregular pulse with chest pain or dizziness. Schema doesn't
  // capture "fast" on the symptom event itself, so we compound with a recent
  // resting_hr > HR_TIER_2_HIGH (100). Without a fast HR reading the
  // pulse_irregular event still drives the symptom-only fall-throughs below.
  const freshestHr = freshestReading(readings, 'resting_hr', READING_FRESHNESS_HOURS, logDate);
  const irregularToday = todayEvents.find((e) => e.symptom === 'pulse_irregular' && e.present);
  const hasChestPainToday = todayEvents.some((e) => e.symptom === 'chest_pain' && e.present);
  const hasDizzinessToday = todayEvents.some((e) => e.symptom === 'dizziness' && e.present);
  if (
    irregularToday &&
    freshestHr &&
    freshestHr.value > HR_TIER_2_HIGH &&
    (hasChestPainToday || hasDizzinessToday)
  ) {
    hits.push({
      tier: 'tier_1_911',
      rule_id: 'T1.8',
      label: 'Fast irregular pulse with chest pain or dizziness — 911',
      evidence: {
        resting_hr: freshestHr.value,
        irregular_recorded_at: irregularToday.recorded_at,
        chest_pain: hasChestPainToday,
        dizziness: hasDizzinessToday,
      },
    });
  }

  // ── TIER 2 ────────────────────────────────────────────────────────────────

  // T2.1 / T2.2 / T2.3 — weight trends. Suppressed during cold-start.
  if (!coldStart) {
    const todayWeight = freshestReading(readings, 'weight_lb', 24, logDate);
    if (todayWeight) {
      const w24 = compareWeight(
        readings,
        todayWeight,
        WEIGHT_WINDOW_24H_MIN_HOURS,
        WEIGHT_WINDOW_24H_MAX_HOURS
      );
      if (w24 && w24.delta > WEIGHT_GAIN_TIER_2_24H_LB) {
        hits.push({
          tier: 'tier_2_today',
          rule_id: 'T2.1',
          label: `Weight up ${w24.delta.toFixed(1)} lb in 24 hours — call cardiologist today`,
          evidence: w24.evidence,
        });
      }
      const w48 = compareWeight(
        readings,
        todayWeight,
        WEIGHT_WINDOW_48H_MIN_HOURS,
        WEIGHT_WINDOW_48H_MAX_HOURS
      );
      if (w48 && w48.delta > WEIGHT_GAIN_TIER_2_48H_LB) {
        hits.push({
          tier: 'tier_2_today',
          rule_id: 'T2.2',
          label: `Weight up ${w48.delta.toFixed(1)} lb in 48 hours — call cardiologist today`,
          evidence: w48.evidence,
        });
      }
      const w7 = compareWeight(
        readings,
        todayWeight,
        WEIGHT_WINDOW_7D_MIN_DAYS * 24,
        WEIGHT_WINDOW_7D_MAX_DAYS * 24
      );
      if (w7 && w7.delta > WEIGHT_GAIN_TIER_2_7D_LB) {
        hits.push({
          tier: 'tier_2_today',
          rule_id: 'T2.3',
          label: `Weight up ${w7.delta.toFixed(1)} lb in a week — call cardiologist today`,
          evidence: w7.evidence,
        });
      }
    }
  }

  // T2.4 — orthopnea: today's pillow_count above the rolling-7-day max
  // (or above the onboarding baseline if no recent data). Fires at-or-above
  // baseline+1 to capture "needs more pillows than usual."
  if (dayLevel.pillow_count !== null) {
    const recentMax = priorWindowMaxes.pillowCount;
    const baseline = patient.normal_pillow_count ?? 1;
    const reference = Math.max(recentMax ?? baseline, baseline);
    if (dayLevel.pillow_count > reference) {
      hits.push({
        tier: 'tier_2_today',
        rule_id: 'T2.4',
        label: `Sleeping on ${dayLevel.pillow_count} pillows — more than usual`,
        evidence: { today: dayLevel.pillow_count, baseline_or_recent_max: reference },
      });
    }
  }

  // T2.5 — PND in last 48 hours.
  for (const e of last48hEvents.filter((e) => e.symptom === 'pnd' && e.present)) {
    hits.push({
      tier: 'tier_2_today',
      rule_id: 'T2.5',
      label: 'Woke up gasping for air (PND) — call cardiologist today',
      evidence: { recorded_at: e.recorded_at, log_date: e.log_date },
    });
    break; // one is enough; multiple PND episodes don't multiply the alert
  }

  // T2.6 — new or worsened swelling that does NOT resolve overnight.
  // Excludes evening-only swelling (T3.3 handles that lower tier). "New"
  // means no prior swelling in the rolling baseline window OR today's
  // severity exceeds the recent max — this works on day-1 (priorMax=null
  // → "new") and on history alike, so cold-start does NOT gate this rule.
  const swellingToday = todayEvents.find(
    (e) =>
      e.symptom === 'swelling' &&
      e.present &&
      (e.severity ?? 0) >= 1 &&
      e.resolves_overnight !== true
  );
  if (swellingToday) {
    const priorMax = priorWindowMaxes.swellingSeverity;
    if (priorMax === null || (swellingToday.severity ?? 0) > priorMax) {
      hits.push({
        tier: 'tier_2_today',
        rule_id: 'T2.6',
        label: 'New or worsened swelling — call cardiologist today',
        evidence: {
          severity: swellingToday.severity,
          prior_7d_max_severity: priorMax,
          recorded_at: swellingToday.recorded_at,
        },
      });
    }
  }

  // T2.7 — severe functional change.
  if (dayLevel.activity_step_change === 'severe_change') {
    hits.push({
      tier: 'tier_2_today',
      rule_id: 'T2.7',
      label: 'Big drop in what she can do today — call cardiologist today',
      evidence: { activity_step_change: 'severe_change' },
    });
  }

  // T2.8 — new persistent nocturnal cough. Suppressed during cold-start.
  // Excludes frothy-sputum cough events (those are T1.2).
  if (!coldStart) {
    const nocturnalCoughToday = todayEvents.find(
      (e) =>
        e.symptom === 'cough' &&
        e.present &&
        e.nocturnal === true &&
        e.sputum_color !== 'pink_frothy' &&
        e.sputum_color !== 'white_frothy'
    );
    if (nocturnalCoughToday) {
      if (priorWindowMaxes.coughEventCount === 0) {
        hits.push({
          tier: 'tier_2_today',
          rule_id: 'T2.8',
          label: 'New nighttime cough — call cardiologist today',
          evidence: { recorded_at: nocturnalCoughToday.recorded_at },
        });
      }
    }
  }

  // T2.9 — decreased urine output today.
  if (dayLevel.urine_output_change === 'decreased') {
    hits.push({
      tier: 'tier_2_today',
      rule_id: 'T2.9',
      label: 'Urine output is down today — call cardiologist today',
      evidence: { urine_output_change: 'decreased' },
    });
  }

  // T2.10 — low SBP compounded with persistent dizziness, confusion, or
  // cool/clammy extremities. Persistent dizziness = postural=false; postural
  // dizziness alone is T3.4.
  const freshestSbp = freshestReading(readings, 'systolic_bp', READING_FRESHNESS_HOURS, logDate);
  if (freshestSbp && freshestSbp.value < SBP_TIER_2_LOW) {
    const persistentDizziness = todayEvents.find(
      (e) => e.symptom === 'dizziness' && e.present && e.postural === false
    );
    const cognitionWarn = todayEvents.find(
      (e) => e.symptom === 'cognition_change' && e.present && (e.severity === 1 || e.severity === 2)
    );
    const coldClammy = todayEvents.find(
      (e) => e.symptom === 'extremities_cold_clammy' && e.present
    );
    if (persistentDizziness || cognitionWarn || coldClammy) {
      hits.push({
        tier: 'tier_2_today',
        rule_id: 'T2.10',
        label: 'Low blood pressure with concerning symptoms — call cardiologist today',
        evidence: {
          sbp: freshestSbp.value,
          dizziness: !!persistentDizziness,
          cognition_change: cognitionWarn?.severity ?? null,
          cold_clammy: !!coldClammy,
        },
      });
    }
  }

  // T2.11 — heart rate rules.
  // Research-drift note: §2 Tier 2 says "Resting HR persistently >100 OR
  // <50 with symptoms". v0 fires on a single freshest reading (no
  // "persistently" check). Multi-reading persistence is deferred.
  if (freshestHr) {
    if (freshestHr.value > HR_TIER_2_VERY_HIGH) {
      hits.push({
        tier: 'tier_2_today',
        rule_id: 'T2.11a',
        label: `Resting heart rate ${freshestHr.value} bpm — call cardiologist today`,
        evidence: { resting_hr: freshestHr.value, threshold: HR_TIER_2_VERY_HIGH },
      });
    } else if (freshestHr.value > HR_TIER_2_HIGH && hasAnyOtherTier2Symptom(todayEvents)) {
      hits.push({
        tier: 'tier_2_today',
        rule_id: 'T2.11b',
        label: `Resting heart rate ${freshestHr.value} bpm with other symptoms — call cardiologist today`,
        evidence: { resting_hr: freshestHr.value, threshold: HR_TIER_2_HIGH },
      });
    } else if (freshestHr.value < HR_TIER_2_LOW && hasAnyOtherTier2Symptom(todayEvents)) {
      hits.push({
        tier: 'tier_2_today',
        rule_id: 'T2.11c',
        label: `Resting heart rate ${freshestHr.value} bpm with other symptoms — call cardiologist today`,
        evidence: { resting_hr: freshestHr.value, threshold: HR_TIER_2_LOW },
      });
    }
  }

  // T2.12 — nausea today.
  for (const e of todayEvents.filter((e) => e.symptom === 'nausea' && e.present)) {
    hits.push({
      tier: 'tier_2_today',
      rule_id: 'T2.12',
      label: 'New nausea — call cardiologist today',
      evidence: { recorded_at: e.recorded_at },
    });
    break;
  }

  // T2.13 — mild fog or confusion (graded severity 1 or 2). Severity 4 was
  // tier 1 (T1.4); 0/null are non-events.
  for (const e of todayEvents.filter(
    (e) => e.symptom === 'cognition_change' && e.present && (e.severity === 1 || e.severity === 2)
  )) {
    hits.push({
      tier: 'tier_2_today',
      rule_id: 'T2.13',
      label: 'New mental fog or confusion — call cardiologist today',
      evidence: { severity: e.severity, recorded_at: e.recorded_at },
    });
    break;
  }

  // T2.14 — extremities cold/clammy with fatigue. Standalone tier-2 trigger
  // distinct from the SBP compound (T2.10).
  const coldClammyToday = todayEvents.find(
    (e) => e.symptom === 'extremities_cold_clammy' && e.present
  );
  const fatigueToday = todayEvents.find((e) => e.symptom === 'fatigue' && e.present);
  if (coldClammyToday && fatigueToday) {
    hits.push({
      tier: 'tier_2_today',
      rule_id: 'T2.14',
      label: 'Cold, clammy hands with fatigue — call cardiologist today',
      evidence: {
        cold_clammy_recorded_at: coldClammyToday.recorded_at,
        fatigue_recorded_at: fatigueToday.recorded_at,
      },
    });
  }

  // ── TIER 3 ────────────────────────────────────────────────────────────────

  // T3.1 — weight up 1–2 lb/day for 3+ consecutive days. Suppressed cold-start.
  if (!coldStart) {
    const trend = consecutiveSubTier2WeightGain(readings, logDate);
    if (trend) {
      hits.push({
        tier: 'tier_3_48hr',
        rule_id: 'T3.1',
        label: `Weight creeping up ${trend.totalDelta.toFixed(1)} lb over ${trend.days} days — call within 48 hrs`,
        evidence: trend.evidence,
      });
    }
  }

  // T3.2 — mild functional slowdown.
  if (dayLevel.activity_step_change === 'mild_slowdown') {
    hits.push({
      tier: 'tier_3_48hr',
      rule_id: 'T3.2',
      label: 'Slower than usual today — call within 48 hrs',
      evidence: { activity_step_change: 'mild_slowdown' },
    });
  }

  // T3.3 — evening-only swelling that resolves overnight.
  for (const e of todayEvents.filter(
    (e) => e.symptom === 'swelling' && e.present && e.resolves_overnight === true && (e.severity ?? 0) <= 1
  )) {
    hits.push({
      tier: 'tier_3_48hr',
      rule_id: 'T3.3',
      label: 'Mild evening swelling that resolves overnight — call within 48 hrs',
      evidence: { severity: e.severity, recorded_at: e.recorded_at },
    });
    break;
  }

  // T3.4 — orthostatic dizziness.
  for (const e of todayEvents.filter((e) => e.symptom === 'dizziness' && e.present && e.postural === true)) {
    hits.push({
      tier: 'tier_3_48hr',
      rule_id: 'T3.4',
      label: 'Dizzy on standing — call within 48 hrs',
      evidence: { recorded_at: e.recorded_at },
    });
    break;
  }

  // ── Resolve to highest-severity tier ──────────────────────────────────────

  if (hits.length === 0) {
    return { tier: 'tier_4_log', triggers: [], coldStart };
  }

  hits.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
  const top = hits[0].tier;

  return {
    tier: top,
    triggers: hits.map(({ rule_id, label, evidence }) => ({ rule_id, label, evidence })),
    coldStart,
  };
}

// ─── Data loading ───────────────────────────────────────────────────────────

async function loadInputs(
  supabase: SupabaseClient<Database>,
  patientId: string,
  logDate: string
): Promise<EngineInputs> {
  const eightDaysAgo = isoDateOffset(logDate, -8);
  const fortyEightHoursAgo = isoTimestampOffsetHours(logDate, -48);
  const lookbackDate = isoDateOffset(logDate, -COLD_START_LOOKBACK_DAYS);
  const baselineStart = isoDateOffset(logDate, -ROLLING_BASELINE_DAYS);

  const [
    readingsRes,
    eventsRes,
    dayRowsRes,
    patientRes,
    priorDaysRes,
    priorPillowsRes,
    priorSwellingRes,
    priorDyspneaRes,
    priorCoughRes,
  ] = await Promise.all([
    supabase
      .from('daily_log_readings')
      .select('field, value, recorded_at, log_date')
      .eq('patient_id', patientId)
      .gte('log_date', eightDaysAgo)
      .order('recorded_at', { ascending: false }),
    supabase
      .from('daily_log_symptom_events')
      .select(
        'symptom, present, severity, body_region, nocturnal, sputum_color, chest_pain_character, resolves_overnight, postural, recorded_at, log_date'
      )
      .eq('patient_id', patientId)
      .gte('recorded_at', fortyEightHoursAgo)
      .order('recorded_at', { ascending: false }),
    supabase
      .from('daily_logs')
      .select('id, pillow_count, appetite_change, urine_output_change, activity_step_change, created_at')
      .eq('patient_id', patientId)
      .eq('log_date', logDate)
      .order('created_at', { ascending: false }),
    supabase
      .from('patients')
      .select('normal_pillow_count')
      .eq('id', patientId)
      .single(),
    supabase
      .from('daily_logs')
      .select('log_date')
      .eq('patient_id', patientId)
      .gte('log_date', lookbackDate)
      .lt('log_date', logDate),
    supabase
      .from('daily_logs')
      .select('pillow_count')
      .eq('patient_id', patientId)
      .gte('log_date', baselineStart)
      .lt('log_date', logDate)
      .not('pillow_count', 'is', null),
    supabase
      .from('daily_log_symptom_events')
      .select('severity')
      .eq('patient_id', patientId)
      .eq('symptom', 'swelling')
      .eq('present', true)
      .gte('log_date', baselineStart)
      .lt('log_date', logDate),
    supabase
      .from('daily_log_symptom_events')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patientId)
      .eq('symptom', 'dyspnea')
      .eq('present', true)
      .gte('log_date', baselineStart)
      .lt('log_date', logDate),
    supabase
      .from('daily_log_symptom_events')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patientId)
      .eq('symptom', 'cough')
      .eq('present', true)
      .gte('log_date', baselineStart)
      .lt('log_date', logDate),
  ]);

  if (readingsRes.error) throw readingsRes.error;
  if (eventsRes.error) throw eventsRes.error;
  if (dayRowsRes.error) throw dayRowsRes.error;
  if (patientRes.error) throw patientRes.error;
  if (priorDaysRes.error) throw priorDaysRes.error;
  if (priorPillowsRes.error) throw priorPillowsRes.error;
  if (priorSwellingRes.error) throw priorSwellingRes.error;
  if (priorDyspneaRes.error) throw priorDyspneaRes.error;
  if (priorCoughRes.error) throw priorCoughRes.error;

  const readings = (readingsRes.data ?? []) as Reading[];
  const symptomEvents = (eventsRes.data ?? []) as SymptomEvent[];

  // Latest non-null per day-level field across the day's daily_logs rows.
  // Rows are already ordered created_at DESC; first non-null wins.
  const dayLevel: DayLevel = {
    pillow_count: firstNonNull(dayRowsRes.data ?? [], 'pillow_count'),
    appetite_change: firstNonNull(dayRowsRes.data ?? [], 'appetite_change') as DayLevel['appetite_change'],
    urine_output_change: firstNonNull(dayRowsRes.data ?? [], 'urine_output_change') as DayLevel['urine_output_change'],
    activity_step_change: firstNonNull(dayRowsRes.data ?? [], 'activity_step_change') as DayLevel['activity_step_change'],
  };

  const distinctPriorLogDays = new Set(
    (priorDaysRes.data ?? []).map((r) => r.log_date)
  ).size;

  const priorPillowCounts = (priorPillowsRes.data ?? [])
    .map((r) => r.pillow_count as number | null)
    .filter((v): v is number => v !== null);
  const priorSwellingSeverities = (priorSwellingRes.data ?? [])
    .map((r) => r.severity as number | null)
    .filter((v): v is number => v !== null);

  return {
    readings,
    symptomEvents,
    dayLevel,
    patient: patientRes.data as Patient,
    distinctPriorLogDays,
    logDate,
    priorWindowMaxes: {
      pillowCount: priorPillowCounts.length === 0 ? null : Math.max(...priorPillowCounts),
      swellingSeverity:
        priorSwellingSeverities.length === 0 ? null : Math.max(...priorSwellingSeverities),
      dyspneaEventCount: priorDyspneaRes.count ?? 0,
      coughEventCount: priorCoughRes.count ?? 0,
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function freshestReading(
  readings: Reading[],
  field: Reading['field'],
  freshnessHours: number,
  pinDate?: string
): Reading | null {
  const cutoff = pinDate
    ? new Date(`${pinDate}T23:59:59Z`).getTime() - freshnessHours * 3600_000
    : Date.now() - freshnessHours * 3600_000;
  const candidates = readings.filter(
    (r) => r.field === field && new Date(r.recorded_at).getTime() >= cutoff
  );
  if (candidates.length === 0) return null;
  // already sorted desc by recorded_at on load
  return candidates[0];
}

function compareWeight(
  readings: Reading[],
  today: Reading,
  windowMinHours: number,
  windowMaxHours: number
):
  | { delta: number; evidence: Record<string, unknown> }
  | null {
  const todayMs = new Date(today.recorded_at).getTime();
  const minMs = todayMs - windowMaxHours * 3600_000;
  const maxMs = todayMs - windowMinHours * 3600_000;
  const candidates = readings.filter((r) => {
    if (r.field !== 'weight_lb') return false;
    const t = new Date(r.recorded_at).getTime();
    return t >= minMs && t <= maxMs;
  });
  if (candidates.length === 0) return null;
  // pick the weight nearest the center of the window
  const targetMs = todayMs - ((windowMinHours + windowMaxHours) / 2) * 3600_000;
  const prior = candidates.reduce((best, r) =>
    Math.abs(new Date(r.recorded_at).getTime() - targetMs) <
    Math.abs(new Date(best.recorded_at).getTime() - targetMs)
      ? r
      : best
  );
  const delta = today.value - prior.value;
  return {
    delta,
    evidence: {
      current_weight_lb: today.value,
      current_recorded_at: today.recorded_at,
      prior_weight_lb: prior.value,
      prior_recorded_at: prior.recorded_at,
      delta_lb: Number(delta.toFixed(1)),
      window_hours: { min: windowMinHours, max: windowMaxHours },
    },
  };
}

function consecutiveSubTier2WeightGain(
  readings: Reading[],
  logDate: string
): { days: number; totalDelta: number; evidence: Record<string, unknown> } | null {
  // Group weight readings by log_date, take the latest value per day.
  const byDay = new Map<string, number>();
  for (const r of readings) {
    if (r.field !== 'weight_lb') continue;
    if (!byDay.has(r.log_date)) byDay.set(r.log_date, r.value);
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  if (days.length < WEIGHT_GAIN_TIER_3_CONSECUTIVE_DAYS + 1) return null;

  // Walk backwards from logDate counting consecutive day-over-day gains in
  // [WEIGHT_GAIN_TIER_3_DAILY_LB, WEIGHT_GAIN_TIER_3_DAILY_MAX_LB].
  let streak = 0;
  let totalDelta = 0;
  const trailPoints: Array<{ log_date: string; weight_lb: number }> = [];
  for (let i = 0; i < days.length - 1; i++) {
    const [d1, w1] = days[i];
    const [, w2] = days[i + 1];
    const delta = w1 - w2;
    if (delta >= WEIGHT_GAIN_TIER_3_DAILY_LB && delta <= WEIGHT_GAIN_TIER_3_DAILY_MAX_LB) {
      streak++;
      totalDelta += delta;
      trailPoints.push({ log_date: d1, weight_lb: w1 });
    } else {
      break;
    }
  }
  if (streak < WEIGHT_GAIN_TIER_3_CONSECUTIVE_DAYS) return null;
  trailPoints.push({ log_date: days[streak][0], weight_lb: days[streak][1] });
  return {
    days: streak,
    totalDelta,
    evidence: {
      consecutive_days: streak,
      total_delta_lb: Number(totalDelta.toFixed(1)),
      trail: trailPoints,
      log_date: logDate,
    },
  };
}

function hasAnyOtherTier2Symptom(events: SymptomEvent[]): boolean {
  return events.some(
    (e) =>
      e.present &&
      [
        'dyspnea',
        'cough',
        'swelling',
        'pnd',
        'nausea',
        'cognition_change',
        'extremities_cold_clammy',
        'dizziness',
        'fatigue',
      ].includes(e.symptom)
  );
}

function firstNonNull<T extends Record<string, unknown>, K extends keyof T>(
  rows: T[],
  key: K
): T[K] | null {
  for (const r of rows) {
    if (r[key] !== null && r[key] !== undefined) return r[key];
  }
  return null;
}

function isoDateOffset(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoTimestampOffsetHours(date: string, hours: number): string {
  const d = new Date(`${date}T23:59:59Z`);
  d.setUTCHours(d.getUTCHours() + hours);
  return d.toISOString();
}
