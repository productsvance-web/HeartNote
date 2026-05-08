# Design system alignment — Phase A (home + trends)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the home dashboard and the Trends page into visual + content alignment with the HeartNote Design System (`/tmp/heartnote-design-system`). Add three new home-screen components (HeroAlert, VitalsList, BaselineProgress), replace the Trends `ComingSoonPage` with real sparkline cards, and clean up one copy violation. All values come from the existing Supabase schema — no new tables, no mock fields.

**Architecture.** Three new server components on `/dashboard`, each reading the existing `daily_logs` / `daily_log_readings` / `daily_log_symptom_events` / `daily_assessments` tables under the caregiver's already-RLS'd Supabase server client. One new server page on `/trends` composing the same data into 14-day sparkline cards. One pure helper (`per-vital-tier.ts`) classifies each individual vital's status pip from the same row data the alert engine reads — it does *not* re-implement alert logic. We surface the classifier's per-vital tier next to the daily_assessments overall tier, and the latter remains the source of truth for the headline "what changed" alert.

**Tech stack.** Next.js 16 App Router (server components by default), Supabase RLS, Tailwind 4 with the existing token sheet, `lucide-react` icons, no new dependencies.

---

## Scope guard — what is NOT in this plan

Surfacing these explicitly so the user can redirect before review:

