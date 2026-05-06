# Medication schedule + cadence v1

Caregiver-facing schedule UI for the five Apple-Health-style cadence kinds, with Capacitor local notifications firing at scheduled times. Replaces the unused `schedule_times`/`pills_per_dose` columns with structured per-time rows in a new table.

Supersedes the schedule-step ACs in `docs/plans/medications-apple-style-review.md`. Origin handoff: `docs/plans/medications-schedule-cadence/README.md` on branch `medications-schedule-handoff`.

## Decisions locked in for v1

These are the open questions from the handoff README, decided here so implementation does not stall. **Revised after plan review** flagged that several decisions had downstream consequences not addressed in the first draft.

| Question | Decision | Rationale |
|---|---|---|
| Cyclical `Every` units (`Day` / `Week` / `Month`) | Day + Week. Drop Month. | 21 days = 3 weeks is exact arithmetic; 1 month is calendar-dependent and Apple's data model may not preserve "1 month" cleanly. Persist days; render in user's chosen unit. |
| `Every Few Days` interval ceiling | 30 days max. | Practical caregiver ceiling; matches the README's recommendation. |
| Notification copy | Aggregate per-time-of-day: "You have medications scheduled now." | A caregiver with 6 meds at 8am should get one buzz, not six. |
| `medications.doses_per_day` after migration | **Drop. Compute per-day in the RPC.** Dashboard's `confirmDose` slot-gate reads from RPC, not from `medications` directly. | DB-as-source-of-truth. Per-day semantics for `specific_days` / `cyclical` / `every_few_days` cannot be represented in a single column on `medications`; a per-day RPC computation is the only correct shape. |
| `medications.pills_per_dose` after migration | **Drop universally.** Quantity is per-dose-time in `medication_dose_times.quantity`. | Wizard had a global "pills per dose" field; new model makes quantity per-time, so the global field has no meaning. |
| `medications.schedule_times` after migration | **Drop.** Replaced by `medication_dose_times` rows. | Same reason; eliminates parallel state. |
| Behavior #2 (TBD per handoff) | **Deferred. Out of scope for this PR.** | Handoff README explicitly says "don't backfill from imagination." |
| `cadence_kind` enum location | Single TypeScript constant `CADENCE_KINDS` in `src/lib/medications/cadence.ts`, imported by Zod, UI, and notification code. | `code-quality.md` rule #1. |
| Cyclical day-0 anchor | `medications.started_at`. **Required when `cadence_kind = 'cyclical'`.** Zod rejects save when null. | Without an anchor, "21 on, 7 off" is undefined. |
| `every_few_days` anchor | `medications.started_at`. **Required when `cadence_kind = 'every_few_days'`.** Zod rejects save when null. | Same reason. |
| Atomicity of save (medications + dose-times insert/replace) | **Postgres function `save_medication_with_dose_times(payload jsonb)` returning the new med id.** Server action calls it via `supabase.rpc()`. | Supabase JS does not expose multi-statement transactions; partial writes from the client are not undoable. |
| Disjoint-bitmap enforcement (specific_days groups) | **Zod refinement only. Race accepted.** Worst-case race-result = duplicate notifications, which the handoff README also acknowledged. | Pre-launch, single-device-per-caregiver assumption; deferrable trigger is overkill for the actual risk. |
| iOS notification ID strategy | **31-bit FNV-1a hash of `med:{medId}:{occurrenceUnixSeconds}`.** Capacitor requires positive 32-bit int. Hash collisions across distinct (medId, occurrence) tuples are not a correctness risk because each fire is independent. | Stable, deterministic, dedup via `LocalNotifications.getPending()` filter on `extra.medicationId`. |
| 64-cap priority policy | **Soonest-first across all active meds.** When OS rejects a schedule call, stop. Re-balance on `App.resume`. | Simplest fair policy; no caregiver loses all reminders for a late-added med. |
| iOS notification permission state machine | Capacitor's four states (`granted`, `denied`, `prompt`, `prompt-with-rationale`) handled explicitly. UI re-checks on focus. | Spec covers all four (see error-state ACs). |

## Out of scope (do NOT scope-creep)

