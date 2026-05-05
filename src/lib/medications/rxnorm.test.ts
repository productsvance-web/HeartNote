// Integration tests for src/lib/medications/rxnorm.ts.
//
// Hits the live NLM RxNav API. Run from repo root:
//   node --test --experimental-strip-types \
//     .claude/worktrees/medications-wizard/src/lib/medications/rxnorm.test.ts
//
// Skipped automatically if RXNORM_TEST_OFFLINE=1 is set (e.g., flaky CI).
//
// What this verifies (each maps to an AC in the wizard plan):
//  • Brand search returns BN type with linked ingredient (Lasix→Furosemide,
//    Coreg→Carvedilol, Lopressor→Metoprolol).
//  • Generic search returns IN type with no ingredient sub-line.
//  • Short query (<3 chars) returns no results without a network call.
//  • getDrugDetails returns a form list with sensible counts for furosemide,
//    hydrocortisone, nitroglycerin.
//  • Brand input pre-selects the correct form (Lasix → Oral Tablet).
//  • Form-noun mapping has the entries we rely on in the wizard.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  searchDrug,
  getDrugDetails,
  FORM_COUNT_NOUN,
  type DrugSearchResult,
} from './rxnorm.ts';

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

describe('searchDrug', () => {
  it('returns no results for queries under 3 characters', async () => {
    assert.deepEqual(await searchDrug(''), []);
    assert.deepEqual(await searchDrug('la'), []);
  });

  it('returns no results for whitespace', async () => {
    assert.deepEqual(await searchDrug('   '), []);
  });

  it('Lasix → brand with ingredient Furosemide', skip, async () => {
    const results = await searchDrug('lasix');
    const lasix = pickByName(results, 'Lasix');
    assert.ok(lasix, `expected a Lasix result in ${JSON.stringify(results)}`);
    assert.equal(lasix.type, 'brand');
    assert.equal(lasix.ingredient?.toLowerCase(), 'furosemide');
    assert.ok(lasix.ingredientRxcui, 'expected ingredientRxcui on brand result');
  });

  it('Coreg → brand with ingredient Carvedilol', skip, async () => {
    const results = await searchDrug('coreg');
    const coreg = pickByName(results, 'Coreg');
    assert.ok(coreg, `expected a Coreg result in ${JSON.stringify(results)}`);
    assert.equal(coreg.type, 'brand');
    assert.equal(coreg.ingredient?.toLowerCase(), 'carvedilol');
  });

  it('Lopressor → brand with ingredient Metoprolol', skip, async () => {
    const results = await searchDrug('lopressor');
    const lopressor = pickByName(results, 'Lopressor');
    assert.ok(lopressor, `expected a Lopressor result in ${JSON.stringify(results)}`);
    assert.equal(lopressor.type, 'brand');
    assert.equal(lopressor.ingredient?.toLowerCase(), 'metoprolol');
  });

  it('furosemide → generic with no ingredient sub-line', skip, async () => {
    const results = await searchDrug('furosemide');
    const fur = pickByName(results, 'furosemide');
    assert.ok(fur, `expected a furosemide result in ${JSON.stringify(results)}`);
    assert.equal(fur.type, 'generic');
    assert.equal(fur.ingredient, undefined);
  });

  it('caps results at 10', skip, async () => {
    // "metro" matches a lot of meds — guarantees overflow before cap.
    const results = await searchDrug('metro');
    assert.ok(results.length <= 10, `expected ≤10 results, got ${results.length}`);
  });
});

describe('getDrugDetails', () => {
  let lasix: DrugSearchResult | undefined;
  let furosemide: DrugSearchResult | undefined;
  let hydrocortisone: DrugSearchResult | undefined;
  let nitroglycerin: DrugSearchResult | undefined;

  before(async () => {
    if (OFFLINE) return;
    [lasix, furosemide, hydrocortisone, nitroglycerin] = await Promise.all([
      searchDrug('lasix').then((r) => pickByName(r, 'Lasix')),
      searchDrug('furosemide').then((r) => pickByName(r, 'furosemide')),
      searchDrug('hydrocortisone').then((r) => pickByName(r, 'hydrocortisone')),
      searchDrug('nitroglycerin').then((r) => pickByName(r, 'nitroglycerin')),
    ]);
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
