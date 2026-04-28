# HeartNote Clinical Thresholds & Decompensation Reference

**Purpose:** Source-of-truth reference for HeartNote's red-alert logic, symptom-tier language, and caregiver-facing copy. Every threshold cites a primary source. Where sources disagree, the conflict is flagged explicitly.

**Scope:** Adult CHF patients living at home, monitored by an adult-child caregiver. Not intended for clinician decision-making. App copy must always direct caregivers to the patient's own care team for individualized thresholds.

**Last updated:** 2026-04-24

---

## 1. Official home-monitoring thresholds

### 1.1 Weight gain (the dominant home-monitoring signal)

| Source | Threshold | Action |
|---|---|---|
| American Heart Association (AHA) | ">2 or 3 pounds in a day or more than 5 pounds in a week" | Contact healthcare professional; "may be due to retaining fluids" | 
| Cleveland Clinic Heart Failure Zones | Gain or lose "4 or more pounds" from dry weight | Yellow zone — call doctor/nurse |
| Cleveland Clinic (other patient pages) | "More than 4 pounds" change from dry weight | Call heart failure doctor or nurse |
| ESC / Heart Failure Matters (patient-facing arm of ESC) | ">2 kg (3 lb) in 3 days" | Tell doctor or nurse |
| Chaudhry et al. (Circulation, 2007) | ">5 lb over 3 days" was the alert threshold used in telemonitoring; risk rises monotonically above 2 lb/7 days | Clinician notification |
| Kaiser Permanente / Healthwise Zone Tool | ">2 to 3 pounds in a day or 5 pounds in a week" | Yellow zone — call doctor |
| AHA News / consumer guidance (aggregated) | "Rapid weight gain (2 pounds or more in a day, or 5 pounds or more in a week)" | Call 911 if combined with new/severe symptoms |

**Headline rule for the app (conservative, majority-consensus):**
- **>2 lb in 24 hours** OR **>3 lb in 48 hours** OR **>5 lb in 7 days** → call cardiologist today
- **>10 lb in 7 days** → urgent/same-day cardiology or ER, especially with new symptoms

**Conflicts to resolve in product copy:**
- AHA hedges between 2 and 3 lb/day; Cleveland Clinic uses a 4 lb absolute deviation from "dry weight" (which requires knowing dry weight); ESC uses metric (2 kg / 3 lb in 3 days). HeartNote's red-alert logic should use the **most sensitive** commonly published threshold (2 lb/24 hr) to avoid false negatives, with caregiver-facing copy explaining "different organizations use 2–4 lb; we chose the lower number because weight gain from fluid can compound fast."
- "Dry weight" is only meaningful if the clinician has told the caregiver what it is. App should prompt caregiver to ask the cardiologist for "dry weight" on first use, but default logic should run on rolling deltas, not absolute deviation.

