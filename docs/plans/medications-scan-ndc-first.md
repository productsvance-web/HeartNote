# Medication scan — NDC-first product resolution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a prescription label carries an NDC, use that NDC as the canonical key for `drug_name`, `rxcui`, `ingredient`, `form`, and `strength` instead of trusting OCR'd text. Sig-derived fields (`doses_per_day`, `is_dose_change`) still come from OCR. Manual-entry wizard path is untouched.

**Architecture:** The vision model gains one optional output (`ndc`). When present, the scan API resolves it through RxNav's NDC endpoints (`/ndcstatus` + `/related`) and merges canonical product fields back into the response *before* returning to the client. The scan-review card renders canonical names when resolved, OCR'd names otherwise. NDC is also persisted on the medications row so re-scans of the same bottle are recognizable. Fan-out is concurrency-bounded and 1500ms-deadlined, matching the existing typed-wizard resolver.

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
- `src/app/me/medications/scan/scan-review-card.tsx` — when `med.canonicalName` is set, render it as the drug-name input value (caregiver can still edit). Show a small "From RxNorm" / "From label" badge so caregiver knows which source was used.
- `src/app/me/medications/scan/extracted-to-payload.ts` — pass through `ndc`, `rxcui`, `ingredient`, `form` from the resolved med into `MedicationPayload`. Prefer canonical name over OCR'd name when canonical exists.
- `src/app/me/medications/actions.ts` — `MedicationPayloadSchema` accepts the four new optional fields. `addExtractedMedications` and `addMedication` persist them.

### Tests added/modified

- `src/lib/medications/rxnorm-ndc.test.ts` — new
- `src/lib/medications/scan/prompt.test.ts` — new (skip if too thin; the prompt change is observable through the schema change). **DECISION:** skip. The prompt is text content; we cover the resulting schema shape via `extract.test.ts`.
- `src/lib/medications/scan/extract.test.ts` — new. Cover: extraction with NDC resolves and merges; extraction without NDC passes through unchanged; `resolveByNdc` failure leaves OCR fields intact.

### Out of scope (explicit non-goals)

- Manual-entry wizard's name-based search (`searchDrug`) — not touched.
- Sig parsing (pills_per_dose, schedule_times). Still future work, separate plan.
- NDC-based duplicate detection ("you already added this prescription") — separate feature.
- Backfilling NDC for medications added before this PR. Pre-launch, no backfill (per CLAUDE.md no-backwards-compat rule).
- Non-US labels / international codes (PZN, GTIN). Out of scope.
- Cross-checking OCR'd drug name against NDC's canonical name and surfacing a discrepancy banner. Add to "Future improvements" — useful, but the canonical-name-replaces-OCR behavior already mitigates the wrong-bottle-wrong-photo failure mode.

---

## Acceptance criteria

### Engineering — always include

- [ ] Plan stated and approved before any code is written
- [ ] No new abstractions, frameworks, or generic helpers added unless explicitly requested
- [ ] Diff scoped to the feature; no unrelated formatting changes; no refactoring outside scope
- [ ] All ACs verifiable by reading specific behavior or running specific commands
- [ ] No NDC handling for non-US labels (PZN, GTIN) — out of scope; explicitly absent

### Functional — happy path

- [ ] Photo of a US prescription label that contains a visible NDC: scan response includes `ndc` (string, format `\d{4,5}-\d{3,4}-\d{1,2}`), `rxcui` (RxNorm SCD or higher), `ingredient` (lowercase generic name string), `form` (RxNorm display name e.g. `"Oral Tablet"`), `strength` (e.g. `"2.5 MG"`), `canonicalName` (e.g. `"Midodrine HCl 2.5 MG Oral Tablet"`).
- [ ] Scan-review card for an NDC-resolved med shows `canonicalName` in the Drug Name input by default, not the OCR'd `drug_name`.
- [ ] Scan-review card displays a small "From RxNorm" badge on the drug-name cell when `canonicalName` is present, and "From label" otherwise.
- [ ] On save, the medications row inserts with `ndc`, `rxcui`, `ingredient`, `form` columns populated.

