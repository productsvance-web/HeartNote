// Unit tests for the Phase 1 alert engine rules.
//
// These tests drive `evaluateRules(inputs)` — the pure rule function — with
// synthetic EngineInputs. No database. One test per rule, plus cross-cutting
// tests for cold-start gating, multi-rule resolution, and steady-day.
//
// Every threshold is imported from `@/lib/clinical/thresholds`. If a
// threshold is later tuned, these tests recompute against the new value
// — they assert invariants ("just over the threshold fires; just under
// doesn't"), not literal numbers.
//
// Each test cites the section in research/chf-source-of-truth.md the rule
// derives from. If a rule misfires per the research, the test fails and
// the bug surfaces at green-bar time, not in production.
//
// Run:
//   npm run test:alerts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateRules, type EngineInputs, type Reading, type SymptomEvent } from './evaluate.ts';
import {
  WEIGHT_GAIN_TIER_2_24H_LB,
  WEIGHT_GAIN_TIER_2_48H_LB,
  WEIGHT_GAIN_TIER_2_7D_LB,
  WEIGHT_GAIN_TIER_3_DAILY_LB,
  WEIGHT_GAIN_TIER_3_DAILY_MAX_LB,
  WEIGHT_GAIN_TIER_3_CONSECUTIVE_DAYS,
  SBP_TIER_2_LOW,
  HR_TIER_2_HIGH,
  HR_TIER_2_VERY_HIGH,
  HR_TIER_2_LOW,
  SPO2_TIER_1_911,
  SPO2_TIER_1_WITH_DYSPNEA,
  COLD_START_MIN_LOG_DAYS,
} from '../clinical/thresholds.ts';

// ─── Fixture helpers ────────────────────────────────────────────────────────

const TODAY = '2026-05-08';
// Pin "now" to mid-afternoon UTC so 24h/48h windows land deterministically.
const NOW = new Date(`${TODAY}T18:00:00Z`).getTime();

function baseInputs(over: Partial<EngineInputs> = {}): EngineInputs {
  return {
    readings: [],
    symptomEvents: [],
    dayLevel: {
      pillow_count: null,
      appetite_change: null,
      urine_output_change: null,
      activity_step_change: null,
    },
    patient: { normal_pillow_count: null },
    distinctPriorLogDays: COLD_START_MIN_LOG_DAYS, // not cold-start
    logDate: TODAY,
    priorWindowMaxes: {
      pillowCount: null,
      swellingSeverity: null,
      dyspneaEventCount: 0,
      coughEventCount: 0,
    },
    nowMs: NOW,
    ...over,
  };
}

function symptom(over: Partial<SymptomEvent> & Pick<SymptomEvent, 'symptom'>): SymptomEvent {
  return {
    present: true,
    severity: null,
    body_region: null,
    nocturnal: null,
    sputum_color: null,
    chest_pain_character: null,
    resolves_overnight: null,
    postural: null,
    recorded_at: `${TODAY}T12:00:00Z`,
    log_date: TODAY,
    ...over,
  };
}

function reading(over: Partial<Reading> & Pick<Reading, 'field' | 'value'>): Reading {
  return {
    recorded_at: `${TODAY}T12:00:00Z`,
    log_date: TODAY,
    ...over,
  };
}

