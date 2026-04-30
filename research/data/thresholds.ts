// research/data/thresholds.ts
//
// Single source of structured clinical thresholds for HeartNote's alert engine.
// Each entry cites both the internal source-of-truth section and the upstream
// primary source. Never hardcode a clinical number elsewhere in the codebase.
// Updates here require re-running the clinical eval suite.
//
// IMPORTANT: This module is data + types only. The matching engine that
// consumes these rules lives elsewhere. HeartNote never recommends dose
// changes; alert copy must always direct caregivers to the patient's own
// care team for individualized thresholds.

// ---------------------------------------------------------------------------
// Shared meta type
// ---------------------------------------------------------------------------

export type ThresholdMeta = {
  /** Internal pointer into research/chf-source-of-truth.md */
  internal: string;
  /** Upstream primary source(s) */
  external: string;
  /** Verbatim quote from upstream when available */
  sourceQuote?: string;
  /** ISO date the entry was last reviewed against source files */
  lastReviewed: string;
  /** Clinical reviewer name, or 'pending' until clinical-advisor review */
  reviewer: 'pending' | string;
};

// ---------------------------------------------------------------------------
// Numeric thresholds
//
// Where multiple organizations publish different values, HeartNote picks the
// most-sensitive headline value (per chf-source-of-truth.md §3) to avoid
// false negatives. The verbatim source quote is included where the upstream
// language matters for caregiver-facing copy.
// ---------------------------------------------------------------------------

export const WEIGHT_GAIN_24H_YELLOW_LB = {
  value: 2,
  unit: 'lb',
  windowHours: 24,
  meta: {
    internal: 'chf-source-of-truth.md §3 (Weight gain, 24 hr)',
    external:
      'AHA Managing Heart Failure Symptoms (verbatim quote source); Kaiser Permanente Daily Action Plan and MedlinePlus concur with the 2 lb / 24 h, 5 lb / 7 d framing.',
    sourceQuote:
      'Many people first realize their heart failure is getting worse when they notice gaining more than two or three pounds in a day or more than five pounds in a week. (AHA)',
    lastReviewed: '2026-04-29',
    reviewer: 'pending',
  },
} as const;

export const WEIGHT_GAIN_48H_YELLOW_LB = {
  value: 3,
  unit: 'lb',
  windowHours: 48,
  meta: {
    internal: 'chf-source-of-truth.md §2 Tier 2 (Rapid weight gain bullet)',
    external: 'AHA Managing HF Symptoms; ESC / Heart Failure Matters (>2 kg / 3 lb in 3 days)',
    sourceQuote: '>2 kg (3 lb) in 3 days',
    lastReviewed: '2026-04-29',
    reviewer: 'pending',
  },
} as const;

export const WEIGHT_GAIN_7D_YELLOW_LB = {
  value: 5,
  unit: 'lb',
  windowHours: 168,
  meta: {
    internal: 'chf-source-of-truth.md §3 (Weight gain, 7 days)',
    external: 'AHA Managing HF Symptoms; MedlinePlus; Kaiser Permanente',
    sourceQuote: '>2 or 3 pounds in a day or more than 5 pounds in a week',
    lastReviewed: '2026-04-29',
    reviewer: 'pending',
  },
} as const;

// REMOVED: WEIGHT_GAIN_7D_RED_LB = 10 lb / 7 days. The 10-lb boundary came from
// the Chaudhry 2007 statistical OR table cell, not from any patient-facing
// published rule (AHA, Cleveland Clinic, ESC, Kaiser, MedlinePlus all stop at
// the 5 lb / 7 days yellow threshold). Storing it as data invited the engine
// to use a non-published Red trigger. If a clinical reviewer ever publishes a
// Red rule above the Yellow threshold, re-introduce it then with that source.

export const DRY_WEIGHT_DELTA_LB = {
  value: 4,
  unit: 'lb',
  windowHours: null,
  /**
   * Only meaningful when the cardiologist has stated a dry weight. Default
   * alert logic still runs on rolling deltas; this is an additional layer.
   */
  requiresDryWeightSet: true,
  meta: {
    internal: 'chf-source-of-truth.md §3 (Weight delta from dry weight)',
    external: 'Cleveland Clinic Heart Failure Zones; Cleveland Clinic Understanding Heart Failure',
    sourceQuote: 'Gain or lose 4 or more pounds [from dry weight] = Yellow zone — call doctor/nurse.',
    lastReviewed: '2026-04-29',
    reviewer: 'pending',
  },
} as const;

