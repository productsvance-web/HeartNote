# Baseline progress card — edge-case verification (fully fleshed)

> The user's challenge: "if someone has 2/7 done, then doesn't log for 20 days, what shows?" — and "are we having any reviewers test the logic behind what the actual things are doing?" The answer is: I shipped the BaselineProgressCard with a 14-day rolling window assumption, and I haven't walked the edge cases on real data. This plan is the verification pass.

## What "baseline progress" is

Days 1–7 of a patient's HeartNote life are the "baseline window" — the engine doesn't fire alerts until 7 distinct logged days exist (cold-start contract per `research/chf-source-of-truth.md`). The **BaselineProgressCard** on the home screen visualizes those 7 days as a 7-dot track plus a "What we're learning" 5-row list. The card is the cold-start home — it replaces the alert/vitals card stack.

The card's data:
- `loggedDates: string[]` — distinct ISO dates the patient has logged on, **within the last 14 calendar days** (queried by `getBaselineWindow` in `src/app/dashboard/page.tsx`).
- `today: string` — caregiver-TZ ISO date.
- `startedAt: string` — patient's first-ever logged date (or today if none).
- `collecting: { key, label, summary, count }[]` — 5 vitals with their last-7-day reporting count.

The branch enters when `inColdStart === true`, decided by:
```ts
const inColdStart = patient !== null && (
  coldStart === true ||
  (assessment === null && priorLogDays.length < 7)
);
```

Where `coldStart` is from today's `daily_assessments` row and `priorLogDays` is the in-window logged dates.

## The edge cases — each must be walked on real seed data

### Case 1: 0 logs ever, account just created today

**Seed:** create a fresh test caregiver + patient. Don't dictate anything.

**Expected card render:**
- Eyebrow: "Setup · day 1 of 7"
- Footer left of progress: "started {today's pretty date}"
- Track: 7 dots, position 1 = today (pulse outline), positions 2–7 dashed-future
- Headline ("Building baseline"): "We're starting to learn what normal looks like."
- Footer count: "7 more mornings to go."
- Collecting list: 5 rows with `count = 0`, summary "no readings yet" / "not reported yet" depending on row.

**Verify:** screenshot the card, confirm zero false-green dots.

### Case 2: Logged today only

**Seed:** dictate one voice log today, full processing complete.

**Expected:**
- Eyebrow: "Setup · day 1 of 7"
- Track: position 1 = today (filled sage-check); positions 2–7 dashed-future
- Headline: "We're starting to learn what normal looks like." (1 day banked)
- Footer: "6 more mornings to go."
- Collecting list: rows reflect what was dictated (e.g., weight count = 1, swelling count = 1 if mentioned).

**Verify:** the today dot is filled, not pulsing. Pulsing is reserved for "today, not yet logged."

### Case 3: 2 logs in last 14 days, today is day 14, today not logged yet

**Seed:** insert daily_logs rows for `today - 13` and `today - 10`, both with `processing_status = 'complete'`. Don't log today.

**Expected:**
- Eyebrow: "Setup · day 3 of 7"
- Track: dot 1 = `today - 13` (filled), dot 2 = `today - 10` (filled), dot 3 = today (pulse), dots 4–7 dashed-future with date projections (today+1 ... today+4).
- Headline: "Two mornings in. Five to go."
- Footer: "5 more mornings to go."
- Collecting list: counts based on what was reported across the two banked days.

### Case 4: 2 logs ever, both 20+ days ago, today not logged

**Seed:** insert daily_logs rows for `today - 22` and `today - 21`. Both outside the 14-day window.

**Expected — and this is the case the user explicitly asked about:**
- `getBaselineWindow` queries `daily_logs` with `gte('log_date', today - 14)`. Old rows are outside the window, so `loggedDates = []`.
- `priorLogDays = []`. Card receives 0 banked.
- Eyebrow: "Setup · day 1 of 7" (the bank effectively reset)
- Track: position 1 = today (pulse); positions 2–7 dashed.
- Headline: "We're starting to learn what normal looks like."
- Footer: "started {today - 22 pretty date}" — `startedAt` reads the very first log ever, ignoring the window. **This is the intentional asymmetry — the eyebrow says "started 22 days ago" but the bank says "0 banked."**
- Collecting list: counts in the last 7 days = 0 across the board.

**The user's concern was likely:** "would those May 1 / May 2 dots stay green-checked forever, falsely showing progress that's stale?" Answer: NO — they roll out of the window after 14 days and the card resets to 0 banked.

**Open design question to surface:** is the asymmetric "started May 1, 0 banked" reading confusing? Two options to consider:
- (a) Keep as-is: technically accurate, "started" is a permanent fact about the patient's first log, "banked" is the current 14-day-window count.
- (b) Bury the "started" line when banked = 0 (i.e., when the user has effectively re-started). Show only "started" once they're banking again.

Recommend (b) for the executing session: when `daysBanked === 0` AND `startedAt !== today`, render the eyebrow as "Setup · day 1 of 7 · restarted today" without the "started {old date}" footer line. Cleaner mental model.

