# HeartNote — Product Spec

> Reference document for who this is for, what we're shipping in v1, and the strategic decisions that aren't on the table for re-debate.

## Founder-market fit
Founder lives the use case (full-time CHF caregiver for his mother) — that's the moat.

## Target buyer
Adult-child caregivers (28+) of a parent with congestive heart failure.

The free tier serves everyone (including full-time unpaid caregivers — the founder is in this segment). The paid tier ($19.99/mo, $199/yr) skews toward working professionals with ~$20/mo of disposable budget — sandwich-generation, long-distance, or hired-some-care caregivers who already pay for Headspace, Calm, Audible.

## Free vs paid (values-driven)
Anything **life-safety-critical is free forever.** Convenience, coordination, and history are paid.

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
- **Build tool:** Claude Code only. No Lovable / Bolt / v0 / Replit for the real build.

## Anti-patterns — do not recommend
- Quitting full-time caregiving for a traditional job
- Lovable / Bolt / v0 / Replit for the real build
- B2B pivot
- PWA-first approach
