# Medication scan — NDC-first product resolution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a prescription label carries an NDC, use that NDC as the canonical key for `drug_name`, `rxcui`, `ingredient`, `form`, and `strength` instead of trusting OCR'd text. Sig-derived fields (`doses_per_day`, `is_dose_change`) still come from OCR. Manual-entry wizard already writes `rxcui/ingredient/form` through its own action (`addMedicationFromWizard`); we don't touch that path.

**Architecture:** The vision model gains one optional output (`ndc`). When present and format-valid, the scan API resolves it through RxNav's NDC endpoints and merges canonical product fields back into the response *before* returning to the client. The scan-review card renders canonical names when resolved, OCR'd names otherwise. NDC is also persisted on the medications row so re-scans of the same bottle are recognizable. Fan-out reuses the existing `mapWithConcurrency` helper from `rxnorm.ts` for an 8-parallel cap and 1500ms deadline. The scan flow's action (`addExtractedMedications` → `insertOneMedication` in `actions.ts`) does NOT currently write `rxcui/ingredient/form`; this PR fixes that gap as part of Task 8.

**Tech Stack:** Next.js 16 App Router · TypeScript · Vertex AI / Gemini 2.5 Flash · NLM RxNav REST (no key) · Supabase (Postgres + RLS) · Vitest

---

## Context for the implementer

If you've never touched this app before, read these first (in order):

1. `CLAUDE.md` — Karpathy guidelines, no backwards-compat, build conventions
2. `AGENTS.md` — "this is NOT the Next.js you know," check `node_modules/next/dist/docs/` before writing routing code
3. `.claude/rules/code-quality.md` — anti-patterns we actively prevent
4. `.claude/rules/acceptance-criteria.md` — AC template (also reproduced at the bottom of this plan)
5. `src/lib/medications/scan/prompt.ts` — current extraction prompt
6. `src/lib/medications/scan/schema.ts` — current Zod + Vertex response schema
7. `src/lib/medications/rxnorm.ts` — existing RxNav wrapper. Read it carefully — your new `resolveByNdc` function shares its conventions (`mapWithConcurrency`, 1500ms timeout, fail-soft to empty results, PHI safety note).
8. `src/app/api/medications/scan/route.ts` — the route you'll modify
9. `src/app/me/medications/scan/scan-review-card.tsx` — the UI receiving the new fields

**Build convention #6 lives in `CLAUDE.md`:** never auto-ingest dose changes. The existing `is_dose_change` rule is sacred — do not change it. NDC-resolved canonical name does NOT override `is_dose_change=true`; that branch still renders the non-interactive notice.

**No existing tests for the scan extract module ship in this repo.** You'll be adding the first ones for `resolveByNdc`. The wizard's `match.ts` and `evaluate.ts` already have Vitest patterns to follow — `src/lib/medications/rxnorm.test.ts` is the right reference for HTTP-mock style.

---

## File structure

### Create

- `src/lib/medications/rxnorm-ndc.ts` — single export: `resolveByNdc(ndc, signal?)` → `{ rxcui, ingredient, form, strength, canonicalName } | null`. Uses `/ndcstatus.json?ndc=...` to get the NDC's active concept, then `/related.json?tty=IN+SCDF` for ingredient + form. Falls back to `null` on any failure. PHI safety: no caregiver/patient identifiers in outbound traffic — NDC alone.
- `src/lib/medications/rxnorm-ndc.test.ts` — Vitest unit tests against mocked `fetch`. Cover: happy path, NDC not found, malformed response, timeout, hyphen-format normalization.
- `supabase/migrations/<timestamp>_medications_ndc_column.sql` — `alter table public.medications add column ndc text;`. Generate timestamp with `date +%Y%m%d%H%M%S`. RLS unchanged (column-level RLS on existing patient_id policy already scopes new column).

### Modify

- `src/lib/medications/scan/prompt.ts` — remove `NDC` from the "What NOT to extract" list. Add NDC extraction guidance under "Output rules."
- `src/lib/medications/scan/schema.ts` — add `ndc: z.string().nullable()` to `ExtractedMedSchema`. Add `ndc` to `extractedMedsResponseSchema` (Vertex `responseSchema` shape).
- `src/lib/medications/scan/extract.ts` — after Vertex returns and Zod validation passes, fan out `resolveByNdc` for every med with a non-null `ndc`. Bounded concurrency, 1500ms shared deadline. Merge canonical fields into a new return shape: `ResolvedMed` (renamed wider type). Return `{ medications: ResolvedMed[], truncated }`.
- `src/app/api/medications/scan/route.ts` — no logic changes; the route already returns whatever `extractMedicationsFromImage` produces. Verify the response JSON shape matches what the client expects.
- `src/app/me/medications/scan/scan-review-card.tsx` — when `med.canonicalName` is set, render it as the drug-name input value (caregiver can still edit). Show a small "Verified" / "Read from label" badge above the input so the caregiver knows which source was used.
- `src/app/me/medications/scan/extracted-to-payload.ts` — pass through `ndc`, `rxcui`, `ingredient`, `form` from the resolved med into `MedicationPayload`. Prefer canonical name over OCR'd name when canonical exists.
- `src/app/me/medications/actions.ts` — `MedicationPayloadSchema` accepts the four new optional fields. `addExtractedMedications` and `addMedication` persist them.

### Tests added/modified

- `src/lib/medications/rxnorm-ndc.test.ts` — new
- `src/lib/medications/scan/prompt.test.ts` — new (skip if too thin; the prompt change is observable through the schema change). **DECISION:** skip. The prompt is text content; we cover the resulting schema shape via `extract.test.ts`.
- `src/lib/medications/scan/extract.test.ts` — new. Cover: extraction with NDC resolves and merges; extraction without NDC passes through unchanged; `resolveByNdc` failure leaves OCR fields intact.

### Out of scope (explicit non-goals)