### Case 5: 6 logs in last 14 days, today is the 7th-day candidate, today logged ✅

**Seed:** insert 6 distinct daily_logs in the last 14 days (e.g., today-6 through today-1). Dictate today's log, processing complete.

**Expected:**
- Eyebrow: "Setup · day 7 of 7"
- Track: dots 1-6 filled-sage-check, dot 7 = today (filled, no pulse — banked).
- Headline: "Today completes the baseline." (per `headlineFor(7, 7)`).
- Footer: "Today completes the baseline."
- **And then the cold-start branch should NOT render** anymore — the engine should have written today's `daily_assessments` row with `cold_start = false`, kicking the dashboard into the post-baseline branch (HeroAlert / Vitals path).

**Verify both the visual AND the next page-load.** The same patient on the next dashboard hit (after engine writes the assessment) should render the post-baseline home.

### Case 6: 7 logs across 14 days with gaps

**Seed:** insert daily_logs for today-13, today-11, today-9, today-7, today-5, today-3, today-1. That's 7 distinct dates, all within window.

**Expected:**
- Eyebrow: "Setup · day 8 of 7" — wait, this overshoots. Let me re-read the card logic.

Looking at `BaselineProgressCard`:
```ts
const totalDays = COLD_START_MIN_LOG_DAYS; // 7
const todayLogged = loggedDates.includes(today);
const banked = todayLogged ? loggedDates.slice(0, -1) : loggedDates;
const daysBanked = banked.length;
const todayPosition = Math.min(daysBanked + 1, totalDays);
```

If loggedDates has 7 dates NOT including today, `todayLogged = false`, `banked = loggedDates` (length 7), `daysBanked = 7`, `todayPosition = min(8, 7) = 7`.

So the card shows position 7 as "today" — but slot 7 is also showing one of the banked logs. Conflict.

**This is a real bug.** When the bank already has 7 distinct days, the card's 7-dot track is fully banked. There's no room for "today's pulse" because today is the 8th-day-candidate. The current code clamps todayPosition to 7, which collides with banked[6].

**Fix in the executing session:** if `daysBanked >= totalDays` AND today is not logged, the card shouldn't render at all — the patient is past cold-start; the engine has already exited cold-start. The dashboard branch logic should have moved the patient out of `inColdStart` already. **Verify this by walking case 6 on real data:** is `daily_assessments.cold_start === false` for today? If yes, the cold-start branch isn't entered, and the BaselineProgressCard isn't rendered. So the bug is theoretical.

