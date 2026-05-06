# Medications scan — Apple-style review + schedule (post-PR-37)

**Branch:** `medications-apple-review`
**Predecessor:** PR #37 (`e6e5e66`) — NDC-first medication scan
**Handoff source:** carried-forward bugs from on-device test of PR #37 preview build

## Pre-work — done before plan

| Step | Status | Evidence |
|---|---|---|
| `supabase db push` to apply `20260505210110_medications_ndc_column.sql` to the linked project | done | `supabase migration list` shows local + remote in sync; push applied one migration |
| `npm run db:types` to round-trip the manual edit from PR #37 | done | Regen produced zero diff against `src/lib/supabase/types.ts` |

## Carried-forward bugs (from handoff)

### B1 — Dose number-input renders empty after NDC-verified scan
On Midodrine HCl bottle (NDC `72888-0112-01`), the **Verified** badge shows and the unit dropdown defaults to `mg`, but the dose number field is blank. Should display `2.5`.

**Visual rule-out (subagent finding):** NOT visual. Width math at 390px viewport gives ~260px for the number input — `2.5` cannot clip. No `color: transparent`, no overlay. Most likely cause: `med.strength` arrives in a format `splitStrength()` can't parse (e.g. `"2.5MG"` no space) OR `med.strength` is null while `canonicalName` is populated. Browser-side confirmation: Safari Web Inspector on the input → check `value` prop. If `""`, state bug; if `"2.5"` and invisible, then revisit visual.

### B2 — `doses_per_day` defaulted to PRN when bottle says TID
LLM extraction returned `doses_per_day: null` (PRN) instead of `3`. **Resolution per handoff:** stop extracting `doses_per_day` from the label entirely; let the caregiver set it on a dedicated schedule step.

**KEEP `is_dose_change`.** Per handoff: that is a safety guard, not a convenience flag. Independent of whether we extract a schedule, the LLM should still detect "take 1 today, 2 tomorrow"-style instability instructions on the label and surface the dose-change notice card. Build convention #6 (never recommend dose changes) applies.

### B3 — Drug name shows full RxNorm `conceptName`
Currently displays `"midodrine hydrochloride 2.5 MG Oral Tablet"` (raw RxNav `name` field). Should be split: ingredient + strength + form, each in its own stacked display field. Map RxNorm form vocabulary to ours (`"Oral Tablet"` → `"tablet"`). Per `feedback_normalize_rxnorm_forms.md`.

### B4 — UX redesign borrowing Apple Health's *feel*, not its layout
Reference screenshots from caregiver (the Apple Health post-scan card and Set-a-Schedule screen). What we adopt:

- One decision per screen — kill the three-Confirm-cells pattern.
- Progressive flow: **capture → read-only product summary → schedule → done.**
- Big primary CTA pinned to the bottom of each step.
- Drug name, generic, strength, form rendered as separate stacked display fields, not smashed into one string.

What we do NOT adopt:
- Apple's pure-black chrome — keep HeartNote's warm/cream palette.
- Apple's brand-first naming — see B5.

### B5 — Bottle text primary, brand secondary
Apple displays `"Orvaten"` (brand) when the bottle is generic Midodrine. **We don't.** Show what's printed on the bottle as the primary name; brand can be a small secondary line at most.

---

## Why Step 2 (schedule) is in scope now

Reminders feature is the planned consumer of `schedule_times`. The schedule screen here lays the groundwork so reminders can ship without re-prompting the caregiver. If reminders slip, this screen still produces no harm — schedule data is stored, ignored elsewhere.

## Out of scope (explicitly)

