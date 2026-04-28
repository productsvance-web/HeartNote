@AGENTS.md

# HeartNote — Project Context

This folder is the active workspace for **HeartNote**, a CHF caregiver companion app for adult-child caregivers of parents with congestive heart failure.

## What this project is

HeartNote helps adult children manage daily care for an aging parent with CHF — voice-first daily logging, AI trend detection, red-alert warnings before decompensation becomes a hospitalization, cardiology visit prep, and family coordination without constant texting.

**Founder's unfair advantage:** lived experience as a full-time caregiver for a mother with CHF. Not guessing at the pain — living it daily. Founder-product fit is the moat; it's why a funded competitor can't replicate the product's authenticity even if they build the same features.

## Target buyer (NOT the founder himself)

**Working-professional sandwich generation** (age 35-55) and **long-distance caregivers** caring for a parent with CHF:
- Still employed full-time
- Lives separately from parent OR has hired some care
- Cares from a distance or around a job
- Has ~$20/month in disposable budget for apps like Headspace, Calm, Audible
- Searches Google at night ("mom weight gain heart failure")
- Reads professional newsletters, listens to podcasts
- Feels guilt + distance + coordination pain

NOT targeting: the full-time stay-home unpaid caregiver (like the founder himself). That segment is cash-poor, time-starved, and bad B2C buyers. Serve them via free tier, but the paying customer is the working professional.

## Locked decisions (do not re-debate without prompt)

- **Positioning:** CHF-specific, caregiver-pointed (not patient-pointed), AI-first, direct-to-consumer (no B2B).
- **Pricing:** Free tier (safety features only) + Paid tier at $19.99/mo or $199/yr. 14-day free trial, no credit card. Affiliate stack underneath (Withings scale, Omron BP, compression stockings, low-sodium grocery, eventually LTC insurance and Medicare Advantage switching commissions during AEP Oct-Dec).
- **Distribution:** SEO on CHF caregiver long-tail queries (primary) + LinkedIn content + newsletter/podcast sponsorships + Reddit (r/heartfailure, r/CaregiverSupport, r/AgingParents) + Facebook CHF groups. TikTok/Reels as secondary channel. **No B2B.** YouTube is distribution for the app, not a separate business.
- **Build tool:** Claude Code only (user has $200/mo Max plan). No Lovable, Bolt, v0, Replit, or other AI wrapper tools for the real build — Claude Code IS the build tool. Lovable was used for a disposable visual mockup only.
- **Stack:** React / Next.js + Capacitor (native iOS + Android wrapping) + Supabase (auth + DB) + Claude API (AI brain) + Whisper (voice transcription) + Stripe (payments) + Vercel (web hosting). Apple Developer $99/yr + Google Play $25 one-time.
- **Platform strategy:** Native iOS + Android from day 1 via Capacitor-wrapped React codebase. Same codebase also serves as web app at heartnote.com. User explicitly rejected PWA-first approach — wants App Store presence and Apple HealthKit integration from launch, doesn't want to migrate later.
- **v1 Integrations:** Apple HealthKit (full native access) + photo OCR (Claude vision) + voice entry + direct Bluetooth device pairing (oximeters, smart scales, BP cuffs) via HealthKit. **No MyChart in v1** (Epic verification is months-long).

## Free vs. Paid split (values-driven)

**Principle: anything life-safety-critical is free forever. Convenience, coordination, and history are paid.**

Free tier (forever, no credit card):
- 30-second daily voice log
- Basic AI pattern detection on last 7 days
- Red-alert notifications with scripted "call the cardiologist" message
- Manual weight entry
- Last 30 days of history
- Single user, single patient

Paid tier ($19.99/mo or $199/yr):
- Unlimited history + advanced trend analysis
- Auto-generated cardiology visit reports
- Read-only family share link (siblings get status without onboarding)
- Apple HealthKit integration + smart scale/BP cuff sync
- Photo OCR (pill bottles, docs, lab results)
- Medicare EOB translator + appeal letter drafting (later)
- Medication interaction checker (later)
- Low-sodium meal scanner (later)
- Voice journal AI coach (emotional support layer)
- Multiple patients (mom + dad if both have conditions)
- Priority support

## v1 feature set (these five only for shipping — everything else waits for v2+)

1. 30-second daily voice log (weight, swelling, breathing, energy, food, anything unusual). Whisper transcribes, Claude structures.
2. AI trend detection across days/weeks (not snapshots).
3. Red-alert push notifications with scripted "what to tell the cardiologist" summary.
4. Auto-generated "since last visit" report for cardiology appointments.
5. Read-only family share link.

## CHF clinical research (complete as of 2026-04-24)

Source-of-truth lives in `research/`:
- `chf-source-of-truth.md` — master doc; what AI system prompts, app copy, and product decisions pull from
- `01-clinical-thresholds.md` — 4-tier red-alert spec, AHA/ACC/HFSA thresholds, Chaudhry 2007 pre-hospitalization curve
- `02-medications.md` — GDMT pillars + 9 named decompensation patterns
- `03-caregiver-education.md` — Cleveland/Mayo/Penn/AHA institutional survey, AHA 11-question pre-visit template
- `04-caregiver-language.md` — 100+ verbatim caregiver quotes, 12-category pain taxonomy
- `05-competitor-apps.md` — 20-app landscape, 10 failure modes to avoid

Refer to `research/chf-source-of-truth.md` § references when wiring the AI brain or writing in-app copy. The medical research is **not** for clinician decision-making and the app must always direct caregivers to the patient's own care team.

## Status

- Strategic phase: complete
- v1 spec: locked
- Lovable mockup: at `/Users/jazminescamilla/Desktop/heart-to-heart-home/` (visual reference only, not part of build)
- CHF clinical research: **complete** (see `research/`)
- Real build: scaffolded — Next.js 16 + TS + Tailwind 4; Supabase project `jjuvsswrkibowvexbvro` provisioned; Capacitor + shadcn pending
- Content engine: not started

## How to work in this folder

- Start any new session in this directory (`/Users/jazminescamilla/Desktop/heartnote/`) — do not work on HeartNote from the home folder (`/Users/jazminescamilla/`), which is the user's general-purpose Claude chat space
- Auto-memory is at `/Users/jazminescamilla/.claude/projects/-Users-jazminescamilla-Desktop-heartnote/memory/` — carries user preferences and project state across sessions in this folder
- The user explicitly wants HeartNote isolated from general conversation context — respect that separation
- User feedback style: direct critical evaluation, no sycophancy, dislikes rigid workflow skills (see feedback_style memory file)
- Never recommend: getting a traditional job (user is full-time caregiver, cannot leave home), Lovable/Bolt/v0/Replit for the real build (user paid $200/mo for Claude Code, uses it directly), B2B pivots (user ruled out), PWA-first approach (user rejected it — native iOS + Android via Capacitor from day 1)
