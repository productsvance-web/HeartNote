// Unit tests for the /trends/weight pure helpers.
//
// Run: node --test --experimental-strip-types src/lib/trends/weight-window.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  windowSliceFor,
  intraDayRangeFor,
  type WeightReading,
} from './weight-window.ts';

const TZ = 'America/Los_Angeles';

let _id = 0;
function r(recorded_at: string, value: number, log_date?: string): WeightReading {
  return {
    id: `r-${++_id}`,
    recorded_at,
    value,
    log_date: log_date ?? recorded_at.slice(0, 10),
  };
}

describe('windowSliceFor', () => {
  it('D returns readings logged on today only', () => {
    const today = '2026-05-09';
    const all = [
      r('2026-05-08T23:30:00-07:00', 181.0, '2026-05-08'),
      r('2026-05-09T07:02:00-07:00', 181.8, '2026-05-09'),
      r('2026-05-09T20:00:00-07:00', 182.4, '2026-05-09'),
    ];
    assert.deepEqual(windowSliceFor('D', today, all).map((p) => p.value), [181.8, 182.4]);
  });

  it('W returns last 7 days inclusive of today', () => {
    const today = '2026-05-09';
    const all = [
      r('2026-05-01T08:00:00-07:00', 180.0, '2026-05-01'),
      r('2026-05-03T08:00:00-07:00', 180.5, '2026-05-03'),
      r('2026-05-09T08:00:00-07:00', 182.0, '2026-05-09'),
    ];
    assert.deepEqual(windowSliceFor('W', today, all).map((p) => p.value), [180.5, 182.0]);
  });

  it('M returns last 30 days', () => {
    const today = '2026-05-09';
    const all = [
      r('2026-04-09T08:00:00-07:00', 180.0, '2026-04-09'),
      r('2026-04-08T08:00:00-07:00', 179.5, '2026-04-08'),
      r('2026-05-09T08:00:00-07:00', 182.0, '2026-05-09'),
    ];
    assert.deepEqual(windowSliceFor('M', today, all).map((p) => p.value), [180.0, 182.0]);
  });

  it('6M returns last 6 calendar months', () => {
    const today = '2026-05-09';
    const all = [
      r('2025-11-09T08:00:00-07:00', 178.0, '2025-11-09'),
      r('2025-11-08T08:00:00-07:00', 177.5, '2025-11-08'),
      r('2026-05-09T08:00:00-07:00', 182.0, '2026-05-09'),
    ];
    assert.deepEqual(windowSliceFor('6M', today, all).map((p) => p.value), [178.0, 182.0]);
  });

  it('Y returns last 12 months', () => {
    const today = '2026-05-09';
    const all = [
      r('2025-05-09T08:00:00-07:00', 175.0, '2025-05-09'),
      r('2025-05-08T08:00:00-07:00', 174.5, '2025-05-08'),
      r('2026-05-09T08:00:00-07:00', 182.0, '2026-05-09'),
    ];
    assert.deepEqual(windowSliceFor('Y', today, all).map((p) => p.value), [175.0, 182.0]);
  });

  it('returns empty array on empty input', () => {
    assert.deepEqual(windowSliceFor('W', '2026-05-09', []), []);
  });
});

describe('intraDayRangeFor', () => {
  it("returns max - min across today's readings", () => {
    const today = '2026-05-09';
    const slice = [
      r('2026-05-09T07:02:00-07:00', 181.8),
      r('2026-05-09T11:00:00-07:00', 182.0),
      r('2026-05-09T15:14:00-07:00', 182.6),
      r('2026-05-09T20:00:00-07:00', 182.4),
    ];
    const out = intraDayRangeFor(slice, today, TZ);
    assert.ok(out !== null && Math.abs(out - 0.8) < 0.001, `expected ~0.8, got ${out}`);
  });

  it('returns 0 when only one reading today', () => {
    const today = '2026-05-09';
    const slice = [r('2026-05-09T07:02:00-07:00', 181.8)];
    assert.equal(intraDayRangeFor(slice, today, TZ), 0);
  });

  it('returns null when no readings today', () => {
    assert.equal(intraDayRangeFor([], '2026-05-09', TZ), null);
  });
});
