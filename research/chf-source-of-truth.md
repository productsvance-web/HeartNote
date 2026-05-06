# HeartNote — CHF Source of Truth

**Purpose.** Single reference document for HeartNote's AI threshold logic, red-alert copy, caregiver-facing education, and marketing language. Curated extraction from 5 detail research files in this folder; follow the cross-references for primary sources and citations.

**Last updated:** 2026-04-24
**Status:** Complete enough to begin v1 build. Gaps listed in §14.
**Disclaimer rule.** HeartNote is caregiver-support software. App copy must always direct caregivers to the patient's own care team for individualized thresholds, dose changes, and emergency decisions.

---

## 1. Executive findings — what this research changes about the product

1. **Nobody builds for the adult-child caregiver of a CHF parent.** Every existing CHF app is patient-pointed with manual form entry. Heart Failure Health Storylines' "circles of support" is a bolt-on to a patient product, not a caregiver-first product. This is HeartNote's real moat — and it must be made explicit in positioning. (`05 §C`)
2. **The self-reporting gap is the core product insight.** Caregivers repeatedly say "mom NEVER complains," "she will say she doesn't have problems breathing when in fact she is panting and gurgling," "he refuses to wear his oxygen." The patient is a systematically unreliable narrator. HeartNote must assume the *caregiver* — not the patient — is the logger. Every competitor has this backwards. (`04 §3.12`, `04 §Surprises`)
3. **Voice entry is the on-ramp, not the moat.** Any competitor could add Whisper in a sprint. The real moat is the *combination* of caregiver-pointed data model + CHF-specific thresholds + AI trend synthesis that generates cardiologist-ready writing + founder's lived authenticity. (`05 §C`)
4. **Review-complaint failure modes are the real enemy, not competitor features.** Top-rated CHF-specific apps have 7–81 reviews. The category fails on execution: broken alarms, authentication bugs, data loss on update, manual-entry fatigue, paywall aggression, abandoned releases. Avoiding these ten failure modes is higher-leverage than adding any single feature. (`05 §E`)
5. **$19.99/mo anchors to Headspace/Calm/Audible, not to Cormeum's $9.99 one-time.** The sandwich-generation buyer already pays for premium self-care apps. Reference argument: less than 1.4% of a single avoided CHF readmission ($14–16K per CMS). Lead with $199/yr ($16.58/mo effective). (`05 §B`)
6. **Top threats (in order): AliveCor/KardiaCare** (funding + distribution + cardiology credibility), **Noah Labs VoX** (voice-biomarker CHF, EU approval mid-2026), **Apple HealthKit** (platform floor, don't compete with it — be the best consumer layer on top). (`05 §D`)
7. **AHA's own scientific statement (Kitko 2020) names the gap.** "Studies evaluating use of technology in supporting HF patients and their caregivers are lacking." HeartNote fills this gap directly for CHF. (`03 §5.7`)

---

## 2. Red-alert tier spec — the logic to wire into HeartNote's AI

**Design principles:**
- Compound alerts (weight trend **+** new symptom) have far higher positive predictive value than either alone. Prefer compounds.
- Normalize weight thresholds to percent-of-body-weight for tier-2/3 (a 3-lb gain in a 150-lb patient is proportionally worse than in a 250-lb patient).
- The patient's own rolling baseline matters more than a population threshold.
- Target: 1–2 tier-2+ alerts per month for a stable patient. Alarm fatigue kills trust; a caregiver who ignored day-17's false alarm will ignore day-23's real one.
- Always surface the AI's reasoning in the alert ("weight up 4 lb over 5 days AND you logged extra pillows AND cough at night — here is what to tell the cardiologist").

### Tier 1 — IMMEDIATE 911 (any one triggers)
- Severe dyspnea at rest (can't finish sentences)
- Coughing up pink or white frothy sputum
- New chest pain/pressure or pain radiating to arm/jaw
- Sudden confusion, slurred speech, not recognizing family
- Syncope (fainting)
- Cyanotic lips or fingers (blue/gray)
- SpO2 <88%, OR <90% with new dyspnea
- New fast irregular pulse with chest pain or dizziness

Source detail + per-row citations: `01 §2 Tier 1`.

### Tier 2 — CALL CARDIOLOGIST TODAY (any one triggers)
- Weight gain >2 lb / 24 hr, >3 lb / 48 hr, or >5 lb / 7 days
- New or worsened orthopnea (more pillows than last week)
- Any PND episode in last 48 hr
- New or markedly worsened peripheral/abdominal swelling
- Step-change worsening of dyspnea on exertion (NYHA creep)
- New persistent nocturnal cough
- Notable decrease in urine output
- SBP <90 with dizziness / confusion / cool clammy extremities
- Resting HR persistently >100 OR <50 with symptoms
- New nausea / early satiety persisting >24 hr
- Mild new confusion or lethargy
- HR >120 bpm at rest (Cleveland Clinic threshold)

Source detail: `01 §2 Tier 2`.

### Tier 3 — CALL WITHIN 48 HOURS (any one triggers)
- Weight up 1–2 lb/day for 3+ consecutive days (sub-tier-2 but trending)
- Step-change in fatigue / napping pattern
- Mild evening-only swelling
- Brief orthostatic dizziness (<1 min, no fall)

Source detail: `01 §2 Tier 3`.

### Tier 4 — WATCH AND LOG
Everything else. Daily voice log continues, AI trend analysis continues, no notification fires.

### Why this tiering is defensible
The Chaudhry *Circulation* 2007 pre-hospitalization curve shows weight divergence begins ~30 days before admission and accelerates ~7 days before. The 7-day window odds ratios are monotonic: 2–5 lb gain = OR 2.77; 5–10 lb = OR 4.46; >10 lb = OR 7.65. Every pound matters; the risk curve is continuous. The 72-hour pre-hospitalization window is the one HeartNote's red-alert is designed to catch — ideally at 72 hr or earlier, before ER is the only option. (`01 §5`)

---

## 3. Numeric thresholds — what the app defaults to

| Metric | Default | Notes | Primary source |
|---|---|---|---|
| Weight gain, 24 hr | **>2–3 lb** | Use most sensitive (2 lb) to avoid false negatives | AHA, MedlinePlus, Kaiser |
| Weight gain, 7 days | **>5 lb** | — | AHA, MedlinePlus, Kaiser |
| Weight delta from dry weight | **≥4 lb above dry weight** (optional layer if user has set dry weight) | Trip on whichever rule fires first | Cleveland Clinic |
| SBP | <90 mmHg with symptoms → tier 2 | HF patients often run SBP in 90s — low alone isn't emergency | AHA, PMC7540603 |
| DBP | <60 with symptoms → tier 2 | — | AHA |
| Resting HR | >100 or <50 with symptoms → tier 2; >120 → call | Sudden irregularity = possible new AFib | 2022 AHA/ACC/HFSA Guideline; Cleveland Clinic |
| SpO2 | <92% resting → call today; <88% → 911 | Re-measure before alerting (cold fingers, polish, poor perfusion) | British Thoracic Society, PMC sagepub 2022 |
| RR | >25 with distress → ER | — | Clinical convention |
| Sodium target | **<2000 mg/day** (range 1500–2000) | Caveat: individualized. 2022 guideline softened from "lower the better" | Cleveland Clinic, MedlinePlus, 2022 AHA/ACC/HFSA |
| Fluid target | **Cardiologist-individualized** (1.5–2 L/day reference) | Do not auto-set. March 2025 ACC: fluid restriction may not be needed for all HF patients | MedlinePlus, ACC Mar 2025 |
| Alcohol | ≤1 drink/day (women), 1–2 (men) | — | AHA |
| Activity | 30–45 min aerobic, 5×/week (with doctor clearance) | Stop-rule: stop if short of breath, lightheaded, or chest discomfort | Cleveland Clinic, AHA |

**Conflicts HeartNote resolves explicitly** (write into in-app copy):
- AHA says 2–3 lb/day; Cleveland Clinic uses "4 lb from dry weight"; ESC says "2 kg / 3 lb in 3 days." HeartNote picks the most sensitive threshold and tells the user: "different organizations use 2–4 lb; we chose the lower number because weight gain from fluid can compound fast."
- "Dry weight" is only meaningful if the clinician has stated it. Onboarding prompts user to ask cardiologist for dry weight; default logic still runs on rolling deltas.

Detail: `01 §1`, `03 §13`.

---

## 4. NYHA functional class (set at onboarding, drives alert aggressiveness)

| Class | AHA definition (verbatim) | What caregiver observes |
|---|---|---|
| I | "No limitation of physical activity." | Walks stairs, groceries, holds conversation — no symptoms |
| II | "Slight limitation." | Stairs or grocery trips cause her to pause for breath; fine sitting |
| III | "Marked limitation." | Walking to bathroom / making a sandwich leaves her winded; fine in the recliner |
| IV | "Symptoms at rest." | Short of breath sitting; can't sleep flat; any movement worsens symptoms |

**ACC/AHA Stages** (orthogonal — disease progression, not current symptoms): A (at risk), B (pre-HF), C (symptomatic), D (advanced/refractory).

**App rule:** Ask caregiver at onboarding what NYHA class the cardiologist assigned. Class IV baseline → tighter thresholds, lower alarm-fatigue tolerance. Do not auto-classify — that's a clinician judgment. Detail: `01 §4`.

---

## 5. Decompensation progression — the order symptoms compound

Clinical convention, consistent across sources:
1. **Weight gain** (silent, detectable only by scale; precedes symptoms by days to weeks)
2. **Peripheral edema** (ankles → calves → abdomen; worsens evening, improves overnight initially — then stops improving)
3. **Dyspnea on exertion** (stairs → flat walking → ADLs)
4. **Orthopnea** (extra pillows; sleeping semi-upright)
5. **Paroxysmal nocturnal dyspnea** (waking gasping 1–3 hr after lying down)
6. **Nocturnal cough, then pink frothy sputum** (late — flash pulmonary edema)
7. **Confusion, cool extremities, oliguria** (low-output / end-organ hypoperfusion)

**The 72-hour pre-hospitalization window typically shows:** 3–5+ lb up from baseline, dyspnea at rest, worsened orthopnea, one PND episode the night before, often cough / nausea / early satiety / oliguria, sometimes confusion or lethargy.

This is the window HeartNote catches. Goal: turn a would-be hospitalization into a same-day clinic visit with a diuretic adjustment. Detail: `01 §5`.

---

## 6. Medication watchpoints — quick lookup

Caregiver-facing cues by drug class. Full detail with dose ranges, FDA labels, guideline citations, and nine named decompensation patterns in `02`.

| Class | Common drugs | Top caregiver watchpoints |
|---|---|---|
| Loop diuretic | Furosemide (Lasix), torsemide, bumetanide | Dehydration signs, low K / low Na / low Mg, kidney decline, "bathroom accidents" especially late-day dosing. A "good day" of diuresis can drop 2–3 lb — don't mistake it for clinical improvement |
| ACE-I / ARB / ARNI | Lisinopril, enalapril, losartan, valsartan, sacubitril-valsartan (Entresto) | Hypotension (dizziness on standing), dry cough (ACE-I specific), hyperkalemia, kidney function. **Never combine.** 36-hr washout required ACE-I → ARNI (no washout ARB → ARNI) |
| Beta blocker | Carvedilol, metoprolol succinate, bisoprolol | Bradycardia, hypotension, fatigue (especially first weeks), worsening HF in first month of uptitration. **Never stop abruptly.** Use succinate (ER), NOT tartrate, for HFrEF |
| MRA | Spironolactone, eplerenone | Hyperkalemia (especially stacked with ACE-I/ARB/ARNI), gynecomastia (spironolactone), kidney monitoring |
| SGLT2i | Dapagliflozin (Farxiga), empagliflozin (Jardiance) | Now GDMT for HFrEF (2022) AND HFpEF (2023). Genital infections, euglycemic DKA, volume depletion first weeks → often need to reduce diuretic dose |
| Digoxin | Digoxin | Narrow therapeutic window. Nausea, yellow halos, confusion, bradycardia. GI illness + digoxin = toxicity pattern |
| Antiarrhythmic | Amiodarone (if AFib) | Thyroid, liver, pulmonary (can mimic HF worsening). Many drug interactions |
| Anticoagulant | Warfarin, DOACs | Bleeding, INR for warfarin |

**Red-flag combinations / OTC traps:**
- **NSAIDs (ibuprofen, naproxen) contraindicated** in CHF — fluid retention, kidney injury
- **ACE-I + ARB + MRA** ("triple whammy") — AKI risk
- **Potassium-stackers:** ACE-I / ARB / ARNI / MRA / K+ supplements — hyperkalemia
- **Steroid bursts** — fluid retention
- **Licorice** (real licorice) — mineralocorticoid effect
- **Effervescent OTCs** (Alka-Seltzer etc.) — hidden sodium bombs
- **St. John's Wort, ginseng** — multiple interactions

**Nine named decompensation patterns the AI should recognize** (full descriptions in `02`):
1. Missed diuretic (2+ days without) — weight rising silently
2. Double-dose diuretic — over-diuresis, AKI, hypokalemia
3. Beta-blocker abrupt stop — rebound tachycardia, arrhythmia, HF worsening
4. Silent hyperkalemia — on ACE-I + MRA + K+ supplement, often post-illness
5. Triple-whammy AKI — ACE-I/ARB + MRA + NSAID or diuretic over-dose
6. Digoxin toxicity with GI illness — nausea/vomiting drops volume, digoxin level climbs
7. Hidden sodium bomb — restaurant meal, effervescent OTC, processed food binge
8. Amiodarone pulmonary toxicity mimicking HF — new dyspnea weeks–months in
9. Steroid burst (dental, respiratory, rheumatologic) → fluid retention + BP rise

**Rule:** HeartNote **never** recommends dose changes. Only ranges for education; always direct to prescriber.

---

## 7. Zones framework — what HeartNote's UI mirrors

The green/yellow/red zones tool is the single most adopted CHF self-management framework. Cleveland Clinic, Kaiser Permanente, AHA Self-Check Plan, MedlinePlus all publish versions; cardiology clinics send patients home with these handouts. HeartNote's red-alert logic must map 1:1 onto these thresholds because that's what the cardiologist already told the caregiver in clinic.

**HeartNote's zones (composite — picks most conservative where sources differ):**
- **Green** — weight within 4 lb of dry weight; no new symptoms; sleeping flat; same exercise tolerance as yesterday
- **Yellow** — any tier-2 trigger (see §2); call cardiologist today
- **Red** — any tier-1 trigger; 911 / ER

User-facing framing: "Different hospitals use slightly different numbers. We picked the most sensitive thresholds (2 lb/day, 5 lb/week). Your cardiologist may give you different targets — we'll honor those."

Detail with institution-by-institution comparison: `03 §1`.

---

## 8. Cardiology visit report — the structure the auto-report must use

This is HeartNote's paid-tier flagship feature: "since last visit" report, auto-generated from the voice log + tracked metrics, physically structured for a 10-minute cardiology visit.

### AHA's 11-question template (caregivers are already trained to use this)
1. What's my diagnosis? Is the heart failure mild? Moderate? Severe?
2. What should I expect within the next few weeks, months, and years?
3. What are some specific ways that my daily life will change?
4. What are the three most important things my family and I can do to manage this condition?
5. Strategies used by other patients for diet, exercise, smoking cessation.
6. What will happen if I slip back into unhealthy habits?
7. Cardiac rehab recommendation, location, frequency.
8. It's difficult to keep the medication schedule straight. Is there any way we can simplify it?
9. Medication side effects and alternatives.
10. Insurance coverage gaps for treatment.
11. If any symptoms seem to get worse or change suddenly, what's the best way for us to contact you?

### 10-section pre-visit structure (cardiologist-expected layout)
1. **Current medication list** — drug, dose, frequency, adherence, missed doses
2. **Allergies / intolerances**
3. **Daily weight log** — same scale, same time, same clothing; highlight any 2–3 lb / 5 lb trigger events
4. **Symptom timeline** — swelling, SOB, orthopnea (pillow count), exercise tolerance, confusion, appetite, cough
5. **BP + HR readings**
6. **Diet/sodium/fluid adherence notes**
7. **Questions list** (AHA 11-question template above)
8. **Prior cardiovascular testing** (ECG, echo+EF, BNP/NT-proBNP, labs)
9. **Family history**
10. **Psychosocial check** — anxiety, depression, sleep, sexual-activity concerns

**Product rule:** Before shipping the visit report feature, have 5 cardiologists review it. Heart Failure Health Storylines got academic praise but cardiologists didn't find exports useful in practice — the structural fit to a 10-minute visit is what matters. Detail: `03 §5.5, §11`.

---

## 9. Tone of voice — what HeartNote sounds like

Three consistent features across the authoritative institutional voice; adopt all three:
1. **Permissive, not prescriptive** — "It's generally better to err on the side of caution." (Mayo) "With proper planning and support, caregiving can be rewarding." (AHA)
2. **Binary action prompts with explicit thresholds** — "call your doctor" vs "call 911" — never make the caregiver interpret.
3. **Caregiver-as-a-person framing** — the caregiver is not just the patient's helper; their own mental/physical/financial well-being is named and resourced.

**The grelief test:** every UI copy line has to work at the top of the rollercoaster AND at the bottom. Caregivers experience cycles of relief + grief + re-dread; chirpy-optimistic ("You're doing great!") breaks trust, funeral-serious ("This could be the end") burns them out. Sit with the oscillation. (`04 §Surprises`)

**Founder language watchlist:**
- "One fall or episode away from something bad" is the single most representative buyer sentence.
- Caregivers say "drown in his own fluid" verbatim for pulmonary edema.
- "Death's door" = their actual phrase for "hospital-admission-scare."
- "I don't know if I should be planning a funeral or Christmas dinner."
- "Every day it's something different."

---

## 10. Caregiver pain taxonomy — what HeartNote's copy and features address

Twelve categories, ranked roughly by intensity in the research corpus. Detail with 100+ quotes at `04 §3`.

1. **Fear of missing a warning sign / "is this THE thing?" anxiety** — the 24/7 triage-nurse-with-no-training dread
2. **Sibling / family coordination friction** — default caregiver, siblings dial it in, info gatekeeping
3. **Doctor communication gaps** — 14-minute appointments, can't remember what the cardiologist said
4. **Medication management overwhelm** — "if your Dad won't take the water pills he will drown in his own fluid"
5. **Weight / symptom tracking fatigue** — already being done manually on Post-its and paper
6. **Guilt** — at distance, at not doing enough, at resenting the role
7. **Financial stress** — ~$10K/yr spend for sandwich-gen caregivers; EOB confusion; respite costs
8. **Emotional exhaustion / burnout** — "I'm a pretty positive person. It's always an act."
9. **Identity loss** — "I used to be outgoing… my personality has changed."
10. **Anticipatory grief** — "grelief" cycle (relief + grief + re-dread)
11. **Logistics** — rides, refills, cat sitter; "finger-in-a-dam" metaphor (003-04, PLOS ONE)
12. **Self-reporting gap** — the parent can't/won't report accurately; caregiver IS the data source

**Positioning implication** (from §1.3 of this doc): the buyer does not want to be a better caregiver. The buyer wants their life back. Lean into "fewer surprises, fewer fires to put out" not "help you care better." (`04 §Surprises`)

---

## 11. Marketing / landing-page language bank

**Hero-section copy (recommended test — composite, not a single verbatim source):**
> *"I always feel like I'm one fall or episode away from something bad." — A daughter caring for her dad with heart failure.*
> *If you're reading this at 2 a.m. because mom gained 3 pounds overnight, HeartNote is for you.*

**Verbatim-quotable:**
- "I always feel like I'm one fall or episode away from something bad." (Betsy Campbell Stone, thehenrychronicles.com)
- "I never know if I should be planning a funeral or Christmas dinner." (makes3, AgingCare)
- "Mom NEVER complains." (chdottir)
- "I'm just worried and need a place to vent." (chdottir)
- "I see her 1-2 times a week but I can't keep that frequency up and the guilt is killing me." (Daniel Clay, workingdaughter.com)

**Paraphrase-inspired:**
- "Every day it's something different. HeartNote catches the patterns you can't."
- "Caring for a parent with CHF feels like plugging a dam with your fingers. We built a better way."
- "When what your parent says and what you see don't match — log what you see."
- "When you're caring for them, who's caring for you?"

**What caregivers directly said they wish existed** (`04 §6`):
- Automatic data capture from devices
- A green/yellow/red visual so I know what color today is
- A way to share a status page with my sibling without teaching them to use an app
- Something that tells me what "normal" is for HER, not general population
- "Peace of mind that someone other than myself is monitoring" — this is the thesis of the product, articulated by a patient describing his wife's relief

Detail with 10-row marketing-usage matrix: `04 §5`.

---

## 12. 2 a.m. search intent — SEO seed set

Caregivers searching these at 2 a.m. is the primary SEO distribution channel per CLAUDE.md strategy. The head-term ranking pages (Mayo, Cleveland Clinic, AHA, Healthline, GoodRx) shape around these, confirming intent. Full list: `04 §4`.

**Weight-gain:** mom weight gain heart failure · dad weight gain overnight · how much weight gain is dangerous heart failure · weight gain 5 pounds in a week heart failure · can heart failure cause sudden weight gain
**Swelling:** dad swollen legs heart failure · mom swollen feet at end of day · swelling weeping through socks heart failure · puffy legs when to see a doctor
**Breathing:** mom short of breath heart failure · when to call 911 heart failure shortness of breath · heart failure panting gurgling · dad can't breathe lying down · orthopnea heart failure parent
**"Is this the end?":** end stage heart failure signs · what does end stage heart failure look like · heart failure how long after diagnosis · heart failure stages dying · what to expect end stage chf
**"When to call":** heart failure when to call doctor · heart failure when to go to ER · chf when to call 911 · should I call hospice heart failure
**Medication:** lasix side effects nighttime bathroom · mom won't take water pill · dad refusing diuretic heart failure · mom confused after starting Lasix
**Caregiver-emotional:** I can't take care of my dad anymore · heart failure caregiver burnout · sibling won't help with caregiving · long distance caregiver guilt
**Cardiologist-prep:** what to ask cardiologist appointment · questions for heart failure cardiologist · how to prepare for cardiologist appointment parent

**Next step:** Ahrefs / Semrush pull on CHF caregiver long-tail queries for real volume + difficulty numbers. This is the single highest-leverage SEO research investment. (`04 §4`)

---

## 13. Ten failure modes HeartNote must avoid

Distilled from competitor App Store / Play Store 1-star reviews and academic qualitative research on elderly HF app users. Full detail at `05 §E`.

1. **Silent notification failure.** MyTherapy's #1 complaint: "alarm has become too quiet." For a life-safety app, existential. → Red alerts must use iOS Critical Alert entitlement, bypass DND, and ship SMS fallback on paid tier.
2. **Authentication bugs.** Heart Failure Manager: "didn't send a password reset email." → Magic-link + Apple Sign-In + Google Sign-In only. No custom password flow in v1.
3. **Data loss after update.** MyTherapy: "update resulted in a complete loss of data." → Server-first Supabase model, local cache only, versioned schema migrations.
4. **Too much manual entry.** Elderly HF patients abandon apps that require navigating menus for meds. → 30-second voice log is the non-negotiable core. Forms are secondary.
5. **Paywall aggression.** CareClinic: "only 3 symptoms before it nags you to pay." KardiaCare: "paywall creep to unlock hardware I already bought." → Life-safety features never paywalled. Upgrade prompts max once/week, contextual, never interruptive mid-task.
6. **Buggy sync across web / mobile / family.** Lotsa: "comments don't sync… app is useless." → Single source of truth (Supabase). Never let web and iOS show different numbers.
7. **UI complexity for exhausted users.** Research: >75% of 65+ users need someone else to set up apps. The sandwich-gen caregiver is exhausted when they open it. → One-tap voice log from home screen. ≤3 taps to any function. Large text by default.
8. **Abandonware signals.** Cormeum v1.0.9 after 5 years; CaringBridge nearly a year stale; CardioAssist possibly delisted. → Ship updates monthly. Public changelog. Visible activity = trust signal.
9. **Fake "AI" marketing.** Cormeum, CareClinic say "smart" but are rule-based. Caregivers are now AI-literate enough to notice. → When we say AI, it has to actually be Claude synthesizing. Show the AI's reasoning in the UI.
10. **Poor clinician workflow fit.** Heart Failure Health Storylines had academic praise but useless exports. → Get 5 cardiologists to review the visit report before shipping. Physical structure beats data completeness.

---

## 14. Known gaps — close before clinical-advisor review

From the 5 research docs:
1. **Penn Medicine patient handout** — 403 on fetch; aggregated summaries used for the "academic-center" thresholds. Get a verified Penn / Johns Hopkins PDF directly.
2. **HFSA self-care pages** — 403 on fetch. ESC / Heart Failure Matters substituted. Retry via different user-agent or contact HFSA.
3. **VA / Providence HF Zone PDFs** — binary content WebFetch couldn't parse. Download manually if we want exact wording.
4. **Mayo Clinic consumer pages** — 403 on fetch. Indexed snippets only.
5. **Reddit direct** — blocked for Claude's fetcher. AgingCare + PLOS ONE qualitative + Working Daughter + caregiver blogs substituted (same voice). For production, commission 5–10 founder-led customer interviews + $500 AARP-forum survey + Ahrefs/Semrush pull.
6. **Play Store exact ratings** for MyTherapy, Cormeum — couldn't extract. iOS ratings captured.
7. **App Store listings for CardioAssist, HF Path, HF Storylines standalone** — returned 404. Worth re-verifying before citing competitors in pitch decks.
8. **Lab-threshold integration** (K+, creatinine, INR, digoxin level) — out of scope for v1 voice-log product; defer to v2 lab-import feature.
9. **Polypharmacy interactions** (antifungals + DOACs, antibiotics + warfarin, SSRIs + anticoagulants) — deferred to future med-scanner OCR feature.
10. **Ethnic/genetic variation** (ACE-I angioedema in Black patients, BiDil indication, CYP2C9/VKORC1 warfarin) — out of scope v1; note in medical-advisor review.
11. **MedlinePlus 000112.htm "6 to 9 cups" fluid quote** (re-verified missing 2026-05-06): the page no longer hosts the verbatim "6 to 9 cups (1.5 to 2 liters) a day" line. Sodium 1500–2300 mg/day claim still verifiable. No rule-layer impact (fluid is cardiologist-individualized per §3); flagged for future copy hygiene.

---

## 15. Immediate next-action checklist

Before or alongside the Next.js + Capacitor scaffold:
- [ ] Founder review of this document for lived-experience accuracy, especially §9 (tone), §10 (pain taxonomy), §11 (marketing language). Flag anything that reads fake.
- [ ] Commission 5–10 founder-led customer interviews with working-professional adult children of CHF parents (close the Reddit-access gap; validate the taxonomy).
- [ ] Ahrefs/Semrush pull on the §12 search list — real volume + difficulty.
- [ ] Get the 10 AHA/Cleveland/MedlinePlus/Mayo primary URLs bookmarked for reference-linking in-app education.
- [ ] Obtain the Penn Medicine and HFSA primary PDFs (gaps 1–2).
- [ ] Recruit 5 cardiologists to review the visit-report structure before that feature ships.
- [ ] Recruit 1 clinical advisor (cardiologist or HF nurse specialist) to formally review §2 red-alert tier spec and §6 medication watchpoints before v1 launch.

---

## 16. Cross-references to detail research docs

All files in `/Users/jazminescamilla/Desktop/heartnote/research/`:

- `01-clinical-thresholds.md` (292 lines) — AHA/ACC/HFSA/ESC weight/BP/HR/SpO2/RR thresholds, 4-tier urgency taxonomy of decompensation signs with per-row citations, NYHA/ACC-AHA stages, Chaudhry 2007 pre-hospitalization curve with OR tables
- `02-medications.md` (366 lines) — the four GDMT pillars + SGLT2 + digoxin + amiodarone + anticoagulants, red-flag combinations, OTC/supplement traps, nine named decompensation patterns, dose ranges with FDA/guideline citations
- `03-caregiver-education.md` (461 lines) — Cleveland Clinic / Mayo / Penn / AHA / HFSA / AHRQ / CMS institutional survey, zones framework comparison, AHA 11-question template, 10-section pre-visit structure, caregiver self-care / burnout / respite resources, 54 cited sources
- `04-caregiver-language.md` (591 lines) — 100+ verbatim quotes from AgingCare, WorkingDaughter, PLOS ONE 2021 qualitative study, The Henry Chronicles; 12-category pain taxonomy; 2 a.m. search query list; 10-row marketing-copy matrix; three founder-lived-experience blind spots named ("grelief," self-reporting gap, finger-in-a-dam metaphor)
- `05-competitor-apps.md` (455 lines) — 20 apps mapped (MyTherapy, Cormeum, Heart Failure Health Storylines, Heart Failure Manager, CardioAssist, KardiaMobile, Heart Habit, Propeller, CareZone, CaringBridge, Lotsa, Papa, Corrie, HF Path, CareClinic, HeartMapp, myHeart, Apple Research, Carely, Noah Labs VoX); feature matrix; pricing map; whitespace analysis; 3-tier competitive risk ranking; 10 failure-mode lessons from reviews