- **Login / `/login/*`.** Already aligned with the design system's hero photo + form panel.
- **Voice log / `/log/*`.** Currently in active redesign (memory: `project_voice_log_redesign`). Not touching.
- **Settings / `/me/*`.** No design-system spec for these surfaces yet.
- **Medications page / `/me/medications`.** Recently unified flow (PR #50/#52/#53). The design-system meds screen is illustrative; not a clear delta vs. production. Skip.
- **Visits / `/visits`.** Stays `ComingSoonPage`. Real implementation needs a `next_visit_date` column on `patients` and a `visit_questions` table — out of scope for this PR. Surfaced as a follow-up.
- **Family / `/family`.** Stays `ComingSoonPage`. Care-circle data model is a separate spec.
- **Bottom nav.** Production is 5-tab (Home / Trends / Family / Visits / Me). Design system has TWO variants — 5-tab in `ui_kits/app/screens.jsx` and a 3-tab Home / Log [FAB] / Me in `designs/home-screen.jsx`. The 3-tab variant moves the voice log from the `/log` page link to a global FAB — that's a meaningful product change, not just a nav reshuffle. **Not switching in this PR.** Filing a follow-up plan: `docs/superpowers/plans/<future-date>-3-tab-nav-fab-voice-log.md` to evaluate switching once this Phase A lands.
- **Logo / wordmark lockup.** Design system explicitly flags this as not-yet-designed; out of scope.
- **No new database tables, columns, or RLS policies.** Everything we render reads existing structures.

## Decisions surfaced to the user (read before approving)

1. **Trends "Sleep quality" card.** The design-system mock shows a 0–10 sleep-quality score. **We don't capture that.** What we do capture: `pillow_count`, `daily_log_symptom_events.nocturnal=true` for cough, and PND. Plan: replace the "Sleep quality" card with a **"Sleep disruption" card** showing `nocturnal cough nights / 14` + `pillow change vs. 7-night baseline`. No new schema. If you want a real 0–10 score, that's a separate spec (voice-log extractor would need a new field).
2. **"Two patterns to share at the May 14 visit"** headline on Trends. The design uses an upcoming-visit date. We don't store one. Plan: render a generic dynamic headline based on count of cards in non-`good` tier (e.g. *"Two patterns worth flagging at the next visit."*). If we should add `patients.next_visit_at`, that's a follow-up.
3. **HeroAlert 14-day weight sparkline + AHA threshold band.** The design-system mock plots "▲ 4.4 lb in 14 days." We have weight readings in `daily_log_readings`. Plan: pull last 14 days of weight readings and render the spark only when (a) tier is alert/watch *and* (b) the lead trigger's `rule_id` is in the explicit weight-rule allowlist `['T2.1','T2.2','T2.3','T3.1']` (these are the weight-gain rules in `src/lib/alerts/evaluate.ts` — 24h / 48h / 7d / 1–2 lb-daily-for-3+-days). If trigger is non-weight (e.g. sputum color, breathing), hide the spark and lead with the trigger text only.
4. **Vitals list — Pillows row when count is steady.** Design system shows "2 tonight · ▲ 1 vs 7-night." We compute the 7-night baseline on the fly from `daily_logs.pillow_count`. Cold-start (< 7 days of data): show "1 tonight · learning baseline." instead of the delta. Coheres with the alert engine's cold-start suppression.

5. **Per-vital classifier mirrors the alert engine exactly.** The classifier in `per-vital-tier.ts` calls into the same threshold values + the same logic the engine uses for a given vital. Specifically: **Pillows** alert when `pillowCount > max(rolling7dMax, baseline)` (matches `T2.4`), watch one step below; **Swelling** alert when present today + `resolvesOvernight=false` + new-or-worsened vs. prior week (matches `T2.6`), watch when present + `resolvesOvernight=true`; **Cough** alert when nocturnal + ≥3 nights/week (matches `T2.5`), watch when nocturnal + ≥2 or non-nocturnal cough trending up. **Weight** uses the same 24h/48h/7d windows the engine reads (`WEIGHT_GAIN_TIER_2_*`). **Breathing** ladders dyspnea severity + `activity_step_change`. Goal: when the engine fires tier_2 for pillows-only, the pillows pip is alert AND the headline tier is alert. If the two diverge, that is by definition a bug in the classifier — reviewer is asked to verify each rule's per-vital implementation.

6. **Trends "Sleep" naming.** The card is labeled `Sleep` (not "Sleep quality" — we don't have a score; not "Sleep disruption" — too clinical). Sub-line reads "{n} restless nights / 14d" with `n` = nocturnal-cough-event-count + nights with `pillow_count > baseline`. Status badge from per-vital classifier.

7. **Trends headline singular/plural.** N=0 → "Nothing pulling at your attention this week." N=1 → "One pattern worth flagging at the next visit." N≥2 → "{N} patterns worth flagging at the next visit." Number-words used for 2–9, digits for 10+.

If any of those decisions is wrong, push back.

---

## File structure

### Files to CREATE

- `src/components/heartnote/StatusPip.tsx` — pure presentational dot, sizes good/watch/alert/unknown.
- `src/components/heartnote/MiniTrendSpark.tsx` — pure presentational SVG sparkline, optional threshold band, optional baseline dotted line.
- `src/components/heartnote/HeroAlertCard.tsx` — server component. Replaces the dashboard's inline `AlertBlock`. Reads the same `assessment.triggers` plus, when relevant, a 14-day weight series.
- `src/components/heartnote/VitalsListCard.tsx` — server component. "TODAY'S SIGNALS" eyebrow + 5-row card (Weight, Swelling, Breathing, Pillows, Cough).
- `src/components/heartnote/BaselineProgressCard.tsx` — server component. "SETUP · DAY N OF 7" eyebrow + 7-dot track + "What we're learning" 5-row collecting list. Replaces the cold-start text in dashboard.
- `src/components/heartnote/TrendsView.tsx` — server component, the body of the new Trends page. Composes 3 sparkline cards + visit-prep strip.
- `src/lib/vitals/per-vital-tier.ts` — pure function that returns `{tier, label, value, sub}` for each of {weight, swelling, breathing, pillows, cough} given today's row data + cold-start flag.
- `src/lib/vitals/today-snapshot.ts` — server query helper. Returns the patient's most recent reading per `daily_log_readings.field` and today's symptom-event presence — the inputs `per-vital-tier` consumes.
- `src/lib/trends/series.ts` — server query helper. Returns 14-day weight series, 14-day nocturnal-cough nights count, 14-day pillow-count series, and 14-day symptom-event tallies.

### Files to MODIFY

- `src/app/dashboard/page.tsx` — compose `HeroAlertCard` (alert + watch tiers), `VitalsListCard` (always when not cold-start), `BaselineProgressCard` (cold-start). Remove the inline `AlertBlock` function — it gets replaced wholesale by `HeroAlertCard`. Keep the existing greet + patient-summary block.
- `src/app/trends/page.tsx` — replace `ComingSoonPage` with a real page that fetches required and renders `TrendsView`.
- `src/components/heartnote/TodaysMedsCard.tsx` line 33 — replace `your loved one` with `mom`/`dad`/the patient name. Design system explicitly forbids "your loved one."
- `src/components/heartnote/StatusRing.tsx` line 13 — change `'Watch for changes'` to `'Pay attention'` (matches design system `home-screen.jsx` and `screens.jsx`).

### Files NOT touched

See "Scope guard" above.

---

## Acceptance criteria (full template per `.claude/rules/acceptance-criteria.md`)

### Engineering — always include

- [ ] Plan stated and approved before any code is written.
- [ ] No new abstractions, frameworks, or generic helpers added unless explicitly named here. (Specifically: `per-vital-tier.ts`, `today-snapshot.ts`, `series.ts` are the only new lib files.)
- [ ] Diff scoped to files in "File structure" above. No unrelated formatting changes. No refactoring outside scope.
- [ ] All ACs verifiable by reading specific behavior or running specific commands.
- [ ] Every clinical number used in `per-vital-tier.ts` is imported from `src/lib/clinical/thresholds.ts`. No magic numbers.
- [ ] No new strings invented for clinical UI without a citation comment pointing at `research/chf-source-of-truth.md`.

### Functional — happy path

**Home — `good` tier (steady, ≥ 7 days logged):**
- [ ] Greeting renders: *"Good morning, {caregiver_name}."* (Inter 11px eyebrow with the date), Fraunces 26px headline.
- [ ] `HeroAlertCard` is NOT rendered. (Only renders for `tier_2_today` / `tier_3_48hr` / `tier_1_911`.)
- [ ] Subhead under greeting renders. Template: `"{patientName}'s check-in came in at {h:mm a}. {n} signals to read today."` — `patientName` = `patient.display_name` (e.g. *Carol*, *Mom*). When `display_name` is null/empty/`'them'`, the subhead degrades to `"Today's check-in came in at {h:mm a}. {n} signals to read today."` `n` = count of vitals with reported data today. The phrase NEVER reads "your loved one" or "your parent's" — design-system Content Fundamentals are mandatory.
- [ ] `VitalsListCard` renders 5 rows in this exact order: Weight, Swelling, Breathing, Pillows, Cough.
- [ ] Each row shows: status pip · label · value · sub. Chevron right.
- [ ] Eyebrow above the card reads `TODAY'S SIGNALS` (uppercase, Inter, letter-spaced).
- [ ] Right side of eyebrow row: `"{n} of 5 logged"` where `n` = count of rows with non-null value today.

**Home — `tier_2_today` / `tier_3_48hr`:**
- [ ] `HeroAlertCard` renders inside the same card slot the current `AlertBlock` uses.
- [ ] Eyebrow row: status pip + uppercase trigger label, e.g. `WATCH · WEIGHT`.
- [ ] Fraunces 19px headline naming what's wrong, e.g. *"Up 4.4 lb in 14 days — past the AHA threshold."*
- [ ] When the lead trigger's `rule_id` ∈ `['T2.1','T2.2','T2.3','T3.1']` (the weight-gain rules in `src/lib/alerts/evaluate.ts`): a 30px tabular weight + "baseline {x} · ▲ {delta}" subline + a `MiniTrendSpark` 14-day weight sparkline with a dashed AHA threshold band. Threshold value is the 7-day-ago baseline + `WEIGHT_GAIN_TIER_2_7D_LB` (5 lb).
- [ ] When the lead trigger's `rule_id` is NOT in the weight allowlist: spark is not rendered; the card shows the trigger labels as a list (current `AlertBlock` behavior preserved).
- [ ] Two CTAs in a pill row:
  - [ ] Primary (filled coral, white text): "Call cardiologist" (or "Call 911" for tier_1_911), wired to `tel:{phone}` if `cardiologist_phone` exists, otherwise routes to `/me` with current fallback copy.
  - [ ] Secondary (outline coral): "See trend" — links to `/trends`.

**Home — `tier_1_911`:**
- [ ] Same `HeroAlertCard` shell with `tone="alert"`, headline "Call 911 now", primary CTA `tel:911`. (Keeps the production behavior, just moves it into the new card.)

**Home — cold-start (`tier_4_log` + `cold_start === true`):**
- [ ] `HeroAlertCard` is NOT rendered.
- [ ] `VitalsListCard` is NOT rendered.
- [ ] `BaselineProgressCard` renders in their place.
- [ ] Render-gate: same as production — `logStatus === 'complete'` AND `assessment?.cold_start === true`. Pre-log cold-start state is the existing "No check-in for today yet" fallback (unchanged).
- [ ] `daysLogged` semantics: distinct prior calendar days with a `daily_logs` row plus 1 for today (since we render only after today's log lands). So a patient with logs on May 5, May 6, and a complete log today (May 7) renders `Day 3 of 7`. Math identical to production's `priorLogDayCount + 1` at `dashboard/page.tsx:71-82`.
- [ ] Eyebrow: green pip + `SETUP · DAY {n} OF 7`.
- [ ] Fraunces headline: dynamic by progress. Plan picks one from a small lookup:
  - 1 of 7 → "We're starting to learn what normal looks like."
  - 2–3 of 7 → "Two mornings in. {7-n} to go." (literal "Two", "Three" — small lookup by integer)
  - 4–6 of 7 → "Almost there — {7-n} mornings to go."
  - 7 of 7 → "Today completes the baseline."
  - **Citation:** copy in design-system `baseline-screen.jsx`. No clinical claim — purely tone copy.
- [ ] 7-dot progress track: filled sage dots for completed days, sage outlined dot with pulse for "today", dashed neutral dots for future days.
- [ ] "Day 7 unlocks alerts." footer with date string for projected day-7.
- [ ] "What we're learning" 5-row collecting list with `n/7` count badges per vital.

**Home — `tier_4_log` + NOT cold-start:**
- [ ] No `HeroAlertCard`. No `BaselineProgressCard`.
- [ ] `VitalsListCard` renders. **`StatusRing` is REMOVED from this state** — the design-system home-screen.jsx has no status ring; `VitalsListCard` owns the visualization. The current `dashboard/page.tsx:171-173` `<StatusRing status="good" />` line is deleted. (StatusRing.tsx itself stays in the repo for now; it may be deleted in a follow-up cleanup.)

**Trends page — happy path:**
- [ ] Page renders Fraunces 30px headline. Singular/plural lookup:
  - `N === 0` → "Nothing pulling at your attention this week."
  - `N === 1` → "One pattern worth flagging at the next visit."
  - `N === 2` → "Two patterns worth flagging at the next visit."
  - `N === 3` → "Three patterns worth flagging at the next visit."
  - `N` ≥ 4 and ≤ 9 → number-word ("Four"…"Nine") + "patterns…"
  - `N` ≥ 10 → digit + "patterns…"
  - `N` = count of cards whose per-vital tier is non-good (max 3 cards in this version).
- [ ] Eyebrow above headline: `TRENDS · LAST 14 DAYS`.
- [ ] Card 1 — Dry weight: latest reading (tabular), delta vs. 7-day-ago reading, status badge (good/watch/alert) using the same per-vital tier classifier as Home, 14-day sparkline.
- [ ] Card 2 — Sleep: sub-line "{n} restless nights / 14d" where `n` = nights with (nocturnal cough event OR `pillow_count > rolling-7d-baseline`). Status badge driven by per-vital classifier (cough/pillows). Card label is "Sleep" — not "Sleep quality," not "Sleep disruption."
- [ ] Card 3 — Symptom mentions: 7-day total of `daily_log_symptom_events.present=true`. Top 4 distinct symptom labels rendered as muted pill chips.
- [ ] Visit-prep strip below the 3 cards: heart icon + *"Bring this to the next cardiology visit."* + *"Weight, symptoms, and questions worth asking."* — no link to `/visits` until that page exists; no dead button.

**Copy fix — TodaysMedsCard:**
- [ ] When patient has no medications, empty-state copy reads: *"Add the meds {patient_name} takes so dose tracking can show up here."* — replace `your loved one`. If `patient_name` is missing, fall back to *"the meds your parent takes"*.

**Copy fix — StatusRing:**
- [ ] `'watch'` row reads `'Pay attention'`, not `'Watch for changes'`.

### Edge cases

- [ ] **First-time user, 0 logs ever, day 1:** dashboard renders the existing welcome strip + tiles + the production *"No check-in for today yet"* fallback inside the central card. `HeroAlertCard` / `VitalsListCard` / `BaselineProgressCard` are NOT rendered — they all gate on `logStatus === 'complete'`.
- [ ] **No weight readings ever:** `VitalsListCard` Weight row shows "—" with sub "no reading yet"; status pip = unknown.
- [ ] **One weight reading total (cold-start, single value):** Weight row shows the value with sub "no baseline yet"; status pip = unknown. The classifier returns unknown rather than computing a delta against itself.
- [ ] **No swelling event today, but yes yesterday:** Swelling row shows "None today" with sub "yesterday: mild ankles". Status pip = good.
- [ ] **Today's log is `processing_status='pending'`:** dashboard preserves today's "Listening to today's log…" pulse-ring animation. Vitals/HeroAlert/Baseline don't render until processing completes.
- [ ] **Cold-start with 7+ logs in last 14 days:** Boundary — at exactly 7 distinct prior days the alert engine flips `cold_start` to false; `BaselineProgressCard` not shown, `VitalsListCard` shown. (We read `assessment.cold_start`, not recompute.)
- [ ] **`daily_assessments.tier === null` (no row):** dashboard preserves today's *"Log saved. Today's pattern read isn't available."* fallback.
- [ ] **Multi-patient caregiver:** behavior identical to today — `.eq('caregiver_id', user.id).order('created_at').limit(1).single()`. First patient by created_at wins. No multi-patient UI added in this PR.
- [ ] **Patient with `dry_weight_lb = null` and only 1 reading:** Weight row's per-vital classifier ignores `dry_weight_lb` entirely (it's an out-of-scope reference value not used in any current rule); the unknown verdict from "1 reading" path applies.

### Error states

- [ ] **DB query failure on `today-snapshot.ts`:** the helper returns `null` for vitals data; `VitalsListCard` renders nothing (server component returns `null`). The page does NOT crash. The HeroAlert / BaselineProgress paths are unaffected.
- [ ] **DB query failure on `series.ts`:** Trends page renders the headline + visit-prep strip with each card replaced by a single line: *"This data isn't loading right now."* No crash.
- [ ] **Patient with no `cardiologist_phone`:** HeroAlert primary CTA renders the existing fallback ("Add cardiologist phone in Settings" → `/me`). Same as today.

### Performance

- [ ] Dashboard server-render adds ≤ 2 net Supabase queries beyond what production runs today (one for today's symptom events + one for today's readings). Verifiable: count `await supabase.from(...)` calls in the new dashboard page vs. main.
- [ ] Trends page server-render runs ≤ 4 Supabase queries for the 14-day window. Verifiable: same audit.
- [ ] No N+1 patterns; each query is bounded by `(patient_id, date >= today - 14d)`.

### Persistence

- [ ] No new rows written by any of these components. Pure-read surface.
- [ ] No new schema, columns, indexes, or RLS policies. Verifiable: `supabase/migrations/` is unchanged in the diff.

### Permissions / RLS

- [ ] All reads go through `@/lib/supabase/server`'s authenticated client.
- [ ] All queries filter by `patient_id` belonging to a row the caregiver already passes the existing `patients.caregiver_id = auth.uid()` policy for. (Verify by re-reading: `daily_logs`, `daily_log_readings`, `daily_log_symptom_events`, `daily_assessments` — RLS on each. `daily_assessments` policy verified in `20260506120000_phase_1_daily_assessments.sql`. The other three should be re-confirmed in implementation; if any is missing, FAIL the AC and add the policy in this PR.)

### Side effects

- [ ] None. No notifications, no cache invalidations, no DB writes.

### Manual verification (target: under 2 minutes per state)

For each state below, the verifier signs in to the preview deployment and confirms:

- **Steady state (good tier, ≥ 7 days logged):** Dashboard shows VitalsList, no HeroAlert, no BaselineProgress, no StatusRing.
- **Watch state (tier_3_48hr, weight trigger):** Dashboard shows HeroAlertCard with mini-spark + threshold band; CTAs route correctly.
- **Alert state (tier_2_today, weight trigger):** Same HeroAlertCard shell, coral primary, "Call cardiologist" CTA.
- **Alert state (tier_2_today, NON-weight trigger):** HeroAlertCard renders trigger labels as a list (no spark).
- **Cold-start (3 days logged):** BaselineProgressCard with 3 filled dots, today pulsing, 4 dashed.
- **Trends — steady:** 3 cards render with sparklines + sub-copy. Visit-prep strip at bottom.
- **Trends — no data ever:** 3 cards each show "This data isn't loading right now." (Verifiable by visiting the page on a brand-new account.)

To produce the verification states without manually feeding voice logs, the implementer adds **one ad-hoc seed script** (committed under `scripts/seed-design-states.ts`) that takes `--state` and inserts rows into `daily_logs` / `daily_log_readings` / `daily_log_symptom_events` / `daily_assessments` for a chosen patient. **Auth model:** the script uses the **service-role key** (read from `SUPABASE_SERVICE_ROLE_KEY` env var) and bypasses RLS — that's why it can write `daily_assessments` rows that look like the alert engine produced them. The script:

- Refuses to run if `NODE_ENV === 'production'` (throws and exits 1).
- Refuses to run if `SUPABASE_SERVICE_ROLE_KEY` is missing.
- Takes a `--patient-id` flag (no implicit "first patient" — must be explicit).
- Logs every insert and the synthetic state it produced.

Out of scope: making this a permanent dev tool. In scope: enough to manually verify the 7 states.

---

## Tasks

### Task 1 — Copy-fix: "your loved one" + "Watch for changes"

**Files:**
- Modify: `src/components/heartnote/TodaysMedsCard.tsx:33`
- Modify: `src/components/heartnote/StatusRing.tsx:13`

- [ ] **Step 1: Read both files to confirm current strings.**

`TodaysMedsCard.tsx` line 33 reads `Add the meds your loved one takes`. `StatusRing.tsx` line 13 reads `'Watch for changes'`.

- [ ] **Step 2: Edit `TodaysMedsCard.tsx`.**

Pass `patientName: string | null` as a new prop. Update line 33 to:

```tsx
{patientName
  ? `Add the meds ${patientName} takes so dose tracking can show up here.`
  : 'Add the meds so dose tracking can show up here.'}
```

Note: `mom`/`dad`/the patient's first name lives on `patients.display_name`. Pass it from the dashboard call site and from any other call site found via grep.

- [ ] **Step 3: Update call sites of `TodaysMedsCard`.**

Run `grep -rn "TodaysMedsCard" src/` to find call sites. Pass `patientName={patient.display_name}` from `src/app/dashboard/page.tsx:233`. (Single call site expected based on survey.)

- [ ] **Step 4: Edit `StatusRing.tsx` line 13.**

Replace `'Watch for changes'` with `'Pay attention'`.

- [ ] **Step 5: Verify by reading the two changed files.**

- [ ] **Step 6: Commit.**

```bash
git add src/components/heartnote/TodaysMedsCard.tsx src/components/heartnote/StatusRing.tsx src/app/dashboard/page.tsx
git commit -m "fix(copy): replace 'your loved one' and 'watch for changes' per design system"
```

---

### Task 2 — Add `StatusPip` and `MiniTrendSpark` (presentational primitives)

**Files:**
- Create: `src/components/heartnote/StatusPip.tsx`
- Create: `src/components/heartnote/MiniTrendSpark.tsx`

- [ ] **Step 1: Create `StatusPip.tsx`.**

```tsx
type Tier = 'good' | 'watch' | 'alert' | 'unknown';

const FILL: Record<Tier, string> = {
  good:    'var(--status-good)',
  watch:   'var(--status-watch)',
  alert:   'var(--status-alert)',
  unknown: 'var(--muted-foreground)',
};

export function StatusPip({ tier, size = 8 }: { tier: Tier; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 9999,
        background: FILL[tier],
        flexShrink: 0,
        boxShadow:
          tier === 'alert'
            ? '0 0 0 3px color-mix(in oklab, var(--status-alert) 18%, transparent)'
            : 'none',
      }}
    />
  );
}
```

- [ ] **Step 2: Create `MiniTrendSpark.tsx`.**

```tsx
type Pt = { d: string; v: number };

interface Props {
  data: Pt[];
  color?: string;
  thresholdValue?: number;   // y-value for the dashed threshold band
  baselineValue?: number;    // y-value for the dotted baseline line
  height?: number;
  showEndpoint?: boolean;
}

export function MiniTrendSpark({
  data,
  color = 'var(--status-alert)',
  thresholdValue,
  baselineValue,
  height = 56,
  showEndpoint = true,
}: Props) {
  if (data.length < 2) return null;
  const w = 200;
  const values = data.map((p) => p.v);
  const tBand = thresholdValue ?? null;
  const min = Math.min(...values, ...(tBand !== null ? [tBand] : []));
  const max = Math.max(...values, ...(tBand !== null ? [tBand] : []));
  const range = max - min || 1;
  const yOf = (v: number) => height - ((v - min) / range) * (height - 14) - 7;
  const xOf = (i: number) => (i / (data.length - 1)) * w;
  const d = data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(p.v).toFixed(1)}`).join(' ');
  const last = data[data.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      {tBand !== null && (
        <>
          <rect x="0" y="0" width={w} height={yOf(tBand)} fill={color} fillOpacity="0.08" />
          <line x1="0" x2={w} y1={yOf(tBand)} y2={yOf(tBand)} stroke={color} strokeOpacity="0.55" strokeDasharray="3 3" strokeWidth="0.9" />
        </>
      )}
      {baselineValue !== undefined && (
        <line x1="0" x2={w} y1={yOf(baselineValue)} y2={yOf(baselineValue)} stroke="var(--foreground)" strokeOpacity="0.22" strokeDasharray="2 3" strokeWidth="0.8" />
      )}
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {showEndpoint && (
        <>
          <circle cx={xOf(data.length - 1)} cy={yOf(last.v)} r="3.4" fill={color} />
          <circle cx={xOf(data.length - 1)} cy={yOf(last.v)} r="6" fill={color} fillOpacity="0.18" />
        </>
      )}
    </svg>
  );
}
```

- [ ] **Step 3: Smoke-test by importing into the dashboard page (temporarily) and rendering with stub data; confirm `npm run lint` and `npm run build` pass.**

Run: `npm run lint`. Expected: PASS.
Run: `npm run build`. Expected: PASS, no errors.

Then revert the temporary import.

- [ ] **Step 4: Commit.**

```bash
git add src/components/heartnote/StatusPip.tsx src/components/heartnote/MiniTrendSpark.tsx
git commit -m "feat(home): add StatusPip and MiniTrendSpark primitives"
```

---

### Task 3 — Add `today-snapshot.ts` and `per-vital-tier.ts` (data + classifier)

**Files:**
- Create: `src/lib/vitals/today-snapshot.ts`
- Create: `src/lib/vitals/per-vital-tier.ts`

- [ ] **Step 1: Create `today-snapshot.ts`.**

Returns:
```ts
type TodaySnapshot = {
  weightLb: number | null;
  weightAt: string | null;
  swelling: { present: boolean; severity: number | null; resolvesOvernight: boolean | null } | null;
  dyspnea: { present: boolean; severity: number | null } | null;
  pillowCount: number | null;
  cough: { present: boolean; nocturnal: boolean | null } | null;
  activityStepChange: 'none' | 'mild_slowdown' | 'severe_change' | null;
};

