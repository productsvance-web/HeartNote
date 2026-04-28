# HeartNote — Competitor Apps Research

**Date compiled:** 2026-04-24
**Purpose:** Map the existing CHF / heart-failure / caregiver-coordination app landscape to find whitespace for HeartNote (CHF-specific, caregiver-pointed, AI-first, voice-first, $19.99/mo).
**Method:** App Store + Play Store listings, publisher sites, academic MARS reviews, Reddit/Trustpilot/ComplaintsBoard where surfaced by search. Where a number couldn't be verified, it's flagged.

---

## Executive summary (read this first)

- **No one is building the founder's exact product.** There is *no* CHF-specific, caregiver-pointed, voice-first, AI-first tracker on either App Store. Every existing CHF app is patient-pointed with manual form entry.
- **The category is mostly abandonware or academic pilots.** Heart Failure Manager, HeartMapp, Habits Heart App, HF Path, Cormeum — low review counts (often under 50), slow updates, patient-pointed.
- **The real competitors are adjacent, not direct.** MyTherapy (7.8K ratings, huge reach) owns "medication reminder + optional CHF tracking." CaringBridge (19K+ ratings) owns "family health updates." KardiaMobile (212K ratings) owns "device + app for heart." Papa ($1.4B valuation) owns "companion care via Medicare Advantage."
- **The biggest structural risk is an AI-voice CHF product from a funded player.** Noah Labs is doing voice-biomarker CHF detection for EU regulatory approval. If they pivot consumer, they're dangerous. Otherwise, no direct threat.

---

## Apps investigated

### 1. MyTherapy (smartpatient GmbH)
- **Platforms:** iOS + Android + web
- **Positioning:** General medication reminder; CHF is one of many chronic-disease use cases. Patient-pointed.
- **Pricing:** Free core; $1.99/mo ad-free; $49.99 lifetime Plus tier; $14.99 alternate sub
- **Data collected:** Medications, weight, BP, symptoms, pain diary, mood, measurements. Monthly PDF health reports.
- **AI features:** None claimed. Rule-based reminders only.
- **Integrations:** Fitbit, Google Fit, Apple Health. Family profiles for shared care.
- **Caregiver features:** "Family profiles" for shared care — one of the few apps with any caregiver handling.
- **App Store:** iOS 4.8 (7.8K ratings); Play Store listing exists, couldn't extract exact count
- **Top praises:** "ADHD and busy life: very helpful!" / "Perfect amount of reward for ADHD" / "I had never been able to be 100% consistent with medication until this app."
- **Top complaints:** Notification/alarm reliability ("alarm has become too quiet"), UI complexity after redesign ("unnecessarily complicated to use"), data loss after updates, medication database incomplete (manual entry required), recently introduced ads.
- **Last updated:** 4 days before fetch (very active)
- **URLs:** https://apps.apple.com/us/app/pill-reminder-mytherapy/id662170995 · https://www.mytherapyapp.com/

### 2. Cormeum (Ginkgo Heart LLC)
- **Platforms:** iOS + Android
- **Positioning:** CHF-specific, patient-pointed. Smallest, most direct competitor by condition.
- **Pricing:** 14-day free trial. **$9.99 one-time lifetime purchase.** (Some sources cite $9.95.) Not a subscription.
- **Data collected:** Weight, sodium intake, fluid in/out, medications, symptoms, mood, BP. Auto-calculates sodium/carbs/calories from meal entry.
- **AI features:** None. "Smart" branding refers to daily checklists.
- **Integrations:** Data sharing with provider via PDF/export. Apple Health not prominently advertised.
- **Caregiver features:** Not mentioned as a primary feature. Provider-share yes; family-share no.
- **App Store:** iOS 4.6 (only **7 ratings**); Play Store couldn't extract, but review volume is very low.
- **Top praises:** NP said: "It lets patients track what's important and reminds them to keep everything up-to-date." Clean interface, easy for non-tech-savvy users.
- **Top complaints:** Feature gaps (cholesterol tracking requested and developer put on wishlist). No material negative reviews surfaced — mostly because review volume is too low to generate signal.
- **Last updated:** October 29, 2025 (v1.0.9). Actively maintained but glacial pace — still sub-1.1 version five years in.
- **Funding:** None raised per search. Founded by Lesley Hanselman in January 2021. Member of AHA's Center for Health Technology and Innovation.
- **URLs:** https://apps.apple.com/us/app/cormeum-track-heart-health/id1541800519 · https://cormeumapp.com/
- **Assessment:** Closest direct competitor by condition but structurally weak — one-time-purchase pricing caps LTV, no AI, no caregiver angle, tiny install base, no funding.

