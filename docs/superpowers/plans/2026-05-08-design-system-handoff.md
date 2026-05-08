# Design system alignment — session handoff (2026-05-08)

> Branch: `design-system-alignment`. Vercel preview auto-deploys. Three commits added this session: `fc3d29f`, `25f5cff`, `70c29de`.

## What shipped

### Phase 1 — daily-use polish

- **Patient-initial avatar bubble** (sage-tinted, 38×38) in the dashboard header, both cold-start and post-baseline branches. Falls back to "?" when `patient.display_name` is null. Greeting + headline reserved `pr-16` so long italic names don't intrude under the bubble.
- **"Things changed" subhead.** The `{N} signals to read today` line is gone. The new line says `{name}'s check-in came in at {time}. Two things changed today.` when the engine flagged anything; drops the count clause entirely on green days.
- **HomeAffirmationCard** renders between the header and `<VitalsListCard>` when the engine ran with zero triggers — sage-tinted "All steady / Doing well today." + summary line in decompensation-cascade order ("weight 178.2 lb · breathing normal · no cough"). Mutually exclusive with `<HeroAlertCard>`.
- **/log Fraunces shell.** `<PhoneShell hideNav>` so the bottom-nav FAB stops competing with the in-page mic; new server-rendered shell above `<VoiceLogClient>` carrying a back chevron + "Home" link, "VOICE LOG · DAY {N}" eyebrow, Fraunces 30px state-aware headline (`Tap to log today.` / `Today's check-in is in.` / `Listening to today's log…` / `Something went wrong.`), and a subhead. Day N = distinct calendar log days, counting today even when not yet logged.
- **`voice-log-client.tsx`** lost its now-redundant `Today's check-in / For {patientName}` eyebrow strip. Recording state machine untouched (memory restriction respected).

### Phase 2 — everywhere-else polish

- **TodaysMedsList rows.** Each scheduled row leads with a sage-tinted Pill icon (or sage check on a complete day), shows the next un-resolved slot's clock time as a subline (`Next at 8 a.m.`), and ends with a status pill — sage-soft "Done" when complete, muted `{taken}/{expected}` otherwise. PRN rows get the same icon-on-the-left treatment for visual rhythm. Slot-mute / dose-confirm logic untouched. Wizard surfaces (memory restriction) untouched.
- **Trends visit-aware headline.** Reads `One pattern worth flagging at the May 14 visit.` / `Two patterns worth flagging at the visit today.` / `Three patterns worth flagging at tomorrow's visit.` when an upcoming `cardiology_visits` row exists. Falls back to `the next visit` when none scheduled. Zero-pattern headline unchanged.
- **Onboarding step eyebrows.** Each wizard step renders `STEP N OF 4 · …` above its Fraunces title.

### Code-review patches (commit 3)

- Lifted `countWord` to `src/lib/format/count.ts`; both dashboard and trends use it. Trends headline now `"Two patterns"` not `"2 patterns"`.
- Lifted `formatShortDate` + `isoDateOffset` to `src/lib/dates/format.ts`; TrendsView's local copies removed. (The other 6 in-tree copies of these helpers — pre-existing, not introduced by this session — are left alone per Karpathy "clean up only your own mess.")
- Trimmed comment preambles on `HomeAffirmationCard`, `PatientInitialAvatar`, `formatScheduleTime`, `COUNT_WORDS` per Karpathy #2.
- `pr-12` → `pr-16` on dashboard greeting + headline (avatar overlap with long italic names).
- Plan doc Phase 2 AC updated to drop the "Due in {N}m" duration pill: a server-rendered page can't keep the duration accurate as the caregiver sits on the screen, and the absolute-time subline (`Next at 8 a.m.`) is what shipped.

## What's deferred

