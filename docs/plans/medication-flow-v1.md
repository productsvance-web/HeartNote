# Medication flow v1 — setup, voice/manual confirmation, dashboard surface

**Status:** PROPOSED. Plan-review subagent ran; this revision incorporates all 18 findings + a tightened B4 (descriptive marker, not clinical flag).

## Goal

Caregivers can (1) tell HeartNote which meds their parent takes, (2) confirm doses passively via the voice log or actively via tap, and (3) see at-a-glance whether today's expected doses are accounted for. Adherence data — especially missed doses — feeds the future alert engine because "missed diuretic" is a documented decompensation pattern (`research/02-medications.md §11 Pattern A`).

## Non-goals (explicit, do not creep)

- **Habit tile rendering.** Separate PR (PR 2). This plan provides only the per-med data function (`evaluateMedAdherenceForDay` returns per-med detail; aggregate fields land in PR 2 when the tile actually consumes them).
- **Camera-fill from pill-bottle photo.** Planned next (PR 1.5). PR 1 builds the manual-add form; PR 1.5 layers Capacitor camera + Claude vision OCR + sig parse on top of the same form.
- **Manual editing of vitals (weight, BP, HR).** Separate PR (PR 3).
- **Clinical interpretation of dose patterns.** "Is this double-dose dangerous?" is the alert engine's job (next item in `docs/status.md`). PR 1 renders count math descriptively only.
- **Reminders / push notifications.** Requires Capacitor + APNs/FCM keys.
- **Refill tracking, side-effect logging, dose-change attribution to a prescriber.**
- **Med interaction warnings, dose-change advice.** Forbidden by `CLAUDE.md` rule #6.
- **Real-time push from server to dashboard.** No Supabase realtime subscription is wired in this PR. Dashboard re-queries on visit; mutations refresh via `router.refresh()`.
- **Persistent storage of `med_match_failures`.** Render-once on the post-record review screen, then discarded. Trade-off: a clarification not acted on at record time is lost from the structured surface (transcript still has the phrase). See architectural decision #8.

## Architectural decisions (locked)

