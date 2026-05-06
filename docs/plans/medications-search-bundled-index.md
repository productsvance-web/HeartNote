# Medication search — Apple-Health-style substring match via bundled RxNorm index

**Status:** Plan revised after two fresh-context reviews. Pending user approval.

**Lifecycle note:** Temporary working spec. Delete when this PR merges.

## Problem

The wizard's Search step (`src/app/me/medications/new/step-search.tsx`) calls `searchDrug` in `src/lib/medications/rxnorm.ts`, which uses RxNav's `/approximateTerm`. That endpoint ranks by edit distance, not substring. **Verified 2026-05-05** by querying `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=bum&maxEntries=1000`: returns Sun Bum sunscreens and Bum Ease across the top 1000 results — zero bumetanide, zero Bumex.

Caregivers expect Apple Health behavior: typing "bum" returns at minimum Bumex, Bumetanide, Z-Bum, Enbumyst, Nabumetone, Perindopril Erbumine, Ovalbumin — substring match across ingredient/brand names, ranked prefix > word-boundary > substring.

The wrapper's `looksLikeIngredientOrBrand` filter does not help: `/approximateTerm` simply doesn't surface bumetanide for "bum" in the first place.

## Goal

Replace the live `/approximateTerm` call with an in-memory substring search over a pre-bundled RxNorm IN+BN concept list. Selection still yields a real RxCUI so steps 2–6 of the wizard work unchanged.

## Non-goals (explicit)

- **No change to step 2+ of the wizard.** `getDrugDetails` and downstream save logic are untouched.
- **No automated cron/refresh.** Manual `npm run rxnorm:refresh` only.
- **No client-side bundle of the index.** The JSON ships in the server function bundle; the Search step calls a server action.
- **No fuzzy/edit-distance matching.** Substring only.
- **No multi-token AND search.** "metop succ" does not match "Metoprolol Succinate".
- **No hyphen-stripping normalization.** "zbum" does not match "Z-Bum".
- **No Unicode normalization.** Substring matches on ASCII; accented input yields no match.
- **No support for non-English / non-US RxNorm.**
- **No fallback to live `/approximateTerm` when the bundled index is missing.** Deploy failure, not a recoverable runtime condition. (CLAUDE.md: "no half-finished implementations.")
- **No build-time staleness rxcui-ping check.** Stale-but-loaded index degrades to "no match → custom path", which is acceptable.
- **No ingredient-field substring search.** Searching "metoprolol" matches the IN row "Metoprolol" and any BN whose name contains "metoprolol"; it does NOT match "Lopressor" (which has metoprolol as ingredient but not in its name). Accepting this limitation; widening would inflate the result set with surprising matches.

## Architectural decisions

### Decision 1: Index source is `/allconcepts.json?tty=IN+BN`

Rationale:
1. **Pre-tagged TTY and rxcui.** Each entry carries `{rxcui, name, tty, synonym?}`. `/displaynames.json` returns names only — would require lazy lookup at selection.
2. **One fewer round-trip per pick.** Decision 2 baking ingredients into the index requires rxcui+TTY at refresh time, which `/allconcepts` provides directly.

Size is not the rationale — the IN+BN-enriched index (with baked ingredient/ingredientRxcui per BN) may end up larger raw than `/displaynames.json`'s ~734KB. Empirical numbers (term counts, raw size, gzipped size) recorded in the PR description.

### Decision 2: Brand → ingredient is baked into the index at refresh time

Today's `searchDrug` resolves brand→ingredient on every search via `/related.json?tty=IN`. Moving this to selection time would regress the in-list "Lasix · Furosemide" sub-line shown today.

Fix: enrich each BN entry with `ingredient` + `ingredientRxcui` at refresh time. Refresh script does the BN→IN fan-out once monthly; runtime performs zero brand-resolution network calls.

### Decision 3: Index shape

Build-time JSON committed at `src/lib/medications/data/rxnorm-index.json`:

```json
{
  "fetchedAt": "2026-05-05T00:00:00Z",
  "concepts": [
    { "rxcui": "1808217", "name": "Bumetanide", "tty": "IN", "search": "bumetanide" },
    {
      "rxcui": "1244204",
      "name": "Bumex",
      "tty": "BN",
      "search": "bumex",
      "ingredient": "Bumetanide",
      "ingredientRxcui": "1808217"
    }
  ]
}
```

