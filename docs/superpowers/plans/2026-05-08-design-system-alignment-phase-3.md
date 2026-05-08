# Design system alignment — Phase 3 plan (visual fidelity pass)

> Continues `2026-05-07-design-system-alignment.md` and `2026-05-08-design-system-alignment-phase-2.md`. The earlier work shipped the structural pieces (3-tab nav, hero alert, vitals list, baseline cold-start, cough heatmap, login, visits, family). This plan closes the visual-fidelity gaps the audit (`2026-05-08-design-system-audit.md`) surfaced.

## Plain-English summary

**Phase 1 — daily-use polish.** The two screens a caregiver opens every morning — home and the voice log — get the visual fidelity the design system specifies. On home: a small avatar bubble with the patient's first initial, an honest "two things changed" subhead instead of "5 signals to read," and a calm sage-tinted "all steady" card on green days so the home screen never feels empty. On `/log`: a quieter Fraunces headline shell ("Tap to log today" / "Tell us about today" / "Listening to today's log…") above the recording UI, and the bottom-nav hides while you're already on the log page so the FAB stops competing with the in-page mic.

**Phase 2 — everywhere-else polish.** Today's-meds rows on the dashboard get the visual signal the design specified: a small icon, the next dose time, "Due in 20m" on the next-up dose, a sage check on completed rows. The Trends headline reads "Two patterns worth flagging at the May 14 visit" when a visit is on the calendar, instead of always saying "the next visit." The onboarding wizard gets a step-counter eyebrow ("STEP 2 OF 4 · WHO YOU'RE CARING FOR") so it sits inside the design system's typographic rhythm.

## What's NOT in this plan (scope decisions made explicit)

