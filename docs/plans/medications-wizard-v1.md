# Medications wizard v1 — Apple-Health-style multi-step add flow

**Status:** APPROVED. Plan-review subagent ran twice (initial + revised); revisions addressed all surfaced findings. PR-1 (data layer) and a cleanup PR have shipped. PR-2a, PR-2b, and PR-3 remaining.

**Lifecycle note:** This doc is a temporary working spec. Delete it when PR-3 ships and the whole wizard feature is live. Code becomes the spec post-launch (HeartNote memory-hygiene rule).

## Goal

Replace the existing single-page medication-add form (`/me/medications/new`) with a multi-step wizard modeled on Apple Health's, backed by live RxNorm data. Caregivers don't need to know exact spellings or memorize strengths — they type a drug name, RxNorm matches it, and the wizard walks them through form → strength → dose → schedule with sensible defaults at every step.

## Non-goals (explicit, do not creep)

- **No voice / Deepgram on each screen.** Deferred to a separate plan. The wizard is fully manual-input in v1.
- **No server-side RxNorm response cache.** Every wizard step calls live RxNav. NLM recommends 12-24h caching but it's deferred to a follow-up; the existing live-call latency fits the perf ACs with margin.
- **No friendly-rename of awkward RxNorm form labels** (e.g., "24Hr Skin Patch" stays as RxNorm names it). Defer until a tester is actually confused.
- **No pre-baked drug snapshot bundled with the app.** Lazy live-fetch only.
- **No dropping the `allowed_strengths` column in PR-3.** It becomes unread after PR-3 but stays in the schema; column drop is a separate follow-up.
- **No URL state for in-progress wizard form data.** Wizard state lives in component memory only. Refresh discards. Only navigation state (`?from=scan`) goes in the URL.

## Architectural decisions (locked)

1. **Live RxNav, no cache.** PR-1 ships `searchDrug` and `getDrugDetails` against `rxnav.nlm.nih.gov` directly. NLM rate limit is 20 req/s/IP; PR-1's cleanup capped fan-out at 8 concurrent so two simultaneous user searches don't trip it.
2. **Brand vs. generic via RxNorm TTY.** Search results carry an `IN` (ingredient/generic) or `BN` (brand name) tag. Brand results carry their generic ingredient as a sub-line ("Lasix · Furosemide"). No AI/LLM involved — pure API field.
3. **Single route, system back captured.** Wizard lives at `/me/medications/new` (one URL across all steps). The wizard's own back arrow advances backward through steps. The Capacitor system back gesture is intercepted to do the same — only the X (close) exits the wizard, with a confirm dialog. Avoids per-step sub-routes (cleaner code) while preserving native-feel navigation.
4. **Mobile-first viewport.** Match the existing app pattern: design for phone-sized screens (~375-414px), center on desktop with max-width ~480px so it looks intentional rather than stretched.
5. **Scan flow integration: B2.** `/me/medications/scan` keeps its current capture step + multi-card review layout. Tapping a regular detected-med card opens the wizard pre-filled with that med's extracted data. Wizard save returns to the scan page; the saved card is marked saved. Bulk "Add to my list" button is removed — every med is confirmed via the wizard. Dose-change notice cards keep Apply/Dismiss inline (do not enter the wizard). Plan Decision B2.
6. **Scan extraction extended (PR-2b).** Today's scan model returns name + strength + doses-per-day. PR-2b extends the schema and prompt to also extract `form` and `pillsPerDose` so all five wizard fields can pre-fill from a scan.
7. **`?from=scan` is the only URL state allowed for wizard navigation.** Lets the wizard return the user to `/me/medications/scan` after save (or on hard-refresh) without holding form data in the URL.

## Screen-by-screen

