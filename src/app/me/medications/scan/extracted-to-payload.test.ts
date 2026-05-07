// Unit tests for the strength fallback chain and drug-name composition
// in extracted-to-payload.ts. The display-side mirror in scan-client.tsx
// (PendingMedSummary's displayStrength) MUST produce the same value for
// the same input — drift means the user sees one strength on the
// pending-med summary and a different one gets saved.
//
// Run from repo root:
//   node --test --experimental-strip-types src/app/me/medications/scan/extracted-to-payload.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ResolvedMed } from '../../../../lib/medications/scan/schema.ts';
import { extractedMedToPayload, toTitleCase } from './extracted-to-payload.ts';

function med(overrides: Partial<ResolvedMed> = {}): ResolvedMed {
  return {
    drug_name: 'MIDODRINE HCL 2.5MG TABS',
    dose_value: 2.5,
    dose_unit: 'mg',
    ndc: '72888-0112-01',
    is_dose_change: false,
    rxcui: '866428',
    ingredient: 'midodrine',
    form: 'Oral Tablet',
    strength: '2.5 MG',
    canonicalName: 'midodrine hydrochloride 2.5 MG Oral Tablet',
    ...overrides,
  };
}

describe('extractedMedToPayload — strength fallback chain', () => {
  it('uses RxNorm strength field when present (B1 happy path)', () => {
    const p = extractedMedToPayload(med({ strength: '2.5 MG' }));
    assert.equal(p.dose, '2.5 mg');
  });

  it('parses strength from canonicalName when strength field is null (B1 fix)', () => {
    // The Midodrine bottle reproducer: NDC resolves canonicalName but
    // strength field is null. Pre-fix, dose was empty and the user had
    // to retype 2.5.
    const p = extractedMedToPayload(
      med({
        strength: null,
        canonicalName: 'midodrine hydrochloride 2.5 MG Oral Tablet',
      })
    );
    assert.equal(p.dose, '2.5 mg');
  });

  it('skips canonicalName parsing for combination products (HCTZ + ARB)', () => {
    // canonicalName containing " / " marks a combination product.
    // Predecessor PR's parseStrength returns null for combos, so
    // fallback 2 is a no-op and we fall through to OCR (fallback 3).
    const p = extractedMedToPayload(
      med({
        strength: null,
        canonicalName: 'valsartan 80 MG / hydrochlorothiazide 12.5 MG Oral Tablet',
        dose_value: 80,
        dose_unit: 'mg',
      })
    );
    assert.equal(p.dose, '80 mg');
  });

  it('uses OCR dose_value+dose_unit when strength and canonicalName are unhelpful', () => {
    const p = extractedMedToPayload(
      med({
        strength: null,
        canonicalName: null,
        dose_value: 40,
        dose_unit: 'mg',
      })
    );
    assert.equal(p.dose, '40 mg');
  });

  it('returns empty dose when all three sources fail (caregiver edits later)', () => {
    const p = extractedMedToPayload(
      med({
        strength: null,
        canonicalName: null,
        dose_value: null,
        dose_unit: null,
      })
    );
    assert.equal(p.dose, '');
  });

  it('lowercases the unit from RxNorm strength (display consistency)', () => {
    const p = extractedMedToPayload(med({ strength: '40 MG' }));
    assert.equal(p.dose, '40 mg');
  });

  it('handles slash-form units like "10 MG/ML" via canonicalName parse', () => {
    const p = extractedMedToPayload(
      med({
        strength: null,
        canonicalName: 'furosemide 10 MG/ML Injectable Solution',
      })
    );
    assert.equal(p.dose, '10 mg/ml');
  });
});

describe('extractedMedToPayload — drug-name composition (B5)', () => {
  it('uses OCR drug_name as primary, Title Cased', () => {
    const p = extractedMedToPayload(
      med({
        drug_name: 'MIDODRINE HCL 2.5MG TABS',
        canonicalName: 'midodrine hydrochloride 2.5 MG Oral Tablet',
      })
    );
    assert.equal(p.drugName, 'Midodrine Hcl 2.5mg Tabs');
  });

  it('falls back to canonicalName when OCR is empty', () => {
    const p = extractedMedToPayload(
      med({
        drug_name: '',
        canonicalName: 'midodrine hydrochloride 2.5 MG Oral Tablet',
      })
    );
    assert.equal(p.drugName, 'Midodrine Hydrochloride 2.5 Mg Oral Tablet');
  });

  it('never substitutes RxNorm brand for OCR generic (B5)', () => {
    // Bottle prints generic "Midodrine"; canonicalName carries the
    // generic conceptName. We must NOT swap in the brand "Orvaten".
    const p = extractedMedToPayload(
      med({
        drug_name: 'midodrine 2.5 mg',
        canonicalName: 'midodrine hydrochloride 2.5 MG Oral Tablet',
      })
    );
    assert.match(p.drugName, /Midodrine/);
    assert.doesNotMatch(p.drugName, /Orvaten/i);
  });
});

describe('extractedMedToPayload — cadence defaults', () => {
  it('defaults to as_needed with no dose-times (cadence picker fills in)', () => {
    const p = extractedMedToPayload(med());
    assert.equal(p.cadenceKind, 'as_needed');
    assert.deepEqual(p.doseTimes, []);
    assert.equal(p.cycleOnDays, null);
    assert.equal(p.cycleOffDays, null);
    assert.equal(p.intervalDays, null);
    assert.equal(p.startedAt, '');
  });
});

describe('toTitleCase', () => {
  it('lowercases then capitalizes the first letter of each whitespace word', () => {
    assert.equal(toTitleCase('MIDODRINE HCL 2.5MG TABS'), 'Midodrine Hcl 2.5mg Tabs');
    assert.equal(toTitleCase('hello world'), 'Hello World');
  });

  it('collapses multiple whitespace and ignores leading/trailing space', () => {
    assert.equal(toTitleCase('  multiple   spaces  '), 'Multiple Spaces');
  });

  it('returns empty string for empty input', () => {
    assert.equal(toTitleCase(''), '');
  });
});
