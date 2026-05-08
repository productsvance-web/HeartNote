# Handoff — end-to-end trust layer (2026-05-08, late session)

> Branch: `design-system-alignment`. Vercel preview auto-deploys. Pushed through commit `c1c1ced`.
>
> This session pivoted from the queued visual-polish plans to the trust layer underneath — engine correctness, trends math, caregiver-fixable data — after the user surfaced that plans 1-4 were "visual polish on a foundation no one had verified."

## What landed (in commit order)

### Plans 1-4 from the original queue
- `8ca9d7d` — Plan 1: cold-start render fixes (Case 4 framing, Case 6 dropped-banked-day) + 11-case Playwright harness + audit doc + 11 PNG screenshots.
- `e6baedb` — Plan 2: home dashboard header redesign (`THURSDAY · MAY 7` eyebrow + Fraunces caregiver greeting + contextual subhead).
- `5f36d62` — Plan 3: live "Due in {N}m" pill on scheduled meds rows; single deterministic ticker, pauses on hidden tabs, DST-safe via `minutesUntilWallClock`.
- `39a09d2` — Plan 4 audit: classified every interactive Lucide icon button against `.claude/rules/canonical-controls.md`.
- `8801518` — Plan 4 apply: `visit-questions-editor.tsx` now uses Pattern #2/#3 (red-circle-minus + sage-circle-plus).
- `51649b2` — Plan 4 apply: TodaysMedsList dose-event delete now uses Pattern #2.

### Engine correctness
- `6b1b278` — `refactor(alerts): extract pure evaluateRules from evaluateAlertTier`. Prior-window queries (`maxPillowCountInPriorDays`, etc.) moved into `loadInputs`. Public `evaluateAlertTier(supabase, patientId, logDate)` signature unchanged.
- `4f9b6af` — **Engine 47 unit tests, all pass, zero bugs.** Every T1.x / T2.x / T3.x rule matches research §2 source-of-truth. Cold-start gates, multi-rule resolution, T1.7b chronic-dyspnea suppression, T2.4 strict-> edge — all green.
  - **Commit message is mis-titled "feat(log): manual edit UI"** because of an auto-prepare-commit-msg hook that grabbed the wrong context. Content is right (`git show --stat 4f9b6af` shows the actual files). Not force-pushing per CLAUDE.md.
- Run with `npm run test:alerts`.

### Trends math
- `f3e1b25` — `refactor(trends): extract pure series + cough-bucket helpers`. Same shape as the engine refactor.
- `7f78952` — 31 trends tests, all pass after fixes.
- `d5e51b5` — **`fix(trends): pull weight baseline from day-7, not the oldest point`**. Real bug: `series.ts` was calling `.find()` on an ascending-sorted weight series with predicate `p.d <= today-7`. That returned the OLDEST qualifying point (e.g. day-14), not the closest-to-the-window day (day-7). The chart was comparing today's weight against a **2-week-old** weight for any patient with ≥7 days of history. Fixed with reversed iteration. Test reproduces the bug.
- `c1c1ced` — `fix(trends): drop the silent baseline=1 fallback for restless-nights`. When `patient.normal_pillow_count` is null we no longer silently default to 1; the count was lying about disruption for caregivers who hadn't set the baseline. Cough nights still count. Engine T2.4 untouched (different intent — safety-side rule).
- Run with `npm run test:trends`.

### Caregiver-fixable data
- `0197916` — **`feat(log): manual edit UI`** — `/log/[id]/edit` route. Server-rendered form for any daily_logs row. Edit any reading, any symptom event, day-level fields, notes. Per-row remove via canonical Pattern #2. Server action validates via zod, applies patches, **re-runs `evaluateAlertTier` and upserts `daily_assessments`** so the dashboard reflects corrections immediately. "Edit" link wired from `YesterdayLogCard` and from `/log` once today's dictation completes.
- `a5862cb` — **`feat(me): patient details edit`** — `/me/patient/edit` route. Form covering display_name, relationship, dry_weight_lb, nyha_class, cardiologist_name, cardiologist_phone, normal_pillow_count. Removes the "editing patient details is coming next" stub. Phone normalized to digits-only at write time so the `tel:` Call CTA works regardless of input format. Revalidates `/dashboard`, `/log`, `/trends` since the patient row feeds all three.

## What's deferred

### Plan 5 — visit-prep-pdf (3-session build)
- `docs/superpowers/plans/2026-05-08-visit-prep-pdf.md`
- Currently `/visits/[id]` ships `window.print()` via `client-print-button.tsx`. The plan is a real generated PDF report — server-side rendering, typography, the actual data structured for cardiologist consumption rather than a screenshot of the page.
- Each session in the plan has its own session-1/2/3 breakdown that maps directly to the 50%-handoff rule. Start whenever the rest is solid.

### Add new readings/symptoms to an existing log
- The manual-edit UI v0 only modifies existing extractions. If the AI missed a reading entirely, caregiver re-dictates. A future v1 adds "Add a reading" / "Add a symptom" affordances inside `/log/[id]/edit`.
- Hint for next session: the form structure already has the `Section` blocks; an `+ Add` button per section + a small picker UI is straightforward. Keep the canonical Pattern #3 sage-circle-plus for the trigger button.

### iOS Capacitor build verification
- `@capacitor/*` packages are installed. No work this session. Should run `npx cap sync ios` and verify the app boots in a real iOS shell.

### Push notifications
- Per `docs/status.md`, deferred to the next phase. Phase 1 alert engine fires the trigger labels but doesn't notify; the caregiver only sees an alert when they open the app.