- Manual-entry wizard's drug-search algorithm (`searchDrug`) and its action (`addMedicationFromWizard`) — not touched. The wizard already writes `rxcui/ingredient/form` correctly.
- Sig parsing (pills_per_dose, schedule_times). Still future work, separate plan.
- NDC-based duplicate detection ("you already added this prescription") — separate feature.
- Backfilling NDC for medications added before this PR. Pre-launch, no backfill (per CLAUDE.md no-backwards-compat rule).
- Non-US labels / international codes (PZN, GTIN). Out of scope.
- Cross-checking OCR'd drug name against NDC's canonical name and surfacing a discrepancy banner. Add to "Future improvements" — useful, but the canonical-name-replaces-OCR behavior already mitigates the wrong-bottle-wrong-photo failure mode.
- Switching to RxNav's `/ndcproperties.json` single-call endpoint as a latency optimization. The two-call approach (`/ndcstatus` + `/related?tty=IN+SCDF`) is simpler to test and bounded by the same 1500ms deadline; the marginal latency win isn't worth the response-shape uncertainty in v1. Documented in §Risks for revisit.

---

## Acceptance criteria

### Engineering — always include

- [ ] Plan stated and approved before any code is written
- [ ] No new abstractions, frameworks, or generic helpers added unless explicitly requested
- [ ] Diff scoped to the feature; no unrelated formatting changes; no refactoring outside scope
- [ ] All ACs verifiable by reading specific behavior or running specific commands
- [ ] No NDC handling for non-US labels (PZN, GTIN) — out of scope; explicitly absent

### Functional — happy path

- [ ] Photo of a US prescription label that contains a visible NDC: scan response includes `ndc` (string, format matches one of `5-4-2`, `5-3-2`, `4-4-2` hyphenated, OR 10/11 unhyphenated digits), `rxcui` (RxNorm SCD or higher), `ingredient` (lowercase generic name string), `form` (RxNorm display name e.g. `"Oral Tablet"`), `strength` (e.g. `"2.5 MG"`), `canonicalName` (e.g. `"Midodrine HCl 2.5 MG Oral Tablet"`).
- [ ] Scan-review card for an NDC-resolved med shows `canonicalName` in the Drug Name input by default, not the OCR'd `drug_name`.
- [ ] Scan-review card displays a small "Verified" badge on the drug-name cell when `canonicalName` is present, and "Read from label" otherwise.
- [ ] On save, the medications row inserts with `ndc`, `rxcui`, `ingredient`, `form` columns populated.
- [ ] When `is_dose_change=true` on a scan-extracted med, `resolveByNdc` is NOT called for that med (verifiable: no `/ndcstatus` request in the network panel for that entry); canonical fields stay null. The non-interactive notice card renders as today; build convention #6 unchanged.

### Edge cases

- [ ] Photo without NDC (handwritten med list, hospital discharge printout, screenshot of an EHR): scan response includes the meds with `ndc: null`, `rxcui: null`, `ingredient: null`, `form: null`, `canonicalName: null`. UI behavior unchanged from current.
- [ ] Photo with NDC, but RxNav returns "not found" (obscure or obsolete NDC): med entry has `ndc` populated, all RxNorm fields `null`, `canonicalName: null`. Caregiver still sees OCR'd drug_name and can save manually.
- [ ] Model returns an NDC-shaped string that fails format validation (e.g., `"561-292-4511"` — phone-number-shaped, or `"6307050"` — Rx-number-shaped, or partial like `"72888-0112"`): no RxNav call is made; med entry has `ndc` populated verbatim (transparency — caregiver sees what the model thought it saw), all RxNorm fields `null`. Verifiable: in dev tools network panel, `/ndcstatus.json` is NOT requested for that med.
- [ ] Photo with multiple meds, mix of NDC-bearing and not (e.g., one bottle photo + one printout in the same scan). Each med resolved independently.
- [ ] NDC printed in 10-digit hyphenated (`72888-112-01`), 11-digit hyphenated (`72888-0112-01`), or unhyphenated 10/11-digit (`72888011201`): all four formats round-trip through RxNav successfully. We pass the string verbatim after format-validation; RxNav handles segment-padding internally.
- [ ] First-time user, empty medications table: scan inserts the first row(s) with NDC populated.

### Error states

- [ ] RxNav timeout (slow network, NLM outage): `resolveByNdc` resolves to `null` after 1500ms. The med entry still includes OCR'd fields. No user-facing error; the caregiver simply doesn't see the canonical name.
- [ ] RxNav 5xx: same as timeout — resolves to `null`, OCR fields preserved.
- [ ] Vertex AI returns NDC in a malformed format (non-string, embedded letters, length wrong): Zod fails, the whole extraction fails with `ExtractionError('schema-fail')`. Existing 504 error path applies.
- [ ] NDC field missing entirely from Vertex response: Zod sees `null` (because we declared `nullable()`), proceed without resolution.
- [ ] All meds have NDC, all RxNav resolutions fail: response returns successfully with `rxcui: null` everywhere; user-facing UX = current behavior.

### Performance

- [ ] Scan response time with N NDC-bearing meds is bounded by `15s` (Vertex hard timeout, unchanged) + `1.5s` (RxNorm shared deadline). Total ≤ 16.5s p100. Practical p50 with 3-5 meds: under 4s.
- [ ] RxNav fan-out caps at 8 concurrent in-flight requests (matches existing wizard convention) to stay under NLM's 20 rps limit.

### Persistence

- [ ] `medications.ndc` column added (text, nullable). Pre-existing rows: NULL.
- [ ] On scan-confirm save, the inserted row has `ndc`, `rxcui`, `ingredient`, `form` populated when extraction supplied them. Wizard path remains unchanged (already writes `rxcui/ingredient/form` via `addMedicationFromWizard`).
- [ ] No client-side caching of resolved NDCs in this PR. (Separate future PR can add edge-cache or runtime-cache for popular NDCs.)

### Permissions / RLS

- [ ] `medications.ndc` inherits the existing `patient_id`-scoped RLS policies. No new policy needed; column-level RLS not required because all columns are already gated by row-level access.
- [ ] Verified manually: `\d+ medications` in `psql` against the local Supabase shows the new column without changes to the policy list.

### Side effects

- [ ] None outside the medications table. Scan-event logging unchanged. No new alerts triggered. No new audit-log rows.
- [ ] NDC is logged as a debug-level message when RxNav fails (`[rxnorm-ndc] fallback for <ndc>: <reason>`) — same pattern as `searchDrug`. Never log the response body or the image bytes.