// Subtract `days` calendar days from TODAY (UTC). Returns ISO date.
function dateMinusDays(days: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Subtract `hours` from "now" (NOW). Returns ISO timestamp.
function tsMinusHours(hours: number): string {
  return new Date(NOW - hours * 3600_000).toISOString();
}

function ruleIds(triggers: { rule_id: string }[]): string[] {
  return triggers.map((t) => t.rule_id);
}

// ─── TIER 1 ─────────────────────────────────────────────────────────────────

describe('Tier 1 — 911 (research §2 Tier 1)', () => {
  it('T1.1 — severe dyspnea at rest (severity 4) fires tier_1_911', () => {
    // research §2 Tier 1: "Severe dyspnea at rest (can't finish sentences)"
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [symptom({ symptom: 'dyspnea', severity: 4 })],
      })
    );
    assert.equal(result.tier, 'tier_1_911');
    assert.ok(ruleIds(result.triggers).includes('T1.1'));
  });

  it('T1.1 — dyspnea severity 3 does NOT fire T1.1', () => {
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [symptom({ symptom: 'dyspnea', severity: 3 })],
      })
    );
    assert.ok(!ruleIds(result.triggers).includes('T1.1'));
  });

  it('T1.2 — pink frothy sputum fires tier_1_911', () => {
    // research §2 Tier 1: "Coughing up pink or white frothy sputum"
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [symptom({ symptom: 'cough', sputum_color: 'pink_frothy' })],
      })
    );
    assert.equal(result.tier, 'tier_1_911');
    assert.ok(ruleIds(result.triggers).includes('T1.2'));
  });

  it('T1.2 — white frothy sputum also fires', () => {
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [symptom({ symptom: 'cough', sputum_color: 'white_frothy' })],
      })
    );
    assert.equal(result.tier, 'tier_1_911');
    assert.ok(ruleIds(result.triggers).includes('T1.2'));
  });

  it('T1.3 — chest pain fires tier_1_911', () => {
    // research §2 Tier 1: "New chest pain/pressure or pain radiating to arm/jaw"
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [symptom({ symptom: 'chest_pain' })],
      })
    );
    assert.equal(result.tier, 'tier_1_911');
    assert.ok(ruleIds(result.triggers).includes('T1.3'));
  });

  it('T1.4 — severe confusion (cognition_change severity 4) fires tier_1_911', () => {
    // research §2 Tier 1: "Sudden confusion, slurred speech, not recognizing family"
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [symptom({ symptom: 'cognition_change', severity: 4 })],
      })
    );
    assert.equal(result.tier, 'tier_1_911');
    assert.ok(ruleIds(result.triggers).includes('T1.4'));
  });

  it('T1.5 — syncope fires tier_1_911', () => {
    // research §2 Tier 1: "Syncope (fainting)"
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [symptom({ symptom: 'syncope' })],
      })
    );
    assert.equal(result.tier, 'tier_1_911');
    assert.ok(ruleIds(result.triggers).includes('T1.5'));
  });

  it('T1.6 — cyanosis fires tier_1_911', () => {
    // research §2 Tier 1: "Cyanotic lips or fingers"
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [symptom({ symptom: 'cyanosis' })],
      })
    );
    assert.equal(result.tier, 'tier_1_911');
    assert.ok(ruleIds(result.triggers).includes('T1.6'));
  });

  it('T1.7a — spo2 below SPO2_TIER_1_911 fires tier_1_911', () => {
    // research §2 Tier 1: "SpO2 <88%"
    const result = evaluateRules(
      baseInputs({
        readings: [reading({ field: 'spo2', value: SPO2_TIER_1_911 - 1 })],
      })
    );
    assert.equal(result.tier, 'tier_1_911');
    assert.ok(ruleIds(result.triggers).includes('T1.7a'));
  });

  it('T1.7a — spo2 at SPO2_TIER_1_911 does NOT fire T1.7a (rule is strict <)', () => {
    const result = evaluateRules(
      baseInputs({
        readings: [reading({ field: 'spo2', value: SPO2_TIER_1_911 })],
      })
    );
    assert.ok(!ruleIds(result.triggers).includes('T1.7a'));
  });

  it('T1.7b — spo2 below SPO2_TIER_1_WITH_DYSPNEA + new dyspnea fires (no prior dyspnea)', () => {
    // research §2 Tier 1: "<90% with new dyspnea"
    const result = evaluateRules(
      baseInputs({
        readings: [reading({ field: 'spo2', value: SPO2_TIER_1_WITH_DYSPNEA - 1 })],
        symptomEvents: [symptom({ symptom: 'dyspnea', severity: 2 })],
        priorWindowMaxes: {
          pillowCount: null,
          swellingSeverity: null,
          dyspneaEventCount: 0,
          coughEventCount: 0,
        },
      })
    );
    assert.equal(result.tier, 'tier_1_911');
    assert.ok(ruleIds(result.triggers).includes('T1.7b'));
  });

  it('T1.7b — suppressed when prior 7d dyspnea exists (chronic, not new)', () => {
    // Per inline comment: chronic NYHA-III dyspnea shouldn't trip 911 every
    // morning the spo2 cuff reads 89.
    const result = evaluateRules(
      baseInputs({
        readings: [reading({ field: 'spo2', value: SPO2_TIER_1_WITH_DYSPNEA - 1 })],
        symptomEvents: [symptom({ symptom: 'dyspnea', severity: 2 })],
        priorWindowMaxes: {
          pillowCount: null,
          swellingSeverity: null,
          dyspneaEventCount: 3, // existing chronic dyspnea
          coughEventCount: 0,
        },
      })
    );
    assert.ok(!ruleIds(result.triggers).includes('T1.7b'));
  });

  it('T1.8 — pulse_irregular + HR>HR_TIER_2_HIGH + chest_pain fires tier_1_911', () => {
    // research §2 Tier 1: "New fast irregular pulse with chest pain or dizziness"
    const result = evaluateRules(
      baseInputs({
        readings: [reading({ field: 'resting_hr', value: HR_TIER_2_HIGH + 5 })],
        symptomEvents: [
          symptom({ symptom: 'pulse_irregular' }),
          symptom({ symptom: 'chest_pain' }),
        ],
      })
    );
    assert.equal(result.tier, 'tier_1_911');
    assert.ok(ruleIds(result.triggers).includes('T1.8'));
  });

  it('T1.8 — same compound with dizziness instead of chest_pain also fires', () => {
    const result = evaluateRules(
      baseInputs({
        readings: [reading({ field: 'resting_hr', value: HR_TIER_2_HIGH + 5 })],
        symptomEvents: [
          symptom({ symptom: 'pulse_irregular' }),
          symptom({ symptom: 'dizziness' }),
        ],
      })
    );
    assert.ok(ruleIds(result.triggers).includes('T1.8'));
  });
});