**But:** there's a subtle case where the assessment hasn't been written yet (engine hasn't run today). The dashboard's fallback heuristic is:
```ts
(assessment === null && priorLogDays.length < 7)
```

If priorLogDays is exactly 7 and no assessment yet, `inColdStart === false` (the user passes the heuristic). Card not rendered. OK.

What if priorLogDays = 8 (user logged a lot, no assessment yet)? Same — heuristic rejects cold-start. Card not rendered. OK.

What if assessment exists with `cold_start === true` but priorLogDays = 7? The first clause (`coldStart === true`) wins; card IS rendered. Then we hit the bug.

**Conclusion:** the bug is a narrow race condition where the engine wrote `cold_start === true` for an old assessment but the patient now has 7 banked days. Possible if seeded data is inconsistent. The right fix: cap the visible track at `min(daysBanked + (todayLogged ? 0 : 1), totalDays)` AND if the cap is hit, surface a "ready to exit cold-start" state explicitly.

Recommend the executing session adds a defensive branch: when `daysBanked >= 7` (regardless of today), render a "Baseline complete." sage-tinted card asking the caregiver to dictate today's log to formally exit cold-start. Don't show the 7-dot track at all in that state.

### Case 7: Logged today twice (multiple dictations same calendar day)

**Seed:** dictate two voice logs today, both `processing_status = 'complete'`.

**Expected:**
- `loggedDates` deduplicates by `log_date` (already does — uses `Set`).
- Card behaves as if logged once today.
- Both dictations remain in the daily_logs table.

**Verify:** the card doesn't double-count today. The 7-dot track shows today once.

### Case 8: Today logged but `processing_status === 'pending'` (mid-recording)

**Seed:** insert a daily_logs row for today with `processing_status = 'pending'`, no transcript.

**Expected per `dashboard/page.tsx`:**
```ts
const logStatus: 'none' | 'processing' | 'complete' =
  !todaysLog || todaysLog.processing_status === 'pending'
    ? 'none' : ...
```
Today is treated as 'none'. `loggedDatesForCard` doesn't include today. So the card shows position N+1 = today as pulse-outline, banked = N from prior days.

**Verify:** today is pulse-outline, NOT a banked check. Pending is "we haven't heard from you yet."

### Case 9: Patient TZ shifts mid-day

**Seed:** patient is `America/Los_Angeles`. The caregiver opens the dashboard at 11:50 PM PST. Then opens it again at 12:10 AM PST (= next calendar day in PST).

**Expected:**
- 11:50 PM open: `today = 2026-05-08`, card shows day's progress for May 8.
- 12:10 AM open (10 min later): `today = 2026-05-09`, card shows day's progress for May 9. May 8's log (if any) is now banked yesterday.

**Verify:** `getTodayInTimezone(profile.timezone)` correctly computes the patient's local date, not server UTC.

### Case 10: Caregiver onboards a patient mid-month, then doesn't open the app for 60 days

**Seed:** patient created 60 days ago, no logs since.

**Expected:**
- `getBaselineWindow` returns `loggedDates = []` (nothing in 14d window).
- `firstQ` returns null (no logs ever in the table).
- `startedAt` falls back to `today`.
- Card shows "started today" with all dots dashed.
- Patient effectively gets a fresh-start framing on re-open.

**Verify:** no false "60 days into baseline" framing.

## Implementation guidance for the executing session

### Seed-data harness

The executing session needs a way to insert canonical seed data per case. Two paths:

1. **A `scripts/seed-baseline-cases.ts` script** that takes a case name (`case-4`, etc.), creates a test caregiver + patient, and inserts the case's daily_logs rows. Drives off `process.env.SUPABASE_SERVICE_ROLE_KEY`. Caveats: only runs locally; test data lingers — the script also takes a `--cleanup` flag.
2. **A Supabase SQL migration in `supabase/migrations/seed-tests/`** that inserts seed rows on a known test-caregiver UUID. Easier for sharing across sessions; harder to clean up.

Recommend (1). Each case = one named function in the script. The session runs the script, opens the preview signed in as the test caregiver, screenshots the card.

### Output

The executing session produces `docs/superpowers/audits/2026-MM-DD-baseline-edge-cases.md` with:
- One section per case
- Real screenshot of the rendered card (saved to `docs/audits/baseline-screenshots/case-N.png`)
- A verdict line: PASS / FAIL / OPEN-DESIGN-QUESTION
- Specific code references for any FAIL

If any case fails:
- Don't fix in the same session unless the fix is a 1–5 line tweak.
- Otherwise, file a separate plan for the fix and link from the audit.

## Acceptance criteria — the audit pass

### Engineering
- [ ] Seed harness committed (or the seed approach explicitly chosen).
- [ ] One PNG per case under `docs/audits/baseline-screenshots/`.
- [ ] Audit doc landed.

### Functional — case verdicts
- [ ] Case 1 (no logs, fresh account): PASS.
- [ ] Case 2 (logged today only): PASS.
- [ ] Case 3 (2 logs, today day 3, today not logged): PASS.
- [ ] Case 4 (2 logs 20 days ago, today silent): expected behavior is bank-reset; verify and document. Surface design question (a vs b above).
- [ ] Case 5 (6 logs + today completes the 7th): PASS, AND verify next page load exits cold-start.
- [ ] Case 6 (7 logs across 14 days with gaps): defensive branch added per the bug analysis above; FAIL becomes PASS after fix.
- [ ] Case 7 (today logged twice): PASS via Set dedup.
- [ ] Case 8 (today pending, no transcript): PASS — today is pulse, not banked.
- [ ] Case 9 (TZ-shift midnight): PASS — verify `getTodayInTimezone` is the date authority everywhere.
- [ ] Case 10 (60-day gap, no logs ever): PASS.

### Edge cases (extra)
- [ ] Patient with NULL `display_name` AND no logs: card still renders, headline "we're learning what normal looks like for them" (existing fallback).

### Performance
- [ ] No new queries added; existing `getBaselineWindow` already loads the data.

### Persistence
- [ ] No schema changes for the audit. (The Case 6 bug fix is a render-only change, no migration.)

### Permissions / RLS
- [ ] All audit reads go through the authenticated server client. RLS confines to caregiver's patients.

### Side effects
- [ ] None. Audit is read-only on production code.

### Manual verification
The screenshots ARE the manual verification. One PNG per case, saved at the documented path.

## Order of operations

1. Build the seed harness OR pick the SQL migration approach. ~30 min.
2. Walk Case 1 → 10 in order. Each case: seed → open preview → screenshot → verdict. ~10 min per case.
3. Write the audit doc with verdicts and screenshots.
4. If any failures land, file follow-up plans (or fix inline if 1–5 lines).

Estimated effort: 1 session.

## What this plan does NOT do

- Does not redesign the BaselineProgressCard's visual layout. That's already shipped.
- Does not add new headline copy beyond what the existing `headlineFor` function returns. New copy belongs in a separate plan.
- Does not change the cold-start exit logic in `evaluate.ts`. The engine's verdict is canonical; this audit verifies the CARD's render against that verdict.
- Does not test the alert engine itself (T1.x / T2.x / T3.x rules) — that's a different verification pass.

## Open question for the user before executing

- Case 4 design choice — recommend option (b) (bury "started {old date}" footer when daysBanked === 0 and startedAt is far in the past). Want a different framing?