### 1. Search
- Drug-name input, autofocus.
- 3+ characters triggers debounced (300ms) RxNav search; up to 10 matches.
- Brand rows show generic ingredient as sub-line ("Lasix · Furosemide"). Resolved via the `searchDrug` wrapper's per-result `/related.json?tty=IN` call (already shipped).
- Tap match advances. Bottom row: "Add '<typed>' as custom medication" — proceeds with whatever was typed when RxNorm has no match.
- Continue disabled until selection.

### 2. Form
- Title: drug name (sub-line "Form" if a brand was picked).
- Heading: "Choose the medication type."
- Forms come from the `getDrugDetails` wrapper, deduped on display name.
- Brand-picked: form pre-selected; rest revealed under "Show more."
- Generic-picked: full alphabetical list, no pre-selection, Continue disabled until pick.
- Ingredient line ("Ingredients: Furosemide") shown when a brand was picked.
- Custom-path (no RxNorm match in step 1): generic fallback `[tablet, capsule, oral solution]` + Show more revealing the rest of RxNorm's universal form list.

### 3. Strength
- Title: drug name + form (e.g., "Lasix · Oral Tablet").
- Heading: "Add the medication strength."
- Pill-form + known drug → strength chips from `getDrugDetails().forms[].strengths` + Custom chip.
- Other forms (cream, ointment, drops) or unknown drug → number + unit fields, no chips.
- Unit picker: mg, mcg, g, mL, %. Pre-filled from recognized drug, overridable.

### 4. Dose / frequency
- Two questions, one screen:
  - "How many [tablets/sprays/applications/...] per dose?" — form-aware noun via `FORM_COUNT_NOUN` map (already shipped); count picker 1–20.
  - "How often per day?" — 1×–12× or "As needed (PRN)."
- Forms not in `FORM_COUNT_NOUN` (cream, ointment, oral solution, etc.) skip the count question; only frequency shown.

### 5. Times (optional)
- Only shown if step 4 picked a fixed daily count (not PRN).
- One time picker per dose. "Skip — I don't track exact times" link.

### 6. Details (optional)
- Started date + notes. Skip or Save terminates the wizard.

## Data layer (PR-1 + cleanup, both shipped)

`src/lib/medications/rxnorm.ts` exports:

- `searchDrug(query)` — top matches with name, RxCUI, brand/generic flag, ingredient (when brand). Cap 10. Filters with `looksLikeIngredientOrBrand` heuristic before TTY fan-out, capped at 8 concurrent.
- `getDrugDetails({rxcui, type, drugName, ingredientName?, ingredientRxcui?})` — forms list and per-form strengths via batched `/related.json?tty=SCDF+SCD` (single call for generic, plus a `tty=SBDF` call for brand to determine preselected form).
- `FORM_COUNT_NOUN` — discrete-dose form → singular/plural noun map for the Dose step.
- `looksLikeIngredientOrBrand` (exported for tests) — pre-TTY heuristic filter, accepts digit-bearing brands without strength notation.

1500ms shared deadline per invocation (gRPC-style propagation via single AbortController). Failures fall back to empty results; calling step shows its own error UI.

## Database schema (PR-2a)

Add to `medications` table:
- `rxcui text null` — RxNorm concept ID for the picked drug.
- `form text null` — display name (e.g., "Oral Tablet", "Cream").
- `ingredient text null` — generic ingredient name (when a brand was picked).

Existing `dose` field stays a string for display.

`drug_class` continues to be populated. When wizard supplies `rxcui`, the insert path skips name resolution and calls RxClass directly with the known RxCUI. Custom path → call existing `classifyDrugByName` on the typed string; if no match, `drug_class = 'other'`.

`allowed_strengths` stays populated only for custom-path inserts (no RxCUI). Becomes unread after PR-3 ships; column drop is a separate follow-up.

Pre-launch, zero customers — straight `ALTER TABLE add column`. No backfill. RLS unchanged (existing patient-id scope covers new columns); verified via cross-tenant select test.

## PR breakdown

