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

// ─── Cold-start (engine-internal, not in the research file) ──────────────────

// A patient's rolling baseline only stabilizes after enough days of data.
// Rules that depend on baseline (weight trends, "new" cough frequency) are
// suppressed until the patient has at least this many distinct logged days
// in the prior LOOKBACK window. Acute single-event rules (Tier 1, symptom-
// only Tier 2/3) still fire on day 1.
export const COLD_START_MIN_LOG_DAYS = 7;
export const COLD_START_LOOKBACK_DAYS = 14;