- **Voice-log "I'd rather type today" affordance** (audit Gap G). Design specifies it; production has no manual-typing destination. Building one creates a half-finished feature (CLAUDE.md rule #9). The right next step is to decide whether manual entry is a real product feature; if yes, it gets its own session.
- **`signalsReportedCount` in `src/lib/vitals/today-snapshot.ts`** is now unused (the dashboard subhead stopped consuming it). Pre-existing computation; per Karpathy "if you notice unrelated dead code, mention it — don't delete it." Worth removing in a future cleanup pass.
- **7-copy duplication of `prettyDate` / `isoDateOffset`** — present in `dashboard/page.tsx`, `BaselineProgressCard.tsx`, `CoughHeatmap.tsx`, `visits/page.tsx`, `visits/[id]/page.tsx`, `VisitHandoff.tsx`, `BottomNav.tsx`-adjacent. The new `src/lib/dates/format.ts` is the canonical home. A future "consolidation" PR can import from there everywhere; out of scope for visual-fidelity.
- **`formatTime12h` (cadence.ts) vs `formatScheduleTime` (TodaysMedsList.tsx)** — two registers for two surfaces ("8am" compact for management list / "8 a.m." spaced for dashboard row). Justified split, comment in TodaysMedsList notes the divergence. Could revisit if the design system decides on one register.

## What this session did not touch

- **Medications wizard** (`/me/medications/new`, `/me/medications/[id]`, `_flow/*`, `/me/medications/scan/*`). Memory `project_medications_wizard_parallel_work.md` flagged unreconciled parallel work as of 2026-05-06.
- **Voice-log recording state machine** in `voice-log-client.tsx`. Memory `project_voice_log_redesign.md` flagged this as part of an active streaming-transcription effort. Only the page shell + the small visual eyebrow strip changed.

## Where the next session should start

1. **Look at the Vercel preview.** Confirm the home affirmation card, the avatar bubble, the things-changed subhead, the /log shell with its hideNav, and the new med-row treatment all render the way the design intended on real-account data.
2. **Walk the edge cases on real data** — see "Manual verification" sections in `2026-05-08-design-system-alignment-phase-3.md`. Specifically:
   - Account with zero logs ever — cold-start branch with avatar.
   - Account with 7 distinct log days, today logged green — affirmation card visible.
   - Account with 7+ days, alert today — hero card visible, affirmation hidden.
   - Patient with single-character display_name — avatar still legible.
   - Account with an upcoming cardiology visit — trends headline names the date.
   - Onboarding wizard from step 1 → 4 — eyebrow updates.
3. **Decisions for the user** that came up but weren't escalated mid-session:
   - **Headline copy on home.** Design's `home-screen.jsx` uses `Good morning, Patricia.` as the H1; production keeps `How is *patientName* today?`. The audit doc surfaces this; staying surgical kept the production headline. Worth deciding before next phase.
   - **Date eyebrow on home.** Design has `THURSDAY · MAY 7` as the small line above H1. Production keeps `Good morning, X.` Same deferred-decision class.

## Open questions

- The reviewer asked whether the Phase 2 AC literal `Two patterns worth flagging at the May 14 visit.` should be enforced verbatim. Trends now uses `countWord` so all small N read as words. Adequate.
- Should the affirmation card be suppressed when `signalsReportedCount === 0`? Today the card shows even on a "I tapped record but said nothing specific" log, with the fallback line `Today's check-in is in. Nothing flagged.` Could argue for "no card on empty signals." Surfaced for next session.

## Files added this session

- `docs/superpowers/plans/2026-05-08-design-system-audit.md` — full audit, gap list, scope notes
- `docs/superpowers/plans/2026-05-08-design-system-alignment-phase-3.md` — phase plan with full ACs (Phase 2 AC updated post-review)
- `docs/superpowers/plans/2026-05-08-design-system-handoff.md` — this file
- `src/components/heartnote/HomeAffirmationCard.tsx`
- `src/lib/dates/format.ts`
- `src/lib/format/count.ts`

## Files modified this session

- `src/app/dashboard/page.tsx`
- `src/app/log/page.tsx`
- `src/app/log/voice-log-client.tsx` (eyebrow strip removal only)
- `src/app/onboarding/wizard.tsx`
- `src/app/trends/page.tsx`
- `src/components/heartnote/TodaysMedsList.tsx`
- `src/components/heartnote/TrendsView.tsx`