| PR | Scope | Status |
|---|---|---|
| **PR-1** | RxNorm wrappers (`searchDrug`, `getDrugDetails`), `FORM_COUNT_NOUN`, integration tests | ✓ Shipped (#30, commit 861724a) |
| **Cleanup** | Batched `getDrugDetails`, fan-out cap, digit-bearing brand fix, npm script, comment fixes | ✓ Shipped (#32, commit 039afe8) |
| **PR-2a** | Six wizard screens, replaces `/me/medications/new`. Migration adds rxcui/form/ingredient columns. Server action that saves. Scan flow continues to use the old `MedicationForm` temporarily. Edit page unchanged. | **Next** |
| **PR-2b** | Extend scan extraction schema + prompt to include `form` + `pillsPerDose`. Rewire scan cards to open wizard with `?from=scan`. Bulk "Add to my list" button removed. | After PR-2a |
| **PR-3** | Port `/me/medications/<id>` edit page to wizard pattern. Retire `medications-form.tsx:83` lint warning (verified by grep test — zero `setState` inside `useEffect` across `src/app/me/medications`). Delete `lookupDrugStrengths`, `suggestedName` chip plumbing, all `allowed_strengths` reads/writes. Delete this spec doc. | After PR-2b |

## Acceptance criteria (PR-2a)

### Engineering
- Plan reviewed by fresh-context subagent before any code (re-run for PR-2a since the data layer is now shipped). **Done — findings folded in below.**
- No new abstractions or generic helpers added beyond what's described here. One blessed exception: factor an internal `classifyByRxcui(rxcui)` helper out of `classifyDrugByName` so the wizard's known-rxcui path can call it without repeating the RxClass+ATC code. `classifyDrugByName` becomes a thin wrapper that resolves the rxcui then delegates. No public-surface change.
- No incidental refactors of unrelated code.
- All RxNorm logic stays in `src/lib/medications/rxnorm.ts`. UI imports wrappers only.
- Each AC verifiable by reading specific behavior or running specific commands.
- New migration filename: `supabase/migrations/<timestamp>_medications_rxnorm_columns.sql`. `supabase db push` run before merging.
- Wizard parent component owns the shared shell (header, X button, back arrow, step indicator). Each step file renders its body only — no per-step duplication of the chrome.

### Happy path
- Type "lasix" → "Lasix · Furosemide" appears within 1.3s perceived (last keystroke → first match) on 4G.
- Tap → Form titled "Lasix · Oral Tablet," Oral Tablet preselected, Show more available.
- Show more reveals additional brand-supported forms.
- Strength pre-loads chips for known strengths + Custom.
- Pick a strength → Dose reads "How many tablets per dose?"
- 1 tablet × 2/day → Times shows 2 pickers.
- Skip Times → Details. Skip Details → save lands on `/me/medications` showing the new entry (or `/me/medications/scan` when entry URL had `?from=scan`).

### Brand vs. generic display
- "Lasix" search → top match sub-line "Furosemide."
- "Coreg" → sub-line "Carvedilol."
- "Lopressor" → sub-line "Metoprolol."
- "Furosemide" → no sub-line (it is the ingredient).

### Edge cases
- No RxNorm match → "Add '<typed>' as custom" appears; advances to Form with generic fallback list.
- Generic with many forms (hydrocortisone) → full alphabetical list, no pre-selection, Continue disabled until pick.
- Non-pill form (cream) → Strength is generic number + unit (no chips); Dose skips count picker.
- PRN frequency → Times step skipped automatically.
- Back arrow preserves prior selections and goes to previous step. (System back gesture interception is implemented but verified in PR-2b iOS device testing — see Manual verification below.)
- X (close) prompts a `window.confirm` whose copy is `"Discard the entry for ${drugName}?"` when a name has been typed; falls back to `"Discard this medication entry?"` only when step 1 is empty. No partial save. Class-B reversible-with-effort per `.claude/rules/destructive-actions.md` — typed-confirm not required.
- Refresh on any wizard step discards in-progress wizard state and returns to `/me/medications/new` empty (or `/me/medications/scan` if `?from=scan` was set).

### Error states
- RxNorm search call fails OR returns empty results OR 1500ms budget elapses → inline "Couldn't load suggestions — type to add as custom"; custom path still works. (The wrapper returns `[]` on both failure and empty match — same UX intentional.)
- RxNorm form-list call fails → step shows universal generic fallback list + small "Couldn't load full list" hint.
- RxNorm strength-list call fails → step shows generic number + unit fields with hint "Strength options unavailable; enter manually."
- Save fails (network or DB) → error banner on Details with Try again. Single `INSERT` only, no auxiliary writes — no partial DB write possible.

### Performance (4G mobile)
- Measurement protocol: Chrome DevTools → Network → "Slow 4G" preset. Stopwatch starts on the keystroke immediately preceding the call, stops on visible result paint. Median of three trials must meet the budget.
- Search results render within 1.3s perceived (last keystroke → first match visible).
- Form-list lookup renders within 2.5s.
- Strength-list lookup renders within 2.5s.

### Persistence
- One `medications` row per save with `rxcui`, `form`, `ingredient` populated when known; null for custom path.
- Custom-path rows: `rxcui = null`, `drug_class` from `classifyDrugByName` on typed string (or `'other'` if that returns nothing), `allowed_strengths = null`.
- Wizard-known-rxcui rows: `drug_class` populated via `classifyByRxcui(rxcui)` (no name resolution); `'other'` if RxClass returns no usable codes (matches existing fallback).
- In-progress wizard state lives in component memory only. No localStorage. No URL state for form data. Only `?from=scan` is read (navigation hint).
- Wizard skips `validateDoseAgainstStrengths`. RxNorm-suggested chips constrain the input on the happy path; the custom path is intentionally unvalidated (matches the "no AI blocking" discipline — caregiver knows the dose better than our heuristic).

### Permissions / RLS
- Migration adds three columns to `medications`; existing patient-id RLS still scopes them. (Adding columns does not alter row-level policy scope.)
- Manual verification, not automated test (no `supabase/tests` harness exists yet — building one is out of scope for PR-2a): sign in as caregiver A, add a wizard medication, sign in as caregiver B, confirm row is not visible in `/me/medications`.
- `medications` writes scoped to `auth.uid()` (existing).

### Side effects
- No alerts, notifications, or AI calls in the wizard. Pure data-entry feature.
- Edit page (`/me/medications/<id>`) continues to render legacy `MedicationForm` and saves correctly. Verify by editing one med post-merge — fields hydrate and save updates the row.

### Code quality (specific commitments)
- No new `useEffect` containing a `setState` derived from DB-canonical state in any new file. Debounced RxNorm-API derived state in the Search step is permitted (api response is not DB-canonical; this is exactly what `code-quality.md` §3 carves out — DB rows are canonical, remote API responses are not). The PR-3 final cleanup grep test still applies to the legacy form file, not to the wizard.
- No file in `src/app/me/medications` exceeds 300 lines.
- No clinical thresholds or strings hardcoded in wizard files.

### Manual verification
1. Mobile viewport, `/me/medications/new`.
2. Type "lasix" — match within 1.3s → tap → Form, Tablet preselected.
3. Continue → Strength chips → 40 mg → Continue → Dose 1 tablet × 2/day → Continue → Times → Continue → Details → Save.
4. `/me/medications` shows new entry "Lasix 40 mg · 1 tablet × 2/day."
5. Repeat with "bumetanide" generic — Form shows multiple options, no pre-select, Continue disabled until pick.
6. Repeat with "hydrocortisone" → Cream — Strength is generic number + unit, Dose skips count picker.
7. Search "lasx" (typo, no match) → "Add 'lasx' as custom" → Form shows generic fallback list.
8. Mid-wizard: tap X (with name "lasix" typed) → confirm dialog reads `"Discard the entry for lasix?"` → discard → land on previous page.
9. Mid-wizard: tap the wizard's back arrow → goes to previous step (not exit). Browser-back gesture leaves the route entirely (matches "refresh discards" behavior — system-back interception is iOS-only via Capacitor, deferred to device test).
10. Mid-wizard: refresh → wizard discarded, lands on empty `/me/medications/new`.
11. Visit `/me/medications/new?from=scan`, complete wizard → save lands on `/me/medications/scan`. (No scan callsite produces this URL until PR-2b; manual URL test only.)
12. Cross-tenant: sign in as caregiver A, save a wizard med, sign out, sign in as caregiver B, confirm A's row is not visible.

## Acceptance criteria (PR-2b)

### Scan extension
- `src/lib/medications/scan/schema.ts` `ExtractedMedSchema` adds `form: string | null` and `pills_per_dose: number | null` (Zod schema + Vertex `responseSchema`).
- Extraction prompt is updated to ask for both fields, with explicit guidance to leave them null when not visible on the label.
- `extracted-to-payload.ts` passes the new fields through.
- Verified against three test labels (Lasix tablet, Hydrocortisone cream, Albuterol inhaler) showing the model returns expected forms + pill counts.

### Scan rewiring
- Tapping a scan card on `/me/medications/scan` navigates to `/me/medications/new?from=scan` with all five fields (name, form, strength, doses_per_day, pills_per_dose) pre-filled in the wizard's initial state.
- Wizard save returns to `/me/medications/scan`; the corresponding card is marked saved.
- Dose-change notice cards continue to use Apply/Dismiss inline; do not open the wizard.
- Bulk "Add to my list" button removed.
- If the scanned form value isn't in the RxNorm list for the matched drug, the Form step shows no pre-selection (same path as generic).
- Scan extraction returns nothing matchable → wizard opens empty at step 1.

## Acceptance criteria (PR-3)

### Edit alignment
- `/me/medications/<id>` renders the wizard pre-filled with the row's current values.
- Save updates the existing row (uses `updateMedication`, not insert).
- Existing edit-related affordances (Stop / Restart) are preserved on the Details step or as a separate footer.

### Cleanup
- `git grep -n 'useEffect' src/app/me/medications | xargs -I{} sh -c 'grep -l "set[A-Z]" "{}"' | xargs -I{} grep -nE 'useEffect[^;]*=> *\{[^}]*set[A-Z]' {}` returns empty (zero `setState` inside any `useEffect` across the medication flow).
- `lookupDrugStrengths` server action and the `suggestedName` chip plumbing are deleted.
- All read/write sites for `medications.allowed_strengths` are removed (column itself remains for now; drop is a separate follow-up).
- This spec doc (`docs/plans/medications-wizard-v1.md`) is deleted as part of PR-3.

## Future improvements (post-PR-3, not in this plan)

- Server-side RxNorm response cache + monthly version-check cron (NLM recommends 12-24h caching).
- Voice input on each screen (Deepgram).
- Friendly-rename of awkward RxNorm form labels.
- Pre-baked drug snapshot bundled with the app for instant first-load.
- Drop the `allowed_strengths` column from `medications`.

## How a fresh session picks this up

1. Read this file end-to-end.
2. Read `src/lib/medications/rxnorm.ts` and `src/lib/medications/rxnorm.test.ts` to understand the data layer's surface.
3. Read `src/app/me/medications/medications-form.tsx`, `src/app/me/medications/actions.ts`, `src/lib/medications/classify.ts`, and the existing scan flow to understand what's being replaced.
4. Per `.claude/rules/feature-workflow.md`: dispatch a fresh plan-review subagent for PR-2a's slice (the wizard UI), revise if needed, then create a worktree under `.claude/worktrees/medications-wizard-ui` and start coding. Use real `npm install` in the worktree (symlinks break Turbopack — HeartNote-specific).