### Manual verification

```
1. Pull this branch, run `npm install`, then `npm run dev`.
2. Visit /me/medications/scan, upload the Midodrine HCl bottle photo
   from this conversation (or any US Rx label with a visible NDC).
3. Wait ≤ 5 seconds. The review card should display:
     - Drug name = "Midodrine HCl 2.5 MG Oral Tablet" (canonical), with
       a "Verified" badge above the input.
     - Dose = "2.5 mg" (from the canonical strength).
     - Doses per day = 3 (from the OCR'd sig).
4. Confirm all three cells, tap "Add to my list," tap save in the form.
5. Open Supabase Studio (or `psql`), `select drug_name, ndc, rxcui,
   ingredient, form from medications order by created_at desc limit 1;`
   should show:
     drug_name = "Midodrine HCl 2.5 MG Oral Tablet"
     ndc = "72888-0112-01"
     rxcui = <a non-null number, the SCD rxcui>
     ingredient = "midodrine"
     form = "Oral Tablet"
6. Repeat with a screenshot of a printed med list (no NDC). Card shows
   OCR'd name, "Read from label" badge. Save still works; row has
   ndc=null, rxcui=null.
```

Reproducible in under 2 minutes per CLAUDE.md AC template.

---

## Tasks

### Task 1: DB migration — `medications.ndc` column

**Files:**
- Create: `supabase/migrations/<timestamp>_medications_ndc_column.sql`

- [ ] **Step 1: Generate the migration file with a current timestamp**

```bash
ts=$(date +%Y%m%d%H%M%S)
touch "supabase/migrations/${ts}_medications_ndc_column.sql"
echo "Created supabase/migrations/${ts}_medications_ndc_column.sql"
```

- [ ] **Step 2: Write the migration**

```sql
-- Add NDC column to medications.
--
-- Populated by the photo-scan flow when a US prescription label carries
-- an NDC (most do). The wizard's manual-entry path leaves NDC NULL.
-- Persisting NDC enables future re-scan deduplication and refill-link
-- features.
--
-- Pre-launch — no backfill, no compatibility shim.
--
-- RLS: existing patient_id policies on medications already scope this
-- column; adding a column does not alter row-level access.

alter table public.medications
  add column ndc text;
```

- [ ] **Step 3: Apply locally and verify**

```bash
supabase db push
psql "$DATABASE_URL" -c "\d public.medications" | grep ndc
```

Expected: one line, ` ndc | text |  |  | `.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(medications): add ndc column for scan-flow product identification"
```

---

### Task 2: NDC resolver — failing test first

**Files:**
- Create: `src/lib/medications/rxnorm-ndc.test.ts`
- Modify: `package.json` (add a test script for the new file)

> **Test framework note:** this repo uses Node's built-in `node:test` runner (not Vitest, not Jest). Pattern reference: `src/lib/medications/rxnorm.test.ts`. Live HTTP is replaced by stubbing `globalThis.fetch`.

- [ ] **Step 1: Write the failing test file using `node:test`**

```ts
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
```

- [ ] **Step 2: Add a test script in `package.json`**

Find the existing `"test:rxnorm"` script and add an adjacent line. Use Edit, not Write — the file has many other scripts:

```
    "test:rxnorm-ndc": "node --test --experimental-strip-types src/lib/medications/rxnorm-ndc.test.ts",
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm run test:rxnorm-ndc
```

Expected: FAIL — `ERR_MODULE_NOT_FOUND` for `./rxnorm-ndc.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/medications/rxnorm-ndc.test.ts package.json
git commit -m "test(medications): add failing tests for NDC-based RxNorm resolver"
```

---

### Task 3: NDC resolver — minimal implementation

**Files:**
- Create: `src/lib/medications/rxnorm-ndc.ts`

- [ ] **Step 1: Implement `resolveByNdc`**

```ts
// RxNav-backed resolution from a US NDC to an RxNorm concept + canonical
// product fields (ingredient, form, strength).
//
// Two endpoints:
//   1. /ndcstatus.json?ndc=<ndc> — returns active rxcui + conceptName
//      (e.g., "Midodrine Hydrochloride 2.5 MG Oral Tablet"). Status field
//      tells us whether the NDC is active, obsolete, or unknown.
//   2. /related.json?tty=IN+SCDF — given the rxcui, returns the
//      ingredient (IN) and dose form (SCDF). Form name from SCDF needs
//      the leading ingredient stripped, same as rxnorm.ts.
//
// Failure modes (all → return null, never throw):
//   - NDC unknown / obsolete → ndcStatus.status !== 'ACTIVE'
//   - HTTP non-2xx
//   - Network timeout (1500ms)
//   - Malformed JSON
//
// PHI safety: outbound payload is the NDC string only. No caregiver or
// patient identifier. NDC alone is not PHI under HIPAA — it identifies a
// drug product, not a person.

const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST';
const TIMEOUT_MS = 1500;

export interface NdcResolution {
  rxcui: string;
  ingredient: string;
  form: string;
  strength: string;
  canonicalName: string;
}

