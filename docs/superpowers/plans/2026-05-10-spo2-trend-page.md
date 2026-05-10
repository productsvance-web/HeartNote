# SpO₂ Trend Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Plain-English goal.** Build a dedicated trend page at `/trends/spo2` for mom's oxygen readings, the same shape as the weight page that shipped yesterday (PR #71). When mom's oxygen drops below 88% — the 911 floor from the research — the home screen turns red, the same way it already does for weight. The chart always shows the 88% line so the caregiver can see how close the latest reading is to it.

**Architecture.**
1. Server route `/trends/spo2` (App Router server component) reads up to 13 months of `spo2` readings from `daily_log_readings`, then renders a client view.
2. Client view holds the full series on the client and slices it by D/W/M/6M/Y locally using the same ms-based windowing model the weight page uses. Drag-to-scrub on D (continuous, hour-resolution) and swipe-paging on W/M/6M (25% threshold). Y has no scrub.
3. "Add SpO₂" sheet opens from a floating "+" button (canonical register #6). Server action `addSpo2Reading` writes a parent `daily_logs` row + a `daily_log_readings` row, then re-evaluates today's alert tier — same pattern as `addWeightReading`. Engine rules **T1.7a** (<88%) and **T1.7b** (<90% with new dyspnea) already exist in `src/lib/alerts/evaluate.ts`; no engine change needed.
4. Chart is a line+dots trace (same shape as weight) with one addition: a coral dashed horizontal line at 88% — the 911 floor from `SPO2_TIER_1_911`. The Y-axis is dataset-driven nice-step like weight, but min is clamped to ≤ 88 so the floor is always on screen.
5. **Pre-build refactor (scoped, with rule-of-three caveat).** Extract three shared primitives from `weight-trend/` into a new `vitals-trend/` directory before adding SpO₂:
   - `TraceChart` — renamed `EkgChart` + optional `alertFloor` prop.
   - `AddReadingSheet` — generic version of `AddWeightSheet` driven by a `VitalReadingConfig`.
   - `ViewDataSheet` — generic version of the weight delete UI.
   Plus extract the small pure helper `yScaleFor` into `src/lib/trends/y-scale.ts` so SpO₂ can pass a floor/ceiling clamp.
   Weight is migrated to consume the generics.

   **Rule-of-three tension, surfaced.** `.claude/rules/code-quality.md` says "extract after the third occurrence." This refactor extracts at the second. The user's directive on this feature is: "weight + SpO₂ is exactly two — don't build SpO₂ as a copy-paste fork." Per CLAUDE.md `Instruction Priority`, explicit user instruction beats the default rule, so this plan honors the directive. To minimize the risk of premature generalization, the refactor is deliberately narrowed: only the four named pieces. The window-math helpers (`defaultEndForPeriod` / `forwardBoundForPeriod` / `backwardBoundForPeriod` / `subheadFor` / `xLabelsFor` and ~150 lines of date helpers) and the drag-to-scrub logic are **duplicated**, not hoisted — waiting for the third invocation (heart rate) to confirm the shape. BP will not consume these primitives (dual-stepper, dumbbell chart) and that's expected.

**Tech stack.** Next.js 16 (App Router), TypeScript, Tailwind 4, Supabase JS, `lucide-react`, plain inline SVG. Tests in Playwright (UI smoke).

---

## Decisions captured before planning

1. **Chart style:** line+dots with a dashed coral horizontal line at 88%. Register-consistent with weight.
2. **Y-axis:** dataset-driven nice-step. Hard-clamp min ≤ 88 so the 88 floor is always visible. Hard-clamp max ≤ 100 (physiological ceiling).
3. **Stepper:** integer only (step 1), no press-and-hold. Range bounded by `READING_RANGE.spo2 = [50, 100]`. Hero renders `96 %` (no decimal).
4. **Stat trio:** Latest / Lowest / Highest. Lowest is the clinically meaningful direction for SpO₂ (dips toward 88 are what matter). The weight page's third cell is "Range" — dropped here because Lowest + Highest already carry the range information, and naming the floor-cross-risk reading is more informative than its delta from the high.

---

## Acceptance criteria

### Engineering

- [ ] Plan approved before any code is written (this doc, plus a fresh-context plan-review subagent).
- [ ] No new abstractions beyond the three named primitives (`TraceChart`, `AddReadingSheet`, `ViewDataSheet`) and one small `VitalReadingConfig` type. No generic "trend page framework" or "vital adapter pattern."
- [ ] All clinical thresholds imported from `src/lib/clinical/thresholds.ts` (`SPO2_TIER_1_911`, `SPO2_TIER_1_WITH_DYSPNEA`). No inline `88` or `90` anywhere in this feature.
- [ ] Reading range bounds imported from `src/lib/clinical/reading-ranges.ts` (`READING_RANGE.spo2`). No inline `[50, 100]`.
- [ ] Diff scoped to: new files under `src/app/trends/spo2/`, new shared files under `src/components/heartnote/vitals-trend/`, the weight files migrated to consume the shared primitives (delete the old per-vital duplicates), and one new Playwright spec. **No edits to the alert engine, no migration, no new RPC.**
- [ ] Weight page continues to work after the refactor. Playwright weight smoke spec still passes unchanged.

### Functional — happy path

- [ ] Navigating to `/trends/spo2` while signed in renders: back chevron + "Oxygen" title; hero showing the latest reading as `96 %` (integer, percent sign); subhead showing the visible window's exact range (e.g. "Today, 9 AM – Today, 11 PM" or "May 4 – May 10"); D/W/M/6M/Y selector defaulting to D; trace chart with the 88% dashed coral floor line; stat trio Latest / Lowest / Highest underneath; "i" + "+" floating utility bar at the bottom.
- [ ] Tapping D / W / M / 6M / Y switches the chart and stats to the corresponding window. No network call.
- [ ] On D, dragging horizontally on the chart pans the window continuously by the hour. On W/M/6M, dragging past 25% of chart width pages by one full window. On Y, dragging does nothing (page-scroll still works).
- [ ] Tapping "+" opens a slide-up sheet titled "Add oxygen". The sheet contains: SpO₂ stepper (defaults to "—", seed value = last reading, ± steps by 1, no press-and-hold), date input (defaults to today in patient tz), time input (defaults to current local time), Save button.
- [ ] Save commits the reading and the sheet closes; the chart, hero, and stats update on screen within one server round-trip (`router.refresh()`).
- [ ] Tapping the "i" button opens a small menu with "View data". Selecting it opens a slide-up sheet listing all SpO₂ readings most-recent first, with an Edit toggle, Select all, Delete (N), and a "Delete all oxygen data" pill at the bottom.
- [ ] Saving a reading whose value is below 88 (or below 90 with a dyspnea event today) flips the home screen color to red. Verifiable by navigating to `/dashboard` after save.

### Edge cases

- [ ] **Empty state — zero readings ever.** Hero shows "— %" in muted color. Chart frame renders with the 88% dashed coral floor line on a bare scaffold (no synthetic "tap + below" copy in the chart). Stat trio is hidden. The "+" button is rendered and works.
- [ ] **Single reading total.** Chart renders one dot + the 88% floor line. No connecting line. Y-axis uses the same dataset-driven 4-label nice-step as the multi-reading branch — clamped so 88 and 100 are always within the visible range. Result for a single reading `v=96`: ticks `[88, 92, 96, 100]`. Stat trio: Latest = Lowest = Highest = that value.
- [ ] **Two+ readings.** Y-axis uses the same nice-step logic as weight: 4 labels at "nice" intervals from `{1, 2, 5} × 10ⁿ`, padded so data never sits on the chart edge. Then post-process: `min = Math.min(niceMin, 88)`, `max = Math.min(niceMax, 100)`. Ticks recomputed so 88 and 100 are always within the visible range.
- [ ] **All readings ≥ 95.** Nice-step picks something like 95/96/97/98; post-process clamps min to 88. Chart shows a flat trace near the top with the floor line near the bottom — that's intentional; the gap is the clinical signal.
- [ ] **Reading at exactly 100.** Saves successfully. Dot sits on the chart's top edge. Y-axis ticks don't duplicate (no "[88, 100, 100]" — the algorithm must produce four distinct ticks; `[88, 92, 96, 100]` is correct).
- [ ] **All 2+ readings identical** (e.g. three readings all at 98). The `lo === hi` branch from weight's `yScaleFor` applies: re-enter the single-value centered case clamped to 88/100. Ticks `[88, 92, 98, 100]` (or similar — the centered case picks `mid` near the reading value and pads with 88/100).
- [ ] **Reading at exactly 88.** Saves successfully. Dot sits on the floor line. Engine T1.7a uses strict `<` (`if (freshestSpo2.value < SPO2_TIER_1_911)`) — confirmed by reading `src/lib/alerts/evaluate.ts` line 258. A saved **88** leaves the home screen calm; an **87** makes it red.
- [ ] **Reading at 89 with new dyspnea today AND no dyspnea events in the prior 7 days** → engine fires T1.7b (`< SPO2_TIER_1_WITH_DYSPNEA = 90` AND `priorWindowMaxes.dyspneaEventCount === 0`). Home screen turns red.
- [ ] **Reading at 89 with new dyspnea today BUT chronic dyspnea (any logged dyspnea event in prior 7 days)** → engine does **NOT** fire T1.7b (the gate prevents an NYHA-III patient with persistent dyspnea from tripping 911 every morning the cuff reads 89). Home screen stays calm. This is intentional per `research/chf-source-of-truth.md` §2 "new dyspnea" wording.
- [ ] **Backdated reading inside 7d.** Appears in W/M/6M/Y windows on next render. Re-evaluates today's tier (the engine looks at the **freshest** spo2 in the freshness window — older backdated readings don't override a fresher one).
- [ ] **Backdated reading older than 400 days** is rejected by the date input's `min` attribute AND by the action's runtime backdate check (`if (logDate < earliest) return …`) — mirroring `addWeightReading` line 81. The Zod schema validates only shape and value range; the 400-day gate is a separate runtime check inside the action.
- [ ] **Future date / time** is rejected by Zod (`recorded_at <= now()`).
- [ ] **Out-of-range value** (< 50 or > 100) is rejected by Zod (constants from `READING_RANGE.spo2`). The stepper's ± buttons disable at the floor / ceiling.
- [ ] **Voice log in `pending` or `analyzing` status for today** → save returns "Voice log still processing — try again in a moment." Backdated saves (log_date != today) bypass this gate.
- [ ] **Patient row deleted in another tab** while sheet is open → action returns `{ ok: false, error: 'Patient not found.' }`; sheet shows red error text and stays open with the user's values intact.
- [ ] **Sheet's date and time inputs always carry a value.** Defaults computed at sheet-open time (lazy `useState` initializer in a mount-on-open child) so a user idle for hours still gets a fresh "now" timestamp.