`search` is the lowercased, trimmed name. `ingredient`/`ingredientRxcui` set only when `tty === 'BN'`. Concepts sorted by rxcui ascending in the JSON for stable diffs at refresh time; runtime sorting determines visible order (Decision 4).

### Decision 4: Search algorithm — three tiers, length asc + alphabetical secondary

```
function search(query, limit=10):
  q = normalize(query)            // trim + lowercase
  if q.length < 3: return []
  tier1 = []  // c.search.startsWith(q)
  tier2 = []  // not tier1, but new RegExp(`\\b${escapeRegex(q)}`, 'i').test(c.search)
  tier3 = []  // not tier1/tier2, but c.search.includes(q)
  for c in concepts:
    if c.search.startsWith(q):     tier1.push(c)
    else if wordBoundaryMatch(c):  tier2.push(c)
    else if c.search.includes(q):  tier3.push(c)
  for tier in [tier1, tier2, tier3]:
    tier.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))
  return [...tier1, ...tier2, ...tier3].slice(0, limit)
```

Within each tier: primary sort by `name.length` ascending; secondary by alphabetical ascending. Predictable across refreshes regardless of rxcui assignment.

The `\b` regex anchors on a word boundary preceding `q` — so "z-bum" matches tier 2 (the `-` is a non-word char), but "enbumyst" does not (the `b` is preceded by `n`, a word char) and falls to tier 3.

**Note on user-listed example ordering:** the user's prompt enumerated drugs that should appear (Bumex, Bumetanide, Z-Bum, Enbumyst, Nabumetone, Perindopril Erbumine, Ovalbumin) but did not specify a strict order across tiers. The algorithm produces a deterministic order from the rules above; the AC asserts presence and tier-membership, not a specific cross-tier permutation.

### Decision 5: Server action with explicit auth guard, Zod-validated input

`searchDrug` becomes a server function. The Search step calls a thin `'use server'` wrapper at `src/app/me/medications/new/search-action.ts`:

```ts
'use server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { searchDrug, type DrugSearchResult } from '@/lib/medications/rxnorm';

const QuerySchema = z.string().trim().min(3).max(100);

export async function searchMedications(query: string): Promise<DrugSearchResult[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const parsed = QuerySchema.safeParse(query);
  if (!parsed.success) return [];
  return searchDrug(parsed.data);
}
```

Why server action vs. client bundle of the index:
- The JSON is server-only consumed; bundling to client inflates wizard first-paint cost on mobile.
- Per-keystroke calls are debounced 300ms; in-region warm-path latency is dominant.

Auth-guard verification (per `.claude/rules/auth-sessions.md` mindset — security-relevant boundary): unit test mocks `createClient` to return `{auth: {getUser: async () => ({data: {user: null}})}}` and asserts the action returns `[]`. Reproducible without curl-against-action-id-hash gymnastics.

### Decision 6: Out-of-order request handling via `useRef` counter

Server actions in Next.js do not natively cancel — a slow earlier call can resolve after a fast later call. Mitigation, client-side: a `useRef<number>` counter, incremented on each query change. Each call captures `id = ++counterRef.current`. Inside `.then()`, the closure compares `id !== counterRef.current` and bails — same pattern as the wizard's existing `controller.signal.aborted` check at `medication-wizard.tsx:69`.

`useRef` deliberately, not `useState`: closures over `useState` capture stale values across renders (per memory rule "No React state in deferred callbacks"). The existing `cancelled` flag in the effect cleanup handles unmount; the request-id ref handles in-flight reordering.

### Decision 7: Stale-index policy is "graceful degrade to custom path"

Out-of-scope failures the index handles by returning no match → existing custom-path UI fires:
- New ingredient added by NLM after the last refresh.
- Brand renamed.

Failure mode this does **not** cleanly handle: a retired/remapped rxcui. If the index has rxcui X but RxNorm has retired or remapped it, the user picks the result, the wizard fires `getDrugDetails(X)`, and the existing wrapper falls back to `{forms:[], preselectedForm:null}` → Form step shows generic fallback list. Caregiver still completes the wizard via the generic-fallback path. Suboptimal UX (no preselection) but functional. AC under Error states acknowledges this; no extra mitigation.