// IMPORTANT: SBP_LOW_MMHG must NEVER fire a stand-alone Tier 2 alert. HF
// patients on ACE-I/ARB/ARNI/beta blockers commonly run SBP in the 90s. The
// compound rule `sbp_low_with_symptoms` requires a co-occurring symptom flag.
// Future engineers reading this const directly: do not bypass the compound.
export const SBP_LOW_MMHG = {
  value: 90,
  unit: 'mmHg',
  /** Stand-alone use is unsafe — engine MUST require a co-occurring symptom flag. */
  requiresSymptom: true,
  meta: {
    internal: 'chf-source-of-truth.md §3 (SBP)',
    external:
      'AHA – Low Blood Pressure (formal hypotension definition); Management of low BP in HFrEF, PMC7540603',
    sourceQuote:
      'SBP <90 mmHg [...] formal definition of hypotension. HF patients on GDMT frequently run SBP in the 90s; low BP alone is not an emergency — low BP plus a new symptom is the red flag. (chf-source-of-truth.md §3 + 01 §1.2)',
    lastReviewed: '2026-04-29',
    reviewer: 'pending',
  },
} as const;

export const DBP_LOW_MMHG = {
  value: 60,
  unit: 'mmHg',
  meta: {
    internal: 'chf-source-of-truth.md §3 (DBP)',
    external: 'AHA – Low Blood Pressure',
    sourceQuote: 'SBP <90 mmHg OR DBP <60 mmHg [...] formal definition of hypotension.',
    lastReviewed: '2026-04-29',
    reviewer: 'pending',
  },
} as const;

export const HR_HIGH_BPM = {
  value: 100,
  unit: 'bpm',
  meta: {
    internal: 'chf-source-of-truth.md §3 (Resting HR)',
    external: '2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure',
    sourceQuote:
      'Resting HR >100 bpm (tachycardia) — can reflect decompensation, dehydration, arrhythmia (esp. new AF).',
    lastReviewed: '2026-04-29',
    reviewer: 'pending',
  },
} as const;

export const HR_VERY_HIGH_BPM = {
  value: 120,
  unit: 'bpm',
  meta: {
    internal:
      'chf-source-of-truth.md §3 (Resting HR row, Cleveland Clinic); 03-caregiver-education.md §2.1 "Pulse alarm line" and §13 metric table',
    external: 'Cleveland Clinic – Heart Failure Activity / Heart Failure Zones',
    sourceQuote:
      'Pulse alarm line: contact doctor for heart rate exceeding "120 beats per minute at rest." (03-caregiver-education.md §2.1) / "Resting heart rate above 120 bpm should prompt a call to the clinician." (03-caregiver-education.md §13 attributed to Cleveland Clinic)',
    lastReviewed: '2026-04-29',
    reviewer: 'pending',
  },
} as const;

export const HR_LOW_BPM = {
  value: 50,
  unit: 'bpm',
  meta: {
    internal: 'chf-source-of-truth.md §3 (Resting HR)',
    external: '2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure',
    sourceQuote:
      'Resting HR <50 bpm with symptoms — can reflect over-beta-blockade or conduction disease.',
    lastReviewed: '2026-04-29',
    reviewer: 'pending',
  },
} as const;

// CLINICAL_REVIEW_NEEDED: SPO2_CALL_PCT = 92 is a HeartNote-side synthesis
// (chf-source-of-truth.md §3 / 01 §1.4 App-logic line). BTS publishes 94–98%
// as the acute-HF target; <90% is the published "hypoxemia" line. The 92%
// middle line is HeartNote's editorial choice. Confirm 92% is intentional vs
// reverting to 90% (more conservative; matches a published threshold).
export const SPO2_CALL_PCT = {
  value: 92,
  unit: '%',
  meta: {
    internal: 'chf-source-of-truth.md §3 (SpO2 — call today); 01 §1.4 App logic',
    external:
      'Oxygen Management in HF Patients, sagepub 2022 (PMC); BTS publishes the 94–98% acute-HF target as context — the <92% rule is a HeartNote synthesis, not BTS-published.',
    sourceQuote: 'SpO2 <92% resting → call cardiologist today. (HeartNote app-logic line per 01 §1.4)',
    lastReviewed: '2026-04-29',
    reviewer: 'pending',
  },
} as const;

