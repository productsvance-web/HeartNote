# Heart-rate, blood-pressure, pillows trend pages — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Plain-English goal.** Add three dedicated trend pages — heart rate, blood pressure, pillows — to round out the per-vital trend gallery. Each shows the same chassis as `/trends/spo2` and `/trends/weight`: today's value at the top, a chart at the user's selected D/W/M/6M/Y window, three supporting stats, and a floating "+" button to add a new reading. Each chart shape is tuned to what makes the vital legible: bar-and-mean ranges for heart rate, sys-dia dumbbells for blood pressure, lollipops above a baseline for pillows. The third invocation of the windowing helpers is the moment to hoist the duplicated date / x-label / subhead math out of the two existing trend views into one shared module.

**Architecture.**

1. **Window-math hoist (pre-build refactor).** `defaultEndForPeriod`, `forwardBoundForPeriod`, `backwardBoundForPeriod`, `windowSpanMs`, `xLabelsFor`, `subheadFor`, plus the date helpers (`isoDateOf`, `dowOfDay`, `endOfDayMs`, `endOfWeekMs`, `endOfMonthMs`, `anchorsAt*`, `hourLabel`, `weekdayLabel`, `shortDateLabel`, `monthLabel`, `dayTimeLabel`) move into `src/lib/trends/window-math.ts`. Weight + spo2 are migrated to import from there. **Bug fix in flight:** `dayTimeLabel` currently computes "Today / Yesterday" against the caregiver's browser-local `Date.now()`, not the patient timezone — flagged as deferred in the spo2 plan. The hoisted version takes `today` (a patient-tz `YYYY-MM-DD`) as an argument and compares against that instead. Per rule-of-three: weight + spo2 + heart-rate = three callers; this is the right moment.

2. **Heart rate (`/trends/hr`).** Mirrors `/trends/spo2`'s shape. Stores `field='resting_hr'` rows in `daily_log_readings` (already in the enum). Chart is a vertical **range bar** per day with a mean dot — built by extending `TraceChart` with an optional `rangeBars` prop (avoids a parallel chart file; the geometry is small). The visual register is identical to spo2's TraceChart in cream stroking and last-point halo. Stat trio per the mockup: Highest / Lowest / Today. Stepper is integer-only with `step=1` and no press-and-hold. Engine T2.11 (a, b, c) already handles HR thresholds — no engine change.

3. **Blood pressure (`/trends/bp`).** Two readings per save (systolic + diastolic), both `field='*_bp'` in `daily_log_readings`. Chart is a new **dumbbell** — a thin sage stick from each day's sys dot down to its dia dot — built as a new `DumbbellChart` file in `vitals-trend/` (different geometry from `TraceChart`'s line+dots, not worth shoehorning). The add-reading sheet is a new `AddBpSheet` that wraps the existing `DualStepperControl` from `src/components/heartnote/log/DualStepperControl.tsx`. Stat trio per the mockup: Highest sys / Lowest sys / Readings (count). Engine T2.10 (SBP <90 with dizziness / confusion / cool-clammy) already handles BP — no engine change.