### Error states

- [ ] Not signed in → `/trends/spo2` redirects to `/login` (server-side, before any DB read).
- [ ] Onboarding not complete → redirect to `/onboarding`.
- [ ] No patient row → redirect to `/onboarding`.
- [ ] DB read failure on the trend series → page renders with hero "— %" and an empty chart frame (same shape as the empty state). The reference implementation `/trends/weight` doesn't distinguish "DB read failed" from "no readings" at the UI level; this plan inherits that. Surface as a follow-up if a user reports the two states looking identical.
- [ ] Save server action returns `{ ok: false, error: "..." }` → red error text above the Save button. Sheet stays open with user's values intact.
- [ ] Network failure on save (server action throws) → caught and displayed as "Couldn't save — try again."
- [ ] Concurrent voice processing → see "voice log still processing" path above.

### Performance

- [ ] First page load fetches ≤ 13 months of SpO₂ readings in one query. Existing index on `daily_log_readings(patient_id, field, recorded_at desc)` covers the predicate. No migration.
- [ ] Sheet opens within 100ms of "+" tap (local React state, no network).
- [ ] D/W/M/6M/Y switching and drag-to-scrub are local-only (no network round-trip). Drag updates `endMs` on every `pointermove` — no debounce. Mirrors the weight implementation; no separate perf budget specified for this PR.
- [ ] Save shows "Saving…" within 16ms of tap; full round-trip completes in <500ms on a 50ms-RTT connection (one INSERT + one engine evaluation + one upsert).