- Behavior #2 (whatever it turns out to be).
- Missed-dose detection / adherence alerts.
- Log-a-dose UI.
- Server-side scheduling.
- Push notifications (local only).
- HealthKit integration.
- Time zones beyond device local.
- Refill / pill-count tracking.
- Custom cadences beyond the five Apple kinds.
- Auto-extracting cadence from a label via the LLM (build conv #6 — caregiver-input only).

## Architecture

### Schema

`supabase/migrations/<timestamp>_medication_cadence.sql`:

1. Drop `medications.schedule_times`, `medications.pills_per_dose`, `medications.doses_per_day`.
2. Add `medications.cadence_kind text NOT NULL DEFAULT 'every_day'` with CHECK constraint enumerating the five kinds.
3. Add `medications.cycle_on_days int` and `medications.cycle_off_days int`, each `BETWEEN 1 AND 365` or NULL.
4. Add `medications.interval_days int`, `BETWEEN 2 AND 30` or NULL.
5. Add app-layer-enforced (Zod) cross-column invariants:
   - `cadence_kind = 'cyclical'` → both `cycle_on_days`, `cycle_off_days`, `started_at` non-null.
   - `cadence_kind = 'every_few_days'` → both `interval_days`, `started_at` non-null.
6. Create `medication_dose_times` table:
   - `id uuid PK default gen_random_uuid()`
   - `medication_id uuid FK CASCADE`
   - `time_of_day text` (HH:MM regex CHECK; format identical to existing `HH_MM` regex in actions.ts — SQL CHECK is the canonical truth, Zod is a fast-fail copy)
   - `quantity numeric > 0`
   - `ordinal smallint` (UNIQUE within a med)
   - `applies_to_dow smallint` nullable, `BETWEEN 1 AND 127` (bitmap; NULL = applies every day)
   - `created_at`, `updated_at` timestamptz
   - Index on `(medication_id, ordinal)`.
7. Enable RLS. Policy: caregiver can CRUD dose-times where the parent med's patient.caregiver_id = `auth.uid()`.
8. Postgres function `save_medication_with_dose_times(payload jsonb) returns uuid` (SECURITY INVOKER, RLS-respecting):
   - Validates auth + RLS (caregiver_id = auth.uid()).
   - For an UPDATE payload: deletes all `medication_dose_times` for the med, then inserts the new ones.
   - For an INSERT payload: inserts the medication row, returns its id, then inserts dose-time rows.
   - Wraps both in a single transaction; rollback on any failure.
   - Returns the medication id.
9. Update `medication_adherence_for_day` RPC. **Per-day computation, cadence-aware.**
   - Returns the same shape (`medication_id`, `drug_name`, `drug_class`, `doses_per_day`, `schedule_times`, `slots_resolved`, `events`).
   - `doses_per_day` is computed for `p_date`:
     - `as_needed` → NULL (preserves the historical PRN signal).
     - `every_day` → `COUNT(*) FROM medication_dose_times WHERE medication_id = m.id`.
     - `specific_days` → `COUNT(*)` of dose-times where `(applies_to_dow & dow_bitmap_for(p_date)) <> 0`.
     - `cyclical` → if `(p_date - started_at)` modulo `(cycle_on_days + cycle_off_days)` < `cycle_on_days`, then `COUNT(*)`; else 0.
     - `every_few_days` → if `(p_date - started_at) % interval_days = 0`, then `COUNT(*)`; else 0.
   - `schedule_times` is the array of `time_of_day` from the same set of "due-today" dose-times, sorted ascending.
   - `slots_resolved` semantics unchanged (still mirrors `SLOT_CONSUMER_STATUSES` in `evaluate.ts`).
   - The RPC is the SOLE consumer-facing surface for "what does the caregiver need to do today" — `dashboard/actions.ts` calls it before any `medications.doses_per_day` read (which no longer exists).

### Cadence kind constants

`src/lib/medications/cadence.ts`:
```ts
export const CADENCE_KINDS = ['every_day', 'cyclical', 'specific_days', 'every_few_days', 'as_needed'] as const;
export type CadenceKind = typeof CADENCE_KINDS[number];

// Day-of-week bitmap. Sun=1, Mon=2, ... Sat=64. Range 1..127.
export const DOW_SUN = 1, DOW_MON = 2, DOW_TUE = 4, DOW_WED = 8;
export const DOW_THU = 16, DOW_FRI = 32, DOW_SAT = 64;
export const DOW_ALL = 127;
```

### actions.ts payload + server action

`MedicationPayloadSchema` becomes a discriminated union on `cadenceKind`:

- Common fields (drugName, dose, startedAt, etc.) plus the new cadence sub-fields.
- `as_needed`: `doseTimes` array forbidden / must be empty.
- `every_day` | `cyclical` | `every_few_days`: `doseTimes[].appliesToDow` must be NULL.
- `specific_days`: every `doseTimes[].appliesToDow` must be non-null; pairwise disjoint (`bit_and === 0`).
- `cyclical`: `cycleOnDays` and `cycleOffDays` both required and 1..365.
- `every_few_days`: `intervalDays` required and 2..30.

Server action splits the payload into two writes inside a Postgres transaction (use a Postgres function or Supabase RPC for atomicity, or rely on `medications` insert + `medication_dose_times` insert with rollback-on-failure pattern). Discussed in implementation step 1 below.

### UI

Three new client components (single-component-with-step-state pattern, not separate routes):

1. **`CadencePicker`** — five-row Apple-style list, single-select with checkmark.
2. **`CadenceFields`** — sub-screen for the picked cadence; renders the appropriate sub-controls plus the dose-time rows.
3. **`DayPills`** — 7-button S M T W T F S row with disjoint-claim enforcement when used in the Specific Days groups context.

Reused from existing code:
- `<input type="time">` (with iOS picker fix per below).
- `<input type="date">` for start/end (existing wizard pattern).

iOS time picker fix: on row creation, the input has NO `value` prop. On row click, `inputRef.current?.showPicker()` is called. This bypasses the bug from PR #39 where pre-filled times blocked the native picker.

### Notification system

`src/lib/medications/notifications.ts` (client-side, Capacitor-aware):

- `scheduleNotificationsForMed(medicationId)` — read med + dose-times, compute next 30 days of fires (cadence-aware: filtered by DOW for `specific_days`, cycle math for `cyclical`, interval math for `every_few_days`, anchored on `started_at`), schedule one Capacitor `LocalNotification` per fire. Each fire's `id` is the 31-bit FNV-1a hash of `med:{medId}:{occurrenceUnixSeconds}`. `extra: { medicationId }` is set so dedup can filter pending by med.
- `cancelNotificationsForMed(medicationId)` — call `LocalNotifications.getPending()`, filter by `extra.medicationId === medicationId`, cancel matching ids.
- `topUpScheduledNotifications()` — called on app `resume`. For each active non-`as_needed` med, compute next 30 days of fires; for each, check the `LocalNotifications.getPending()` set; schedule only the missing ones. **Soonest-first across all meds** when approaching the iOS 64-cap.
- `requestNotificationPermission()` — wraps `LocalNotifications.requestPermissions()`. Returns the resulting state (`granted` / `denied` / `prompt` / `prompt-with-rationale`).
- `getNotificationPermissionState()` — wraps `LocalNotifications.checkPermissions()`. Cached for ≤30s; busted on `App.resume` (so a Settings-toggle round trip is reflected fresh).
- All notification copy: aggregate body `"You have medications scheduled now"` (no per-med variation in v1).

iOS 64-cap policy:
- When `LocalNotifications.schedule()` returns an error matching cap-related strings, the function stops and returns `{ ok: true, scheduled, capped: true }`.
- The caller does not retry. The next `App.resume` re-runs `topUpScheduledNotifications` and re-balances.
- Soonest-first ordering means a 30-day plan never schedules notifications past the cap if earlier fires fit; later (further-in-future) fires are dropped first.

Integration points:
- After save in `addMedication` / `updateMedication` server actions return success → client wrapper calls `cancelNotificationsForMed(id)` then `scheduleNotificationsForMed(id)`.
- On stop / delete → client wrapper calls `cancelNotificationsForMed(id)`.
- App startup + `App.resume` → call `topUpScheduledNotifications()`.

Permission flow (per Capacitor's four states):
- `granted` → schedule.
- `denied` → save succeeds; UI shows inline "Reminders blocked. Enable in Settings → Notifications → HeartNote." No re-prompt.
- `prompt` → call `requestPermissions()`; on grant schedule, on deny show inline note.
- `prompt-with-rationale` → call `requestPermissions()`; same behavior as `prompt`.
- iOS Settings toggle while app is open → `App.resume` busts the cache; next save re-evaluates.

DST handling:
- Capacitor schedules wall-clock-anchored times via `schedule.at: Date`. Computing the Date in local time (using `new Date(year, month, day, hh, mm)`) preserves wall-clock time across DST; the spring-forward 2:00→3:00 hour is skipped (a 2:30 schedule fires at 3:30 that day only — acceptable; no caregiver schedules at 2:30am for CHF meds).
- Test plan includes a manual TZ shift on the iOS simulator across DST.

Web fallback: Capacitor `LocalNotifications` on web is a no-op (`Capacitor.isNativePlatform()` check). UI does not crash; notifications simply don't fire. `scheduleNotificationsForMed()` returns within 50ms.

## Acceptance criteria

### Engineering — always include

- [ ] Spec stated and reviewed by a fresh subagent before any code is written.
- [ ] No new abstractions added beyond: three new UI components (CadencePicker, CadenceFields, DayPills), the cadence constants module (`cadence.ts`), the notifications module (`notifications.ts`), and the new Postgres function. No generic "scheduling framework."
- [ ] Diff scoped to the file list below. No unrelated formatting changes. No refactors outside scope.
- [ ] All ACs verifiable by reading specific behavior or running specific commands.
- [ ] `cadence_kind` enum, day-of-week bitmap constants, and notification ID prefix all live in `src/lib/medications/cadence.ts` (not duplicated across files). Per `code-quality.md` rule #1. SQL `CHECK` enums duplicate the strings (unavoidable cross-language) but the migration is the canonical source.
- [ ] Cross-table cadence invariants enforced in **one** Zod refinement in `actions.ts`, not duplicated in UI components. Per `code-quality.md` rule #2.

#### Files in scope (everything that touches dropped columns)

Migration:
- `supabase/migrations/<ts>_medication_cadence.sql` (new)

Server (DB-touching):
- `src/app/me/medications/actions.ts` — payload schema, server actions
- `src/app/dashboard/actions.ts` — `confirmDose` reads `doses_per_day` from RPC instead of `medications`
- `src/app/me/medications/new/wizard-action.ts` — wizard insert path uses the new server action
- `src/app/me/medications/scan/extracted-to-payload.ts` — payload no longer includes `pillsPerDose`/`schedule_times`/`dosesPerDay`; defaults to `cadenceKind: 'as_needed'` (cadence picker fills it in)

UI:
- `src/app/me/medications/medications-form.tsx` — replace "Times (optional)" + "Doses per day" + "Pills per dose" fields with a single "Schedule" row that opens the cadence picker
- `src/app/me/medications/medications-list-client.tsx` — replace `pills_per_dose × dose` and `Nx per day` strings with cadence-summary string + dose
- `src/app/me/medications/scan/scan-review-card.tsx` — "Add to my list" navigates to cadence picker instead of immediate save
- `src/app/me/medications/scan/scan-client.tsx` — orchestration wrapper for the new in-flow cadence picker
- `src/app/me/medications/[id]/page.tsx` — pass cadence data to medications-form
- `src/app/me/medications/page.tsx` — query the new RPC shape (if it reads `doses_per_day`)
- `src/app/me/medications/new/medication-wizard.tsx` — wizard's step-times step replaced with cadence picker
- `src/app/me/medications/new/step-times.tsx` — **delete** (replaced by cadence picker)
- `src/app/me/medications/new/step-dose.tsx` — drop `pillsPerDose` field (quantity is now per-time)
- `src/app/me/medications/new/wizard-types.ts` — drop `pillsPerDose`, `dosesPerDay`, `scheduleTimes`; add cadence shape

New components:
- `src/app/me/medications/cadence/cadence-picker.tsx` (new)
- `src/app/me/medications/cadence/cadence-fields.tsx` (new)
- `src/app/me/medications/cadence/day-pills.tsx` (new)
- `src/lib/medications/cadence.ts` (new — constants + helpers)
- `src/lib/medications/notifications.ts` (new — Capacitor wrapper)

Reads from RPC (already use `doses_per_day` field but it now means "due-today"; verify they still render):
- `src/lib/medications/evaluate.ts` — verify nothing breaks; it should be a no-op since the field semantic ("doses scheduled for the day") is the same.
- `src/components/heartnote/TodaysMedsCard.tsx`
- `src/components/heartnote/TodaysMedsList.tsx`

Generated types:
- `src/lib/supabase/types.ts` — regenerated via `npm run db:types`

Tests:
- `src/app/me/medications/scan/extracted-to-payload.test.ts` — update `pillsPerDose` and `dosesPerDay` assertions to match the new payload shape.
- `src/lib/medications/scan/prompt.test.ts` — verify nothing references dropped columns.

Capacitor:
- `package.json` — add `@capacitor/local-notifications` and `@capacitor/app` (for resume event)
- `package-lock.json` — regenerated
- iOS `cap sync` produces a notification-permission entry in `Info.plist` automatically (no manual edit needed)

### Functional — happy path

**Cadence picker**

- [ ] When the caregiver lands on the cadence picker, exactly five rows render in this order: Every Day, On a Cyclical Schedule, On Specific Days of the Week, Every Few Days, As Needed.
- [ ] Each row shows the title in `text-base font-semibold` and a tagline in `text-xs text-muted-foreground` (matching scan-review-card.tsx visual style).
- [ ] Tapping a row sets it as the active cadence and shows a `Check` icon (lucide-react) on the right; selecting another row replaces the checkmark.
- [ ] Tapping `Continue` navigates to the cadence-specific sub-screen with the selected cadence pre-loaded.

**Every Day cadence**

- [ ] When the caregiver picks Every Day and adds one dose-time row at `08:00` with quantity `1`, then taps Save, exactly one row is inserted into `medication_dose_times` for that med with `time_of_day='08:00'`, `quantity=1`, `applies_to_dow=NULL`, `ordinal=0`.
- [ ] When the caregiver adds two dose-time rows (`08:00 / 1` and `20:00 / 1`), exactly two rows are inserted with ordinals 0 and 1.

**Cyclical cadence**

- [ ] When the caregiver picks Cyclical, sets `Every Day`, `Use for 21`, `Pause for 7`, and adds one dose-time at `09:00 / 1`, the medication row stores `cadence_kind='cyclical'`, `cycle_on_days=21`, `cycle_off_days=7`, and one dose-time row exists with `applies_to_dow=NULL`.
- [ ] When the caregiver toggles the unit to `Every Week`, `Use for 3`, `Pause for 1`, the medication row stores `cycle_on_days=21`, `cycle_off_days=7` (persisted in days regardless of display unit).

**Specific Days cadence**

- [ ] When the caregiver picks Specific Days, selects Mon+Wed+Fri (bitmap `2|8|32 = 42`), and adds one dose-time at `09:00 / 1`, exactly one dose-time row is inserted with `applies_to_dow=42`.
- [ ] When the caregiver creates a second group with Tue+Thu (bitmap `4|16 = 20`) at `13:00 / 0.5`, exactly two dose-time rows exist with disjoint bitmaps (42 and 20), `bit_and(42, 20) = 0`.
- [ ] When a day pill is claimed in the first group, tapping the same day in the second group has no effect (the pill renders as disabled / muted).
- [ ] When all 7 days are claimed across groups, the "Schedule Other Days" button is disabled.

**Every Few Days cadence**

- [ ] When the caregiver picks Every Few Days, sets the interval to 3, and adds a dose-time at `10:00 / 2`, the medication row stores `cadence_kind='every_few_days'`, `interval_days=3`, and one dose-time row with `applies_to_dow=NULL`.

**As Needed cadence**

- [ ] When the caregiver picks As Needed and taps Save, the medication row stores `cadence_kind='as_needed'`, no dose-time rows are inserted, and no notifications are scheduled.

**Per-time quantity input**

- [ ] When the caregiver taps the "1 tablet" link next to a time, a numeric input appears.
- [ ] Entering `0.5` and saving stores `quantity=0.5` (a numeric).
- [ ] Entering `0` is rejected with an inline error and Save is disabled until corrected.
- [ ] Entering `1.5` saves and renders as `1.5 tablet`.
- [ ] Inputs `1e2`, `Infinity`, `-1`, `NaN`, empty string are all rejected with an inline error. Parsing rule: `Number()` on the trimmed input; reject when `!isFinite(n) || n <= 0`.

**iOS time picker**

- [ ] On a fresh dose-time row (no value), tapping the row opens the iOS native time picker.
- [ ] Verified on Vercel preview from a real iPhone Safari session (manual test plan).

**Wiring into scan flow**

- [ ] After the caregiver taps "Add to my list" on the post-PR-#39 scan review card, a transition to the cadence picker happens within 200ms (instead of the current immediate save-as-PRN).
- [ ] The med is NOT inserted until the caregiver completes the cadence flow and taps Save.
- [ ] Skipping the cadence flow (`Skip` link) saves the med as `cadence_kind='as_needed'` (matches current as-PRN behavior).

**Wiring into edit flow**

- [ ] On the existing per-med edit page (`/me/medications/[id]`), the legacy "Times (optional)" field is replaced with a "Schedule" row that displays the current cadence summary (e.g., "Every day, 8am · 8pm") and a `Change` link that opens the cadence picker.
- [ ] Saving the cadence picker from the edit flow calls `save_medication_with_dose_times(payload)` which **inside one Postgres transaction** deletes all prior `medication_dose_times` rows and inserts the new ones. On any error the transaction rolls back; the prior schedule is unchanged.
- [ ] Before the destructive replace, the cadence picker shows `confirm("Replace the schedule for ${drugName}?")`. Per `destructive-actions.md` class-B (reversible-with-effort by re-entering the schedule).

**Wiring into wizard (`/me/medications/new`)**

- [ ] The wizard's `step-times` step is removed; the cadence picker is inserted in its place.
- [ ] The wizard's `step-dose` no longer collects `pillsPerDose`. Quantity is per-time in the cadence picker.
- [ ] `wizard-action.ts` calls `save_medication_with_dose_times` (the same Postgres function as scan/edit).

**Local notifications**

- [ ] On the first save of any med with a non-`as_needed` cadence, when permission state is `prompt` or `prompt-with-rationale`, the iOS notification permission prompt is requested. (Web is a no-op — `Capacitor.isNativePlatform()` returns false.)
- [ ] On state `granted`, Capacitor `LocalNotifications.schedule()` is called with up to 30 days of upcoming fires. Each fire has `id` = 31-bit FNV-1a hash of `med:{medId}:{occurrenceUnixSeconds}`, `extra: { medicationId }`, `body: 'You have medications scheduled now'`.
- [ ] On state `denied`, the med save still succeeds. UI shows inline note "Reminders blocked. Enable in Settings → Notifications → HeartNote." No re-prompt.
- [ ] On state `prompt-with-rationale`, the system prompt is shown (Capacitor handles the rationale UI).
- [ ] On edit of an existing med's schedule, `cancelNotificationsForMed(medId)` is called first (filters `getPending()` by `extra.medicationId`); then `scheduleNotificationsForMed(medId)` re-schedules.
- [ ] On stop / delete, `cancelNotificationsForMed(medId)` is called.
- [ ] On app `resume` (Capacitor `App.resume` event), `topUpScheduledNotifications()` runs: for each active non-`as_needed` med, the next 30 days of fires are computed; pending fires (by id) are skipped; missing fires are scheduled. Permission cache is busted on resume so the inline-blocked-note reflects current state.
- [ ] When `LocalNotifications.schedule()` rejects with a cap-related error, scheduling stops and `topUpScheduledNotifications()` returns `{ scheduled: N, capped: true }`. Soonest-first ordering ensures the earliest fires across all meds are kept; later fires for any med may be dropped.
- [ ] DST transition: a med scheduled at `08:00` continues to fire at wall-clock `08:00` after fall-back and spring-forward. Manual verification via simulator TZ shift.

### Edge cases

- [ ] Cyclical cadence: `Use for 21, Pause for 7` starting today. On day 22, the notification for the same time-of-day does NOT fire. Verified in manual test plan via system clock advance or simulator.
- [ ] Cyclical cadence with NULL `started_at`: save rejected by Zod with inline error "Set a start date for cyclical schedules."
- [ ] `every_few_days` with NULL `started_at`: save rejected by Zod with inline error "Set a start date for interval schedules."
- [ ] Specific Days cadence: a med scheduled for Mondays only does NOT fire on Tuesdays. Verified in manual test plan.
- [ ] Edit flow: changing cadence_kind from `every_day` (2 dose-times) to `as_needed` deletes both dose-time rows.
- [ ] Edit flow: changing from `specific_days` (3 disjoint groups) to `every_day` (1 row) deletes all 3 prior dose-time rows and inserts the 1 new one.
- [ ] Edit flow: back-navigating from a sub-screen preserves the cadence selection (the picker still shows the previously-chosen kind highlighted).
- [ ] Empty state: caregiver opens cadence picker for a fresh scan, no row is pre-selected. Continue button is disabled until a cadence is chosen.
- [ ] First-time user: notifications permission has never been requested (state `prompt`). First save with a non-PRN cadence triggers the prompt.
- [ ] Returning user with state `denied`: first save with a non-PRN cadence does NOT re-prompt; instead a one-line note "Reminders blocked. Enable in Settings → Notifications → HeartNote." appears next to the Save button.
- [ ] Returning user with state `prompt-with-rationale`: prompt shown (Capacitor handles rationale UI).
- [ ] Caregiver toggles iOS Settings notification permission while app is in background: on `App.resume` the permission cache is busted; the inline-blocked-note reflects the new state.
- [ ] Caregiver switches devices (fresh install): on first launch, `topUpScheduledNotifications()` schedules all active meds' next 30 days within 2s.
- [ ] DST transition (fall-back, spring-forward): a med scheduled at `08:00` continues to fire at wall-clock `08:00`. Spring-forward 2:00→3:00 skipped hour: a 2:30am med fires at 3:30am that day only (not a problem for typical CHF schedules).
- [ ] Min/max dose-time rows: at least 1 row required for non-PRN cadences. UI prevents removal of the last row when cadence ≠ as_needed.
- [ ] Min/max cyclical: 1..365 for both on and off; values outside range rejected by Zod with an inline error.
- [ ] Min/max every_few_days: 2..30 for interval; outside rejected.
- [ ] Disjoint enforcement: caregiver attempts to save with overlapping bitmaps (manually constructed payload) — server action rejects with "Schedule groups must not share days." Race window (mobile + web simultaneous edits) is accepted; result would be duplicate notifications. Pre-launch tradeoff.
- [ ] `as_needed` returns `doses_per_day = NULL` from the RPC (preserves the historical PRN signal that dashboard / TodaysMedsCard / TodaysMedsList branch on).

### Error states

- [ ] Network failure during save: the Postgres function `save_medication_with_dose_times` runs in a transaction. If any insert fails, the transaction rolls back and the prior schedule is unchanged. User sees "Could not save schedule. Try again."
- [ ] Notification permission denied: the med save still succeeds. UI shows the inline note. No nag pattern.
- [ ] iOS notification cap exceeded: `LocalNotifications.schedule()` rejects with a cap-related error. The function stops scheduling further fires across all meds (soonest-first preserved up to the cap). `topUpScheduledNotifications()` returns `{ scheduled, capped: true }`. `App.resume` re-balances.
- [ ] Capacitor on web: `LocalNotifications.schedule()` is a no-op (`Capacitor.isNativePlatform()` short-circuit). UI does not show an error; the med save flow completes normally.
- [ ] Validation: caregiver picks `cyclical` but leaves `cycle_on_days` empty. Save button stays disabled and inline error reads "Set the on-period length."
- [ ] Validation: caregiver picks `specific_days` but leaves all day pills unchecked in any group. Save disabled, inline error reads "Pick at least one day."
- [ ] Validation: caregiver picks `every_few_days` but leaves `interval_days` empty. Save disabled, inline error reads "Set the interval."
- [ ] Validation: caregiver picks `cyclical` or `every_few_days` but `started_at` is empty. Save disabled, inline error reads "Set a start date."
- [ ] Validation: caregiver enters quantity `0`, `-1`, `NaN`, `Infinity`, `1e2`. Inline error appears; Save disabled until corrected.

### Performance

- [ ] Cadence picker tap → sub-screen mount completes within 200ms on a Vercel preview from an iPhone (manual test).
- [ ] Save → server-action round-trip for a med with up to 7 dose-time rows completes within 2s on a Vercel preview.
- [ ] Notification scheduling for 30 days (≤90 occurrences) completes within 500ms on a Capacitor iOS device.
- [ ] On web (Capacitor non-native), `scheduleNotificationsForMed()` returns within 50ms (no-op fast path).

### Persistence

- [ ] One row in `medications` (cadence_kind, cycle_*, interval_days populated per kind).
- [ ] N rows in `medication_dose_times` per med (0 for `as_needed`, ≥1 otherwise).
- [ ] No localStorage. No URL state. No in-memory caches of cadence beyond the active edit session (per `code-quality.md` rule #3).
- [ ] Notification IDs persist in iOS's notification queue, NOT in our DB. On `resume`, we reconcile with `medication_dose_times` rows (DB is the truth).

### Permissions / RLS

- [ ] `medication_dose_times` has RLS enabled with a policy that joins to `medications → patients` and checks `caregiver_id = auth.uid()` for both USING and WITH CHECK clauses.
- [ ] A second caregiver attempting to read another caregiver's `medication_dose_times` rows via PostgREST receives an empty result (verified by RLS probe — see manual verification).
- [ ] Server actions verify `auth.getUser()` and resolve patient via `caregiver_id` before any insert/update (matching existing actions.ts pattern).

### Side effects

- [ ] On save: revalidate `/me/medications` and `/dashboard` (existing pattern).
- [ ] On save with non-PRN cadence: schedule local notifications via Capacitor.
- [ ] On stop / delete: cancel local notifications.
- [ ] No new RPCs except the updated `medication_adherence_for_day`.
- [ ] No changes to alert evaluation, voice-log, dashboard, or visit-report subsystems.

### Manual verification

For each of the five cadence kinds, on a Vercel preview AND a real iOS device:

1. **Every Day**: Add a med, pick `Every Day`, set one time `08:00` qty `1`. Save. Verify in Supabase Studio:
   - `medications` row: `cadence_kind='every_day'`, `cycle_on_days=NULL`, `cycle_off_days=NULL`, `interval_days=NULL`.
   - `medication_dose_times`: one row with `time_of_day='08:00'`, `quantity=1`, `applies_to_dow=NULL`.
   - On iOS: open Settings → Notifications → HeartNote → Scheduled, see one notification at 08:00 tomorrow (or today if it's before 08:00).

2. **Cyclical**: Add a med, pick `Cyclical`, `Every Day`, `Use for 21`, `Pause for 7`, time `09:00 / 1`. Save. Verify:
   - `medications`: `cadence_kind='cyclical'`, `cycle_on_days=21`, `cycle_off_days=7`.
   - On iOS: 21 scheduled notifications at 09:00 starting today, then a gap of 7 days, then more (or just the rolling 30-day window).

3. **Specific Days, two groups**: Pick Specific Days, group 1 = Sun+Tue at `08:00 / 1`, group 2 = Mon+Thu+Sat at `13:00 / 1`. Verify two `medication_dose_times` rows with bitmaps `1|4=5` and `2|16|64=82`, disjoint. On iOS: notifications fire on the matching day-of-week only.

4. **Every Few Days**: Pick Every Few Days, interval `3`, time `10:00 / 1`. Verify `medications.interval_days=3`. On iOS: notifications at 10:00 today, today+3, today+6, etc.

5. **As Needed**: Pick As Needed, Save. Verify zero `medication_dose_times` rows. No notifications scheduled.

6. **Edit cadence kind**: Open an existing `every_day` med with 2 dose-times. Change to `as_needed`. Save. Verify both `medication_dose_times` rows are deleted.

7. **Permissions denied**: On a fresh iOS install, deny the notification prompt. Save still succeeds; the inline note appears. Re-enable in iOS Settings; on next app foreground, existing meds re-schedule.

8. **Stop med**: Open an active `every_day` med, tap "Stop taking this." Verify in iOS Notifications → Scheduled that the med's notifications are gone.

9. **RLS probe**: From the SQL editor with `auth.uid()` set to caregiver A, run `SELECT * FROM medication_dose_times WHERE medication_id = '<caregiver B's med>'`. Expect 0 rows.

10. **Manual verification of `Cache-Control` headers** on `/me/medications/[id]` and the new cadence picker route (if it lives at a sub-route): response headers include `Cache-Control: no-store, must-revalidate`. Per `auth-sessions.md` rule #1.

## Implementation order (verifiable steps)

Steps are listed in dependency order. Steps 1–4 are the data layer; 5–9 are UI and notifications (5–9 can interleave); 10–12 are wiring.

1. **Migration** — drop columns, add cadence columns, create `medication_dose_times` with RLS, write the `save_medication_with_dose_times` Postgres function, update `medication_adherence_for_day` RPC. Verify: `supabase db push` succeeds; manual SQL queries for each cadence kind return the expected `doses_per_day` per-day.
2. **Regenerate types** — `npm run db:types`. Verify: TypeScript build clean against the new types.
3. **`cadence.ts` constants module** — `CADENCE_KINDS`, DOW bitmap, FNV-1a hash, cadence-summary formatter, due-today predicate. Verify: imported by step 4 Zod schema; tsc clean.
4. **`actions.ts` payload + server actions** — discriminated-union Zod schema, `addMedication` / `updateMedication` / `addExtractedMedications` call `save_medication_with_dose_times` via RPC. Drop `pillsPerDose` references. Verify: scripted insert + select round-trip for each cadence kind succeeds; invalid cases rejected.
5. **`dashboard/actions.ts`** — `confirmDose` uses RPC's per-day `doses_per_day` instead of `medications.doses_per_day`. Verify: existing slot-gate behavior preserved (regression test fixture for a `every_day` med).
6. **`CadencePicker` component** — 5-row picker. Verify: renders, single-select, Continue disabled until pick.
7. **`CadenceFields` per-kind sub-screens** — Every Day / Cyclical / Specific Days / Every Few Days / As Needed. Each renders its sub-controls + dose-time rows. iOS time picker fix here (no pre-fill, `showPicker()` on tap). Verify: Vercel preview from a real iPhone — tapping a fresh row opens the native picker.
8. **`DayPills` with disjoint claim** — 7-button row + cross-group disable. Verify: claimed-day pills mute in other groups.
9. **`notifications.ts`** — Capacitor wrapper module (schedule, cancel, top-up, permission state machine, ID hash, web no-op). Verify: scheduled IDs visible in iOS Settings; cancel on stop works; web returns no-op within 50ms.
10. **Wire into scan flow** — `scan-review-card.tsx` "Add to my list" navigates to cadence picker; `scan-client.tsx` orchestrates the new transition. `Skip` from cadence picker saves as `as_needed`. Verify: end-to-end on Vercel preview.
11. **Wire into edit flow** — `medications-form.tsx` replaces "Times (optional)" + "Doses per day" + "Pills per dose" fields with a single "Schedule" row. `[id]/page.tsx` passes cadence data. `confirm()` dialog before destructive replace. Verify: on Vercel preview.
12. **Wire into wizard** — replace `step-times.tsx` with cadence picker; drop `pillsPerDose` from `step-dose.tsx`; `wizard-action.ts` calls the new server action. Verify: end-to-end wizard flow saves a `every_day` med correctly.
13. **Update list-client display** — `medications-list-client.tsx` renders cadence summary string instead of `${pills_per_dose}× ${dose}` and `${doses_per_day}× per day`. Verify: each cadence kind renders a sensible one-line summary.
14. **End-to-end manual test plan** — items 1–10 in Manual verification above. Vercel preview + real iOS device.

## Plan-review responses (per `feature-workflow.md` step 4)

The fresh-context plan reviewer raised 13 findings (2 blockers, 5 highs, 5 mediums, several lows). All 7 blocker/high items addressed in this revision:

| Finding | Severity | Resolution |
|---|---|---|
| RPC update was hand-waved; downstream consumers (`evaluate.ts`, `TodaysMedsList.tsx`) read `doses_per_day` and need cadence-aware filtering. | Blocker | RPC update now spelled out per-cadence-kind in §Architecture/Schema item 9. |
| `dashboard/actions.ts:51` reads `medications.doses_per_day` directly; dropping the column breaks `confirmDose`. | Blocker | Brought `dashboard/actions.ts` into scope; rewires to RPC. Step 5 in implementation order. |
| `every_few_days` requires `started_at` anchor (currently nullable). | High | Zod refinement added to lock-in decisions; AC added under Edge cases. |
| Cyclical day-0 anchor was undefined. | High | Pinned to `started_at`. Zod requires non-null when `cadence_kind = 'cyclical'`. |
| iOS permission state machine had only 2 states (granted/denied). | High | Spec covers all 4 Capacitor states (`granted`, `denied`, `prompt`, `prompt-with-rationale`). ACs split per state. |
| 64-cap priority policy was hand-waved. | High | Pinned to soonest-first across all meds. ACs reflect this. |
| `topUpScheduledNotifications()` dedup was unimplementable as written (Capacitor needs numeric IDs). | High | Pinned to 31-bit FNV-1a hash strategy + `extra.medicationId` filter via `getPending()`. |
| Edit-flow atomicity not real with Supabase JS. | High | New Postgres function `save_medication_with_dose_times` documented in §Architecture/Schema item 8. |
| Disjoint-bitmap race window. | High | Tradeoff made explicit: Zod-only for v1, race accepted, worst case = duplicate notifications. |
| 18 files reference dropped columns; "diff scoped to seven files" understated. | High | Scope file list rewritten in Engineering ACs to enumerate all 18+ files plus 4 new ones. |
| `as_needed` returning `doses_per_day = 0` would break PRN-vs-scheduled split. | Medium | Pinned: RPC returns NULL for `as_needed`. |
| DST handling absent. | Medium | Documented in §Notification system + AC under Edge cases. |
| Quantity input edge cases (NaN, scientific). | Medium | AC added under Per-time quantity input. |
| Confirm dialog on destructive cadence replace missing. | Medium | AC added under Wiring into edit flow. |
| Wizard at `/medications/new` writes dropped columns. | Medium | Brought into scope; step 12 in implementation order. |

The 4 low-severity findings were either already covered or not load-bearing; they are not addressed here. Reviewer's coherence check passed (Behavior #2 deferral leaves no orphan references).

## Open after-this-PR follow-ups (NOT in this PR)

- Behavior #2 (when user recalls/specifies it).
- Per-med notification copy (if user prefers per-med over aggregate after using v1).
- Deferrable trigger constraint for disjoint-bitmap groups (post-launch, when multi-device editing becomes a real risk).