### LLM-reasoning v0.5 alert narrative
- Phase 1 engine produces `Trigger.label` strings. The cardiologist-script narrative + AI-reasoning explanation that appears in the `alerts` table is the next layer (Anthropic Claude Opus 4.7 via prompt caching per CLAUDE.md rule 3).

### Trends 7-day symptom window
- The trends subagent flagged that `gte('log_date', today-7)` is 8 calendar days inclusive (today-7 through today). May be intended; left alone. Worth deciding before next trends pass.

## Where to resume

1. **Look at the Vercel preview.** Latest preview should be at the alias `https://heart-note-git-design-syste-…-productsvance-8547s-projects.vercel.app` — sign in as your real account, walk dashboard → `/log` → `/log/[yesterdayLogId]/edit` → `/me/patient/edit` → `/visits` → `/me/medications`. The trust-layer surfaces are in flight; verify each works on real data.

2. **Decide on visit-prep-pdf approach.** Read `docs/superpowers/plans/2026-05-08-visit-prep-pdf.md`. The plan is 3 sessions; if you want to ship faster, scope down to "real PDF library + server-side render" without the full design.

3. **Follow-up trust gaps surfaced this session that didn't get fixed:**
   - Trends 7-day symptom window strict-vs-inclusive (decision, not a bug).
   - "Add a reading / symptom" inside the manual-edit UI (v1 enhancement).

## Open questions

- **Commit `4f9b6af` mislabel.** Content is the engine tests; message says "feat(log): manual edit UI." Force-push to amend? Per CLAUDE.md, destructive ops need explicit user OK. Leaving as-is.
- **Trends 7-day window.** Strict 7 calendar days = `gte(today-6)`. Inclusive 8 = current `gte(today-7)`. Caller intent ambiguous; pick before next trends fix.
- **`/log/[id]/edit` for not-yet-complete logs.** Currently the route loads any daily_logs row. If `processing_status='pending'` (mid-recording), the structured data isn't extracted yet so the form will be empty. Probably fine — caregiver shouldn't edit a log mid-processing — but worth a explicit gate in the page if a user reports confusion.

## Manual verification checklist for this session's work

1. Sign in as your real caregiver account.
2. Open `/me`. The "editing coming next" stub should be gone — there's now an "Edit" link in the patient card.
3. Tap "Edit" → `/me/patient/edit`. Form should pre-fill all your patient values. Change `cardiologist_phone`, save. Phone gets normalized to digits-only on write.
4. Open `/dashboard`. Tier and any active alert should still work; the "Call cardiologist" CTA on alerts now wires to the updated phone number.
5. Open `/log`. If you have a yesterday log, the card should have an "Edit" link. Tap it → `/log/[id]/edit`. Form should pre-fill the structured data the AI extracted.
6. Edit a reading value or remove a symptom. Save. Returns to `/log`. Open `/dashboard` — the tier should reflect the re-evaluated assessment.
7. Open `/trends`. The weight delta on the dry-weight card should now read against last week's weight, not two weeks ago.
8. Run `npm run test:alerts` (47 tests) and `npm run test:trends` (32 tests) — both green.

## Files added or modified this session

**New:**
- `src/app/log/[id]/edit/page.tsx`
- `src/app/log/[id]/edit/edit-form.tsx`
- `src/app/log/[id]/edit/actions.ts`
- `src/app/me/patient/edit/page.tsx`
- `src/app/me/patient/edit/edit-form.tsx`
- `src/app/me/patient/edit/actions.ts`
- `src/lib/alerts/evaluate.test.ts`
- `src/lib/trends/series.test.ts`
- `src/lib/trends/cough-buckets.test.ts`
- `tests/global-setup.ts`
- `tests/baseline-edge-cases.spec.ts`
- `scripts/seed-baseline-cases.ts`
- `scripts/baseline-test-fixtures.ts`
- `playwright.config.ts`
- `docs/superpowers/audits/2026-05-08-baseline-edge-cases.md`
- `docs/superpowers/audits/2026-05-08-button-audit.md`
- `docs/audits/baseline-screenshots/case-{1..10,5b}.png`

**Modified:**
- `src/app/dashboard/page.tsx` — header redesign + `firstLoggedDate` prop rename
- `src/app/log/page.tsx` — "Edit today's details" link
- `src/app/me/page.tsx` — patient-edit link, "coming next" stub removed
- `src/components/heartnote/BaselineProgressCard.tsx` — Case 4 + Case 6 fixes
- `src/components/heartnote/TodaysMedsList.tsx` — Due-in pill state machine + canonical dose-event remove
- `src/components/heartnote/TodaysMedsCard.tsx` — passes `today` to list
- `src/components/heartnote/YesterdayLogCard.tsx` — id prop + Edit link
- `src/lib/alerts/evaluate.ts` — pure rules extraction + prior-window aggregates
- `src/lib/trends/series.ts` — pure helper extraction + weight baseline fix + null-pillow-baseline fix
- `src/lib/trends/cough-buckets.ts` — pure helper extraction
- `src/lib/voice-log/yesterday.ts` — id field
- `src/lib/dates/format.ts` — `formatHeaderEyebrow`, `minutesUntilWallClock`
- `src/app/visits/[id]/visit-questions-editor.tsx` — canonical add/remove
- `package.json` — `test:alerts`, `test:trends`, `test:baseline`, `seed:baseline`
- `playwright + chromium` added as devDeps

## Next session entry point

If the next session is a fresh agent, the entry instruction is:

> Read this handoff at `docs/superpowers/handoffs/2026-05-08-end-to-end-trust-layer.md`. Latest commit on `design-system-alignment` is `c1c1ced`. Walk the manual-verification checklist above before starting new work — surface any failures back to the user before pulling more from the queue.