export async function resolveByNdc(
  ndc: string,
  signal?: AbortSignal,
): Promise<NdcResolution | null> {
  const trimmed = ndc.trim();
  if (!trimmed) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const statusJson = await fetchJson<NdcStatusResponse>(
      `${RXNAV_BASE}/ndcstatus.json?ndc=${encodeURIComponent(trimmed)}`,
      controller.signal,
    );

    const status = statusJson?.ndcStatus?.status;
    const rxcui = statusJson?.ndcStatus?.rxcui;
    const conceptName = statusJson?.ndcStatus?.conceptName;
    if (status !== 'ACTIVE' || !rxcui || !conceptName) {
      return null;
    }

    const relatedJson = await fetchJson<RelatedResponse>(
      `${RXNAV_BASE}/rxcui/${encodeURIComponent(rxcui)}/related.json?tty=IN+SCDF`,
      controller.signal,
    );

    const ingredient = pickConceptName(relatedJson, 'IN');
    const formRaw = pickConceptName(relatedJson, 'SCDF');
    if (!ingredient || !formRaw) return null;

    const form = stripLeadingIngredient(formRaw, ingredient);
    if (!form) return null;

    const strength = parseStrength(conceptName, ingredient, form);
    if (!strength) return null;

    return { rxcui, ingredient, form, strength, canonicalName: conceptName };
  } catch (err) {
    console.warn(`[rxnorm-ndc] fallback for ${trimmed}: ${errorReason(err)}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

interface NdcStatusResponse {
  ndcStatus?: {
    status?: string;
    rxcui?: string;
    conceptName?: string;
  };
}

interface RelatedResponse {
  relatedGroup?: {
    conceptGroup?: Array<{
      tty?: string;
      conceptProperties?: Array<{ rxcui?: string; name?: string }>;
    }>;
  };
}

function pickConceptName(json: RelatedResponse | null, tty: string): string | null {
  const groups = json?.relatedGroup?.conceptGroup ?? [];
  for (const g of groups) {
    if (g.tty === tty) {
      const n = g.conceptProperties?.[0]?.name;
      return typeof n === 'string' && n.length > 0 ? n : null;
    }
  }
  return null;
}

function stripLeadingIngredient(name: string, ingredient: string): string | null {
  const lower = name.toLowerCase();
  const ingLower = ingredient.toLowerCase();
  if (lower.startsWith(ingLower + ' ')) return name.slice(ingredient.length + 1).trim();
  return null;
}

// conceptName looks like:
//   "Midodrine Hydrochloride 2.5 MG Oral Tablet"
//   "Furosemide 40 MG Oral Tablet"
// The ingredient prefix may be the salted form ("Midodrine Hydrochloride")
// while the IN-tty ingredient is the unsalted base ("midodrine").
// Strategy: find the first numeric token, capture from there to (form-suffix).
//
// Combination products use " / " as separator — e.g.,
//   "Losartan 50 MG / Hydrochlorothiazide 12.5 MG Oral Tablet"
// Our naive "first digit to form" extraction would yield
// "50 MG / Hydrochlorothiazide 12.5 MG", which is wrong and persists as
// a corrupted strength. Many CHF-relevant meds are combos
// (HCTZ-containing ARBs, fixed-dose β-blocker pairs), so bail explicitly
// and let the caller fall back to OCR.
function parseStrength(conceptName: string, _ingredient: string, form: string): string | null {
  if (conceptName.includes(' / ')) return null;
  const suffix = ' ' + form;
  if (!conceptName.endsWith(suffix)) return null;
  const head = conceptName.slice(0, -suffix.length);
  const m = /\d/.exec(head);
  if (!m) return null;
  return head.slice(m.index).trim();
}

function errorReason(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return 'timeout';
    return err.message;
  }
  return 'unknown';
}
```

- [ ] **Step 2: Run the test to verify it passes**

```bash
npm run test:rxnorm-ndc
```

Expected: PASS, 6 tests.

- [ ] **Step 3: Lint**

```bash
npm run lint -- src/lib/medications/rxnorm-ndc.ts
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/medications/rxnorm-ndc.ts
git commit -m "feat(medications): NDC-based RxNorm resolver"
```

---

### Task 4: Add NDC to extraction schema

**Files:**
- Modify: `src/lib/medications/scan/schema.ts`

- [ ] **Step 1: Add `ndc` to `ExtractedMedSchema`**

Replace the body of `ExtractedMedSchema`:

```ts
export const ExtractedMedSchema = z.object({
  drug_name: z.string().min(1).max(200),
  dose_value: z.number().nullable(),
  dose_unit: z.string().nullable(),
  doses_per_day: z.number().int().min(1).max(12).nullable(),
  // NDC — National Drug Code, printed on US prescription labels. The
  // model returns the printed string verbatim (10 or 11 digits, hyphen-
  // separated). RxNav accepts both formats; we don't normalize here.
  // Null when no label is visible (handwritten lists, EHR screenshots)
  // or when the NDC is illegible.
  ndc: z.string().nullable(),
  // True when the label states a dose change / taper / future-dated
  // instruction. The UI renders a non-interactive notice card for these
  // and never inserts a row; build convention #6 (never recommend dose
  // changes — and never let an ambient image become one).
  is_dose_change: z.boolean(),
});
```

- [ ] **Step 2: Add `ndc` to `extractedMedsResponseSchema`**

Inside the `properties` object of items:

```ts
properties: {
  drug_name: { type: SchemaType.STRING },
  dose_value: { type: SchemaType.NUMBER, nullable: true },
  dose_unit: { type: SchemaType.STRING, nullable: true },
  doses_per_day: { type: SchemaType.INTEGER, nullable: true },
  ndc: { type: SchemaType.STRING, nullable: true },
  is_dose_change: { type: SchemaType.BOOLEAN },
},
required: ['drug_name', 'dose_value', 'dose_unit', 'doses_per_day', 'ndc', 'is_dose_change'],
```

- [ ] **Step 3: Add `ResolvedMed` type (the wider shape after RxNorm enrichment)**

Append at the bottom of the file:

```ts
// Wider shape returned to the API client. ExtractedMed = what Gemini
// produced; ResolvedMed = ExtractedMed with the optional NDC-resolved
// canonical fields merged in. The scan-review card and payload adapter
// consume this shape.
export interface ResolvedMed extends ExtractedMed {
  rxcui: string | null;
  ingredient: string | null;
  form: string | null;
  strength: string | null;
  canonicalName: string | null;
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/medications/scan/schema.ts
git commit -m "feat(medications): add ndc field + ResolvedMed type to scan schema"
```

---

### Task 5: Update extraction prompt to capture NDC

**Files:**
- Modify: `src/lib/medications/scan/prompt.ts`

- [ ] **Step 1: Remove `NDC` from the "What NOT to extract" list**

Find the line:

```
- Rx number, NDC, refill counts, refill dates.
```

Replace with:

```
- Rx number, refill counts, refill dates.
```

- [ ] **Step 2: Add NDC extraction guidance**

In the `# Output rules` section, after the bullet for `is_dose_change`, append:

```
- ndc: the National Drug Code as printed on the label, verbatim. US NDCs are 10 or 11 digits, with or without hyphens (e.g., "72888-0112-01", "72888-112-01", or "72888011201"). Return null when uncertain — false positives route to the wrong drug, false negatives are recoverable. Never invent or "fix" partial reads.
```

The format-validation regex in the API layer (extract.ts) is the actual safety net for hallucinated NDCs; this prompt addition exists to bias the model toward null on ambiguous reads.

- [ ] **Step 3: Update the comment block at the top**

Replace this paragraph:

```
//   3. Limited fields only — drug name, dose, doses-per-day. No schedule
//      times, no Rx number, no patient name, no prescriber.
```

With:

```
//   3. Limited fields — drug name, dose, doses-per-day, NDC. No schedule
//      times, no Rx number, no patient name, no prescriber. NDC is the
//      product identifier; the API enriches it server-side via RxNav so
//      the model itself does no clinical reasoning.
```

- [ ] **Step 4: Type-check + lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/medications/scan/prompt.ts
git commit -m "feat(medications): instruct extractor to read NDC from labels"
```

---

### Task 6: Wire NDC resolution into extract.ts

**Files:**
- Modify: `src/lib/medications/rxnorm.ts` (export `mapWithConcurrency` so we can reuse it; do NOT duplicate)
- Modify: `src/lib/medications/scan/extract.ts`
- Create: `src/lib/medications/scan/extract.test.ts`
- Modify: `package.json` (add a test script for the new file)

> **Test framework note:** same as Task 2 — `node:test`, not Vitest. We don't have a module-mocking facility in `node:test`, so the test design pattern is: inject the resolver via a parameter rather than mocking the import. extract.ts already takes no parameters; we'll thread an optional resolver through for testability.

- [ ] **Step 1: Export `mapWithConcurrency` from `rxnorm.ts`**

In `src/lib/medications/rxnorm.ts`, the helper is currently a private function near the bottom. Change `async function mapWithConcurrency` to `export async function mapWithConcurrency`. No other change.

Also update the comment block at the top of rxnorm.ts to note that `mapWithConcurrency` is now shared (one-line addition):

```ts
// `mapWithConcurrency` is exported and reused by scan/extract.ts for
// NDC fan-out — keeps the 8-parallel cap consistent across all RxNav-
// touching paths.
```

- [ ] **Step 2: Write failing tests for the new merged shape**

Create `src/lib/medications/scan/extract.test.ts`:

```ts
// Unit tests for the post-Vertex enrichment logic in extract.ts. We do
// not exercise the live Vertex call — instead, we test the smaller
// `enrichMedications` function (added in Task 6 step 4) which takes the
// already-validated `ExtractedMed[]` and merges in NDC-resolved fields.
//
// This split keeps the enrichment logic testable without an HTTP stub
// for Vertex (which has no test fixture in this repo) and without
// process.env Vertex credentials.
//
// Run from repo root:
//   npm run test:scan-extract

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ExtractedMed } from './schema.ts';
import type { NdcResolution } from '../rxnorm-ndc.ts';
import { enrichMedications } from './extract.ts';

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
    doses_per_day: 3,
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

  it('rejects malformed digit counts (9 digits, 12 digits, letters)', async () => {
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
    // Note: 99999-9999-99 actually IS a valid 5-4-2 format, so resolver
    // is called. It returns null, we fall back. Verifies the second
    // null-return code path.
    assert.equal(out[0].ndc, '99999-9999-99');
    assert.equal(out[0].rxcui, null);
  });
});
```

- [ ] **Step 3: Add a test script in `package.json`**

```
    "test:scan-extract": "node --test --experimental-strip-types src/lib/medications/scan/extract.test.ts",