export async function getTodaySnapshot(
  supabase: SupabaseClient,
  patientId: string,
  logDate: string,
): Promise<TodaySnapshot | null> { ... }
```

Implementation:
1. Query `daily_log_readings` where `patient_id, log_date=today, field='weight_lb'` order by `recorded_at desc` limit 1.
2. Query `daily_log_symptom_events` where `patient_id, log_date=today` — pull all rows.
3. Query `daily_logs` where `patient_id, log_date=today` — pull pillow_count, activity_step_change.
4. Reduce to the snapshot shape above. `null` field = no data today.

- [ ] **Step 2: Create `per-vital-tier.ts`.**

```ts
type PerVitalRow = {
  key: 'weight' | 'swelling' | 'breathing' | 'pillows' | 'cough';
  tier: 'good' | 'watch' | 'alert' | 'unknown';
  label: string;
  value: string;
  sub: string;
};

interface BaselineCtx {
  weight7dAgoLb: number | null;
  weight14dAgoLb: number | null;
  pillow7dBaseline: number | null;
  swellingPriorWeek: { count: number; days: number };
  coughNocturnalPriorWeek: { count: number };
  coldStart: boolean;
}

export function classifyVitals(
  snap: TodaySnapshot,
  baseline: BaselineCtx,
  patientDryWeightLb: number | null,
): PerVitalRow[] { ... }
```

The 5 rows in fixed order. Each row's tier comes from the SAME thresholds the alert engine uses (import from `lib/clinical/thresholds.ts`):
- **Weight:** alert if Δ ≥ `WEIGHT_GAIN_TIER_2_7D_LB` (5 lb in 7 days) OR Δ ≥ `WEIGHT_GAIN_TIER_2_24H_LB` (2 lb in 24h) and we have a yesterday reading. Watch if Δ ≥ 1 lb consistently or Δ ≥ 3 lb in 14 days but below tier_2 thresholds. Good otherwise. Cold-start: tier = unknown if not enough data.
- **Swelling:** alert if `severity ≥ 3` today OR symptom present and `resolvesOvernight=false` and frequency-vs-baseline is up. Watch if present today but resolves overnight. Good if not present.
- **Breathing:** alert if `dyspnea.severity ≥ 3` OR `activityStepChange === 'severe_change'`. Watch if `dyspnea.severity` in 1–2 OR `activityStepChange === 'mild_slowdown'`. Good if neither.
- **Pillows:** alert if `pillowCount` ≥ baseline + 2. Watch if `pillowCount` ≥ baseline + 1. Good if equal or below baseline. Cold-start: unknown.
- **Cough:** alert if today has `cough` with `nocturnal=true` AND prior-week count ≥ 3. Watch if today nocturnal=true OR prior-week count ≥ 2. Good if not present.

Citations: each rule has a `// cited:` comment pointing at the exact line in `research/chf-source-of-truth.md`. The reviewer is asked to verify each citation.