- HealthKit medication-pull integration. Separate spike; depends on whose phone the app runs on (caregiver vs patient — see `project_positioning.md`).
- Cadence variants beyond Every Day / PRN ("Every Other Day", "MWF"). CHF meds are daily-or-PRN; defer until a real case appears.
- Per-time quantity variance (different pill counts at different times). `pills_per_dose` stays at the existing default of 1; Furosemide-style split-dose patterns get one entry per dose with the same `pills_per_dose=1`.
- Editing existing medications via this flow. Only the new-add path from scan changes; the existing wizard and edit flows stay as-is.
- Per-med schedule prompting inside **AddAll**. AddAll saves all detected meds with empty `schedule_times` and `doses_per_day = null` (PRN). Rationale: AddAll is the "trust the OCR, save the products" path; making it ask schedule per-med defeats its purpose. Caregivers set reminders later from `/me/medications`. Post-AddAll toast: "X added. Set reminder times in Medications when ready."

---

## Architecture decisions

### A1 — `doses_per_day` is no longer extracted
- LLM `extract.ts` schema drops the `doses_per_day` field. Prompt updated to no longer ask for frequency.
- `ResolvedMed` schema (`schema.ts`) drops `doses_per_day`.
- DB column stays — caregiver fills it on the schedule step.

### A2 — `is_dose_change` stays
- LLM still extracts `is_dose_change: boolean` per label.
- Dose-change-flagged meds still render the non-interactive notice card (current behavior preserved).
- Build convention #6 test stays.

