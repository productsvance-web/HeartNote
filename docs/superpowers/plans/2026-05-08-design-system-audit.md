# Design system audit — 2026-05-08

> Step 0 of the Phase 2+ alignment work. Maps every screen the design system specifies (in `/tmp/heartnote-design-system/`) to its production counterpart and lists every delta. The prior session's phase-2 plan anchored on six listed bugs and missed visual fidelity. This audit is the corrective.

## What matches the design today (✅ shipped)

- **Design tokens.** `src/app/globals.css` mirrors `colors_and_type.css` exactly — cream / sage / butter / coral, the three soft tints, generous radii (1.25rem base → 28px on `--radius-2xl`), tonal shadows, three animations (`pulse-ring`, `breathe`, `fade-up`).
- **Phone shell.** `PhoneShell.tsx` wraps every in-app screen in `bg-gradient-to-b from-cream to-background` + `max-w-md` mobile column.
- **Bottom nav.** 3-tab Home / Mic-FAB / Me with glass blur (`backdrop-blur-lg`, 0.5px hairline border, sage radial gradient on the FAB, pulse-ring halo).
- **Login.** Photo band 58dvh with bottom rounded corners + dark scrim + warm sage radial overlay + Fraunces "How is *mom* today?" headline + sign-in card that overlaps the photo by −44px. Wordmark + eyebrow pill match the mock.
- **HeroAlertCard.** Maps 1:1 to `designs/home-screen.jsx#HeroAlert` — eyebrow with status pip, AlertTriangle icon, weight number + spark with AHA threshold band, Call/See-trend button pair.
- **VitalsListCard.** 5 rows inside a `rounded-3xl` card, hairline 0.5px border-bottom, status pip + label + value + sub + chevron.
- **BaselineProgressCard.** Cold-start screen per `designs/baseline-screen.jsx` — sage-tinted hero card with 7-dot track (filled / pulse-today / dashed-future), "{N} more mornings to go" footer, "What we're learning" 5-row list with `count/7` pills.
- **CoughHeatmap.** 4×14 grid per `docs/specs/cough-heatmap.md`, nocturnal row label coral, today column outlined.
- **TrendsView.** Eyebrow + Fraunces 28px headline + Weight/Cough/Sleep/Symptoms cards + "Bring this to the next cardiology visit" sage-tinted strip.
- **Visits.** Eyebrow + headline + sage primary "Schedule a visit" + Upcoming/Past list with calendar-heart icons + sage-tinted help card on empty.
- **Family.** Eyebrow + headline + create-share form (recipient label + expiry radios) + Active/Inactive shares list + "What the link shows / what it doesn't" sage-tinted info card.
- **SharedSnapshotView.** Public `/s/[token]` snapshot with redacted view (first name, status pip + tier label, 14d weight spark, top symptoms) + disclaimer footer.
- **/me page.** Profile card + patient card + Sections list (Trends / Medications / Visit prep / Family) + Sign out + Delete account.
- **next.config.ts headers.** `Cache-Control: no-store, must-revalidate` on `/login`, `/signup`, `/onboarding`, `/me`, `/me/*`, `/auth/*`, and `/s/*` per `auth-sessions.md`.
- **YesterdayLogCard.** On `/log`, transcript snippet + tier pill + symptom-count pill — matches `screens.jsx#VoiceLogScreen` yesterday-card.

## Where the design and production disagree (gaps)

Each delta below is "Design specifies X. Production renders Y. Delta is Z."

### Gap A — `/log` page shell doesn't match the calm centered-mic mock

**Design specifies** (`screens.jsx#VoiceLogScreen`): a calm, centered shell — "Voice log · day N" eyebrow at the top, Fraunces 30px headline that swaps with state ("Tap to log today" / "Tell us about today" / "Listening to today's log…"), short prose subhead, then a 144×144 sage mic button centered with breathing pulse-ring halo, then a card with sage waveform bars during listening, then yesterday's-log card below, plus a small ghost "I'd rather type today" link. No bottom nav.