- **Medications wizard** (`/me/medications/new`, `/me/medications/[id]`, `/me/medications/scan/*`, `_flow/*`) — restricted by memory `project_medications_wizard_parallel_work.md`. We touch only the *display* layer (`TodaysMedsCard`, `TodaysMedsList`, `/me/medications/page.tsx` row rendering).
- **Voice-log recording state machine** inside `voice-log-client.tsx` — restricted by memory `project_voice_log_redesign.md`. We touch only the page shell, the `PhoneShell` `hideNav` prop on `/log`, and the visual surround (the small eyebrow strip at the top of `voice-log-client.tsx` that pre-dates the new shell — that's scaffolding, not state machine).
- **"I'd rather type today" affordance** — design specifies it; production has no manual-typing destination. Building one creates a half-finished feature (CLAUDE.md rule #9). Out of scope unless the user wants to add manual entry as a real feature in a follow-on.
- **Status-ring centerpiece** — present in `app.css` as design-system reference, but the newer `designs/home-screen.jsx` superseded it with the alert-hero card. The unused CSS in `app.css` is design-system reference, not a production debt. We don't render it.
- **Marketing UI kit** in `ui_kits/marketing/` — pre-launch, no marketing site yet.

## Sizing

Each phase is one long-running session worth of work. Phase 1 is the heavier of the two (4 files modified, 1 created, edge-case walk on every home state including cold-start). Phase 2 is medium (4 modifications, polish-only). Execution: Phase 1 → 50% context check → Phase 2 if budget allows.

---

## Phase 1 — Home + voice-log daily-use polish

### Plain-English: what changes for the caregiver

Home screen, alert/watch state — top-right gets a small sage-tinted bubble with mom's first initial. The subhead under "Good morning" stops saying "5 signals to read today" and starts saying "Two things changed today" — the count is the actual number of vitals the engine flagged, not the count of vitals dictated.

Home screen, all-steady state — instead of the page going silent when nothing's wrong, a small sage-tinted card appears between the headline and the vitals list: "Doing well today." with a one-line summary like "Weight steady · breathing normal · sleeping fine." Same calm tone the alert card uses for trouble. Mom's avatar still in the corner.

Voice log `/log` — the page reads cleanly: "Voice log · day 8" eyebrow, then "Tap to log today" (when no log yet) or "Listening to today's log…" (during dictation) in Fraunces, then a short prose subhead. The mic + transcript + auto-fill grid below stays exactly as it is — the recording flow doesn't change. The bottom nav with the green mic FAB hides while on this page so it doesn't compete with the in-page mic; tapping the back chevron returns the caregiver to home where the FAB is the way forward.

### Files to MODIFY

- `src/app/dashboard/page.tsx`
  - Replace the inline `<header>` JSX with `<HomeHeader>` (new component, see CREATE).
  - Compute `thingsChanged = triggers.length` (already in scope; we already pull `triggers` from `daily_assessments`).
  - Pass `thingsChanged` and patient initial to the new `<HomeHeader>`.
  - Render `<HomeAffirmationCard>` (new component) when `tier === 'tier_5_good' && logStatus === 'complete' && triggers.length === 0` — between the header and the `<VitalsListCard>`.
  - The cold-start branch's header gets the avatar too — same `<HomeHeader>` reused with a different headline prop.

- `src/app/log/page.tsx`
  - Render `<PhoneShell hideNav>` (new prop value).
  - Above `<VoiceLogClient>`, render a server-rendered shell: eyebrow ("Voice log · day {dayN}") + Fraunces 30px headline (state-aware: passes whether a log exists today) + short subhead.
  - Pass an explicit "hasTodayLog" / "isProcessing" prop into the shell helper so the headline reads "Tap to log today" vs "Today's check-in is in." vs "Listening to today's log…". Computed server-side from `todaysLog.processing_status`.

- `src/app/log/voice-log-client.tsx`
  - **Single visual change:** drop the small "Today's check-in / For {patientName}" eyebrow strip at the top (lines 970-976). The page-level shell now owns the eyebrow + headline. Everything below — the Mic-timer-waveform header, transcript card, auto-fill grid, alert chips, more-notes expand, record-another button — stays untouched.
  - This is visual-surround removal, not state-machine work. The state machine starts at the Mic-timer-waveform header (`status` reads, refs, timers).

- `src/components/heartnote/PhoneShell.tsx`
  - Already has `hideNav?: boolean`. No change needed; just used by `/log/page.tsx`.

### Files to CREATE

- `src/components/heartnote/HomeHeader.tsx`
  - Server component. Takes `caregiverName: string`, `patientName: string`, `patientInitial: string`, `headline: ReactNode`, `subhead: ReactNode`, `mode: 'alert' | 'cold-start' | 'good'`.
  - Renders the design's avatar bubble (38×38, sage-tinted background `color-mix(in oklab, var(--sage) 20%, var(--cream))`, sage 35% border, Fraunces 16px initial), the date eyebrow, the Fraunces 26px greeting, and the subhead.
  - One component reused across all three home states; `mode` only affects copy choices, not layout.

- `src/components/heartnote/HomeAffirmationCard.tsx`
  - Server component. Takes `summaryLine: string`.
  - Renders a sage-tinted card (`color-mix(in oklab, var(--sage) 11%, var(--card))` background, sage 28% border, soft sage shadow — same recipe as the cold-start hero card so the visual rhythm carries).
  - Headline: `font-display text-[19px]` "Doing well today."
  - Body: 14px Inter — `summaryLine` ("Weight steady · breathing normal · sleeping fine.").
  - No CTA. The point is calm presence, not action.
  - Summary derived from the snapshot — see Computed values below.

### Computed values

- **`thingsChangedCount`** = `triggers.length` (already pulled in `dashboard/page.tsx` from `daily_assessments.triggers`). Subhead reads:
  - 0 triggers + complete log: drop the count clause entirely. Subhead is just "{name}'s check-in came in at {time}."
  - 1 trigger: "{name}'s check-in came in at {time}. **One thing changed today.**"
  - N>1: "{name}'s check-in came in at {time}. **{N} things changed today.**"

- **`patientInitial`** = `patient.display_name?.trim()[0]?.toUpperCase() ?? '?'`. If `display_name` is null/empty, fall back to `'?'` (rare — onboarding requires a name, but RLS-aware UI doesn't crash).

- **`affirmationSummary`** for `<HomeAffirmationCard>`: pulls from `snapshot` (already loaded for `<VitalsListCard>`) and surfaces the 2-3 vitals with reported readings, joined with `·`. Examples:
  - "Weight 178.2 lb · breathing normal · sleeping fine"
  - "Three signals logged today, all steady"
  - Empty signals (logged but no vitals dictated) → "Today's check-in is in."

### Edge cases — Phase 1

Walked with realistic data:

- **Cold-start, day 1, no logs at all.** Avatar shows. Subhead reads "We're learning what normal looks like for {name}." (existing copy). No "things changed" line. No affirmation card. BaselineProgressCard renders below.
- **Cold-start, day 4, today logged, no triggers.** Avatar shows. Subhead reads "{name}'s check-in came in at 6:42 AM." No "things changed." No affirmation card (cold-start branch doesn't render the affirmation; it has its own progress hero).
- **Post-baseline, today logged, no alerts.** Avatar shows. Subhead reads "{name}'s check-in came in at {time}." Affirmation card renders. VitalsListCard renders below it.
- **Post-baseline, today logged, 2 watch triggers.** Avatar shows. Subhead reads "{name}'s check-in came in at {time}. **Two things changed today.**" HeroAlertCard renders. NO affirmation card (alert and affirmation are mutually exclusive).
- **Post-baseline, today logged, 1 alert trigger.** Avatar shows. Subhead reads "**One thing changed today.**" HeroAlertCard renders.
- **Post-baseline, no log today.** Avatar shows. Subhead reads "{greet}, {caregiver}." (existing — no time clause). The "no check-in yet" card renders below.
- **Post-baseline, log processing.** Avatar shows. Subhead is empty (production already drops the subhead in this state). The "Listening to today's log…" processing card renders.
- **Patient with single-character name (e.g., "K").** Avatar shows "K". No truncation issues.
- **Patient with no display_name (data integrity edge).** Avatar shows "?" — the page doesn't crash. We log this as a sentry breadcrumb? No — keep it simple, just render the fallback.

`/log` shell edge cases:

- **No log today, idle.** Eyebrow: "Voice log · day {N}" where N = distinct logged days in last 14 + 1 (the day-counter the cold-start uses). Headline: "Tap to log today." Subhead: "About 30 seconds is plenty. Sleep, weight, swelling, breath — whatever you noticed."
- **Log exists, complete.** Eyebrow: "Voice log · day {N}". Headline: "Today's check-in is in." Subhead: "Tap the mic to add anything else, or come back tomorrow."
- **Log exists, processing.** Eyebrow: "Voice log · day {N}". Headline: "Listening to today's log…". Subhead: "A few seconds — keep this open."
- **Log exists, error.** Eyebrow same. Headline: "Something went wrong." Subhead: "Tap the mic to try again." (matches existing error copy in voice-log-client.)
- **Recording in progress.** The page-level headline doesn't update during the recording phase (state machine is restricted, can't observe internal `status` from a server component). The Mic-timer-waveform header inside `<VoiceLogClient>` already shows recording state. This is fine — page headline is "Tap to log today" until the user records, then VoiceLogClient takes over the visual lead.
- **Bottom nav hidden.** No way to navigate away except the browser back chevron or a tap on the wordmark (none in current /log shell). **Decision:** add a small back affordance to the shell — chevron-left + "Home" label, top-left, links to `/dashboard`. Matches design's "← Back" in the screens.jsx mock.

### Acceptance criteria — Phase 1

#### Engineering (Karpathy)
- [ ] Plan stated and approved before any code is written.
- [ ] No new abstractions, frameworks, or generic helpers added beyond `<HomeHeader>` and `<HomeAffirmationCard>`.
- [ ] Diff scoped to the listed files. No unrelated formatting changes. No refactoring outside scope.
- [ ] All ACs verifiable by reading specific behavior or running specific commands.

#### Functional — happy path
- [ ] Home, post-baseline, log complete, 0 triggers: avatar bubble renders top-right of header with the patient's first initial sage-tinted; subhead reads "{name}'s check-in came in at {time}." (no count clause); affirmation card renders below header with sage-tinted background and "Doing well today." Fraunces headline.
- [ ] Home, post-baseline, log complete, 1 trigger: subhead reads "{name}'s check-in came in at {time}. One thing changed today." HeroAlertCard renders. Affirmation card does NOT render.
- [ ] Home, post-baseline, log complete, 3 triggers: subhead reads "Three things changed today." HeroAlertCard renders.
- [ ] Home, cold-start: avatar renders. Existing cold-start headline + BaselineProgressCard render unchanged.
- [ ] /log idle, no log today: page renders eyebrow "Voice log · day {N}", Fraunces headline "Tap to log today.", subhead "About 30 seconds is plenty…", below it the existing voice-log-client (without its own eyebrow strip), bottom nav hidden.
- [ ] /log, log complete: eyebrow same; headline "Today's check-in is in."; subhead "Tap the mic to add anything else, or come back tomorrow."
- [ ] /log, log processing: headline "Listening to today's log…".
- [ ] /log, top-left back chevron + "Home" label links to /dashboard.

#### Edge cases
- [ ] Patient `display_name` is null: avatar renders "?". Page doesn't crash.
- [ ] Single-character patient name "K": avatar renders "K".
- [ ] Cold-start, day 4, today not yet logged: subhead does not show the time-of-check-in clause (no log to time-stamp).
- [ ] /log on a brand-new patient (no logs ever): eyebrow "Voice log · day 1", headline "Tap to log today."

#### Error states
- [ ] /log render still works when `getYesterdayLog` returns null (no yesterday log) — yesterday card simply omitted (existing behavior).
- [ ] Avatar render falls back to "?" when patient row missing (rare; onboarding gates this).
- [ ] Affirmation card render is gated on snapshot presence; if `snapshot === null` (no `daily_assessments.triggers` row yet), the card is omitted, not crashed.

#### Performance
- [ ] No new Supabase queries added to `/dashboard` or `/log` page renders. Both already pull what's needed.
- [ ] HomeAffirmationCard server-renders in <5ms (it's a static-ish layout).

#### Persistence
- [ ] No new database writes. Visual-only.

#### Permissions / RLS
- [ ] n/a — no new tables, no new query paths. Existing RLS on `patients`, `daily_assessments`, `daily_logs` continues to enforce.

#### Side effects
- [ ] None. Visual-only diff.

#### Manual verification
1. Open `/dashboard` on an account with `tier === 'tier_5_good'` (or seed one). Verify avatar bubble with initial top-right; subhead drops the "{N} signals" clause; affirmation card with "Doing well today." Fraunces headline appears between header and VitalsListCard.
2. Switch to an account with 1+ alert triggers. Verify subhead reads "One/Two/N thing(s) changed today." HeroAlertCard appears, affirmation card does not.
3. Switch to a brand-new account (cold-start). Verify avatar still renders; baseline progress hero renders unchanged.
4. Open `/log`. Verify eyebrow + Fraunces headline + subhead at top; verify bottom nav is hidden (no FAB visible); verify "← Home" back chevron at top-left links to /dashboard.
5. Record a log on `/log`. After completion, the page-level headline updates to "Today's check-in is in." on next render (refresh or navigate-and-back).
6. `npm run lint` clean. `npm run build` clean.

---

## Phase 2 — everywhere-else polish

### Plain-English: what changes for the caregiver

The dashboard's Today's Meds card stops being a flat list of names + dose-counts. Each row gets a small icon (Pill or Clock), the next dose time, and a status pill — sage check on doses already taken today, butter "Due in 20m" on the next-up dose, nothing on idle rows. Same data, much clearer at a glance.

Trends page headline reads "Two patterns worth flagging at the May 14 visit." when a cardiology visit is on the calendar, instead of always saying "next visit." Caregivers seeing a date have a stronger reason to dictate today.

The onboarding wizard's four steps each get a "STEP 2 OF 4 · WHO YOU'RE CARING FOR" eyebrow above the Fraunces headline, so the wizard sits inside the rest of the app's typographic rhythm instead of feeling like a different app stitched on.

### Files to MODIFY

- `src/app/me/medications/[no, this is the wizard — out of scope]`
- `src/components/heartnote/TodaysMedsCard.tsx` — pass schedule context (next dose time per row) into TodaysMedsList. The lookup is local (`evaluateMedAdherenceForDay` already returns scheduled med rows with the data we need).
- `src/components/heartnote/TodaysMedsList.tsx` — change the `MedRow` rendering: add icon badge (Pill on idle, Clock on due, sage check on complete-day) + time-of-day (next dose's `time_of_day`) + sage soft "due in {N}m" / butter soft "due in {N}m" pill. Don't touch the `Expansion` panel, the `confirmDose` flow, or the slot-mute logic. PRN rows keep simple "{N} today" subline.
- `src/app/trends/page.tsx` — add a query for the next upcoming visit (`cardiology_visits` where `visit_date >= today`, order asc, limit 1). Pass `nextVisit` to TrendsView.
- `src/components/heartnote/TrendsView.tsx` — `headlineForCount(n)` becomes `headlineForCount(n, nextVisit)`: when `nextVisit` is non-null and `n > 0`, headline reads "{N} pattern{s} worth flagging at the {prettyDate} visit." Otherwise current "next visit" copy.
- `src/app/onboarding/wizard.tsx` — `Step` component takes `eyebrow: string` ("STEP 1 OF 4 · ABOUT YOU"). Render eyebrow above the Fraunces headline using design system tokens.

### Files to CREATE

None. All changes fit existing components.

### Computed values

- **Next dose time per scheduled med row.** From `evaluateMedAdherenceForDay` rows: each row's `dose_times` is sorted by ordinal; the "next dose" is the first un-resolved slot whose `time_of_day` is in the future today, or the first slot tomorrow if all today's are resolved. We display this as "8:00 AM" or "6:00 PM."
- **Time-until-next-dose label.** "Due in {N}m" when next dose is within 60 min; "Due at {time}" when it's later today; nothing when the day is complete.

### Edge cases — Phase 2

- **Med with no dose times** (PRN-only): row renders without the time/Due-in chip. Just drug name + "{N} today" subline + Plus icon.
- **All scheduled doses complete:** row shows sage check pill on the right, time line reads "Last dose: {time}".
- **Med is past its scheduled time but not yet logged** (caregiver missed it): row renders with subtle muted-foreground time + a small dot (not coral). We don't auto-fire alerts here; caregivers know.
- **Trends page, no upcoming visit scheduled:** headline keeps the existing "the next visit" wording. No date inserted.
- **Trends page, upcoming visit today:** headline says "the visit today."
- **Onboarding, single-step wizard collapse:** we have 4 steps fixed today. If the wizard ever changes step counts, the eyebrow uses dynamic counts. Hardcoded for now per simplicity.

### Acceptance criteria — Phase 2

#### Engineering (Karpathy)
- [ ] No new abstractions — all changes fit existing components.
- [ ] Diff scoped to the listed files.
- [ ] All ACs verifiable.

#### Functional — happy path
- [ ] TodaysMedsCard, scheduled med, dose due in <60min: row renders Pill or Clock icon (left), drug name (center), "Due at 8:00 AM" sub-line, butter-soft "Due in {N}m" pill (right). Tap still opens Expansion panel.
- [ ] TodaysMedsCard, scheduled med, all doses logged today: row renders sage-soft check pill instead of count.
- [ ] TodaysMedsCard, PRN med: row unchanged (drug name + "{N} today" + Plus).
- [ ] Trends, no upcoming visit, 2 patterns: "Two patterns worth flagging at the next visit."
- [ ] Trends, upcoming visit on May 14, 2 patterns: "Two patterns worth flagging at the May 14 visit."
- [ ] Trends, upcoming visit today, 1 pattern: "One pattern worth flagging at the visit today."
- [ ] Onboarding, step 1 of 4: eyebrow reads "STEP 1 OF 4 · ABOUT YOU" above the Fraunces headline.

#### Edge cases
- [ ] TodaysMedsCard, no medications: existing "No medications added yet" empty card renders unchanged.
- [ ] Trends, 0 patterns flagged: headline reads "Nothing pulling at your attention this week." (existing — visit reference dropped because there's nothing to flag).
- [ ] Onboarding step 4 of 4 (final): button label changes to "Finish setup" (existing); eyebrow reads "STEP 4 OF 4 · BASELINE".

#### Error states
- [ ] Trends visit query failure: headline silently falls back to "next visit" wording. Existing visit-prep strip continues to render.

#### Performance
- [ ] One additional Supabase query on `/trends` (upcoming visit lookup). +1 round-trip; <50ms.

#### Persistence
- [ ] None. Visual-only.

#### Permissions / RLS
- [ ] `cardiology_visits` already has caregiver-scoped RLS — the new query inherits it.

#### Side effects
- [ ] None.

#### Manual verification
1. Add a scheduled med (Lasix 40mg at 8:00 AM) to a test patient. Open `/dashboard` between 7:00 AM and 8:00 AM. Verify Today's Meds row shows Clock icon + "Due at 8:00 AM" + butter "Due in {N}m" pill.
2. Confirm the dose. Reload. Verify row now shows sage check pill.
3. Schedule a cardiology visit for next Friday. Open `/trends`. Verify headline reads "{N} pattern{s} worth flagging at the {date} visit."
4. Open `/onboarding` (sign in to a fresh account). Verify each of 4 steps shows "STEP X OF 4 · …" eyebrow above the headline.
5. `npm run lint` clean. `npm run build` clean.

---

## Cross-cutting

- Stay on `design-system-alignment` branch. Do not push to main. No PR.
- Real data only on every render path (memory `feedback_real_data_only`).
- Walk every realistic edge case before claiming done: empty / first-time / cold-start / single-reading / boundary / multi-week-gap.
- Karpathy guidelines apply within each phase: no speculative abstractions; minimum-code; surgical changes.
- Citations: every clinical number reads from `src/lib/clinical/thresholds.ts`. (None added in either phase.)
- Voice / copy: passes the grelief test; sentence case; no emoji; "mom" not "loved one"; em-dashes for emotional beats.
- After each phase: `git push origin design-system-alignment` so the Vercel preview auto-deploys.

## 50% checkpoint protocol

Run `/context` at the end of Phase 1. If usage ≥ 50%:
1. Phase 1 is complete by definition (no half-builds).
2. Dispatch a code-review subagent with `git diff main...HEAD`, the approved AC list above, and `.claude/rules/code-quality.md`.
3. Apply actionable feedback; push back on the rest with reasoning visible to the user.
4. Write `docs/superpowers/plans/2026-05-08-design-system-handoff.md` covering: shipped X, deferred Y (Phase 2), where the next session picks up, any open questions.
5. Push branch. Report to user. Stop.

If usage < 50% after Phase 1, continue to Phase 2.
