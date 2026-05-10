// Clinical thresholds for the Phase 1 alert engine.
//
// SINGLE SOURCE for every magic number the engine uses. Per
// .claude/rules/code-quality.md rule #1, no other file in HeartNote may
// hardcode a clinical value — import from here. Each constant carries a
// `cited:` comment pointing at the section in research/chf-source-of-truth.md
// that justifies the number.
//
// When the source-of-truth file changes, this file changes too. When this
// file changes, the alert engine's behavior changes — that's intentional;
// it's why the values live here, not scattered.

// ─── Weight gain (cited: §3 + §2 Tier 2 / Tier 3) ────────────────────────────

// "Rapid weight gain (>2 lb/24 hr, >3 lb/48 hr, or >5 lb/week)" → tier 2.
// HeartNote picks the most sensitive thresholds available across AHA,
// MedlinePlus, Kaiser; conflict explanation lives in §3 of the research file.
export const WEIGHT_GAIN_TIER_2_24H_LB = 2;
export const WEIGHT_GAIN_TIER_2_48H_LB = 3;
export const WEIGHT_GAIN_TIER_2_7D_LB = 5;

// "Weight up 1–2 lb/day for 3+ consecutive days (sub-tier-2 but trending)"
// → tier 3.
export const WEIGHT_GAIN_TIER_3_DAILY_LB = 1;
export const WEIGHT_GAIN_TIER_3_DAILY_MAX_LB = 2;
export const WEIGHT_GAIN_TIER_3_CONSECUTIVE_DAYS = 3;

// Time windows (in hours) over which to compare weight readings. Wide
// enough to tolerate dictations that don't happen at exactly the same
// time of day.
export const WEIGHT_WINDOW_24H_MIN_HOURS = 18;
export const WEIGHT_WINDOW_24H_MAX_HOURS = 30;
export const WEIGHT_WINDOW_48H_MIN_HOURS = 42;
export const WEIGHT_WINDOW_48H_MAX_HOURS = 54;
export const WEIGHT_WINDOW_7D_MIN_DAYS = 6;
export const WEIGHT_WINDOW_7D_MAX_DAYS = 8;

// ─── Blood pressure (cited: §3) ──────────────────────────────────────────────

// "SBP <90 with dizziness/confusion/cool clammy" → tier 2.
export const SBP_TIER_2_LOW = 90;

// ─── Heart rate (cited: §3 + §2 Tier 2) ──────────────────────────────────────

// "Resting HR persistently >100 OR <50 with symptoms" → tier 2.
// "HR >120 bpm at rest" → tier 2 (Cleveland Clinic threshold).
export const HR_TIER_2_HIGH = 100;
export const HR_TIER_2_VERY_HIGH = 120;
export const HR_TIER_2_LOW = 50;

// ─── SpO2 (cited: §3 + §2 Tier 1) ────────────────────────────────────────────

// "SpO2 <88%, OR <90% with new dyspnea" → tier 1 (911).
export const SPO2_TIER_1_911 = 88;
export const SPO2_TIER_1_WITH_DYSPNEA = 90;

// SpO2 readings older than this are not used for alerting. A reading from
// 5 days ago shouldn't fire today's tier-1.
export const SPO2_FRESHNESS_HOURS = 24;

// SpO2 watch band: 91–94% with new dyspnea is a "watch today" signal in
// the helper text. Below 91% (with new dyspnea) is tier 1; ≥95% is calm.
// cited: research/chf-source-of-truth.md §3 "SpO2 91–94% sustained → call
// cardiologist (sub-tier-1 watch band)".
export const SPO2_WATCH_BAND_LOW = 91;
export const SPO2_WATCH_BAND_HIGH = 94;

// ─── Helper-text only (calm-band thresholds) ────────────────────────────────

// Weight: caregiver helper text shows "within 2 lb of baseline" as the
// calm-tone copy. Below the WEIGHT_GAIN_TIER_2_7D_LB-1 watch threshold
// but above this floor we say "drift from baseline" — small enough to
// surface but not alarming.
// cited: research/chf-source-of-truth.md §3 "minor day-to-day fluctuations
// (±2 lb) are normal in CHF patients".
export const WEIGHT_CALM_BAND_LB = 2;

// ─── Engine-internal (not in the research file) ──────────────────────────────

// Cold-start: a patient's rolling baseline only stabilizes after enough days
// of data. Rules that depend on baseline (weight trends, "new" cough
// frequency) are suppressed until the patient has at least this many
// distinct logged days in the prior LOOKBACK window. Acute single-event
// rules (Tier 1, symptom-only Tier 2/3) still fire on day 1.
export const COLD_START_MIN_LOG_DAYS = 7;
export const COLD_START_LOOKBACK_DAYS = 14;

// Rolling-baseline window for "new or worsened" rules (orthopnea, swelling,
// nocturnal cough). 7 days matches the §2 Tier 2 orthopnea language ("more
// pillows than last week").
export const ROLLING_BASELINE_DAYS = 7;

// How fresh a vitals reading must be to drive an alert. A blood pressure
// from 5 days ago shouldn't decide today's tier.
export const READING_FRESHNESS_HOURS = 24;

// Persistence window for symptoms research §2 Tier 2 calls out as
// "persisting >24 hr" (nausea, early satiety). Phase 1 implements a
// stricter "at least one event in last 48h" gate for PND only; the
// "persisting" qualifier on nausea / early satiety is deferred.
export const PND_LOOKBACK_HOURS = 48;