### Decision 8: Build-time validation, not runtime fallback

To convert "missing index" from a runtime-degradation to a deploy-time failure (solo-dev, no on-call):

A `prebuild` npm script reads `src/lib/medications/data/rxnorm-index.json`, validates the shape with the same Zod schema the runtime uses, fails the build on any error. Solves the "silent prod break" failure mode the second reviewer raised.

```json
"prebuild": "node --experimental-strip-types scripts/validate-rxnorm-index.ts"
```

If the file is missing, malformed, or empty, the build exits non-zero and Vercel marks the deploy failed. Caregivers see the previous deploy until the issue is fixed.

### Decision 9: JSON import strategy

Default approach: `import index from './data/rxnorm-index.json' with { type: 'json' }` at module scope in `rxnorm-search.ts`. Memoized by Node module cache.

The implementer **must** read `node_modules/next/dist/docs/` for Next.js 16's bundling behavior on JSON imports in `'use server'` modules before committing — per `AGENTS.md` ("This is NOT the Next.js you know"). If JSON-import inlines the data into the route's compiled JS and inflates client bundles or function size beyond acceptable bounds, fall back to runtime `fs.readFileSync(path.join(process.cwd(), 'src/lib/medications/data/rxnorm-index.json'), 'utf8')` once-at-module-init. Either way, the load happens once per cold start.

### Decision 10: Refresh script concurrency + backoff

`scripts/refresh-rxnorm-index.ts`:
- Concurrency cap: 8 in-flight requests (matches existing `MAX_PARALLEL`).
- On HTTP 429: exponential backoff starting at 2s, max 5 retries per request.
- On non-retriable error or exhausted retries: **abort the run**, write nothing. The previous index file stays committed unchanged.
- Print progress every 500 BN→IN lookups.
- On success: print term count, file size, sha256 of the output JSON, and BN-with-resolved-ingredient count.

No partial-write recovery. Better to fail and re-run than to ship a half-baked index.

## File-level changes

| File | Action | Notes |
|---|---|---|
| `src/lib/medications/rxnorm.ts` | Modify | `searchDrug` body re-routes to `searchByIndex`. Delete: `mapWithConcurrency`, `looksLikeIngredientOrBrand`, `MAX_PARALLEL`, `APPROX_OVERFETCH`, `ApproximateResponse`/`PropertyResponse` interfaces, the `/approximateTerm` and `/property` and per-result `/related?tty=IN` code paths. Keep `[rxnorm.searchDrug]` log-prefix style for any new warning paths so log-grep continuity is preserved. `getDrugDetails`, `FORM_COUNT_NOUN`, `DrugSearchResult`, `DrugDetails` exported types unchanged. |
| `src/lib/medications/rxnorm-search.ts` | Create | `loadIndex()` (memoized JSON import with optional `fs` fallback per Decision 9), `searchByIndex(query, limit)`, exported `MIN_QUERY_LEN = 3` and `IndexConceptSchema` (Zod). ≤200 lines. |
| `src/lib/medications/data/rxnorm-index.json` | Create | Committed snapshot. |
| `src/lib/medications/data/rxnorm-index.fixture.json` | Create | ~10 hand-picked entries exercising tiers (Bumetanide IN, Bumex BN with ingredient, Z-Bum BN, Nabumetone IN, Perindopril Erbumine IN, etc.). Used only by `rxnorm-search.test.ts`. |
| `scripts/refresh-rxnorm-index.ts` | Create | Per Decision 10. ≤200 lines. |
| `scripts/validate-rxnorm-index.ts` | Create | Per Decision 8. ≤50 lines. |
| `src/app/me/medications/new/search-action.ts` | Create | Per Decision 5. |
| `src/app/me/medications/new/step-search.tsx` | Modify | Replace direct `searchDrug` import with the server action. Add `useRef` request-id counter (Decision 6). Import `MIN_QUERY_LEN` from `rxnorm-search.ts` instead of redeclaring. |
| `src/lib/medications/rxnorm.test.ts` | Modify | Remove tests for `looksLikeIngredientOrBrand` (helper deleted). Remove integration tests for `searchDrug` (no longer hits the API). Keep `getDrugDetails` and `FORM_COUNT_NOUN` tests. |
| `src/lib/medications/rxnorm-search.test.ts` | Create | Offline tests against `rxnorm-index.fixture.json`: tier ordering, length+alpha tiebreakers, query length floors, "bum" presence assertions, sunscreen-check. Plus an auth-guard unit test for `searchMedications`. |
| `package.json` | Modify | Add `rxnorm:refresh` script (Decision 10) and `prebuild` script (Decision 8). |