### Persistence

- [ ] Each save creates exactly one new `daily_logs` row (`processing_status='complete'`) for the chosen `log_date` AND one new `daily_log_readings` row with `field='spo2'`, `value`, `patient_id`, `recorded_at` (full ISO timestamp), `source_log_id = newLog.id`. Both rows survive refresh and appear on `/trends/spo2`.
- [ ] No state leaks into `localStorage`. Chart filter state (D/W/M/6M/Y) and `endMs` are intentionally URL-less — refresh resets to D anchored at the latest reading's period.

### Permissions / RLS

- [ ] `daily_log_readings` already has `caregiver crud own readings` policy from migration `20260501041617`. The new action's INSERT runs under the user's session and is gated by the policy's `with check`. Verified by code reading.
- [ ] `daily_logs` insert is gated by the existing patient-ownership policy. The action SELECTs the patient by `caregiver_id = auth.uid()` first, then inserts using that patient's id — RLS does the final gate.
- [ ] Delete actions (`deleteSpo2Readings`, `deleteAllSpo2Readings`) WHERE-clause includes both `patient_id` and `field='spo2'` so a caregiver-ID mismatch on an `id` still no-ops via RLS.
- [ ] No service-role or admin client used in any new action.
- [ ] **Cache-Control: no-store — n/a.** `/trends/spo2` is authenticated but not on the auth-sensitive route list per `.claude/rules/auth-sessions.md` (`/login`, `/signup`, `/onboarding`, `/me`, `/me/*`, `/auth/*`). No `no-store` header needed.

### Side effects