### 3. Heart Failure Health Storylines / Health Storylines (Self Care Catalysts Inc)
- **Platforms:** iOS + Android + web. Branded versions exist for multiple conditions; the CHF version is partnered with HFSA (Heart Failure Society of America).
- **Positioning:** Patient-pointed CHF self-management. Top-ranked in Columbia University MARS study for behavior change.
- **Pricing:** Free (sponsored — likely B2B pharma/society funded)
- **Data collected:** Medications, symptoms, vitals, moods, appointments, journal entries
- **AI features:** None
- **Integrations:** Limited; some device sync
- **Caregiver features:** **Yes.** "Circles of support" — user can invite friends/family by email, share each feature (symptoms, vitals, moods, journal) per-circle or keep private. Closest to what HeartNote wants to do.
- **App Store:** iOS 3.6 (only 81 ratings on parent Health Storylines listing); Heart Failure Storylines standalone listing now 404s in US (may be consolidated into parent)
- **Top praises:** "The use of this app has made my live easier"; high academic MARS score for behavior change
- **Top complaints:** Unit conversion bug (lbs → kg in view), app freezes when adding custom vitals, can't manually enter medication history after update, no emergency-contact storage, limited medication database, glitchy/slow.
- **Last updated:** March 19, 2025 (v7.99.4)
- **URLs:** https://apps.apple.com/us/app/health-storylines/id935411489 · https://www.healthstorylines.com/
- **Assessment:** Academically respected but user-UX score is 3.6 stars — users are frustrated with bugs. Caregiver circles are the right idea but poorly executed.

### 4. Heart Failure Manager (@Point of Care)
- **Platforms:** iOS only
- **Positioning:** Patient-pointed CHF daily journal; also has a companion clinician app ("Heart Failure [HF]") from same publisher targeting doctors.
- **Pricing:** Free (likely B2B/sponsored — @Point of Care serves clinicians)
- **Data collected:** Daily journal with sliders for symptoms, mood, pain, meds, weight, BP, activity. Photo upload of symptoms.
- **AI features:** None
- **Integrations:** Apple Health + Apple Watch (heart rate)
- **Caregiver features:** "Connect with care providers" — clinician focus, not family.
- **App Store:** iOS 4.3 (only **7 ratings**)
- **Top praises:** Data visualization ("colorful pie charts"), Apple Watch integration, care team sharing
- **Top complaints:** "Great if it didn't crash, forgot your login info you just made, didn't send a password reset email." Authentication is broken per January 2025 review.
- **Last updated:** 3 days before fetch (v11.0.7)
- **URL:** https://apps.apple.com/us/app/heart-failure-manager/id1364043356
- **Assessment:** Clinician-first publisher pretending to serve patients. Low adoption.

### 5. CardioAssist
- **Platforms:** iOS (listing returns 404 when fetched — may have been delisted; search results showed it as available)
- **Positioning:** Patient-pointed CHF. Built by Dr. Hamza Akhtar (cardiology fellow) + Marwan Zaarab.
- **Pricing:** Listed as free; no data collected per privacy disclosure
- **Data collected:** Symptoms, fluid intake, weight, medications
- **AI features:** None
- **Integrations:** Unknown
- **Caregiver features:** None documented
- **App Store:** Insufficient reviews to surface rating
- **Last updated:** Unknown (404 today — **flagged as possibly abandoned or regionally restricted**)
- **URL:** https://apps.apple.com/us/app/cardioassist/id6449150293
- **Assessment:** Solo-physician side project. Not a real competitor.

### 6. KardiaMobile / Kardia (AliveCor)
- **Platforms:** iOS + Android
- **Positioning:** Personal ECG device + app. Arrhythmia focused (AFib, brady, tachy), NOT CHF-focused. Patient-pointed.
- **Pricing:** Device $79-$149 one-time; app free for basic; KardiaCare subscription ~$12.99-$13.99/mo or $99/yr for advanced analysis, unlimited history, cardiologist review tier up to $299/yr.
- **Data collected:** 30-second ECG recordings. KardiaCare tier: unlimited history, monthly summary, cardiologist review.
- **AI features:** FDA-cleared rhythm classification (AFib/brady/tachy/normal). Not trend-based AI.
- **Integrations:** Apple Health (heart rate). Email/text ECG to doctor.
- **Caregiver features:** None. Solo-user.
- **App Store:** iOS 4.8 (**212K ratings** — massive reach for the category)
- **Top praises:** Early AFib diagnosis, peace of mind, "faxed EKGs to cardiologist, diagnosis same day"
- **Top complaints:** Paywall creep ("need to pay $100/yr for features I already bought the hardware for"), subscription-to-unlock-hardware-features pattern, connectivity and battery issues, aggressive upsell.
- **Last updated:** April 15, 2025 (v5.57.1)
- **Funding:** $318M total raised (Pitchbook), $114M per Tracxn; Series F Aug 2022 led by GE Healthcare. 130K+ KardiaCare paying members. Serious player.
- **URLs:** https://apps.apple.com/us/app/kardia/id579769143 · https://kardia.com/
- **Assessment:** Adjacent not direct. Threat = credibility + distribution, not feature overlap. Their users skew arrhythmia, not CHF decompensation. BUT: a well-funded public cardiology brand with 130K+ paying subs could ship a CHF module.