1. **Schedule shape:** add `medications.doses_per_day int` (nullable; null = PRN) and `medications.schedule_times text[]` (nullable; only set when caregiver knows clock times). Cross-column CHECK enforces `array_length(schedule_times) = doses_per_day` when both are set. `medication_events.scheduled_at` made nullable.
2. **Scope:** PR 1 only — setup CRUD, voice extraction expansion, manual confirmation, dashboard card, per-med adherence function.
3. **Voice match strategy:** strict drug-name match. Class-only or nickname mentions ("water pill") write nothing; extraction emits `med_match_failures[]` for one-time render on the review screen.
4. **Drug-class lookup:** RxNorm + RxClass (NIH, free, no auth). Caregiver can override the suggestion.
5. **`med_class` enum:** keep as-is (Postgres enum). Closed clinical taxonomy.
6. **Timezone:** "today" computed browser-side from `Intl.DateTimeFormat().resolvedOptions().timeZone`. Server fns accept `tz` as a parameter. Calendar-day anchor for an event is `actual_taken_at::date AT TIME ZONE tz` (the time the dose was actually taken, not when the row was logged).
7. **No clinical interpretation in PR 1.** Count math is rendered descriptively (e.g., a neutral "2×" pill on `2/1 taken`) with no color, copy, or icon implying risk. "Is this dangerous?" is the alert-engine PR's job.
8. **Match-failure data-loss is accepted and stated.** A caregiver who closes the review screen without tapping a clarification chip loses the structured prompt. The transcript still records the original phrase. Rationale: persisting `med_match_failures` would create a clarification-debt surface ("you have 14 unresolved med questions from past logs") that fails the grelief test (`CLAUDE.md` build conv #5) — every unresolved chip would read as "you let something slip." Better: surface once in context, accept the loss, trust the transcript.
9. **Prompt-cache preservation.** All edits to `extract.ts` (system prompt addition + tool schema fields) preserve the `cache_control: { type: 'ephemeral' }` block on the system message. Verified by AC. First post-deploy invocation pays the cold-cache cost (~1.25× base call). Subsequent calls within 5 min hit warm cache.
10. **Refresh mechanism:** mutations trigger `router.refresh()` (App Router server-component re-render). Dashboard reflects new data on next paint after the server roundtrip. No realtime channels.
11. **Optimistic UI on dose confirmation:** local count updates immediately on tap; server insert fires; on success keep state; on failure roll back local state and show inline error. No re-query needed in the success path.
12. **Edit behavior on `doses_per_day` change:** if the caregiver changes `doses_per_day` for a med that has `schedule_times` set, the form clears `schedule_times` to null on save (caregiver re-enters times if desired). Avoids partial-preservation ambiguity and keeps the CHECK constraint always satisfied.

## Schema changes (one migration: `<timestamp>_medications_v1.sql`)

```sql
-- 1. Doses per day (null = PRN/as-needed)
alter table public.medications
  add column doses_per_day int
  check (doses_per_day is null or doses_per_day between 1 and 12);

-- 2. Optional clock-time schedule (only when caregiver knows the times)
alter table public.medications
  add column schedule_times text[]
  check (
    schedule_times is null
    or (
      array_length(schedule_times, 1) = doses_per_day
      and not exists (
        select 1 from unnest(schedule_times) as t
        where t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      )
    )
  );

-- 3. scheduled_at nullable on events — confirmations without a clock schedule are valid
alter table public.medication_events
  alter column scheduled_at drop not null;

-- 4. Index for habit-row math (uses actual_taken_at since that's the calendar-day anchor)
create index medication_events_taken_idx
  on public.medication_events(patient_id, medication_id, actual_taken_at desc)
  where status in ('taken','early','late','double_dosed');
```

RLS already enabled on both tables; existing policies cover all needed CRUD. No new policies. Migration must be pushed before merging (`supabase db push` per CLAUDE.md).

After migration: regenerate `src/lib/supabase/types.ts` via `supabase gen types typescript --local > src/lib/supabase/types.ts`. Verified diff before commit.

## Surfaces (new and modified)

### New: `/me/medications` — meds list + add/edit
- Lists active meds (`stopped_at is null`), sorted by `drug_class` (loop_diuretic first), then `drug_name`.
- Each list row shows: `drug_name` · `dose` · `frequency` (one line under). PRN meds show "as needed" instead of frequency.
- "Add medication" form fields:
  - `drug_name` (text)
  - `dose` (text, free-form, e.g., "40 mg")
  - `frequency` (text, free-form, e.g., "every morning") — displayed on the list row
  - `doses_per_day` (1–12 select, or "as needed" → PRN, sets `doses_per_day=null`)
  - `schedule_times` (optional, conditionally shown when `doses_per_day >= 1`): one time picker per dose. Default empty. Caregiver can leave blank.
  - `started_at` (date, default today)
  - `notes` (textarea)
- On submit, server-side: call `classifyDrugByName(drug_name)` → suggested `med_class` + RxCUI. Insert med with the suggestion.
- After submit, UI shows a one-line confirmation chip: "Classed as loop diuretic — change?" Tapping opens a **simple class dropdown** (all 13 enum values, defaulted to the suggestion).
- Edit row → same form, prefilled. **Changing `doses_per_day` clears `schedule_times` to null on save.** Form warns the caregiver about this on the change.
- Soft-delete: "Stop taking this" sets `stopped_at = today`. Stopped meds collapse into a "Past medications" disclosure.

### New: `<TodaysMedsCard>` on `/dashboard`
- Renders below status ring, above sparklines.
- One row per active non-PRN med: `drug_name` · `dose` · `n/m taken`.
  - When `n != m`: a small neutral pill renders next to the count (`Nx`). Tapping the pill shows a descriptive tooltip ("3 doses logged for a 2-dose schedule"). **No color suggesting risk, no clinical copy.** Pill uses the existing neutral palette token (cream/sage), not red/amber/green.
- If `schedule_times` is set, sub-rows show each slot (`08:00 — confirmed`, `20:00 — pending`).
- Tap row → confirmation sheet: timestamp (default now), status (`taken` / `missed` / `extra` / `refused`), optional note. Submit:
  - Local card state increments immediately (optimistic).
  - Server insert fires; on success, no re-query (state already correct).
  - On failure, local state rolls back and a sheet-level error renders.
- "As needed" section (collapsed by default) — one row per active PRN med showing today's logged PRN-event count (`Nitroglycerin · 1 today`) and a "Log a PRN dose" tap target.

### Modified: `src/app/api/voice-log/[id]` — extraction expansion
The `LOG_OBSERVATION_TOOL` schema gains two fields (existing `cache_control: { type: 'ephemeral' }` block on the system message preserved):
```ts
medication_events: {
  type: 'array',
  description: 'Medication events the caregiver explicitly mentioned WITH the drug name stated. If the drug name is NOT stated (e.g., "her water pill"), do not produce an entry — instead add an item to med_match_failures.',
  items: {
    type: 'object',
    properties: {
      drug_name_stated: { type: 'string' },
      status: { type: 'string', enum: ['taken','missed','double_dosed','refused'] },
      note: { type: 'string' },
    },
    required: ['drug_name_stated','status'],
  },
},
med_match_failures: {
  type: 'array',
  description: 'When the caregiver referenced a med without naming it (e.g., "she missed her water pill"), record the phrase here so the post-record UI can prompt for clarification.',
  items: { type: 'string' },
},
```
Server-side, after Claude returns:
- Each `medication_events[]` entry → `matchMedByDrugName(patientId, drugNameStated)`:
  - **Match against active med** (`stopped_at is null`) → insert `medication_events` row (`scheduled_at = null`, `actual_taken_at = log_recorded_at`).
  - **Match against stopped med** (`stopped_at is not null`) → not inserted; pushed onto an `unmatched_chips[]` array returned to the client with type `restart_med` and the matched `medication_id`.
  - **No match** → pushed onto `unmatched_chips[]` with type `add_med` and the stated drug name.
- `med_match_failures[]` from Claude → pushed onto `unmatched_chips[]` with type `pick_med` and the stated phrase.
- All three chip types render once on the post-record review screen with appropriate tap targets (pick / restart / add). Not persisted.

### Modified: `extract.ts` system prompt
Add one paragraph (preserving cache_control block):
> "If the caregiver mentions a medication by name with a status (took, missed, skipped, double-dosed, refused), produce one `medication_events[]` entry with the exact drug name they said. If they reference a drug only by class or nickname ('her water pill', 'the heart pill'), record the phrase in `med_match_failures[]` and produce NO `medication_events[]` entry — do not guess which medication. This rule has no exceptions."

## New module: `src/lib/medications/`

- **`evaluateMedAdherenceForDay(patientId: string, dateInTz: { date: string; tz: string })`** → `Array<{ medicationId; drugName; expected: number; taken: number; isComplete: boolean }>`. Per-med detail only in PR 1. Joins `medications` (active, non-PRN) to `medication_events` where `actual_taken_at::date AT TIME ZONE tz = dateInTz.date` and status ∈ {taken,early,late,double_dosed}. Aggregate fields (`expected`, `taken`, `missed`, `isComplete`) added in PR 2 when habit tile actually consumes them.
- **`matchMedByDrugName(patientId: string, drugName: string)`** → `{ medicationId; isStopped: boolean } | null`. Case-insensitive exact match on the patient's meds, including stopped (caller decides what to do with `isStopped=true`).
- **`classifyDrugByName(drugName: string)`** → `{ medClass: MedClass; suggestedName?: string; rxcui?: string }`. Implementation:
  1. `GET https://rxnav.nlm.nih.gov/REST/rxcui.json?name={drugName}` (exact). If RxCUI returned, use it. Otherwise:
  2. `GET https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term={drugName}&maxEntries=1`. If a high-confidence match returns, use its RxCUI and capture its name as `suggestedName`.
  3. `GET https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json?rxcui={cui}&relaSource=ATC`. Returns ATC class codes.
  4. **Longest-prefix match** wins among returned ATC codes against the static `ATC_TO_MED_CLASS` map in `src/lib/medications/atc-map.ts`. Map is annotated with a citation header pointing at WHO ATC + RxClass docs.
     - `C09DX04` → `arni` (sacubitril/valsartan)
     - `C03DA*` → `mra`
     - `C03C*` → `loop_diuretic`
     - `C09A*`, `C09B*` → `ace_inhibitor`
     - `C09C*`, `C09D[A-C]*` → `arb`
     - `C07A*` → `beta_blocker`
     - `A10BK*` → `sglt2_inhibitor`
     - `C01AA*` → `digoxin`
     - `C01B*` → `antiarrhythmic`
     - `B01AA*` → `anticoagulant_warfarin`
     - `B01AE*`, `B01AF*` → `anticoagulant_doac`
     - `A12B*` → `potassium_supplement`
     - everything else → `other`
  5. On any HTTP error, timeout (>2000ms hard cap), or empty result: return `medClass: 'other'` AND emit a server-side `console.warn` with the drug name and reason. (Sustained outages then surface in logs without breaking the caregiver flow.)

## Acceptance criteria

### Engineering
- [ ] Plan reviewed by fresh-context subagent (done).
- [ ] No new abstractions beyond the three module functions.
- [ ] Diff scoped to: `supabase/migrations/`, `src/app/me/medications/`, `src/app/api/voice-log/`, `src/lib/voice-log/extract.ts`, `src/lib/medications/`, `src/components/dashboard/TodaysMedsCard.tsx`, `src/lib/supabase/types.ts` (regenerated). No edits to unrelated files.
- [ ] No clinical numbers hardcoded (this PR has none — adherence is patient-specific).
- [ ] `supabase db push` completed against local before merging.
- [ ] `src/lib/supabase/types.ts` regenerated via `supabase gen types typescript --local > src/lib/supabase/types.ts`. Diff inspected for stale fields.
- [ ] `extract.ts` retains `cache_control: { type: 'ephemeral' }` block on the system message. Verified by grep before commit.

### Functional — happy path
- [ ] **Add med via UI with auto-classify.** Filling drug_name="Lasix", dose="40 mg", frequency="every morning", doses_per_day=1, no schedule_times, submit → inserts `medications` row with `drug_class='loop_diuretic'`, returns to list within 1500ms (RxNorm round-trip included), shows "Classed as loop diuretic — change?" chip. List row reads "Lasix · 40 mg · every morning."
- [ ] **Add med with schedule_times.** doses_per_day=4, schedule_times=['08:00','14:00','20:00','02:00'] inserts row with both fields. CHECK constraint validates four `HH:MM` strings. `<TodaysMedsCard>` shows four sub-rows.
- [ ] **Edit doses_per_day clears schedule_times.** Editing Bumex from doses_per_day=2 (with times ['08:00','20:00']) to doses_per_day=3 + save → form warns "Schedule times will reset," save proceeds, DB row has `schedule_times=null`. Card shows three flat slots without times.
- [ ] **Confirm a dose via tap (optimistic).** Tapping a med row, status=taken, submit → card count increments immediately (before server roundtrip). Server insert succeeds → no re-query, state preserved. Total card-update latency: <50ms perceived.
- [ ] **Confirm a dose via voice.** Recording "Mom took her Lasix this morning" → after the `/api/voice-log/[id]` response returns, the post-record review screen shows the new event in its event list, then `router.refresh()` is called on navigation back to dashboard, where `<TodaysMedsCard>` reads "1/1 taken."
- [ ] **PRN meds excluded from habit math; PRN voice mention writes event.** A med with `doses_per_day=null` is not in `evaluateMedAdherenceForDay`'s output. Recording "She took a nitro tablet for chest tightness" → matches `Nitroglycerin` (PRN) → writes `taken` event. As-needed section of card shows "Nitroglycerin · 1 today."
- [ ] **Stop a med.** Tapping "Stop taking this" sets `stopped_at=today`; med disappears from active list and card on next `router.refresh()`. Historical events preserved in DB.

### Edge cases
- [ ] **First-time user with zero meds.** Card shows empty state with copy "No medications added yet — add them at /me/medications" and a tap target. No errors.
- [ ] **Voice mentions ambiguous drug.** "She missed her water pill" with two loop_diuretics on file → zero `medication_events` rows; one chip on review screen of type `pick_med` with the phrase "water pill." Picker contains all active non-PRN meds for the patient (not class-scoped). Tapping a med inserts the missed-dose event. Closing the review screen without tapping leaves no DB record.
- [ ] **Voice mentions stopped med.** "She took her Lasix" when Lasix has `stopped_at` set → no event written; chip of type `restart_med` with deep link to `/me/medications` for that med, prefilled with "restart" action.
- [ ] **Voice mentions unknown drug.** "She took her Cardezem" (no Cardezem in DB) → no event; chip of type `add_med` with deep link to add-med form prefilled with "Cardezem."
- [ ] **RxNorm returns nothing.** Obscure drug name → exact + approximate both miss → `medClass: 'other'`. Med inserted with class='other'. Caregiver can override.
- [ ] **RxNorm approximate returns different name.** Typed "metropolol"; approximate returns "metoprolol" → `{ medClass: 'beta_blocker', suggestedName: 'metoprolol' }`. UI shows "did you mean metoprolol? — yes / keep as typed." Default: keep as typed; class is suggested either way.
- [ ] **RxNorm returns multiple ATC codes.** Combo drug returns both `C09A` and `C03C` → longest-prefix-match picks the more specific code. If tied length, the first map-table entry wins. Behavior verified with sacubitril/valsartan (`C09DX04` → `arni`).
- [ ] **Double-dose descriptive marker.** Med with `doses_per_day=1` and one `taken` + one `double_dosed` event today → card row reads "2/1 taken" with neutral "2×" pill. Tapping pill shows tooltip "2 doses logged for a 1-dose schedule." Pill background uses the existing neutral palette token; no red/amber/green.
- [ ] **Missed at end of day.** doses_per_day=2, only one `taken` event by 11pm → card shows "1/2 taken" with no extra marker. No automatic "missed" inference.
- [ ] **Multiple confirmations of the same dose.** Two `taken` events at 8am and 8:05am → counts as 2 toward `taken_today`. UI does not deduplicate.
- [ ] **Stopped med, historical events preserved.** Setting `stopped_at` does not delete `medication_events` rows.
- [ ] **schedule_times CHECK on insert.** Trying to insert doses_per_day=2 with schedule_times=['08:00'] is rejected by CHECK. Form client-validates first; server fallback returns RLS-safe error.
- [ ] **Midnight rollover.** Caregiver in `America/Los_Angeles` records "Mom took her Bumex" at 11:55pm local. `actual_taken_at = log_recorded_at` is a timestamptz. The event counts toward Wednesday adherence (when it was taken), not Thursday (when the caregiver might re-open the card at 12:01am). Verified: `actual_taken_at::date AT TIME ZONE 'America/Los_Angeles'` = '2026-05-01' even when the timestamptz is `2026-05-02T06:55:00Z`.
- [ ] **Caregiver navigates away from review screen with un-acted chips.** Closing the screen without tapping any chip → no DB write, no error. Chip data is gone from structured form. Original transcript still says "she missed her water pill."

### Error states
- [ ] **Network failure on add med.** Form submit with no network → inline error "Couldn't save — try again," form state preserved. No localStorage drafts.
- [ ] **RxNorm down or slow (>2s).** Add-med flow times out classification at 2s, falls back to `medClass: 'other'`, inserts the med, shows "Couldn't auto-classify — set drug class manually" chip. Server-side `console.warn` logs the drug name + reason for ops visibility.
- [ ] **RLS denial on insert.** Forged `patient_id` returns Supabase RLS error; UI shows generic "Save failed — refresh and try again." No PHI leak.
- [ ] **Optimistic dose-confirm fails.** Tap submits, local count increments, server returns error → local state rolls back to pre-tap, sheet shows inline "Couldn't save — try again." No phantom count left in UI.
- [ ] **Claude extraction returns malformed `medication_events`.** Zod-validated at API route; invalid entries dropped with server log. Rest of extraction proceeds. No 500.
- [ ] **`matchMedByDrugName` race with stopped_at.** Med stopped between voice recording and processing → match returns `{ medicationId, isStopped: true }`; treated as `restart_med` chip.
- [ ] **Migration rollback safety.** Two columns added + one nullified. CHECK constraint verified against existing rows (all have null schedule_times) before constraint applies.

### Performance
- [ ] `evaluateMedAdherenceForDay` returns within 100ms for patients with up to 20 active meds and 30 days of events.
- [ ] `classifyDrugByName` returns within 1000ms p95 (two RxNorm round-trips). 2000ms hard timeout → fallback.
- [ ] Adding a med returns within 1500ms (form submit + classify + insert + nav).
- [ ] Confirming a dose updates the card within 50ms perceived (optimistic local update).
- [ ] **Voice-log added latency: <500ms warm-cache only.** First post-deploy invocation pays a one-time cold-cache cost on the research-file system block (~1.25× base call). Measured by adding the new fields to the tool schema, deploying, and timing the first vs second call.

### Persistence
- [ ] Meds and events persist to Postgres. Refresh shows the same data.
- [ ] No localStorage usage for med data.
- [ ] **`med_match_failures` and `unmatched_chips` are NOT persisted.** Returned in extraction API response, rendered once on review screen, discarded on unmount.
- [ ] **Trade-off explicitly accepted in code comments:** the `<ReviewScreen>` component carries a one-line comment citing architectural decision #8 ("un-acted clarifications are lost — see plan §architectural-decisions").
- [ ] Stopped meds remain queryable for historical analysis.

### Permissions / RLS
- [ ] RLS enabled on `medications` and `medication_events` (existing `for all` policies).
- [ ] **Two-caregiver SQL probe** (added to manual verification step 11): create caregiver A with patient + Lasix; create caregiver B with patient + Bumex. Caregiver B's session SELECT on `medications` returns only Bumex. Caregiver B INSERT into `medication_events` with caregiver A's `medication_id` returns RLS error. Probe is documented in `docs/plans/medication-flow-v1-rls-probe.sql` and runnable against local DB.
- [ ] `matchMedByDrugName` filters by `patient_id` AND uses authenticated server client — no service-role keys.
- [ ] `classifyDrugByName` outbound HTTPS to `rxnav.nlm.nih.gov` carries drug name only — **no patient identifier, no PHI.** Verified by inspecting the outgoing request payload in dev.

### Side effects
- [ ] Inserting a med event triggers `router.refresh()` on the dashboard route after the server roundtrip — server component re-renders `<TodaysMedsCard>` with fresh data.
- [ ] Voice extraction that produces events triggers `router.refresh()` when caregiver navigates back to dashboard from the review screen.
- [ ] No alerts fire from this PR.

### Manual verification (~3-min reproduction)
1. Sign in as a test caregiver.
2. Go to `/me/medications`, add Lasix (dose 40 mg, frequency "every morning", 1×/day, no schedule_times). Verify "Classed as loop diuretic" chip and list row reads "Lasix · 40 mg · every morning."
3. Add Bumex (dose 1 mg, 2×/day, schedule_times=['08:00','20:00']). Verify class auto-suggested as loop_diuretic and `<TodaysMedsCard>` shows two sub-rows.
4. Edit Bumex to doses_per_day=3 + save. Verify form warns about schedule reset, save succeeds, DB shows `schedule_times=null`, card shows three flat slots.
5. Tap Lasix row, status=taken, submit. Card updates to "Lasix · 1/1" within 50ms (optimistic).
6. Go to `/log`, record "Mom took her Bumex this morning, second dose," stop. Verify the post-record review screen shows the event; navigate to dashboard; verify card shows "Bumex · 1/3 taken."
7. Record "She missed her water pill last night." Verify review screen shows a `pick_med` chip with the phrase "water pill" and a picker containing both Lasix and Bumex. Tap Bumex → verify a `missed` event for Bumex inserted.
8. Stop Lasix. Record "Mom took her Lasix this morning." Verify review screen shows a `restart_med` chip linking back to `/me/medications` with restart action.
9. Add an obscure drug ("Sacubitril-Valsartan"). Verify it auto-classifies as `arni`.
10. Add a typo'd drug ("metropolol"). Verify approximate-match suggests "metoprolol" with class `beta_blocker`; verify caregiver can accept the spelling correction or keep their typed name.
11. **RLS probe.** Run the SQL probe at `docs/plans/medication-flow-v1-rls-probe.sql` against local DB. Both probe assertions pass (cross-caregiver SELECT and INSERT denied).
12. **Midnight rollover.** Set system clock to 11:55pm `America/Los_Angeles`. Tap a Bumex confirm. At 12:01am next day, refresh dashboard. Verify the dose still counts under yesterday's adherence (revisit /trends to see; today's card shows the new day reset).
