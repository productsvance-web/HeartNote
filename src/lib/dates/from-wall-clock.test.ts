// Run: node --test --experimental-strip-types src/lib/dates/from-wall-clock.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isoFromWallClock } from './from-wall-clock.ts';

const PT = 'America/Los_Angeles';
const NY = 'America/New_York';

describe('isoFromWallClock', () => {
  it('returns null for malformed input', () => {
    assert.equal(isoFromWallClock('garbage', PT), null);
    assert.equal(isoFromWallClock('2026-05-09', PT), null);
    assert.equal(isoFromWallClock('2026-05-09T8:00', PT), null);
  });

  it('converts a PT wall-clock to UTC in summer (PDT, -07:00)', () => {
    assert.equal(isoFromWallClock('2026-07-09T08:00', PT), '2026-07-09T15:00:00.000Z');
  });

  it('converts a PT wall-clock in winter (PST, -08:00)', () => {
    assert.equal(isoFromWallClock('2026-01-09T08:00', PT), '2026-01-09T16:00:00.000Z');
  });

  it('handles the spring-forward DST boundary', () => {
    assert.equal(isoFromWallClock('2026-03-08T03:00', PT), '2026-03-08T10:00:00.000Z');
  });

  it('handles a different IANA tz (NY)', () => {
    assert.equal(isoFromWallClock('2026-05-09T09:00', NY), '2026-05-09T13:00:00.000Z');
  });

  it('round-trips midnight in PT', () => {
    assert.equal(isoFromWallClock('2026-05-09T00:00', PT), '2026-05-09T07:00:00.000Z');
  });
});
