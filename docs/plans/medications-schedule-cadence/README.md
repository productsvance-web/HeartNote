# Medication schedule + cadence — handoff

## Status going in
- **PR #39 merged** (commit `2160037`). Single-screen scan review: drug name + strength + form + Verified badge → "Add to my list" → med saves as PRN with `schedule_times = null`, `doses_per_day = null`.
- **No schedule UI ships today.** The schedule step from PR #39's plan was rolled back when iOS Safari's native time picker failed and three of three rows were either static or non-functional.
- **The schema columns exist** (`medications.schedule_times text[]`, `medications.doses_per_day int`, `medications.pills_per_dose int`) but are unused by any caregiver-facing feature — the only consumer is the `medication_adherence_for_day` RPC which returns them but no UI today renders them.

## What this task is
Build the schedule UI for adding and editing a medication's schedule, supporting all five Apple Health cadence kinds, plus a local-notification system that pings the caregiver at each scheduled time.

## Notification scope (explicit, narrow)
- **What this DOES:** at each scheduled time, fire a local notification — *"You have medications scheduled now"* (aggregate across all meds firing at the same minute).
- **What this DOES NOT:** missed-dose detection, adherence comparison, log-a-dose UI, server-side scheduling, push notifications.
- **Implementation:** Capacitor `@capacitor/local-notifications` plugin. The OS handles delivery whether the app is open or closed.
- **iOS permissions:** ask on first med-with-schedule save, not at app start. If denied, save still succeeds; surface the explanation inline.

## Behavior #2 — TBD
The user has a second behavior they want for medications but couldn't recall during the previous session. **Confirm before starting implementation.** Don't backfill from imagination — ask explicitly: "what was the second behavior you wanted besides notifications?"

## The five cadence kinds (Apple Health reference)

The cadence picker is one screen with five options. Each option drives a different sub-field shape on the next screen. Visual reference (if attached) in `screenshots/`; field-level annotations follow.

### 1. Every Day
**Tagline:** "Take dose at the same time."
- One or more `(time_of_day, quantity)` pairs.
- Notification fires every day at each time.
- Default cadence for a freshly-saved med.

### 2. On a Cyclical Schedule
**Tagline:** "Take every day for 21 days and pause for 7 days."
- `Every` picker — `Day` (most common) or `Week` (unit choice for the cycle counts; possibly `Month` too — confirm if Apple offers it).
- `Use for` — count of `Every` units (e.g. `21 days` or `3 weeks`).
- `Pause for` — count of `Every` units (e.g. `7 days` or `1 week`).
- One or more `(time_of_day, quantity)` pairs that fire during the *use* period only.
- The `Every` picker is a **display preference**: 21 days is exactly 3 weeks. Underlying math is days. Render in days or weeks based on the user's pick. Persist days.

### 3. On Specific Days of the Week
**Tagline:** "On Mondays, On Weekdays."
- One or more **schedule groups**, each with:
  - A day-of-week multi-select pill row (S M T W T F S).
  - One or more `(time_of_day, quantity)` pairs.
- **Days are mutually exclusive across groups within a single med.** Apple greys out claimed days in the upper group when a lower group claims them. Once Monday is in group 2, the group 1 pill for Monday goes inactive.
- A "Schedule Other Days" button at the bottom adds a new group seeded with the unclaimed days.
- Notification fires on selected days at each time.