export const SPO2_911_PCT = {
  value: 88,
  unit: '%',
  meta: {
    internal: 'chf-source-of-truth.md §3 (SpO2 — 911)',
    external: 'Oxygen Management in HF Patients, sagepub 2022 (PMC)',
    sourceQuote: 'SpO2 <88% → 911-tier.',
    lastReviewed: '2026-04-29',
    reviewer: 'pending',
  },
} as const;

export const SPO2_DYSPNEA_911_PCT = {
  value: 90,
  unit: '%',
  meta: {
    internal: 'chf-source-of-truth.md §2 Tier 1 / §3 (SpO2 with new dyspnea)',
    external: 'Oxygen Management in HF Patients, sagepub 2022 (PMC)',
    sourceQuote: 'SpO2 <88% OR <90% with new dyspnea.',
    lastReviewed: '2026-04-29',
    reviewer: 'pending',
  },
} as const;

export const RR_HIGH = {
  value: 25,
  unit: 'breaths/min',
  meta: {
    internal: 'chf-source-of-truth.md §3 (RR)',
    external: 'Clinical convention; Oxygen Management in HF Patients, sagepub 2022',
    sourceQuote: 'RR >25 with distress → ER. Normal resting RR: 12–20 breaths/min.',
    lastReviewed: '2026-04-29',
    reviewer: 'pending',
  },
} as const;

export const SODIUM_TARGET_MAX_MG = {
  value: 2000,
  unit: 'mg/day',
  meta: {
    internal: 'chf-source-of-truth.md §3 (Sodium target)',
    external: 'Cleveland Clinic; MedlinePlus; 2022 AHA/ACC/HFSA Guideline',
    sourceQuote:
      '<2000 mg/day (range 1500–2000). Caveat: individualized. 2022 guideline softened from "lower the better."',
    lastReviewed: '2026-04-29',
    reviewer: 'pending',
  },
} as const;

export const FLUID_REFERENCE_MIN_L = {
  value: 1.5,
  unit: 'L/day',
  /** Reference only — actual fluid limit must be set by the cardiologist. */
  isReferenceOnly: true,
  meta: {
    internal: 'chf-source-of-truth.md §3 (Fluid target)',
    external: 'MedlinePlus; ACC March 2025 commentary on HF fluid restriction',
    sourceQuote:
      'Cardiologist-individualized (1.5–2 L/day reference). Do not auto-set. March 2025 ACC: fluid restriction may not be needed for all HF patients.',
    lastReviewed: '2026-04-29',
    reviewer: 'pending',
  },
} as const;

export const FLUID_REFERENCE_MAX_L = {
  value: 2.0,
  unit: 'L/day',
  isReferenceOnly: true,
  meta: {
    internal: 'chf-source-of-truth.md §3 (Fluid target)',
    external: 'MedlinePlus; ACC March 2025 commentary on HF fluid restriction',
    sourceQuote:
      'Cardiologist-individualized (1.5–2 L/day reference). Do not auto-set. March 2025 ACC: fluid restriction may not be needed for all HF patients.',
    lastReviewed: '2026-04-29',
    reviewer: 'pending',
  },
} as const;

// ---------------------------------------------------------------------------
// Observation field shape (consumed by alert engine + voice-log extractor)
// ---------------------------------------------------------------------------

export type ObservationFields = Partial<{
  weight_lb: number;
  systolic_bp: number;
  diastolic_bp: number;
  resting_hr: number;
  spo2: number;
  dyspnea_level: 0 | 1 | 2 | 3 | 4;
  pillow_count: number;
  pnd_episode: boolean;
  cough_present: boolean;
  cough_nocturnal: boolean;
  sputum_color: 'clear' | 'white' | 'pink_frothy';
  swelling_severity: 0 | 1 | 2 | 3 | 4;
  extremities_cold_clammy: boolean;
  cyanosis: boolean;
  chest_pain: boolean;
  syncope: boolean;
  /** Brief = <1 min orthostatic; sustained = lasting/recurring beyond standing. */
  dizziness: 'none' | 'brief' | 'sustained';
  /** True when caregiver reports a new fast/irregular pulse vs baseline. */
  pulse_irregular: boolean;
  appetite_change: 'decreased' | 'unchanged' | 'increased';
  early_satiety: boolean;
  fatigue_level: 0 | 1 | 2 | 3 | 4;
  urine_output_change: 'decreased' | 'unchanged' | 'increased';
  cognition_change: 'none' | 'mild_fog' | 'confusion' | 'severe';
}>;