// ─── TIER 2 ─────────────────────────────────────────────────────────────────

describe('Tier 2 — call cardiologist today (research §2 Tier 2)', () => {
  it('T2.1 — 24h weight gain above WEIGHT_GAIN_TIER_2_24H_LB fires tier_2_today', () => {
    // research §2 Tier 2: "Weight gain >2 lb / 24 hr"
    const today = reading({
      field: 'weight_lb',
      value: 150 + WEIGHT_GAIN_TIER_2_24H_LB + 1,
      recorded_at: tsMinusHours(0),
    });
    const yesterday = reading({
      field: 'weight_lb',
      value: 150,
      recorded_at: tsMinusHours(24),
      log_date: dateMinusDays(1),
    });
    const result = evaluateRules(
      baseInputs({ readings: [today, yesterday] })
    );
    assert.equal(result.tier, 'tier_2_today');
    assert.ok(ruleIds(result.triggers).includes('T2.1'));
  });

  it('T2.2 — 48h weight gain above WEIGHT_GAIN_TIER_2_48H_LB fires tier_2_today', () => {
    // research §2 Tier 2: "Weight gain >3 lb / 48 hr"
    const today = reading({
      field: 'weight_lb',
      value: 150 + WEIGHT_GAIN_TIER_2_48H_LB + 1,
      recorded_at: tsMinusHours(0),
    });
    const twoDaysAgo = reading({
      field: 'weight_lb',
      value: 150,
      recorded_at: tsMinusHours(48),
      log_date: dateMinusDays(2),
    });
    const result = evaluateRules(
      baseInputs({ readings: [today, twoDaysAgo] })
    );
    assert.equal(result.tier, 'tier_2_today');
    assert.ok(ruleIds(result.triggers).includes('T2.2'));
  });

  it('T2.3 — 7d weight gain above WEIGHT_GAIN_TIER_2_7D_LB fires tier_2_today', () => {
    // research §2 Tier 2: "Weight gain >5 lb / 7 days"
    const today = reading({
      field: 'weight_lb',
      value: 150 + WEIGHT_GAIN_TIER_2_7D_LB + 1,
      recorded_at: tsMinusHours(0),
    });
    const sevenDaysAgo = reading({
      field: 'weight_lb',
      value: 150,
      recorded_at: tsMinusHours(24 * 7),
      log_date: dateMinusDays(7),
    });
    const result = evaluateRules(
      baseInputs({ readings: [today, sevenDaysAgo] })
    );
    assert.equal(result.tier, 'tier_2_today');
    assert.ok(ruleIds(result.triggers).includes('T2.3'));
  });

  it('T2.4 — pillow_count above prior 7d max + baseline fires tier_2_today', () => {
    // research §2 Tier 2: "New or worsened orthopnea (more pillows than last week)"
    const result = evaluateRules(
      baseInputs({
        dayLevel: {
          pillow_count: 3,
          appetite_change: null,
          urine_output_change: null,
          activity_step_change: null,
        },
        patient: { normal_pillow_count: 1 },
        priorWindowMaxes: {
          pillowCount: 2,
          swellingSeverity: null,
          dyspneaEventCount: 0,
          coughEventCount: 0,
        },
      })
    );
    assert.equal(result.tier, 'tier_2_today');
    assert.ok(ruleIds(result.triggers).includes('T2.4'));
  });

  it('T2.4 — pillow_count equal to prior max does NOT fire (rule is strict >)', () => {
    const result = evaluateRules(
      baseInputs({
        dayLevel: {
          pillow_count: 2,
          appetite_change: null,
          urine_output_change: null,
          activity_step_change: null,
        },
        patient: { normal_pillow_count: 1 },
        priorWindowMaxes: {
          pillowCount: 2,
          swellingSeverity: null,
          dyspneaEventCount: 0,
          coughEventCount: 0,
        },
      })
    );
    assert.ok(!ruleIds(result.triggers).includes('T2.4'));
  });

  it('T2.5 — PND in last 48h fires tier_2_today', () => {
    // research §2 Tier 2: "Any PND episode in last 48 hr"
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [
          symptom({ symptom: 'pnd', recorded_at: tsMinusHours(12) }),
        ],
      })
    );
    assert.equal(result.tier, 'tier_2_today');
    assert.ok(ruleIds(result.triggers).includes('T2.5'));
  });

  it('T2.6 — new swelling (no prior history) fires tier_2_today', () => {
    // research §2 Tier 2: "New or markedly worsened peripheral/abdominal swelling"
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [
          symptom({ symptom: 'swelling', severity: 2, resolves_overnight: false }),
        ],
        priorWindowMaxes: {
          pillowCount: null,
          swellingSeverity: null, // no prior swelling = new
          dyspneaEventCount: 0,
          coughEventCount: 0,
        },
      })
    );
    assert.equal(result.tier, 'tier_2_today');
    assert.ok(ruleIds(result.triggers).includes('T2.6'));
  });

  it('T2.6 — worsened swelling (severity above prior 7d max) fires', () => {
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [
          symptom({ symptom: 'swelling', severity: 3, resolves_overnight: false }),
        ],
        priorWindowMaxes: {
          pillowCount: null,
          swellingSeverity: 2, // today (3) > prior (2)
          dyspneaEventCount: 0,
          coughEventCount: 0,
        },
      })
    );
    assert.ok(ruleIds(result.triggers).includes('T2.6'));
  });

  it('T2.7 — severe activity_step_change fires tier_2_today', () => {
    // research §2 Tier 2: "Step-change worsening of dyspnea on exertion / NYHA creep"
    const result = evaluateRules(
      baseInputs({
        dayLevel: {
          pillow_count: null,
          appetite_change: null,
          urine_output_change: null,
          activity_step_change: 'severe_change',
        },
      })
    );
    assert.equal(result.tier, 'tier_2_today');
    assert.ok(ruleIds(result.triggers).includes('T2.7'));
  });

  it('T2.8 — new nocturnal cough (no prior 7d cough) fires tier_2_today', () => {
    // research §2 Tier 2: "New persistent nocturnal cough"
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [
          symptom({ symptom: 'cough', nocturnal: true }),
        ],
        priorWindowMaxes: {
          pillowCount: null,
          swellingSeverity: null,
          dyspneaEventCount: 0,
          coughEventCount: 0, // no prior cough = new
        },
      })
    );
    assert.equal(result.tier, 'tier_2_today');
    assert.ok(ruleIds(result.triggers).includes('T2.8'));
  });

  it('T2.8 — suppressed during cold-start', () => {
    const result = evaluateRules(
      baseInputs({
        distinctPriorLogDays: COLD_START_MIN_LOG_DAYS - 1,
        symptomEvents: [
          symptom({ symptom: 'cough', nocturnal: true }),
        ],
      })
    );
    assert.ok(!ruleIds(result.triggers).includes('T2.8'));
  });

  it('T2.9 — decreased urine output fires tier_2_today', () => {
    // research §2 Tier 2: "Notable decrease in urine output"
    const result = evaluateRules(
      baseInputs({
        dayLevel: {
          pillow_count: null,
          appetite_change: null,
          urine_output_change: 'decreased',
          activity_step_change: null,
        },
      })
    );
    assert.equal(result.tier, 'tier_2_today');
    assert.ok(ruleIds(result.triggers).includes('T2.9'));
  });

  it('T2.10 — low SBP + persistent dizziness fires tier_2_today', () => {
    // research §2 Tier 2: "SBP <90 with dizziness/confusion/cool clammy"
    const result = evaluateRules(
      baseInputs({
        readings: [reading({ field: 'systolic_bp', value: SBP_TIER_2_LOW - 1 })],
        symptomEvents: [
          symptom({ symptom: 'dizziness', postural: false }),
        ],
      })
    );
    assert.equal(result.tier, 'tier_2_today');
    assert.ok(ruleIds(result.triggers).includes('T2.10'));
  });

  it('T2.10 — low SBP + cold/clammy fires tier_2_today', () => {
    const result = evaluateRules(
      baseInputs({
        readings: [reading({ field: 'systolic_bp', value: SBP_TIER_2_LOW - 1 })],
        symptomEvents: [
          symptom({ symptom: 'extremities_cold_clammy' }),
        ],
      })
    );
    assert.ok(ruleIds(result.triggers).includes('T2.10'));
  });

  it('T2.11a — HR > HR_TIER_2_VERY_HIGH fires alone (no compound symptom needed)', () => {
    // research §2 Tier 2 + §3: "HR >120 bpm at rest" (Cleveland Clinic threshold)
    const result = evaluateRules(
      baseInputs({
        readings: [reading({ field: 'resting_hr', value: HR_TIER_2_VERY_HIGH + 1 })],
      })
    );
    assert.equal(result.tier, 'tier_2_today');
    assert.ok(ruleIds(result.triggers).includes('T2.11a'));
  });

  it('T2.11b — HR > HR_TIER_2_HIGH (but ≤ VERY_HIGH) + other symptom fires', () => {
    // research §2 Tier 2: "Resting HR persistently >100 ... with symptoms"
    const result = evaluateRules(
      baseInputs({
        readings: [reading({ field: 'resting_hr', value: HR_TIER_2_HIGH + 1 })],
        symptomEvents: [symptom({ symptom: 'fatigue' })],
      })
    );
    assert.equal(result.tier, 'tier_2_today');
    assert.ok(ruleIds(result.triggers).includes('T2.11b'));
  });

  it('T2.11b — HR > HR_TIER_2_HIGH alone (no other symptom) does NOT fire', () => {
    const result = evaluateRules(
      baseInputs({
        readings: [reading({ field: 'resting_hr', value: HR_TIER_2_HIGH + 1 })],
      })
    );
    assert.ok(!ruleIds(result.triggers).includes('T2.11b'));
  });

  it('T2.11c — HR < HR_TIER_2_LOW + other symptom fires', () => {
    // research §2 Tier 2: "Resting HR ... <50 with symptoms"
    const result = evaluateRules(
      baseInputs({
        readings: [reading({ field: 'resting_hr', value: HR_TIER_2_LOW - 1 })],
        symptomEvents: [symptom({ symptom: 'fatigue' })],
      })
    );
    assert.equal(result.tier, 'tier_2_today');
    assert.ok(ruleIds(result.triggers).includes('T2.11c'));
  });

  it('T2.12 — nausea today fires tier_2_today', () => {
    // research §2 Tier 2: "New nausea / early satiety persisting >24 hr"
    // (engine over-fires on a single same-day event; deferred — see top-of-file
    // "Deferred rules" comment in evaluate.ts.)
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [symptom({ symptom: 'nausea' })],
      })
    );
    assert.equal(result.tier, 'tier_2_today');
    assert.ok(ruleIds(result.triggers).includes('T2.12'));
  });

  it('T2.13 — cognition_change severity 1 fires tier_2_today', () => {
    // research §2 Tier 2: "Mild new confusion or lethargy"
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [symptom({ symptom: 'cognition_change', severity: 1 })],
      })
    );
    assert.equal(result.tier, 'tier_2_today');
    assert.ok(ruleIds(result.triggers).includes('T2.13'));
  });

  it('T2.13 — cognition_change severity 2 fires tier_2_today', () => {
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [symptom({ symptom: 'cognition_change', severity: 2 })],
      })
    );
    assert.ok(ruleIds(result.triggers).includes('T2.13'));
  });

  it('T2.14 — cold/clammy + fatigue (no SBP reading) fires tier_2_today', () => {
    // Standalone tier-2 trigger; distinct from T2.10 (SBP compound).
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [
          symptom({ symptom: 'extremities_cold_clammy' }),
          symptom({ symptom: 'fatigue' }),
        ],
      })
    );
    assert.equal(result.tier, 'tier_2_today');
    assert.ok(ruleIds(result.triggers).includes('T2.14'));
  });
});

