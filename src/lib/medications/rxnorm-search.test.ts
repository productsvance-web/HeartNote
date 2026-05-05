// Offline tests for the bundled-index search. Exercises the real
// production index (committed under data/rxnorm-index.json) — no network,
// no fixture file. Tests assert stable properties (e.g., Bumex's name
// length is shorter than Bumetanide's) that survive monthly refreshes.
//
// Run from repo root:
//   npm run test:rxnorm

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { authedSearch, searchByIndex } from './rxnorm-search.ts';
import { MIN_QUERY_LEN, type DrugSearchResult } from './rxnorm.ts';

describe('MIN_QUERY_LEN', () => {
  it('is 3', () => {
    assert.equal(MIN_QUERY_LEN, 3);
  });
});

describe('searchByIndex — query length floors', () => {
  it('returns [] for empty query', () => {
    assert.deepEqual(searchByIndex(''), []);
  });

  it('returns [] for whitespace-only query', () => {
    assert.deepEqual(searchByIndex('   '), []);
  });

  it('returns [] for query under 3 chars', () => {
    assert.deepEqual(searchByIndex('la'), []);
    assert.deepEqual(searchByIndex('bu'), []);
  });

  it('trims leading/trailing whitespace before applying the length floor', () => {
    assert.deepEqual(searchByIndex('  bu  '), []);
  });
});

describe('searchByIndex — "bum" (regression for /approximateTerm bug)', () => {
  const results = searchByIndex('bum', 50);

  it('returns Bumex (BN, tier 1)', () => {
    const bumex = results.find((r) => r.name === 'Bumex');
    assert.ok(bumex, 'expected Bumex in results');
    assert.equal(bumex.type, 'brand');
    assert.equal(bumex.ingredient, 'Bumetanide');
  });

  it('returns Bumetanide (IN, tier 1)', () => {
    const bumetanide = results.find((r) => r.name === 'Bumetanide');
    assert.ok(bumetanide, 'expected Bumetanide in results');
    assert.equal(bumetanide.type, 'generic');
  });

  it('orders Bumex above Bumetanide (length tiebreaker: 5 < 10)', () => {
    const bumexIdx = results.findIndex((r) => r.name === 'Bumex');
    const bumetanideIdx = results.findIndex((r) => r.name === 'Bumetanide');
    assert.ok(bumexIdx >= 0 && bumetanideIdx >= 0);
    assert.ok(
      bumexIdx < bumetanideIdx,
      `Bumex (idx ${bumexIdx}) should rank above Bumetanide (idx ${bumetanideIdx})`
    );
  });

  it('does not return any sunscreen / non-drug consumer brand', () => {
    // The original /approximateTerm bug returned "Sun Bum" sunscreens and
    // "Bum Ease" balms for the query "bum". The IN+BN-filtered index
    // excludes these by construction — guard against regression.
    const offenders = results.filter((r) =>
      /sun bum|bum ease/i.test(r.name)
    );
    assert.deepEqual(offenders, [], 'unexpected consumer brand contamination');
  });
});

describe('searchByIndex — full-word ingredient', () => {
  it('"bumetanide" returns Bumetanide as the top result', () => {
    const results = searchByIndex('bumetanide');
    assert.ok(results.length > 0);
    assert.equal(results[0].name, 'Bumetanide');
    assert.equal(results[0].type, 'generic');
    // RxCUI 1808 is RxNorm's canonical ingredient code for bumetanide.
    assert.equal(results[0].rxcui, '1808');
  });

  it('"furosemide" returns Furosemide as the top result, no sub-line', () => {
    const results = searchByIndex('furosemide');
    assert.ok(results.length > 0);
    assert.equal(results[0].name, 'Furosemide');
    assert.equal(results[0].type, 'generic');
    assert.equal(results[0].ingredient, undefined);
  });

  it('"carvedilol" returns Carvedilol as the top result', () => {
    const results = searchByIndex('carvedilol');
    assert.ok(results.length > 0);
    assert.equal(results[0].name, 'Carvedilol');
    assert.equal(results[0].type, 'generic');
  });
});

describe('searchByIndex — brand → ingredient', () => {
  it('"lasix" returns Lasix BN with ingredient Furosemide', () => {
    const results = searchByIndex('lasix');
    const lasix = results.find((r) => r.name === 'Lasix');
    assert.ok(lasix, 'expected Lasix in results');
    assert.equal(lasix.type, 'brand');
    assert.equal(lasix.ingredient, 'Furosemide');
    assert.ok(lasix.ingredientRxcui, 'expected ingredientRxcui on brand');
  });

  it('"coreg" returns Coreg BN with ingredient Carvedilol', () => {
    const results = searchByIndex('coreg');
    const coreg = results.find((r) => r.name === 'Coreg');
    assert.ok(coreg);
    assert.equal(coreg.type, 'brand');
    assert.equal(coreg.ingredient, 'Carvedilol');
  });
});

describe('searchByIndex — combinations excluded', () => {
  it('no result name contains a "/" (combination products are excluded by IN+BN-only index)', () => {
    const results = searchByIndex('lisinopril', 50);
    const withSlash = results.filter((r) => r.name.includes('/'));
    assert.deepEqual(withSlash, []);
  });
});

describe('searchByIndex — limit', () => {
  it('respects the default limit of 10', () => {
    const results = searchByIndex('tab');
    assert.ok(results.length <= 10);
  });

  it('respects an explicit limit', () => {
    const results = searchByIndex('tab', 3);
    assert.ok(results.length <= 3);
  });
});

describe('searchByIndex — DrugSearchResult shape compatibility', () => {
  it('returns the same shape rxnorm.ts type defines', () => {
    const results = searchByIndex('lasix');
    if (results.length === 0) return;
    const r: DrugSearchResult = results[0];
    assert.ok(typeof r.rxcui === 'string');
    assert.ok(typeof r.name === 'string');
    assert.ok(r.type === 'brand' || r.type === 'generic');
  });
});

describe('authedSearch — auth and input boundaries', () => {
  it('returns [] when userId is null (unauthenticated)', () => {
    assert.deepEqual(authedSearch(null, 'bum'), []);
    assert.deepEqual(authedSearch(null, 'lasix'), []);
    assert.deepEqual(authedSearch(null, 'bumetanide'), []);
  });

  it('returns results for an authenticated user with a valid query', () => {
    const results = authedSearch('user-abc', 'bum');
    assert.ok(results.length > 0);
    assert.ok(results.some((r) => r.name === 'Bumex'));
  });

  it('returns [] when the query is shorter than MIN_QUERY_LEN', () => {
    assert.deepEqual(authedSearch('user-abc', 'bu'), []);
    assert.deepEqual(authedSearch('user-abc', '  '), []);
  });

  it('returns [] when the query exceeds 100 characters', () => {
    const tooLong = 'a'.repeat(101);
    assert.deepEqual(authedSearch('user-abc', tooLong), []);
  });

  it('trims whitespace before validation', () => {
    const results = authedSearch('user-abc', '  bum  ');
    assert.ok(results.length > 0);
  });
});