// ---------------------------------------------------------------------------
// Alert rule shape
//
// `match` is the structured single-observation predicate. For compound rules
// (trend + symptom, multi-field combinations, historical context) `match` is
// omitted and the engine attaches a custom predicate keyed off `id`.
// ---------------------------------------------------------------------------

export type AlertRule = {
  id: string;
  tier: 1 | 2 | 3;
  description: string;
  citation: string;
  match?: ObservationFields;
};

// ---------------------------------------------------------------------------
// Tier 1 — IMMEDIATE 911
// chf-source-of-truth.md §2 Tier 1
// ---------------------------------------------------------------------------

export const TIER_1_RULES: readonly AlertRule[] = [
  {
    id: 'severe_dyspnea_at_rest',
    tier: 1,
    description: 'Severe shortness of breath at rest — struggling to breathe sitting still, can\'t finish a sentence.',
    citation: 'chf-source-of-truth.md §2 Tier 1; Cleveland Clinic Heart Failure Zones',
    match: { dyspnea_level: 4 },
  },
  {
    id: 'pink_frothy_sputum',
    tier: 1,
    description: 'Coughing up pink or white frothy sputum — near-certain flash pulmonary edema.',
    citation:
      'chf-source-of-truth.md §2 Tier 1; AHA HF Warning Signs; Cardiogenic Pulmonary Edema, StatPearls (NBK544260)',
    match: { sputum_color: 'pink_frothy' },
  },
  {
    id: 'new_chest_pain',
    tier: 1,
    description: 'New chest pain or pressure, or pain radiating to arm/jaw — possible MI or ACS.',
    citation: 'chf-source-of-truth.md §2 Tier 1; AHA – When to Call 911',
    match: { chest_pain: true },
  },
  {
    id: 'sudden_confusion',
    tier: 1,
    description:
      'Sudden confusion, slurred speech, or not recognizing family — cerebral hypoperfusion, severe hyponatremia, or stroke.',
    citation:
      'chf-source-of-truth.md §2 Tier 1; Cleveland Clinic HF Zones; HF and cognitive impairment, PMC2684513',
    match: { cognition_change: 'severe' },
  },
  {
    id: 'syncope',
    tier: 1,
    description: 'Fainting / syncope — possible arrhythmia, severe hypotension, or cardiac event.',
    citation: 'chf-source-of-truth.md §2 Tier 1; AHA HF Warning Signs',
    match: { syncope: true },
  },
  {
    id: 'cyanosis',
    tier: 1,
    description: 'Cyanotic lips or fingers (blue/gray) — critical hypoxemia.',
    citation: 'chf-source-of-truth.md §2 Tier 1; Cardiogenic Pulmonary Edema, StatPearls (NBK544260)',
    match: { cyanosis: true },
  },
  {
    id: 'spo2_critical',
    tier: 1,
    description: 'SpO2 below the 911 threshold — severe hypoxemia.',
    // No simple structured match — engine will check spo2 < SPO2_911_PCT.value.
    citation:
      'chf-source-of-truth.md §2 Tier 1; Oxygen Management in HF Patients, sagepub 2022. Engine compares observation.spo2 against SPO2_911_PCT.',
  },
  {
    id: 'spo2_low_with_dyspnea',
    tier: 1,
    description: 'SpO2 <90% with new dyspnea — severe hypoxemia in the setting of acute respiratory symptoms.',
    // Compound rule — engine composes spo2 < SPO2_DYSPNEA_911_PCT.value AND dyspnea_level worsening.
    citation:
      'chf-source-of-truth.md §2 Tier 1; Oxygen Management in HF Patients, sagepub 2022. Compound: SPO2_DYSPNEA_911_PCT + new dyspnea.',
  },
  {
    id: 'new_irregular_pulse_with_chest_pain_or_dizziness',
    tier: 1,
    description:
      'New fast irregular pulse with chest pain or dizziness — possible new AF with rapid ventricular response or VT.',
    // Compound rule — engine composes new-irregularity flag + (chest_pain || dizziness).
    citation:
      'chf-source-of-truth.md §2 Tier 1; AHA – When to Call 911. Compound: new irregularity + (chest_pain || dizziness).',
  },
] as const;