### Edge cases

- [ ] Photo without NDC (handwritten med list, hospital discharge printout, screenshot of an EHR): scan response includes the meds with `ndc: null`, `rxcui: null`, `ingredient: null`, `form: null`, `canonicalName: null`. UI behavior unchanged from current.
- [ ] Photo with NDC, but RxNav returns "not found" (obscure or obsolete NDC): med entry has `ndc` populated, all RxNorm fields `null`, `canonicalName: null`. Caregiver still sees OCR'd drug_name and can save manually.
- [ ] Model returns an NDC-shaped string that fails format validation (e.g., `"561-292-4511"` — phone-number-shaped, or `"6307050"` — Rx-number-shaped, or partial like `"72888-0112"`): no RxNav call is made; med entry has `ndc` populated verbatim (transparency — caregiver sees what the model thought it saw), all RxNorm fields `null`. Verifiable: in dev tools network panel, `/ndcstatus.json` is NOT requested for that med.
- [ ] Photo with multiple meds, mix of NDC-bearing and not (e.g., one bottle photo + one printout in the same scan). Each med resolved independently.
- [ ] NDC printed in 10-digit format (`72888-112-01`) versus 11-digit (`72888-0112-01`): both formats round-trip through RxNav successfully. We pass the string verbatim; RxNav handles segment-padding.
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
- [ ] On scan-confirm save, the inserted row has `ndc`, `rxcui`, `ingredient`, `form` populated when extraction supplied them. Manual-entry wizard rows still populate `rxcui/ingredient/form` (unchanged from current behavior) and write `ndc: NULL`.
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
       a "From RxNorm" badge.
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
   OCR'd name, "From label" badge. Save still works; row has ndc=null,
   rxcui=null.
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

- [ ] **Step 1: Write the failing test file**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveByNdc } from './rxnorm-ndc';

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
      {
        tty: 'IN',
        conceptProperties: [{ rxcui: '7092', name: 'midodrine' }],
      },
      {
        tty: 'SCDF',
        conceptProperties: [
          { rxcui: '371742', name: 'midodrine Oral Tablet' },
        ],
      },
    ],
  },
};