```

- [ ] **Step 4: Run the test to verify it fails (`enrichMedications` not exported yet)**

```bash
npm run test:scan-extract
```

Expected: FAIL — `enrichMedications` not exported from `./extract.ts`.

- [ ] **Step 5: Implement `enrichMedications` and wire it into `extractMedicationsFromImage`**

In `src/lib/medications/scan/extract.ts`, update the imports at the top:

```ts
import {
  ExtractionResponseSchema,
  extractedMedsResponseSchema,
  type ExtractedMed,
  type ResolvedMed,
} from './schema';
import { EXTRACTION_SYSTEM_PROMPT } from './prompt';
import { resolveByNdc, type NdcResolution } from '@/lib/medications/rxnorm-ndc';
import { mapWithConcurrency } from '@/lib/medications/rxnorm';
```

Add a new exported helper near the bottom of the file (above the existing closing brace, after `extractMedicationsFromImage`). The function takes an injected resolver to keep it unit-testable without HTTP stubs:

```ts
const NDC_FAN_OUT_LIMIT = 8;

// FDA-valid NDC segment patterns: 5-4-2, 5-3-2, 4-4-2 (hyphenated, 10
// digits) plus unhyphenated 10/11-digit forms (manufacturer stock /
// HIPAA-canonical). Validation is the primary safety net for hallucinated
// NDCs that the structured-output schema can't prevent — e.g., the model
// might emit a phone number, Rx number, or lot code into the `ndc` field
// when uncertain. Reject these before they cost a NLM round-trip.
function isValidNdcFormat(ndc: string): boolean {
  return /^(?:\d{5}-\d{4}-\d{2}|\d{5}-\d{3}-\d{2}|\d{4}-\d{4}-\d{2}|\d{10,11})$/.test(ndc);
}

