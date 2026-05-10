// Unit tests for the /log helper-text resolver.
//
// The resolver is a pure function: (field, context) → { tone, copy }.
// Every threshold imports from src/lib/clinical/thresholds.ts. Tests
// assert tone selection (calm / watch / urgent) and that copy contains
// the threshold or the value the caller passed in.
//
// Run:
//   node --test --experimental-strip-types tests/unit/helper-text.test.ts
//
// (The plan referenced `npx vitest run` — we use node:test to match the
// project's existing test pattern in src/lib/alerts/evaluate.test.ts.)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { resolveHelperText } from '../../src/lib/log/helper-text.ts';

describe('resolveHelperText', () => {
  describe('weight', () => {
    it('returns watch tone when up >= 4 lb in 14 days', () => {
      const result = resolveHelperText('weight', {
        valueLb: 182.4,
        baselineLb: 178.0,
        gainLb14d: 4.4,
        baselineFreshDays: 7,
      });
      assert.equal(result.tone, 'watch');
      assert.match(result.copy, /4\.4 lb/);
      assert.match(result.copy.toLowerCase(), /water gain/);
    });

    it('returns calm tone when within 2 lb of baseline', () => {
      const result = resolveHelperText('weight', {
        valueLb: 178.5,
        baselineLb: 178.0,
        gainLb14d: 0.5,
        baselineFreshDays: 7,
      });
      assert.equal(result.tone, 'calm');
    });

    it('cold-start (no baseline): never trends, just confirms reading', () => {
      const result = resolveHelperText('weight', {
        valueLb: 184.0,
        baselineLb: null,
        gainLb14d: null,
        baselineFreshDays: 0,
      });
      assert.equal(result.tone, 'calm');
      assert.doesNotMatch(result.copy.toLowerCase(), /water gain|trend|over/);
      assert.match(result.copy.toLowerCase(), /first reading/);
    });
  });

  describe('spo2', () => {
    it('returns urgent when spo2 <= 88 (tier-1 floor)', () => {
      const result = resolveHelperText('spo2', { valuePct: 87 });
      assert.equal(result.tone, 'urgent');
      assert.match(result.copy, /88/);
    });

    it('returns urgent when spo2 < 90 with new dyspnea', () => {
      const result = resolveHelperText('spo2', { valuePct: 89, hasNewDyspnea: true });
      assert.equal(result.tone, 'urgent');
    });

    it('returns watch when spo2 91-94 with new dyspnea', () => {
      const result = resolveHelperText('spo2', { valuePct: 91, hasNewDyspnea: true });
      assert.equal(result.tone, 'watch');
    });

    it('returns calm when spo2 >= 95', () => {
      const result = resolveHelperText('spo2', { valuePct: 96 });
      assert.equal(result.tone, 'calm');
      assert.match(result.copy.toLowerCase(), /88/);
    });

    it('cold-start with no value: calm, mentions floor', () => {
      const result = resolveHelperText('spo2', { valuePct: null });
      assert.equal(result.tone, 'calm');
      assert.match(result.copy, /88/);
    });
  });

  describe('pillows', () => {
    it('returns watch when pillows up from baseline', () => {
      const result = resolveHelperText('pillows', {
        countToday: 3,
        baselineCount: 1,
      });
      assert.equal(result.tone, 'watch');
      assert.match(result.copy.toLowerCase(), /orthopnea/);
    });

    it('returns calm when at baseline', () => {
      const result = resolveHelperText('pillows', { countToday: 1, baselineCount: 1 });
      assert.equal(result.tone, 'calm');
    });

    it('cold-start (no countToday): held at baseline copy', () => {
      const result = resolveHelperText('pillows', { countToday: null, baselineCount: 0 });
      assert.equal(result.tone, 'calm');
      assert.match(result.copy.toLowerCase(), /past week|baseline/);
    });
  });

  describe('hr', () => {
    it('watch when hr > 120 bpm (tier 2)', () => {
      const result = resolveHelperText('hr', { valueBpm: 122, baselineBand: [66, 92] });
      assert.equal(result.tone, 'watch');
    });

    it('watch when hr < 50 bpm (tier 2 with symptoms framing)', () => {
      const result = resolveHelperText('hr', { valueBpm: 48, baselineBand: [66, 92] });
      assert.equal(result.tone, 'watch');
    });

    it('calm when hr is in baseline range', () => {
      const result = resolveHelperText('hr', { valueBpm: 78, baselineBand: [66, 92] });
      assert.equal(result.tone, 'calm');
    });
  });

  describe('bp', () => {
    it('watch when systolic < 90', () => {
      const result = resolveHelperText('bp', {
        systolic: 88,
        diastolic: 60,
        baselineSysBand: [110, 130],
      });
      assert.equal(result.tone, 'watch');
    });

    it('calm with no value', () => {
      const result = resolveHelperText('bp', {
        systolic: null,
        diastolic: null,
        baselineSysBand: [110, 130],
      });
      assert.equal(result.tone, 'calm');
    });
  });
});
