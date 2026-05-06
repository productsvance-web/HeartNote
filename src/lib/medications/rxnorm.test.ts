// Integration tests for src/lib/medications/rxnorm.ts.
//
// Hits the live NLM RxNav API. Run from repo root:
//   npm run test:rxnorm
// Or directly:
//   node --test --experimental-strip-types \
//     src/lib/medications/rxnorm.test.ts
//
// Skipped automatically if RXNORM_TEST_OFFLINE=1 is set (e.g., flaky CI).
//
// Search-side tests (searchByIndex) live in rxnorm-search.test.ts and run
// fully offline against the bundled index.
//
// What this verifies (each maps to an AC in the wizard plan):
//  • getDrugDetails returns a form list with sensible counts for furosemide,
//    hydrocortisone, nitroglycerin.
//  • Brand input pre-selects the correct form (Lasix → Oral Tablet).
//  • Form-noun mapping has the entries we rely on in the wizard.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  getDrugDetails,
  FORM_COUNT_NOUN,
  normalizeForm,
  type DrugSearchResult,
} from './rxnorm.ts';
import { searchByIndex } from './rxnorm-search.ts';

const OFFLINE = process.env.RXNORM_TEST_OFFLINE === '1';
const skip = OFFLINE ? { skip: 'RXNORM_TEST_OFFLINE=1' } : {};

describe('FORM_COUNT_NOUN', () => {
  it('maps the discrete-dose forms the wizard relies on', () => {
    assert.deepEqual(FORM_COUNT_NOUN['Oral Tablet'], { single: 'tablet', plural: 'tablets' });
    assert.deepEqual(FORM_COUNT_NOUN['Oral Capsule'], { single: 'capsule', plural: 'capsules' });
    assert.deepEqual(FORM_COUNT_NOUN['Sublingual Tablet'], { single: 'tablet', plural: 'tablets' });
    assert.deepEqual(FORM_COUNT_NOUN['Inhalation Aerosol'], { single: 'puff', plural: 'puffs' });
    assert.deepEqual(FORM_COUNT_NOUN['Transdermal Patch'], { single: 'patch', plural: 'patches' });
  });

  it('omits volume/topical forms (wizard skips count question for these)', () => {
    assert.equal(FORM_COUNT_NOUN['Cream'], undefined);
    assert.equal(FORM_COUNT_NOUN['Ointment'], undefined);
    assert.equal(FORM_COUNT_NOUN['Oral Solution'], undefined);
    assert.equal(FORM_COUNT_NOUN['Injectable Solution'], undefined);
  });
});

describe('normalizeForm', () => {
  it('maps the tablet variants to "tablet"', () => {
    assert.equal(normalizeForm('Oral Tablet'), 'tablet');
    assert.equal(normalizeForm('Sublingual Tablet'), 'tablet');
    assert.equal(normalizeForm('Extended Release Oral Tablet'), 'tablet');
    assert.equal(normalizeForm('Delayed Release Oral Tablet'), 'tablet');
  });

  it('maps the capsule variants to "capsule"', () => {
    assert.equal(normalizeForm('Oral Capsule'), 'capsule');
    assert.equal(normalizeForm('Extended Release Oral Capsule'), 'capsule');
    assert.equal(normalizeForm('Delayed Release Oral Capsule'), 'capsule');
  });

  it('maps "Oral Solution" to "solution" and "Injectable Solution" to "injection"', () => {
    assert.equal(normalizeForm('Oral Solution'), 'solution');
    assert.equal(normalizeForm('Injectable Solution'), 'injection');
  });

  it('returns null for null input', () => {
    assert.equal(normalizeForm(null), null);
  });

  it('lowercase passthrough for unmapped forms — never crashes display', () => {
    assert.equal(normalizeForm('Some Future Form'), 'some future form');
  });

  it('treats empty string as null (matches "no form known" semantics)', () => {
    assert.equal(normalizeForm(''), null);
  });
});