### 7. Heart Habit / Habits Heart App (Jana Care + Mass General)
- **Platforms:** iOS + Android (research pilot distribution)
- **Positioning:** Patient engagement tool for heart failure, developed with MGH cardiologists.
- **Pricing:** Not commercially available. Research/pilot context only.
- **Data collected:** To-do lists, symptoms, weight (Bluetooth scale), sodium, exercise. Action prompts on weight/symptom severity.
- **AI features:** Rule-based action prompts, no real AI.
- **Integrations:** Bluetooth scale.
- **Caregiver features:** None (it has messaging to study staff/MDs, not family).
- **App Store:** Not a public product.
- **Research findings:** 28-patient pilot. Correlation between app use duration and KCCQ quality-of-life + AHFKT knowledge scores.
- **URL:** Academic: https://mhealth.jmir.org/2021/1/e19465/
- **Assessment:** Not a competitor. Instructive for what to build (to-do-list + tracking + nudges correlates with QoL gains).

### 8. Propeller Health (ResMed)
- **Platforms:** iOS + Android, sensor hardware
- **Positioning:** Respiratory (asthma/COPD), NOT CHF. Adjacent condition.
- **Pricing:** Sensor ~$300; distributed via payer/provider grants, not direct consumer.
- **Data collected:** Inhaler use events, triggers, symptoms, environment
- **AI features:** Personal insights / pattern detection (claimed; unverified as genuine ML)
- **Integrations:** EHR integration (Dignity Health / CommonSpirit deployment)
- **Caregiver features:** **Yes — caregiver accounts exist for a patient's account.** One of few apps with real caregiver proxy access.
- **Clinical results:** 58% increase in adherence, 78% reduction in rescue inhaler use (asthma).
- **Business model:** B2B via payers/PBMs. Acquired by ResMed.
- **URL:** https://propellerhealth.com/
- **Assessment:** Not a direct competitor (wrong condition, wrong GTM), but **valuable model** — caregiver accounts + sensor + adherence data = proof that payers will pay for this category. Worth emulating the caregiver-account architecture.

### 9. CareZone
- **Platforms:** Formerly iOS + Android + web
- **Positioning:** Caregiver medication coordination — strongest caregiver-pointed positioning in the space.
- **Pricing:** Was free
- **Status:** **Acquired by Walmart June 2020 for $200M. Consumer app shut down May 2021.**
- **Caregiver features (historical):** Meds, journal, contacts, calendar, to-do, photos/files, broadcast audio messages, sharing. The best caregiver-first product the space has seen.
- **URL:** https://carezone.com/ (splash only)
- **Assessment:** **Critical precedent.** CareZone proved caregivers want a product like this — Walmart paid $200M for it. Its shutdown left a vacuum HeartNote can step into. Medisafe now sells "Medisafe Carezone: PillMemo" reusing the name; unclear continuity.

### 10. CaringBridge
- **Platforms:** iOS + Android + web. 501(c)(3) nonprofit.
- **Positioning:** Family health updates / caregiver journaling. Any condition, not CHF-specific.
- **Pricing:** Free (donation-supported nonprofit)
- **Data collected:** Journal posts, photos, guestbook. Not structured health data.
- **AI features:** None
- **Caregiver features:** Ask-for-help, community guestbook, coordinated updates. Strong.
- **App Store:** iOS 4.9 (**19K+ ratings**). Major consumer traction.
- **Top praises:** "Saving grace" / eliminates need for individual phone calls / "great site to collect and keep track of a personal health journey"
- **Top complaints:** App slow/unresponsive editing drafts; no comment-reply notifications; **donation page confusion — funds go to CaringBridge nonprofit, not the family** (complaints on ComplaintsBoard/BBB). Tribute wording misleading.
- **Last updated:** April 15, 2024 (v9.5.2) — **almost a year stale** for a major app.
- **URL:** https://www.caringbridge.org/
- **Assessment:** Strong adjacent competitor for "family communication" but not health tracking. HeartNote's read-only share link is CaringBridge-lite + structured CHF data. CaringBridge is not a threat; it's complementary.

### 11. Lotsa Helping Hands
- **Platforms:** iOS + Android + web
- **Positioning:** Caregiver task coordination (meals, rides, appointments). Not condition-specific.
- **Pricing:** Free
- **Data collected:** Care calendar, task sign-ups, announcements
- **AI features:** None
- **Caregiver features:** Full coordination suite — primary focus
- **App Store:** iOS **2.7 stars** (48 ratings). Weak rating.
- **Top praises:** "Stable and user-friendly" for large community groups
- **Top complaints:** No calendar view (only list), no share button on mobile, comments don't sync between mobile and web ("makes the app completely useless"), can't edit posts.
- **Last updated:** April 2, 2025 (v5.0.2)
- **URL:** https://lotsahelpinghands.com/
- **Assessment:** Buggy, low-rated. Caregiver coordination is underserved broadly, not just in CHF. Not a real threat.

### 12. Papa / Papa Pal
- **Platforms:** iOS + Android + web
- **Positioning:** Companion care marketplace for older adults. "Family on demand." Not tracking/data app.
- **Pricing:** Free to members; distributed exclusively via Medicare Advantage and Medicaid plans (~65-100 health plans). Individual consumers cannot purchase directly.
- **Data collected:** Visit logs, minimal health data
- **AI features:** None material
- **Caregiver features:** Connects seniors with "Papa Pals" (gig caregivers), not tech for existing family.
- **Funding:** $1.4B valuation (Series D $150M, Nov 2021, SoftBank Vision Fund 2 lead). $240M total raised.
- **URL:** https://www.papa.com/
- **Assessment:** **Not a competitor product-wise, but a competitor for distribution budget and narrative attention in "older-parent care."** Also an example of B2B-via-payer playbook — NOT the model HeartNote is using (user explicitly rejected B2B). Papa has the capital to launch a tracking app if they wanted, but their business is labor marketplace, not SaaS.