- [ ] Every save creates one `daily_logs` row + one `daily_log_readings` row (see Persistence above). Plain English: each SpO₂ reading shows up as its own logged event in the dashboard and on the per-log edit page.
- [ ] Re-evaluates today's alert tier via `evaluateAlertTier(supabase, patient.id, today)` and upserts `daily_assessments`. Plain English: an oxygen reading below 88 (or below 90 with new shortness of breath) makes the home screen turn red.
- [ ] When the resulting tier is non-`tier_4_log` AND triggers exist, an `alerts` row is inserted with `daily_log_id = newLog.id` (so the dashboard's `daily_log_id ∈ todaysLogIds` query finds it).
- [ ] **AI reasoning paragraph populated.** Inside the same try block (NOT the catch — the catch only handles `evaluateAlertTier` failure), `generateAlertReasoning` is invoked with the patient context (`firstName`, `dryWeightLb`, `normalPillowCount`, `nyhaClass`) and writes the result into `alerts.ai_reasoning`. The dashboard reads from this column to render the reasoning paragraph beneath the alert headline (per CLAUDE.md rule #4 "AI alerts must show their reasoning in the UI"). If reasoning generation throws, the alert row is still inserted with `ai_reasoning = null` and the dashboard renders the headline alone — matches `addWeightReading`.
- [ ] `revalidatePath('/dashboard')`, `revalidatePath('/trends/spo2')`, and `revalidatePath('/trends')` after save.
- [ ] Deletes also re-evaluate today's tier — removing the freshest sub-88 reading inside the 24h freshness window flips the home screen back to calm.

### Out of scope (deferred — explicitly NOT in this plan)

- Voice log integration for SpO₂ (already works via `apply_voice_log_extraction` RPC — voice-captured `spo2` values land in the same `daily_log_readings` rows and show up on the trend page automatically).
- Apple Watch / HealthKit ingestion (separate feature; requires paid Apple Developer enrollment).
- Pattern-note paragraph (the editorial card from the mockup's Phone 4). Deferred from weight; deferred here.
- Source attribution footer ("22 voice log · 4 Apple Watch"). Schema doesn't yet distinguish voice vs manual; the existing "N readings in this window · M total in the last year" line covers the basics.
- Comparing SpO₂ trend against weight trend on the same chart (cross-vital correlation is its own feature).
- The "pip" chip below the hero showing "1 dip to 86% in Feb · recovered same week" from the mockup. Adding it would diverge from the weight page register; the same information is surfaced in the Lowest stat-trio cell. Deferred.
- Re-evaluating the **historical day's** `daily_assessments` row when a backdated reading lands on it. Today's assessment is always re-evaluated; past-day assessments are best-effort. Same deferral as the weight page.
- **Inherited bug from weight: `dayTimeLabel` "Today / Yesterday" computed against the caregiver's browser-local `Date.now()`, not the patient's timezone.** A caregiver in a different timezone than the patient sees Today/Yesterday labels off by ±1 day on the D-window subhead. The SpO₂ page inherits the bug verbatim; fixing it would require touching the shared subhead helper and is out-of-scope for this PR. Flagged here so the next person who finds it can grep this file.

### Manual verification

1. Sign in as the test caregiver. Navigate to `/trends/spo2` (URL-typed; no dashboard link yet). Confirm the layout: back chevron, "Oxygen" title, hero, D/W/M/6M/Y selector defaulting to D, chart with 88% dashed coral line, stat trio Latest/Lowest/Highest, floating "i" + "+" buttons.
2. Tap "+" → enter 96 → today, 9:00 AM → Save. Sheet closes; chart shows the new dot; hero updates to "96 %"; Latest stat shows the new time.
3. Tap "+" → enter 87 → today, 10:00 AM → Save. Navigate to `/dashboard`. Confirm the home screen color is red and the alert names "Oxygen 87% — 911."
4. Tap "+" → enter 99 → 14 days ago, 7:00 AM → Save. Switch to W → see the 14-day point appear at the left edge. Switch to D → it's gone (out of window).
5. Tap "+" → enter 50 then tap minus → ± button disables at the floor. Same at 100 on the plus side.
6. Tap the "i" button → "View data" → list shows all readings. Tap Edit → tap two rows → Delete (2). Confirm dialog echoes "Delete 2 oxygen readings (May 4 – May 10)?". Tap OK → rows gone.
7. Tap "i" → "View data" → "Delete all oxygen data" pill → confirm dialog echoes the patient's first name and count (e.g. "Delete all 3 of Eleanor's oxygen readings? This cannot be undone." — using `patientFirstName`, NOT "Mom's"/"Dad's", per the no-relationship-in-copy memory). OK → empty state restored.
8. Run the weight page smoke spec (`tests/weight-trend.spec.ts`) and confirm it still passes — the refactor mustn't regress weight.

---

## File structure

**New shared primitives (under `src/components/heartnote/vitals-trend/`):**
- `TraceChart.tsx` — renamed from `EkgChart`. Adds an optional `alertFloor?: { y: number; color: string }` prop that draws a dashed horizontal line at `yOf(alertFloor.y)`. All other behavior identical.
- `AddReadingSheet.tsx` — generic add-reading sheet driven by a `VitalReadingConfig`. Replaces `AddWeightSheet`.
- `ViewDataSheet.tsx` — generic view/delete sheet driven by a `VitalReadingConfig`. Replaces `weight-trend/ViewDataSheet.tsx`.
- `InfoMenu.tsx` — moved from `weight-trend/` unchanged (already generic).
- `vital-reading-config.ts` — the small config type:

```ts
export interface VitalReadingConfig {
  field: ReadingField;            // 'weight_lb' | 'spo2' | …
  fieldLabel: string;             // 'Weight' / 'Oxygen'
  unit: string;                   // 'lb' / '%'
  range: [number, number];        // from READING_RANGE[field]
  step: number;                   // 0.1 (weight) | 1 (spo2)
  integer: boolean;               // false (weight) | true (spo2)
  pressAndHold: boolean;          // true (weight) | false (spo2)
  formatValue: (v: number) => string;     // weight: v.toFixed(1) | spo2: String(Math.round(v))
  sheetTitle: string;             // 'Add weight' / 'Add oxygen'
  eyebrowLine: (baseline: number | null, seed: number | null) => string | null;
  // singular/plural noun used ONLY in destructive confirm() prompts
  deleteNoun: { singular: string; plural: string };  // 'weight reading' / 'oxygen reading'
}
```

**New SpO₂ files:**
- `src/app/trends/spo2/page.tsx` — server component, auth + patient lookup, data fetch.
- `src/app/trends/spo2/actions.ts` — server actions `addSpo2Reading`, `deleteSpo2Readings`, `deleteAllSpo2Readings`.
- `src/components/heartnote/spo2-trend/Spo2TrendView.tsx` — client view. Imports `TraceChart`, `AddReadingSheet`, `ViewDataSheet`, `InfoMenu` from `vitals-trend/`. Owns: D/W/M/6M/Y state, `endMs`, drag-to-scrub handlers, hero formatter (integer + %), stat trio (Latest / Lowest / Highest), Y-scale logic (nice-step with floor clamp to 88 and ceiling clamp to 100), and the `VitalReadingConfig` for SpO₂.
- `src/lib/trends/vital-reading.ts` — the shared reading type:

```ts
export type VitalReading = {
  id: string;
  recorded_at: string;
  value: number;
  log_date: string;
};
export type WindowPeriod = 'D' | 'W' | 'M' | '6M' | 'Y';
```

  `src/lib/trends/weight-window.ts` is deleted; its `WeightReading` type is replaced by `VitalReading`. Weight imports update accordingly.
- `tests/spo2-trend.spec.ts` — Playwright UI smoke.

**Refactor of existing files:**
- `src/components/heartnote/weight-trend/EkgChart.tsx` → **deleted**; weight imports `TraceChart` from `vitals-trend/`.
- `src/components/heartnote/weight-trend/AddWeightSheet.tsx` → **deleted**; weight imports `AddReadingSheet` from `vitals-trend/` with a weight `VitalReadingConfig`.
- `src/components/heartnote/weight-trend/ViewDataSheet.tsx` → **deleted**; weight imports `ViewDataSheet` from `vitals-trend/`.
- `src/components/heartnote/weight-trend/InfoMenu.tsx` → **moved** to `vitals-trend/InfoMenu.tsx` (unchanged).
- `src/components/heartnote/weight-trend/WeightTrendView.tsx` → keep as-is, but imports update to the new module paths; build a `WEIGHT_CONFIG: VitalReadingConfig` constant inside the file (or alongside) and pass it to the shared sheets.
- `src/app/trends/weight/actions.ts` → unchanged behavior; imports update.

**Files that need NO changes:**
- `src/lib/alerts/evaluate.ts` (T1.7 already wired).
- `src/lib/clinical/thresholds.ts` (SPO2 constants already there).
- `src/lib/clinical/reading-ranges.ts` (spo2 already in `READING_RANGE`).
- DB schema. No migration.

---

## Tasks

> Execute in order. Each task names verifiable success criteria.

### Task 1 — Extract shared primitives into `vitals-trend/`

**Goal.** Move the three duplicated components out of `weight-trend/` and into a new `vitals-trend/` directory, with the SpO₂-supporting additions baked in.

**Files:**
- Create: `src/lib/trends/vital-reading.ts`
- Create: `src/components/heartnote/vitals-trend/vital-reading-config.ts`
- Create: `src/components/heartnote/vitals-trend/TraceChart.tsx`
- Create: `src/components/heartnote/vitals-trend/AddReadingSheet.tsx`
- Create: `src/components/heartnote/vitals-trend/ViewDataSheet.tsx`
- Create: `src/components/heartnote/vitals-trend/InfoMenu.tsx`
- Delete: `src/components/heartnote/weight-trend/EkgChart.tsx`
- Delete: `src/components/heartnote/weight-trend/AddWeightSheet.tsx`
- Delete: `src/components/heartnote/weight-trend/ViewDataSheet.tsx`
- Delete: `src/components/heartnote/weight-trend/InfoMenu.tsx`
- Delete: `src/lib/trends/weight-window.ts`
- Edit: `src/components/heartnote/weight-trend/WeightTrendView.tsx` (imports + new `WEIGHT_CONFIG`).
- Edit: `src/app/trends/weight/actions.ts` (import path only).
- Edit: `src/app/trends/weight/page.tsx` (import path only — `WeightReading` → `VitalReading`).

**Steps:**

- [ ] **Step 1.1 — `vital-reading.ts`.** Create the type file replacing `weight-window.ts`. Export `VitalReading` and `WindowPeriod`.
- [ ] **Step 1.2 — `vital-reading-config.ts`.** Create the config type from the File Structure section.
- [ ] **Step 1.3 — `TraceChart.tsx`.** Copy `EkgChart.tsx` verbatim, rename component to `TraceChart`. Add a new optional prop `alertFloor?: { y: number; color: string }`. After the y-gridlines and x-gridlines render passes, render the floor as a `<line>` at `yOf(alertFloor.y)` with `stroke={alertFloor.color}`, `strokeDasharray="4 3"`, `strokeWidth="1"`, drawn **inside** the clipPath so it doesn't bleed past chart edges. Render BEFORE the polyline/dots so the trace draws on top.
- [ ] **Step 1.4 — `AddReadingSheet.tsx`.** Copy `AddWeightSheet.tsx`. Replace hardcoded "weight" / "lb" / "Weight" / `0.1` step / range constants with `config.*`. The press-and-hold logic is conditional: `if (config.pressAndHold) { … } else { adjust(delta) }` on tap-only. The hero font flavor matches weight (large numeric + small unit) but uses `config.formatValue` for the rendered text. **One twist:** the existing weight sheet splits the value into integer + decimal parts visually (`{Math.floor(...)}.{decimal}`). For integer configs, the decimal half collapses — render only the integer chunk. Implement as: if `config.integer`, render `{formatValue(v)}`; else, render the split.
- [ ] **Step 1.5 — `ViewDataSheet.tsx`.** Copy `ViewDataSheet.tsx`. Replace hardcoded labels with `config.fieldLabel`, `config.unit`, `config.noun.singular/plural`, `config.formatValue`. The delete server actions become props (`deleteByIds`, `deleteAll`) instead of imported directly. Confirm copy uses the canonical-controls.md class-B `confirm()` template echoing the patient name + count for "Delete all".
- [ ] **Step 1.6 — `InfoMenu.tsx`.** Move from `weight-trend/` to `vitals-trend/`. No code changes.
- [ ] **Step 1.7 — Migrate `WeightTrendView.tsx`.** Update imports. Add `WEIGHT_CONFIG: VitalReadingConfig` inside the file (or co-located). Pass it to `AddReadingSheet` and `ViewDataSheet`. The hero rendering inside `WeightTrendView` stays as-is (it already handles the decimal split inline). The eyebrow line ("vs. baseline N.N lb / last N.N lb") moves into `WEIGHT_CONFIG.eyebrowLine`.
- [ ] **Step 1.8 — Migrate `actions.ts`.** Imports only.
- [ ] **Step 1.9 — Migrate `page.tsx`.** `WeightReading` → `VitalReading`.
- [ ] **Step 1.10 — Verify weight regression.** Run `npm run lint && npm run build`. Manually click through `/trends/weight`: hero, D/W/M/6M/Y, drag-to-scrub, add a reading, delete a reading, delete all. All behavior unchanged.

**Success criteria:**
- `git status` shows: 6 new files in `vitals-trend/` + `vital-reading.ts`, 4 deletes from `weight-trend/`, 3 edits in `weight-trend/` / `app/trends/weight/`.
- `npm run lint` clean. `npm run build` clean.
- `/trends/weight` works identically to before.

### Task 2 — Y-scale logic with floor + ceiling clamps

**Goal.** Extend the existing `yScaleFor` logic (currently inline in `WeightTrendView.tsx`) so it can be invoked with optional `floor` and `ceiling` clamps. SpO₂ passes `floor: 88, ceiling: 100`; weight passes neither.

**Approach.** Hoist `yScaleFor` and `niceStep` out of `WeightTrendView.tsx` into a new pure module so SpO₂ can import the same function. Don't generalize beyond what's needed.

**Files:**
- Create: `src/lib/trends/y-scale.ts` (exports `yScaleFor(readings, options?)`).
- Edit: `src/components/heartnote/weight-trend/WeightTrendView.tsx` (delete inline `yScaleFor`, import from `y-scale.ts`).

**Steps:**

- [ ] **Step 2.1 — Extract `yScaleFor`.** Pure function; signature:

  ```ts
  export function yScaleFor(
    readings: { value: number }[],
    options?: { floor?: number; ceiling?: number; singleValueHalfRange?: number },
  ): { min: number; max: number; ticks: number[] };
  ```

  `floor` clamps `min = Math.min(min, floor)`. `ceiling` clamps `max = Math.min(max, ceiling)`. `singleValueHalfRange` defaults to 10 (weight) — SpO₂ passes 5. After clamps, ticks are recomputed so the 4 labels span the clamped range at nice intervals.

- [ ] **Step 2.2 — Edge cases the function must handle:**
  - Empty dataset with `floor=88, ceiling=100` → `{ min: 88, max: 100, ticks: [88, 92, 96, 100] }`.
  - Single reading `v=96` with `floor=88, ceiling=100, singleValueHalfRange=5` → must include 88, 96, and 100 in the visible range; ticks `[88, 92, 96, 100]`.
  - Single reading `v=88` (boundary) → ticks `[88, 92, 96, 100]`.
  - Two+ readings all in [94, 99] with `floor=88, ceiling=100` → nice-step picks something like 94/96/98/100 with the data nicely centered; post-process clamps min to 88 → ticks `[88, 92, 96, 100]` or `[88, 92, 96, 99]` depending on the nice-step. Document the chosen tick algorithm.
  - Two+ readings spanning [85, 99] → nice-step covers 85–99; post-process clamps min to ≤ 88 (already there) → ticks like `[84, 90, 96, 100]`.

- [ ] **Step 2.3 — Weight regression.** Call from `WeightTrendView` with no options; output identical to current behavior. Re-verify `/trends/weight` visually.

**Success criteria:**
- New `y-scale.ts` has no React imports (pure function).
- `WeightTrendView` no longer contains the `niceStep` / `yScaleFor` helpers.
- Weight chart renders identically before and after.

### Task 3 — Server action `addSpo2Reading` + delete actions

**Goal.** Mirror `addWeightReading`, `deleteWeightReadings`, `deleteAllWeightReadings` for the `spo2` field. The alert engine already handles SpO₂ in `evaluate.ts` (rules T1.7a, T1.7b) — no engine edits.

**Files:**
- Create: `src/app/trends/spo2/actions.ts`.

**Steps:**

- [ ] **Step 3.1 — `addSpo2Reading`.** Copy `addWeightReading` verbatim. Change:
  - Zod schema: `spo2: z.number().int().min(READING_RANGE.spo2[0]).max(READING_RANGE.spo2[1])` (note `.int()` — integer-only).
  - Field name: `'spo2'` instead of `'weight_lb'`.
  - `revalidatePath('/trends/spo2')` instead of `/trends/weight`.
  - Patient SELECT doesn't need `dry_weight_lb` / `normal_pillow_count` / `nyha_class` (used only for reasoning enrichment — but keep them since `generateAlertReasoning` still needs them in the catch-block for non-spo2 triggers that may have fired alongside).
  - Plain-English error messages match weight: "Not signed in", "Profile not found", etc.
- [ ] **Step 3.2 — `deleteSpo2Readings` and `deleteAllSpo2Readings`.** Mirror weight's. WHERE clause `field='spo2'`. Re-evaluate today's tier after delete (a freshest sub-88 reading inside 24h freshness window flipping calm).
- [ ] **Step 3.3 — Wire to engine.** Confirm the engine evaluates SpO₂ on the post-insert re-eval. No engine change needed; T1.7a/b read from `daily_log_readings` directly via `freshestReading(readings, 'spo2', SPO2_FRESHNESS_HOURS, logDate)`.

**Success criteria:**
- File exists; exports three named server actions.
- Inserting an 87% reading via the action: assert one new `daily_logs` row, one new `daily_log_readings` row, one new `alerts` row with `trigger_reason='spo2'` (or similar) and `tier='tier_1_911'`, one upserted `daily_assessments` row.

### Task 4 — `Spo2TrendView` client component

**Goal.** Build the client view at `src/components/heartnote/spo2-trend/Spo2TrendView.tsx`. Reuse the same windowing + drag-to-scrub model as `WeightTrendView`, but with SpO₂-specific config: integer hero, dataset+floor Y-scale, Latest/Lowest/Highest trio, dashed coral 88% floor on the chart, `SPO2_CONFIG: VitalReadingConfig`.

**Files:**
- Create: `src/components/heartnote/spo2-trend/Spo2TrendView.tsx`.

**Steps:**

- [ ] **Step 4.1 — Skeleton + props.** Copy `WeightTrendView.tsx` structure (props: `patientFirstName`, `timezone`, `today`, `allReadings: VitalReading[]`). SpO₂ has no `baselineLb` equivalent — the patients table has no `dry_spo2` column. Pass `seedValue` only (last reading).
- [ ] **Step 4.2 — `SPO2_CONFIG`.** Define inside the file:
  ```ts
  import { READING_RANGE } from '@/lib/clinical/reading-ranges';
  import { SPO2_TIER_1_911 } from '@/lib/clinical/thresholds';

  const SPO2_CONFIG: VitalReadingConfig = {
    field: 'spo2',
    fieldLabel: 'Oxygen',
    unit: '%',
    range: READING_RANGE.spo2,
    step: 1,
    integer: true,
    pressAndHold: false,
    formatValue: (v) => String(Math.round(v)),
    sheetTitle: 'Add oxygen',
    eyebrowLine: (_baseline, seed) => seed !== null ? `last ${Math.round(seed)} %` : null,
    noun: { singular: 'oxygen reading', plural: 'oxygen readings' },
  };
  ```
- [ ] **Step 4.3 — Hero.** Render `{Math.round(latest.value ?? 0)} %`. Same 36px font, muted color when no data. **Do not** split into integer + decimal halves (SpO₂ has no decimal). The "%" sits at 22px next to the integer, same baseline alignment as weight's "lb".
- [ ] **Step 4.4 — Subhead + window-math.** Same `subheadFor(period, startMs, endMs, timezone)` and `xLabelsFor` helpers as weight, plus `defaultEndForPeriod` / `forwardBoundForPeriod` / `backwardBoundForPeriod` / `windowSpanMs` / `isoDateOf` / `dowOfDay` / `hourLabel` / `weekdayLabel` / `shortDateLabel` / `monthLabel` / `dayTimeLabel` and all the anchor helpers. **Decision: duplicate, do not hoist.** Per the rule-of-three caveat in Architecture, the window-math helpers are the part of the implementation that is most likely to differ when HR / BP / pillows arrive — keep them in `Spo2TrendView.tsx` until the third invocation. The duplication cost (≈200 lines) is real but limited to one file; the cost of a premature shared module that needs reshaping at HR-time is higher. Lift only at the third invocation.
- [ ] **Step 4.5 — Chart.** `TraceChart` with `alertFloor={{ y: SPO2_TIER_1_911, color: 'var(--destructive)' }}`. Show line+dots same as weight on D/M/6M/Y; W is dots-only same as weight (the user's "intra-week weigh-ins aren't a continuous trend" rule applies to SpO₂ readings too: a couple of pulse-ox readings per week aren't a continuous trend; daily readings in M+ are).
- [ ] **Step 4.6 — Y-scale call.** `yScaleFor(allReadings, { floor: SPO2_TIER_1_911, ceiling: 100, singleValueHalfRange: 5 })`. Use the result as before.
- [ ] **Step 4.7 — Stat trio.** New function `tripleStatsSpo2(slice, tz)` returning `[Latest, Lowest, Highest]`. Use `Math.round` on the rendered value; unit is `%`. Sub-text is the reading's time-of-day (same as weight).
- [ ] **Step 4.8 — Hero pip / pattern note / source footer.** Skipped per Out-of-scope.
- [ ] **Step 4.9 — Floating bar.** Same `InfoMenu` (with "View data" item) + "+" button.
- [ ] **Step 4.10 — Sheets.** `AddReadingSheet` and `ViewDataSheet` from `vitals-trend/`, both fed `SPO2_CONFIG`. `onSave` calls `addSpo2Reading`; `deleteByIds` / `deleteAll` call `deleteSpo2Readings` / `deleteAllSpo2Readings`.

**Success criteria:**
- File exists. `npm run lint && npm run build` clean.
- Renders empty / single-reading / many-reading cases visually correctly per Edge Cases AC.

### Task 5 — Page route `/trends/spo2`

**Goal.** Server component mirror of `src/app/trends/weight/page.tsx`.

**Files:**
- Create: `src/app/trends/spo2/page.tsx`.

**Steps:**

- [ ] **Step 5.1 — Auth + onboarding gates.** Same shape as weight. Redirect to `/login` / `/onboarding` as needed.
- [ ] **Step 5.2 — Patient lookup.** SELECT `id, display_name` only — no `dry_weight_lb` needed.
- [ ] **Step 5.3 — Fetch.** `daily_log_readings` WHERE `patient_id = patient.id AND field = 'spo2' AND log_date >= today - 366 AND log_date <= today` ORDER BY `recorded_at ASC`. Map into `VitalReading[]`.
- [ ] **Step 5.4 — Render.** `<PhoneShell hideNav>` wrapping `<Spo2TrendView />` with the fetched props.

**Success criteria:**
- Navigating to `/trends/spo2` while signed in renders the page. Auth-gate paths return correct redirects (verifiable by hitting the URL while signed out).

### Task 6 — Lint + build

- [ ] `npm run lint`
- [ ] `npm run build` (timeout 300000, never background per CLAUDE.md)
- [ ] No TS errors, no ESLint warnings, no Tailwind warnings.

### Task 7 — Playwright UI smoke

**Goal.** Smoke spec for `/trends/spo2` covering empty state, add reading, list/delete, alert-firing on sub-88.

**Files:**
- Create: `tests/spo2-trend.spec.ts`.

**Steps (one `test()` each):**

- [ ] **Empty state.** Sign in as a caregiver with zero `spo2` readings. Visit `/trends/spo2`. Assert: hero shows "— %", chart frame is present with the 88% floor line, "+" button is visible.
- [ ] **Add reading happy path.** Tap "+" → enter 96 → today, 9:00 AM → Save. Assert: sheet closes; hero is "96 %"; stat trio Latest cell shows "96 %" at "9 AM".
- [ ] **Tier 1 alert fires.** Tap "+" → enter 87 → today, 10:00 AM → Save. Navigate to `/dashboard`. Assert: dashboard color is red; alert banner names "Oxygen 87% — 911" (engine's `T1.7a` label).
- [ ] **View data + delete.** Open "i" menu → "View data" → assert N rows visible. Tap Edit → tap one row's checkbox → tap "Delete (1)" → confirm dialog text echoes the row's date. Assert: row gone from list, chart updated.
- [ ] **Delete all.** "i" menu → "View data" → tap "Delete all oxygen data" → confirm dialog text contains the patient name and the count → OK. Assert: list is empty.
- [ ] **Weight regression.** Run the existing weight smoke spec (don't duplicate; just ensure it still passes via `npm run test:e2e` of the full suite).

**Success criteria:**
- All new tests pass locally.
- The existing weight Playwright spec still passes.

### Task 8 — Code review

- [ ] Dispatch a fresh-context code-review subagent (per `.claude/rules/feature-workflow.md` step 6). Pass: the diff (`git diff main...HEAD`), this plan, the relevant rule files. The subagent verifies each AC and flags `code-quality.md` / `canonical-controls.md` / `plain-english-explanations.md` / `destructive-actions.md` violations.

### Task 9 — Push + PR (do NOT merge)

- [ ] `git push -u origin <branch>`.
- [ ] `gh pr create --title "feat(trends/spo2): dedicated oxygen trend page + 88% floor"` with a PR body covering: plain-English summary, the four user-decisions captured, the pre-build refactor, and a test-plan checklist.
- [ ] `gh pr checks --watch` until CI passes.
- [ ] **Stop.** Per user direction in this session: leave the PR open for the user to review.

---

## Summary

One new vital trend page (`/trends/spo2`), built on three shared primitives (`TraceChart`, `AddReadingSheet`, `ViewDataSheet`) extracted from the weight page. The shared primitives mean weight is migrated first, behavior-preserving. SpO₂'s only material divergence from weight: a coral dashed line at 88% on the chart, an integer stepper, and Latest/Lowest/Highest as the stat trio. Engine already understands SpO₂ — no engine work.

## Test plan

- [ ] Empty / single / many-reading visuals match Edge Cases AC.
- [ ] Saving a sub-88 reading flips the home screen red within one round-trip.
- [ ] Saving an 89 with a logged dyspnea event today fires T1.7b; without a dyspnea event today it falls through to tier 4.
- [ ] Weight page Playwright smoke still passes — the refactor doesn't regress weight.
- [ ] Delete all confirm() prompt echoes the patient name + count per `.claude/rules/destructive-actions.md` class-B.

## Future work (out of scope for this plan)

- Heart-rate trend page (`/trends/hr`) — the third invocation. This is the right moment to hoist `defaultEndForPeriod` / `forwardBoundForPeriod` / `backwardBoundForPeriod` / `subheadFor` / `xLabelsFor` / the date anchor helpers into a shared `window-math.ts` and have all three pages consume them.
- BP trend page (`/trends/bp`) — two values per reading; the shared primitives in this PR won't fit. Will need a new add-sheet shape (dual-stepper) and a new chart shape (dumbbell). Expect those to be net-new files, not extensions of `vitals-trend/`.
- Pattern-note paragraph + source-attribution footer (deferred for both weight and SpO₂).
- HealthKit ingestion (paid Apple Developer required).
- Dashboard `/trends` index linking each vital card into its dedicated trend page.