// ---------------------------------------------------------------------------
// Tier 2 — CALL CARDIOLOGIST TODAY
// chf-source-of-truth.md §2 Tier 2
// ---------------------------------------------------------------------------

export const TIER_2_RULES: readonly AlertRule[] = [
  {
    id: 'weight_gain_24h',
    tier: 2,
    description: 'Weight up more than 2 lb in 24 hours — earliest reliable decompensation signal.',
    // Trend rule — engine checks delta over WEIGHT_GAIN_24H_YELLOW_LB.windowHours
    // against WEIGHT_GAIN_24H_YELLOW_LB.value. No single-observation match.
    citation:
      'chf-source-of-truth.md §2 Tier 2 (Rapid weight gain); AHA Managing HF Symptoms; Chaudhry, Circulation 2007. Engine uses WEIGHT_GAIN_24H_YELLOW_LB.',
  },
  {
    id: 'weight_gain_48h',
    tier: 2,
    description: 'Weight up more than 3 lb in 48 hours.',
    citation:
      'chf-source-of-truth.md §2 Tier 2; ESC / Heart Failure Matters (>2 kg / 3 lb in 3 days). Engine uses WEIGHT_GAIN_48H_YELLOW_LB.',
  },
  {
    id: 'weight_gain_7d',
    tier: 2,
    description: 'Weight up more than 5 lb in 7 days.',
    citation:
      'chf-source-of-truth.md §2 Tier 2; AHA Managing HF Symptoms; Kaiser Permanente. Engine uses WEIGHT_GAIN_7D_YELLOW_LB.',
  },
  {
    id: 'new_or_worsened_orthopnea',
    tier: 2,
    description: 'New or worsening orthopnea — needing more pillows than last week to breathe lying down.',
    // Trend rule — engine compares pillow_count to rolling baseline.
    citation:
      'chf-source-of-truth.md §2 Tier 2; Dyspnea, Orthopnea, PND – NCBI Clinical Methods (NBK213). Engine compares pillow_count vs rolling baseline.',
  },
  {
    id: 'pnd_episode',
    tier: 2,
    description: 'Any paroxysmal nocturnal dyspnea (PND) episode in the last 48 hours.',
    citation: 'chf-source-of-truth.md §2 Tier 2; Dyspnea, Orthopnea, PND – NCBI Clinical Methods (NBK213)',
    match: { pnd_episode: true },
  },
  {
    id: 'new_or_worsened_swelling',
    tier: 2,
    description:
      'New or markedly worsened peripheral or abdominal swelling — socks leaving deep marks, shoes not fitting, distended belly.',
    // Trend rule — engine compares swelling_severity step-change vs baseline.
    citation:
      'chf-source-of-truth.md §2 Tier 2; AHA Physical Changes to Report; AAFP Peripheral Edema 2022. Engine compares swelling_severity vs baseline.',
  },
  {
    id: 'step_change_dyspnea_on_exertion',
    tier: 2,
    description: 'Step-change worsening of dyspnea on exertion (NYHA creep) — used to walk fine, now stops to catch breath.',
    // Trend rule — engine compares dyspnea_level step-change vs baseline.
    citation:
      'chf-source-of-truth.md §2 Tier 2; AHA – Classes of Heart Failure. Engine compares dyspnea_level step-change vs baseline.',
  },
  {
    id: 'new_persistent_nocturnal_cough',
    tier: 2,
    description:
      'New persistent nocturnal cough — dry hacking cough worse when lying down. Often mistaken for cold or ACE-I side effect.',
    citation: 'chf-source-of-truth.md §2 Tier 2; AHA HF Warning Signs',
    match: { cough_present: true, cough_nocturnal: true },
  },
  {
    id: 'decreased_urine_output',
    tier: 2,
    description: 'Notable decrease in urine output — barely going to the bathroom today.',
    citation:
      'chf-source-of-truth.md §2 Tier 2; Oliguria, Cleveland Clinic; Renal Function Monitoring in HF, PMC5736847',
    match: { urine_output_change: 'decreased' },
  },
  {
    id: 'sbp_low_with_symptoms',
    tier: 2,
    description:
      'SBP <90 with dizziness, confusion, or cool clammy extremities — hypoperfusion, possible over-diuresis.',
    // Compound rule — engine composes SBP < SBP_LOW_MMHG.value AND any of
    // {dizziness, mild_fog/confusion, extremities_cold_clammy}.
    citation:
      'chf-source-of-truth.md §2 Tier 2; Management of low BP in HFrEF, PMC7540603. Compound: SBP_LOW_MMHG + symptom flag.',
  },
  {
    id: 'resting_hr_high_or_low_with_symptoms',
    tier: 2,
    description:
      'Resting heart rate persistently >100 OR <50 with symptoms — tachycardia from decompensation/new arrhythmia, or over-beta-blockade.',
    // Compound rule — engine composes (resting_hr > HR_HIGH_BPM.value OR
    // resting_hr < HR_LOW_BPM.value) AND any symptom flag.
    citation:
      'chf-source-of-truth.md §2 Tier 2; 2022 AHA/ACC/HFSA Guideline. Compound: HR_HIGH_BPM/HR_LOW_BPM + symptom.',
  },
  // NOTE: A "cold/clammy extremities + fatigue" rule was removed during review.
  // It exists in research/01-clinical-thresholds.md §2 Tier 2 but is NOT a bullet
  // in chf-source-of-truth.md §2 Tier 2. The contract for this file is that the
  // curated source-of-truth is canonical. If clinical reviewer wants it as a
  // Tier 2 trigger, promote the bullet into source-of-truth.md §2 first, then
  // re-add here.
  {
    id: 'new_persistent_nausea_or_early_satiety',
    tier: 2,
    description:
      'New nausea, early satiety, or appetite loss persisting more than 24 hours — hepatic/gut congestion from right-sided HF.',
    // Compound — engine composes (appetite_change === 'decreased' OR early_satiety === true) + duration > 24 h.
    citation:
      'chf-source-of-truth.md §2 Tier 2; AHA Physical Changes to Report. Compound: appetite_change=decreased OR early_satiety=true + duration > 24 h.',
  },
  {
    id: 'mild_new_confusion_or_lethargy',
    tier: 2,
    description:
      'Mild new confusion, forgetfulness, or lethargy — early cerebral hypoperfusion or possible hyponatremia.',
    // Source-of-truth.md §2 Tier 2 lists this as a single bullet. The
    // observation enum splits it across `mild_fog` and `confusion`; that split
    // belongs in the engine's predicate composition, not the data layer.
    // Engine fires when cognition_change ∈ {'mild_fog', 'confusion'}.
    citation:
      'chf-source-of-truth.md §2 Tier 2; HF and cognitive impairment, PMC2684513. Engine composes: cognition_change in {mild_fog, confusion}.',
  },
  {
    id: 'resting_hr_very_high',
    tier: 2,
    description: 'Resting heart rate >120 bpm at rest.',
    // Engine compares resting_hr against HR_VERY_HIGH_BPM.value. Listed as a
    // standalone Tier 2 trigger in chf-source-of-truth.md §2.
    citation:
      'chf-source-of-truth.md §2 Tier 2 (HR >120 bpm at rest – Cleveland Clinic threshold). Engine uses HR_VERY_HIGH_BPM.',
  },
] as const;

