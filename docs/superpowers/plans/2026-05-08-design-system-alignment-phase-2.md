# Design system alignment — Phase 2 plan (everything left)

> Continuation of `2026-05-07-design-system-alignment.md`. The first plan shipped the home composition, vitals/baseline/hero cards, the per-vital classifier, the 3-tab nav with FAB, the cough heatmap, and the login layout. This plan covers every remaining gap.

## Plain-English summary of what each phase ships

**Phase 1 — fix the bugs the prior session left.** Today the 7-dot baseline track lies when a caregiver skipped a day; today's pulse points at the wrong calendar date. The cough heatmap shows phantom "quiet" days for a brand-new patient who hasn't even existed for 14 days. A pillows row shows "learning baseline" only when it's also an alert (unreachable). Fix all of these and walk every realistic edge case before claiming done.

**Phase 2 — build the visits page for real.** A page that turns the last 14 days of logs, the active medications, and the alert/watch triggers into a one-screen handoff a caregiver can print or screenshot for cardiology. Real data only — pulls from `cardiology_visits`, `daily_assessments`, `medications`, and the existing weight series. Surface upcoming and past visits; let the caregiver schedule the next one.

**Phase 3 — family sharing v0.** A real shareable link the caregiver's sister can open without an account. Shows the current tier, last log time, last 14d weight chart, and the symptoms worth knowing about — redacted to never expose addresses, phone numbers, or any PII beyond first name. Backed by `family_shares.share_token`, served at `/s/[token]` via a service-role read.

**Phase 4 — voice log visual alignment.** Bring the existing `/log` flow into design-system visual alignment per the screens.jsx mock — same recording mechanic, new shell. "Tell us about today" headline, yesterday's log card showing the prior day's transcript + extracted symptoms, calm wave-bar animation while listening.

**Phase 5 — settings + onboarding polish + cleanup.** The `/me` page passes design-system muster but the section list could earn a "Visits" / "Family" entry now that those are real, and onboarding screens get a consistency pass. Delete `StatusRing.tsx` (no longer rendered), unused Sparkline if any. Final lint/build pass.

## Sizing

Each phase is a single long-running session's worth — sized so a fresh session can pick up the phase header and ship the whole phase. Phase 3 is the heaviest because of the public-share route + redaction logic. Phase 2 is medium-heavy because of the visit-prep aggregation. Phase 1 and 4 are light-medium. Phase 5 is light.

Execution order: Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5. Phase 1 must land first because the bugs touch components reused everywhere.

---

## Phase 1 — Fix the bugs

### Bug 1: BaselineProgressCard plots dots by loop index instead of calendar dates

**Where:** `src/components/heartnote/BaselineProgressCard.tsx:108-180` `ProgressTrack`. Currently each of 7 dots gets its calendar label from `isoDateOffset(startedAt, i)`, and "filled vs today vs dashed" is decided by comparing `dayNum (= i+1)` to `daysLogged`. So if the user logged May 1, May 2, then skipped May 3, then logged May 4, the dashboard says `daysLogged=3` and the third dot pulses with the date "May 3" — which is wrong twice (today is May 4, not May 3, and May 3 had no log).

**The fix.** The 7-dot track shows the **last 7 calendar days (today − 6 → today)**. Each dot's state comes from real data: filled (with sage check) if a log exists for that calendar date; pulsing-outline if the date is today regardless of whether logged; dashed otherwise. The calendar label under each dot is the actual date that dot represents.

This matches the alert-engine's cold-start contract: "have we got 7 distinct logged days in the last 14 calendar days?" The progress track is now the rolling 7-day adherence window. A user who logged sporadically sees the gaps they actually have, instead of a march of green checks that lie about their adherence.

