// Unit tests for the post-Vertex enrichment logic in enrich.ts. We do
// not exercise the live Vertex call — `enrichMedications` operates on
// the already-validated `ExtractedMed[]` and merges in NDC-resolved
// fields independently of how those meds were obtained.
//
// This split keeps the enrichment logic testable without an HTTP stub
// for Vertex (which has no test fixture in this repo) and without
// process.env Vertex credentials.
//
// Run from repo root:
//   npm run test:scan-enrich

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ExtractedMed } from './schema.ts';
import type { NdcResolution } from '../rxnorm-ndc.ts';
import { enrichMedications } from './enrich.ts';

const RESOLVED: NdcResolution = {
  rxcui: '866428',
  ingredient: 'midodrine',
  form: 'Oral Tablet',
  strength: '2.5 MG',
  canonicalName: 'Midodrine Hydrochloride 2.5 MG Oral Tablet',
};

function ocrMed(overrides: Partial<ExtractedMed> = {}): ExtractedMed {
  return {
    drug_name: 'MIDODRINE HCL 2.5MG TABS',
    dose_value: 2.5,
    dose_unit: 'mg',
    ndc: '72888-0112-01',
    is_dose_change: false,
    ...overrides,
  };
}

describe('enrichMedications', () => {
  it('merges resolver result when NDC is present and format-valid', async () => {
    const calls: string[] = [];
    const out = await enrichMedications([ocrMed()], async (ndc) => {
      calls.push(ndc);
      return RESOLVED;
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].rxcui, '866428');
    assert.equal(out[0].ingredient, 'midodrine');
    assert.equal(out[0].form, 'Oral Tablet');
    assert.equal(out[0].canonicalName, 'Midodrine Hydrochloride 2.5 MG Oral Tablet');
    assert.deepEqual(calls, ['72888-0112-01']);
  });

  it('leaves canonical fields null when NDC is null and never calls resolver', async () => {
    let called = false;
    const out = await enrichMedications([ocrMed({ ndc: null })], async () => {
      called = true;
      return RESOLVED;
    });
    assert.equal(called, false);
    assert.equal(out[0].rxcui, null);
    assert.equal(out[0].canonicalName, null);
  });

  it('skips resolver when NDC fails format validation (phone-number-shaped)', async () => {
    let called = false;
    const out = await enrichMedications([ocrMed({ ndc: '561-292-4511' })], async () => {
      called = true;
      return RESOLVED;
    });
    assert.equal(called, false);
    assert.equal(out[0].ndc, '561-292-4511'); // preserved verbatim
    assert.equal(out[0].rxcui, null);
  });

  it('skips resolver when is_dose_change=true (build convention #6)', async () => {
    // Critical: even if the dose-change label has an NDC printed, we must
    // not enrich it. The notice card never inserts to the medications
    // table, but if a future code path exposed canonical fields against
    // a dose-change row it would silently auto-ingest a dose change.
    let called = false;
    const out = await enrichMedications(
      [ocrMed({ is_dose_change: true, ndc: '72888-0112-01' })],
      async () => {
        called = true;
        return RESOLVED;
      },
    );
    assert.equal(called, false);
    assert.equal(out[0].rxcui, null);
    assert.equal(out[0].canonicalName, null);
  });

  it('accepts hyphenated 5-4-2, 5-3-2, 4-4-2 and unhyphenated 10/11-digit', async () => {
    const accepted: string[] = [];
    const formats = ['72888-0112-01', '00378-112-01', '0777-3105-02', '72888011201', '0037811201'];
    await enrichMedications(
      formats.map((n) => ocrMed({ ndc: n })),
      async (ndc) => {
        accepted.push(ndc);
        return RESOLVED;
      },
    );
    assert.deepEqual(accepted.sort(), formats.slice().sort());
  });

  it('rejects malformed digit counts (9 digits, 12 digits, letters, wrong segmenting)', async () => {
    const calls: string[] = [];
    const out = await enrichMedications(
      [
        ocrMed({ ndc: '123456789' }),       // 9 digits
        ocrMed({ ndc: '123456789012' }),    // 12 digits
        ocrMed({ ndc: 'abc-def-gh' }),       // letters
        ocrMed({ ndc: '7288-8011-2-01' }),   // wrong segmenting
      ],
      async (ndc) => {
        calls.push(ndc);
        return RESOLVED;
      },
    );
    assert.deepEqual(calls, []);
    for (const m of out) assert.equal(m.rxcui, null);
  });

  it('leaves canonical fields null when resolver returns null', async () => {
    const out = await enrichMedications([ocrMed({ ndc: '99999-9999-99' })], async () => null);
    // 99999-9999-99 is a structurally-valid 5-4-2 format, so resolver
    // is called. It returns null, we fall back. Verifies the second
    // null-return code path.
    assert.equal(out[0].ndc, '99999-9999-99');
    assert.equal(out[0].rxcui, null);
  });
});