describe('resolveByNdc', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('resolves a known NDC to ingredient + form + strength', async () => {
    const mockFetch = vi.fn(async (url: string) => {
      if (url.includes('ndcstatus')) {
        return new Response(JSON.stringify(NDCSTATUS_OK), { status: 200 });
      }
      if (url.includes('related')) {
        return new Response(JSON.stringify(RELATED_OK), { status: 200 });
      }
      throw new Error('unexpected url: ' + url);
    });
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

    const result = await resolveByNdc('72888-0112-01');
    expect(result).not.toBeNull();
    expect(result!.rxcui).toBe('866428');
    expect(result!.ingredient).toBe('midodrine');
    expect(result!.form).toBe('Oral Tablet');
    expect(result!.strength).toBe('2.5 MG');
    expect(result!.canonicalName).toBe('Midodrine Hydrochloride 2.5 MG Oral Tablet');
  });

  it('returns null when NDC is not found', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ndcStatus: { status: 'UNKNOWN' } }), { status: 200 }),
    ) as unknown as typeof globalThis.fetch;

    expect(await resolveByNdc('00000-0000-00')).toBeNull();
  });

  it('returns null on HTTP 500', async () => {
    globalThis.fetch = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof globalThis.fetch;
    expect(await resolveByNdc('72888-0112-01')).toBeNull();
  });

  it('returns null on timeout', async () => {
    globalThis.fetch = vi.fn(
      () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error('AbortError')), 2000)),
    ) as unknown as typeof globalThis.fetch;
    expect(await resolveByNdc('72888-0112-01')).toBeNull();
  });

  it('accepts both 10-digit (5-3-2) and 11-digit (5-4-2) formats verbatim', async () => {
    const seen: string[] = [];
    globalThis.fetch = vi.fn(async (url: string) => {
      seen.push(url);
      if (url.includes('ndcstatus')) {
        return new Response(JSON.stringify(NDCSTATUS_OK), { status: 200 });
      }
      return new Response(JSON.stringify(RELATED_OK), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    await resolveByNdc('72888-112-01');
    expect(seen[0]).toContain('ndc=72888-112-01');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- src/lib/medications/rxnorm-ndc.test.ts
```

Expected: FAIL — `Cannot find module './rxnorm-ndc'`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/medications/rxnorm-ndc.test.ts
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
function parseStrength(conceptName: string, _ingredient: string, form: string): string | null {
  const suffix = ' ' + form;
  if (!conceptName.endsWith(suffix)) return null;
  const head = conceptName.slice(0, -suffix.length);
  // First digit position
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
npm test -- src/lib/medications/rxnorm-ndc.test.ts
```

Expected: PASS, 5 tests.

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

- [ ] **Step 2: Add NDC extraction guidance with strong null bias**

In the `# Output rules` section, after the bullet for `is_dose_change`, append:

```
- ndc: the National Drug Code as printed on the label, verbatim (e.g., "72888-0112-01" or "72888-112-01"). Hyphen-separated, 10 or 11 digits total.

  **When in doubt, return null.** Returning null is the correct, safe answer — the caregiver still sees the OCR'd drug name and can save the medication manually. A hallucinated NDC routes them to the wrong drug, which is worse than missing the NDC entirely. False negatives are recoverable; false positives are not.

  Set null when ANY of the following is true:
  - No NDC is printed on the source (handwritten lists, EHR screenshots, OTC packaging without an NDC visible, hospital discharge papers).
  - You see digits-with-hyphens that might be an NDC but might also be a phone number, Rx number, store number, or barcode caption — if you cannot tell with certainty, return null.
  - The NDC is partially obscured, blurry, or any character is illegible.
  - The NDC fails the FDA-mandated digit pattern (5-3-2, 5-4-2, or 4-4-2 segments). Do not "correct" or "complete" a partial NDC.

  Only return a value when you can read every digit unambiguously and the format matches one of the FDA segments above.
```

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
- Modify: `src/lib/medications/scan/extract.ts`
- Create: `src/lib/medications/scan/extract.test.ts`

- [ ] **Step 1: Write failing tests for the new merged shape**

Create `src/lib/medications/scan/extract.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock both Vertex AI and the RxNorm-NDC resolver so we can exercise the
// merge logic in extract.ts in isolation. Vitest auto-mocks aren't quite
// right for this — manual mocks below.

vi.mock('@google-cloud/vertexai', async () => {
  const actual = await vi.importActual<typeof import('@google-cloud/vertexai')>(
    '@google-cloud/vertexai',
  );
  return {
    ...actual,
    VertexAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: () => ({
        generateContent: vi.fn(),
      }),
    })),
  };
});

vi.mock('@/lib/medications/rxnorm-ndc', () => ({
  resolveByNdc: vi.fn(),
}));

import { extractMedicationsFromImage } from './extract';
import { resolveByNdc } from '@/lib/medications/rxnorm-ndc';
import { VertexAI, FinishReason } from '@google-cloud/vertexai';

const FAKE_BYTES = new Uint8Array([0xff, 0xd8, 0xff]);

function mockGenerateContent(responseJson: unknown) {
  const generateContent = vi.fn(async () => ({
    response: {
      candidates: [
        {
          finishReason: FinishReason.STOP,
          content: { parts: [{ text: JSON.stringify(responseJson) }] },
        },
      ],
    },
  }));
  (VertexAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
    getGenerativeModel: () => ({ generateContent }),
  }));
  return generateContent;
}

describe('extractMedicationsFromImage with NDC enrichment', () => {
  beforeEach(() => {
    process.env.GOOGLE_VERTEX_AI_PROJECT_ID = 'test';
    process.env.GOOGLE_VERTEX_AI_LOCATION = 'us-east1';
    process.env.GOOGLE_VERTEX_AI_CREDENTIALS_JSON = Buffer.from('{}').toString('base64');
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('merges resolveByNdc result into the extracted med', async () => {
    mockGenerateContent({
      medications: [
        {
          drug_name: 'MIDODRINE HCL 2.5MG TABS',
          dose_value: 2.5,
          dose_unit: 'mg',
          doses_per_day: 3,
          ndc: '72888-0112-01',
          is_dose_change: false,
        },
      ],
    });
    (resolveByNdc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      rxcui: '866428',
      ingredient: 'midodrine',
      form: 'Oral Tablet',
      strength: '2.5 MG',
      canonicalName: 'Midodrine Hydrochloride 2.5 MG Oral Tablet',
    });

    const out = await extractMedicationsFromImage(FAKE_BYTES, 'image/jpeg');
    expect(out.medications).toHaveLength(1);
    const m = out.medications[0];
    expect(m.ndc).toBe('72888-0112-01');
    expect(m.rxcui).toBe('866428');
    expect(m.ingredient).toBe('midodrine');
    expect(m.form).toBe('Oral Tablet');
    expect(m.canonicalName).toBe('Midodrine Hydrochloride 2.5 MG Oral Tablet');
  });

  it('leaves canonical fields null when NDC is null', async () => {
    mockGenerateContent({
      medications: [
        {
          drug_name: 'Furosemide 40 mg',
          dose_value: 40,
          dose_unit: 'mg',
          doses_per_day: 1,
          ndc: null,
          is_dose_change: false,
        },
      ],
    });
    (resolveByNdc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const out = await extractMedicationsFromImage(FAKE_BYTES, 'image/jpeg');
    expect(out.medications[0].rxcui).toBeNull();
    expect(out.medications[0].canonicalName).toBeNull();
    // Verify resolveByNdc was not called at all when ndc is null
    expect(resolveByNdc).not.toHaveBeenCalled();
  });

  it('leaves canonical fields null when resolveByNdc returns null', async () => {
    mockGenerateContent({
      medications: [
        {
          drug_name: 'Mystery drug',
          dose_value: null,
          dose_unit: null,
          doses_per_day: null,
          ndc: '99999-9999-99',
          is_dose_change: false,
        },
      ],
    });
    (resolveByNdc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const out = await extractMedicationsFromImage(FAKE_BYTES, 'image/jpeg');
    expect(out.medications[0].ndc).toBe('99999-9999-99');
    expect(out.medications[0].rxcui).toBeNull();
  });

  it('skips the RxNav call entirely when NDC fails format validation', async () => {
    mockGenerateContent({
      medications: [
        {
          drug_name: 'Suspicious',
          dose_value: 10,
          dose_unit: 'mg',
          doses_per_day: 1,
          // Phone-number-shaped string that the model might hallucinate as
          // an NDC. We must not waste a RxNav round-trip on this.
          ndc: '561-292-4511',
          is_dose_change: false,
        },
      ],
    });

    const out = await extractMedicationsFromImage(FAKE_BYTES, 'image/jpeg');
    expect(resolveByNdc).not.toHaveBeenCalled();
    expect(out.medications[0].ndc).toBe('561-292-4511');
    expect(out.medications[0].rxcui).toBeNull();
    expect(out.medications[0].canonicalName).toBeNull();
  });

  it('accepts the three FDA-valid NDC formats (5-4-2, 5-3-2, 4-4-2)', async () => {
    const formats = ['72888-0112-01', '00378-112-01', '0777-3105-02'];
    for (const ndc of formats) {
      mockGenerateContent({
        medications: [
          {
            drug_name: 'Test',
            dose_value: 1,
            dose_unit: 'mg',
            doses_per_day: 1,
            ndc,
            is_dose_change: false,
          },
        ],
      });
      (resolveByNdc as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        rxcui: '1', ingredient: 'x', form: 'Oral Tablet', strength: '1 MG', canonicalName: 'Test',
      });
      await extractMedicationsFromImage(FAKE_BYTES, 'image/jpeg');
      expect(resolveByNdc).toHaveBeenLastCalledWith(ndc);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails (the merge code doesn't exist yet)**

```bash
npm test -- src/lib/medications/scan/extract.test.ts
```

Expected: FAIL — properties `rxcui`, `ingredient`, `form`, `canonicalName` don't exist on returned items.

- [ ] **Step 3: Implement merge in `extract.ts`**

In `src/lib/medications/scan/extract.ts`, replace the bottom of `extractMedicationsFromImage` (from the `validation.success` check onward) with:

```ts
  const validation = ExtractionResponseSchema.safeParse(parsed);
  if (!validation.success) {
    console.warn('[extractMedicationsFromImage] schema-fail');
    throw new ExtractionError('schema-fail');
  }

  const all = validation.data.medications;
  const truncated = all.length > MAX_MEDS;
  const trimmed = all.slice(0, MAX_MEDS);

  const enriched = await Promise.all(
    trimmed.map(async (med): Promise<ResolvedMed> => {
      // Skip RxNav round-trip for null NDC (no label printed) or for
      // any string that doesn't match the three FDA-valid NDC segment
      // patterns (5-4-2, 5-3-2, 4-4-2). The structured-output schema
      // can't prevent the model from hallucinating an NDC-shaped string
      // when uncertain (e.g., a phone number, Rx number, lot code), and
      // at scale a wasted call per scan compounds. Validation is also
      // a hint to NLM that we're a polite RxNav consumer.
      if (!med.ndc || !isValidNdcFormat(med.ndc)) {
        return { ...med, rxcui: null, ingredient: null, form: null, strength: null, canonicalName: null };
      }
      const r = await resolveByNdc(med.ndc);
      if (!r) {
        return { ...med, rxcui: null, ingredient: null, form: null, strength: null, canonicalName: null };
      }
      return { ...med, ...r };
    }),
  );

  return { medications: enriched, truncated };
}

// FDA NDC segments are 5-4-2, 5-3-2, or 4-4-2 digits, hyphen-separated.
// Total digits = 10. Anything else is either a non-NDC value the model
// fabricated, or a corrupted read.
function isValidNdcFormat(ndc: string): boolean {
  return /^(?:\d{5}-\d{4}-\d{2}|\d{5}-\d{3}-\d{2}|\d{4}-\d{4}-\d{2})$/.test(ndc);
}
```

Update the imports at the top to include `ResolvedMed`:

```ts
import {
  ExtractionResponseSchema,
  extractedMedsResponseSchema,
  type ResolvedMed,
} from './schema';
import { EXTRACTION_SYSTEM_PROMPT } from './prompt';
import { resolveByNdc } from '@/lib/medications/rxnorm-ndc';
```

Remove the now-unused `ExtractedMed` import since the function returns `ResolvedMed`.

Update the function signature:

```ts
export async function extractMedicationsFromImage(
  bytes: Uint8Array,
  mimeType: 'image/jpeg' | 'image/png',
): Promise<{ medications: ResolvedMed[]; truncated: boolean }>
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- src/lib/medications/scan/extract.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Type-check + lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: 0 errors. (You'll catch downstream consumers — `extracted-to-payload.ts`, `scan-review-card.tsx`, `route.ts` — Tasks 7-9 fix them.)

If type-check has errors only in those three files: that's expected; commit and proceed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/medications/scan/extract.ts src/lib/medications/scan/extract.test.ts
git commit -m "feat(medications): enrich scan output with NDC-resolved RxNorm fields"
```

---

### Task 7: Update payload adapter to forward canonical fields

**Files:**
- Modify: `src/app/me/medications/scan/extracted-to-payload.ts`

- [ ] **Step 1: Update the import + signature**

Replace the file body with:

```ts
// Adapter at the boundary between the API output schema (Gemini's shape:
// dose_value + dose_unit as separate fields, doses_per_day nullable for
// PRN, plus optional NDC-resolved canonical fields) and the form payload
// schema (a single `dose: string` matching DOSE_FORMAT). Architectural
// decision #17 in the plan.
//
// When `canonicalName` is present, we prefer the RxNorm canonical name
// over the OCR'd `drug_name` — RxNorm is the source of truth for product
// identity. When `strength` is present, we prefer it over the OCR'd
// dose_value/dose_unit pair (same reasoning).

import type { ResolvedMed } from '@/lib/medications/scan/schema';
import type { MedicationPayload } from '../actions';

export function extractedMedToPayload(med: ResolvedMed): MedicationPayload {
  const drugName = med.canonicalName?.trim() || med.drug_name.trim();

  // Strength from RxNorm wins over OCR'd dose if present. RxNorm strings
  // are already lowercase-friendly after .toLowerCase().
  let dose: string;
  if (med.strength) {
    dose = med.strength.toLowerCase().trim();
  } else if (
    med.dose_value !== null &&
    med.dose_unit !== null &&
    med.dose_unit.trim().length > 0
  ) {
    dose = `${med.dose_value} ${med.dose_unit.toLowerCase().trim()}`;
  } else {
    dose = '';
  }

  return {
    drugName,
    dose,
    pillsPerDose: 1,
    dosesPerDay: med.doses_per_day,
    scheduleTimes: null,
    startedAt: '',
    notes: '',
    ndc: med.ndc,
    rxcui: med.rxcui,
    ingredient: med.ingredient,
    form: med.form,
  };
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors in `actions.ts` (`MedicationPayload` doesn't have `ndc/rxcui/ingredient/form` yet) and `scan-review-card.tsx` (consumes `ExtractedMed`, now expects `ResolvedMed`). These are fixed in Tasks 8 and 9.

- [ ] **Step 3: Commit**

```bash
git add src/app/me/medications/scan/extracted-to-payload.ts
git commit -m "feat(medications): scan-payload adapter prefers RxNorm canonical fields over OCR"
```

---

### Task 8: Persist NDC + RxNorm fields in the action

**Files:**
- Modify: `src/app/me/medications/actions.ts`

> **Read the existing file first** (`Read src/app/me/medications/actions.ts`). It defines `MedicationPayloadSchema`, `MedicationPayload`, `addMedication`, `addExtractedMedications`. The schema is Zod; you'll add four optional fields. The insert mappers in `addMedication` and `addExtractedMedications` need to write the four columns.

- [ ] **Step 1: Add fields to `MedicationPayloadSchema`**

In the schema (search for `MedicationPayloadSchema = z.object({`), add these fields alongside the existing ones:

```ts
ndc: z.string().nullable().optional(),
rxcui: z.string().nullable().optional(),
ingredient: z.string().nullable().optional(),
form: z.string().nullable().optional(),
```

- [ ] **Step 2: Add fields to the insert mapping in `addMedication`**

In the function that inserts into `medications` (search for `.from('medications')` and `.insert(`), add these to the insert object:

```ts
ndc: payload.ndc ?? null,
rxcui: payload.rxcui ?? null,
ingredient: payload.ingredient ?? null,
form: payload.form ?? null,
```

> Note: the migration in Task 1 added `ndc` only. `rxcui`, `ingredient`, `form` already exist (per `supabase/migrations/20260505002059_medications_rxnorm_columns.sql`).

- [ ] **Step 3: Same for `addExtractedMedications`**

Find the equivalent insert in `addExtractedMedications` and add the same four fields.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: actions.ts errors gone. Only remaining error should be `scan-review-card.tsx` (Task 9).

- [ ] **Step 5: Commit**

```bash
git add src/app/me/medications/actions.ts
git commit -m "feat(medications): persist ndc + rxnorm fields from scan flow"
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

- [ ] **Step 4: Add a "From RxNorm" / "From label" badge to the drug-name cell**

In the JSX where `<Cell label="Drug name" ...>` is rendered, replace it with a Cell that includes a badge:

```tsx
<Cell
  label="Drug name"
  badge={med.canonicalName ? 'From RxNorm' : 'From label'}
  confirmed={drugNameOK}
  onConfirm={() => setDrugNameOK((v) => !v)}
>
```

Then update the `Cell` component signature:

```tsx
function Cell({
  label,
  badge,
  confirmed,
  onConfirm,
  children,
}: {
  label: string;
  badge?: string;
  confirmed: boolean;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
          {badge && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">
              {badge}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={onConfirm}
          aria-label={confirmed ? 'Mark not confirmed' : 'Confirm'}
          className={
            confirmed
              ? 'flex items-center gap-1 rounded-full bg-foreground text-background px-2.5 py-1 text-xs font-semibold'
              : 'flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground'
          }
        >
          <Check size={12} />
          {confirmed ? 'Confirmed' : 'Confirm'}
        </button>
      </div>
      {children}
    </div>
  );
}
```

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
- The card shows "From label" badge
- The OCR'd drug name is preserved
- Save still works
- The DB row has `ndc=null, rxcui=null, ingredient=null, form=null`

- [ ] **Step 6: Negative test — NDC for an obsolete/unknown product**

If you can find one (or simulate by editing the DOM to inject a bogus NDC into the response), confirm the card falls back to OCR fields.

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

- [ ] **Step 3: Full test suite**

```bash
npm test
```

Expected: all tests pass.

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
- Scan-review card shows canonical name with a "From RxNorm" badge; OCR-only meds keep "From label" behavior.
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
2. **NDC format validation is in scope.** Reversed an earlier decision after thinking through 70k-account scale: at ~3.5M extractions/year and a plausible 1-3% hallucination rate, even free RxNav calls become an NLM-relationship liability without validation. Plan now validates with `^(?:\d{5}-\d{4}-\d{2}|\d{5}-\d{3}-\d{2}|\d{4}-\d{4}-\d{2})$` (the three FDA-valid segment patterns) before calling RxNav. Combined with strengthened null-bias guidance in the prompt (Task 5), false positives should be rare.
3. **"From RxNorm" badge UX.** Caregivers may not know what "RxNorm" is. Alternative: "Verified" / "Unverified" or icon-only. Settled on "From RxNorm / From label" because pre-launch with no caregivers, transparency > polish; revisit when we have user feedback.
4. **Splitting strength into value+unit.** `splitStrength` only handles the simple `\d+ UNIT` form. RxNorm uses compound forms like `"10 MG/ML"`, `"5 MG/2.5 MG"`, `"5 %"`. Compound forms fall through to OCR — fine for v1 since most ambulatory CHF meds are single-strength solids. Document in code comment.
5. **No cross-check between OCR'd drug_name and canonical name.** A photo of bottle A with bottle B's NDC partially obscured wouldn't be flagged. The user's manual confirm step is the safety net. Add an explicit mismatch banner if reviewers feel the safety net is too thin.
6. **`is_dose_change=true` interaction with NDC.** A taper label might still carry an NDC (the prescription was for a real drug; the *instructions* are the dose-change). Today, dose-change rows render a non-interactive notice and don't insert. We should NOT enrich with NDC fields and persist them when `is_dose_change=true`. The current scan-review-card path already early-returns on `is_dose_change=true` — verify in code review that the `addExtractedMedications` path doesn't somehow let dose-change rows through.

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