### 4. Every Few Days
**Tagline:** "Every other day, Every 3 days."
- `Interval` picker — `Every Other Day`, `Every 3 Days`, ..., `Every 13 Days` (Apple's list ran at least to 13 in the screenshot; the practical ceiling is probably 30 — confirm with the user).
- One or more `(time_of_day, quantity)` pairs that fire every N days starting from `started_at`.

### 5. As Needed (PRN)
- No times. No notifications. Nothing else.

## Confirmed v1 design choices

These are decided, not open questions:

1. **Per-time quantity is structured.** When the caregiver taps the "1 tablet" link next to a time, a numeric input lets them type any positive number. 0.5 (half-tablet), 2 (two tablets), 1.5 (an awkward 1.5 doses) are all valid. Stored as `numeric`.
2. **Per-day-different-times is supported v1.** That's the entire purpose of the multi-group `specific_days` cadence; the "Schedule Other Days" button is the entry point.
3. **No per-time unit variance.** The medication's existing `dose` field carries the strength of one pill (e.g., `2.5 mg`). Per-time quantity multiplies that. We do NOT support "5 mg AM, 10 mg PM" stored as different per-time strengths — that pattern uses two prescriptions.

## Schema changes

### Drop from `medications`
```sql
ALTER TABLE medications
  DROP COLUMN schedule_times,
  DROP COLUMN pills_per_dose;
```
These get replaced by per-row data in the new `medication_dose_times` table.

### Add to `medications`
```sql
ALTER TABLE medications
  ADD COLUMN cadence_kind text NOT NULL DEFAULT 'every_day'
    CHECK (cadence_kind IN ('every_day','cyclical','specific_days','every_few_days','as_needed')),
  ADD COLUMN cycle_on_days int    -- cyclical kind only: e.g. 21
    CHECK (cycle_on_days  IS NULL OR cycle_on_days  BETWEEN 1 AND 365),
  ADD COLUMN cycle_off_days int   -- cyclical kind only: e.g. 7
    CHECK (cycle_off_days IS NULL OR cycle_off_days BETWEEN 1 AND 365),
  ADD COLUMN interval_days int    -- every_few_days only: 2..30
    CHECK (interval_days  IS NULL OR interval_days  BETWEEN 2 AND 30);
```
`doses_per_day` stays for the immediate query path (counting fires/day) but its value becomes derived (`COUNT(*) FROM medication_dose_times WHERE medication_id = ...`). Decide in implementation whether to keep it as a denormalized cache or drop entirely.

### New table `medication_dose_times`
```sql
CREATE TABLE medication_dose_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  time_of_day text NOT NULL CHECK (time_of_day ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  quantity numeric NOT NULL CHECK (quantity > 0),
  ordinal smallint NOT NULL,
  -- For specific_days cadence only.
  -- NULL = applies regardless of day (every_day, cyclical, every_few_days).
  -- Bitmap: Sun=1, Mon=2, Tue=4, Wed=8, Thu=16, Fri=32, Sat=64. Range 1..127.
  applies_to_dow smallint
    CHECK (applies_to_dow IS NULL OR applies_to_dow BETWEEN 1 AND 127),
  UNIQUE (medication_id, ordinal),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX medication_dose_times_med_idx ON medication_dose_times(medication_id, ordinal);

ALTER TABLE medication_dose_times ENABLE ROW LEVEL SECURITY;

CREATE POLICY "caregiver crud own med dose times" ON medication_dose_times
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM medications m
      JOIN patients p ON p.id = m.patient_id
      WHERE m.id = medication_dose_times.medication_id
        AND p.caregiver_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM medications m
      JOIN patients p ON p.id = m.patient_id
      WHERE m.id = medication_dose_times.medication_id
        AND p.caregiver_id = auth.uid()
    )
  );
```
**Why bitmap not enum-list:** smaller, indexable, and the disjoint-groups check is a `bit_and(applies_to_dow) = 0` operation across rows.

### Update `medication_adherence_for_day` RPC
Currently returns `schedule_times text[]` from `medications`. Change to LEFT JOIN `medication_dose_times` and return `jsonb` of `[{time_of_day, quantity, applies_to_dow}, ...]` filtered to the date's day-of-week. Or keep returning `text[]` of times and a parallel array of quantities — caller's preference.

## Cross-table invariants (app-enforced in `actions.ts`)

Postgres cross-table CHECK constraints are awkward. Enforce these in `MedicationPayloadSchema` Zod refinements + server action validation:

| Invariant | Check |
|---|---|
| `as_needed` → no dose-times | reject save if cadence is `as_needed` and dose-times array non-empty |
| `every_day` / `cyclical` / `every_few_days` → all `applies_to_dow = NULL` | reject save if any dose-time has a non-null bitmap |
| `specific_days` → all `applies_to_dow != NULL` | reject save if any dose-time has a null bitmap |
| `cyclical` → both cycle counts set | reject save otherwise |
| `every_few_days` → `interval_days` set | reject save otherwise |
| `specific_days` → bitmaps pairwise disjoint within a med | reject save if `bit_and` across rows is non-zero — worst-case on violation is duplicate notifications |

## UI work

### Cadence picker screen
Five-row list, single-select with checkmark. Match the Apple Health visual: title row + tagline subline. Examples in the Apple screenshots (drag into `screenshots/` if you have them):
- "Every Day" / "Take dose at the same time"
- "On a Cyclical Schedule" / "Take every day for 21 days and pause for 7 days"
- "On Specific Days of the Week" / "On Mondays, On Weekdays"
- "Every Few Days" / "Every other day, Every 3 days"
- "As Needed"

### Cadence-specific schedule screens
Each kind shows the cadence row at the top with a `Change` link, then its sub-fields, then `(time_of_day, quantity)` rows, then duration, then `Next` CTA pinned to the bottom.

**iOS time picker bug from PR #39's first attempt:**
- Symptom: `<input type="time">` did not open the iOS native picker on tap.
- Hypothesis: pre-filling the value at row creation might block the picker, or Capacitor WebView needs a `showPicker()` call on the input ref.
- Test: create the input WITHOUT a default value, let user tap it to open the picker, capture HH:MM on `change`. Or call `inputRef.current?.showPicker()` on row click.
- Verify on Vercel preview before claiming the picker works — agent rule-out gave a false negative on PR #39.

### Per-time quantity link
Tappable text reading the current quantity (e.g., "1 tablet"). On tap, present a small inline numeric input or a sheet with a numeric keyboard. Validate `> 0`. Round display: `1`, `1.5`, `0.5`, `2`. Default new rows to `1`.

### Specific-days groups
- Day pills component: 7 buttons, S M T W T F S. Tappable to toggle. Once tapped in one group, the same day in another group greys out and becomes non-tappable.
- "Schedule Other Days" button at the bottom of the last group, disabled when all 7 days are claimed.
- New groups seed with the **unclaimed** days, not blank.

### Duration
- `Start date`: defaults to today, editable (use the existing date input pattern from the wizard).
- `End date`: defaults to none, optional. Render "None" when null.
- Existing wizard's date logic should work — don't reinvent.

## Notification system

### Library
`@capacitor/local-notifications`. Add to `package.json`, sync via `npx cap sync ios` after install.

### Lifecycle
1. **Med save (any cadence except `as_needed`):**
   - Compute the next N occurrences (recommended: cover ~30 days ahead, but check iOS's per-app scheduled-notification cap — historically 64 max).
   - Schedule one local notification per occurrence: `id`, `body`, `schedule.at` (Date object).
   - Group all of a med's scheduled notifications under a stable ID prefix so they're cancellable together.
2. **Med edit:** cancel the med's previous notifications, re-schedule fresh.
3. **Med stop / delete:** cancel all the med's notifications.
4. **Cadence change to `as_needed`:** cancel all notifications.
5. **Background re-schedule:** because of iOS's notification cap, schedule a "rolling window" — when the app reopens, top up the next 30 days from where they ran out. Capacitor `@capacitor/app` has a `resume` event for this.

### Notification copy
Default: aggregate per-time-of-day, not per-med:
> **You have medications scheduled now.**
> Tap to see what's due.

Rationale: a caregiver with 6 meds at 8am doesn't want 6 separate buzzes. Per-med copy ("Take your Furosemide") is the alternative — confirm with user which they want for v1.

### Notification permission flow
- First save with a cadence that fires notifications: prompt for permissions.
- If denied: save the med anyway, show a one-line note: "Reminders blocked. Enable in Settings → Notifications → HeartNote." No nag pattern.
- Per `.claude/rules/auth-sessions.md` patterns — match the no-dead-end-state rule.

### iOS-only for now
Capacitor on web is no-op for local notifications. The dev preview on browser will not actually fire notifications. Verify on a real iOS install.

## Implementation steps (suggested order)

1. **Migration** — drop old columns, add cadence columns, create `medication_dose_times` with RLS. Test on the linked Supabase project. Run `npm run db:types` and verify clean round-trip.
2. **Update `medication_adherence_for_day`** — RPC reads from new table.
3. **`actions.ts` schema** — `MedicationPayloadSchema` accepts the new shape; refines for cadence-specific invariants; server action splits the payload across two table inserts in a transaction.
4. **Cadence picker UI** — five-row list, navigates to the cadence-specific screen.
5. **Per-cadence sub-screens** — Every Day / Cyclical / Specific Days / Every Few Days / As Needed. Single-component-with-step-state pattern from PR #39, not separate routes (less surface area).
6. **Time-of-day rows** — fix the iOS picker. Add quantity-link tap target.
7. **Day-pill component for specific_days** — with disjoint-claim enforcement.
8. **Capacitor local-notifications integration** — schedule on save, cancel on edit/delete.
9. **Wire into scan flow** — after Step 1's "This looks right" CTA, navigate to the cadence picker.
10. **Wire into `/me/medications` edit flow** — same UI for editing existing meds.
11. **Manual test plan execution** on Vercel preview AND a real iOS device (notifications won't fire on web).

## Constraints to respect

From CLAUDE.md / `.claude/rules/`:
- **Karpathy guidelines**: think before coding, simplicity first, surgical changes, goal-driven execution.
- **Build conv #6 — never recommend dose changes.** Cyclical and interval cadences must NOT be auto-extracted from a label by the LLM. They're caregiver-input only.
- **Build conv #9 — no half-finished implementations.** If iOS denies notification permissions, the schedule still saves; surface the cause; don't render a dead button.
- **Build conv #11 — env vars fail closed.** Capacitor plugin config: missing iOS bundle ID → throw, don't substitute default.
- **`.claude/rules/code-quality.md` #1** — single source of truth for cadence enums (don't repeat the five strings in 3+ files; one constant in `lib/medications`).
- **`.claude/rules/code-quality.md` #2** — schedule-validation logic in one place. The actions-layer Zod refinement is the canonical version; UI layer reads it via inferred types.
- **`.claude/rules/code-quality.md` #3** — DB is source of truth. Don't cache scheduled notifications in component state without a way to reconcile with `medication_dose_times` rows.
- **Memory `feedback_react_closure_in_timers.md`** — if any client-side timer is used (e.g., a debounce on save), use refs for stale-closure-prone values.
- **Memory `feedback_normalize_rxnorm_forms.md`** — if displaying form (`tablet`, `capsule`) anywhere in the schedule UI (e.g., next to quantity), pass through `normalizeForm()`.
- **Memory `feedback_async_in_effects.md`** — be careful with async work in `useEffect` if scheduled-notification updates are kicked off there.

## Out of scope (explicit, do NOT scope-creep)

- Missed-dose detection / adherence alerts.
- Log-a-dose UI for the caregiver to record that the patient took a pill.
- Server-side scheduling.
- Push notifications (use local notifications only).
- HealthKit integration / pulling meds from Apple Health.
- Time zones beyond the device's local time. (Most CHF meds are taken in the patient's home; advanced timezone semantics are deferred.)
- Refill / pill-count tracking ("you have 5 days left of your prescription").
- Custom intervals beyond the existing five cadence kinds (e.g., "every 2 hours" — that's a different cadence altogether and not in Apple's set).

## Manual test plan

For each cadence kind, on a Vercel preview AND a real iOS device:

1. **Every Day**: add med with one time and one quantity. Verify a row in `medication_dose_times` with correct fields. Verify a notification scheduled for the next occurrence (use iOS Settings → Notifications → HeartNote to view).
2. **Cyclical**: add a med with `Use for 21 days, Pause for 7 days`, two times. Verify notifications fire daily during the on-period and don't during the off-period (advance the system clock or use the iOS simulator).
3. **Specific Days, single group**: add a med with Mon+Wed+Fri at 9am. Verify notifications fire only those days.
4. **Specific Days, two groups**: add a med with group 1 = Sun+Tue at 8am, group 2 = Mon+Thu+Sat at 1pm. Verify the day pills enforce mutual exclusivity in UI. Verify two `medication_dose_times` rows with disjoint bitmaps.
5. **Every Few Days**: add a med with Every 3 Days at 10am. Verify notification cadence relative to `started_at`.
6. **As Needed**: add a med, save. Verify zero `medication_dose_times` rows. Verify no notifications scheduled.
7. **Edit a saved med to change cadence kind**: verify old dose-times rows replaced, old notifications cancelled, new ones scheduled.
8. **Permissions denied path**: deny iOS notification permission on first prompt. Save still succeeds. UI surfaces the cause. Re-enable permission via Settings; existing meds re-schedule on next app foreground.
9. **Stop a med (`stopped_at` set)**: notifications cancel.

## References

- Plan from PR #39: `docs/plans/medications-apple-style-review.md` (note: the schedule-step ACs there are obsolete; this doc supersedes them).
- Predecessor scan plan: `docs/plans/medications-scan-ndc-first.md`.
- Schema: `supabase/migrations/20260502070034_medication_slots_resolved.sql` defines the current `schedule_times`/`pills_per_dose` shape that this work replaces.
- Adherence RPC: defined in the same file — needs updating to read from new table.
- Apple Health screenshots: `screenshots/` (drop your phone screenshots here for visual reference).