4. **Pillows (`/trends/pillows`).** Day-level summary (one number per night), not a per-moment cuff reading. Chart is a new **lollipop** — thin stick from a baseline (the patient's `normal_pillow_count`) up to each night's count — built as a new `LollipopChart` file in `vitals-trend/`. Stat trio per the mockup: 12-month average / Months at 2+ / Nights logged. Engine T2.4 (orthopnea: today's pillow_count > rolling-7d max OR > baseline+1) already handles pillows — no engine change.

   **Pillows storage decision (surfaced; see "Decisions captured" §2).** `pillow_count` is a column on `daily_logs`, not a field in `daily_log_readings`. Reading the trend from `daily_logs WHERE pillow_count IS NOT NULL` is the cleanest scoped fit; `addPillowReading` inserts a new `daily_logs` row with `pillow_count` set + `processing_status='complete'`. Engine and voice-log pipeline unchanged.

5. **Shared primitives stay shared.** The `AddReadingSheet` / `ViewDataSheet` / `InfoMenu` from `vitals-trend/` continue to power weight, spo2, **and heart rate**. BP gets its own `AddBpSheet` (dual values) and reuses `ViewDataSheet` with a row formatter override for `"130 / 82"`. Pillows uses the shared single-value sheet with a `dateOnly` config switch (no time input — pillows is a per-night count).

**Tech stack.** Next.js 16 (App Router), TypeScript, Tailwind 4, Supabase JS, `lucide-react`, plain inline SVG. Tests in Playwright (UI smoke).

---

## Decisions captured before planning

### 1. Heart-rate Y-axis: mockup wins

Directive said `[50, 120]` with the dashed line at 100 (`HR_TIER_2_HIGH`). Mockup at `docs/design/heartnote-vitals-trends-mockup.html` (Phone 2 / `chart-hr`) shows `min: 50, max: 110` with ticks at `[110, 100 (alert), 80, 60]`.

**Going with mockup.** Per `~/.claude/projects/.../learnings.md` 2026-05-10 "Mockup beats register-consistency" and CLAUDE.md rule #12 "design wins by default." The 120 ceiling is `HR_TIER_2_VERY_HIGH`; the mockup ceiling of 110 still keeps the 100 dashed alert line visible above all-normal data and only clips an `HR_TIER_2_VERY_HIGH=120` reading at the top edge (acceptable — those are emergencies that show up in red on the home screen anyway). If a user lands a 120+ reading, the chart shows a dot pinned at the top; the stat trio's Highest cell shows the literal value.

### 2. Pillows storage: read from `daily_logs`

Directive said "pillows already in the `daily_log_readings` field enum." That's not the case — `daily_log_readings.field` CHECK is `('weight_lb','resting_hr','spo2','systolic_bp','diastolic_bp')`. `pillow_count` is a `smallint` column on `daily_logs`.

**Going with: read from `daily_logs WHERE pillow_count IS NOT NULL`.** Reasoning:

- **Engine + voice pipeline alignment.** The alert engine's T2.4 orthopnea rule reads `dayLevel.pillow_count` from the latest `daily_logs` row for today (`evaluate.ts` ~line 364, supported by query at line 665 ordering by `created_at DESC`). The voice log pipeline writes pillow_count into `daily_logs.pillow_count` via the `apply_voice_log_extraction` RPC. Routing manual taps through the same column keeps engine + voice + page reading the same canonical source. No engine change, no dual-write, no inconsistency between "what the engine sees" and "what the page shows."

- **Data shape fit.** Pillows is a per-night summary — once a night, one number, no per-moment timestamps that matter. Spo2/weight/HR/BP are per-moment cuff/scale readings where intra-day timestamps carry signal. The mockup confirms this: Y-view is **monthly averages**, M-view is one dot per night. Treating pillows as a single per-night value matches the data shape.

- **`addPillowReading` shape.** Creates a fresh `daily_logs` row (the UNIQUE on `(patient_id, log_date)` was dropped in migration `20260501041617`, so multiple rows per day are allowed) with `pillow_count` set, `processing_status='complete'`, `log_date` from the user's date input. Engine re-eval automatically picks up the new value via the freshest-non-null read.

- **`deletePillowReadings` shape.** A `daily_logs` row may also carry voice-log data (transcription, symptoms, other vitals); we can't delete the row. **The delete action sets `pillow_count = NULL` on the targeted rows** (does not delete the row). For "Delete all pillows data," it's `UPDATE daily_logs SET pillow_count = NULL WHERE patient_id = $1 AND pillow_count IS NOT NULL`. This means "delete a pillow reading" is **scrubbing the value from that log entry**, not removing the entry. Documented in the confirm() copy: "Clear the pillow count from this log entry?" — see Functional ACs below.

- **Trend page X-axis: `log_date` at noon patient-tz.** No exact hour for pillow readings — they're per-night. Map each `daily_logs` row to a `VitalReading` of `{id, value: pillow_count, log_date, recorded_at: <log_date>T12:00 in patient tz}`. Multiple voice + manual entries on the same night yield multiple `VitalReading`s at the same X (different `id`); the chart shows multiple dots at the same x if the user actually entered the same night twice.

**Alternative considered:** add `'pillow_count'` to the `daily_log_readings` field enum + migrate voice pipeline + migrate engine. **Rejected as out-of-scope for this PR:** touches the voice-log RPC (which writes to `daily_logs.pillow_count`), the alert engine's freshest-pillow read, and creates a transitional window where some pillow_count history is on `daily_logs` and some is on `daily_log_readings`. Possible follow-up if there's a clear product reason (e.g., per-bedtime hour matters); not now.

### 3. Range chart for HR: extend `TraceChart`, don't fork

Heart rate's range-bar chart shares ~80% with TraceChart (axes, x labels, clipPath, dot rendering for the mean, last-point halo). The variance is one render branch: bars instead of (or alongside) a line. Adding an optional `rangeBars?: { dayKey: string; min: number; mean: number; max: number }[]` prop to `TraceChart` plus a `mode: 'line' | 'range'` switch is ~40 lines; building a parallel `RangeChart` is ~250 lines of mostly-duplicated chart frame. Going with the extension; the chart frame is the cohesive part. BP and pillows DO get their own chart files because the geometry (dumbbells, lollipops with baseline) differs more substantially.

### 4. Dumbbell + lollipop are new chart files

These are different visual primitives. Trying to fold them into `TraceChart` would balloon its responsibilities (lines, areas, ranges, dumbbells, lollipops) — that's an abstraction the rule of three already passes but the cohesion test fails. New files: `DumbbellChart.tsx`, `LollipopChart.tsx`, each ~150 lines. They share the axis-drawing logic — extracted as small functions in a `chart-frame.ts` only **if** the third chart needs it (rule of three within the new files). For this PR: copy-paste the axis-draw lines from `TraceChart` into each new file. Don't pre-hoist.

### 5. Pillows date-only input

`AddReadingSheet` currently takes a date AND a time input. Pillows is per-night — exact hour has no meaning. The shared sheet picks up a `dateOnly?: boolean` config flag. When true: hide the time input and stamp `recorded_at = ${date}T12:00` in patient tz at save time. Defaults to false for all other vitals. Minimal config-driven change; doesn't introduce a parallel sheet.

### 6. BP gets its own add-sheet

Two values per reading + dual stepper makes the shared single-value `AddReadingSheet` ill-fitting (its value-card has one stepper, one chip, one unit). `AddBpSheet.tsx` is a new file in `vitals-trend/`. It reuses the existing `DualStepperControl` from `src/components/heartnote/log/DualStepperControl.tsx` (canonical compact dual-stepper register). The when-card (date + time inputs) is identical to `AddReadingSheet`'s — extract the when-card into a tiny `WhenCard.tsx` shared component so the two sheets don't drift. (Two callers — duplication would be OK, but the cohesion is genuine and the cost is one file.)

---

## Acceptance criteria

### Engineering — applies to all three pages

- [ ] Plan approved before any code is written (this doc + plan-review subagent).
- [ ] No new abstractions beyond: `src/lib/trends/window-math.ts`, `vitals-trend/DumbbellChart.tsx`, `vitals-trend/LollipopChart.tsx`, `vitals-trend/AddBpSheet.tsx`, `vitals-trend/WhenCard.tsx`, and the `rangeBars` prop addition to `TraceChart`. No "trend page framework," no "chart factory," no `VitalSpec` enum-machine.
- [ ] All clinical thresholds imported from `src/lib/clinical/thresholds.ts` (`HR_TIER_2_HIGH`, `SBP_TIER_2_LOW`, `HR_TIER_2_LOW`, `HR_TIER_2_VERY_HIGH`). No inline `100` / `90` / `120` anywhere.
- [ ] All reading ranges imported from `src/lib/clinical/reading-ranges.ts` (`READING_RANGE.resting_hr`, `READING_RANGE.systolic_bp`, `READING_RANGE.diastolic_bp`). No inline `[30, 450]` / `[60, 250]`.
- [ ] Pillows range constants come from a new export `READING_RANGE.pillow_count = [0, 20]` added to `reading-ranges.ts` (mirrors the FIELD_RANGE entry in `src/lib/voice-log/numeric-extractors.ts`). No inline `[0, 20]` in the trend page or its action.
- [ ] Diff scoped to: new files under `src/app/trends/{hr,bp,pillows}/`, new shared files under `src/components/heartnote/vitals-trend/`, new view files under `src/components/heartnote/{hr-trend,bp-trend,pillows-trend}/`, one new `src/lib/trends/window-math.ts`, the `WeightTrendView` + `Spo2TrendView` migrations to import from there, the `TraceChart` `rangeBars` extension, three new Playwright specs. **No edits to the alert engine. No new RPC.** One small migration for `pillow_count` validation in `daily_logs` only if the existing CHECK is missing (verify before adding — currently I read `pillow_count smallint` with no inline CHECK; if zod is the only floor/ceiling, leave as-is).
- [ ] Existing weight + spo2 pages continue to work after the window-math hoist. Their Playwright smoke specs still pass unchanged.

### Functional — happy path · Heart rate

- [ ] Navigating to `/trends/hr` while signed in renders: back chevron + "Resting heart rate" title; hero showing the latest reading as `76 bpm` (integer + unit); subhead showing the visible window's exact range; D/W/M/6M/Y selector defaulting to W (the mockup's default); chart with the 100 dashed coral line; stat trio Highest / Lowest / Today; "i" + "+" floating utility bar at the bottom.
- [ ] On W (default), the chart shows one vertical bar per day from the day's min to its max, plus a dot at the day's mean. The most recent day's bar is rendered in sage-deep; prior days in sage at 65% opacity (per mockup). The mean dot has a cream stroke to separate from the bar fill (Apple Health pattern).
- [ ] On D, the chart shows one dot per reading (no range bars, no line) — D is a single day; the range concept doesn't apply at sub-day granularity.
- [ ] On M / 6M / Y, the chart shows range bars (one per day for M, one per week-aggregate for 6M / Y) — same shape as W.
- [ ] Tapping "+" opens "Add resting heart rate" sheet. Stepper is integer-only, step 1, range from `READING_RANGE.resting_hr = [30, 450]`. Default value is the last reading (seed). No press-and-hold.
- [ ] Save commits the reading. Sheet closes. Chart, hero, and stats update on screen within one server round-trip.
- [ ] Saving a reading **strictly greater than** `HR_TIER_2_VERY_HIGH` (i.e., 121 or higher) with no other tier-2 symptom today fires `T2.11a`. Engine uses `freshestHr.value > HR_TIER_2_VERY_HIGH` (strict `>`, `evaluate.ts:494`); exactly 120 does NOT fire.
- [ ] Saving a reading 101–120 today AND there's a tier-2 symptom present (dyspnea, fatigue, chest_pain, etc.) fires `T2.11b`. Engine uses `> HR_TIER_2_HIGH` (strict `>`); exactly 100 does NOT fire.
- [ ] Saving a reading **strictly below** `HR_TIER_2_LOW` (i.e., 49 or lower) with a tier-2 symptom present fires `T2.11c`. Engine uses `< HR_TIER_2_LOW` (strict `<`, `evaluate.ts:508`); exactly 50 does NOT fire (paired edge case below).
- [ ] Saving exactly 50 bpm with a tier-2 symptom present does NOT fire `T2.11c` — engine's strict `<` boundary.
- [ ] Saving a reading 80 bpm with no symptoms: no alert fires; home screen stays calm.

### Functional — happy path · Blood pressure

- [ ] Navigating to `/trends/bp` renders: back chevron + "Blood pressure" title; hero showing the latest as `128 / 76 mmHg` (integer / integer); subhead with the window's range; D/W/M/6M/Y selector defaulting to M (the mockup's default); chart with the 90 dashed coral line (the `SBP_TIER_2_LOW` floor); stat trio Highest sys / Lowest sys / Readings; "i" + "+" floating bar.
- [ ] Chart shows one vertical "dumbbell" per reading: sage-deep dot at the sys value, sage-pale (sage-mist) dot at the dia value, thin sage stick connecting them. The most recent reading's dumbbell is full sage-deep + thicker stick (per mockup).
- [ ] Inline mini-legend at the top-left of the chart: a sage-deep dot labeled "sys" and a sage-pale dot labeled "dia" — matches the mockup's `dumbbellChart` legend.
- [ ] Tapping "+" opens "Add blood pressure" sheet. Value-card has **two** integer steppers: Sys (range `READING_RANGE.systolic_bp = [60, 250]`) and Dia (range `READING_RANGE.diastolic_bp = [30, 150]`). Each ±1 step. No press-and-hold. Sub-card has the canonical date + time inputs.
- [ ] Save commits **two** `daily_log_readings` rows — one `field='systolic_bp'`, one `field='diastolic_bp'` — both with the same `source_log_id` (the parent `daily_logs` row created in this action) and the same `recorded_at`.
- [ ] Both stat-trio cells "Highest sys / Lowest sys" render as `138 / 86` (sys / paired-dia of that reading) per the mockup. The Readings cell shows the total count of distinct readings (= count of `source_log_id` values, not row count which would double-count).
- [ ] Saving a sys ≤ 89 with a dizziness / confusion / cool-clammy symptom event today fires `T2.10`. Home screen turns orange.
- [ ] Saving a sys 130 with no symptoms: no alert; home screen calm.