**Production renders** (`/log/page.tsx` → `voice-log-client.tsx`): a busy, dictation-tools-forward layout — small "Today's check-in / For {patientName}" eyebrow strip, then a horizontal Mic-timer-Waveform header, a live-transcript card, a "Sparkles · Auto-filling" tile counter, a 2-column grid of 10 numeric tiles, alert chips, "more notes" expand, "record another" button. Bottom nav stays visible with the FAB still glowing on the page where mic IS the action.

**Delta:**
1. Headline-shell — design's calm Fraunces "Tap to log today" never renders. The page-level identity beat is missing.
2. Bottom-nav suppression on `/log` — `PhoneShell` has `hideNav` but `/log/page.tsx` doesn't pass it.
3. "I'd rather type today" affordance — absent.

**Constraint** (memory `project_voice_log_redesign.md`): the recording state machine *inside* `voice-log-client.tsx` is restricted from this work. The **page shell** (`/log/page.tsx`), **bottom-nav suppression**, and **visual surround** (anything wrapping the recording UI) are in scope. The state machine itself stays untouched.

### Gap B — Dashboard "good" state has no affirming card

**Design specifies** (older `screens.jsx#DashboardScreen{state="good"}`): a 200×200 sage status-ring centerpiece labeled "Doing well", a sage-tinted detail line ("Mom slept through · weight steady · no swelling reported"), a tinted summary card ("Mom's steady — weight 178.2 lb, sleeping fine. We'll keep watching.") above the meds.

**Production renders** (`/dashboard/page.tsx` when `tier === 'tier_5_good'` or null): no hero card at all. Goes straight from greeting + "How is mom today?" headline → VitalsListCard → TodaysMedsCard → upcoming-visit chip → "See the last two weeks" trends link.

**Delta:** the good-day state is silent. Design specified an affirming card; production picks absence-of-alert. Whether to keep the silence or add a calm "all steady" card is a product decision, not a clear bug.

**Note:** the design has *two* home conceptions — `screens.jsx` (older, status-ring-centric) and `designs/home-screen.jsx` (newer, alert-hero-centric). Production matches the newer one for alert/watch states. The newer design never explicitly drew a good-state. So this is "we never decided what the good state should look like."

### Gap C — Today's Meds card row treatment is sparser than design

**Design specifies** (`screens.jsx#DashboardScreen` meds card): rich rows with a circular icon badge (Pill or Clock), drug name + dose, time-of-day meta + "with food" hint, sage soft check pill on taken rows, butter-soft "Due in 20m" pill on the next-up row. The whole card uses `--radius-2xl` and `--shadow-card`.

**Production renders** (`TodaysMedsCard.tsx` + `TodaysMedsList.tsx`): a bare list — drug name + "{taken}/{expected}" tabular count + small skipped marker + optional over-dose chip. No icon, no time-of-day, no "Due in X" affordance. Tap to expand reveals event log + Taken/Refused/Extra pill row.

**Delta:** the dashboard meds card is functional but visually quiet. Design wanted more signal per row.

**Note:** production may have made an intentional choice to keep the dashboard quick-glance. The full management view at `/me/medications` is the rich surface. But the design called for a richer dashboard row, so this is a real delta.

### Gap D — Dashboard greeting subhead phrasing

**Design specifies** (`designs/home-screen.jsx#HomeHeader` for the alert state): "Mom's morning check-in came in at 6:42 AM. **Two things changed.**" The "two things changed" beat is bold-foregrounded.

**Production renders**: "{Patient}'s check-in came in at {time}. {N} signal{s} to read today." The "signals to read" count comes from `snapshot.signalsReportedCount` (the count of vitals reported, not the count of vitals that *changed* from baseline).

**Delta:** "signals to read" is weaker semantics than "things changed." A caregiver glancing at the home wants to know how many things shifted, not how many vitals were dictated. Currently the home will say "5 signals to read today" even when nothing changed from baseline.

### Gap E — Dashboard header lacks the patient avatar

**Design specifies** (`designs/home-screen.jsx#HomeHeader`): a 38×38px sage-tinted avatar bubble in the top-right of the header showing the patient's first initial (e.g., "P" for Patricia) over a sage-soft fill with a sage 35% border.

**Production renders**: header has greeting + headline only; no avatar.

**Delta:** missing avatar bubble. Small but the design specifies it as the visual anchor for the patient context.

### Gap F — Trends headline isn't visit-aware