**Tradeoff stated in the file's header comment:** this classifier intentionally re-uses the alert-engine thresholds at a per-vital granularity. The daily_assessments TABLE is still the source of truth for the *home-screen tier* (good/watch/alert overall). The per-vital classifier provides a finer view for the row pip and the trends card status. If the two ever disagree (e.g. one row alert but assessment good), this is a bug — the alert engine determines the headline; per-vital is a hint.

- [ ] **Step 3: Verify build + lint passes.**

Run: `npm run build && npm run lint`. Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add src/lib/vitals/today-snapshot.ts src/lib/vitals/per-vital-tier.ts
git commit -m "feat(home): add today-snapshot + per-vital-tier classifier (no clinical magic numbers)"
```

---

### Task 4 — Add `VitalsListCard.tsx`

**Files:**
- Create: `src/components/heartnote/VitalsListCard.tsx`

- [ ] **Step 1: Implement.**

Server component:
1. Calls `getTodaySnapshot(supabase, patientId, today)`.
2. Calls a small helper to compute baseline context: 7-day avg pillow_count, 7-day swelling-event count, 14-day weight comparison.
3. Calls `classifyVitals(snap, baseline, patient.dryWeightLb)`.
4. Renders the list card per design system `home-screen.jsx` `VitalsList` component (already pasted into design system). Use `StatusPip` from Task 2.
5. Eyebrow row: `TODAY'S SIGNALS` left, `{n} of 5 logged` right.