describe('getDrugDetails', () => {
  let lasix: DrugSearchResult | undefined;
  let furosemide: DrugSearchResult | undefined;
  let hydrocortisone: DrugSearchResult | undefined;
  let nitroglycerin: DrugSearchResult | undefined;

  before(() => {
    if (OFFLINE) return;
    // Source picks from the bundled index — same path the wizard uses.
    lasix = pickByName(searchByIndex('lasix'), 'Lasix');
    furosemide = pickByName(searchByIndex('furosemide'), 'Furosemide');
    hydrocortisone = pickByName(searchByIndex('hydrocortisone'), 'Hydrocortisone');
    nitroglycerin = pickByName(searchByIndex('nitroglycerin'), 'Nitroglycerin');
  });

  it('Lasix (brand) → forms include Oral Tablet, preselectedForm = Oral Tablet, strengths include 40 MG', skip, async () => {
    assert.ok(lasix, 'Lasix lookup setup failed');
    const details = await getDrugDetails({
      rxcui: lasix.rxcui,
      type: 'brand',
      drugName: lasix.name,
      ingredientName: lasix.ingredient,
      ingredientRxcui: lasix.ingredientRxcui,
    });
    assert.equal(details.preselectedForm, 'Oral Tablet');
    const oralTablet = details.forms.find((f) => f.name === 'Oral Tablet');
    assert.ok(oralTablet, `expected Oral Tablet form, got ${details.forms.map((f) => f.name).join(', ')}`);
    assert.ok(
      oralTablet.strengths.some((s) => /40 MG/.test(s)),
      `expected 40 MG strength, got ${oralTablet.strengths.join(', ')}`
    );
  });

  it('furosemide (generic) → multiple forms, no preselectedForm', skip, async () => {
    assert.ok(furosemide, 'furosemide lookup setup failed');
    const details = await getDrugDetails({
      rxcui: furosemide.rxcui,
      type: 'generic',
      drugName: furosemide.name,
    });
    assert.equal(details.preselectedForm, null);
    const formNames = details.forms.map((f) => f.name);
    assert.ok(formNames.includes('Oral Tablet'), `missing Oral Tablet in ${formNames.join(', ')}`);
    assert.ok(formNames.includes('Oral Solution'), `missing Oral Solution in ${formNames.join(', ')}`);
    assert.ok(details.forms.length >= 3, `expected ≥3 forms, got ${details.forms.length}`);
  });

  it('hydrocortisone → many forms (Cream, Ointment, Oral Tablet at minimum)', skip, async () => {
    assert.ok(hydrocortisone, 'hydrocortisone lookup setup failed');
    const details = await getDrugDetails({
      rxcui: hydrocortisone.rxcui,
      type: 'generic',
      drugName: hydrocortisone.name,
    });
    const formNames = details.forms.map((f) => f.name);
    assert.ok(formNames.includes('Topical Cream'), `missing Topical Cream in ${formNames.join(', ')}`);
    assert.ok(formNames.includes('Topical Ointment'), `missing Topical Ointment in ${formNames.join(', ')}`);
    assert.ok(formNames.includes('Oral Tablet'), `missing Oral Tablet in ${formNames.join(', ')}`);
    assert.ok(details.forms.length >= 5, `expected ≥5 forms, got ${details.forms.length}`);
  });

  it('nitroglycerin → includes Sublingual Tablet and a transdermal form', skip, async () => {
    assert.ok(nitroglycerin, 'nitroglycerin lookup setup failed');
    const details = await getDrugDetails({
      rxcui: nitroglycerin.rxcui,
      type: 'generic',
      drugName: nitroglycerin.name,
    });
    const formNames = details.forms.map((f) => f.name);
    assert.ok(formNames.includes('Sublingual Tablet'), `missing Sublingual Tablet in ${formNames.join(', ')}`);
    // RxNorm names nitroglycerin patches as "Transdermal System" rather
    // than "Transdermal Patch" — accept either.
    assert.ok(
      formNames.some((n) => /Transdermal/i.test(n)),
      `missing a Transdermal form in ${formNames.join(', ')}`
    );
  });

  it('forms list is deduped on display name', skip, async () => {
    assert.ok(nitroglycerin, 'nitroglycerin lookup setup failed');
    const details = await getDrugDetails({
      rxcui: nitroglycerin.rxcui,
      type: 'generic',
      drugName: nitroglycerin.name,
    });
    const formNames = details.forms.map((f) => f.name);
    const unique = new Set(formNames);
    assert.equal(formNames.length, unique.size, `duplicates in ${formNames.join(', ')}`);
  });
});

function pickByName(results: DrugSearchResult[], name: string): DrugSearchResult | undefined {
  const lower = name.toLowerCase();
  return results.find((r) => r.name.toLowerCase() === lower);
}