**Design specifies** (`screens.jsx#TrendsScreen`): "Two patterns to share at the **May 14** visit." Specific upcoming-visit date callout.

**Production renders**: "{N} patterns worth flagging at the next visit." Always says "next visit," never names a date.

**Delta:** production doesn't reference the upcoming-visit date when one is scheduled. Trends already knows about the patient; the dashboard already surfaces the upcoming-visit chip; trends should too when one is on the calendar.

### Gap G — Voice log "I'd rather type today"

Pulled out from Gap A so it's not lost. **Design specifies**: a small ghost link below the mic ("I'd rather type today") for caregivers who can't or won't dictate.

**Production renders**: nothing.

**Delta + decision:** there's no manual-typing surface in production today. Building one violates CLAUDE.md rule #9 ("no half-finished implementations") if we ship a button without a destination. **Out of scope** unless the user wants to add manual entry as a real feature.

### Gap H — Onboarding wizard could use eyebrow polish

**Design system patterns** (preview/type.html): every section has eyebrow (uppercase 11px tracking 0.06em muted-foreground) + Fraunces display headline + body subhead.

**Production renders** (`onboarding/wizard.tsx`): each step has Fraunces 3xl headline + p subtitle, no eyebrow.

**Delta:** minor — the wizard works, but adding step-count eyebrows ("STEP 1 OF 4 · ABOUT YOU") would make it feel rooted in the design system. Low-stakes polish.

## What the design system shows but production doesn't need

- **5-tab BottomNav** — superseded by 3-tab + FAB per `designs/home-screen.jsx`.
- **Status-ring centerpiece** in `app.css` — the design moved away from the ring to the alert-hero card. The CSS is in `app.css` as design-system reference but production doesn't render it. Not a gap; just unused design-system CSS.
- **Marketing UI kit** in `ui_kits/marketing/` — out of scope (no marketing site yet, pre-launch).

## Source files referenced in this audit

Design:
- `/tmp/heartnote-design-system/README.md` — voice + visual foundations
- `/tmp/heartnote-design-system/SKILL.md` — usage rules
- `/tmp/heartnote-design-system/colors_and_type.css` — design tokens
- `/tmp/heartnote-design-system/ui_kits/app/screens.jsx` — Login/Dashboard/VoiceLog/Meds/Trends mocks
- `/tmp/heartnote-design-system/ui_kits/app/app.css` — kit-shared styles
- `/tmp/heartnote-design-system/designs/home-screen.jsx` — newer alert-state home
- `/tmp/heartnote-design-system/designs/baseline-screen.jsx` — cold-start home
- `/tmp/heartnote-design-system/preview/{brand,type,components,colors,spacing}.html` — foundation samples

Production:
- `src/app/globals.css`, `src/app/layout.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/log/page.tsx`, `src/app/log/voice-log-client.tsx` (state machine restricted)
- `src/app/login/page.tsx`, `src/app/login/login-form.tsx`
- `src/app/trends/page.tsx`
- `src/app/visits/{page,new,[id]}.tsx`, `src/app/family/page.tsx`, `src/app/s/[token]/page.tsx`
- `src/app/me/page.tsx`, `src/app/me/medications/page.tsx` (display only)
- `src/app/onboarding/{page,wizard}.tsx`
- `src/components/heartnote/*` (every file)
- `next.config.ts`

## Constraints surfaced from memory

1. **`project_medications_wizard_parallel_work.md`** (dated 2026-05-06): the medications wizard files (`/me/medications/new`, `/me/medications/[id]`, `/me/medications/scan`, `_flow/*`) have unreconciled parallel work. **In scope for this audit:** the *display layer* — `TodaysMedsCard`, `TodaysMedsList`, `/me/medications/page.tsx` row rendering. **Out of scope:** the wizard step components and edit flow.

2. **`project_voice_log_redesign.md`**: the recording state machine inside `voice-log-client.tsx` is part of an active streaming-transcription redesign and is restricted. **In scope for this audit:** `/log/page.tsx` shell, bottom-nav behavior on `/log`, the visual surround of the recording UI. **Out of scope:** state transitions, timer logic, transcript rendering, tile-grid extraction.

The phase plan that follows derives from this audit's gap list and these constraints.
