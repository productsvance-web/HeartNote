<!-- BUDGET: stay under 100 lines. Add a rule, remove one first. Concept-level only. -->
<!-- DO NOT re-read this file once loaded. Same for research/chf-source-of-truth.md. -->
@AGENTS.md

# HeartNote — CHF caregiver companion (PRE-LAUNCH, ZERO CUSTOMERS)

Voice-first daily logging, AI trend detection, and red-alert warnings for adult-child caregivers of parents with congestive heart failure. Founder lives the use case (full-time CHF caregiver for his mother) — that's the moat.

**No backwards-compatibility, no migration paths, no fallbacks for "existing customers." If something needs changing, change it.**

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind 4 · shadcn/ui · Supabase (Postgres + Auth + RLS) · Capacitor (iOS + Android) · Anthropic Claude API · Whisper · Stripe · Vercel

## Commands
```bash
npm run dev                 # Dev server
npm run build               # Production build (timeout 300000, NEVER background)
npm run lint                # Lint
supabase db push            # Apply migrations (run BEFORE merging migration changes)
```

## Git / PR
`git push` → `gh pr create` → `gh pr checks --watch` → on pass `gh pr merge --squash`. Never leave a PR open for the user to merge. One branch per fix/feature; delete after merge. Use worktrees for parallel work.

## Migrations
If you created or modified anything in `supabase/migrations/`, run `supabase db push` before merging. Code without its migration is broken code.

## Build conventions (always apply)
1. **Cite `research/chf-source-of-truth.md` for every clinical claim, threshold, or alert copy.** Never invent a number.
2. **AI alerts must show their reasoning** in the UI ("weight up 4 lb over 5 days AND extra pillows logged AND nocturnal cough — pattern often precedes decompensation").
3. **Pass the grelief test on every caregiver-facing line.** No chirpy "you're doing great"; no funeral-serious. Sit with the oscillation.
4. **RLS-first.** Every new Supabase table gets RLS enabled and policies written before any code reads/writes it.
5. **Use `@/lib/supabase/{client,server,middleware}` only.** Never instantiate Supabase clients directly in components.
6. **Anthropic calls: prompt caching enabled from day 1.** Sonnet 4.6 for trend synthesis (cost), Opus 4.7 for visit-report drafting (quality).
7. **Life-safety features never paywalled.** Red alerts, daily voice log, scripted "call the cardiologist" — free forever.
8. **Never recommend dose changes** in any AI output. Always direct to the prescriber.
9. **Voice log is the non-negotiable core.** Prefer voice over forms. Forms are secondary.
10. **No half-finished implementations.** Hide unfinished features behind a flag — never ship a dead button.
11. **Validate inputs at boundaries.** Zod at form fields and API routes.
12. **Environment variables fail closed.** Missing secret → throw, never substitute a default.

## Target buyer
Adult-child caregivers (28+) of a parent with CHF. Free tier serves everyone (including full-time unpaid caregivers; founder is in this segment). Paid tier ($19.99/mo, $199/yr) skews toward working professionals with ~$20/mo of disposable budget — sandwich-generation, long-distance, or hired-some-care caregivers who already pay for Headspace, Calm, Audible.

## Free vs. paid (values-driven)
Anything **life-safety-critical is free forever**. Convenience, coordination, and history are paid.
- **Free:** 30-sec voice log, basic 7-day trend, red-alert push notifications, manual weight entry, last 30 days history, single user/single patient.
- **Paid:** unlimited history, advanced trend analysis, auto-generated visit reports, family share link, HealthKit + smart-device sync, photo OCR, multi-patient.

## v1 feature set (these 5 only — everything else waits for v2)
1. 30-second daily voice log (Whisper → Claude structures it)
2. AI trend detection across days/weeks
3. Red-alert push notifications with scripted "what to tell the cardiologist"
4. Auto-generated "since last visit" cardiology report
5. Read-only family share link

## Locked decisions (don't re-debate without prompt)
- **Positioning:** CHF-specific, caregiver-pointed (not patient-pointed), AI-first, DTC. **No B2B.**
- **Distribution:** SEO on CHF caregiver long-tail (primary) + LinkedIn + newsletter/podcast sponsorships + Reddit (r/heartfailure, r/CaregiverSupport, r/AgingParents) + FB CHF groups. TikTok/Reels secondary.
- **Platform:** Native iOS + Android via Capacitor + same codebase as web (heartnote.com). User explicitly rejected PWA-first.
- **v1 integrations:** Apple HealthKit, photo OCR (Claude vision), voice entry, Bluetooth pairing via HealthKit. **No MyChart in v1.**
- **Build tool:** Claude Code only. No Lovable/Bolt/v0/Replit for the real build (Lovable was a disposable mockup).

## Research source-of-truth
Always reference `research/chf-source-of-truth.md` (master) before writing clinical/alert/copy code. Five topic-specific deep-dives in the same folder: `01-clinical-thresholds.md`, `02-medications.md`, `03-caregiver-education.md`, `04-caregiver-language.md`, `05-competitor-apps.md`.

## Status
Scaffold complete (Next.js 16 + Supabase + Capacitor + shadcn). Schema next. Then auth, voice log, AI trend, alerts, visit report, family share.

## How to work in this folder
- Start sessions in `/Users/jazminescamilla/Desktop/heartnote/` (not the home folder).
- Auto-memory: `~/.claude/projects/-Users-jazminescamilla-Desktop-heartnote/memory/`.
- User feedback style: direct critical evaluation, no sycophancy. Dislikes rigid workflow skills.
- **Never recommend:** quitting full-time caregiving for a traditional job; Lovable/Bolt/v0/Replit for the real build; a B2B pivot; a PWA-first approach.