**Sources:**
- [AHA – Managing Heart Failure Symptoms](https://www.heart.org/en/health-topics/heart-failure/warning-signs-of-heart-failure/managing-heart-failure-symptoms)
- [Cleveland Clinic – Heart Failure Zones](https://my.clevelandclinic.org/departments/heart/patient-education/recovery-care/heart-failure/heart-failure-zones)
- [Cleveland Clinic – Understanding Heart Failure](https://my.clevelandclinic.org/health/diseases/17069-heart-failure-understanding-heart-failure)
- [Heart Failure Matters (ESC/HFA) – Rapid weight gain](https://www.heartfailurematters.org/warning-signs/rapid-weight-gain/)
- [Chaudhry SI et al., Patterns of Weight Change Preceding Hospitalization for Heart Failure, Circulation 2007](https://www.ahajournals.org/doi/10.1161/circulationaha.107.690768) / [PMC full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC2892745/)
- [Kaiser Permanente – Heart Failure Daily Action Plan](https://healthy.kaiserpermanente.org/health-wellness/health-encyclopedia/he.heart-failure-daily-action-plan.abk2128)

### 1.2 Blood pressure

There is **no universally published home-monitoring BP cutoff** for CHF patients — guidelines punt to "your individualized target." That said:

| Threshold | Meaning | Source |
|---|---|---|
| SBP <90 mmHg OR DBP <60 mmHg | Formal definition of hypotension | [AHA – Low Blood Pressure](https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/low-blood-pressure-when-blood-pressure-is-too-low) |
| SBP <90 with symptoms (dizziness, lightheadedness, confusion, fainting) | Concerning — may reflect over-diuresis, advanced HF, or poor perfusion | [Management of low BP in HFrEF, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7540603/) |
| SBP 80–100 without symptoms | Often tolerated; GDMT (guideline-directed medical therapy) uptitration still pursued if asymptomatic | [Management of low BP in HFrEF, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7540603/) |
| Drop >20 mmHg systolic on standing | Orthostatic hypotension — fall risk, possible over-diuresis | [Cleveland Clinic – Low BP/Hypotension](https://my.clevelandclinic.org/health/diseases/21156-low-blood-pressure-hypotension) |

**Caveat:** HF patients on ACE-I/ARB/ARNI/beta blockers frequently run SBP in the 90s. Low BP alone is not an emergency; low BP **plus** a new symptom (dizziness, confusion, cold/clammy skin, reduced urine output) is the red flag.

**App logic:** Default alert at SBP <90 OR DBP <60 combined with any of {dizziness, confusion, cool extremities, decreased urine output}. Let the user override the low threshold if their cardiologist says "your mom runs at 85."

### 1.3 Heart rate / pulse

| Threshold | Meaning | Source |
|---|---|---|
| Resting HR >100 bpm (tachycardia) | Can reflect decompensation, dehydration, arrhythmia (esp. new AF) | [2022 AHA/ACC/HFSA Guideline](https://www.ahajournals.org/doi/10.1161/CIR.0000000000001063) |
| Resting HR <50 bpm with symptoms | Can reflect over-beta-blockade or conduction disease | [2022 AHA/ACC/HFSA Guideline](https://www.ahajournals.org/doi/10.1161/CIR.0000000000001063) |
| Persistently HR >70 bpm despite max beta blocker, with symptoms | Ivabradine indication (clinician decision, not caregiver alert) | [Cleveland Clinic – Heart Failure Medications](https://my.clevelandclinic.org/departments/heart/patient-education/recovery-care/heart-failure/medications) |
| Sudden irregular pulse | Possible new atrial fibrillation — call same-day | [Kaiser – Heart Failure Daily Action Plan](https://healthy.kaiserpermanente.org/health-wellness/health-encyclopedia/he.heart-failure-daily-action-plan.abk2128) |

**App logic:** Alert on resting HR >100 OR <50 OR new irregularity. Combine with symptoms for urgency tiering.

### 1.4 SpO2 (pulse oximetry)

| Threshold | Meaning | Source |
|---|---|---|
| SpO2 95–100% | Normal for healthy adults | [Heart-Failure.net – Safe Oxygen Levels](https://heart-failure.net/living/oxygen-levels) |
| SpO2 94–98% | British Thoracic Society target for acute HF | [Oxygen Management in HF Patients, 2022](https://journals.sagepub.com/doi/full/10.1177/26324636221081585) |
| SpO2 88–92% | Acceptable floor for patients at risk of hypercapnic respiratory failure (COPD overlap) | [Oxygen Management in HF Patients, 2022](https://journals.sagepub.com/doi/full/10.1177/26324636221081585) |
| SpO2 <90% | Hypoxemia; supplemental O2 is lifesaving | [Oxygen Management in HF Patients, 2022](https://journals.sagepub.com/doi/full/10.1177/26324636221081585) |
| SpO2 <85% with respiratory distress (RR >25) | Noninvasive positive pressure ventilation territory — ER/911 | [Oxygen Management in HF Patients, 2022](https://journals.sagepub.com/doi/full/10.1177/26324636221081585) |

**App logic:** SpO2 <92% resting → call cardiologist today. SpO2 <88% OR <90% with new dyspnea → 911-tier. Caveat caregivers that cold fingers, nail polish, and poor perfusion yield false-low readings; re-measure before alerting.

### 1.5 Respiratory rate

No widely published caregiver-facing threshold, but clinical convention:
- Normal resting RR: 12–20 breaths/min
- RR >25 with distress → ER (see SpO2 row above)
- Source: [Oxygen Management in HF Patients, 2022](https://journals.sagepub.com/doi/full/10.1177/26324636221081585)

### 1.6 Fluid intake (not a direct alert, but self-care parameter)

Most HF teams cap fluids at **1.5–2 liters/day** in Stage C/D patients; sodium at **<2–3 g/day**. These are individualized and should be set by the cardiologist, not the app. Source: [2022 AHA/ACC/HFSA Guideline](https://www.ahajournals.org/doi/10.1161/CIR.0000000000001063).

---

## 2. Decompensation warning signs — RANKED BY URGENCY

Ordering is by typical clinical ranking: weight → edema → dyspnea on exertion → orthopnea → PND → cough/pulmonary edema → mental status. Each row gives the caregiver's plain-English description, clinical meaning, and urgency tier.

### Tier 1 — IMMEDIATE 911

| Sign | Caregiver description | Why it matters | Source |
|---|---|---|---|
| **Severe shortness of breath at rest** | "Mom is struggling to breathe just sitting still, can't finish a sentence" | Acute pulmonary edema; acute decompensation | [Cleveland Clinic – HF Zones](https://my.clevelandclinic.org/departments/heart/patient-education/recovery-care/heart-failure/heart-failure-zones) |
| **Coughing up pink or white frothy sputum** | "She's coughing up pink-tinged foam" | Near-certain flash pulmonary edema | [AHA – HF Warning Signs](https://www.heart.org/en/health-topics/heart-failure/warning-signs-of-heart-failure); [Cardiogenic Pulmonary Edema, StatPearls](https://www.ncbi.nlm.nih.gov/books/NBK544260/) |
| **New chest pain or pressure** | "Crushing chest pain, pressure, pain radiating to arm/jaw" | Possible MI or ACS | [AHA – When to Call 911](https://www.heart.org/en/health-topics/house-calls/when-to-call-911) |
| **Sudden confusion, inability to recognize family, slurred speech** | "She's not making sense, doesn't know what day it is, can't find words" | Cerebral hypoperfusion, severe hyponatremia, or stroke | [Cleveland Clinic – HF Zones](https://my.clevelandclinic.org/departments/heart/patient-education/recovery-care/heart-failure/heart-failure-zones); [HF and cognitive impairment, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC2684513/) |
| **Fainting / syncope** | "She passed out" | Arrhythmia, severe hypotension, cardiac event | [AHA – HF Warning Signs](https://www.heart.org/en/health-topics/heart-failure/warning-signs-of-heart-failure) |
| **Bluish lips or fingers (cyanosis)** | "Her lips look blue/gray" | Critical hypoxemia | [Cardiogenic Pulmonary Edema, StatPearls](https://www.ncbi.nlm.nih.gov/books/NBK544260/) |
| **SpO2 <88%** (or <90% with new dyspnea) | See 1.4 | Severe hypoxemia | [Oxygen Management in HF, 2022](https://journals.sagepub.com/doi/full/10.1177/26324636221081585) |
| **New fast irregular heartbeat with dizziness/chest pain** | "Her pulse is racing and irregular and she feels awful" | Possible new AF with RVR, VT | [AHA – When to Call 911](https://www.heart.org/en/health-topics/house-calls/when-to-call-911) |

### Tier 2 — CALL CARDIOLOGIST TODAY (same day)

| Sign | Caregiver description | Why it matters | Source |
|---|---|---|---|
| **Rapid weight gain** (>2 lb/24 hr, >3 lb/48 hr, or >5 lb/week) | "She's up 3 pounds since yesterday morning" | Fluid retention; earliest and most reliable decompensation signal | [AHA – Managing HF Symptoms](https://www.heart.org/en/health-topics/heart-failure/warning-signs-of-heart-failure/managing-heart-failure-symptoms); [Chaudhry, Circulation 2007](https://www.ahajournals.org/doi/10.1161/circulationaha.107.690768) |
| **New or worsening orthopnea** | "She needs 3 pillows to sleep now; used to sleep flat" | Increased pulmonary venous pressure when supine — hallmark of worsening HF | [Dyspnea, Orthopnea, PND – Clinical Methods (NCBI)](https://www.ncbi.nlm.nih.gov/books/NBK213/) |
| **Paroxysmal nocturnal dyspnea (PND)** | "She woke up 2 hours into sleep gasping for air, had to sit up / open a window" | Highly specific for HF decompensation; usually 1–3 hours after lying down | [Dyspnea, Orthopnea, PND – Clinical Methods (NCBI)](https://www.ncbi.nlm.nih.gov/books/NBK213/) |
| **New or worsening leg/ankle/abdominal swelling** | "Socks are leaving deep marks; her shoes don't fit; belly looks distended" | Peripheral edema from right-sided congestion | [AHA – Physical Changes to Report](https://www.heart.org/en/health-topics/heart-failure/living-with-heart-failure-and-managing-advanced-hf/physical-changes-to-report-for-heart-failure); [AAFP – Peripheral Edema, 2022](https://www.aafp.org/pubs/afp/issues/2022/1100/peripheral-edema.html) |
| **Worsening dyspnea on exertion** | "She used to walk to the bathroom fine; now she stops halfway to catch her breath" | NYHA class deterioration | [AHA – HF Classes](https://www.heart.org/en/health-topics/heart-failure/what-is-heart-failure/classes-of-heart-failure) |
| **New persistent cough, especially at night** | "Dry hacking cough that's worse when she lies down" | Pulmonary congestion (may be mistaken for cold/ACE-I side effect) | [AHA – HF Warning Signs](https://www.heart.org/en/health-topics/heart-failure/warning-signs-of-heart-failure) |
| **New decreased urine output** | "She barely went to the bathroom today" | Poor renal perfusion / worsening cardiorenal syndrome | [Oliguria, Cleveland Clinic](https://my.clevelandclinic.org/health/diseases/22271-oliguria); [Renal Function Monitoring in HF, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5736847/) |
| **SBP <90 with dizziness/lightheadedness** | "Her blood pressure is 85/55 and she's dizzy standing up" | Hypoperfusion, possible over-diuresis | [Management of low BP in HFrEF, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7540603/) |
| **Resting HR persistently >100** | "Her pulse has been 110+ sitting on the couch" | Tachycardia from decompensation or new arrhythmia | [2022 AHA/ACC/HFSA Guideline](https://www.ahajournals.org/doi/10.1161/CIR.0000000000001063) |
| **Cold, clammy extremities with fatigue** | "Her hands and feet feel cold and sweaty" | Low cardiac output / poor perfusion | [Cardiogenic Pulmonary Edema, StatPearls](https://www.ncbi.nlm.nih.gov/books/NBK544260/) |
| **New nausea / early satiety / loss of appetite** | "She fills up after a few bites; stomach feels bloated" | Hepatic/gut congestion from right-sided HF | [AHA – Physical Changes to Report](https://www.heart.org/en/health-topics/heart-failure/living-with-heart-failure-and-managing-advanced-hf/physical-changes-to-report-for-heart-failure) |
| **Mild new confusion / forgetfulness / lethargy** (not emergency level) | "She seems foggier than usual, slower" | Early cerebral hypoperfusion, possible hyponatremia | [HF and cognitive impairment, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC2684513/) |

### Tier 3 — CALL WITHIN 48 HOURS

| Sign | Caregiver description | Why it matters | Source |
|---|---|---|---|
| **Weight gain 1–2 lb/day for 2–3 consecutive days** (below 2 lb/day threshold but trending) | "She's up a pound each morning for three days in a row" | Precedes overt decompensation by ~30 days in Chaudhry et al. data | [Chaudhry, Circulation 2007](https://www.ahajournals.org/doi/10.1161/circulationaha.107.690768) |
| **More tired than usual / needs more naps** | "She's napping twice a day now when she used to nap once" | Falling stroke volume or falling Hb; NYHA creep | [Cleveland Clinic – HF Zones](https://my.clevelandclinic.org/departments/heart/patient-education/recovery-care/heart-failure/heart-failure-zones) |
| **Mild swelling that resolves with elevation overnight** | "Ankles puff up in the evening but look normal by morning" | Early fluid retention — still caught in time | [AAFP – Peripheral Edema](https://www.aafp.org/pubs/afp/issues/2022/1100/peripheral-edema.html) |
| **New brief dizziness** (<1 minute, no fall) | "She got lightheaded standing up, passed in 10 seconds" | Possible over-diuresis, orthostasis, arrhythmia | [Cleveland Clinic – HF Zones](https://my.clevelandclinic.org/departments/heart/patient-education/recovery-care/heart-failure/heart-failure-zones) |

### Tier 4 — WATCH AND LOG

| Sign | Caregiver description | Why it matters | Source |
|---|---|---|---|
| **Stable daily weight within 2 lb of baseline** | "She's ±1 lb from yesterday" | Normal variance | [AHA – Managing HF Symptoms](https://www.heart.org/en/health-topics/heart-failure/warning-signs-of-heart-failure/managing-heart-failure-symptoms) |
| **Isolated "off" day** (one night's poor sleep, one skipped meal) | "Just not herself today" | Log; pattern-matching across days is what matters | [Cleveland Clinic – HF Zones](https://my.clevelandclinic.org/departments/heart/patient-education/recovery-care/heart-failure/heart-failure-zones) |

### Supplemental clinical signs (mostly for the app's "what to tell the cardiologist" report, not caregiver self-assessment)

- **JVD (jugular venous distension):** Visible neck vein bulging >4 cm above the sternal angle with head of bed at 30–45°. A clinician or trained nurse finds this; caregivers shouldn't be expected to. Source: [Jugular Venous Distention, StatPearls (NBK553098)](https://www.ncbi.nlm.nih.gov/books/NBK553098/). The app could prompt the caregiver to photograph the neck in the morning and let the cardiologist eyeball it during telemedicine — but do not make JVD a self-assessed red flag.
- **Pitting edema grading:** Press firmly for ~5 seconds on the shin or top of the foot. Grade 1 (2 mm pit, rebounds instantly) through Grade 4 (8 mm pit, >30 sec rebound). Source: [Physiopedia – Oedema Assessment](https://www.physio-pedia.com/Oedema_Assessment); [Brodovicz et al., PMC2705274](https://pmc.ncbi.nlm.nih.gov/articles/PMC2705274/). App can ask "did a fingertip press leave a dent?" as a binary proxy.

---

## 3. Exact numeric "call your doctor immediately" criteria (from patient-facing material)

Consolidating the patient-facing language from the major US institutions. These are what HeartNote's alert copy should echo — they are the numbers real cardiologists' offices put on discharge handouts.

| Institution | Weight criteria | Other numeric criteria |
|---|---|---|
| **AHA** (Managing HF Symptoms) | ">2 or 3 lb in a day or more than 5 lb in a week" | No BP/HR numbers published on the patient-facing symptom page |
| **Cleveland Clinic Heart Failure Zones** | Gain or lose "4 or more pounds" from dry weight = Yellow Zone | "Dizziness that lasts for more than a minute" = Yellow. Confusion / struggling to breathe at rest / new chest pain = Red (911) |
| **ESC / Heart Failure Matters** (patient-facing) | ">2 kg (3 lb) in 3 days" | Not specified in patient material |
| **Kaiser Permanente Daily Action Plan** | ">2 to 3 lb in a day or 5 lb in a week" → Yellow | Red zone: severe trouble breathing, pink foamy mucus, new irregular/fast heartbeat, heart attack symptoms |
| **AHA News (consumer article)** | "Rapid weight gain (2 lb or more in a day, or 5 lb or more in a week)" is listed as a 911-level sign when combined with other acute symptoms | — |

**Key patient-facing quote (AHA):** "Many people first realize their heart failure is getting worse when they notice gaining more than two or three pounds in a day or more than five pounds in a week." — [heart.org](https://www.heart.org/en/health-topics/heart-failure/warning-signs-of-heart-failure/managing-heart-failure-symptoms)

**Gap flagged:** Penn Medicine's patient education booklet was not directly accessible via WebFetch (403). The numbers cited above for "Penn-like" academic medical center guidance (3 lb in 24 hr, 5 lb in 7 days) are from aggregated summaries of multiple cardiology program handouts, not a single primary Penn URL. If accuracy for a specific program's copy matters downstream, this should be verified by obtaining the Penn Medicine or equivalent printed handout directly.

---

## 4. NYHA Functional Class definitions

Published verbatim on the AHA's classes-of-heart-failure page. Source: [AHA – Classes and Stages of Heart Failure](https://www.heart.org/en/health-topics/heart-failure/what-is-heart-failure/classes-of-heart-failure).

| Class | AHA definition (verbatim) | What the caregiver observes |
|---|---|---|
| **Class I** | "No limitation of physical activity. Ordinary physical activity does not cause undue fatigue, palpitation or shortness of breath." | Mom walks up a flight of stairs, does groceries, holds conversation — no symptoms |
| **Class II** | "Slight limitation of physical activity. Comfortable at rest. Ordinary physical activity results in fatigue, palpitation, shortness of breath or chest pain." | Stairs or grocery trips cause her to pause for breath; fine sitting |
| **Class III** | "Marked limitation of physical activity. Comfortable at rest. Less than ordinary activity causes fatigue, palpitation, shortness of breath or chest pain." | Walking to the bathroom or making a sandwich leaves her winded; still fine in the recliner |
| **Class IV** | "Symptoms of heart failure at rest. Any physical activity causes further discomfort." | Short of breath sitting; can't sleep flat; any movement worsens symptoms |

**ACC/AHA Stages (orthogonal to NYHA class — describes disease progression, not current symptoms):**
- **Stage A** — "At risk for heart failure" (risk factors, no structural disease, no symptoms)
- **Stage B** — "Pre-heart failure" (structural disease, no symptoms)
- **Stage C** — "Symptomatic heart failure" (current or previous HF symptoms)
- **Stage D** — "Advanced heart failure" (refractory symptoms disrupting daily life, hospitalizations)

Source: [AHA – Classes and Stages of Heart Failure](https://www.heart.org/en/health-topics/heart-failure/what-is-heart-failure/classes-of-heart-failure); [2022 AHA/ACC/HFSA Guideline](https://www.ahajournals.org/doi/10.1161/CIR.0000000000001063).

**App use:** Ask caregiver at onboarding what NYHA class the cardiologist assigned the patient. Use that as context for how aggressive to be with alerts (Class IV patients at baseline need tighter thresholds and lower alarm fatigue tolerance than Class II patients). Do not let the app try to auto-classify NYHA — that's a clinician judgment.

---

## 5. Decompensation progression — typical timeline

The landmark study is Chaudhry SI et al., "Patterns of Weight Change Preceding Hospitalization for Heart Failure," *Circulation* 2007 (nested case-control, n=134 matched pairs from the TEN-HMS trial). It is the single best published description of the pre-decompensation timeline.

Source: [Chaudhry SI et al., Circulation 2007](https://www.ahajournals.org/doi/10.1161/circulationaha.107.690768) / [PMC full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC2892745/).

### The Chaudhry curve

- **~30 days before hospitalization:** Daily weight of eventual-admit patients begins to diverge from that of controls. Divergence is small and gradual.
- **~7 days before hospitalization:** Weight gain accelerates markedly in admit-bound patients; controls remain stable.
- **Day of admission:** Weight is measurably higher than baseline, often by 5+ lb.

### Risk quantification from the same study (7-day window preceding admission)

| Weight gain in prior 7 days | Adjusted OR for HF hospitalization |
|---|---|
| 2–5 lb | 2.77 (95% CI 1.13–6.80) |
| 5–10 lb | 4.46 (95% CI 1.45–13.75) |
| >10 lb | 7.65 (95% CI 2.22–26.39) |
| Continuous: each additional lb | OR 1.07 |

**Translation for product:** Every pound matters. The risk curve is continuous, not stepwise.

### Symptom compounding order (clinical convention, consistent across sources)

1. **Weight gain** (silent, detectable only by scale; precedes symptoms by days to weeks)
2. **Peripheral edema** (ankles first, then calves, abdomen; worsens evening, improves overnight initially — then stops improving)
3. **Dyspnea on exertion** (stairs, then walking on flat, then ADLs)
4. **Orthopnea** (extra pillows; sleeping semi-upright)
5. **Paroxysmal nocturnal dyspnea** (waking gasping 1–3 hours after lying down)
6. **Cough, especially nocturnal; then pink frothy sputum** (late finding — flash pulmonary edema)
7. **Confusion, cool extremities, decreased urine output** (low-output / end-organ hypoperfusion)

Sources for the ordering: [AHA – HF Warning Signs](https://www.heart.org/en/health-topics/heart-failure/warning-signs-of-heart-failure); [AHA – Physical Changes to Report](https://www.heart.org/en/health-topics/heart-failure/living-with-heart-failure-and-managing-advanced-hf/physical-changes-to-report-for-heart-failure); [Dyspnea, Orthopnea, PND – NCBI Clinical Methods](https://www.ncbi.nlm.nih.gov/books/NBK213/); [Cardiogenic Pulmonary Edema, StatPearls](https://www.ncbi.nlm.nih.gov/books/NBK544260/).

### The 72-hour pre-hospitalization window

In the last 72 hours before an admission, the typical patient will have:
- Gained 3–5+ lb from baseline
- Been short of breath on exertion and now at rest
- Developed or worsened orthopnea (extra pillows)
- Often had one PND episode the night before admission
- May have developed cough, nausea, early satiety, oliguria
- May be confused or lethargic

This is the window HeartNote's red-alert is designed to catch — ideally at the **72-hour mark or earlier**, before the ER becomes the only option. The goal is to turn a would-be hospitalization into a same-day clinic visit with a diuretic adjustment.

### Implications for HeartNote alert design

- **Rolling 30-day weight trend is more informative than any single day.** Chaudhry's divergence starts 30 days out. Any app relying on a pure 2-lb/day trigger will miss the slow gainers.
- **A compound alert (weight trend + new symptom) is far more specific than either alone.** Weight gain without symptoms has moderate PPV; weight gain plus new orthopnea or dyspnea has very high PPV.
- **The patient's own baseline matters more than a population threshold.** A 150-lb patient gaining 3 lb is proportionally far worse than a 250-lb patient gaining 3 lb. Normalize to percent-of-body-weight for tier-2 and tier-3 logic.
- **False positives are costly here.** An alarm-fatigued caregiver who ignores day-17's alert may ignore day-23's real alert. Tune to 1–2 tier-2+ alerts per month for a stable patient, with transparent reasoning surfaced to the caregiver ("weight is up 4 lb over 5 days AND you logged extra pillows AND cough at night — here is what to tell the cardiologist").

---

## Summary — what to wire into the red-alert logic

**Tier 1 (911) triggers — any one of:**
- Severe dyspnea at rest / can't finish sentences
- Coughing pink or white frothy sputum
- New chest pain/pressure or radiating pain
- New confusion, slurred speech, or inability to recognize family
- Syncope
- Cyanotic lips/fingers
- SpO2 <88% OR SpO2 <90% with new dyspnea
- New fast irregular pulse with chest pain or dizziness

**Tier 2 (call cardiologist today) triggers — any one of:**
- Weight gain >2 lb in 24 hr, >3 lb in 48 hr, or >5 lb in 7 days
- New or worsened orthopnea (more pillows than last week)
- Any PND episode in the last 48 hr
- New or markedly worsened peripheral/abdominal swelling
- Worsening dyspnea on exertion (step-change in ADL tolerance)
- New persistent nocturnal cough
- Notable decrease in urine output
- SBP <90 with dizziness/confusion
- Resting HR persistently >100 or <50 with symptoms
- Cold clammy extremities with fatigue
- New nausea / early satiety / appetite loss persisting >24 hr
- Mild new confusion or lethargy

**Tier 3 (48-hr cardiologist call) triggers — any one of:**
- Weight up 1–2 lb/day for 3+ consecutive days (below tier-2 thresholds but trending)
- Step-change in fatigue / napping pattern
- Mild evening-only swelling
- Brief orthostatic dizziness

**Tier 4 (watch and log) — everything else:** the daily voice log continues, trend analysis continues, no notification fires.

---

## Known gaps in this research (flagged for later resolution)

1. **Penn Medicine primary patient handout URL** — 403 blocked. The 3-lb/24-hr, 5-lb/7-day academic-medical-center guidance comes from aggregated summaries. For production copy, obtain a verified Penn Medicine or Johns Hopkins PDF handout directly.
2. **HFSA patient-facing self-care pages** — 403 blocked repeatedly via WebFetch. The HFSA numeric threshold guidance cited above comes from the ESC/Heart Failure Matters and aggregator sources, not directly from HFSA's own patient portal. Worth re-attempting via a different user agent or by contacting HFSA directly.
3. **VA and Providence Heart Failure Zone PDFs** — served as binary PDFs that WebFetch could not parse. Direct download and manual review would yield exact wording if needed.
4. **2022 AHA/ACC/HFSA Guideline full text** — the guideline itself does not publish specific caregiver-facing weight gain thresholds (those live in patient education material). Do not cite the guideline directly for the "2 lb/day" rule; cite the AHA patient pages for that.
5. **Medication-specific caregiver watchpoints** (loop diuretics, ACE-I/ARB/ARNI, beta blockers, MRAs, SGLT2i) — this document touches diuretic side-effects briefly but does not yet compile per-drug caregiver cue cards. That is a separate research deliverable.
6. **Real caregiver pain language from Reddit / Facebook groups** — not in scope for this clinical-thresholds document; separate qualitative research task.
7. **Competitor app (MyTherapy, Cormeum, Heart Failure Storylines, myHeart, CardioAssist) feature and complaint inventory** — partial data only; full review is a separate task.

The document as written is sufficient to specify HeartNote's red-alert tiering logic and first-pass caregiver copy. Items 1–4 above should be closed before any clinical-advisor review. Items 5–7 are separate research tasks.