// ---------------------------------------------------------------------------
// Tier 3 — CALL WITHIN 48 HOURS
// chf-source-of-truth.md §2 Tier 3
// ---------------------------------------------------------------------------

export const TIER_3_RULES: readonly AlertRule[] = [
  {
    id: 'weight_gain_trend_3day',
    tier: 3,
    description:
      'Weight up 1–2 lb per day for 3 or more consecutive days — sub-Tier-2 magnitude but trending; precedes overt decompensation by ~30 days in Chaudhry data.',
    // Trend rule — engine checks rolling 3-day daily-delta sequence.
    citation:
      'chf-source-of-truth.md §2 Tier 3; Chaudhry, Circulation 2007. Engine checks rolling 3-day daily-delta sequence.',
  },
  {
    id: 'step_change_fatigue_or_napping',
    tier: 3,
    description:
      'Step-change in fatigue or napping pattern — more naps than usual, more tired than usual. Possible falling stroke volume or NYHA creep.',
    // Trend rule — engine compares fatigue_level step-change vs baseline.
    citation:
      'chf-source-of-truth.md §2 Tier 3; Cleveland Clinic HF Zones. Engine compares fatigue_level step-change vs baseline.',
  },
  {
    id: 'mild_evening_only_swelling',
    tier: 3,
    description:
      'Mild swelling that appears in the evening but resolves with elevation overnight — early fluid retention still caught in time.',
    // Trend / pattern rule — engine evaluates evening swelling that resolves
    // by morning (logged swelling_severity diurnal pattern).
    citation:
      'chf-source-of-truth.md §2 Tier 3; AAFP Peripheral Edema 2022. Engine evaluates diurnal swelling pattern.',
  },
  {
    id: 'brief_orthostatic_dizziness',
    tier: 3,
    description:
      'Brief orthostatic dizziness lasting under a minute, no fall — possible over-diuresis, orthostasis, or arrhythmia.',
    // Compound — engine flags brief dizziness episode (<1 min) without syncope.
    citation:
      'chf-source-of-truth.md §2 Tier 3; Cleveland Clinic HF Zones. Compound: brief dizziness episode (<1 min) AND syncope=false.',
  },
] as const;