### 13. Corrie Health (Johns Hopkins)
- **Platforms:** iOS + Android; Apple CareKit + Apple Watch + iHealth BP cuff bundle
- **Positioning:** Post-myocardial-infarction recovery, not CHF specifically. Patient-pointed, provider-deployed.
- **Pricing:** Free consumer (hospital-distributed)
- **Data collected:** Medications, vital signs, activity, education completion
- **AI features:** None claimed
- **Integrations:** Apple Watch, iHealth BP cuff, Apple CareKit
- **Caregiver features:** Minimal
- **App Store:** iOS 4.6 (33 ratings)
- **Clinical results:** Johns Hopkins MiCORE study showed **52% relative risk reduction in 30-day readmissions** vs. standard of care.
- **Last updated:** March 15, 2025 (v4.1.339)
- **URLs:** https://apps.apple.com/us/app/corrie-health/id1212463532 · https://corriehealth.com/
- **Assessment:** Academic / hospital-distributed product with real clinical credibility. Not consumer-sold. Could pivot but hasn't.

### 14. HF Path (American Heart Association)
- **Platforms:** iOS only (+web at heart.org/hfpath)
- **Positioning:** Patient self-management (AHA-branded), CHF
- **Pricing:** Free
- **Data collected:** Symptoms, weight, medication, activity (via Apple Health)
- **AI features:** None — interactive courses, group chat
- **Integrations:** Apple Health
- **Caregiver features:** Peer support/group chat via AHA Support Network. Not family share.
- **App Store:** US listing returns 404 in fetch (India listing exists). **Flagged as possibly delisted in US** — couldn't verify rating/review count.
- **URL:** https://www.heart.org/en/health-topics/heart-failure/heart-failure-tools-resources/hf-path-heart-failure-self-management-tool
- **Assessment:** AHA's own product. Free but apparently minimally supported. AHA brand is distribution if they cared, but they don't seem to be pushing it.

### 15. CareClinic
- **Platforms:** iOS + Android + Amazon + web
- **Positioning:** General chronic-illness tracker (markets itself for CHF + many other conditions). Claims 500K caregivers using it.
- **Pricing:** Free core; paid tiers $5.99/mo (Easy Pass), $34.99 (Smart Pass), $39.99 (Steady Pass), up to $79.99; also ~$60/yr annual
- **Data collected:** Symptoms, meds, mood, diet, vitals — flexible structure
- **AI features:** Marketing mentions "AI insights" but unverified depth
- **Integrations:** Apple Health, device sync
- **Caregiver features:** Caregiver can monitor patient's data remotely. Marketed as caregiver-friendly.
- **App Store:** iOS 4.3 (**2,200 ratings** — most-reviewed general chronic-illness tracker)
- **Top praises:** Fertility/ovulation tracking; doctor conversations improved (82% stat from marketing)
- **Top complaints:** **Aggressive paywall** ("can only track three symptoms before it's nagging you to pay"); support unresponsive ("emailed support almost a dozen times without a response"); buggy initial setup.
- **URL:** https://careclinic.io/ · https://apps.apple.com/us/app/tracker-reminder-careclinic/id1455648231
- **Assessment:** Competitor on pricing and review volume. BUT — they are not CHF-specific, not voice-first, and caregiver features are thin. The "500K caregivers" number is likely marketing puffery given their 2.2K reviews. Paywall complaints are instructive for HeartNote's pricing model.

### 16. HeartMapp (University of South Florida)
- **Platforms:** Android only
- **Positioning:** Academic CHF self-management product. Green/yellow/red zone classification.
- **Pricing:** Research-only
- **Data collected:** Weight, BP, CHF symptoms, walking test, breathing exercise, mood/memory assessment
- **AI features:** Rule-based zone classification (green/yellow/red). Not ML.
- **Integrations:** Bluetooth chest-worn device
- **Caregiver features:** None
- **URL:** https://onlinejcf.com/article/S1071-9164(16)30452-3/fulltext
- **Assessment:** Academic, not commercial. Instructive for the red-zone UX pattern — matches what HeartNote wants to ship.

### 17. myHeart (my mhealth Ltd, UK)
- **Platforms:** iOS + Android (UK NHS primarily)
- **Positioning:** Cardiac rehab / heart disease, patient-pointed. B2B to NHS.
- **Pricing:** Not disclosed publicly; NHS contract sold.
- **Data collected:** Weight, BP, symptoms, activity, ECG/ECHO report storage
- **AI features:** None claimed
- **Integrations:** Omron BP cuff + scale Bluetooth
- **Caregiver features:** **None.** Patient-only.
- **URL:** https://mymhealth.com/myheart
- **Assessment:** UK-focused, B2B/NHS. Not a US consumer threat.