### Functional — happy path · Pillows

- [ ] Navigating to `/trends/pillows` renders: back chevron + "Pillows tonight" title; hero showing the latest as `2 pillows now` (integer + unit text per mockup); subhead with the window's range; D/W/M/6M/Y selector defaulting to Y; chart with a faint **baseline line** at the patient's `normal_pillow_count` (or 1 if null); stat trio 12-mo avg / Months at 2+ / Nights logged; "i" + "+" floating bar.
- [ ] Chart shows one **lollipop** per night: thin stick from the bottom (y=0) up to the night's pillow_count, with a dot at the top of the stick. Sticks ABOVE the baseline render in warn-line (golden-amber) at 85% opacity; sticks AT-OR-BELOW render in sage at 55% opacity; the most-recent night is solid warn-ink (a darker amber) per mockup.
- [ ] Y-axis is **fixed** at `[0, 3]` (matches mockup) — no nice-step calculation. Ticks at `[0, 1, 2, 3]`. Patients who genuinely sleep on 4+ pillows render with a dot pinned at the top edge (an out-of-band signal worth its own follow-up if it actually happens; out of scope for this PR).
- [ ] Tapping "+" opens "Add pillows tonight" sheet. **Date-only** sheet (no time input — pillows is per-night). Stepper is integer-only, step 1, range `READING_RANGE.pillow_count = [0, 20]`. Default value is the last reading.
- [ ] Save inserts a new `daily_logs` row with `patient_id`, `log_date` (from the date input), `pillow_count` (from the stepper), `processing_status = 'complete'`. The action re-evaluates today's alert tier (a pillow count > patient's `normal_pillow_count` can fire `T2.4` orthopnea).
- [ ] Saving pillow_count = 3 when `normal_pillow_count = 1` fires `T2.4`. Home screen turns orange. Engine uses `dayLevel.pillow_count > reference` (strict `>`, `evaluate.ts:368`), where `reference = max(rolling-7-day max, baseline)`.
- [ ] Saving pillow_count = 2 when baseline = 1 and no prior-7-day max above 1 fires `T2.4` (the baseline+1 case is the most common real path).
- [ ] Saving pillow_count = 1 when `normal_pillow_count = 1` does not fire (`1 > 1` is false). Home screen stays calm.
- [ ] Mockup's stat trio computations:
  - **12-mo avg:** mean of `pillow_count` values across rows where `log_date >= today - 365`. Rounded to one decimal (`1.4` per mockup).
  - **Months at 2+:** count of distinct `YYYY-MM` strings in the last 12 months whose **monthly average pillow_count >= 2**. Render as `4/12` per mockup.
  - **Nights logged:** count of distinct `log_date` values in the last 12 months that have a non-null pillow_count (= "aggregated from 320 nights logged" per mockup).

### Edge cases — all three pages

- [ ] **Empty state — zero readings of this vital ever.** Hero shows `— bpm` / `— / — mmHg` / `— pillows now` in muted color. Chart frame renders with the relevant dashed alert line (HR: 100, BP: 90) on a bare scaffold. Pillows chart shows the baseline line at the patient's normal_pillow_count (or 1 if null). Stat trio is hidden. The "+" button works.
- [ ] **Single reading total.**
  - **HR:** chart shows one dot (no bar — a single reading has no range). Y-scale uses `yScaleFor` with floor=100, ceiling=110, halfRange=10. Result: `[60, 80, 100, 110]` or similar.
  - **BP:** chart shows one dumbbell. Y-scale floor=90, ceiling=150. The single reading's sys + dia both visible.
  - **Pillows:** chart shows one lollipop. Y is fixed `[0, 3]`. The baseline line is drawn even with one reading.
- [ ] **All readings identical (e.g., HR all at 76).** `yScaleFor`'s `lo === hi` branch centers around the value, then clamps. HR with floor=100 → ticks `[60, 80, 100, 110]` (centered around 76, then floor brings 100 in).
- [ ] **HR reading > 120 (the chart ceiling).** Saves successfully. The dot is clamped to the chart's top edge in render (it doesn't draw outside the y-range; the `yOf` clamps via the clipPath). Stat trio's Highest cell shows the literal value (`135 bpm`).
- [ ] **BP reading with sys ≥ 150 OR dia ≥ 150 (chart ceiling).** Saves; dot clamped at top edge; stat-trio shows literal values.
- [ ] **Pillows reading > 3 (chart ceiling).** Saves; dot clamped at top edge of the `[0, 3]` y range; stat-trio's hero shows the literal value (`5 pillows now`).
- [ ] **HR / BP backdated reading inside 7d.** Appears in W/M/6M/Y windows on next render. Today's tier re-evaluates: T2.10 (SBP) and T2.11 (HR) read the freshest value in the 24h freshness window, so older backdated readings don't override a fresher one.
- [ ] **Pillows backdated reading.** Appears in the chart, but **does NOT change any alert state**. Engine T2.4 reads only today's `dayLevel.pillow_count` (`evaluate.ts:665-669`); a backdated pillow save filed for a prior `log_date` is invisible to T2.4 for that historical day. The action still calls `evaluateAlertTier(supabase, patient.id, today)` for consistency, but if `log_date !== today` the re-eval is a no-op with respect to T2.4. Documented behavior.
- [ ] **Backdated reading older than 400 days** is rejected by the date input's `min` attribute AND by the action's runtime backdate check (`if (logDate < earliest) return { ok: false, error: '...' }`) — mirrors `addSpo2Reading`.
- [ ] **Future date / time** is rejected by the action: `if (Date.parse(recordedAt) > Date.now())` returns `{ ok: false, error: 'Reading time is in the future.' }`.
- [ ] **Out-of-range value (zod min/max).** Stepper ± buttons disable at min/max. Free-text type into the chip clamps `onBlur`.
- [ ] **HR-specific: zero readings on a given day in the W view.** That day's column renders empty (no bar, no dot). The mean trace line bridges the gap visually only if the chart mode connects across (W is dots-only for HR — no bridging across gaps, per spo2 + weight register).
- [ ] **BP-specific: only one of sys/dia present.** Cannot happen — the action inserts both atomically in a transaction-like try/catch, and the form requires both. Defensively: the trend page query joins sys + dia by `source_log_id`; rows without a partner (orphaned) are silently dropped from the chart.
- [ ] **Pillows-specific: caregiver enters `pillow_count = 0`.** Saves successfully. The lollipop is rendered as a stick of zero height (just a dot on the baseline line). Engine T2.4 fires only when `pillow_count > reference`, so 0 doesn't fire.
- [ ] **Pillows-specific: voice log row also has pillow_count, AND a manual entry for the same log_date exists.** Both rows render as separate VitalReadings at the same x-coordinate (they have different `id`s and `created_at`s). Chart shows two dots stacked. Stat trio "Nights logged" counts each as one night (distinct `log_date`s), so a doubled-up day counts once.
- [ ] **Sheet's date and time inputs always carry a value.** Defaults computed at sheet-open time (lazy `useState` initializer in mount-on-open child).
- [ ] **Voice log in `pending` or `analyzing` status for today** → save returns "Voice log still processing — try again in a moment." Copy is verbatim from `addSpo2Reading` to keep cross-vital wording uniform; mirrors the spo2 / weight gate.

### Error states — all three pages