## How this interacts with `getDrugDetails`

No behavior change. Search returns `DrugSearchResult` with the same shape: `{rxcui, name, type, ingredient?, ingredientRxcui?}`. Brand entries have ingredient/ingredientRxcui populated from the index (Decision 2). The wizard parent's `useEffect` keying on `state.selection.rxcui` works identically.

## Tradeoffs surfaced

| Decision | Cost | Benefit |
|---|---|---|
| Bundle vs. live API | 300KB–~1MB JSON in server function bundle, monthly stale window | Substring search Apple Health-style |
| `/allconcepts?tty=IN+BN` | Refresh script has to fan out BN→IN | Pre-tagged rxcui+TTY+ingredient at runtime |
| Server action vs. client bundle | Per-keystroke server round-trip | Index never ships to browsers |
| Manual monthly refresh | Human has to remember | No build flakiness, no cron infra |
| Substring tiers | More logic than `[].includes()` | Predictable Apple-Health-like ordering |
| Length+alpha tiebreaker | Doesn't always match intuitive "ingredient first" | Deterministic, refresh-stable |
| Bake brand→IN into index | Refresh slower; JSON ~30% larger | Zero brand-resolution network calls at runtime |
| Delete fallback | Index missing → search broken (deploy failure) | No half-finished code; ~150 lines deleted |
| Build-time validation (Decision 8) | One more script to maintain | Converts silent prod break into deploy failure |

**Reference-data note:** the bundled JSON is external static reference data, not user/clinical state. Code-quality §3 ("DB is source of truth") doesn't apply.

## Acceptance criteria

### Engineering — always include

- [ ] Plan stated and approved by user before any code is written.
- [ ] Plan reviewed by fresh-context subagent (this is the deliverable; revision committed).
- [ ] Implementer reads `node_modules/next/dist/docs/` for Next.js 16 JSON-import behavior in `'use server'` modules and Vercel Fluid Compute function size limits before committing the JSON-import approach. Findings (whether default JSON-import works or `fs.readFileSync` fallback is needed) recorded in PR description.
- [ ] No new abstractions or generic helpers added beyond what's listed in **File-level changes**.
- [ ] `mapWithConcurrency`, `looksLikeIngredientOrBrand`, and `MAX_PARALLEL`/`APPROX_OVERFETCH` constants are deleted from `rxnorm.ts`. Verified by `grep -rn` of those names returning zero hits across `src/`.
- [ ] Tests for `looksLikeIngredientOrBrand` (`rxnorm.test.ts`) are deleted alongside the helper.
- [ ] `MIN_QUERY_LEN = 3` exists in exactly one place (`rxnorm-search.ts`); `step-search.tsx` and `search-action.ts` import it.
- [ ] Diff scoped to the files in **File-level changes**. No drive-by edits, no formatting churn.

### Functional — happy path

- [ ] Type "bum" → result list contains both **Bumex** (BN, tier 1) and **Bumetanide** (IN, tier 1); Bumex appears above Bumetanide (length tiebreaker: 5 < 10). Verify by reading on-screen order.
- [ ] Type "bum" → result list contains, in some position, **Z-Bum** (tier 2 if present in IN+BN), **Enbumyst** (tier 3), **Nabumetone** (tier 3), **Ovalbumin** (tier 3), **Perindopril Erbumine** (tier 3) — assuming each appears in the IN+BN concept set. Strict cross-tier permutation is not asserted.
- [ ] Type "bumetanide" (full word) → top result is **Bumetanide** (IN); the result's RxCUI matches RxNorm's canonical ingredient code (`curl 'https://rxnav.nlm.nih.gov/REST/rxcui.json?name=Bumetanide'` returns the same rxcui — recorded in refresh playbook smoke test).
- [ ] Type "lasix" → top result is **Lasix** (BN); the in-list sub-line "Furosemide" renders inside the result row before the user taps (preserved behavior; ingredient is in the index per Decision 2).
- [ ] Type "carvedilol" → top result is **Carvedilol** (IN); no sub-line.
- [ ] Type "metoprolol" → top result is **Metoprolol** (IN). Brand variants whose name does not contain "metoprolol" (e.g., Lopressor, Toprol) do NOT appear — see Non-goals re: ingredient-field search.
- [ ] Pick any result → `state.selection.rxcui` is set; the wizard's existing `useEffect` fires `getDrugDetails`; Form step preselects on brand picks (e.g., Lasix → Oral Tablet) within the existing 2.5s perceived budget.