### 18. Apple Heart & Movement Study / Apple Heart Study (Stanford + BWH)
- **Platforms:** iOS (Apple Watch-dependent)
- **Positioning:** Research, not consumer product. AFib detection via watch.
- **CHF-specific?** No — arrhythmia detection. Apple exploring CHF monitoring as future direction but no product.
- **Assessment:** Not a product competitor. But Apple itself remains the long-term platform risk — if HealthKit gets a CHF alerting API, HeartNote needs to be the best consumer on top of it.

### 19. Carely
- **Platforms:** iOS + Android
- **Positioning:** Family caregiver coordination (shared calendar, visit logging, chat). Not condition-specific.
- **Pricing:** Free tier; paid tiers unclear
- **Caregiver features:** Primary focus — calendar, visit logs, group chat
- **Assessment:** Adjacent coordination tool. Low profile. Not a CHF threat.

### 20. Noah Labs VoX (voice-biomarker CHF detection)
- **Platforms:** Research, pre-regulatory
- **Positioning:** AI voice analysis to predict worsening heart failure from voice changes (lung-fluid acoustic signature).
- **Status:** EU approval expected mid-2026; FDA breakthrough designation. Not yet consumer-launched.
- **URL:** https://pudgycat.io/ai-voice-heart-failure-detection-noah-labs-vox/
- **Assessment:** **STRATEGIC THREAT.** The only player credibly combining "voice + AI + CHF." If they launch a consumer-facing caregiver product, HeartNote loses differentiation on "voice + AI." Monitor closely. Their advantage is clinical validation; HeartNote's is caregiver-pointed UX and pricing accessibility.

---

## A. Feature matrix

| App | CHF-specific | Caregiver-pointed | Voice entry | AI trend detection | Red alerts | Family share | HealthKit | Smart scale sync | Visit report | $/mo |
|---|---|---|---|---|---|---|---|---|---|---|
| MyTherapy | No | Partial (family profiles) | No | No | No (simple reminders) | Yes (family profiles) | Yes | No | Yes (monthly PDF) | Free / $1.99-14.99 |
| Cormeum | Yes | No | No | No | No | No (provider share only) | Unknown | No | PDF export | $9.99 one-time |
| Heart Failure Health Storylines | Yes | Yes (circles) | No | No | No | Yes | Partial | No | Yes | Free |
| Heart Failure Manager (@POC) | Yes | No | No | No | No | No | Yes | No | Yes | Free |
| CardioAssist | Yes | No | No | No | Unknown | No | Unknown | No | Unknown | Free |
| KardiaMobile | No (arrhythmia) | No | No | No (rhythm classifier only) | Yes (AFib alerts) | No | Yes (HR) | N/A | Monthly summary | Free / $12.99-13.99 |
| Heart Habit (MGH) | Yes | No | No | No | Partial (action prompts) | No | No | Yes | No | Research only |
| Propeller Health | No (respiratory) | Yes | No | Partial | Partial | Yes | No | N/A | Yes | B2B via payer |
| CareZone | No (discontinued) | Yes | No | No | No | Yes | Partial | No | No | Was free |
| CaringBridge | No | Yes | No | No | No | Yes (public/group) | No | No | No | Free |
| Lotsa Helping Hands | No | Yes | No | No | No | Yes (tasks) | No | No | No | Free |
| Papa | No | No (marketplace) | No | No | No | No | No | No | No | Via MA plan |
| Corrie Health | No (post-MI) | No | No | No | No | No | Yes | Via iHealth BP | Partial | Free |
| HF Path (AHA) | Yes | No (peer chat) | No | No | No | No | Yes | No | No | Free |
| CareClinic | No (general) | Partial | No | Marketing-only | No | Yes | Yes | Partial | Yes | $5.99-79.99 |
| HeartMapp | Yes | No | No | Rule-based zones | Yes (red zone) | No | No | Bluetooth chest | No | Research |
| myHeart (UK) | Partial (cardiac) | No | No | No | No | No | No | Omron | No | NHS B2B |
| Carely | No | Yes | No | No | No | Yes | No | No | No | Free/paid |
| **HeartNote (target)** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes (via HK)** | **Yes** | **$19.99** |

**Key observation:** No existing app checks more than ~5 of these boxes. HeartNote is targeting all 10. That's either a genuine whitespace or an execution risk (too many features for v1). The v1 scope locked by the founder (voice log, trend detection, red alerts, visit report, family share) covers the 5 boxes competitors are weakest on — this is correct.

---

## B. Pricing map

| App | Price | Model |
|---|---|---|
| MyTherapy | Free / $1.99 ad-free / $49.99 lifetime / $14.99 | Freemium, optional ads + lifetime |
| Cormeum | $9.99 one-time | Lifetime purchase (undercapitalized model) |
| Heart Failure Health Storylines | Free | B2B/pharma-sponsored |
| Heart Failure Manager | Free | B2B (clinician publisher) |
| KardiaCare | $12.99-13.99/mo or $99/yr; Plus tier $299/yr | Device + SaaS |
| CareClinic | $5.99-$79.99 (multiple tiers) | Aggressive freemium with paywalls |
| Corrie Health | Free | Hospital-distributed |
| HF Path | Free | Nonprofit (AHA) |
| CaringBridge | Free | 501(c)(3) donations |
| Lotsa Helping Hands | Free | Nonprofit / donation |
| Propeller Health | ~$300 sensor + service | B2B via payer/PBM |
| Papa | Free to member via Medicare Advantage | B2B via MA plan |
| myHeart | Not public | NHS B2B |