### A3 — Display name composition (inline, no helper)
Inside the Step 1 component, render two stacked text rows:
- **Primary row:** the LLM's OCR'd `drug_name` if present (preserving what's printed on the bottle), else `ingredient`, else `canonicalName`. Title Case via a `toTitleCase` cast for display only — raw OCR string preserved for save.
- **Secondary row:** `ingredient` only if `primary` came from OCR and differs from `ingredient` (case-insensitive). Otherwise null. Never auto-substitute RxNorm's brand for an OCR'd generic.

No new helper module. Logic lives where it's consumed.

### A4 — Form-vocabulary normalization (co-located with `FORM_COUNT_NOUN`)
Add `FORM_DISPLAY` map to existing `src/lib/medications/rxnorm.ts` (same file as `FORM_COUNT_NOUN`):
```ts
export const FORM_DISPLAY: Record<string, string> = {
  'Oral Tablet': 'tablet',
  'Sublingual Tablet': 'tablet',
  'Oral Capsule': 'capsule',
  'Extended Release Oral Capsule': 'capsule',
  'Oral Solution': 'solution',
  'Injectable Solution': 'injection',
};
export function normalizeForm(raw: string | null): string | null {
  if (!raw) return null;
  return FORM_DISPLAY[raw] ?? raw.toLowerCase();
}
```

Persistence rule: `medications.form` already stores RxNorm verbatim per PR #37 — confirmed in `extracted-to-payload.ts:24`. Normalization is display-only. No new column.

### A5 — Strength parsing fallback
`splitStrength()` currently expects `"<num> <unit>"`. Add fallbacks in priority order:
1. Existing regex against `med.strength`.
2. Same regex against the tail of `med.canonicalName` for the **single-ingredient case**. **Combination products** (canonicalName containing `" / "`) are explicitly skipped here — predecessor PR's `parseStrength` already returned null for combos, so canonicalName-tail-parse would also return null. For combos, fall through to (3).
3. OCR `med.dose_value` + `med.dose_unit`.
4. Empty (caller fills).

No telemetry — drop the unjustified path from the original draft.

### A6 — Single component, two-step state (no split)
Keep the file `scan-review-card.tsx`. Internalize a `step: 'review' | 'schedule'` state. No new orchestrator component. The dose-change-flagged branch still short-circuits before `step` is read (current behavior preserved).

- **`step === 'review'`** — Read-only stacked display of drug name (primary + optional secondary), strength, form, with `Verified` or `Read from label` badge. Single "This looks right" CTA pinned to bottom of card. Skip + Take another are secondary text links.
- **`step === 'schedule'`** — Caregiver-driven inputs: cadence (default Every Day, no Change affordance in v1), times list (empty; "Add a time" seeds with current local time), duration (start = today, end = none). Single "Add to my list" CTA pinned to bottom. Back link returns to `step: 'review'` with all schedule state preserved.

Multi-med scans iterate per-med with a top-of-card progress indicator (`Med 1 of 3`).

### A7 — Vertex JSON schema synchronized with the Zod schema
Step 4's prompt change is incomplete unless `extractedMedsResponseSchema` is also updated. Drop `doses_per_day` from both:
- The Vertex `responseSchema.properties` object.
- The Vertex `responseSchema.required` array.

Without this, Vertex returns the field, the Zod parse rejects it, every scan throws `ExtractionError('schema-fail')`. Per-step AC verifies this.

### A8 — `is_dose_change` regression test
The current LLM prompt couples `is_dose_change=true` to nulling the dose fields. Removing `doses_per_day` removes one of the model's coupling signals. Add a new fixture to `extract.test.ts`:
- Input: a label saying "Take 1 tablet 3 times daily" (stable TID instructions, **not** a dose change).
- Expected: `is_dose_change: false`, `dose_value` and `dose_unit` populated.

Plus the existing dose-change positive case stays. Asserts the safety guard's selectivity didn't degrade.

---

## Acceptance criteria

### Engineering — always include
- [ ] Plan reviewed by a fresh-context subagent before any code is written
- [ ] No new abstractions, frameworks, or generic helpers added unless explicitly listed in this plan
- [ ] Diff scoped to: `src/app/me/medications/scan/*`, `src/lib/medications/{form-display,scan/*}.ts`, `src/lib/medications/scan/schema.ts`, prompt/extract for the LLM, plus matching tests
- [ ] No formatting churn outside changed files; no refactors of unrelated code

### Functional — happy path
- [ ] Caregiver scans Midodrine 2.5mg bottle (NDC 72888-0112-01) → Step 1 shows: primary row `Midodrine Hcl 2.5mg Tabs` (Title Case of OCR'd `drug_name`), secondary row `midodrine hydrochloride` (the ingredient, since it differs from primary), strength `2.5 mg`, form `tablet`, `Verified` badge, single "This looks right" CTA
- [ ] Step 1 NEVER displays the raw RxNorm `canonicalName` string `"midodrine hydrochloride 2.5 MG Oral Tablet"` (B3 / B5)
- [ ] Step 1 NEVER displays a brand name (e.g. `Orvaten`) when the OCR'd `drug_name` is the generic (B5)
- [ ] Tap CTA → Step 2 shows: cadence row reading "Every Day" (no Change affordance), times list empty with "Add a time" affordance, duration row showing `Start: today / End: none` with `Edit` link, single "Add to my list" CTA at bottom
- [ ] Tap "Add a time" → row appears with current local time pre-filled and `1 tablet` (hardcoded `pills_per_dose=1`)
- [ ] Tap "Add to my list" → med saves with `drug_name` (raw OCR text, not Title Case), `dose` ("2.5 mg"), `form` (RxNorm verbatim "Oral Tablet"), `doses_per_day` = times-list length (or null if empty), `schedule_times` populated, `started_at` = today, `stopped_at` = null, `ndc/rxcui/ingredient` from RxNorm
- [ ] After save, navigation returns to `/me/medications/scan` (no full-page redirect); the saved med disappears from the scan results
- [ ] Multi-med scan: progress indicator shows `Med X of N`, advances on save or skip; skip decrements neither X nor N (it advances X by 1, N is fixed at scan time)
- [ ] **AddAll path:** "Add all" button still present on the scan results screen; tapping it saves every detected med with `doses_per_day=null`, `schedule_times=null`, `started_at`=today, `stopped_at`=null. Dose-change-flagged meds excluded (existing behavior). Toast: "X medications added. Set reminder times in Medications when ready."
- [ ] B1 fix verified: Midodrine bottle Step 1 strength field reads `2.5 mg` (was empty in PR #37)

### Form-vocabulary normalization — covers B3
- [ ] `normalizeForm("Oral Tablet")` returns `"tablet"`
- [ ] `normalizeForm("Sublingual Tablet")` returns `"tablet"`
- [ ] `normalizeForm("Oral Capsule")` returns `"capsule"`
- [ ] `normalizeForm("Extended Release Oral Capsule")` returns `"capsule"`
- [ ] `normalizeForm("Oral Solution")` returns `"solution"`
- [ ] `normalizeForm(null)` returns `null`
- [ ] `normalizeForm("Some Form We Haven't Mapped Yet")` returns `"some form we haven't mapped yet"` (lowercase passthrough — no display crash)
- [ ] `medications.form` column stores the RxNorm verbatim string (e.g. `"Oral Tablet"`), confirmed by direct DB inspection after save

### Strength fallback chain — covers B1
- [ ] Single-ingredient case where `med.strength = "2.5 MG"` → strength resolves via fallback 1 to `{value: "2.5", unit: "mg"}`
- [ ] Single-ingredient case where `med.strength = null` and `med.canonicalName = "midodrine hydrochloride 2.5 MG Oral Tablet"` → strength resolves via fallback 2 to `{value: "2.5", unit: "mg"}`
- [ ] **Combination product** case where `med.canonicalName = "valsartan 80 MG / hydrochlorothiazide 12.5 MG Oral Tablet"` → fallback 2 returns null (combo skip), falls through to OCR. Tested by direct unit test on the parser.
- [ ] All fallbacks fail → strength field on Step 1 shows OCR'd value if any, else blank; caregiver can edit inline by tapping the field

### Vertex schema sync — covers A7
- [ ] `extractedMedsResponseSchema.properties` no longer has a `doses_per_day` key
- [ ] `extractedMedsResponseSchema.required` array no longer contains `"doses_per_day"`
- [ ] Live extraction round-trip on the test fixture image succeeds without `ExtractionError('schema-fail')`

### `is_dose_change` regression — covers A8
- [ ] New `extract.test.ts` case: stable TID label ("Take 1 tablet 3 times daily") returns `is_dose_change: false` with `dose_value=1` (or whatever the bottle says) and `dose_unit` populated
- [ ] Existing dose-change positive case stays passing (`"Take 2 tomorrow then 1 thereafter"` → `is_dose_change: true`)

### Edge cases
- [ ] Bottle has no NDC → Step 1 shows `Read from label` badge instead of `Verified`; primary row falls back to OCR `drug_name`, secondary row is hidden (no ingredient to display); strength/form filled from OCR; flow otherwise identical
- [ ] User adds time → removes it → adds another → `doses_per_day` recomputes correctly to current times-list length on save
- [ ] User enters a time in the past for "today" → saves as-is; no warning, no auto-advance to tomorrow (reminders feature owns this concern when shipped)
- [ ] Multi-med scan with skip mid-flow (3 meds, user skips med 2) → progress reads `Med 2 of 3`, then `Med 3 of 3` — N is fixed at scan time, X advances on save and skip
- [ ] Bottle without NDC AND without parseable strength AND without OCR strength → strength field is blank, editable inline; save proceeds with `dose=null`
- [ ] Dose-change-flagged med in multi-med scan → counts toward N, advances X on Skip (no Save path); never reaches Step 2
- [ ] User backs out of Step 2 to Step 1 → all Step 2 inputs (times list, end date) preserved on next forward
- [ ] User taps "Take another" while on Step 2 of any med → confirm prompt: "Discard schedule for X meds in progress?" (uses bottle name primary in the count) — only if any med has Step 2 inputs filled; otherwise direct re-capture
- [ ] RxNorm `form` is null but `canonicalName` is non-null → form display row shows blank (no `null` text leak); inline-editable

### Error states
- [ ] Save fails (network, RLS, DB constraint) → inline error on Step 2, CTA re-enables, no data loss
- [ ] LLM extract returns no meds → existing empty-state message preserved
- [ ] Image upload fails → existing capture error preserved

### Performance
- [ ] Step transitions render within 100ms (no waiting on network — both steps work from already-resolved `ResolvedMed` data)
- [ ] Form normalization map is a static object literal — no I/O, no async

### Persistence
- [ ] Saved row matches existing `medications` schema; no new columns
- [ ] `medications.form` stores RxNorm verbatim (e.g. `"Oral Tablet"`); the normalized form is display-only — never written to the column

### Permissions / RLS
- [ ] No RLS changes — existing `medications` policies cover the insert path
- [ ] Save still routes through `addExtractedMedications` server action — the same auth-checked path as PR #37

### Side effects
- [ ] None new. Same DB writes as the current scan-review-card path (one row in `medications` per saved med)

### Manual verification (under 2 minutes)
1. On dev server, navigate to `/me/medications/scan`
2. Take a photo of the Midodrine HCl 2.5 mg bottle (NDC 72888-0112-01) OR upload the test fixture image
3. Confirm Step 1 stacked display shows: primary row in Title Case from OCR text, secondary row showing the ingredient ONLY if it differs from primary, strength row `2.5 mg`, form row `tablet` (NOT `Oral Tablet`), `Verified` badge — and **never** the raw `"midodrine hydrochloride 2.5 MG Oral Tablet"` string
4. Tap "This looks right" → Step 2 appears
5. Tap "Add a time" → time row appears with current local time, `1 tablet` quantity
6. Tap "Add to my list" → returns to scan list with the med removed
7. Navigate to `/me/medications` → row exists with `dose=2.5 mg`, `form=Oral Tablet` (raw), `doses_per_day=1`, `schedule_times` containing the chosen time, `started_at=today`
8. Repeat the scan but tap "Add all" instead → confirm meds save with `schedule_times=null` and `doses_per_day=null` (PRN); verify toast copy

---

## Implementation steps

1. **`src/lib/medications/rxnorm.ts`.** Add `FORM_DISPLAY` map and `normalizeForm()` next to existing `FORM_COUNT_NOUN`. Unit tests for the mapping table behavior (including `null` and unmapped-passthrough).
2. **`src/lib/medications/scan/schema.ts`.** Drop `doses_per_day` from `ExtractedMed` and `ResolvedMed`. Keep `is_dose_change`. Update Zod.
3. **`src/lib/medications/scan/{prompt,extract}.ts`.** Remove the `doses_per_day` field from BOTH the prompt copy AND the Vertex `responseSchema` (`properties` and `required` arrays). Add the new "stable TID stays `is_dose_change: false`" test fixture. Existing dose-change positive case stays.
4. **`scan-review-card.tsx`.** Add internal `step: 'review' | 'schedule'` state to the existing component. No new orchestrator. Step 1 renders the stacked product display (primary/secondary inline composition, strength, form via `normalizeForm`, badge); Step 2 renders cadence/times/duration with bottom CTA. Back link from Step 2 preserves Step 2 state.
5. **Strength fallback chain.** Update the strength-resolution call site in `scan-review-card.tsx`: walk `med.strength` → `med.canonicalName` tail (skipping combos with `" / "`) → OCR (`med.dose_value`/`med.dose_unit`). No telemetry.
6. **`extracted-to-payload.ts`.** Pull `doses_per_day` and `schedule_times` from the Step 2 schedule state. Drop the `doses_per_day` read from `ResolvedMed` (the field no longer exists there).
7. **`scan-client.tsx` AddAll path.** AddAll no longer reads `doses_per_day` from extraction. Saves all detected meds with `doses_per_day=null` and `schedule_times=null`. Update post-AddAll toast copy.
8. **Tests:** unit for `normalizeForm` (table-driven), unit for the strength fallback chain (single-ingredient + combo + all-fail), component test for the two-step flow's state survival across Back, integration test for AddAll's empty-schedule save.
9. **Code-review subagent** (fresh context) post-implementation, against this AC list + `code-quality.md`.
10. **PR + `gh pr checks --watch` + squash-merge.**

---

## Open questions (none currently)

If issues surface during plan-review, capture them here before writing code.