### Result ordering (formerly "Brand vs. generic ranking")

- [ ] Type "bum" → ordering follows tiers: all tier-1 entries before any tier-2; all tier-2 before tier-3. Within a tier, shorter `name.length` first; alphabetical on ties.
- [ ] Combination products (names containing " / ") never appear (IN+BN-only index). Verify: type "lisinopril hydrochlorothiazide" — none of the visible results contain `/`.
- [ ] **Sunscreen contamination check:** `grep -i 'sun bum\|bum ease\|bumblebee' src/lib/medications/data/rxnorm-index.json` returns no matches. If any are found post-refresh, document and add a curated blocklist to the refresh script before merging.

### Edge cases

- [ ] Query under 3 characters returns `[]` without invoking the index loader.
- [ ] Whitespace-only query returns `[]`.
- [ ] Query with leading/trailing whitespace is trimmed (Zod `.trim()`).
- [ ] Query exceeding 100 characters returns `[]` from the server action.
- [ ] Result limit of 10 enforced; "tab" (would match many) shows exactly 10.
- [ ] **Out-of-order responses:** with the server action artificially delayed 1500ms for the first call and 200ms for the second, typing "bu" then "bum" within 300ms results in only the "bum" results painting; the "bu" response is dropped via the `useRef` id check. Verifiable by `console.log`-ing resolution order in `.then()` during the test, removed before merge.

### Error states

- [ ] Bundled index missing or invalid JSON at deploy time → `prebuild` validation fails the Vercel build (Decision 8). Verify by deleting/corrupting the file locally, running `npm run prebuild`, and confirming non-zero exit.
- [ ] Bundled index JSON is fine but a runtime parse/load error occurs (e.g., file truncated mid-deploy) → server action throws; the existing `.catch()` in `step-search.tsx:60` sets `errored=true`; UI shows "Couldn't load suggestions — type to add as custom".
- [ ] Server action returns `[]` because user is unauthenticated → UI shows the existing empty/custom-path copy.
- [ ] Server action throws (network error, function timeout) → existing client-side `.catch()` fires; "Couldn't load suggestions" UI displays.
- [ ] **Retired rxcui:** picking a result whose rxcui has been retired by NLM since the last refresh → `getDrugDetails(rxcui)` returns empty forms → Form step renders the existing generic-fallback list. Caregiver completes wizard via the generic-fallback path; no error banner. Acknowledged limitation, no mitigation pre-launch.

### Performance

Measurement protocol: Chrome DevTools → Network → "Slow 4G". Stopwatch from the keystroke immediately preceding the call to visible result paint. Median of three trials. Run on a deployed Vercel preview, not localhost. **Implementer records the actual measured numbers in the PR description; bullets below are budgets to meet, not assertions.**

- [ ] Search result render warm path: ≤1300ms perceived. Budget held constant from the parent wizard plan as a non-regression bound; tighten in a follow-up if measurements consistently come in under ~800ms.
- [ ] Cold-start request budget: ≤2s on first call after a cold function instance. Budget includes any module-init cost from the JSON import or `fs.readFileSync`.
- [ ] Client wizard route bundle size: `me/medications/new` chunk delta < 5KB vs. `main`. Recorded in PR description.
- [ ] Function size: total Vercel function bundle for the wizard route grows by less than the raw JSON size + 100KB overhead. Recorded in PR description; flag if growth is anomalous.

### Persistence

- [ ] No DB schema change.
- [ ] `rxnorm-index.json` is the only new persisted artifact (in the repo, not the database).
- [ ] No localStorage, sessionStorage, or URL state for search.

### Permissions / RLS