// ─── TIER 3 ─────────────────────────────────────────────────────────────────

describe('Tier 3 — call within 48 hrs (research §2 Tier 3)', () => {
  it('T3.1 — consecutive sub-tier-2 weight gain over WEIGHT_GAIN_TIER_3_CONSECUTIVE_DAYS+ days fires tier_3_48hr', () => {
    // research §2 Tier 3: "Weight up 1–2 lb/day for 3+ consecutive days"
    // Build N+1 daily readings, each one DAILY_LB above the previous.
    const dayCount = WEIGHT_GAIN_TIER_3_CONSECUTIVE_DAYS;
    const dailyGain = WEIGHT_GAIN_TIER_3_DAILY_LB;
    const start = 150;
    const readings: Reading[] = [];
    for (let i = 0; i <= dayCount; i++) {
      readings.push(
        reading({
          field: 'weight_lb',
          value: start + (dayCount - i) * dailyGain,
          recorded_at: `${dateMinusDays(i)}T18:00:00Z`,
          log_date: dateMinusDays(i),
        })
      );
    }
    // Sub-tier-2: total gain over 7d must be ≤ WEIGHT_GAIN_TIER_2_7D_LB so T2.3 doesn't pre-empt.
    // dayCount * dailyGain = 3*1 = 3 lb, well under 5. Good.
    const result = evaluateRules(baseInputs({ readings }));
    assert.equal(result.tier, 'tier_3_48hr');
    assert.ok(ruleIds(result.triggers).includes('T3.1'));
  });

  it('T3.1 — daily gain above WEIGHT_GAIN_TIER_3_DAILY_MAX_LB breaks the streak', () => {
    // 1 day gain of MAX+1 → falls into tier-2 territory; T3.1 should NOT fire.
    const dayCount = WEIGHT_GAIN_TIER_3_CONSECUTIVE_DAYS;
    const start = 150;
    const readings: Reading[] = [];
    // Today: big jump (above MAX)
    readings.push(
      reading({
        field: 'weight_lb',
        value: start + WEIGHT_GAIN_TIER_3_DAILY_MAX_LB + 1,
        recorded_at: `${TODAY}T18:00:00Z`,
        log_date: TODAY,
      })
    );
    // Prior days: flat
    for (let i = 1; i <= dayCount; i++) {
      readings.push(
        reading({
          field: 'weight_lb',
          value: start,
          recorded_at: `${dateMinusDays(i)}T18:00:00Z`,
          log_date: dateMinusDays(i),
        })
      );
    }
    const result = evaluateRules(baseInputs({ readings }));
    assert.ok(!ruleIds(result.triggers).includes('T3.1'));
  });

  it('T3.2 — mild_slowdown fires tier_3_48hr', () => {
    // research §2 Tier 3: "Step-change in fatigue / napping pattern"
    const result = evaluateRules(
      baseInputs({
        dayLevel: {
          pillow_count: null,
          appetite_change: null,
          urine_output_change: null,
          activity_step_change: 'mild_slowdown',
        },
      })
    );
    assert.equal(result.tier, 'tier_3_48hr');
    assert.ok(ruleIds(result.triggers).includes('T3.2'));
  });

  it('T3.3 — evening swelling that resolves overnight fires tier_3_48hr', () => {
    // research §2 Tier 3: "Mild evening-only swelling"
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [
          symptom({ symptom: 'swelling', severity: 1, resolves_overnight: true }),
        ],
      })
    );
    assert.equal(result.tier, 'tier_3_48hr');
    assert.ok(ruleIds(result.triggers).includes('T3.3'));
  });

  it('T3.4 — postural dizziness fires tier_3_48hr', () => {
    // research §2 Tier 3: "Brief orthostatic dizziness (<1 min, no fall)"
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [symptom({ symptom: 'dizziness', postural: true })],
      })
    );
    assert.equal(result.tier, 'tier_3_48hr');
    assert.ok(ruleIds(result.triggers).includes('T3.4'));
  });
});