- [ ] Not signed in → `/trends/{hr,bp,pillows}` redirects to `/login` (server-side, before any DB read).
- [ ] Onboarding not complete → redirect to `/onboarding`.
- [ ] No patient row → redirect to `/onboarding`.
- [ ] DB read failure on the trend series → page renders with hero empty-state and an empty chart frame (same shape as the empty state). Inherits the spo2/weight behavior; deferred follow-up if a user reports the two states look identical.
- [ ] Save server action returns `{ ok: false, error: "..." }` → red error text above the Save button. Sheet stays open with user's values intact.
- [ ] **BP-specific:** if the systolic insert succeeds but the diastolic insert fails (network race, RLS edge case), the action **rolls back the parent `daily_logs` row + the orphaned systolic_bp reading row** (explicit `DELETE` calls inside the catch block — we don't have transactional server actions on Supabase JS, so manual cleanup). Caregiver sees a red error and an unchanged trend page. **Ordering is mandatory** to keep this race-safe (no transaction wrapper):
  1. INSERT parent `daily_logs` row → `newLogId`.
  2. INSERT systolic reading with `source_log_id = newLogId`.
  3. INSERT diastolic reading with `source_log_id = newLogId`.
  4. **Only after BOTH reading inserts succeed**, run `evaluateAlertTier(...)` + upsert `daily_assessments` + insert `alerts` row.

  On step 3 failure: DELETE systolic reading by id; DELETE parent log by id. No `alerts` row exists yet (engine never ran). Engine re-eval is the LAST write in the success path — never interleaved with the dia insert. AC: code review verifies the action body is structured in this exact order; the engine re-eval call site sits after the dia INSERT's error check.
- [ ] **Pillows-specific:** if the daily_logs INSERT succeeds but the engine re-evaluation fails, the action returns the engine error AND keeps the inserted row (the pillow value is the safety-critical write; the alert re-eval is enrichment, mirrors the `addSpo2Reading` carve-out). The dashboard's next render picks up the pillow count even if the alert row isn't there yet.
- [ ] Network failure on save → caught and displayed as "Couldn't save — try again."
- [ ] Concurrent voice processing → see "voice log still processing" path above.

### Performance — all three pages

- [ ] First page load fetches ≤ 13 months of readings in one indexed query.
  - HR / BP: existing `daily_log_readings_patient_field_recent_idx` covers `(patient_id, field, recorded_at desc)`.
  - Pillows: existing `daily_logs_patient_date_idx` covers `(patient_id, log_date desc)`. The query adds `pillow_count IS NOT NULL` as a filter; not index-covering, but the row count is bounded by the date window (~365 max).
- [ ] Sheet opens within 100ms of "+" tap (local React state, no network).
- [ ] D/W/M/6M/Y switching and drag-to-scrub are local-only (no network round-trip). Same model as weight + spo2.
- [ ] Save shows "Saving…" within 16ms of tap; full round-trip completes in <500ms on a 50ms-RTT connection.

### Persistence — all three pages

- [ ] **HR / BP saves** create exactly one new `daily_logs` row (`processing_status='complete'`) for the chosen `log_date` AND one or two new `daily_log_readings` row(s). All survive refresh and appear on the trend page + `/log/[id]/edit`.
- [ ] **Pillows saves** create exactly one new `daily_logs` row with `pillow_count` set. The row appears on `/log/[id]/edit` as a pillow-only entry (other vitals null).
- [ ] No state leaks into `localStorage`. Chart filter state (D/W/M/6M/Y) and `endMs` are intentionally URL-less — refresh resets to the page's default period anchored at the latest reading.

### Permissions / RLS — all three pages

- [ ] `daily_log_readings` and `daily_logs` both have caregiver-ownership policies (verified by reading `supabase/migrations/20260428153829_initial_schema.sql` and `20260501041617_voice_log_multi_readings.sql`). New actions run under the user's session and are gated by `with check` clauses.
- [ ] Delete actions WHERE-clauses include both `patient_id` and the field name (HR/BP) or `pillow_count IS NOT NULL` (pillows), so a caregiver-ID mismatch on a row id still no-ops via RLS.
- [ ] **`clearPillowReadings` UPDATE payload is exactly `{ pillow_count: null }` — no other columns.** This guarantees voice-log data (transcribed_text, structured_observations, other vitals on the same `daily_logs` row) is never touched. AC verifiable by reading the action body; one-line UPDATE call. RLS verified by an integration test that the UPDATE returns 0 rows when the target `daily_logs` row belongs to a different caregiver (relies on the existing `caregiver crud own logs` policy from `20260428153829`).
- [ ] No service-role or admin client used in any new action.
- [ ] **Cache-Control: no-store — n/a.** `/trends/hr`, `/trends/bp`, `/trends/pillows` are authenticated but not on the auth-sensitive route list per `.claude/rules/auth-sessions.md`. No `no-store` header needed.

### Side effects — all three pages

- [ ] Every HR / BP / pillows save re-evaluates today's alert tier via `evaluateAlertTier(supabase, patient.id, today)` and upserts `daily_assessments`. Plain English: a heart rate above 100 with symptoms makes the home screen orange; a sys ≤ 89 with dizziness makes it orange; a pillow count above baseline makes it orange.
- [ ] When the resulting tier is non-`tier_4_log` AND triggers exist, an `alerts` row is inserted with `daily_log_id = newLog.id` so the dashboard's `daily_log_id ∈ todaysLogIds` query finds it.
- [ ] **AI reasoning paragraph populated.** `generateAlertReasoning` is invoked with the patient context (`firstName`, `dryWeightLb`, `normalPillowCount`, `nyhaClass`) and writes the result into `alerts.ai_reasoning`. **Reasoning generation is wrapped in its own try/catch INSIDE the parent try block** so a Claude API failure does not drop the safety-critical `alerts` row (the bug pattern from `learnings.md` 2026-05-10 "Audit reference implementations before inheriting" — verified by re-reading `src/app/trends/spo2/actions.ts` which has the carve-out at lines 178–192).
- [ ] `revalidatePath('/dashboard')`, `revalidatePath('/trends/{hr,bp,pillows}')`, and `revalidatePath('/trends')` after save.
- [ ] Deletes also re-evaluate today's tier — removing the freshest reading inside the 24h freshness window flips the home screen back to calm.

### Destructive-action copy — all three pages

- [ ] **Per-row delete** (HR / BP / pillows) confirmation echoes the row's date/time, mirroring spo2: `Delete the {noun} from {Mon D, h:mm A}?` for one row; `Delete N {plural noun} ({Mon D – Mon D})?` for multi-select. Pillows variant uses "Clear" verb: `Clear the pillow count from {Mon D}?` and `Clear N pillow counts ({Mon D – Mon D})?`.
- [ ] **Bulk delete-all** confirmation echoes the **patient first name + count** (class-B `confirm()` per `destructive-actions.md`):
  - HR: `Delete all N of {firstName}'s heart-rate readings? This cannot be undone.`
  - BP: `Delete all N of {firstName}'s blood pressure readings? This cannot be undone.` (counted as N paired readings, not 2N rows).
  - Pillows: `Clear N pillow counts from {firstName}'s logs?` — **no "cannot be undone" copy** because the rows still exist and pillow_count can be re-entered. The "Clear" verb signals this is reversible-with-effort, distinct from spo2/weight/HR/BP which permanently delete the row.
- [ ] Classification: all three are class-B (reversible-with-effort). HR/BP/spo2/weight rows can be re-entered manually; pillows is even easier to recover because the parent `daily_logs` row stays put. `window.confirm()` is acceptable per `destructive-actions.md`; no typed-confirmation required.

### Manual verification — all three pages

1. Sign in as the test caregiver. Navigate to `/trends/hr`. Confirm: title, hero, W default, chart with 100 dashed line and per-day bars + mean dots, stat trio Highest/Lowest/Today, floating "i" + "+".
2. Tap "+" → enter 76 → today, 9:00 AM → Save. Sheet closes; chart shows the new dot; hero updates to "76 bpm"; Today stat shows "76 bpm" at "9 AM".
3. Tap "+" → enter 125 → today, 10:00 AM → Save. Navigate to `/dashboard`. Confirm orange home screen and an alert naming the HR threshold breach.
4. Navigate to `/trends/bp`. Tap "+" → enter sys 130 / dia 80 → today, 10:30 AM → Save. Confirm chart shows the new dumbbell, hero updates to `130 / 80 mmHg`, stat-trio cells render `130 / 80`.
5. Navigate to `/trends/bp`. Tap "+" → enter sys 85 / dia 60 → today, 11:00 AM → Save. AND ensure there's a dizziness event logged for today (use the `/log` UI). Navigate to `/dashboard`. Confirm orange home screen and a `T2.10` alert.
6. Navigate to `/trends/pillows`. Tap "+" → enter 3 pillows → today → Save. Sheet closes (no time input — date only). Hero updates to `3 pillows now`; baseline line at 1 (default `normal_pillow_count`); chart shows a new tall lollipop in warn-line color (above baseline).
7. With the same patient having `normal_pillow_count = 1`, navigate to `/dashboard`. Confirm orange home screen and a `T2.4` orthopnea alert.
8. Navigate to `/trends/pillows`. Tap "i" → "View data" → confirm rows showing one entry per night. Tap Edit → tap one row → tap "Delete (1)". Confirm dialog reads: "Clear the pillow count from the log entry from {date}?" OK → row gone from the list, lollipop gone from the chart, daily_logs row still exists (verified by inspecting the row in Supabase Studio — `pillow_count = null` now, other columns unchanged).
9. Run the existing weight + spo2 Playwright specs (`tests/weight-trend.spec.ts`, `tests/spo2-trend.spec.ts`) — they must still pass after the window-math hoist.

---

## File structure

**New shared utilities:**
- `src/lib/trends/window-math.ts` — `defaultEndForPeriod`, `forwardBoundForPeriod`, `backwardBoundForPeriod`, `windowSpanMs`, `xLabelsFor`, `subheadFor`, `dayTimeLabel` (taking `today` as arg — fixes the timezone bug), plus the date helpers `isoDateOf`, `dowOfDay`, `endOfDayMs`, `endOfWeekMs`, `endOfMonthMs`, `anchorsAtWallClockHours`, `anchorsAtMidnights`, `anchorsOnDayOfWeek`, `anchorsAtMonthStarts`, `hourLabel`, `weekdayLabel`, `shortDateLabel`, `monthLabel`. No React imports — pure module, safe in client + server bundles.

**New shared components under `src/components/heartnote/vitals-trend/`:**
- `DumbbellChart.tsx` — BP-only. Takes paired sys + dia data with timestamps, renders two dots + connecting stick per reading. Same axis-frame + clipPath approach as `TraceChart`. Includes inline legend ("sys" / "dia") per mockup.
- `LollipopChart.tsx` — Pillows-only. Takes single-value data + an optional `baseline` value. Renders a faint dashed baseline line + one stick-and-dot per reading, color-coded by above-vs-at-or-below baseline.
- `AddBpSheet.tsx` — Two-stepper add sheet wrapping the existing `DualStepperControl`. Uses the shared `WhenCard`. Server-action prop signature: `onSave({ systolic, diastolic, recordedAtIsoLocal }) => Promise<{ ok: true } | { ok: false; error: string }>`.
- `WhenCard.tsx` — small extracted helper component for the date + time inputs (shared by `AddReadingSheet` and `AddBpSheet`). Single prop API: `{ date, time, onDateChange, onTimeChange, timezone, minBackdateDays, dateOnly?: boolean }`. When `dateOnly`, only the date input is rendered.
- Extend `vital-reading-config.ts` with one new optional flag: `dateOnly?: boolean` (used by Pillows config).
- Extend `TraceChart.tsx` with one new optional prop: `rangeBars?: { dayKey: string; min: number; mean: number; max: number; recordedAtMs: number }[]`. When provided, the chart renders one vertical sage bar per day at `xOf(recordedAtMs)`, from `yOf(max)` down to `yOf(min)`, plus a cream-stroked dot at `yOf(mean)`. The trace line is suppressed when `rangeBars` is provided (use `showLine={false}` or implicit when range bars are present).

**New Heart Rate files:**
- `src/app/trends/hr/page.tsx` — server component; auth + patient lookup; fetch up to 13 months of `field='resting_hr'` rows.
- `src/app/trends/hr/actions.ts` — server actions `addHrReading`, `deleteHrReadings`, `deleteAllHrReadings`. Mirror `addSpo2Reading` patterns.
- `src/components/heartnote/hr-trend/HrTrendView.tsx` — client view.
- `tests/hr-trend.spec.ts` — Playwright UI smoke.

**New Blood Pressure files:**
- `src/app/trends/bp/page.tsx` — server component; fetch sys + dia rows; join into "paired readings" by `source_log_id`.
- `src/app/trends/bp/actions.ts` — server actions `addBpReading`, `deleteBpReadings` (by paired source_log_id), `deleteAllBpReadings`.
- `src/components/heartnote/bp-trend/BpTrendView.tsx` — client view.
- `src/components/heartnote/bp-trend/ViewBpDataSheet.tsx` — BP-specific read+delete sheet. Duplicate of the shared `ViewDataSheet`'s read-mode list rendering (~80 lines) because BP iterates paired `BpPair[]` rows, not flat `VitalReading[]`. **Engineering AC cap:** if the duplicate exceeds 100 lines, switch to a generic-param `<TRow>` on the shared `ViewDataSheet` instead. Documented engineering choice (not silent scope creep).
- `tests/bp-trend.spec.ts` — Playwright UI smoke.

**New Pillows files:**
- `src/app/trends/pillows/page.tsx` — server component; fetch up to 13 months of `daily_logs WHERE pillow_count IS NOT NULL`.
- `src/app/trends/pillows/actions.ts` — server actions `addPillowReading`, `clearPillowReadings`, `clearAllPillowReadings`. (Named `clear*` not `delete*` because the underlying mutation is an UPDATE setting `pillow_count = NULL`, not a row DELETE.)
- `src/components/heartnote/pillows-trend/PillowsTrendView.tsx` — client view.
- `tests/pillows-trend.spec.ts` — Playwright UI smoke.

**Refactor of existing files:**
- `src/components/heartnote/weight-trend/WeightTrendView.tsx` — replace inline window-math + date helpers with imports from `src/lib/trends/window-math.ts`. ~200 lines removed.
- `src/components/heartnote/spo2-trend/Spo2TrendView.tsx` — same.
- `src/lib/clinical/reading-ranges.ts` — add `pillow_count: [0, 20]` to `READING_RANGE` and `'pillow_count'` to the `ReadingField` union (this union also gates `VitalReadingConfig.field`; pillows page config will use this).
- `src/components/heartnote/vitals-trend/vital-reading-config.ts` — add optional `dateOnly?: boolean`.
- `src/components/heartnote/vitals-trend/AddReadingSheet.tsx` — when `config.dateOnly`, omit the time input. Hardcode `time = '12:00'` for the save payload.
- `src/components/heartnote/vitals-trend/TraceChart.tsx` — add the `rangeBars` prop + render branch.

**Files that need NO changes:**
- `src/lib/alerts/evaluate.ts` (T2.4, T2.10, T2.11 already wired).
- `src/lib/clinical/thresholds.ts` (HR / SBP / pillow constants already there).
- `daily_log_readings` schema (HR / BP fields already in the enum).
- `daily_logs.pillow_count` column (already exists).
- Voice log RPC (writes pillow_count to `daily_logs.pillow_count` — unchanged path).

---

## Tasks

> Execute in order. Each task names verifiable success criteria.

### Task 1 — Hoist window-math + migrate weight + spo2

**Goal.** Extract the duplicated window-math + date helpers from `WeightTrendView` and `Spo2TrendView` into one shared module. Fix the `dayTimeLabel` timezone bug in flight.

**Files:**
- Create: `src/lib/trends/window-math.ts`.
- Edit: `src/components/heartnote/weight-trend/WeightTrendView.tsx`.
- Edit: `src/components/heartnote/spo2-trend/Spo2TrendView.tsx`.

**Steps:**

- [ ] **Step 1.1 — Create `window-math.ts`.** Move the following from `Spo2TrendView.tsx` (which has the most recent copy) into the new module: `windowSpanMs`, `endOfDayMs`, `endOfWeekMs`, `endOfMonthMs`, `isoDateOf`, `dowOfDay`, `defaultEndForPeriod`, `backwardBoundForPeriod`, `forwardBoundForPeriod`, `xLabelsFor`, `anchorsAtWallClockHours`, `anchorsAtMidnights`, `anchorsOnDayOfWeek`, `anchorsAtMonthStarts`, `hourLabel`, `weekdayLabel`, `shortDateLabel`, `monthLabel`, `subheadFor`, `dayTimeLabel`. All are pure functions with no React or component imports.
- [ ] **Step 1.2 — Fix `dayTimeLabel`.** Change signature from `dayTimeLabel(ms: number, tz: string)` to `dayTimeLabel(ms: number, tz: string, today: string)`. Inside, replace the `new Date()` and `new Date(Date.now() - DAY_MS)` comparisons with `today` (the patient-tz YYYY-MM-DD that the caller passes) and `isoOffset(today, -1)`. This kills the "Today" / "Yesterday" mismatch when caregiver tz ≠ patient tz. Update `subheadFor` to take `today` and pass through.
- [ ] **Step 1.3 — Update `Spo2TrendView.tsx`.** Replace the inline copies with imports from `src/lib/trends/window-math.ts`. The `subhead` useMemo now passes `today` to `subheadFor`. ~150 lines deleted.
- [ ] **Step 1.4 — Update `WeightTrendView.tsx`.** Same imports; pass `today` to `subheadFor`. ~150 lines deleted.
- [ ] **Step 1.5 — Run `npm run lint && npm run build`.** Clean. Verify both `/trends/weight` and `/trends/spo2` render unchanged.
- [ ] **Step 1.6 — Run existing Playwright specs.** `tests/weight-trend.spec.ts` and `tests/spo2-trend.spec.ts` must still pass.

**Success criteria:**
- New file `src/lib/trends/window-math.ts` exists with ~250 lines of pure helpers.
- `WeightTrendView.tsx` and `Spo2TrendView.tsx` each lose ~150 lines of duplicated helpers.
- `dayTimeLabel` no longer references `Date.now()`.
- Both existing trend pages render identically; both Playwright specs still pass.

### Task 2 — Heart-rate trend page

**Goal.** Build `/trends/hr` mirroring `/trends/spo2`'s server-component + actions + client-view structure, with the range-bar chart shape per mockup.

**Files:**
- Create: `src/app/trends/hr/page.tsx`.
- Create: `src/app/trends/hr/actions.ts`.
- Create: `src/components/heartnote/hr-trend/HrTrendView.tsx`.
- Edit: `src/components/heartnote/vitals-trend/TraceChart.tsx` (add `rangeBars` prop).

**Steps:**

- [ ] **Step 2.1 — `addHrReading`, `deleteHrReadings`, `deleteAllHrReadings`.** Copy `addSpo2Reading` verbatim from `src/app/trends/spo2/actions.ts`. Change:
  - Zod schema: `value: z.number().int().min(READING_RANGE.resting_hr[0]).max(READING_RANGE.resting_hr[1])` — integer only.
  - Field name: `'resting_hr'`.
  - `revalidatePath('/trends/hr')`.
  - Preserve the reasoning try/catch pattern: reasoning is in its own try/catch inside the engine try block so a Claude API failure does NOT drop the alerts row (per `learnings.md` 2026-05-10 rule).
- [ ] **Step 2.2 — `/trends/hr/page.tsx`.** Copy `src/app/trends/spo2/page.tsx`. Change `field='spo2'` to `field='resting_hr'`. Render `<HrTrendView />`.
- [ ] **Step 2.3 — Extend `TraceChart`.** Add the `rangeBars?` prop per File Structure. Render branch:
  ```tsx
  rangeBars?.map((r) => {
    const x = xOf(r.recordedAtMs);
    const yMax = yOf(r.max);
    const yMin = yOf(r.min);
    const yMean = yOf(r.mean);
    return (
      <g key={r.dayKey}>
        <rect x={x - 1.6} y={yMax} width={3.2} height={Math.max(yMin - yMax, 1)}
              rx={1.6} fill={isLast ? 'var(--sage-deep)' : '#7E9080'}
              opacity={isLast ? 1 : 0.65} />
        <circle cx={x} cy={yMean} r={isLast ? 3.4 : 2.2}
                fill="var(--cream-card)"
                stroke={isLast ? 'var(--sage-deep)' : '#7E9080'} strokeWidth={1.5} />
      </g>
    );
  });
  ```
  When `rangeBars` is provided, suppress the line + dots branch entirely (the bars + mean dots are the only data marks). `alertFloor` still renders.
- [ ] **Step 2.4 — `HrTrendView.tsx`.** Copy `Spo2TrendView.tsx` as the starting point. Diffs:
  - Default `period = 'W'` (per mockup).
  - `HR_CONFIG`: `field: 'resting_hr'`, `fieldLabel: 'Resting heart rate'`, `unit: 'bpm'`, `range: READING_RANGE.resting_hr`, `step: 1`, `integer: true`, `splitDecimal: false`, `pressAndHold: false`, `formatValue: (v) => String(Math.round(v))`, `sheetTitle: 'Add resting heart rate'`, `listTitle: 'All heart-rate readings'`, `eyebrowLine: (_, seed) => seed !== null ? \`last ${Math.round(seed)} bpm\` : null`, `deleteNoun: { singular: 'heart-rate reading', plural: 'heart-rate readings' }`.
  - Hero renders `{Math.round(value)} bpm` (no decimal split).
  - Y-scale: `yScaleFor(allReadings, { floor: HR_TIER_2_HIGH, ceiling: HR_CHART_CEILING_BPM, singleValueHalfRange: 10 })` — the mockup ceiling is 110, not 120. Per Decision #1 ("mockup wins"), we use 110 not `HR_TIER_2_VERY_HIGH`. The 110 ceiling is a **visual choice**, not a clinical threshold, so it does NOT belong in `src/lib/clinical/thresholds.ts` (per `code-quality.md` rule #1, thresholds.ts is for clinical numbers with research-file citations — 110 has no clinical citation, only a mockup citation). Instead, declare `const HR_CHART_CEILING_BPM = 110;` at the top of `HrTrendView.tsx` with a `// per docs/design/heartnote-vitals-trends-mockup.html` comment.
  - **Build `rangeBars` from the data slice.** For W/M view, group `slice` by `log_date` (or by week for 6M/Y) and compute `{min, mean, max, recordedAtMs}` per group. `recordedAtMs` is the noon of the day (or week-anchor for 6M/Y).
  - For D view, fall back to the line-and-dots chart (`showLine={false}` for D since intra-day resting-HR readings aren't a continuous trend) — same logic as spo2's W-is-dots-only.
  - Stat trio: **Highest / Lowest / Today** (mockup labels). "Today" = the latest reading on `today` (patient tz). If no reading today, the cell shows `— bpm` and sub-text "no reading today."
  - alertFloor: `{ y: HR_TIER_2_HIGH, color: 'var(--destructive)' }` (the 100 dashed line per mockup).
- [ ] **Step 2.5 — Daily-aggregation derivation.** Build a small helper inside `HrTrendView.tsx` (NOT shared yet; rule of three says wait):
  ```ts
  function dailyRanges(slice: VitalReading[], tz: string): { dayKey: string; min: number; mean: number; max: number; recordedAtMs: number }[]
  ```
  Group by `log_date` (already on each reading). For each day, compute min/mean/max from `value` and `recordedAtMs = endOfDayMs(dayKey, tz) - DAY_MS/2` (noon of the day).
- [ ] **Step 2.6 — Run lint + build.**

**Success criteria:**
- `/trends/hr` renders the mockup's shape: W default, range bars per day, mean dots cream-stroked, 100 dashed line.
- Saving a 76 bpm reading does NOT fire an alert.
- Saving a 125 bpm reading fires `T2.11a` (engine reads from `daily_log_readings` directly).
- Existing `/trends/weight` and `/trends/spo2` still render correctly.

### Task 3 — Blood-pressure trend page

**Goal.** Build `/trends/bp` with the dumbbell chart and dual-value sheet per mockup.

**Files:**
- Create: `src/app/trends/bp/page.tsx`.
- Create: `src/app/trends/bp/actions.ts`.
- Create: `src/components/heartnote/bp-trend/BpTrendView.tsx`.
- Create: `src/components/heartnote/vitals-trend/DumbbellChart.tsx`.
- Create: `src/components/heartnote/vitals-trend/AddBpSheet.tsx`.
- Create: `src/components/heartnote/vitals-trend/WhenCard.tsx`.
- Edit: `src/components/heartnote/vitals-trend/AddReadingSheet.tsx` (extract the when-card → import from `WhenCard.tsx`).

**Steps:**

- [ ] **Step 3.1 — `WhenCard.tsx`.** Extract the existing when-card (date + time inputs + section header) from `AddReadingSheet.tsx`. Props: `{ date, time, onDateChange, onTimeChange, timezone, minBackdateDays, dateOnly?: boolean }`. When `dateOnly`, render only the date input. Update `AddReadingSheet.tsx` to import + render `WhenCard`.
- [ ] **Step 3.2 — `DumbbellChart.tsx`.** Build from scratch (axis frame + clipPath copied from `TraceChart` — accept this minor duplication; rule of three says wait for a third chart of this shape). Props: `{ pairs: { sourceLogId: string; sys: number; dia: number; recordedAt: string }[]; startMs; endMs; xAxisLabels; yMin; yMax; yTicks; height?; alertFloor?: { y: number; color: string }; ariaLabel? }`. Render: axis frame, alertFloor line, one `<line>` (stick) + two `<circle>` (sys, dia) per pair. Inline legend at top-left ("sys" / "dia" with their dot colors). Last-point halo on the most recent pair (cream halo behind both dots).
- [ ] **Step 3.3 — `AddBpSheet.tsx`.** New file. Two-stepper sheet wrapping `DualStepperControl` from `src/components/heartnote/log/DualStepperControl.tsx`. Sheet structure mirrors `AddReadingSheet`'s outer chrome (slide-up, drag handle, header with Cancel, sage-deep Save button). Value card shows the two steppers + a sys/dia eyebrow. **Eyebrow contract:** hardcoded inside `AddBpSheet.tsx` (the BP add sheet does NOT use `VitalReadingConfig.eyebrowLine` because it has two seed values, not one). Eyebrow logic: when both `seedSys !== null` and `seedDia !== null`, render `last ${seedSys}/${seedDia} mmHg`; otherwise render nothing (no eyebrow). Below the value card: `<WhenCard>`. Props:
  ```ts
  interface Props {
    onClose: () => void;
    seedSys: number | null;
    seedDia: number | null;
    timezone: string;
    onSave: (input: {
      systolic: number;
      diastolic: number;
      recordedAtIsoLocal: string;
    }) => Promise<{ ok: true } | { ok: false; error: string }>;
  }
  ```
  Save disabled until both sys + dia have values. Idempotency: same `submittingRef` pattern as `AddReadingSheet`.
- [ ] **Step 3.4 — `addBpReading` action.** Inserts the parent `daily_logs` row, then inserts BOTH `daily_log_readings` rows (sys + dia) sharing `source_log_id`, then re-evaluates today's alert tier. Rollback path: if the second insert fails, DELETE the orphaned first reading AND the parent log. Zod schema:
  ```ts
  const InputSchema = z.object({
    systolic: z.number().int()
      .min(READING_RANGE.systolic_bp[0]).max(READING_RANGE.systolic_bp[1]),
    diastolic: z.number().int()
      .min(READING_RANGE.diastolic_bp[0]).max(READING_RANGE.diastolic_bp[1]),
    recordedAtIsoLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  });
  ```
  Engine reasoning try/catch carved out same as spo2.
- [ ] **Step 3.5 — `deleteBpReadings` action.** Input: `ids: string[]` where each id is a `source_log_id` of a paired reading. Deletes BOTH the sys and dia readings sharing that source_log_id. Re-eval today's tier.
- [ ] **Step 3.6 — `deleteAllBpReadings` action.** Deletes all readings where `patient_id = $1 AND field IN ('systolic_bp', 'diastolic_bp')`. Re-eval today's tier.
- [ ] **Step 3.7 — `/trends/bp/page.tsx`.** Fetch sys + dia rows in one query (`field IN ('systolic_bp', 'diastolic_bp')`), then group on the server by `source_log_id` into `BpPair[]`. Pairs without both sys + dia are silently dropped (defensive — the action's rollback should prevent this state). Render `<BpTrendView />` with the pairs and patient first name.
- [ ] **Step 3.8 — `BpTrendView.tsx`.** Copy `WeightTrendView`/`Spo2TrendView` structure. Diffs:
  - Default period `'M'` (per mockup).
  - `BP_CONFIG` reused only for `ViewDataSheet` (where it formats each row as `sys / dia`); the AddBpSheet has its own props (not driven by VitalReadingConfig). Implementing: pass a custom `formatValue` to ViewDataSheet that takes the row's `sys` + `dia` and renders `"128 / 76"`. **Catch:** ViewDataSheet currently iterates a flat `readings: VitalReading[]` array — for BP we need it to iterate `BpPair[]` (sys + dia). The cleanest option: thread a generic type through ViewDataSheet (`<TRow>` with `formatValue(row: TRow): string`); the cost is one more generic parameter, no structural change. Lift only if needed; if too invasive, build a BP-specific `ViewBpDataSheet.tsx` (preferable per Karpathy #2 "simplicity first" — duplicate-then-extract). **Going with: a BP-specific view sheet (`ViewBpDataSheet.tsx`) co-located in `bp-trend/`.** Duplicate ~80 lines of read-mode list rendering; smaller diff than generic-izing the shared component for one extra caller.
  - Hero renders `{sys} / {dia} mmHg` (smaller font than spo2 — 30px serif per mockup; `bp` class in mockup CSS).
  - Y-scale: `yScaleFor` ignored for BP — we use a fixed `{ min: 60, max: 150, ticks: [60, 90, 120, 150] }` from the mockup. Reason: BP charts read better with a fixed clinical-context Y; nice-step would zoom in on a tight cluster of normal readings and hide the 90 alert line if all readings are 130+.
  - alertFloor: `{ y: SBP_TIER_2_LOW, color: 'var(--destructive)' }` (90 dashed line).
  - DumbbellChart with the pairs.
  - Stat trio: **Highest sys / Lowest sys / Readings.** Highest-sys cell value = `${pair.sys} / ${pair.dia}` (the paired dia of the highest sys reading), sub-text = "May 4 morning" (date + AM/PM). Lowest-sys symmetric. Readings cell = `${pairs.length}` count, sub-text = "cuff, all manual."
- [ ] **Step 3.9 — Run lint + build.**

**Success criteria:**
- `/trends/bp` renders the mockup's dumbbell shape with 90 dashed line and M default.
- Saving sys 130 / dia 80 produces TWO `daily_log_readings` rows sharing one `source_log_id`.
- Saving sys 85 / dia 60 with a logged dizziness event today fires `T2.10`.
- Other trend pages still work.

### Task 4 — Pillows trend page

**Goal.** Build `/trends/pillows` reading from `daily_logs` directly. Lollipop chart with baseline.

**Files:**
- Create: `src/app/trends/pillows/page.tsx`.
- Create: `src/app/trends/pillows/actions.ts`.
- Create: `src/components/heartnote/pillows-trend/PillowsTrendView.tsx`.
- Create: `src/components/heartnote/vitals-trend/LollipopChart.tsx`.
- Edit: `src/lib/clinical/reading-ranges.ts` (add `pillow_count` entry + extend `ReadingField` union).
- Edit: `src/components/heartnote/vitals-trend/AddReadingSheet.tsx` (respect `dateOnly` flag — see Task 3 step 3.1).

**Steps:**

- [ ] **Step 4.1 — Extend `reading-ranges.ts`.** Add `pillow_count: [0, 20]` to `READING_RANGE`. Add `'pillow_count'` to the `ReadingField` union. This makes `VitalReadingConfig.field` accept it.
- [ ] **Step 4.2 — `LollipopChart.tsx`.** New file (axis frame + clipPath copied from TraceChart). Props: `{ data: VitalReading[]; baseline: number | null; startMs; endMs; xAxisLabels; yMin; yMax; yTicks; height?; ariaLabel? }`. Render: axis frame, faint dashed baseline line at `yOf(baseline ?? 1)` in sage color (NOT coral — pillows has no alert floor; the baseline is a "her normal" reference, not a threshold), one stick + dot per reading. Stick + dot color logic per mockup:
  ```ts
  const above = r.value > (baseline ?? 0);
  const color = isLast ? 'var(--warn-ink, #8A6A35)'
              : above   ? 'var(--warn-line, #C49C5A)'
                        : 'var(--sage, #7E9080)';
  ```
  Stick opacity: last 1.0, above 0.85, at/below 0.55. Dot has a cream stroke + the same color fill. Last reading has a warn-amber halo.
- [ ] **Step 4.3 — `addPillowReading` action.** Different shape from the other vitals — inserts into `daily_logs`, NOT `daily_log_readings`. Zod input:
  ```ts
  const InputSchema = z.object({
    pillowCount: z.number().int().min(READING_RANGE.pillow_count[0]).max(READING_RANGE.pillow_count[1]),
    logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  });
  ```
  Body:
  1. Auth + patient lookup (same as spo2).
  2. Future-date check against today in patient tz.
  3. Backdate check against `MIN_BACKDATE_DAYS = 400`.
  4. In-flight voice processing gate (same shape as spo2 — bypass for non-today logDate).
  5. INSERT a new `daily_logs` row with `patient_id`, `log_date`, `pillow_count`, `processing_status: 'complete'`. Get back `newLogId`.
  6. Re-evaluate today's tier — same pattern as spo2, with the reasoning try/catch carve-out inside the engine try block.
  7. `revalidatePath('/trends/pillows')`, `/trends`, `/dashboard`.
- [ ] **Step 4.4 — `clearPillowReadings` action.** UPDATE `daily_logs SET pillow_count = NULL WHERE patient_id = $1 AND id IN ($ids)`. Re-eval today's tier (clearing today's pillow could change T2.4).
- [ ] **Step 4.5 — `clearAllPillowReadings` action.** UPDATE `daily_logs SET pillow_count = NULL WHERE patient_id = $1 AND pillow_count IS NOT NULL`. Re-eval today's tier.
- [ ] **Step 4.6 — `/trends/pillows/page.tsx`.** Server component. Auth + patient lookup. Patient SELECT includes `display_name, normal_pillow_count`. Fetch:
  ```ts
  supabase.from('daily_logs')
    .select('id, log_date, pillow_count, created_at')
    .eq('patient_id', patient.id)
    .gte('log_date', isoOffset(today, -FETCH_DAYS))
    .lte('log_date', today)
    .not('pillow_count', 'is', null)
    .order('created_at', { ascending: true });
  ```
  Map each row to a `VitalReading`: `{ id, value: pillow_count, log_date, recorded_at: log_date+'T12:00:00' in patient tz }`. Pass `baselinePillowCount: number | null` to the view.
- [ ] **Step 4.7 — `PillowsTrendView.tsx`.** Copy `Spo2TrendView` structure. Diffs:
  - Default period `'Y'` (per mockup).
  - `PILLOWS_CONFIG`: `field: 'pillow_count'`, `fieldLabel: 'Pillows'`, `unit: 'pillows'`, `range: READING_RANGE.pillow_count`, `step: 1`, `integer: true`, `splitDecimal: false`, `pressAndHold: false`, `formatValue: (v) => String(Math.round(v))`, `sheetTitle: 'Add pillows tonight'`, `listTitle: 'All pillow counts'`, `dateOnly: true`, `eyebrowLine: (baseline, seed) => baseline !== null ? \`baseline ${baseline} pillows\` : seed !== null ? \`last ${seed}\` : null`, `deleteNoun: { singular: 'pillow count from log', plural: 'pillow counts' }`.
  - Hero renders `{Math.round(value)} pillows now` (the "now" suffix per mockup — encoded in the unit slot or as a separate small text).
  - Y-scale: **fixed** `{ min: 0, max: 3, ticks: [0, 1, 2, 3] }`. No `yScaleFor` call. Reason: the mockup uses a hardcoded `[0, 3]` so the baseline at 1 and the trend up to 2 are visually meaningful; nice-step would over-zoom on a single-pillow patient.
  - LollipopChart, not TraceChart. Baseline = `baselinePillowCount`.
  - Stat trio per mockup: 12-mo avg / Months at 2+ / Nights logged. **Decision: compute these stats on the trailing-12-months data, regardless of chart period.** The mockup labels are absolute ("12-mo avg", "Months at 2+", "Nights logged" with sub-text "320 nights logged"); making the math period-aware would make a "12-mo avg" cell show a 1-week mean on D-view — the label would lie. This is a deliberate divergence from spo2/weight (whose Latest/Highest/Range trio matches the visible window). The reason: spo2/weight trio labels describe the current snapshot ("Highest"); pillows trio labels describe a fixed-horizon trend.
    - **12-mo avg:** `mean(allReadings.filter(within last 365 days).value)`, formatted to one decimal.
    - **Months at 2+:** count of distinct `YYYY-MM` strings in the last 12 months whose **monthly average pillow_count >= 2**. Render `${n}/12`.
    - **Nights logged:** count of distinct `log_date` values in the last 12 months that have a non-null pillow_count.
- [ ] **Step 4.8 — `clearPillowReadings` integration with `ViewDataSheet`.** The shared sheet's confirm copy says "Delete N pillow readings (May 4 – May 10)?" — for pillows, override the noun: "Clear N pillow counts (May 4 – May 10)?" The `deleteNoun: { singular: 'pillow count from log', plural: 'pillow counts' }` already shapes this. The "Delete all" copy uses `Trash2` icon + "Delete all pillows data" — for pillows, override the trigger text to "Clear all pillow data." The shared `ViewDataSheet` currently hardcodes "Delete all {fieldLabel.toLowerCase()} data"; add an optional `actionVerb?: 'Delete' | 'Clear'` to `VitalReadingConfig` (default "Delete"). Pillows config sets `actionVerb: 'Clear'`. The trigger label becomes `${actionVerb} all ${fieldLabel.toLowerCase()} data`.
- [ ] **Step 4.9 — Run lint + build.**

**Success criteria:**
- `/trends/pillows` renders the mockup's lollipop shape, Y default, baseline at the patient's `normal_pillow_count`.
- Saving 3 pillows when baseline is 1 inserts ONE `daily_logs` row with `pillow_count = 3`, and fires `T2.4` on re-eval.
- Clearing a pillow reading UPDATEs the daily_logs row to set `pillow_count = NULL`, leaving other columns untouched (verified by reading the row in Studio).
- Other trend pages still work.

### Task 5 — Lint + build

- [ ] `npm run lint` clean.
- [ ] `npm run build` clean (timeout 300000, never background per CLAUDE.md).
- [ ] No TS errors, no ESLint warnings.

### Task 6 — Playwright specs

**Goal.** UI smoke for each new trend page. Mirror `tests/spo2-trend.spec.ts`.

**Files:**
- Create: `tests/hr-trend.spec.ts`.
- Create: `tests/bp-trend.spec.ts`.
- Create: `tests/pillows-trend.spec.ts`.

**Steps:**

For each page, the spec covers:
- [ ] **Renders.** Empty state: hero shows empty token, chart frame + alert line (HR/BP only) visible, "+" button visible.
- [ ] **Add reading happy path.** Tap "+" → enter values → today → Save. Sheet closes. Hero updates. New reading visible.
- [ ] **Tier alert fires.** HR 125 → `T2.11a`; BP 85/60 with dizziness event → `T2.10`; Pillows 3 with baseline 1 → `T2.4`. Assert one new alerts row at the right tier.
- [ ] **View data + delete.** Open "i" menu → "View data" → list shows readings → Edit → Select one → "Delete (1)". Confirm dialog text echoes the row identity. OK → row gone.
- [ ] **Stepper at min/max.** ± button disables at floor / ceiling (HR: 30 / 450; BP: sys 60 / 250 + dia 30 / 150; Pillows: 0 / 20).
- [ ] **Backdated reading.** Save a 14-day-old reading → appears in W view, not D view.

**Success criteria:**
- All three new specs pass locally.
- Existing weight + spo2 specs still pass.

### Task 7 — Code review subagent

- [ ] Dispatch a fresh-context code-review subagent (per `.claude/rules/feature-workflow.md` step 6). Pass: the diff (`git diff main...HEAD`), this plan, the relevant rule files (`code-quality.md`, `canonical-controls.md`, `destructive-actions.md`, `plain-english-explanations.md`, `auth-sessions.md`). Prompt it to:
  - Verify each AC.
  - Audit per `learnings.md` 2026-05-10 #2: did the new actions inherit any latent bug from spo2 (e.g., reasoning try/catch wrapping the alerts row)?
  - Apply the vital-precision checklist from `learnings.md` 2026-05-10 #3 to each new vital: DB CHECK, Zod schemas, voice extractors, stepper props, formatters all agree on integer vs decimal precision.
  - Surface any inline magic clinical numbers, any duplicated business logic that should have been hoisted, any state stored in component state that should be derived from the DB.

### Task 8 — Push + PR (do NOT merge)

- [ ] `git push -u origin hr-bp-pillows-trends`.
- [ ] `gh pr create --title "feat(trends): heart rate + blood pressure + pillows trend pages"` with a PR body covering: plain-English summary, the decisions captured (HR Y-axis = mockup, pillows storage = `daily_logs`), the shared-module hoist + bug fix, and a per-page test plan checklist.
- [ ] `gh pr checks --watch` until CI passes.
- [ ] **Stop.** Per user direction in this session: leave the PR open for the user to review.

---

## Summary

Three vital trend pages — HR, BP, pillows — built on top of the existing shared primitives, plus three small new ones (`DumbbellChart`, `LollipopChart`, `AddBpSheet`). The third invocation of the windowing logic hoists `window-math.ts` and fixes the `dayTimeLabel` timezone bug. HR follows the spo2 pattern almost verbatim, with a `rangeBars` extension to `TraceChart` for the per-day min/mean/max bars. BP introduces a new chart shape and a paired-value sheet. Pillows reads from `daily_logs` (not `daily_log_readings`) because that's where pillow_count canonically lives — the alert engine and voice log pipeline don't need to change.

## Test plan

- [ ] All Edge Cases AC visuals verified (empty / single / many readings) for each page.
- [ ] Saving threshold-crossing values flips the home screen (HR 125, BP 85/60+dizziness, pillows 3+normal_pillow_count=1).
- [ ] Weight + spo2 Playwright specs still pass after the window-math hoist.
- [ ] `dayTimeLabel` returns "Today" / "Yesterday" against the patient timezone, not the caregiver's browser tz. Verifiable by setting the caregiver's profile timezone to a different one than the patient logs were recorded in (manual test).
- [ ] BP rollback path: simulate a failed second insert (manually edit the action to throw); verify the parent log + the systolic-only reading are both rolled back.
- [ ] Pillows "clear" path: verify `daily_logs` row remains after clear, only `pillow_count` becomes NULL.

## Future work (out of scope for this plan)

- `/trends` index page with link cards into each per-vital page. Deferred to a separate PR.
- Pattern-note paragraph + source-attribution footer (deferred from spo2 + weight; still deferred).
- Compound-vital correlation views (weight × pillows × HR over time).
- HealthKit ingestion (paid Apple Developer required).
- Migrating `daily_logs.pillow_count` to `daily_log_readings.pillow_count` for unified storage. Would require coordinated changes to the voice log RPC + alert engine + this trend page. Not justified by a current product need.
- Per-bedtime hour for pillow entries (currently date-only). Add only if a caregiver reports needing it.
