// Unit tests for src/lib/medications/rxnorm-ndc.ts. Stubs globalThis.fetch
// rather than hitting live RxNav so the suite is hermetic. Pattern mirrors
// the structure of rxnorm.test.ts (node:test + node:assert/strict).
//
// Run from repo root:
//   npm run test:rxnorm-ndc
// Or directly:
//   node --test --experimental-strip-types src/lib/medications/rxnorm-ndc.test.ts

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveByNdc } from './rxnorm-ndc.ts';

const NDCSTATUS_OK = {
  ndcStatus: {
    status: 'ACTIVE',
    rxcui: '866428',
    conceptName: 'Midodrine Hydrochloride 2.5 MG Oral Tablet',
    ndc11: '72888011201',
  },
};

const RELATED_OK = {
  relatedGroup: {
    conceptGroup: [
      { tty: 'IN', conceptProperties: [{ rxcui: '7092', name: 'midodrine' }] },
      { tty: 'SCDF', conceptProperties: [{ rxcui: '371742', name: 'midodrine Oral Tablet' }] },
    ],
  },
};

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetch(handler: (url: string) => Promise<Response> | Response): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    return handler(url);
  }) as typeof globalThis.fetch;
}

describe('resolveByNdc', () => {
  it('resolves a known NDC to ingredient + form + strength', async () => {
    stubFetch(async (url) => {
      if (url.includes('ndcstatus')) return new Response(JSON.stringify(NDCSTATUS_OK), { status: 200 });
      if (url.includes('related')) return new Response(JSON.stringify(RELATED_OK), { status: 200 });
      throw new Error('unexpected url: ' + url);
    });

    const result = await resolveByNdc('72888-0112-01');
    assert.ok(result, 'expected non-null result');
    assert.equal(result!.rxcui, '866428');
    assert.equal(result!.ingredient, 'midodrine');
    assert.equal(result!.form, 'Oral Tablet');
    assert.equal(result!.strength, '2.5 MG');
    assert.equal(result!.canonicalName, 'Midodrine Hydrochloride 2.5 MG Oral Tablet');
  });

  it('returns null when NDC status is not ACTIVE', async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ ndcStatus: { status: 'UNKNOWN' } }), { status: 200 }),
    );
    assert.equal(await resolveByNdc('00000-0000-00'), null);
  });

  it('returns null on HTTP 500', async () => {
    stubFetch(async () => new Response('', { status: 500 }));
    assert.equal(await resolveByNdc('72888-0112-01'), null);
  });

  it('returns null when /related has no IN or SCDF group', async () => {
    stubFetch(async (url) => {
      if (url.includes('ndcstatus')) return new Response(JSON.stringify(NDCSTATUS_OK), { status: 200 });
      return new Response(JSON.stringify({ relatedGroup: { conceptGroup: [] } }), { status: 200 });
    });
    assert.equal(await resolveByNdc('72888-0112-01'), null);
  });

  it('passes both hyphenated and unhyphenated NDC strings verbatim to RxNav', async () => {
    const seen: string[] = [];
    stubFetch(async (url) => {
      seen.push(url);
      if (url.includes('ndcstatus')) return new Response(JSON.stringify(NDCSTATUS_OK), { status: 200 });
      return new Response(JSON.stringify(RELATED_OK), { status: 200 });
    });

    await resolveByNdc('72888-112-01');
    assert.ok(seen[0]?.includes('ndc=72888-112-01'));

    seen.length = 0;
    await resolveByNdc('72888011201');
    assert.ok(seen[0]?.includes('ndc=72888011201'));
  });

  it('bails on combination-product conceptName (slash-separator)', async () => {
    // RxNorm names combination products with " / " between ingredients.
    // Our parser cannot disambiguate which strength belongs to which
    // ingredient, so we return null and let the caller fall back to OCR.
    stubFetch(async (url) => {
      if (url.includes('ndcstatus')) {
        return new Response(JSON.stringify({
          ndcStatus: {
            status: 'ACTIVE',
            rxcui: '999',
            conceptName: 'Losartan 50 MG / Hydrochlorothiazide 12.5 MG Oral Tablet',
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify(RELATED_OK), { status: 200 });
    });
    assert.equal(await resolveByNdc('00000-0000-01'), null);
  });
});