**Where does $19.99/mo sit?**
- **High** compared to most CHF apps (which are free or $9.99 one-time).
- **In line with** premium caregiver-adjacent apps: Headspace ($12.99/mo), Calm ($14.99/mo), Audible ($14.95/mo). This is the reference point for the founder's target buyer — working-professional sandwich generation who already pays for these.
- **Lower than** KardiaCare Plus ($299/yr = $24.92/mo) and CareClinic top tier ($79.99).
- **Anchor argument:** "Costs less than a single copay for a CHF-related urgent care visit." True and defensible.
- **Risk:** There is no established $20/mo price anchor in CHF-specific consumer apps. HeartNote is setting the category price. That's fine if value delivery is strong; painful if users compare to Cormeum's $9.99 one-time.

**Pricing recommendation:** Keep $19.99/mo but make the annual $199/yr ($16.58/mo effective) very prominent. The sandwich-generation buyer will anchor on annual. Also: price against cost of AVOIDING one hospitalization — CHF readmissions average $14K-$16K each per CMS data. $199/yr is 1.4% of a single avoided readmission.

---

## C. Whitespace analysis (brutally honest)

### Genuine whitespace — HeartNote has room
1. **Caregiver-pointed CHF product.** Zero direct competitors. Every CHF app is patient-pointed. The closest thing is Heart Failure Health Storylines' "circles of support" — a bolt-on to a patient app, not a caregiver-first product. This is the real moat.
2. **Voice-first daily log for CHF.** No one is doing this. Voice-based CHF products exist only in research (Noah Labs for diagnostic prediction, academic voice UI studies). No consumer voice-first CHF app exists.
3. **Genuine AI trend detection.** Every app that says "AI" is either rule-based thresholds (HeartMapp's green/yellow/red), a rhythm classifier (Kardia), or marketing language (CareClinic, Cormeum's "smart"). Real LLM-powered trend synthesis across days/weeks is whitespace.
4. **"Since last visit" auto-generated cardiology report.** Heart Failure Manager has PDF export; MyTherapy has monthly reports; no one auto-generates a structured pre-visit briefing optimized for CHF cardiologist workflow. Whitespace.
5. **CHF-specific red-alert with scripted cardiologist script.** HeartMapp has red zones but is research-only and Android-only. No consumer CHF app gives you a ready-to-read script.

### Partially contested — HeartNote must be meaningfully better
6. **Family share link.** Heart Failure Health Storylines has circles; CaringBridge has public journals; Lotsa Helping Hands has calendar. None combine "read-only status dashboard for non-onboarded siblings." HeartNote's version can be better but isn't unique.
7. **HealthKit + smart scale sync.** MyTherapy, Corrie, Heart Failure Manager all have partial integration. Table stakes, not whitespace.

### Already well-served — don't try to out-build these
8. **Medication reminders.** MyTherapy (7.8K ratings) owns this. Don't try to out-build MyTherapy; do meds as "good enough for CHF context" only. The user can keep their MyTherapy.
9. **ECG/arrhythmia detection.** Kardia owns this (212K ratings + hardware + FDA). Don't try to build an ECG feature; integrate HealthKit ECG data and stay in your lane.
10. **Generic caregiver task coordination.** Lotsa + CaringBridge own "ask for meals and rides." HeartNote is not a coordination tool; don't drift into it.

