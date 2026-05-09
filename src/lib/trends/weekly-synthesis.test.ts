// Unit tests for the home-screen weekly synthesis. Drives the pure
// `buildWeeklySynthesis` with synthetic rows. No database.
//
// Run:
//   node --test --experimental-strip-types src/lib/trends/weekly-synthesis.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWeeklySynthesis,
  type SynthesisInput,
} from './weekly-synthesis.ts';

const TODAY = '2026-05-08'; // Friday
function dateMinus(n: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
const WEEK_DATES = [6, 5, 4, 3, 2, 1, 0].map(dateMinus); // 7 ISO dates oldest first

function baseInput(over: Partial<SynthesisInput> = {}): SynthesisInput {
  return {
    patientName: 'Mom',
    today: TODAY,
    weeklyDates: WEEK_DATES,
    weights: [],
    symptomEvents: [],
    pillowsByDay: [],
    normalPillowCount: 1,
    diuretic: null,
    ...over,
  };
}

describe('weight tile', () => {
  it('warn-tone when weight has trended up >= 0.5 lb over the week', () => {
    const out = buildWeeklySynthesis(
      baseInput({
        weights: [
          { log_date: dateMinus(6), value: 178 },
          { log_date: dateMinus(0), value: 179.4 },
        ],
      }),
    );
    const w = out.tiles[0];
    assert.equal(w.icon, 'weight');
    assert.equal(w.tone, 'warn');
    assert.equal(w.value, '↑ 1.4 lb');
    assert.equal(w.sub, '7-day trend');
  });

  it('calm-tone when weight is steady (<0.5 lb absolute change)', () => {
    const out = buildWeeklySynthesis(
      baseInput({
        weights: [
          { log_date: dateMinus(6), value: 178 },
          { log_date: dateMinus(0), value: 178.3 },
        ],
      }),
    );
    const w = out.tiles[0];
    assert.equal(w.tone, 'calm');
    assert.equal(w.value, 'Steady');
  });

  it('calm-tone when weight has trended down (loss is not warn)', () => {
    const out = buildWeeklySynthesis(
      baseInput({
        weights: [
          { log_date: dateMinus(6), value: 178 },
          { log_date: dateMinus(0), value: 176.5 },
        ],
      }),
    );
    const w = out.tiles[0];
    assert.equal(w.tone, 'calm');
    assert.equal(w.value, '↓ 1.5 lb');
  });

  it('Not enough data when fewer than 2 readings', () => {
    const out = buildWeeklySynthesis(
      baseInput({ weights: [{ log_date: dateMinus(0), value: 178 }] }),
    );
    const w = out.tiles[0];
    assert.equal(w.value, 'Not enough data');
    assert.equal(w.tone, 'calm');
  });
});

describe('swelling tile', () => {
  it('warn-tone with day-fraction when swelling logged present on some days', () => {
    const out = buildWeeklySynthesis(
      baseInput({
        symptomEvents: [
          { log_date: dateMinus(4), symptom: 'swelling', present: true, nocturnal: null },
          { log_date: dateMinus(2), symptom: 'swelling', present: true, nocturnal: null },
          { log_date: dateMinus(0), symptom: 'swelling', present: true, nocturnal: null },
          { log_date: dateMinus(3), symptom: 'swelling', present: false, nocturnal: null },
          { log_date: dateMinus(1), symptom: 'swelling', present: false, nocturnal: null },
        ],
      }),
    );
    const s = out.tiles[1];
    assert.equal(s.icon, 'swelling');
    assert.equal(s.tone, 'warn');
    assert.equal(s.value, '3 of 5 days');
  });

  it('calm-tone when only present=false swelling events were logged', () => {
    const out = buildWeeklySynthesis(
      baseInput({
        symptomEvents: [
          { log_date: dateMinus(2), symptom: 'swelling', present: false, nocturnal: null },
          { log_date: dateMinus(1), symptom: 'swelling', present: false, nocturnal: null },
        ],
      }),
    );
    const s = out.tiles[1];
    assert.equal(s.tone, 'calm');
    assert.equal(s.value, 'No swelling');
  });

  it('Not reported when no swelling events at all', () => {
    const out = buildWeeklySynthesis(baseInput());
    const s = out.tiles[1];
    assert.equal(s.value, 'Not reported');
  });
});

describe('sleep tile', () => {
  it('warn-tone counts nocturnal cough nights and elevated-pillow nights as one set', () => {
    const out = buildWeeklySynthesis(
      baseInput({
        symptomEvents: [
          { log_date: dateMinus(3), symptom: 'cough', present: true, nocturnal: true },
        ],
        pillowsByDay: [
          { log_date: dateMinus(2), pillow_count: 3 },
          { log_date: dateMinus(3), pillow_count: 3 }, // same date as cough — dedupes
        ],
        normalPillowCount: 1,
      }),
    );
    const s = out.tiles[2];
    assert.equal(s.tone, 'warn');
    assert.equal(s.value, '2 disrupted nights');
  });

  it('calm-tone "No changes noted" when neither cough nor elevated pillows', () => {
    const out = buildWeeklySynthesis(baseInput());
    const s = out.tiles[2];
    assert.equal(s.tone, 'calm');
    assert.equal(s.value, 'No changes noted');
  });

  it('does not count pillow elevation when normalPillowCount is null', () => {
    const out = buildWeeklySynthesis(
      baseInput({
        pillowsByDay: [{ log_date: dateMinus(1), pillow_count: 3 }],
        normalPillowCount: null,
      }),
    );
    const s = out.tiles[2];
    assert.equal(s.tone, 'calm');
  });

  it('does not count daytime cough as sleep-disrupting', () => {
    const out = buildWeeklySynthesis(
      baseInput({
        symptomEvents: [
          { log_date: dateMinus(2), symptom: 'cough', present: true, nocturnal: false },
        ],
      }),
    );
    const s = out.tiles[2];
    assert.equal(s.tone, 'calm');
  });
});

describe('diuretic tile', () => {
  it('calm-tone "Taken every day" when no missed days', () => {
    const out = buildWeeklySynthesis(
      baseInput({
        diuretic: {
          drugName: 'Lasix',
          dosesPerDay: 1,
          takenByDay: WEEK_DATES.map((d) => ({ log_date: d, taken: 1 })),
          activeDays: WEEK_DATES,
        },
      }),
    );
    const m = out.tiles[3];
    assert.equal(m.icon, 'med');
    assert.equal(m.label, 'Lasix');
    assert.equal(m.tone, 'calm');
    assert.equal(m.value, 'Taken every day');
  });

  it('warn-tone "Skipped {day}" when exactly one missed day', () => {
    // Wed = dateMinus(2) given today = Fri 2026-05-08
    const wed = dateMinus(2);
    const out = buildWeeklySynthesis(
      baseInput({
        diuretic: {
          drugName: 'Lasix',
          dosesPerDay: 1,
          takenByDay: WEEK_DATES.map((d) => ({
            log_date: d,
            taken: d === wed ? 0 : 1,
          })),
          activeDays: WEEK_DATES,
        },
      }),
    );
    const m = out.tiles[3];
    assert.equal(m.tone, 'warn');
    assert.equal(m.value, 'Skipped Wed');
    assert.equal(m.sub, '6 of 7 days taken');
  });

  it('warn-tone "{n} days missed" when 2+ missed', () => {
    const out = buildWeeklySynthesis(
      baseInput({
        diuretic: {
          drugName: 'Lasix',
          dosesPerDay: 1,
          takenByDay: WEEK_DATES.map((d, i) => ({
            log_date: d,
            taken: i < 2 ? 0 : 1,
          })),
          activeDays: WEEK_DATES,
        },
      }),
    );
    const m = out.tiles[3];
    assert.equal(m.tone, 'warn');
    assert.equal(m.value, '2 days missed');
  });

  it('omits the tile entirely when no diuretic is on file', () => {
    const out = buildWeeklySynthesis(baseInput());
    assert.equal(out.tiles.length, 3);
    assert.ok(!out.tiles.some((t) => t.icon === 'med'));
  });

  it('omits the tile when dosesPerDay is null (PRN)', () => {
    const out = buildWeeklySynthesis(
      baseInput({
        diuretic: {
          drugName: 'PRN diuretic',
          dosesPerDay: null,
          takenByDay: [],
          activeDays: WEEK_DATES,
        },
      }),
    );
    assert.equal(out.tiles.length, 3);
  });

  it('uses only activeDays as denominator when med started mid-window', () => {
    // Med started 3 days ago — only 3 days are active
    const activeDays = WEEK_DATES.slice(-3);
    const out = buildWeeklySynthesis(
      baseInput({
        diuretic: {
          drugName: 'Lasix',
          dosesPerDay: 1,
          takenByDay: activeDays.map((d) => ({ log_date: d, taken: 1 })),
          activeDays,
        },
      }),
    );
    const m = out.tiles[3];
    assert.equal(m.value, 'Taken every day');
    assert.equal(m.sub, '3 of 3 days');
  });
});

describe('narrative paragraph', () => {
  it('mockup-style joined sentences when all four signals are present', () => {
    const wed = dateMinus(2);
    const out = buildWeeklySynthesis(
      baseInput({
        weights: [
          { log_date: dateMinus(6), value: 178 },
          { log_date: dateMinus(0), value: 179.4 },
        ],
        symptomEvents: [
          { log_date: dateMinus(4), symptom: 'swelling', present: true, nocturnal: null },
          { log_date: dateMinus(2), symptom: 'swelling', present: true, nocturnal: null },
          { log_date: dateMinus(0), symptom: 'swelling', present: true, nocturnal: null },
          { log_date: dateMinus(3), symptom: 'swelling', present: false, nocturnal: null },
          { log_date: dateMinus(1), symptom: 'swelling', present: false, nocturnal: null },
        ],
        diuretic: {
          drugName: 'Lasix',
          dosesPerDay: 1,
          takenByDay: WEEK_DATES.map((d) => ({ log_date: d, taken: d === wed ? 0 : 1 })),
          activeDays: WEEK_DATES,
        },
      }),
    );
    assert.match(out.narrative, /Mom's weight has trended up 1\.4 lb/);
    assert.match(out.narrative, /Swelling came up on 3 of 5 days/);
    assert.match(out.narrative, /No sleep changes were noted/);
    assert.match(out.narrative, /Lasix was logged every day except Wednesday/);
  });

  it('emits only the sleep sentence on a fully-empty week (calm)', () => {
    const out = buildWeeklySynthesis(baseInput({ patientName: null }));
    assert.equal(out.narrative, 'No sleep changes were noted.');
  });

  it("uses possessive apostrophe-only for names ending in 's'", () => {
    const out = buildWeeklySynthesis(
      baseInput({
        patientName: 'James',
        weights: [
          { log_date: dateMinus(6), value: 178 },
          { log_date: dateMinus(0), value: 180 },
        ],
      }),
    );
    assert.match(out.narrative, /James' weight has trended up/);
  });
});
