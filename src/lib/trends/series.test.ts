// Unit tests for the trends series math.
//
// These tests drive `seriesFromRows(inputs)` — the pure roll-up — with
// synthetic row arrays. No database. Every test pins `today = 2026-05-08`
// so the 14d / 7d windows are deterministic.
//
// Run:
//   npm run test:trends

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  seriesFromRows,
  type SeriesInputs,
  type WeightRow,
  type SymptomRow,
} from './series.ts';

const TODAY = '2026-05-08';

function dateMinus(days: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function baseInputs(over: Partial<SeriesInputs> = {}): SeriesInputs {
  return {
    weightRows: [],
    pillowRows: [],
    coughRows: [],
    symptomRows: [],
    normalPillowCount: 1,
    today: TODAY,
    ...over,
  };
}

// ─── Weight series — happy path ─────────────────────────────────────────────

describe('weight14d series', () => {
  it('returns one point per day, ascending by date', () => {
    const weightRows: WeightRow[] = [
      { log_date: dateMinus(3), value: 180, recorded_at: `${dateMinus(3)}T08:00:00Z` },
      { log_date: dateMinus(1), value: 182, recorded_at: `${dateMinus(1)}T08:00:00Z` },
      { log_date: dateMinus(2), value: 181, recorded_at: `${dateMinus(2)}T08:00:00Z` },
    ];
    const out = seriesFromRows(baseInputs({ weightRows }));
    assert.deepEqual(
      out.weight14d.map((p) => p.d),
      [dateMinus(3), dateMinus(2), dateMinus(1)],
    );
    assert.deepEqual(
      out.weight14d.map((p) => p.v),
      [180, 181, 182],
    );
  });

  it('collapses multiple readings on the same day to the latest recorded_at', () => {
    // Caller orders rows ascending by recorded_at, so the LAST row for a
    // given log_date is the latest reading.
    const day = dateMinus(2);
    const weightRows: WeightRow[] = [
      { log_date: day, value: 178, recorded_at: `${day}T07:00:00Z` },
      { log_date: day, value: 180, recorded_at: `${day}T20:00:00Z` },
    ];
    const out = seriesFromRows(baseInputs({ weightRows }));
    assert.equal(out.weight14d.length, 1);
    assert.equal(out.weight14d[0].v, 180);
  });

  it('skips missing days entirely (no zero placeholders)', () => {
    const weightRows: WeightRow[] = [
      { log_date: dateMinus(5), value: 175, recorded_at: `${dateMinus(5)}T08:00:00Z` },
      { log_date: dateMinus(1), value: 177, recorded_at: `${dateMinus(1)}T08:00:00Z` },
    ];
    const out = seriesFromRows(baseInputs({ weightRows }));
    assert.equal(out.weight14d.length, 2);
    for (const p of out.weight14d) {
      assert.notEqual(p.v, 0);
    }
  });

  it('coerces string values to numbers (Supabase numeric → JS string)', () => {
    const weightRows: WeightRow[] = [
      // numeric columns sometimes come back as strings; the helper must
      // Number()-coerce so the chart renders.
      { log_date: dateMinus(1), value: '180.4', recorded_at: `${dateMinus(1)}T08:00:00Z` },
    ];
    const out = seriesFromRows(baseInputs({ weightRows }));
    assert.equal(out.weight14d[0].v, 180.4);
  });
});

// ─── 7-day baseline ─────────────────────────────────────────────────────────

describe('weight7dBaselineLb', () => {
  it('null when no weight data', () => {
    const out = seriesFromRows(baseInputs({ weightRows: [] }));
    assert.equal(out.weight7dBaselineLb, null);
  });

  it('uses the most-recent weight on or before today-7 (closest to baseline window)', () => {
    // today=2026-05-08 → start7Baseline=2026-05-01.
    // Three older points exist; the baseline must be the one closest to
    // the start7Baseline boundary, NOT the oldest one.
    const weightRows: WeightRow[] = [
      { log_date: dateMinus(14), value: 170, recorded_at: `${dateMinus(14)}T08:00:00Z` },
      { log_date: dateMinus(10), value: 175, recorded_at: `${dateMinus(10)}T08:00:00Z` },
      { log_date: dateMinus(7), value: 178, recorded_at: `${dateMinus(7)}T08:00:00Z` },
      { log_date: dateMinus(2), value: 184, recorded_at: `${dateMinus(2)}T08:00:00Z` },
    ];
    const out = seriesFromRows(baseInputs({ weightRows }));
    // The day-7 point itself qualifies (≤ start7Baseline). 178 is the
    // right baseline; 170 (oldest) and 175 would be wrong answers.
    assert.equal(out.weight7dBaselineLb, 178);
  });

  it('falls back to the oldest available point when nothing is older than today-7', () => {
    const weightRows: WeightRow[] = [
      { log_date: dateMinus(3), value: 181, recorded_at: `${dateMinus(3)}T08:00:00Z` },
      { log_date: dateMinus(1), value: 184, recorded_at: `${dateMinus(1)}T08:00:00Z` },
    ];
    const out = seriesFromRows(baseInputs({ weightRows }));
    assert.equal(out.weight7dBaselineLb, 181);
  });
});

// ─── Restless nights ─────────────────────────────────────────────────────────

describe('restlessNights14d', () => {
  it('counts a night with nocturnal cough', () => {
    const out = seriesFromRows(
      baseInputs({
        coughRows: [{ log_date: dateMinus(2) }],
      }),
    );
    assert.equal(out.restlessNights14d, 1);
  });

  it('counts a night with pillow_count above the patient baseline', () => {
    const out = seriesFromRows(
      baseInputs({
        normalPillowCount: 1,
        pillowRows: [{ log_date: dateMinus(3), pillow_count: 2 }],
      }),
    );
    assert.equal(out.restlessNights14d, 1);
  });

  it('does NOT count a night with pillow_count equal to baseline', () => {
    const out = seriesFromRows(
      baseInputs({
        normalPillowCount: 2,
        pillowRows: [{ log_date: dateMinus(3), pillow_count: 2 }],
      }),
    );
    assert.equal(out.restlessNights14d, 0);
  });

  it('does NOT double-count a night with both nocturnal cough AND elevated pillows', () => {
    const day = dateMinus(2);
    const out = seriesFromRows(
      baseInputs({
        normalPillowCount: 1,
        coughRows: [{ log_date: day }],
        pillowRows: [{ log_date: day, pillow_count: 3 }],
      }),
    );
    assert.equal(out.restlessNights14d, 1);
  });

  it('counts distinct dates across multiple events', () => {
    const out = seriesFromRows(
      baseInputs({
        normalPillowCount: 1,
        coughRows: [{ log_date: dateMinus(2) }, { log_date: dateMinus(4) }],
        pillowRows: [{ log_date: dateMinus(3), pillow_count: 3 }],
      }),
    );
    assert.equal(out.restlessNights14d, 3);
  });
});

// ─── Symptom tallies ────────────────────────────────────────────────────────

describe('symptomsTotal7d + topSymptoms7d', () => {
  it('totals individual symptom-event rows (each row is its own count)', () => {
    const symptomRows: SymptomRow[] = [
      { symptom: 'cough', log_date: dateMinus(1), present: true },
      { symptom: 'cough', log_date: dateMinus(2), present: true },
      { symptom: 'dyspnea', log_date: dateMinus(1), present: true },
    ];
    const out = seriesFromRows(baseInputs({ symptomRows }));
    assert.equal(out.symptomsTotal7d, 3);
  });

  it('returns top symptoms sorted by count descending, max 4', () => {
    const symptomRows: SymptomRow[] = [
      ...repeat({ symptom: 'cough', log_date: dateMinus(1), present: true }, 3),
      ...repeat({ symptom: 'dyspnea', log_date: dateMinus(2), present: true }, 5),
      ...repeat({ symptom: 'fatigue', log_date: dateMinus(3), present: true }, 2),
      ...repeat({ symptom: 'swelling', log_date: dateMinus(4), present: true }, 1),
      ...repeat({ symptom: 'nausea', log_date: dateMinus(5), present: true }, 4),
    ];
    const out = seriesFromRows(baseInputs({ symptomRows }));
    assert.equal(out.topSymptoms7d.length, 4);
    assert.equal(out.topSymptoms7d[0].count, 5);
    assert.equal(out.topSymptoms7d[1].count, 4);
    assert.equal(out.topSymptoms7d[2].count, 3);
    assert.equal(out.topSymptoms7d[3].count, 2);
  });

  it('renders pretty labels for known symptoms', () => {
    const symptomRows: SymptomRow[] = [
      { symptom: 'pnd', log_date: dateMinus(1), present: true },
    ];
    const out = seriesFromRows(baseInputs({ symptomRows }));
    assert.equal(out.topSymptoms7d[0].label, 'Woke up gasping');
  });

  it('falls back to the raw symptom code if no pretty label exists', () => {
    const symptomRows: SymptomRow[] = [
      { symptom: 'unknown_symptom', log_date: dateMinus(1), present: true },
    ];
    const out = seriesFromRows(baseInputs({ symptomRows }));
    assert.equal(out.topSymptoms7d[0].label, 'unknown_symptom');
  });
});

// ─── Empty / cold-start patient ─────────────────────────────────────────────

describe('empty patient', () => {
  it('returns all-zero / null values without crashing', () => {
    const out = seriesFromRows(baseInputs());
    assert.deepEqual(out.weight14d, []);
    assert.equal(out.weight7dBaselineLb, null);
    assert.equal(out.restlessNights14d, 0);
    assert.equal(out.symptomsTotal7d, 0);
    assert.deepEqual(out.topSymptoms7d, []);
    assert.equal(out.loadError, false);
  });

  it('cold-start (one weight reading): returns the single point as both series and baseline fallback', () => {
    const weightRows: WeightRow[] = [
      { log_date: dateMinus(0), value: 180, recorded_at: `${dateMinus(0)}T08:00:00Z` },
    ];
    const out = seriesFromRows(baseInputs({ weightRows }));
    assert.equal(out.weight14d.length, 1);
    // One reading, taken today: nothing is older than today-7. Falls back
    // to the oldest available — itself. Caller is responsible for not
    // computing a delta off this until ≥ 7 days of history exist.
    assert.equal(out.weight7dBaselineLb, 180);
  });
});

// ─── Restless-nights edge: null patient baseline ─────────────────────────────

describe('null normal_pillow_count', () => {
  it('falls back to baseline=1 when patient has not configured normal_pillow_count', () => {
    // Documents current behavior: the engine treats a missing patient
    // baseline as 1 pillow. Any logged pillow_count > 1 counts as restless.
    const out = seriesFromRows(
      baseInputs({
        normalPillowCount: null,
        pillowRows: [{ log_date: dateMinus(3), pillow_count: 2 }],
      }),
    );
    assert.equal(out.restlessNights14d, 1);
  });
});

function repeat<T>(item: T, n: number): T[] {
  return Array.from({ length: n }, () => ({ ...item }));
}