### Honest concern: is "voice-first CHF daily log" enough of a moat?
Maybe not on its own. Voice entry is a UI choice and any competitor could add Whisper in a sprint. The real moat is the **combination** of: (a) caregiver-pointed data model (one patient, multiple family members with roles), (b) CHF-specific threshold logic (founder's clinical research task output), (c) AI trend synthesis that generates *writing* a caregiver can send to a cardiologist, and (d) founder's lived authenticity in marketing copy and support. Voice is the on-ramp, not the moat.

---

## D. Competitive risks (who to actually worry about)

### Tier 1 — Real threats
1. **AliveCor / KardiaCare** — Funded ($318M), 130K paying subs, cardiology credibility, distribution via retail + employer benefits partnerships. If they add a CHF-monitoring tier to KardiaCare, they crush HeartNote on distribution. **Watch:** KardiaCare product changelog, any CHF or "heart failure" announcement.
2. **Noah Labs VoX** — Voice-biomarker CHF prediction. EU approval expected mid-2026; FDA breakthrough designation. Direct threat on the "voice + AI + CHF" positioning. **Watch:** regulatory announcements, any B2C pivot, caregiver-facing UX.
3. **Apple** — HealthKit CHF features could commoditize weight/BP tracking. Apple Research study apps already explore CHF biomarkers. HeartNote's defense: be a thoughtful consumer experience on top of HealthKit, not compete with HealthKit directly.

### Tier 2 — Capital risk
4. **Papa** ($1.4B valuation, SoftBank-backed) — Not a product threat; a capital-and-attention threat in "aging parent" narrative. Could acquihire a CHF tracker if they wanted.
5. **ResMed / Propeller Health** — Template for the "caregiver-account + device data + payer" model. Their next condition could be CHF (they already have the architecture).
6. **MyTherapy** — Could bolt on CHF-specific alerting to their 7.8K-review base. Probably won't because their growth model is general medication adherence.

### Tier 3 — Credibility but not threat
7. **Cormeum** — CHF-specific but structurally weak (one-time pricing, 7 reviews, no funding, no AI). Validates the category need; does not threaten HeartNote. Actually a helpful co-marketer — HeartNote should cite Cormeum as proof CHF caregivers want this category while being clearly differentiated.
8. **Heart Failure Health Storylines** — Academically respected but 3.6 stars, bug-riddled. Not winning UX war.
9. **Heart Failure Manager, CareClinic, HF Path** — Crash-prone, abandonware-ish, low-rated. Not competitive threats on quality.

### Does anyone specifically target caregivers in CHF? **No.**
- MyTherapy has "family profiles" as a tangential feature.
- Heart Failure Health Storylines has "circles of support" bolted onto a patient product.
- CaringBridge / Lotsa / CareZone target caregivers generally, not CHF.
- Propeller has caregiver accounts but for respiratory, not CHF.
- **Nobody is building for the adult child of a CHF parent.** That's the gap.

---

## E. Lessons from review complaints (failure modes HeartNote must avoid)

Distilled from MyTherapy (1-star reviews), Heart Failure Manager, Cormeum, Health Storylines, KardiaMobile, CareClinic, Lotsa Helping Hands, CaringBridge — and academic qualitative research on elderly HF app users:

1. **Alarms/notifications silently failing.** MyTherapy's #1 complaint: "alarm has become too quiet" / "not receiving notifications." For a life-safety red-alert app, this is existential. **HeartNote rule:** Red alerts must bypass Do Not Disturb, use critical-alert iOS entitlement, and ship redundant SMS fallback via a paid tier. Test on iOS 17+ critical alert permissions explicitly.
2. **Authentication/login bugs.** Heart Failure Manager: "didn't send a password reset email." User locked out = data loss = churn. **HeartNote rule:** Magic-link email login + Apple Sign-In + Google Sign-In. No custom password flow in v1.
3. **Data loss after app updates.** MyTherapy: "update resulted in a complete loss of data." For longitudinal CHF data, catastrophic. **HeartNote rule:** Server-first Supabase data model, local cache only. Versioned schema migrations. Never trust local device data alone.
4. **Too much manual entry / "nagging to use it."** Academic research: elderly HF patients find data entry exhausting; apps that require navigating many menus for meds are abandoned. **HeartNote rule:** 30-second voice log is the non-negotiable core. Every manual form field is a future-churn risk. Default to voice; forms are secondary.
5. **Paywall aggression kills trust.** CareClinic: "can only track three symptoms before it's nagging you to pay" — #1 negative review pattern. KardiaCare: "paywall creep to unlock hardware I already bought." **HeartNote rule:** Free tier must be genuinely useful forever. Life-safety features never paywalled. Upgrade prompts max once per week, contextual (e.g., when user tries to view >30 days history), never interruptive mid-task.
6. **Buggy sync between web, mobile, and family members.** Lotsa: "comments don't sync… makes the app completely useless." Health Storylines: unit conversion bug. **HeartNote rule:** Single source of truth (Supabase), all clients read from same API. Never let the web version and iOS show different numbers.
7. **UI complexity for elderly users (and tired caregivers at 11pm).** Research: >75% of 65+ users need someone else to set up their apps. Sandwich-gen caregiver is exhausted when they open the app. **HeartNote rule:** One-tap voice log from home screen. No more than 3 taps to any function. Large text by default. "Did mom gain weight today?" answerable in 10 seconds.
8. **Abandoned by developer.** Cormeum at v1.0.9 after 5 years; CaringBridge app nearly a year stale; CardioAssist possibly delisted. Caregivers are burned by dead apps. **HeartNote rule:** Ship updates at least monthly. Publish a public changelog. Make the app's activity visible — it's a trust signal.
9. **No AI is still marketing as "smart."** Cormeum, CareClinic. Caregivers in review threads are now AI-literate enough to notice the difference. **HeartNote rule:** When you say AI, it has to actually be Claude doing real synthesis. Show the AI's reasoning in the UI ("I noticed 3 lbs up over 2 days AND ankle swelling worsening — this pattern often precedes decompensation").
10. **Poor clinician workflow fit.** Heart Failure Health Storylines academic praise but cardiologists didn't find the exports useful in practice. **HeartNote rule:** "Since last visit" report must be physically structured for a 10-minute cardiology visit — one page, vitals trend graph, meds adherence, symptom delta, top 3 AI concerns. Get 5 cardiologists to review it before shipping.

---

## Sources

### App Store / Play Store listings
- MyTherapy (iOS): https://apps.apple.com/us/app/pill-reminder-mytherapy/id662170995
- MyTherapy (Android): https://play.google.com/store/apps/details?id=eu.smartpatient.mytherapy
- Cormeum (iOS): https://apps.apple.com/us/app/cormeum-track-heart-health/id1541800519
- Cormeum (Android): https://play.google.com/store/apps/details?id=com.ginkgoheart.cormeumapp
- Heart Failure Manager: https://apps.apple.com/us/app/heart-failure-manager/id1364043356
- Heart Failure [HF] clinician app: https://apps.apple.com/us/app/heart-failure-hf/id1334849414
- CardioAssist: https://apps.apple.com/us/app/cardioassist/id6449150293 (**404 in fetch — flagged**)
- KardiaMobile: https://apps.apple.com/us/app/kardia/id579769143
- Health Storylines (parent): https://apps.apple.com/us/app/health-storylines/id935411489
- Heart Failure Storylines (CA only): https://apps.apple.com/ca/app/heart-failure-storylines/id1062725794
- CareClinic: https://apps.apple.com/us/app/tracker-reminder-careclinic/id1455648231
- Corrie Health: https://apps.apple.com/us/app/corrie-health/id1212463532
- HF Path (IN listing): https://apps.apple.com/in/app/hf-path/id1227733696 (**US listing 404 — flagged**)
- CaringBridge: https://apps.apple.com/us/app/caringbridge/id365726944
- Lotsa Helping Hands: https://apps.apple.com/us/app/lotsa-helping-hands/id606923858
- Papa Care: https://apps.apple.com/us/app/papa-care/id1534207289

### Publisher / company sites
- MyTherapy: https://www.mytherapyapp.com/ · CHF page: https://www.mytherapyapp.com/heart-failure-apps-for-chf-patients-to-manage-medication-and-weight
- Cormeum: https://cormeumapp.com/
- HFSA Patient App (Heart Failure Health Storylines): https://hfsa.org/patient-app
- Kardia: https://kardia.com/ · KardiaCare: https://store.kardia.com/products/kardiacare
- Propeller Health: https://propellerhealth.com/
- CaringBridge: https://www.caringbridge.org/
- Lotsa Helping Hands: https://lotsahelpinghands.com/
- Papa: https://www.papa.com/
- Corrie Health: https://www.corriehealth.com/
- CareZone (shut down): https://carezone.com/
- my mhealth myHeart: https://mymhealth.com/myheart
- CareClinic: https://careclinic.io/
- HF Path (AHA): https://www.heart.org/en/health-topics/heart-failure/heart-failure-tools-resources/hf-path-heart-failure-self-management-tool

### Funding / valuation
- AliveCor funding (Pitchbook): https://pitchbook.com/profiles/company/52649-65
- AliveCor Series E announcement: https://alivecor.com/press/press_release/alivecor-closes-65-million-financing-to-accelerate-growth-of-its-remote-cardiology-platform-for-consumers-employers-and-providers
- Papa Series D ($1.4B valuation): https://hitconsultant.net/2021/11/04/papa-senior-companion-platform-funding/
- Noah Labs VoX: https://pudgycat.io/ai-voice-heart-failure-detection-noah-labs-vox/

### Academic / MARS reviews
- Columbia / HFSA MARS ranking: https://hfsa.org/hfsa-patient-app-ranked-top-application-behavior-change-columbia-publication
- Review of HF apps using MARS: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4925936/
- Mobile phone apps for HF self-care (integrative review): https://pmc.ncbi.nlm.nih.gov/articles/PMC6834210/
- HF apps integrated review (CFR Journal): https://www.cfrjournal.com/articles/would-you-prescribe-mobile-health-apps-heart-failure-self-care-integrated-review
- Elderly HF + apps qualitative study: https://pmc.ncbi.nlm.nih.gov/articles/PMC7657601/
- Habits Heart App pilot (Mass General): https://mhealth.jmir.org/2021/1/e19465/
- HeartMapp: https://onlinejcf.com/article/S1071-9164(16)30452-3/fulltext
- Corrie Health MiCORE study (JH): https://ventures.jhu.edu/news/corrie-health-app-smartphone-heart-attack/
- Use of mobile apps in HF self-management (clinician + patient perspective): https://pmc.ncbi.nlm.nih.gov/articles/PMC9069281/
- AI voice detection of worsening HF (AHA): https://newsroom.heart.org/news/ai-phone-app-detected-worsening-heart-failure-based-on-changes-in-patients-voices

### Review / complaint aggregators
- JustUseApp MyTherapy reviews: https://justuseapp.com/en/app/662170995/mytherapy-medication-reminder/reviews
- Trustpilot KardiaMobile: https://www.trustpilot.com/review/kardiamobile.co.uk
- ComplaintsBoard CaringBridge: https://www.complaintsboard.com/caringbridge-b183042
- BBB CaringBridge: https://www.bbb.org/us/mn/saint-paul/profile/non-profit-organizations/caringbridge-0704-96591083/customer-reviews

### Flagged as unverified
- CardioAssist iOS listing (404 in fetch — app may be delisted or regionally restricted)
- HF Path US iOS listing (404 in fetch — India listing live, US availability unclear)
- Heart Failure Storylines Canada listing (404 in fetch — may be consolidated into parent Health Storylines app)
- Cormeum Google Play rating/count (headers only returned by fetch)
- MyTherapy Google Play exact rating/count (headers only returned by fetch)
- Apple "HeartCare" study app — could not confirm such a named app exists; Apple Heart Study and Apple Heart & Movement Study do, but neither is CHF-specific