// ---------------------------------------------------------------------------
// NYHA functional classes
// chf-source-of-truth.md §4 (verbatim AHA definitions)
// ---------------------------------------------------------------------------

export type NyhaClass = 'I' | 'II' | 'III' | 'IV';

export const NYHA_CLASSES: Record<
  NyhaClass,
  { definition: string; caregiverObservation: string; meta: ThresholdMeta }
> = {
  I: {
    definition:
      'No limitation of physical activity. Ordinary physical activity does not cause undue fatigue, palpitation or shortness of breath.',
    caregiverObservation:
      'Walks stairs, groceries, holds conversation — no symptoms.',
    meta: {
      internal: 'chf-source-of-truth.md §4 (NYHA Class I)',
      external: 'AHA – Classes and Stages of Heart Failure',
      sourceQuote:
        'No limitation of physical activity. Ordinary physical activity does not cause undue fatigue, palpitation or shortness of breath.',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },
  II: {
    definition:
      'Slight limitation of physical activity. Comfortable at rest. Ordinary physical activity results in fatigue, palpitation, shortness of breath or chest pain.',
    caregiverObservation:
      'Stairs or grocery trips cause her to pause for breath; fine sitting.',
    meta: {
      internal: 'chf-source-of-truth.md §4 (NYHA Class II)',
      external: 'AHA – Classes and Stages of Heart Failure',
      sourceQuote:
        'Slight limitation of physical activity. Comfortable at rest. Ordinary physical activity results in fatigue, palpitation, shortness of breath or chest pain.',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },
  III: {
    definition:
      'Marked limitation of physical activity. Comfortable at rest. Less than ordinary activity causes fatigue, palpitation, shortness of breath or chest pain.',
    caregiverObservation:
      'Walking to the bathroom or making a sandwich leaves her winded; still fine in the recliner.',
    meta: {
      internal: 'chf-source-of-truth.md §4 (NYHA Class III)',
      external: 'AHA – Classes and Stages of Heart Failure',
      sourceQuote:
        'Marked limitation of physical activity. Comfortable at rest. Less than ordinary activity causes fatigue, palpitation, shortness of breath or chest pain.',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },
  IV: {
    definition:
      'Symptoms of heart failure at rest. Any physical activity causes further discomfort.',
    caregiverObservation:
      'Short of breath sitting; can\'t sleep flat; any movement worsens symptoms.',
    meta: {
      internal: 'chf-source-of-truth.md §4 (NYHA Class IV)',
      external: 'AHA – Classes and Stages of Heart Failure',
      sourceQuote:
        'Symptoms of heart failure at rest. Any physical activity causes further discomfort.',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },
};