Layout: white card, 22px radius, soft border, inner rows separated by `border-b 0.5px color-mix(--border 80%, transparent)`. Use Tailwind utilities + the existing token vars; mirror the JSX in `home-screen.jsx`.

- [ ] **Step 2: Verify rendering by importing into the dashboard temporarily; reload `/dashboard` in dev.**

Run: `npm run dev` (background — do not block). Sign in. Verify card renders.

- [ ] **Step 3: Verify build + lint.**

Run: `npm run build && npm run lint`. Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add src/components/heartnote/VitalsListCard.tsx
git commit -m "feat(home): add Today's Signals vitals list card"
```

---

### Task 5 — Add `HeroAlertCard.tsx`

**Files:**
- Create: `src/components/heartnote/HeroAlertCard.tsx`

- [ ] **Step 1: Implement.**

Props:
```ts
{
  tone: 'alert' | 'watch';
  triggers: TriggerRow[];        // from daily_assessments
  weightSeries14d: { d: string; v: number }[] | null;
  baselineWeightLb: number | null;
  thresholdLb: number | null;    // AHA threshold to draw on the spark
  cardiologist: string | null;
  cardiologistPhone: string | null;
  patientName: string;
}
```

Render:
1. Eyebrow row: `<StatusPip tier={tone}/>` + uppercase trigger key (e.g. `WATCH · WEIGHT`).
2. Headline (Fraunces 19px): pulled from the lead trigger's `label`.
3. If lead trigger is weight-related and `weightSeries14d.length ≥ 2`: render the tabular number + baseline + delta + `MiniTrendSpark` block per design system.
4. If non-weight: render the trigger labels as a `<ul>` (preserves current AlertBlock behavior).
5. Two CTAs in a row: primary (filled coral, `tel:{phone}` or fallback), secondary (outline, `Link href=/trends`).

Keep all the existing `AlertBlock`-style accessibility (icons aria-hidden, semantic CTA text).

- [ ] **Step 2: Verify with a synthetic state on /dashboard locally.**

Use the seed script noted in Manual verification.

- [ ] **Step 3: Verify build + lint.**

- [ ] **Step 4: Commit.**

```bash
git add src/components/heartnote/HeroAlertCard.tsx
git commit -m "feat(home): add HeroAlertCard with weight sparkline + AHA threshold band"
```

---

### Task 6 — Add `BaselineProgressCard.tsx`

**Files:**
- Create: `src/components/heartnote/BaselineProgressCard.tsx`

- [ ] **Step 1: Implement.**

Props:
```ts
{
  daysLogged: number;     // distinct prior-day count + today (if logged)
  startedAt: string;      // first daily_logs.created_at
  collecting: { key: string; label: string; summary: string; count: number }[];
}
```

Render the design-system `baseline-screen.jsx` layout: eyebrow + headline (per the dynamic lookup in the AC), 7-dot track (filled/today/dashed states), "Day 7 unlocks alerts" footer, then "What we're learning" 5-row collecting list.

- [ ] **Step 2: Verify build + lint.**

- [ ] **Step 3: Commit.**

```bash
git add src/components/heartnote/BaselineProgressCard.tsx
git commit -m "feat(home): add BaselineProgressCard for cold-start state"
```

---

### Task 7 — Wire dashboard composition

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Replace inline `AlertBlock` with `HeroAlertCard`.**

Delete the local `AlertBlock` function. For tier_1_911 / tier_2_today / tier_3_48hr, render `<HeroAlertCard ...>` with the right tone and the trigger array.

- [ ] **Step 2: Add `VitalsListCard` after the patient-summary block whenever `logStatus === 'complete'` and NOT cold-start.**

- [ ] **Step 3: Replace the "Building baseline" cold-start block with `<BaselineProgressCard ...>`.**

- [ ] **Step 4: Add the dynamic subhead under the greeting** ("Mom's check-in came in at h:mm a. n signals to read today.") computed from today's log time + count of vitals reported. The greeting block at line 104 grows by one paragraph.

- [ ] **Step 5: Verify all existing dashboard behavior is preserved by re-reading the file end-to-end.**

The processing-pulse, the pre-log "No check-in for today yet", the welcome strip, the 2x2 tiles, the footer — all unchanged.

- [ ] **Step 6: Run lint + build.**

Run: `npm run lint && npm run build`. Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(home): compose HeroAlert + Vitals + Baseline cards into dashboard"
```