// Exported for unit test in extract.test.ts. The resolver is injected
// rather than imported because node:test doesn't have module-mocking;
// callers in production use `resolveByNdc` directly (see
// extractMedicationsFromImage below).
export async function enrichMedications(
  meds: readonly ExtractedMed[],
  resolver: (ndc: string) => Promise<NdcResolution | null>,
): Promise<ResolvedMed[]> {
  return mapWithConcurrency(meds, NDC_FAN_OUT_LIMIT, async (med): Promise<ResolvedMed> => {
    // Three guards stack here:
    //   1. is_dose_change=true → never enrich. Build convention #6.
    //   2. ndc is null or empty → no enrichment possible.
    //   3. ndc fails format validation → don't waste a RxNav call.
    if (med.is_dose_change || !med.ndc || !isValidNdcFormat(med.ndc)) {
      return { ...med, rxcui: null, ingredient: null, form: null, strength: null, canonicalName: null };
    }
    const r = await resolver(med.ndc);
    if (!r) {
      return { ...med, rxcui: null, ingredient: null, form: null, strength: null, canonicalName: null };
    }
    return { ...med, ...r };
  });
}
```

Then replace the bottom of `extractMedicationsFromImage` (from the `validation.success` check onward):

```ts
  const validation = ExtractionResponseSchema.safeParse(parsed);
  if (!validation.success) {
    console.warn('[extractMedicationsFromImage] schema-fail');
    throw new ExtractionError('schema-fail');
  }

  const all = validation.data.medications;
  const truncated = all.length > MAX_MEDS;
  const trimmed = all.slice(0, MAX_MEDS);
  const enriched = await enrichMedications(trimmed, resolveByNdc);

  return { medications: enriched, truncated };
}
```

Update the function signature to return the wider type:

```ts
export async function extractMedicationsFromImage(
  bytes: Uint8Array,
  mimeType: 'image/jpeg' | 'image/png',
): Promise<{ medications: ResolvedMed[]; truncated: boolean }>
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
npm run test:scan-extract
```

Expected: PASS, 7 tests.

- [ ] **Step 7: Type-check + lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 0 errors. (You'll catch downstream consumers — `extracted-to-payload.ts`, `scan-review-card.tsx`, `actions.ts` — Tasks 7-9 fix them.)

If type-check has errors only in those files: that's expected; commit and proceed.

- [ ] **Step 8: Commit**

```bash
git add src/lib/medications/rxnorm.ts src/lib/medications/scan/extract.ts src/lib/medications/scan/extract.test.ts package.json
git commit -m "feat(medications): enrich scan output with NDC-resolved RxNorm fields"
```

---

### Task 7: Update payload adapter to forward canonical fields

**Files:**
- Modify: `src/app/me/medications/scan/extracted-to-payload.ts` (surgical edits — preserve the existing comment)

- [ ] **Step 1: Update the type import**

Find:

```ts
import type { ExtractedMed } from '@/lib/medications/scan/schema';
```

Replace with:

```ts
import type { ResolvedMed } from '@/lib/medications/scan/schema';
```

- [ ] **Step 2: Update the function signature**

Find:

```ts
export function extractedMedToPayload(med: ExtractedMed): MedicationPayload {
```

Replace with:

```ts
export function extractedMedToPayload(med: ResolvedMed): MedicationPayload {
```

- [ ] **Step 3: Replace the dose-string composition to prefer RxNorm strength**

Find:

```ts
  const dose =
    med.dose_value !== null && med.dose_unit !== null && med.dose_unit.trim().length > 0
      ? `${med.dose_value} ${med.dose_unit.toLowerCase().trim()}`
      : '';
```

Replace with:

```ts
  // Prefer RxNorm canonical strength when the NDC resolved. Falls back
  // to OCR'd dose_value + dose_unit otherwise. Empty string when
  // neither source has a usable value.
  const dose = med.strength
    ? med.strength.toLowerCase().trim()
    : med.dose_value !== null && med.dose_unit !== null && med.dose_unit.trim().length > 0
      ? `${med.dose_value} ${med.dose_unit.toLowerCase().trim()}`
      : '';
```

- [ ] **Step 4: Add the four new fields to the returned payload**

Find:

```ts
  return {
    drugName: med.drug_name.trim(),
    dose,
```

Replace with:

```ts
  return {
    drugName: (med.canonicalName ?? med.drug_name).trim(),
    dose,
```

Then find the existing `notes: '',` line and append four lines after it (inside the same return object):

```ts
    notes: '',
    ndc: med.ndc,
    rxcui: med.rxcui,
    ingredient: med.ingredient,
    form: med.form,
  };
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors in `actions.ts` (`MedicationPayload` doesn't have `ndc/rxcui/ingredient/form` yet) and `scan-review-card.tsx` (consumes `ExtractedMed`, now expects `ResolvedMed`). These are fixed in Tasks 8 and 9.

- [ ] **Step 6: Commit**

```bash
git add src/app/me/medications/scan/extracted-to-payload.ts
git commit -m "feat(medications): scan-payload adapter prefers RxNorm canonical fields over OCR"
```

---

### Task 8: Persist NDC + RxNorm fields in the action

**Files:**
- Modify: `src/app/me/medications/actions.ts`

> **Read the existing file first** (`Read src/app/me/medications/actions.ts`). It defines `MedicationPayloadSchema`, `MedicationPayload`, the shared `insertOneMedication` helper (line ~118), `addMedication` (line ~175), and `addExtractedMedications` (line ~215). Both action paths route writes through `insertOneMedication`, so we only need to modify the schema and that one helper.

- [ ] **Step 1: Add fields to `MedicationPayloadSchema`**

In the schema (search for `MedicationPayloadSchema = z.object({`), add these fields alongside the existing ones (preserve order — group them at the bottom of the object):

```ts
    ndc: z.string().nullable().optional(),
    rxcui: z.string().nullable().optional(),
    ingredient: z.string().nullable().optional(),
    form: z.string().nullable().optional(),
```

- [ ] **Step 2: Add the fields to the insert mapping in `insertOneMedication`**

The function builds an object passed to `supabase.from('medications').insert({...})`. Add these four lines alongside the existing keys (group at the bottom of the insert object):

```ts
      ndc: payload.ndc ?? null,
      rxcui: payload.rxcui ?? null,
      ingredient: payload.ingredient ?? null,
      form: payload.form ?? null,
```

> Note: the Task 1 migration added `ndc` only. `rxcui`, `ingredient`, `form` already exist as columns (per `supabase/migrations/20260505002059_medications_rxnorm_columns.sql`) but no code currently writes them. This step is what populates them for the first time. Both `addMedication` and `addExtractedMedications` now write the new fields automatically because they share `insertOneMedication`.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: actions.ts errors gone. Only remaining error should be `scan-review-card.tsx` (Task 9).

- [ ] **Step 4: Commit**

```bash
git add src/app/me/medications/actions.ts
git commit -m "feat(medications): persist ndc/rxcui/ingredient/form via insertOneMedication"
```

---

### Task 9: Scan-review card uses canonical name + source badge

**Files:**
- Modify: `src/app/me/medications/scan/scan-review-card.tsx`

- [ ] **Step 1: Update the `Props.med` type**

Replace:

```ts
import type { ExtractedMed } from '@/lib/medications/scan/schema';
```

With:

```ts
import type { ResolvedMed } from '@/lib/medications/scan/schema';
```

And update `interface Props`:

```ts
interface Props {
  med: ResolvedMed;
  onSkip: () => void;
  onAdded: () => void;
  disabled?: boolean;
}
```

- [ ] **Step 2: Default the drug-name input to canonical when present**

In `EditableCard`, replace:

```ts
const [drugName, setDrugName] = useState(med.drug_name);
```

With:

```ts
const initialDrugName = med.canonicalName ?? med.drug_name;
const [drugName, setDrugName] = useState(initialDrugName);
```

- [ ] **Step 3: Default the dose to canonical strength when present**

Replace:

```ts
const initialDoseValue =
  med.dose_value !== null ? String(med.dose_value) : '';
const initialDoseUnit =
  med.dose_unit !== null && med.dose_unit.trim().length > 0
    ? med.dose_unit.toLowerCase().trim()
    : 'mg';
```

With:

```ts
// Prefer RxNorm-derived strength over OCR'd dose when both are present.
const canonicalDoseSplit = med.strength ? splitStrength(med.strength) : null;
const initialDoseValue =
  canonicalDoseSplit?.value ??
  (med.dose_value !== null ? String(med.dose_value) : '');
const initialDoseUnit =
  canonicalDoseSplit?.unit ??
  (med.dose_unit !== null && med.dose_unit.trim().length > 0
    ? med.dose_unit.toLowerCase().trim()
    : 'mg');
```

And add this helper at the bottom of the file (above `Cell`):

```ts
// Split an RxNorm strength like "2.5 MG" or "10 MG/ML" into (value, unit).
// Returns null on unparseable input — caller falls back to OCR.
function splitStrength(s: string): { value: string; unit: string } | null {
  const m = /^(\d+(?:\.\d+)?)\s+(.+)$/.exec(s.trim());
  if (!m) return null;
  return { value: m[1], unit: m[2].toLowerCase() };
}
```

- [ ] **Step 4: Add a "Verified" / "Read from label" badge inline above the drug-name input**

The `Cell` component is shared by all three confirm rows (Drug name, Dose, Doses per day). Adding a `badge` prop would change the shared component for one consumer's needs — that's adjacent-code creep. Instead, inline the badge as a sibling element above the input field, inside the existing `<Cell label="Drug name" ...>`'s children.

Find the `<Cell label="Drug name" ...>` block:

```tsx
<Cell
  label="Drug name"
  confirmed={drugNameOK}
  onConfirm={() => setDrugNameOK((v) => !v)}
>
  <input
    className={inputClass}
    value={drugName}
    onChange={(e) => {
      setDrugName(e.target.value);
      setDrugNameOK(false);
    }}
    placeholder="Lasix"
  />
</Cell>
```

Replace with:

```tsx
<Cell
  label="Drug name"
  confirmed={drugNameOK}
  onConfirm={() => setDrugNameOK((v) => !v)}
>
  <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
    {med.canonicalName ? 'Verified' : 'Read from label'}
  </p>
  <input
    className={inputClass}
    value={drugName}
    onChange={(e) => {
      setDrugName(e.target.value);
      setDrugNameOK(false);
    }}
    placeholder="Lasix"
  />
</Cell>
```

The `Cell` component itself is left untouched.

- [ ] **Step 5: Pass canonical fields through when calling `extractedMedToPayload`**

In the `if (expanded)` block, replace the `initialPayload` line with:

```ts
const initialPayload = extractedMedToPayload({
  drug_name: drugName,
  dose_value: doseValue.trim() ? Number(doseValue) : null,
  dose_unit: doseValue.trim() ? doseUnit : null,
  doses_per_day: dosesPerDay,
  is_dose_change: false,
  ndc: med.ndc,
  rxcui: med.rxcui,
  ingredient: med.ingredient,
  form: med.form,
  strength: med.strength,
  canonicalName: med.canonicalName,
});
```

- [ ] **Step 6: Type-check + lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 0 errors anywhere.

- [ ] **Step 7: Commit**

```bash
git add src/app/me/medications/scan/scan-review-card.tsx
git commit -m "feat(medications): scan card prefers canonical name + shows source badge"
```

---

### Task 10: Manual end-to-end verification

- [ ] **Step 1: Apply migration**

```bash
supabase db push
```

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

- [ ] **Step 3: Run the manual verification flow from the AC section**

Use the bottle photo from the conversation (Midodrine HCl 2.5 mg, NDC 72888-0112-01) or any US Rx label.

- [ ] **Step 4: Verify DB row**

```bash
psql "$DATABASE_URL" -c "select drug_name, ndc, rxcui, ingredient, form from medications order by created_at desc limit 1;"
```

Expected: all five columns populated with non-null values. `drug_name` = canonical RxNorm string.

- [ ] **Step 5: Negative test — NDC-less photo**

Take a photo of a printed med list (or a screenshot of any non-Rx-bottle source) and confirm:
- The card shows "Read from label" badge
- The OCR'd drug name is preserved
- Save still works
- The DB row has `ndc=null, rxcui=null, ingredient=null, form=null`

- [ ] **Step 6: Negative test — NDC for an obsolete/unknown product**

Print or hand-mock a label showing `NDC: 00000-0000-00` (a structurally-valid but non-existent NDC that RxNav's `/ndcstatus` will return as `UNKNOWN`). Confirm the card renders OCR'd drug name with the "Read from label" badge and saves successfully with `rxcui=null/ingredient=null/form=null`.

---

### Task 11: Final lint, build, and PR

- [ ] **Step 1: Full lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 2: Full type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Run all `node:test` scripts**

```bash
npm run test:rxnorm && npm run test:rxnorm-ndc && npm run test:scan-extract
```

Expected: every test passes. (`test:rxnorm` hits live NLM; the other two are hermetic and pass offline.)

- [ ] **Step 4: Production build (timeout 300s, never background per CLAUDE.md)**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin medications-scan-ndc-first
gh pr create --title "feat(medications): NDC-first product resolution for photo scan" --body "$(cat <<'EOF'
## Summary
- Vision model now extracts NDC alongside drug name, dose, and frequency.
- Server resolves NDC → canonical RxNorm fields (rxcui, ingredient, form, strength, canonicalName) via RxNav before returning to the client.
- Scan-review card shows canonical name with a "Verified" badge; OCR-only meds show "Read from label".
- New `medications.ndc` column persists the bottle's NDC for future re-scan + refill features.
- Manual-entry wizard untouched.

## Test plan
- [ ] Bottle photo with NDC: card renders canonical name, save populates ndc/rxcui/ingredient/form
- [ ] Photo without NDC (med list, screenshot): card renders OCR'd name, save populates only base fields
- [ ] NDC for obsolete/unknown product: graceful fallback to OCR
- [ ] `is_dose_change=true` still renders the non-interactive notice (build convention #6 unchanged)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Watch checks**

```bash
gh pr checks --watch
```

- [ ] **Step 7: After green, merge from the main worktree (not from this one — see CLAUDE.md `Git / PR`)**

```bash
cd ~/Desktop/heartnote
gh pr merge --squash
git worktree remove .claude/worktrees/medications-scan-ndc-first
git branch -D medications-scan-ndc-first
git pull --ff-only origin main
```

---

## Risks and decisions worth flagging in plan-review

1. **Resolution latency on the scan response.** Each NDC adds up to 1500ms to the scan response. With 5 meds and serial-worst-case, that's 7.5s on top of Vertex's ~3-5s. The `Promise.all` here is concurrent across meds, so practically the wall-clock cost is bounded by the slowest single resolution. Verify under realistic conditions; if it's too slow, move resolution to the confirm-click path.
2. **NDC format validation is in scope.** At 70k-account scale (~3.5M extractions/year, plausible 1-3% hallucination rate), free RxNav calls still become an NLM-relationship liability without validation. The regex `^(?:\d{5}-\d{4}-\d{2}|\d{5}-\d{3}-\d{2}|\d{4}-\d{4}-\d{2}|\d{10,11})$` accepts the three FDA-valid hyphenated segment patterns AND unhyphenated 10/11-digit forms (manufacturer stock and HIPAA-canonical). RxNav handles segment-padding internally; we just validate shape and pass through. The prompt's terse null guidance (Task 5) handles ambiguous reads at the model layer.
3. **Badge UX wording.** Settled on "Verified" / "Read from label" — caregiver-friendly, no jargon, still transparent about the source. Could iterate to icon-only when we have user feedback. The badge is rendered inline as a sibling of the drug-name input rather than passed as a prop to the shared `Cell` component, to avoid mutating shared UI for one consumer.
4. **Splitting strength into value+unit.** `splitStrength` only handles the simple `\d+ UNIT` form. RxNorm uses compound forms like `"10 MG/ML"`, `"5 MG/2.5 MG"`, `"5 %"`. Compound forms fall through to OCR — fine for v1 since most ambulatory CHF meds are single-strength solids. Document in code comment.
5. **No cross-check between OCR'd drug_name and canonical name.** A photo of bottle A with bottle B's NDC partially obscured wouldn't be flagged. The user's manual confirm step is the safety net. Add an explicit mismatch banner if reviewers feel the safety net is too thin.
6. **`is_dose_change=true` interaction with NDC — now enforced as a test.** A taper label might still carry an NDC (the prescription was for a real drug; the *instructions* are the dose-change). Today, dose-change rows render a non-interactive notice and don't insert. We must NOT enrich with NDC fields when `is_dose_change=true`, even at the data layer — defense in depth in case a future code change exposes that branch. `enrichMedications` in extract.ts checks `is_dose_change` first and returns the unenriched record with all canonical fields null. Test in extract.test.ts asserts the resolver is never called for `is_dose_change=true` rows. Build convention #6 (CLAUDE.md) territory — load-bearing, not optional.

7. **Two-call resolver (`/ndcstatus` + `/related?tty=IN+SCDF`) vs. one-call (`/ndcproperties.json`).** RxNav exposes a `/ndcproperties.json?id=<ndc>` endpoint that returns ingredient + form + strength + rxcui in a single response. The plan uses the two-call approach because (a) it shares the parsing pattern with the existing typed-wizard resolver, (b) the response shape is fully spec'd in code we already read, and (c) both calls are bounded by the same 1500ms shared deadline so the latency win is bounded. Worth revisiting after we have live latency telemetry — if p95 of the second call is meaningful, switch.

---

## Deferred — must ship before public launch (NOT in this PR)

The following items are explicitly deferred but bound to a launch-gate trigger so they don't quietly disappear into "someday."

- **Runtime cache for `resolveByNdc`.** NLM asks RxNav consumers to cache responses 12-24h. At pre-launch scale (zero customers) caching adds complexity for no realized benefit, so we ship without it. **Trigger to add caching: any of (a) onboarding-stage testers reach 100, (b) scan endpoint hits 500 invocations/day, (c) public-launch readiness review — whichever comes first.** Implementation: Vercel runtime cache with key `rxnav:ndc:<ndc>`, TTL 24h, cache MISS falls through to RxNav. Single function wrap in `rxnorm-ndc.ts`.

## Future improvements (no launch-gate, evaluate as needs emerge)

- Cross-check OCR'd name against canonical name; flag mismatches as a discrepancy banner. (Caregiver's Confirm step is the current safety net.)
- Re-scan deduplication using NDC + ingestion timestamp. ("You already added this prescription.")
- Refill reminder generation linked by NDC.
- Compound-strength parsing in `splitStrength` (handles `10 MG/ML`, `5 MG/2.5 MG`, `5 %`).
- Backfill RxNorm fields for pre-existing rows whose drug names we can resolve.
- Confidence signal from the vision model (`ndc_present_on_label: boolean` paired with `ndc: string | null`) to split the existence call from the value extraction. Add if observed hallucination rate exceeds the prompt's null-bias guidance.