- [ ] `search-action.ts` calls `auth.getUser()` and returns `[]` when unauthenticated. The auth check is enforced *inside* the action body, not relied on from the route's auth gate (server actions are public POST endpoints regardless of which page imports them).
- [ ] No Supabase tables read or written; RLS unchanged on `medications`.
- [ ] Verification: a unit test in `rxnorm-search.test.ts` mocks `createClient` to return a null user and asserts `searchMedications('bum')` returns `[]`. Runs offline, no Vercel preview required.

### Side effects

- [ ] No alerts, notifications, or AI calls.
- [ ] No outbound RxNav traffic on search keystrokes (zero — runtime path doesn't touch NLM).
- [ ] No outbound RxNav traffic on selection (BN→IN baked into the index per Decision 2).
- [ ] No change to `medications` insert behavior; `wizard-action.ts` is untouched.
- [ ] **No client-side bundle leakage of the index.** AC: after `npm run build`, `grep -r 'fetchedAt' .next/static/ --include='*.js'` returns no matches (the index's distinctive top-level field would be present if the JSON ended up in a client chunk).

### Manual verification

1. Run `npm run rxnorm:refresh`. Confirm `src/lib/medications/data/rxnorm-index.json` is created/updated; printed summary shows term count, file size in bytes, BN-with-resolved-ingredient count, and sha256 of the output JSON. Commit the result.
2. `npm run build` succeeds (prebuild validation passes).
3. `me/medications/new` route chunk size diff < 5KB vs. `main` (read from build output).
4. `npm run dev`, open `/me/medications/new`, mobile viewport (375px wide).
5. Type "bum" → within ≤1300ms, see Bumex above Bumetanide near the top.
6. Type "bumetanide" — top result is Bumetanide; tap; wizard advances to Form step with the generic-fallback list (no preselect, IN input).
7. Type "lasix" — top result is Lasix with sub-line "Furosemide" rendered before tap; tap; Form preselects Oral Tablet within 2.5s.
8. Type "lasx" (no substring match) — empty result list → "Add 'lasx' as custom medication" → tap → Form shows generic-fallback list.
9. Network tab while typing "bum": zero outbound RxNav calls; one server-action call to the wizard route.
10. Inject variable delays in `search-action.ts` (1500ms first call, 200ms thereafter); type "bu" → "bum" within 200ms → results displayed match "bum"; `console.log`s confirm reorder happened. Remove delays.
11. Sign out; trigger the action via DevTools (e.g., copy the action's POST request from a logged-in session, replay with cookies cleared) — response is empty result.
12. Run `npm run prebuild` after temporarily corrupting `rxnorm-index.json` — exits non-zero. Restore the file.
13. After `npm run build`, run the bundle-leakage grep — no matches.

## Refresh playbook (post-merge, monthly)

1. `git checkout -b chore/rxnorm-index-refresh-YYYY-MM main`.
2. `npm run rxnorm:refresh`.
3. Smoke-test: confirm `Bumetanide` rxcui in the new file matches `curl 'https://rxnav.nlm.nih.gov/REST/rxcui.json?name=Bumetanide'`. If not, abort.
4. Inspect `git diff src/lib/medications/data/rxnorm-index.json`. **If term count delta exceeds ±10%:** re-run `npm run rxnorm:refresh` once. If the delta persists and the smoke test still passes, the change is real (NLM did a batch); commit with a PR note explaining the delta. If the smoke test fails, investigate manually before committing.
5. Run sunscreen-contamination check: `grep -i 'sun bum\|bum ease' src/lib/medications/data/rxnorm-index.json`. If any matches, decide whether to add to the curated blocklist.
6. Commit and PR with title `chore: refresh RxNorm index (YYYY-MM)`.
7. Merge. Vercel rebuild picks up the new bundle automatically.

## Items deferred to PR work, not gating this plan

- Empirical comparison of `/displaynames` vs. `/allconcepts?tty=IN+BN` term counts and payload shapes (record in PR description).
- Vercel function size measurement before vs. after (record in PR description).
- Performance numbers from the budget bullets (record in PR description).
- Confirmation that `node --experimental-strip-types` works for the `rxnorm:refresh` and `prebuild` scripts on the implementer's local Node version. Project pattern is already this flag (`test:rxnorm` script). If the implementer hits Node-version friction, switch both new scripts to `tsx` or pin `engines.node` in `package.json` — small implementation choice, not a plan-level decision.