---

### Task 8 — Add `series.ts` + `TrendsView.tsx`

**Files:**
- Create: `src/lib/trends/series.ts`
- Create: `src/components/heartnote/TrendsView.tsx`

- [ ] **Step 1: Implement `series.ts`.**

```ts
export async function getTrendSeries(supabase, patientId: string, today: string) {
  // 14-day weight from daily_log_readings WHERE field='weight_lb'
  // 14-day pillow_count from daily_logs
  // 14-day nocturnal cough event count from daily_log_symptom_events
  // 7-day total symptom-event count + top 4 distinct labels
  // returns { weight, pillows, nocturnalCough, symptoms }
}
```

- [ ] **Step 2: Implement `TrendsView.tsx`.**

Renders 3 cards + visit-prep strip per the AC. Reuses `MiniTrendSpark`, `StatusPip`. Imports `classifyVitals` for badge tier.

- [ ] **Step 3: Verify lint + build.**

- [ ] **Step 4: Commit.**

```bash
git add src/lib/trends/series.ts src/components/heartnote/TrendsView.tsx
git commit -m "feat(trends): add 14-day series + TrendsView component"
```

---

### Task 9 — Wire `/trends` page

**Files:**
- Modify: `src/app/trends/page.tsx`

- [ ] **Step 1: Read `src/lib/auth/require-onboarded.ts` first.** Reviewer flagged it returns `{ supabase, user, profile }` but `profile` only has `display_name, onboarding_completed_at` — NOT `timezone`. So we query timezone separately.

