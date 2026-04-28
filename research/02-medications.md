# HeartNote Research — CHF Medications & Caregiver Watchpoints

**Purpose:** Source-of-truth document for HeartNote's medication-related red-alert logic and caregiver education copy. Focus is the adult-child caregiver watching a parent take these drugs at home — not a clinician adjusting therapy.

**Scope:** Four pillars of guideline-directed medical therapy (GDMT) for HFrEF, common adjunct medications, high-risk drug combinations, OTC/supplement interactions, and medication-related decompensation patterns.

**Status of guidelines as of research date (April 2026):**
- The governing U.S. guideline is the **2022 AHA/ACC/HFSA Guideline for the Management of Heart Failure** ([Circulation, 2022](https://www.ahajournals.org/doi/10.1161/CIR.0000000000001063)).
- SGLT2 inhibitors were promoted to "fourth pillar" GDMT for HFrEF in this 2022 update ([ACC summary](https://www.acc.org/Latest-in-Cardiology/ten-points-to-remember/2022/03/29/19/53/2022-AHA-ACC-HFSA-Heart-Failure-Guideline-gl-hf)).
- SGLT2 inhibitors gained a Class I recommendation for **HFpEF** in the **2023 ESC Focused Update** and subsequent AHA expert consensus — this is recent and caregivers/clinicians may not yet be aware ([ESC 2023 update, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11562572/)).

**Dosing note:** This document gives **ranges only** and never per-patient dosing recommendations. The app must never suggest dose changes — only flag observations and prompt "call the cardiologist."

---

## 1. Loop Diuretics — furosemide (Lasix), torsemide, bumetanide

### Typical adult oral dose ranges
- **Furosemide (Lasix):** commonly 20–80 mg once or twice daily; refractory heart failure can require higher ([StatPearls — Furosemide](https://www.ncbi.nlm.nih.gov/books/NBK499921/); [RxList Lasix](https://www.rxlist.com/lasix-drug.htm)).
- **Torsemide:** roughly half the mg of furosemide for equivalent effect; 10–20 mg torsemide ≈ 40 mg furosemide oral ([Drugs.com equivalence answer](https://www.drugs.com/medical-answers/equivalent-dosages-bumetanide-furosemide-torsemide-3572303/); [Michigan Medicine equivalent-dose table, NCBI](https://www.ncbi.nlm.nih.gov/books/NBK589894/table/michiganmedicine.t2/)).
- **Bumetanide:** most potent per mg. 1 mg bumetanide ≈ 40 mg oral furosemide ≈ 20 mg torsemide ([Drugs.com equivalence answer](https://www.drugs.com/medical-answers/equivalent-dosages-bumetanide-furosemide-torsemide-3572303/)).
- Oral furosemide has ~50% bioavailability; torsemide has >80% and a longer half-life, which is why torsemide is sometimes preferred when absorption is erratic ([TRANSFORM-HF, EHJ Acute CV Care](https://academic.oup.com/ehjacc/article/11/12/931/6815649)).

### What caregivers should watch for (plain-English)
- **Signs of going too dry (dehydration / over-diuresis):** dizziness when standing up, lightheaded in the shower, dry mouth, sunken eyes, weak pulse, confusion, peeing very little despite taking the pill, sudden weight drop more than ~2–3 lb in a day on a stable dose. Loop diuretics can drop blood pressure fast and cause dehydration ([SimpleNursing — Furosemide](https://simplenursing.com/furosemide-nursing-considerations/); [StatPearls — Furosemide](https://www.ncbi.nlm.nih.gov/books/NBK499921/)).
- **Low potassium (hypokalemia):** muscle cramps (especially calves at night), weakness, palpitations, constipation, irregular heartbeat. Loop diuretics waste potassium ([Davis's Drug Guide — Furosemide](https://nursing.unboundmedicine.com/nursingcentral/view/Davis-Drug-Guide/51345/all/furosemide); [SimpleNursing — Furosemide](https://simplenursing.com/furosemide-nursing-considerations/)).
- **Low sodium (hyponatremia):** headache, nausea, confusion, unsteady walk — especially dangerous in older adults ([StatPearls — Furosemide](https://www.ncbi.nlm.nih.gov/books/NBK499921/)).
- **Low magnesium (hypomagnesemia):** tremor, twitching, palpitations. Often co-occurs with low potassium ([StatPearls — Furosemide](https://www.ncbi.nlm.nih.gov/books/NBK499921/)).
- **Kidney function decline:** dark urine, peeing much less, rising creatinine on labs, ankle puffiness paradoxically getting worse ([StatPearls — Furosemide](https://www.ncbi.nlm.nih.gov/books/NBK499921/)).
- **Hearing changes (ototoxicity):** ringing in ears, sudden hearing loss or fullness. Rare at oral home doses; mostly seen with high-dose IV in hospital ([StatPearls — Furosemide](https://www.ncbi.nlm.nih.gov/books/NBK499921/)).
- **Fall risk:** Sudden urge to urinate + hypotension = falls in older adults. Especially dangerous at night ([Nurseslabs — Furosemide teaching](https://nurseslabs.com/furosemide-nursing-considerations-and-patient-teaching-drug-guide/)).

### Timing concerns
- **Take in the morning.** If twice daily, second dose no later than mid-afternoon (5 pm at the latest) — otherwise the patient is up peeing all night ([Davis's Drug Guide — Furosemide](https://nursing.unboundmedicine.com/nursingcentral/view/Davis-Drug-Guide/51345/all/furosemide); [Nurseslabs — Furosemide teaching](https://nurseslabs.com/furosemide-nursing-considerations-and-patient-teaching-drug-guide/)).
- Oral loop diuretics work in ~1 hour and peak ~1–2 hours; effect lasts 6–8 hours ([Nocturia — StatPearls](https://www.ncbi.nlm.nih.gov/books/NBK518987/)).

### Weight-tracking interaction (critical for HeartNote AI)
- **A good diuresis day can drop 2–3 lb in 24 hours.** This is *not* decompensation-in-reverse — it's the drug working. The app's weight-trend logic must not flag a sudden loss of 2–3 lb as concerning if it follows a diuretic dose increase or a logged "high pee volume" day.
- Conversely, **unexplained weight regain within 24–48 hours of a loop diuretic dose change** is a meaningful flag (patient may have missed doses, doubled up earlier, or is developing diuretic resistance).
- Post-diuretic rebound sodium retention is a real mechanism — missing a dose lets the kidney hold more salt/water than baseline, so one missed dose can produce >24 hours of fluid regain ([Diuretic therapy JACC review](https://www.jacc.org/doi/10.1016/j.jacc.2019.12.059); [Cleveland Clinic Journal — ADHF diuresis](https://www.ccjm.org/content/89/10/561)).

---

## 2. ACE Inhibitors / ARBs / ARNIs

Drugs in class (HF-relevant):
- **ACE-I:** lisinopril, enalapril, ramipril, captopril
- **ARB:** losartan, valsartan, candesartan
- **ARNI:** sacubitril/valsartan (Entresto)

All three reduce afterload and block the renin-angiotensin system. Per the 2022 guidelines, **ARNI is preferred over ACE-I or ARB when possible** for chronic HFrEF ([ACC 2022 guideline summary](https://www.acc.org/Latest-in-Cardiology/ten-points-to-remember/2022/03/29/19/53/2022-AHA-ACC-HFSA-Heart-Failure-Guideline-gl-hf)).

### Caregiver watchpoints (plain-English)
- **Low blood pressure / orthostatic hypotension:** dizzy standing up, faint getting out of bed, near-fall in the bathroom. Start of therapy and dose increases are the riskiest windows ([StatPearls — ACE Inhibitors](https://www.ncbi.nlm.nih.gov/books/NBK430896/)).
- **Dry hacking cough (ACE-I specific):** affects 5–20% of patients on lisinopril/enalapril/ramipril. Caused by bradykinin buildup. Not dangerous, but often triggers a switch to ARB or ARNI ([StatPearls — ACE Inhibitors](https://www.ncbi.nlm.nih.gov/books/NBK430896/); [AmericanNurse — ACE-I angioedema](https://www.myamericannurse.com/when-ace-inhibitors-cause-angioedema/)).
- **Angioedema — ER immediately:** swelling of lips, tongue, face, or throat. Rare (0.1–0.7%) but life-threatening. Higher risk in Black patients. Can occur after years on the drug, not just at initiation ([AmericanNurse — ACE-I angioedema](https://www.myamericannurse.com/when-ace-inhibitors-cause-angioedema/); [Medsafe NZ 2023 reminder](https://www.medsafe.govt.nz/profs/PUArticles/June2023/Reminder-ACE-inhibitor-induced-angioedema-can-be-fatal.html)).
- **Hyperkalemia (high potassium):** muscle weakness, tingling, slow/irregular heartbeat, nausea. Often silent until cardiac arrhythmia. The app should treat any logged lab K+ ≥ 5.0 as flag territory when the patient is on ACE-I, ARB, or ARNI ([Cleveland Clinic Journal — ACE-I/ARB K and renal monitoring](https://www.ccjm.org/content/86/9/601); [StatPearls — ACE Inhibitors](https://www.ncbi.nlm.nih.gov/books/NBK430896/)).
- **Rising creatinine / kidney function drop:** some increase in creatinine at initiation is expected and usually tolerated; sustained rise is not. Caregiver-facing sign: peeing much less, ankles more swollen despite same diet ([Cleveland Clinic Journal — ACE-I/ARB K and renal monitoring](https://www.ccjm.org/content/86/9/601)).

### Why ACE-I / ARB / ARNI are NEVER combined with each other
- All three act on the same renin-angiotensin axis. Combining doubles the risk of hyperkalemia, hypotension, acute kidney injury, and angioedema with no added survival benefit ([ACC Safe Prescribing of Sacubitril/Valsartan infographic PDF](https://www.acc.org/~/media/Non-Clinical/Images/Footer%20Content/Media%20Center/Info%20Graphics/2018/06/Safe-Prescribing-and-Use-of-Sacubitril-Valsartan-Entresto-Print.pdf?la=en); [AAFP — Sacubitril/Valsartan for HF](https://www.aafp.org/pubs/afp/issues/2016/1015/p611.html)).
- **HeartNote red flag rule:** if the medication list logs both an ACE-I (any "-pril") and an ARB (any "-sartan") or Entresto simultaneously, this is a prescribing error or mid-switch. Surface it for caregiver to verify with pharmacy/doctor.

### 36-hour washout rule — switching ACE-I to ARNI
- Entresto must not be started within **36 hours** of the last ACE-I dose (and vice versa). Overlap dramatically raises angioedema risk because both neprilysin inhibition and ACE inhibition elevate bradykinin ([Entresto HCP dosing page, Novartis](https://www.entrestohcp.com/safety-and-dosing/dosing); [SingleCare — Entresto washout](https://www.singlecare.com/blog/entresto-washout-period/); [AAFP — Sacubitril/Valsartan](https://www.aafp.org/pubs/afp/issues/2016/1015/p611.html)).
- **No washout is required switching from an ARB to Entresto** — ARB stops, Entresto starts at the next scheduled dose ([ACC Safe Prescribing infographic](https://www.acc.org/~/media/Non-Clinical/Images/Footer%20Content/Media%20Center/Info%20Graphics/2018/06/Safe-Prescribing-and-Use-of-Sacubitril-Valsartan-Entresto-Print.pdf?la=en)).
- **HeartNote caregiver alert candidate:** when the med list transitions from lisinopril (or other -pril) → Entresto, the app should prompt: "Did you skip a dose for at least 36 hours between the last ACE inhibitor and the first Entresto? Your cardiologist should have told you to — double-check if unsure."

---

## 3. Beta Blockers — carvedilol, metoprolol succinate, bisoprolol

**Only three beta blockers are proven in HFrEF and guideline-recommended:** carvedilol, sustained-release metoprolol succinate (NOT tartrate), and bisoprolol ([ACC 2022 guideline summary](https://www.acc.org/Latest-in-Cardiology/ten-points-to-remember/2022/03/29/19/53/2022-AHA-ACC-HFSA-Heart-Failure-Guideline-gl-hf); [Medscape — Beta Blockers in HFrEF](https://decisionpoint.medscape.com/cardiology/viewarticle/933289); [heartonline.org.au target doses PDF](https://www.heartonline.org.au/media/DRL/Recommended_target_doses_for_heart_failure_medications.pdf)).

**Important:** metoprolol **tartrate** (short-acting, twice-daily) lacks HFrEF mortality evidence. If caregiver sees "metoprolol tartrate" on a HFrEF patient's med list, that's worth raising with the prescriber ([Medscape — Beta Blockers in HFrEF](https://decisionpoint.medscape.com/cardiology/viewarticle/933289)).

### Target doses for HFrEF (per guidelines)
- **Carvedilol:** start 3.125 mg twice daily; target 25 mg twice daily (50 mg twice daily if >85 kg) ([heartonline.org.au target doses PDF](https://www.heartonline.org.au/media/DRL/Recommended_target_doses_for_heart_failure_medications.pdf); [StatPearls — Carvedilol](https://www.ncbi.nlm.nih.gov/books/NBK534868/)).
- **Metoprolol succinate (Toprol XL):** start 12.5–25 mg daily; target 200 mg daily ([heartonline.org.au target doses PDF](https://www.heartonline.org.au/media/DRL/Recommended_target_doses_for_heart_failure_medications.pdf)).
- **Bisoprolol:** start 1.25 mg daily; target 10 mg daily ([heartonline.org.au target doses PDF](https://www.heartonline.org.au/media/DRL/Recommended_target_doses_for_heart_failure_medications.pdf)).

### Caregiver watchpoints (plain-English)
- **Bradycardia (slow heart rate):** resting pulse under 50, feeling faint, chest pressure, near-blackout on standing. App should prompt pulse check at every voice log when patient is in first 4–8 weeks of a beta blocker titration ([StatPearls — Carvedilol](https://www.ncbi.nlm.nih.gov/books/NBK534868/)).
- **Low blood pressure:** especially carvedilol, which also blocks alpha receptors and drops BP more than bisoprolol or metoprolol ([StatPearls — Carvedilol](https://www.ncbi.nlm.nih.gov/books/NBK534868/)).
- **Fatigue, feeling "slowed down":** common in first 2–4 weeks. Often resolves. Should be logged but not reflexively stopped.
- **Worsening heart failure in the first month after a dose increase:** this is the paradoxical window. Beta blockers make HF better long-term but can transiently worsen congestion during uptitration — 2–3 lb weight gain, more ankle swelling, more shortness of breath with stairs. Should trigger a cardiology call, not an ER visit unless severe ([Frontiers — Beta-blocker management in acute HF](https://www.frontiersin.org/journals/cardiovascular-medicine/articles/10.3389/fcvm.2023.1263482/full)).
- **Cold hands/feet:** peripheral vasoconstriction. Annoying but not dangerous.
- **Sleep disturbance, vivid dreams, depression:** more common with carvedilol and metoprolol (lipophilic, cross blood-brain barrier).

### Why you NEVER stop abruptly
- Abrupt discontinuation can cause rebound tachycardia, hypertension, angina, MI, and acute decompensation of heart failure. The sympathetic nervous system rebounds within days ([PMC — Beta-blocker rebound phenomenon](https://pmc.ncbi.nlm.nih.gov/articles/PMC9724061/); [Nature — Beta blocker rebound review](https://www.nature.com/articles/s41440-020-0449-6); [PMC — Beta-blocker withdrawal in ADHF meta-analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC4777602/)).
- Discontinuation during an acute decompensation hospitalization is associated with **increased in-hospital mortality** and short-term rehospitalization ([PMC — Beta-blocker withdrawal in ADHF meta-analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC4777602/); [JACC HF — Beta-blockers in acute HF](https://www.jacc.org/doi/10.1016/j.jchf.2015.04.009)).
- **HeartNote alert candidate:** if caregiver logs "we stopped the beta blocker because she felt tired," surface: "Stopping beta blockers suddenly is dangerous. Please call the cardiologist today — even if you want to stop, it should be tapered."

---

## 4. MRAs / Aldosterone Antagonists — spironolactone, eplerenone

Both block the mineralocorticoid receptor. Spironolactone also weakly blocks androgen receptors (explains gynecomastia). Eplerenone is selective for mineralocorticoid.

### Typical adult doses
- **Spironolactone:** 12.5–25 mg daily start, target 25–50 mg daily in HFrEF ([heartonline.org.au target doses PDF](https://www.heartonline.org.au/media/DRL/Recommended_target_doses_for_heart_failure_medications.pdf)).
- **Eplerenone:** 25 mg daily start, target 50 mg daily ([heartonline.org.au target doses PDF](https://www.heartonline.org.au/media/DRL/Recommended_target_doses_for_heart_failure_medications.pdf); [StatPearls — Eplerenone](https://www.ncbi.nlm.nih.gov/books/NBK553100/)).

### Caregiver watchpoints (plain-English)
- **Hyperkalemia (high potassium) — the big one:** muscle weakness, tingling, slow/irregular pulse, nausea. MRAs alone increase potassium; **combined with ACE-I, ARB, or ARNI the risk compounds** ([UK MHRA 2016 safety update — spironolactone + RAS inhibitors](https://www.gov.uk/drug-safety-update/spironolactone-and-renin-angiotensin-system-drugs-in-heart-failure-risk-of-potentially-fatal-hyperkalaemia); [AHA Journals — hyperkalemia MRA outcomes](https://www.ahajournals.org/doi/10.1161/circheartfailure.114.001104)).
  - **Contraindicated if baseline K+ > 5.0 mmol/L** ([AHA Journals — EPHESUS potassium outcomes](https://www.ahajournals.org/doi/10.1161/circulationaha.108.778811); [Nature Hypertension Research — MRA hyperkalemia management](https://www.nature.com/articles/s41440-020-00569-y)).
  - Recommended lab cadence after MRA start or dose increase: potassium and creatinine at day 3, week 1, month 1, month 3, then every 3 months ([AHA Journals — hyperkalemia MRA outcomes](https://www.ahajournals.org/doi/10.1161/circheartfailure.114.001104)).
- **Gynecomastia / breast tenderness (spironolactone-specific):** up to 10% of men on spironolactone develop breast enlargement or breast pain. This is **not** a reason to stop the drug unilaterally — the doctor can switch to eplerenone, which causes gynecomastia in <0.5% ([BMC Cardiovascular Disorders — eplerenone vs. spironolactone meta-analysis](https://link.springer.com/article/10.1186/s12872-024-04103-7); [EBMConsult — Inspra vs Aldactone gynecomastia](https://www.ebmconsult.com/articles/gynecomastia-eplerenone-inspra-spironolactone-aldactone-androgen); [PMC — eplerenone reverses gynecomastia](https://pmc.ncbi.nlm.nih.gov/articles/PMC3090552/)).
- **Menstrual irregularity** in premenopausal women on spironolactone (not relevant to typical HeartNote user but worth knowing).
- **Kidney function decline:** monitor creatinine. Caregiver-facing sign: less urine despite same diuretic dose, rising fatigue.
- **Dehydration interaction:** MRAs are mild diuretics; if loop diuretic is also in play and patient is volume-depleted, hyperkalemia risk jumps further.

---

## 5. SGLT2 Inhibitors — dapagliflozin (Farxiga), empagliflozin (Jardiance)

**Standard GDMT for HFrEF since 2022 and for HFpEF since 2023 — regardless of whether the patient has diabetes** ([ACC 2022 guideline summary](https://www.acc.org/Latest-in-Cardiology/ten-points-to-remember/2022/03/29/19/53/2022-AHA-ACC-HFSA-Heart-Failure-Guideline-gl-hf); [ESC 2023 Focused Update, ScienceDirect](https://www.sciencedirect.com/science/article/pii/S1071916423003147); [PMC — 2023 ESC HF guideline update review](https://pmc.ncbi.nlm.nih.gov/articles/PMC11562572/)).

Typical HF dose: dapagliflozin 10 mg daily; empagliflozin 10 mg daily — no titration ([PMC — 2023 ESC HF update](https://pmc.ncbi.nlm.nih.gov/articles/PMC11562572/)).

### Caregiver watchpoints (plain-English)
- **Genital fungal infection (thrush, yeast infection, balanitis):** itching, burning, discharge, redness in groin/genital area. Common, usually not serious, treatable with OTC antifungal but always worth reporting ([StatPearls — SGLT2 inhibitors](https://www.ncbi.nlm.nih.gov/books/NBK576405/)).
- **Urinary tract infection:** burning with urination, urgency, cloudy urine, fever.
- **Fournier's gangrene — ER immediately:** severe pain, redness, swelling in genital/perineal area + fever or feeling very unwell. Rare but catastrophic. Tissue infection that spreads in hours ([FDA/MHRA Fournier warning](https://www.gov.uk/drug-safety-update/sglt2-inhibitors-reports-of-fournier-s-gangrene-necrotising-fasciitis-of-the-genitalia-or-perineum); [JAMA Internal Medicine — SGLT2 and Fournier](https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/2749348); [ADA Clinical Diabetes review](https://diabetesjournals.org/clinical/article/40/1/78/138888/Sodium-Glucose-Cotransporter-2-Inhibitor-Use)).
- **Euglycemic DKA — ER, can look normal on a finger-stick:** nausea, vomiting, belly pain, rapid breathing, fruity breath, confusion. Blood glucose can be under 250 mg/dL despite DKA — so caregivers can't rule it out by checking the sugar. Risk is higher during illness, fasting, dehydration, or after surgery. The SGLT2 should be stopped if DKA is suspected ([EMRA — Euglycemic DKA](https://www.emra.org/emresident/article/dont-kid-around-sglt-2-inhibitors-and-the-risk-for-euglycemic-dka); [PMC — EDKA case series](https://pmc.ncbi.nlm.nih.gov/articles/PMC12530474/)).
- **Volume depletion in first 2–4 weeks:** dizziness, dry mouth, hypotension. SGLT2s act partly as osmotic diuretics ([Circulation — SGLT2 and loop diuretics](https://www.ahajournals.org/doi/10.1161/CIRCULATIONAHA.120.048057)).

### Interaction with loop diuretic dosing
- SGLT2 inhibitors add a modest diuretic effect on top of loop diuretics. Many patients do **not** need a diuretic dose reduction when starting an SGLT2 ([ScienceDirect — Change in diuretic dose post-SGLT2](https://www.sciencedirect.com/science/article/abs/pii/S1053249822014231); [PMC — Combination of SGLT2 and loop diuretics](https://pmc.ncbi.nlm.nih.gov/articles/PMC11943756/)).
- Some clinicians reduce the loop diuretic by 30–50% if the patient is already euvolemic or showing early signs of volume depletion ([Academic.oup — SGLT2 and diuretics renal volume setpoint](https://academic.oup.com/eurheartj/article/44/31/2944/7174304)).
- **HeartNote pattern to detect:** in the 2–4 weeks after an SGLT2 is added to the med list, log a sudden drop in weight + dizziness → surface to caregiver as "this is the SGLT2 working, but if she's dizzy, call the cardiologist about reducing the water pill."

---

## 6. Digoxin

### When it's used
- **Narrow role in 2022 guidelines:** Class IIb (weak) recommendation for symptomatic HFrEF despite optimized GDMT, primarily to reduce HF hospitalizations — not mortality ([2022 AHA/ACC/HFSA Guideline, Circulation](https://www.ahajournals.org/doi/10.1161/CIR.0000000000001063); [ACC 2022 guideline summary](https://www.acc.org/Latest-in-Cardiology/ten-points-to-remember/2022/03/29/19/53/2022-AHA-ACC-HFSA-Heart-Failure-Guideline-gl-hf); [Cleveland Clinic Journal — Digoxin is still useful](https://www.ccjm.org/content/91/8/489)).
- Also used for rate control in HFrEF + AFib, particularly when the patient can't tolerate more beta blocker.
- Therapeutic level goal: 0.5–0.9 ng/mL; the 2022 guideline recommends keeping it **under 1.0 ng/mL** given mortality signal at ≥1.2 ng/mL ([Cleveland Clinic Journal — Digoxin](https://www.ccjm.org/content/91/8/489); [StatPearls — Cardiac Glycoside and Digoxin Toxicity](https://www.ncbi.nlm.nih.gov/books/NBK459165/)).

### Caregiver watchpoints — classic digoxin toxicity triad
Narrow therapeutic window. Toxicity is more likely when kidney function worsens, when the patient dehydrates, and when potassium or magnesium is low.

- **GI first:** loss of appetite, nausea, vomiting, abdominal pain, diarrhea. Often the earliest warning sign ([PMC — Digoxin toxicity practical management](https://pmc.ncbi.nlm.nih.gov/articles/PMC10599802/); [StatPearls — Cardiac Glycoside Toxicity](https://www.ncbi.nlm.nih.gov/books/NBK459165/); [Medscape — Digitalis Toxicity Clinical Presentation](https://emedicine.medscape.com/article/154336-clinical)).
- **Visual changes (pathognomonic):** yellow or green halos around lights, blurred vision, "everything looks yellow" (xanthopsia), hazy vision like driving at night with dirty glasses ([Wikipedia — Digoxin toxicity](https://en.wikipedia.org/wiki/Digoxin_toxicity); [PMC — Xanthopsia case report](https://pmc.ncbi.nlm.nih.gov/articles/PMC7440749/)).
- **Neuro:** confusion, drowsiness, weakness, headache, disorientation ([Medscape — Digitalis Toxicity](https://emedicine.medscape.com/article/154336-clinical)).
- **Cardiac:** bradycardia, irregular pulse, palpitations, syncope. Can escalate to life-threatening ventricular arrhythmias ([StatPearls — Cardiac Glycoside Toxicity](https://www.ncbi.nlm.nih.gov/books/NBK459165/)).

### Electrolyte interaction (HeartNote logic)
Digoxin toxicity is **amplified** by hypokalemia, hypomagnesemia, and hypercalcemia ([StatPearls — Cardiac Glycoside Toxicity](https://www.ncbi.nlm.nih.gov/books/NBK459165/)). A patient on digoxin + furosemide is at extra risk — a missed potassium supplement + an aggressive diuresis day can trigger toxicity. The app should treat "patient on digoxin + loop diuretic + new GI symptoms or visual changes" as urgent-call territory.

---

## 7. Antiarrhythmics — amiodarone (primary one in CHF + AFib)

Amiodarone is the workhorse antiarrhythmic in CHF because most others (e.g., flecainide, propafenone, dronedarone) are contraindicated or relatively contraindicated in HFrEF. Adverse-event incidence is 30–90% overall; serious toxicity 10–26% with long-term use ([Frontiers — Amiodarone multi-systemic toxicity case report](https://www.frontiersin.org/journals/cardiovascular-medicine/articles/10.3389/fcvm.2022.839441/full); [AAFP — Amiodarone guidelines](https://www.aafp.org/pubs/afp/issues/2003/1201/p2189.html)).

### Caregiver watchpoints (plain-English)
- **Pulmonary — most dangerous:** new dry cough, shortness of breath, chest discomfort, low-grade fever. Amiodarone pulmonary toxicity mortality 1–33%; incidence ~10% with chronic use ([Frontiers — Amiodarone case report](https://www.frontiersin.org/journals/cardiovascular-medicine/articles/10.3389/fcvm.2022.839441/full); [PMC — Amiodarone pulmonary toxicity](https://pmc.ncbi.nlm.nih.gov/articles/PMC2687560/)). **In a CHF patient this can be mistaken for worsening heart failure** — so the app should not auto-reassure.
- **Thyroid — both directions (14–18% of long-term users):**
  - *Hypothyroidism:* fatigue, cold intolerance, weight gain, dry skin, constipation, slowed thinking.
  - *Hyperthyroidism:* palpitations, weight loss, heat intolerance, anxiety, tremor. Especially dangerous — can precipitate HF decompensation ([Frontiers — Amiodarone case report](https://www.frontiersin.org/journals/cardiovascular-medicine/articles/10.3389/fcvm.2022.839441/full); [AAFP — Amiodarone guidelines](https://www.aafp.org/pubs/afp/issues/2003/1201/p2189.html)).
- **Liver:** ~24% have asymptomatic transaminitis; <1% develop clinical hepatitis. Watch for jaundice (yellow eyes/skin), dark urine, right-upper abdominal pain ([Frontiers — Amiodarone case report](https://www.frontiersin.org/journals/cardiovascular-medicine/articles/10.3389/fcvm.2022.839441/full)).
- **Skin:** blue-gray discoloration with sun exposure; photosensitivity (severe sunburn after brief exposure) ([AAFP — Amiodarone guidelines](https://www.aafp.org/pubs/afp/issues/2003/1201/p2189.html)).
- **Eye:** corneal microdeposits (nearly universal, usually not symptomatic); rare optic neuropathy with vision loss.
- **Neuro:** tremor, ataxia, peripheral neuropathy.

### Monitoring schedule (what the caregiver should see happening)
- Thyroid (TSH) and liver function: baseline and every 6 months ([AAFP — Amiodarone guidelines](https://www.aafp.org/pubs/afp/issues/2003/1201/p2189.html); [NHS SPS — Amiodarone monitoring](https://www.sps.nhs.uk/monitorings/amiodarone-monitoring/)).
- Chest X-ray annually; pulmonary function tests (with DLCO) at baseline and if symptoms ([AAFP — Amiodarone guidelines](https://www.aafp.org/pubs/afp/issues/2003/1201/p2189.html)).
- Eye exam at baseline and yearly.
- **HeartNote flag candidate:** if the patient has been on amiodarone for 6+ months and no TSH or liver panel has been logged, prompt caregiver to ask at next visit.

### Drug interactions (many, potent)
- **Digoxin:** amiodarone doubles digoxin levels → can push into toxicity.
- **Warfarin:** amiodarone significantly raises INR → bleeding risk; warfarin dose usually needs to be cut 30–50%.
- **Statins:** raises simvastatin and atorvastatin levels → muscle pain / rhabdo risk.
- QT-prolonging drugs stack dangerously with amiodarone ([AAFP — Amiodarone guidelines](https://www.aafp.org/pubs/afp/issues/2003/1201/p2189.html)).

---

## 8. Anticoagulants — warfarin, DOACs (apixaban, rivaroxaban, dabigatran, edoxaban)

Most CHF patients with AFib are on a DOAC now; warfarin is still common in patients with mechanical valves, antiphospholipid syndrome, or severe renal disease where DOACs aren't preferred.

### Caregiver watchpoints — bleeding (all anticoagulants)
- **Call 911 / ER:** vomiting blood or coffee-ground-looking vomit; bright red or black tarry stool; coughing up blood; sudden severe headache or confusion (intracranial bleed); major fall with head strike.
- **Call cardiologist today:** unusual bruising, bleeding gums that won't stop, nosebleed >10 minutes, blood in urine (pink or red), prolonged menstrual bleeding, small cuts that won't clot.
- Dabigatran shows higher GI bleeding risk but lower intracranial hemorrhage; rivaroxaban shows higher GI and intracranial hemorrhage; apixaban generally lowest major bleeding rate ([PubMed — Major bleeding risk AF anticoagulation](https://pubmed.ncbi.nlm.nih.gov/28854073/); [JMCP — Major bleeding during anticoagulation AF](https://www.jmcp.org/doi/10.18553/jmcp.2017.23.9.968); [JACC — ARISTOTLE major bleeding](https://www.jacc.org/doi/10.1016/j.jacc.2014.02.549)).

### Warfarin-specific
- Requires **INR monitoring** (target usually 2.0–3.0 for AFib). Missed INR checks are a common coordination problem for long-distance caregivers.
- Highly diet-sensitive: sudden changes in vitamin K intake (kale, spinach, broccoli) swing INR. Consistency matters more than low vitamin K.
- Many drug interactions — any new antibiotic, antifungal, or amiodarone change requires INR recheck.
- Unlike DOACs, warfarin **does not require monitoring on DOACs** — which is both a feature (less burden) and a risk (no trip-wire to detect non-adherence) ([Consultant360 — DOAC vs warfarin bleeding](https://www.consultant360.com/article/cardiology/arrhythmia-ep/bleeding-risk-direct-oral-anticoagulants-compared-warfarin); [ScienceDirect — DOAC vs warfarin clinical experience](https://www.sciencedirect.com/science/article/pii/S0002934316306520)).

### DOAC-specific notes
- **Renal dose adjustment:** apixaban, rivaroxaban, edoxaban, and dabigatran all need lower doses in reduced kidney function. CHF patients often have fluctuating renal function — the dose on the bottle may be wrong after a bad kidney week.
- **Strict daily adherence:** short half-life compared to warfarin means one missed dose leaves a stroke window. App should surface missed-dose patterns aggressively.

---

## 9. Red-Flag Drug Combinations and Interactions

### NSAIDs (ibuprofen, naproxen, diclofenac, ketorolac, celecoxib)
**Functionally contraindicated in CHF.** NSAIDs inhibit renal prostaglandins → sodium and water retention → worsening congestion, rising BP, falling GFR ([Kelley-Ross — NSAIDs and HF](https://www.kelley-ross.com/why-is-there-a-concern-with-nsaid-use-and-heart-failure/); [Alberta Health — HF drugs to avoid](https://myhealth.alberta.ca/Health/pages/conditions.aspx?hwid=zp4024); [JACC — HF after anti-inflammatories in T2DM](https://www.jacc.org/doi/10.1016/j.jacc.2023.02.027); [PMC — Cardiovascular risk of NSAIDs review](https://pmc.ncbi.nlm.nih.gov/articles/PMC5422108/)).

- Risk of new HF hospitalization is elevated for ibuprofen and diclofenac; naproxen shows the least signal but is still best avoided ([PMC — NSAIDs and HF in T2DM](https://pmc.ncbi.nlm.nih.gov/articles/PMC10614522/); [JAMA Internal Medicine — NSAIDs + diuretics and HF in elderly](https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/205965)).
- Safer alternatives for pain: acetaminophen (Tylenol) for mild-moderate pain; topical NSAIDs have less systemic effect; short courses under doctor supervision only if absolutely needed.
- **HeartNote OTC interaction alert:** any logged ibuprofen, Advil, Motrin, naproxen, Aleve, or "Goody's powder" should trigger a "this can worsen heart failure — talk to your pharmacist about Tylenol instead" prompt.

### "Triple whammy" — NSAID + ACE-I/ARB + diuretic
Combining all three roughly **doubles the risk of acute kidney injury** in older patients ([bpacnz — Avoiding the triple whammy](https://bpac.org.nz/2018/triple-whammy.aspx); [PMC — Triple whammy AKI meta-analysis 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12569550/); [Springer — Drug interactions affecting kidney function](https://link.springer.com/article/10.1007/s12325-021-01939-9); [ScienceDirect — Triple whammy AKI review](https://www.sciencedirect.com/science/article/pii/S2013251415000139)).

Mechanism: diuretic drops intravascular volume, RAS inhibitor blocks efferent arteriole constriction, NSAID blocks afferent arteriole dilation → kidney perfusion collapses.

Nearly every CHF patient is already on two of the three. **Adding an NSAID is the match.**

### MRA + ACE-I/ARB/ARNI + potassium supplements + salt substitutes
Potassium-stacking quadruple-whammy. Salt substitutes (NuSalt, Morton Salt Substitute) are potassium chloride. Adding any of these to an MRA + RAS-inhibitor regimen can trigger life-threatening hyperkalemia ([UK MHRA 2016 — spironolactone + RAS inhibitors](https://www.gov.uk/drug-safety-update/spironolactone-and-renin-angiotensin-system-drugs-in-heart-failure-risk-of-potentially-fatal-hyperkalaemia); [Cleveland Clinic Journal — ACE-I/ARB K monitoring](https://www.ccjm.org/content/86/9/601)).

### Fluid-retention drugs to flag
- **Oral corticosteroids** (prednisone, methylprednisolone, dexamethasone): cause sodium/water retention via mineralocorticoid-like effect. A 5-day steroid burst for poison ivy or COPD exacerbation can tip a compensated CHF patient into decompensation ([Alberta Health — HF drugs to avoid](https://myhealth.alberta.ca/Health/pages/conditions.aspx?hwid=zp4024)).
- **Pioglitazone (Actos) and rosiglitazone (Avandia) — thiazolidinediones:** carry FDA boxed warnings for HF. **Contraindicated in NYHA Class III/IV HF**; not recommended in symptomatic HF ([FDA Actos label 2016 PDF](https://www.accessdata.fda.gov/drugsatfda_docs/label/2016/021073s048lbl.pdf); [FDA Actos boxed warning 2007 PDF](https://www.accessdata.fda.gov/drugsatfda_docs/label/2007/021073s031lbl.pdf); [AHA Journals — TZD and CHF](https://www.ahajournals.org/doi/10.1161/01.cir.0000103683.99399.7e); [Medsafe NZ — Glitazones fluid retention](https://medsafe.govt.nz/profs/PUArticles/glits.htm)).
- **NSAIDs** (see above).
- **Licorice-containing candy/tea** (see OTC section).
- **Certain antidepressants (duloxetine, venlafaxine)** can raise BP; **TCAs** can prolong QT and cause orthostasis.
- **Decongestants with pseudoephedrine or phenylephrine** (Sudafed, many cold products) raise BP and heart rate ([Alberta Health — HF drugs to avoid](https://myhealth.alberta.ca/Health/pages/conditions.aspx?hwid=zp4024)).

---

## 10. OTC and Supplement Interactions Caregivers Miss

### Licorice (black licorice candy, licorice root tea, DGL supplements in large doses)
Active compound glycyrrhizic acid inhibits 11β-HSD2, allowing cortisol to act on mineralocorticoid receptors → **apparent mineralocorticoid excess: sodium/water retention, hypokalemia, hypertension, metabolic alkalosis**. Can precipitate hypertensive emergency, HF decompensation, arrhythmia ([PMC — Licorice-induced apparent mineralocorticoid excess](https://pmc.ncbi.nlm.nih.gov/articles/PMC8126388/); [NEJM — Licorice-induced hypermineralocorticoidism](https://www.nejm.org/doi/full/10.1056/NEJM199110243251706); [Frontiers — Licorice pseudohyperaldosteronism](https://www.frontiersin.org/journals/endocrinology/articles/10.3389/fendo.2019.00484/full); [CMAJ — Hypertensive emergency from licorice tea](https://www.cmaj.ca/content/191/21/e581)).
- Effect starts within ~1 week of daily use, peaks at ~2 weeks. Washout 1–4 weeks after stopping.
- Threshold: >75 mg glycyrrhizic acid/day (a modest amount of real black licorice or a few cups of licorice tea daily).
- "Twizzlers" and most U.S. red licorice contain no real licorice; real black licorice, licorice root tea, and some herbal digestive supplements do.

### St. John's Wort
Potent CYP3A4 and P-glycoprotein inducer. Lowers levels of:
- **Warfarin** → reduced anticoagulation → stroke risk ([PMC — St John's wort drug interactions](https://pmc.ncbi.nlm.nih.gov/articles/PMC1874438/); [BJCP — St John's wort and ginseng with warfarin](https://bpspubs.onlinelibrary.wiley.com/doi/10.1111/j.1365-2125.2003.02051.x)).
- **Digoxin** → reduced rate control, recurrent AFib ([GoodRx — St. John's wort interactions](https://www.goodrx.com/well-being/supplements-herbs/st-johns-wort-interactions); [AAFP — Herbal-drug interactions](https://www.aafp.org/pubs/afp/issues/2008/0101/p73.html)).
- Many DOACs, statins, and antiarrhythmics.
- **Severe and life-threatening interactions are concentrated in St. John's Wort + anticoagulants, digoxin, immunosuppressants, and antidepressants** ([PubMed — Herbal-prescription interactions](https://pubmed.ncbi.nlm.nih.gov/14640772/?dopt=Abstract)).

### Ginseng (Panax, American, Siberian/Eleuthero)
- Can lower or raise warfarin effect depending on preparation; data is mixed but the interaction is real enough that AAFP lists it among clinically important herb-drug interactions ([AAFP — Herbal-drug interactions](https://www.aafp.org/pubs/afp/issues/2008/0101/p73.html); [BJCP — Ginseng and warfarin](https://bpspubs.onlinelibrary.wiley.com/doi/10.1111/j.1365-2125.2003.02051.x)).
- Siberian ginseng decreases plasma digoxin concentration — reduced rate control ([AAFP — Herbal-drug interactions](https://www.aafp.org/pubs/afp/issues/2008/0101/p73.html)).
- Can raise BP at higher doses.

### High-sodium OTCs — the sneakiest category
Effervescent/dissolvable products contain sodium bicarbonate or sodium carbonate as the fizz agent. Sodium is often hundreds of mg per dose and is frequently not obvious on the label.

- **Alka-Seltzer Original** contains ~567 mg sodium per tablet; taking the max dose (8 tablets/day) delivers over 4,500 mg of sodium — nearly 3× the AHA-recommended 1,500 mg/day limit for a CHF patient ([Inquirer — Alka-Seltzer case](https://www.inquirer.com/health/expert-opinions/heart-failure-sodium-intake-alka-seltzer-20201016.html); [LowSaltKitchen — Sodium in medicines](https://www.lowsaltkitchen.com/posts/salty-fact-sodium-in-medicines); [HealthDay — Fizzy drugs salt risk](https://www.healthday.com/health-news/general-health/fizzy-drugs-may-pose-a-high-salt-danger-study-suggests-682552.html)).
- Documented case: patient with no cardiac history developed CHF from Alka-Seltzer overuse alone ([Inquirer case report](https://www.inquirer.com/health/expert-opinions/heart-failure-sodium-intake-alka-seltzer-20201016.html)).
- Other offenders: effervescent acetaminophen tablets, effervescent vitamin C/multivitamins, sodium-containing antacids (Gaviscon, some Tums formulations), soluble aspirin, bicarbonate "natural heartburn" remedies, some laxatives (Fleet enema and oral sodium phosphates).
- **HeartNote OTC alert candidate:** log of "Alka-Seltzer," "Zantac dissolvable," "Emergen-C," or "fizzy tablet" should trigger a sodium-content prompt.

### Other watchouts
- **Salt substitutes (NuSalt, Morton Salt Substitute):** are mostly potassium chloride. Dangerous when patient is on MRA + ACE-I/ARB/ARNI.
- **Fish oil / omega-3 (high dose):** mild anticoagulant effect; may increase bleeding risk on warfarin or DOACs.
- **Ginkgo biloba, garlic supplements, high-dose vitamin E:** modest antiplatelet effect; watch for bleeding on anticoagulants.
- **Hawthorn** (sometimes marketed for heart health): can enhance digoxin effect.

---

## 11. Medication-Related Decompensation Patterns — what HeartNote AI should recognize

The app's pattern-recognition layer should treat these as named scenarios, because each produces a recognizable cluster of signs that a caregiver may not connect to a medication change on their own.

### Pattern A: "Missed diuretic — fluid storm"
- **Trigger:** 1–2 skipped furosemide/torsemide doses (hospitalization, travel, pill-bottle mix-up, loss of prescription).
- **Timeline:** weight creeps up within 24 hours, visible within 48 hours. Post-diuretic rebound sodium retention means the kidney reabsorbs *more* than usual ([JACC — Diuretic therapy state of the art](https://www.jacc.org/doi/10.1016/j.jacc.2019.12.059); [Cleveland Clinic Journal — ADHF diuresis](https://www.ccjm.org/content/89/10/561)).
- **Signs:** +2–4 lb in 48 hrs; ankles, calves tighter; shoes don't fit; shortness of breath climbing same stairs; sleeping on more pillows.
- **What the app should say:** "Her weight is up X pounds in 48 hours. Has she missed any doses of [furosemide/torsemide]? Missed doses can cause this pattern — call the cardiologist today."

### Pattern B: "Double dose" / over-diuresis
- **Trigger:** caregiver confusion; two family members each give a dose; patient forgets taking it and takes another; "as-needed" sliding-scale dose taken on top of daily dose.
- **Timeline:** within 4–12 hours of the second dose.
- **Signs:** dizziness, near-falls, dry mouth, low urine output *after* initial heavy pee, lightheaded standing, resting HR up (compensating for volume loss), weight drop >3 lb in 24 hrs.
- **What the app should say:** "She feels dizzy and her weight dropped X pounds. Did she take extra [diuretic]? If she hasn't had fluids recently, offer water and call the cardiologist — she may need to skip the next dose."

### Pattern C: "Beta-blocker stop"
- **Trigger:** patient decides the beta blocker is making them tired and stops it; caregiver sibling pauses it "to see if she feels better"; pharmacy run-out.
- **Timeline:** 1–4 days.
- **Signs:** resting HR rising (90s-100s+), anxiety, tremor, chest tightness, rebound BP elevation, sometimes acute HF worsening.
- **What the app should say:** "Stopping the beta blocker suddenly can be dangerous. Please call the cardiologist today — if she needs a lower dose, that's fine, but this medication shouldn't just stop."

### Pattern D: "Silent hyperkalemia"
- **Trigger:** MRA + ACE-I/ARB/ARNI baseline + an acute insult (dehydration, new NSAID, kidney-function drop, added potassium supplement, salt substitute).
- **Signs:** muscle weakness, feeling heavy, tingling around mouth, palpitations, slow or irregular pulse. Often missed until ECG or lab.
- **What the app should say:** "She's on [MRA name] plus [ACE-I/ARB/ARNI name]. That combination can raise potassium. New muscle weakness, tingling, or irregular pulse needs a same-day call — ask specifically about checking her potassium level."

### Pattern E: "Triple whammy AKI"
- **Trigger:** caregiver gives ibuprofen/Aleve for back pain, dental pain, headache while patient is already on diuretic + ACE-I/ARB/ARNI.
- **Timeline:** days.
- **Signs:** decreasing urine output, rising creatinine (on labs), worsening edema despite same diuretic, fatigue, nausea.
- **What the app should say:** "Ibuprofen/Aleve plus her heart failure medications can hurt her kidneys — this combination is called 'the triple whammy.' Stop the ibuprofen and ask her doctor about Tylenol."

### Pattern F: "Digoxin toxicity with new GI illness"
- **Trigger:** patient on digoxin develops vomiting/diarrhea (from gastro, food poisoning, new med) → dehydration → kidney function drops → digoxin level climbs even without a dose change.
- **Signs:** nausea on top of the baseline GI illness, yellow/green halos, confusion, bradycardia.
- **What the app should say:** "Digoxin can become toxic when someone gets sick and dehydrated — especially when they're also on a water pill. Nausea, yellow vision, or confusion needs a same-day call."

### Pattern G: "Hidden sodium bomb"
- **Trigger:** patient takes Alka-Seltzer for heartburn, effervescent cold medication, or sodium-containing antacid for days.
- **Timeline:** 2–5 days.
- **Signs:** weight up, ankles up, BP up, more breathless — but diet seems fine.
- **What the app should say:** "Fizzy or dissolvable medications can have as much sodium as a bag of chips per pill. Check what she's been taking — Alka-Seltzer, effervescent vitamin C, dissolvable Tylenol, Gaviscon. Switch to non-sodium versions and call the cardiologist if congestion keeps rising."

### Pattern H: "Amiodarone pulmonary mimicking HF"
- **Trigger:** patient on amiodarone for 6+ months develops new cough and shortness of breath.
- **Signs:** *without* weight gain, *without* orthopnea, *without* edema — just dyspnea and dry cough and maybe low-grade fever.
- **What the app should say:** "She's been on amiodarone, and new cough or shortness of breath without weight gain can be a lung side effect of the drug — not heart failure. This needs a same-day call. Don't stop the amiodarone without the doctor."

### Pattern I: "Steroid burst decompensation"
- **Trigger:** short course of oral steroids from urgent care or PCP for COPD, poison ivy, sinusitis, back pain, etc.
- **Timeline:** 2–5 days into the burst.
- **Signs:** rapid weight gain, puffy face, BP up, worsening edema, blood sugar up if diabetic.
- **What the app should say:** "Steroid pills cause the body to hold onto salt and water. Let the cardiologist know she's on [prednisone/methylprednisolone] — they may need to temporarily bump her water pill."

---

## Appendix — Quick watchpoint lookup

| Class | Main danger sign to caregiver | Red-flag urgency |
|---|---|---|
| Loop diuretic | Dizzy + weight down >3 lb or dizzy + low urine | Same-day call |
| ACE-I/ARB/ARNI | Lip/tongue/throat swelling | 911/ER |
| ACE-I/ARB/ARNI | Persistent dry cough | Routine call |
| ACE-I/ARB/ARNI | Muscle weakness + irregular pulse | Same-day call (hyperkalemia) |
| Beta blocker | Pulse <50 or felt faint | Same-day call |
| Beta blocker | Stopped abruptly | Same-day call |
| MRA | Muscle weakness, tingling, irregular pulse | Same-day call (hyperkalemia) |
| MRA (spironolactone) | Breast tenderness / enlargement in men | Routine call |
| SGLT2i | Severe genital pain + fever | 911/ER (Fournier) |
| SGLT2i | Nausea/vomiting + fast breathing | ER (euglycemic DKA) |
| SGLT2i | Vaginal itching/discharge or penile irritation | Routine call |
| Digoxin | Yellow halos, confusion, or bradycardia | Same-day call |
| Amiodarone | New dry cough + shortness of breath | Same-day call (pulmonary) |
| Amiodarone | Cold intolerance + fatigue, or heat intolerance + palpitations | Routine call (thyroid) |
| Anticoagulant | Black tarry stools, vomiting blood, severe headache | 911/ER |
| Anticoagulant | Nosebleed >10 min, blood in urine, heavy bruising | Same-day call |
| Any | Starting NSAID while on CHF meds | Educate/switch to Tylenol |
| Any | Starting oral steroids | Notify cardiologist |

---

## Guideline-change timeline worth flagging in caregiver copy

- **2022:** SGLT2i becomes 4th pillar of HFrEF GDMT ([AHA/ACC/HFSA 2022](https://www.ahajournals.org/doi/10.1161/CIR.0000000000001063)). Many patients diagnosed pre-2022 were never started on one. Worth surfacing: "If her diagnosis was before 2022 and she's not on dapagliflozin or empagliflozin, ask why at the next visit — these are now standard."
- **2023:** SGLT2i adds Class I recommendation for HFpEF ([ESC 2023 Focused Update, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11562572/)). HFpEF patients may still be under-treated — historically there were almost no proven drugs for HFpEF.
- **ARNI (Entresto) preferred over ACE-I/ARB:** since 2017 but uptake is still incomplete; many patients on lisinopril alone have not been switched.

---

## Key gaps to flag for the product team

1. **Dose-range data here is deliberately non-prescriptive.** HeartNote must NEVER tell a caregiver to change a dose. The app's role is: recognize the pattern, give plain-English framing of why it matters, prompt "call the cardiologist" or "ER now."
2. **Specific lab thresholds** (potassium, creatinine, INR, digoxin level, BNP) are clinical-grade and require lab integration. For v1 voice-log HeartNote, symptom-based heuristics matter more than lab thresholds.
3. **Polypharmacy interactions** beyond what's covered here (e.g., antifungals + DOACs, antibiotics + warfarin, SSRIs + anticoagulants) are numerous. A future med-scanner/OCR feature should feed logged meds to an interaction checker.
4. **Real caregiver language** for each of these watchpoints — the Reddit/Facebook voice — is collected in a separate research doc (03-caregiver-language.md, pending). The clinical signs here need to be translated into "what mom actually says" before they become UI copy.
5. **Ethnic/genetic variation** matters clinically (ACE-I angioedema in Black patients, BiDil for self-identified Black patients with HFrEF, warfarin dosing by CYP2C9/VKORC1) but is out of scope for v1.