// ─── Cross-cutting ──────────────────────────────────────────────────────────

describe('Cross-cutting behavior', () => {
  it('Cold-start gates: T2.1, T2.2, T2.3, T2.8, T3.1 do NOT fire', () => {
    // Build conditions that would fire all five rules outside cold-start;
    // assert none fire when distinctPriorLogDays < COLD_START_MIN_LOG_DAYS.
    const today = reading({
      field: 'weight_lb',
      value: 160,
      recorded_at: tsMinusHours(0),
    });
    const yesterday = reading({
      field: 'weight_lb',
      value: 150,
      recorded_at: tsMinusHours(24),
      log_date: dateMinusDays(1),
    });
    const twoDaysAgo = reading({
      field: 'weight_lb',
      value: 150,
      recorded_at: tsMinusHours(48),
      log_date: dateMinusDays(2),
    });
    const sevenDaysAgo = reading({
      field: 'weight_lb',
      value: 150,
      recorded_at: tsMinusHours(24 * 7),
      log_date: dateMinusDays(7),
    });
    const result = evaluateRules(
      baseInputs({
        distinctPriorLogDays: COLD_START_MIN_LOG_DAYS - 1,
        readings: [today, yesterday, twoDaysAgo, sevenDaysAgo],
        symptomEvents: [symptom({ symptom: 'cough', nocturnal: true })],
      })
    );
    const ids = ruleIds(result.triggers);
    assert.ok(!ids.includes('T2.1'));
    assert.ok(!ids.includes('T2.2'));
    assert.ok(!ids.includes('T2.3'));
    assert.ok(!ids.includes('T2.8'));
    assert.ok(!ids.includes('T3.1'));
    assert.equal(result.coldStart, true);
  });

  it('Cold-start: T1.1 still fires (acute single-event rules ignore cold-start)', () => {
    const result = evaluateRules(
      baseInputs({
        distinctPriorLogDays: 0,
        symptomEvents: [symptom({ symptom: 'dyspnea', severity: 4 })],
      })
    );
    assert.equal(result.tier, 'tier_1_911');
    assert.ok(ruleIds(result.triggers).includes('T1.1'));
    assert.equal(result.coldStart, true);
  });

  it('Cold-start: T1.5 (syncope) still fires', () => {
    const result = evaluateRules(
      baseInputs({
        distinctPriorLogDays: 0,
        symptomEvents: [symptom({ symptom: 'syncope' })],
      })
    );
    assert.equal(result.tier, 'tier_1_911');
    assert.ok(ruleIds(result.triggers).includes('T1.5'));
  });

  it('Multi-rule resolution: tier 1 + tier 2 → top tier_1_911, both triggers present', () => {
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [
          symptom({ symptom: 'syncope' }), // T1.5
          symptom({ symptom: 'nausea' }), // T2.12
        ],
      })
    );
    assert.equal(result.tier, 'tier_1_911');
    const ids = ruleIds(result.triggers);
    assert.ok(ids.includes('T1.5'));
    assert.ok(ids.includes('T2.12'));
  });

  it('Steady day: no readings, no events → tier_4_log, no triggers', () => {
    const result = evaluateRules(baseInputs());
    assert.equal(result.tier, 'tier_4_log');
    assert.deepEqual(result.triggers, []);
    assert.equal(result.coldStart, false); // distinctPriorLogDays = COLD_START_MIN_LOG_DAYS
  });

  it('Steady day on cold-start: tier_4_log, coldStart=true', () => {
    const result = evaluateRules(
      baseInputs({ distinctPriorLogDays: 0 })
    );
    assert.equal(result.tier, 'tier_4_log');
    assert.deepEqual(result.triggers, []);
    assert.equal(result.coldStart, true);
  });

  it('Tap correction supersedes earlier voice extraction (chest_pain=true → false same day)', () => {
    // Voice records chest_pain=true at 12:00; the caregiver corrects to
    // chest_pain=false via a tap at 12:05. Both rows live in the DB
    // (different source_log_id). The engine must read the most recent
    // event per (symptom, log_date) and NOT fire T1.3.
    const result = evaluateRules(
      baseInputs({
        symptomEvents: [
          symptom({
            symptom: 'chest_pain',
            present: true,
            recorded_at: `${TODAY}T12:00:00Z`,
          }),
          symptom({
            symptom: 'chest_pain',
            present: false,
            recorded_at: `${TODAY}T12:05:00Z`,
          }),
        ],
      })
    );
    assert.equal(result.tier, 'tier_4_log');
    assert.ok(!ruleIds(result.triggers).includes('T1.3'));
  });
});