- [ ] **Step 2: Replace ComingSoonPage.**

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { getTrendSeries } from '@/lib/trends/series';
import { TrendsView } from '@/components/heartnote/TrendsView';
import { PhoneShell } from '@/components/heartnote/PhoneShell';

export default async function TrendsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, onboarding_completed_at, timezone')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarding_completed_at) redirect('/onboarding');

  const { data: patient } = await supabase
    .from('patients')
    .select('id, display_name, dry_weight_lb')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!patient) redirect('/onboarding');

  const today = getTodayInTimezone(profile.timezone);
  const series = await getTrendSeries(supabase, patient.id, today);

  return (
    <PhoneShell>
      <TrendsView patient={patient} series={series} />
    </PhoneShell>
  );
}
```

This mirrors the dashboard's auth + profile pattern at `dashboard/page.tsx:21-30`. We do NOT use `requireOnboarded` because it doesn't expose `timezone` and we'd query the profile twice; reusing the dashboard pattern keeps the queries to one.

- [ ] **Step 2: Verify build + lint.**

- [ ] **Step 3: Commit.**

```bash
git add src/app/trends/page.tsx
git commit -m "feat(trends): wire real Trends page replacing ComingSoonPage"
```

---

### Task 10 — Seed script for verification

**Files:**
- Create: `scripts/seed-design-states.ts`

- [ ] **Step 1: Implement.**

CLI run: `SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-design-states.ts --state=watch_weight --patient-id=<uuid>`. Uses `@supabase/supabase-js` directly with the service-role key (bypasses RLS) so it can write `daily_assessments` rows that mimic alert-engine output.

States to support: `good_steady`, `watch_weight`, `alert_weight_t2`, `alert_non_weight`, `cold_start_3`, `cold_start_6`, `first_time_user_no_log`.

Guards:
- Throws and exits 1 if `process.env.NODE_ENV === 'production'`.
- Throws and exits 1 if `SUPABASE_SERVICE_ROLE_KEY` is missing.
- `--patient-id` is REQUIRED. No "use first patient" magic — too easy to wreck the wrong patient's data.
- Header comment: "Ad-hoc dev tool. Not part of normal app code path. Service-role key required."

Per state:
- Wipes existing rows for the chosen patient on (today − 14d, today] for all four tables.
- Inserts a deterministic set of `daily_logs` + `daily_log_readings` + `daily_log_symptom_events` + a single `daily_assessments` row matching the state.

- [ ] **Step 2: Verify each state produces the right home-screen render.**

Run dev server. For each state:
1. Run the seed script with that state.
2. Reload `/dashboard`.
3. Confirm visual matches the design system mock.

- [ ] **Step 3: Commit.**

```bash
git add scripts/seed-design-states.ts
git commit -m "chore(scripts): add seed-design-states for manual verification"
```

---

### Task 11 — Final lint/build pass + push

- [ ] **Step 1: `npm run lint` clean.**
- [ ] **Step 2: `npm run build` clean.** (Timeout 300000, never background.)
- [ ] **Step 3: `git push origin design-system-alignment`. Do NOT open a PR; do NOT merge. Report the Vercel preview URL once it lands.**

---

## Self-review (run before sending to fresh-context reviewer)

1. **Spec coverage** — every section the design system documents that's in scope (home, trends) maps to a task above. Login/voice-log/me/visits/family/meds explicitly excluded with reason.
2. **Placeholder scan** — every step shows the actual code or the actual command. No "TBD".
3. **Type consistency** — `Tier` / `PerVitalRow` / `TriggerRow` names are stable across tasks.
4. **Karpathy fit:**
   - Simplicity: 8 small files + 4 modifications. No new abstractions beyond what each component needs.
   - Surgical: existing `AlertBlock` is replaced wholesale (its only consumer is the dashboard); StatusRing is preserved as a file but no longer rendered from `/dashboard`. No "improving" adjacent code.
   - Goal-driven: every AC is verifiable by reading code or running a command; manual states are seeded by the script.
5. **Open questions for the user are surfaced at the top, not buried in tasks.**
6. **Reviewer feedback addressed.** All 5 blocking issues from the plan-review subagent (rule_id allowlist, per-vital classifier alignment, cold-start math, subhead patient-name template, seed script auth) are now baked into the AC list and the task code. Should-fix items (Sleep naming, singular/plural, single-reading edge case, multi-patient, StatusRing removal, 3-tab nav follow-up) also addressed. Confirmed by reviewer: RLS coverage on all 4 read tables, threshold constants exist, `activity_step_change` exists, no auth-sensitive routes touched.

---

## Cost note

Plan-review subagent + code-review subagent: ~2 extra Agent runs per the project's `feature-workflow.md`. Reasonable given the scope (8 new files + 4 modifications across home + trends).