**Props change.** Replace `daysLogged` and `startedAt` props with:
- `loggedDates: Set<string>` — distinct ISO dates within the last 14 days that have a `daily_logs` row (excluding today; we'll handle today as its own state).
- `today: string` — ISO YYYY-MM-DD in caregiver TZ.
- `loggedToday: boolean` — whether today has a complete log.

**Headline copy.** Drive from the count of `distinctLogDays = loggedDates.size + (loggedToday ? 1 : 0)`. Same lookup as before.

**Footer "X mornings to go" copy.** Drive from `distinctLogDays`, not from a calendar offset. Wording: "{COLD_START_MIN_LOG_DAYS - distinctLogDays} more morning{s} to go." When `distinctLogDays >= 7`, "Today completes the baseline." (caregiver completes baseline on the day the seventh distinct logged day lands).

**Dashboard call site.** Replace the `await getFirstLogDate(...)` and `priorLogDayCount` plumbing with a single `getLoggedDatesInWindow(supabase, patientId, today, 14)` helper that returns the set. Drop `getFirstLogDate` (now unused — clean removal per memory).

### Bug 2: CoughHeatmap shows phantom "quiet" days for users who didn't exist 14 days ago

**Where:** `src/lib/trends/cough-buckets.ts` initializes 14 cells unconditionally. For a patient who created their account 3 days ago, the chart still shows 11 cells of "quiet" before they existed.

**The fix.** Cough heatmap should only render cells from the **first daily_logs date forward**, capped at 14 days back from today. Patients with < 4 days of any logs at all skip rendering the heatmap entirely (it's not enough signal to justify the surface). Patients with 4-13 days render that many cells, left-aligned. The headline counts ("N quiet · N daytime · N nocturnal") are computed against rendered cells only.

When skipped, the Trends page shows a subtle line *"The cough chart needs about a week of logs to be useful."* under the section eyebrow — not a dead ComingSoonPage tile.

### Bug 3: Pillows "learning baseline" sub-line is unreachable

**Where:** `src/lib/vitals/per-vital-tier.ts` `pillowsSub`. Logic:
```
if (isAlert) {
  ...
}
if (baseline.coldStart) return 'learning baseline';
```
Looks fine? Read again: `if (isAlert)` returns early. So `coldStart && !isAlert` reaches the `learning baseline` line — that's actually reachable. But the design says cold-start should ALWAYS show "learning baseline" regardless of count, while non-cold-start should show "usual N" or "▲ vs N-pillow normal."

Actually the bug is subtler: when `isAlert && coldStart` simultaneously (rare but possible because cold-start cuts off most alerts but T2.4 fires whenever pillowCount > rolling 7d max regardless of distinct-day count), we return `▲ N vs M-pillow normal` while still in cold-start. The user has been logging 4 days and gets an alert that says "▲ 1 vs 1-pillow normal" — that's accurate! Let it stand.

**The actual bug that needs fixing:** `isAlert` for pillows is decided by checking `PILLOWS_ALERT_RULES` against the engine's triggers. But during cold-start the engine doesn't fire T2.4 at all (cold-start suppression). So `isAlert` is always `false` during cold-start. The branch is reachable, behavior is correct. **No fix needed — striking this from the bug list.**

(Recording this as a confirmed false-positive so future code-review doesn't flag it.)

### Bug 4: Cough heatmap "today" indicator is missing when today has no logs

**Where:** `src/components/heartnote/CoughHeatmap.tsx:112` — the today-outline only renders when `cell.date === today`. After Bug 2's fix, today's cell still exists in the array (as a zero cell). The outline still renders. So this works. But the `isToday` check is on `cell.date === today` which is a strict-equality string compare — if `today` is passed in caregiver TZ but `cell.date` was computed in UTC, they could disagree by a day. Need to verify both come from the same source.

**The fix:** Pass `today` through from the page (caregiver TZ — already done). Verify `getCoughHeatmapCells` builds dates from `today` working backward, not from server UTC. Currently `isoDateOffset(start, i)` with `start = isoDateOffset(today, -13)` — same TZ frame as `today`. ✓ No bug, no fix needed.

### Acceptance criteria — Phase 1

- [ ] **BaselineProgressCard happy path (consecutive logs):** logged May 5, 6, 7, today=May 8 (logged today). Track shows: dots labeled May 2, 3, 4, 5, 6, 7, 8. Dots May 2-4 dashed (no log), May 5-7 filled (sage check), May 8 pulse + filled (today, logged). Headline: "Almost there — 3 mornings to go." Footer: "3 more mornings to go · May 11" (today + 3).
- [ ] **BaselineProgressCard skipped-day:** logged May 1, May 4, May 5; today=May 6 (not yet logged today). Window today-6 → today = Apr 30, May 1, May 2, May 3, May 4, May 5, May 6. Dots: Apr 30 dashed, May 1 filled, May 2 dashed, May 3 dashed, May 4 filled, May 5 filled, May 6 pulse-outline (today, not yet logged). Headline driven by 3 distinct logged days = "Three mornings in. Four to go."
- [ ] **BaselineProgressCard first-time user:** no logs in window, today not yet logged. All 7 dots dashed except today which is pulse-outline. Headline: "We're starting to learn what normal looks like."
- [ ] **CoughHeatmap brand-new patient:** patient created 2 days ago, only 2 daily_logs total. Heatmap is hidden. Trends page shows the line *"The cough chart needs about a week of logs to be useful."* under the cough section eyebrow.
- [ ] **CoughHeatmap 5-day-old patient with 4 logged days:** 4 cells render, left-aligned. Headline "No cough" + "4 quiet · 0 daytime · 0 nocturnal" (count over rendered cells only, not against a 14-day denominator).
- [ ] **CoughHeatmap mature patient (≥ 14 days):** 14 cells, behavior unchanged from prior session.
- [ ] **Engineering:** no new migrations, no schema changes. Diff is scoped to BaselineProgressCard.tsx, dashboard/page.tsx, cough-buckets.ts, CoughHeatmap.tsx, TrendsView.tsx. `npm run lint` clean. `npm run build` clean.

### Manual verification — Phase 1

1. Open `/dashboard` on a fresh account → verify cold-start with 0 logs renders the new dashed-track behavior.
2. Use the seed script (or a manual SQL insert in the Supabase dashboard) to create one daily_logs row 4 days ago for the test patient → reload → verify only that one dot is filled and the others are dashed.
3. Insert daily_logs for today-2 and today-4 (skipping today-3) → verify today-3 stays dashed.
4. Open `/trends` for a patient with < 4 days of logs → verify cough heatmap is replaced by the explanatory line.
5. Lint + build both clean.

---

## Phase 2 — Visits page

### What the caregiver sees

Today the Visits tab is a placeholder. After this phase: the page lists upcoming and past cardiology visits, lets the caregiver schedule the next one (date + cardiologist name), and for the next upcoming visit auto-generates a one-page handoff — "what's worth showing the cardiologist." That handoff is a real prepared summary: 14-day weight sparkline, the alert/watch triggers that fired during that span, current medications, and a starter set of questions the caregiver can edit before printing or screenshotting.

After the visit, the caregiver can tap "Add notes" to record what the cardiologist said.

### Schema

Schema already exists — `cardiology_visits` (id, patient_id, visit_date, cardiologist_name, visit_kind, generated_report jsonb, generated_report_text, questions_to_ask jsonb, notes_after, ...). RLS already on. No migration needed.

The `generated_report` jsonb shape we'll use:
```ts
{
  weight_series: { d: string; v: number }[];          // 14d
  weight_baseline_lb: number | null;
  triggers_in_window: { rule_id: string; label: string; at: string }[];
  active_meds: { name: string; dose: string; cadence: string }[];
  daytime_cough_count: number;
  nocturnal_cough_count: number;
  swelling_days_count: number;
}
```
Generated server-side at the moment the visit is created or when the caregiver opens the handoff page (cached in the row so re-opens are fast).

### File structure

**Files to CREATE:**
- `src/app/visits/page.tsx` — replace ComingSoonPage. Lists upcoming + past visits. Card-per-visit.
- `src/app/visits/new/page.tsx` — schedule a visit.
- `src/app/visits/[id]/page.tsx` — visit detail with the auto-generated handoff + questions + notes editor.
- `src/app/visits/actions.ts` — server actions: `createVisit`, `regenerateHandoff`, `saveQuestions`, `saveNotes`, `deleteVisit`.
- `src/components/heartnote/VisitCard.tsx` — list row.
- `src/components/heartnote/VisitHandoff.tsx` — the printable summary.
- `src/lib/visits/generate-handoff.ts` — pure server function. Reads daily_log_readings, daily_assessments (last 14d), medications (active=ended_at IS NULL), daily_log_symptom_events (last 14d). Returns the jsonb shape.
- `src/lib/visits/default-questions.ts` — small static array of 6 starter questions sourced from `research/03-caregiver-education.md` (AHA's questions). Caregiver can edit, add, or delete.

**Files to MODIFY:**
- `src/app/dashboard/page.tsx` — when next-upcoming visit exists within 14 days, render a "Cardiology · {date}" tile linking to `/visits/[id]`.
- `src/app/me/page.tsx` — the SectionLink to "Visit prep" already points to `/visits` — no change needed.

### Acceptance criteria — Phase 2

**Functional — happy path:**
- [ ] Caregiver opens `/visits` with no visits scheduled. Page renders Fraunces 30px headline *"No cardiology visit scheduled."* + a coral primary "Schedule visit" button + a sage-tinted card explaining what visit prep does.
- [ ] Caregiver taps "Schedule visit" → `/visits/new`. Form fields: date (date picker, today or future), cardiologist name (defaults to `patients.cardiologist_name`), visit kind (radio: routine / follow-up / new symptoms). Save action redirects to `/visits/[id]`.
- [ ] On the visit detail page: handoff section shows: 14-day weight sparkline (reuses MiniTrendSpark), alert/watch trigger list, active medication list, cough/swelling counts. All values pulled from real DB rows.
- [ ] Caregiver can edit the suggested questions inline (textarea per question, "+ Add a question" button, trash icon to delete).
- [ ] After the visit date passes, the page surfaces a "Add notes from the visit" textarea. Saving stores into `notes_after`.
- [ ] Print affordance: a "Print this page" button calls `window.print()` with a print stylesheet that hides the bottom nav and CTAs, preserves the handoff layout.
- [ ] Visits list at `/visits`: upcoming (visit_date >= today) sorted ascending; past (visit_date < today) sorted descending under a "Past visits" subhead.

**Edge cases:**
- [ ] Patient with NO daily_logs in the last 14 days: handoff weight section reads *"No weight readings in the last two weeks."* No empty sparkline.
- [ ] No active medications: section reads *"No medications on file."* Doesn't break layout.
- [ ] Visit_date = today: shows in upcoming list; the "Add notes" affordance shows even on today.
- [ ] Caregiver deletes a visit: typed-confirmation pattern from `.claude/rules/destructive-actions.md` — types the visit date verbatim to confirm.

**Error states:**
- [ ] DB query failure on handoff generation → handoff section reads *"This data isn't loading right now."* Page doesn't crash; questions and notes editors still work.

**Performance:**
- [ ] `/visits/[id]` runs ≤ 5 supabase queries on load (visit, weight series, triggers in window, active meds, symptoms in window).
- [ ] `/visits` runs ≤ 2 queries (visits list, patient).

**Persistence:**
- [ ] Schedule, edit questions, save notes — all write to `cardiology_visits`. Reload preserves.
- [ ] No localStorage. No client state for the handoff data.

**RLS:**
- [ ] All reads filtered through caregiver-scoped Supabase server client. RLS on `cardiology_visits` already enforces.

**Manual verification:**
1. `/visits` empty state → schedule a visit → see it appear → open handoff → verify all numbers come from real rows in Supabase.
2. Edit a question → reload → edited text persists.
3. Add notes after the visit date → reload → notes persist.
4. Delete a visit (typed confirm) → list updates, row gone in Supabase.

---

## Phase 3 — Family sharing v0

### What the sister sees

The caregiver opens `/family`, taps "Send mom's status to a sibling," and gets the iOS Share Sheet with a pre-filled URL like `heartnote.com/s/abc123…`. The sister taps the link from her text messages — no app install, no account, no signup. She sees a single page: mom's first name, the current status (green/yellow/red wording per the engine), the date of the last log, a 14-day weight sparkline, and 1-3 key symptoms from the last week. No medications. No phone numbers. No address. No raw transcript.

The caregiver can revoke any share at any time.

### What the caregiver sees

`/family` lists active shares (with recipient label, when last viewed, expiration), a "Send mom's status to a sibling" CTA, and a section explaining what gets shared.

### Schema

Already exists — `family_shares` (id, patient_id, share_token, recipient_label, recipient_email, expires_at, last_viewed_at, revoked_at). RLS already on. **No migration needed.**

Public access pattern: a Next.js route at `/s/[token]` server-side renders the redacted snapshot. The route uses the **service-role key** (server-only) to query, after validating that `share_token = url-token AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`. We do NOT add a public RLS policy on `family_shares` — the service-role bypass + explicit validation is the trust boundary.

### Redaction rules

Carefully — the Family page is read by people who haven't agreed to HeartNote's terms. Show:
- Patient first name OR `display_name` (caregiver-controlled).
- Current daily_assessments tier (good/watch/alert), in caregiver-facing wording.
- Last logged date.
- 14d weight sparkline (no axis labels — just shape) + delta vs 7d ago.
- Top 3 symptom mentions in the last 7 days (counts only, no transcript text).

Don't show:
- Caregiver's email/name.
- Patient's last name, address, phone, DOB.
- Cardiologist name/phone.
- Medications.
- Any voice-log transcript.
- Any raw severity numbers.

### File structure

**Files to CREATE:**
- `src/app/family/page.tsx` — replace ComingSoonPage. Lists shares + create-share form.
- `src/app/family/actions.ts` — server actions: `createShare`, `revokeShare`.
- `src/app/s/[token]/page.tsx` — public snapshot page. Uses service-role key. NO auth check (it's the share's whole point).
- `src/lib/family/snapshot.ts` — pure server function. Validates token, fetches the redacted view. Returns null if revoked/expired/missing.
- `src/lib/supabase/service.ts` — small wrapper around `createClient` with service-role key. Reads `SUPABASE_SERVICE_ROLE_KEY`. **Throws if missing** (per CLAUDE.md rule 11 "fail closed").
- `src/components/heartnote/SharedSnapshotView.tsx` — the public-facing read-only render.
- `src/components/heartnote/ShareList.tsx` — caregiver's list of active shares with "view as sister" + "revoke" affordances.

**Files to MODIFY:**
- `src/app/me/page.tsx` — add a SectionLink to `/family`. Already exists pointing to `/family` — verify after `/family` becomes real.
- `next.config.ts` — add `Cache-Control: no-store, must-revalidate` to `/s/[token]` per `.claude/rules/auth-sessions.md`. Even though it's not auth-sensitive, the snapshot is per-request data and shouldn't BFCache.

### Acceptance criteria — Phase 3

**Functional — happy path:**
- [ ] Caregiver opens `/family` → page renders headline *"Share mom's status with a sibling."* + a coral primary "Create share link" button.
- [ ] Tapping create → form: recipient label (e.g. "Sister Jen"), optional expires_at (radio: "no expiry / 7 days / 30 days"). Save creates a row with auto-generated share_token. Redirect back to `/family`.
- [ ] Each share row shows: recipient label, the URL (with copy-to-clipboard tap), last viewed time (or "not viewed yet"), expires (or "never"), and a "Revoke" button.
- [ ] Revoking sets `revoked_at = now()`. The link immediately stops resolving (404 or "this link was revoked" page).
- [ ] Sister opens the link on a fresh device with no account: sees the snapshot, no login screen, no signup prompt, no install nag.
- [ ] Snapshot page header: Lucide Heart icon + "HeartNote" wordmark + "shared by {caregiver_first_name}".
- [ ] Snapshot body: patient first name, status pip + current tier label, last log time, 14d weight spark, top 3 symptom mentions.
- [ ] Snapshot footer: footer-thin disclaimer *"This is a check-in shared by {caregiver}. It's not a medical record. For medical questions, contact mom's cardiologist."*

**Edge cases:**
- [ ] Patient with no logs at all: snapshot shows *"No check-ins yet."* — no broken sparkline.
- [ ] Patient with 1 log: spark hidden (not enough data); status pip from the assessment (or unknown if cold-start).
- [ ] Token revoked: sister sees *"This share link was revoked."* with an icon, no patient data.
- [ ] Token expired: sister sees *"This share link expired on {date}."* with an icon, no patient data.
- [ ] Token doesn't exist: 404. (Don't leak whether it ever existed.)
- [ ] Patient's `display_name` is null or empty: snapshot uses "mom" as fallback.

**Error states:**
- [ ] Service-role key missing → server-side throw in `createServiceClient`, caregiver sees standard Next 500. Acceptable — pre-launch we control env. CLAUDE.md rule 11.
- [ ] DB query failure on snapshot → "We couldn't load this snapshot right now. Try again in a minute." retry-capable page.

**Performance:**
- [ ] `/s/[token]` server-render runs ≤ 4 service-role queries (token validation joined with patient, weight series, symptoms count, latest assessment).
- [ ] Per-request, last_viewed_at update is fire-and-forget (don't block render).

**Persistence:**
- [ ] Shares persisted to `family_shares`.
- [ ] last_viewed_at updates each time a sister loads the page.

**Permissions:**
- [ ] Caregiver can only see/revoke shares for THEIR patients (RLS enforces).
- [ ] Public route uses service-role with **explicit** validation; no RLS-leak path.
- [ ] Service-role key is read server-side only — never imported into a client component.

**Side effects:**
- [ ] Creating a share does NOT notify anyone. The caregiver chooses how to share the URL.

**Manual verification:**
1. Caregiver A creates a share for patient A. Opens the URL in a private window with no auth. Sees snapshot. Confirms no medication or phone visible.
2. Caregiver A revokes the share. Reload private window — sees revoked message.
3. Caregiver B (different account) tries to access caregiver A's share via `/family` — RLS blocks. Tries the share URL directly — works (public by design).
4. Caregiver A creates a share with 7-day expiry. Manually update the expires_at to yesterday in the Supabase dashboard. Reload private window — sees expired message.
5. `/share/random-bad-token` → 404 page.

---

## Phase 4 — Voice log visual alignment

### What the caregiver sees

Today's `/log` works (records, transcribes, extracts) but the visual shell doesn't match the design system. After this phase: same recording mechanic, but the shell looks like the screens.jsx mock — quieter Fraunces headline that swaps with state ("Tap to log today" / "Tell us about today" / "Listening to today's log…"), a yesterday's-log card showing the prior day's transcript snippet + extracted symptoms, the "I'd rather type today" affordance for caregivers who can't or won't speak.

This is a visual-only refactor. No change to recording, transcription, extraction, or persistence.

### What's NOT in scope

- The streaming transcription redesign (memory: `project_voice_log_redesign`) — that's a separate active effort.
- Any change to the extraction pipeline.
- Any change to how today's log is fetched on dashboard mount.

### File structure

**Files to MODIFY:**
- `src/app/log/voice-log-client.tsx` — wrap in the new shell; preserve the existing recording state machine.
- `src/components/heartnote/VoiceLogShell.tsx` — NEW. Holds the headline, the mic FAB-style button, the wave-bar listening animation, the yesterday-card.
- `src/components/heartnote/YesterdayLogCard.tsx` — NEW. Server-side fetched yesterday's transcript snippet + extracted-symptom pills.

**Files to CREATE:**
- `src/lib/voice-log/yesterday.ts` — server query helper for yesterday's log.

### Acceptance criteria — Phase 4 (abbreviated; full template in implementation)

- [ ] Headline copy switches by state per the screens.jsx mock.
- [ ] Yesterday's-log card renders only when a complete log exists for `today - 1`. Snippet is first 180 characters of `transcribed_text` with ellipsis. Symptoms come from the assessment's triggers or `daily_log_symptom_events`.
- [ ] When no log yesterday: card omitted; nothing dead.
- [ ] Mic button visual matches the mock (sage radial-gradient with white-mic, listening = the same with a softly pulsing outer ring).
- [ ] "I'd rather type today" surface kept; routes to whatever the existing manual-typing path is (or hidden if not implemented).
- [ ] Lint + build clean. No regression in existing recording / transcription / extraction.

---

## Phase 5 — Polish and cleanup

### Scope

- Add `/visits` and `/family` SectionLinks to `/me` (already linked, but verify subcopy is accurate now that those pages are real).
- Audit `/onboarding` for design-system consistency (headline weights, card radii, cream background).
- Delete `src/components/heartnote/StatusRing.tsx` if it's no longer rendered anywhere (per the Phase 1 decision to remove from dashboard). Verify with grep first.
- Delete `src/components/heartnote/Sparkline.tsx` if `MiniTrendSpark` has fully replaced it. Verify with grep first.
- Run `npm run lint` + `npm run build` + manual nav around the app.

### Acceptance criteria — Phase 5

- [ ] Grep confirms StatusRing has zero consumers; file deleted.
- [ ] Grep confirms Sparkline has zero consumers; file deleted (or kept with a clear note if still used).
- [ ] `/me` Section list reads cleanly with each link going to a real page.
- [ ] `/onboarding` headlines use Fraunces; cards use 28px radius; bg is cream.
- [ ] Lint clean. Build clean. Manual nav: home → vitals/hero/baseline as appropriate → trends with cough heatmap → visits (real) → family (real) → log → me. No dead button anywhere.

---

## Cross-cutting

- Stay on `design-system-alignment` branch. **Do not push to main.** Do not open a PR yet — Jazmin will review locally.
- Real data only on every render path. No mock. No fake buttons.
- Walk every realistic edge case before claiming done: empty / first-time / cold-start / single-reading / boundary / multi-week-gap.
- Karpathy guidelines apply within each phase: no speculative abstractions; minimum-code; surgical changes.
- Citations: every clinical number reads from `src/lib/clinical/thresholds.ts`. Every clinical claim cites `research/chf-source-of-truth.md`.
- Voice / copy: passes the grelief test; sentence case; no emoji; "mom" not "loved one"; em-dashes for emotional beats.
