// research/data/medications.ts
//
// Structured medication data for HeartNote's alert engine and Claude prompts.
// Each entry cites the internal source-of-truth section and the upstream
// primary source (FDA label, AHA/ACC/HFSA guideline, StatPearls, etc.).
// Never hardcode med names, watchpoints, or thresholds elsewhere.
// Updates here require re-running the clinical eval suite.
//
// Rule (per CLAUDE.md and research/02-medications.md §11/Key gaps): HeartNote
// never recommends dose changes. Dose ranges from FDA labels and guidelines
// are intentionally excluded from this data layer. Only mechanism descriptions
// and observable signs are encoded here.

export type MedMeta = {
  internal: string;
  external: string;
  sourceQuote?: string;
  lastReviewed: string; // ISO date
  reviewer: 'pending' | string;
};

export type DrugClass =
  | 'loop_diuretic'
  | 'ace_inhibitor'
  | 'arb'
  | 'arni'
  | 'beta_blocker'
  | 'mra'
  | 'sglt2i'
  | 'digoxin'
  | 'antiarrhythmic'
  | 'anticoagulant';

export type DrugClassWatchpoints = {
  classId: DrugClass;
  displayName: string; // human-friendly label
  commonDrugs: readonly string[]; // generic names; brand in parens if relevant
  caregiverWatchpoints: readonly string[]; // plain-English signs caregivers should watch for
  meta: MedMeta;
};

export const DRUG_CLASS_WATCHPOINTS: Readonly<Record<DrugClass, DrugClassWatchpoints>> = {
  loop_diuretic: {
    classId: 'loop_diuretic',
    displayName: 'Loop diuretic',
    commonDrugs: ['furosemide (Lasix)', 'torsemide', 'bumetanide'],
    caregiverWatchpoints: [
      'Dehydration / over-diuresis: dizziness on standing, lightheaded in the shower, dry mouth, sunken eyes, weak pulse, confusion, peeing very little despite taking the pill, sudden weight drop greater than ~2-3 lb in a day on a stable dose',
      'Low potassium (hypokalemia): muscle cramps (especially calves at night), weakness, palpitations, constipation, irregular heartbeat',
      'Low sodium (hyponatremia): headache, nausea, confusion, unsteady walk - especially dangerous in older adults',
      'Low magnesium (hypomagnesemia): tremor, twitching, palpitations - often co-occurs with low potassium',
      'Kidney function decline: dark urine, peeing much less, ankle puffiness paradoxically getting worse',
      'Hearing changes (ototoxicity, rare at oral home doses): ringing in ears, sudden hearing loss or fullness',
      'Fall risk: sudden urge to urinate plus low blood pressure equals falls in older adults, especially at night - take morning, second dose no later than mid-afternoon',
      'Weight-tracking nuance: a good diuresis day can drop 2-3 lb in 24 hours - that is the drug working, not decompensation reversing. Unexplained regain within 24-48 hours of a dose change can mean missed doses or rebound sodium retention',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 watchpoints table; 02-medications.md §1',
      external:
        'StatPearls - Furosemide (https://www.ncbi.nlm.nih.gov/books/NBK499921/); Davis\'s Drug Guide - Furosemide; SimpleNursing - Furosemide; Nurseslabs - Furosemide teaching; JACC diuretic therapy review (https://www.jacc.org/doi/10.1016/j.jacc.2019.12.059); Cleveland Clinic Journal - ADHF diuresis (https://www.ccjm.org/content/89/10/561)',
      sourceQuote:
        '"A good diuresis day can drop 2-3 lb in 24 hours. This is *not* decompensation-in-reverse - it\'s the drug working." (02-medications.md §1)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  ace_inhibitor: {
    classId: 'ace_inhibitor',
    displayName: 'ACE inhibitor',
    commonDrugs: ['lisinopril', 'enalapril', 'ramipril', 'captopril'],
    caregiverWatchpoints: [
      'Low blood pressure / orthostatic hypotension: dizzy standing up, faint getting out of bed, near-fall in the bathroom - start of therapy and dose increases are the riskiest windows',
      'Dry hacking cough (ACE-I specific, 5-20% of patients): caused by bradykinin buildup, not dangerous but often triggers a switch to ARB or ARNI',
      'Angioedema - ER immediately: swelling of lips, tongue, face, or throat. Rare (0.1-0.7%) but life-threatening. Higher risk in Black patients. Can occur after years on the drug, not just at initiation',
      'Hyperkalemia (high potassium): muscle weakness, tingling, slow or irregular heartbeat, nausea - often silent until cardiac arrhythmia',
      'Rising creatinine / kidney function drop: peeing much less, ankles more swollen despite same diet',
      'Never combine with ARB or ARNI: doubles risk of hyperkalemia, hypotension, AKI, and angioedema with no added benefit',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 watchpoints table; 02-medications.md §2',
      external:
        'StatPearls - ACE Inhibitors (https://www.ncbi.nlm.nih.gov/books/NBK430896/); AmericanNurse - ACE-I angioedema (https://www.myamericannurse.com/when-ace-inhibitors-cause-angioedema/); Medsafe NZ 2023 reminder; Cleveland Clinic Journal - ACE-I/ARB K and renal monitoring (https://www.ccjm.org/content/86/9/601); ACC Safe Prescribing of Sacubitril/Valsartan infographic',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  arb: {
    classId: 'arb',
    displayName: 'Angiotensin receptor blocker (ARB)',
    commonDrugs: ['losartan', 'valsartan', 'candesartan'],
    caregiverWatchpoints: [
      'Low blood pressure / orthostatic hypotension: dizzy standing up, faint getting out of bed, near-fall in the bathroom',
      'Hyperkalemia (high potassium): muscle weakness, tingling, slow or irregular heartbeat, nausea - often silent until cardiac arrhythmia',
      'Rising creatinine / kidney function drop: peeing much less, ankles more swollen despite same diet',
      'Angioedema (rarer than ACE-I but possible): swelling of lips, tongue, face, or throat - ER immediately',
      'Unlike ACE-I, ARBs typically do not cause the dry cough',
      'Never combine with ACE-I or ARNI: doubles risk of hyperkalemia, hypotension, AKI, and angioedema with no added benefit',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 watchpoints table; 02-medications.md §2',
      external:
        'StatPearls - ACE Inhibitors (https://www.ncbi.nlm.nih.gov/books/NBK430896/) (ARBs share the renin-angiotensin axis adverse-effect profile); Cleveland Clinic Journal - ACE-I/ARB K and renal monitoring (https://www.ccjm.org/content/86/9/601); AAFP - Sacubitril/Valsartan for HF (https://www.aafp.org/pubs/afp/issues/2016/1015/p611.html)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  arni: {
    classId: 'arni',
    displayName: 'Angiotensin receptor-neprilysin inhibitor (ARNI)',
    commonDrugs: ['sacubitril/valsartan (Entresto)'],
    caregiverWatchpoints: [
      'Low blood pressure / orthostatic hypotension: more pronounced than ACE-I or ARB at initiation - dizzy standing up, faint, near-fall in bathroom',
      'Hyperkalemia: muscle weakness, tingling, slow or irregular heartbeat, nausea',
      'Rising creatinine / kidney function drop: peeing much less, ankles more swollen despite same diet',
      'Angioedema - ER immediately: swelling of lips, tongue, face, or throat. Risk is amplified if any ACE-I overlap',
      'Switching from ACE-I requires a 36-hour washout before the first ARNI dose; no washout is required ARB to ARNI',
      'Per the 2022 AHA/ACC/HFSA guideline, ARNI is preferred over ACE-I or ARB when possible for chronic HFrEF',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 watchpoints table; 02-medications.md §2',
      external:
        'Entresto HCP dosing page, Novartis (https://www.entrestohcp.com/safety-and-dosing/dosing); SingleCare - Entresto washout (https://www.singlecare.com/blog/entresto-washout-period/); AAFP - Sacubitril/Valsartan for HF (https://www.aafp.org/pubs/afp/issues/2016/1015/p611.html); ACC 2022 guideline summary (https://www.acc.org/Latest-in-Cardiology/ten-points-to-remember/2022/03/29/19/53/2022-AHA-ACC-HFSA-Heart-Failure-Guideline-gl-hf)',
      sourceQuote:
        '"Entresto must not be started within 36 hours of the last ACE-I dose (and vice versa). Overlap dramatically raises angioedema risk because both neprilysin inhibition and ACE inhibition elevate bradykinin." (02-medications.md §2)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  beta_blocker: {
    classId: 'beta_blocker',
    displayName: 'Beta blocker (HFrEF-proven)',
    commonDrugs: [
      'carvedilol',
      'metoprolol succinate (Toprol XL, NOT tartrate)',
      'bisoprolol',
    ],
    caregiverWatchpoints: [
      'Bradycardia (slow heart rate): resting pulse under 50, feeling faint, chest pressure, near-blackout on standing - check pulse during the first 4-8 weeks of titration',
      'Low blood pressure: especially carvedilol, which also blocks alpha receptors',
      'Fatigue, feeling "slowed down": common in first 2-4 weeks; often resolves and should be logged but not reflexively stopped',
      'Worsening HF in first month after a dose increase: paradoxical 2-3 lb weight gain, more ankle swelling, more shortness of breath on stairs - call cardiology, not ER unless severe',
      'Cold hands and feet (peripheral vasoconstriction): annoying but not dangerous',
      'Sleep disturbance, vivid dreams, depression: more common with carvedilol and metoprolol (lipophilic, cross blood-brain barrier)',
      'Never stop abruptly: rebound tachycardia, hypertension, angina, MI, and acute HF decompensation can follow within days',
      'If the med list shows metoprolol *tartrate* (short-acting) for an HFrEF patient, raise it with the prescriber - tartrate lacks HFrEF mortality evidence',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 watchpoints table; 02-medications.md §3',
      external:
        'ACC 2022 guideline summary (https://www.acc.org/Latest-in-Cardiology/ten-points-to-remember/2022/03/29/19/53/2022-AHA-ACC-HFSA-Heart-Failure-Guideline-gl-hf); StatPearls - Carvedilol (https://www.ncbi.nlm.nih.gov/books/NBK534868/); Medscape - Beta Blockers in HFrEF; PMC - Beta-blocker rebound phenomenon (https://pmc.ncbi.nlm.nih.gov/articles/PMC9724061/); PMC - Beta-blocker withdrawal in ADHF meta-analysis (https://pmc.ncbi.nlm.nih.gov/articles/PMC4777602/); Frontiers - Beta-blocker management in acute HF (https://www.frontiersin.org/journals/cardiovascular-medicine/articles/10.3389/fcvm.2023.1263482/full)',
      sourceQuote:
        '"Abrupt discontinuation can cause rebound tachycardia, hypertension, angina, MI, and acute decompensation of heart failure. The sympathetic nervous system rebounds within days." (02-medications.md §3)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  mra: {
    classId: 'mra',
    displayName: 'Mineralocorticoid receptor antagonist (MRA)',
    commonDrugs: ['spironolactone', 'eplerenone'],
    caregiverWatchpoints: [
      'Hyperkalemia (the big one): muscle weakness, tingling, slow or irregular pulse, nausea - risk compounds when combined with ACE-I, ARB, or ARNI',
      'Contraindicated when baseline potassium is greater than 5.0 mmol/L; potassium and creatinine should be re-checked at day 3, week 1, month 1, month 3, then quarterly after start or dose change',
      'Gynecomastia or breast tenderness (spironolactone-specific, up to ~10% of men): not a reason to stop unilaterally - the prescriber can switch to eplerenone',
      'Menstrual irregularity in premenopausal women on spironolactone',
      'Kidney function decline: less urine despite same diuretic dose, rising fatigue',
      'Volume-depletion interaction: MRAs are mild diuretics, so when stacked with a loop diuretic in a dehydrated patient, hyperkalemia risk jumps further',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 watchpoints table; 02-medications.md §4',
      external:
        'UK MHRA 2016 - spironolactone + RAS inhibitors (https://www.gov.uk/drug-safety-update/spironolactone-and-renin-angiotensin-system-drugs-in-heart-failure-risk-of-potentially-fatal-hyperkalaemia); AHA Journals - hyperkalemia MRA outcomes (https://www.ahajournals.org/doi/10.1161/circheartfailure.114.001104); StatPearls - Eplerenone (https://www.ncbi.nlm.nih.gov/books/NBK553100/); BMC Cardiovascular Disorders - eplerenone vs. spironolactone meta-analysis',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  sglt2i: {
    classId: 'sglt2i',
    displayName: 'SGLT2 inhibitor',
    commonDrugs: ['dapagliflozin (Farxiga)', 'empagliflozin (Jardiance)'],
    caregiverWatchpoints: [
      'Genital fungal infection (thrush, yeast infection, balanitis): itching, burning, discharge, redness in groin/genital area - common, treatable, but worth reporting',
      'Urinary tract infection: burning with urination, urgency, cloudy urine, fever',
      'Fournier\'s gangrene - ER immediately: severe pain, redness, swelling in genital/perineal area plus fever or feeling very unwell. Rare but catastrophic - tissue infection that spreads in hours',
      'Euglycemic DKA - ER, finger-stick glucose can look normal: nausea, vomiting, belly pain, rapid breathing, fruity breath, confusion. Risk is higher during illness, fasting, dehydration, or after surgery',
      'Volume depletion in first 2-4 weeks: dizziness, dry mouth, hypotension - SGLT2s act partly as osmotic diuretics; surface these symptoms to the cardiologist if they appear',
      'Now standard-of-care for HFrEF (2022) and HFpEF (2023) regardless of diabetes - patients diagnosed pre-2022 may not yet be on one',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 watchpoints table; 02-medications.md §5',
      external:
        'StatPearls - SGLT2 inhibitors (https://www.ncbi.nlm.nih.gov/books/NBK576405/); FDA/MHRA Fournier warning (https://www.gov.uk/drug-safety-update/sglt2-inhibitors-reports-of-fournier-s-gangrene-necrotising-fasciitis-of-the-genitalia-or-perineum); JAMA Internal Medicine - SGLT2 and Fournier (https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/2749348); EMRA - Euglycemic DKA (https://www.emra.org/emresident/article/dont-kid-around-sglt-2-inhibitors-and-the-risk-for-euglycemic-dka); Circulation - SGLT2 and loop diuretics (https://www.ahajournals.org/doi/10.1161/CIRCULATIONAHA.120.048057); ACC 2022 guideline summary; ESC 2023 Focused Update (PMC11562572)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  digoxin: {
    classId: 'digoxin',
    displayName: 'Digoxin',
    commonDrugs: ['digoxin'],
    caregiverWatchpoints: [
      'GI first (often the earliest warning of toxicity): loss of appetite, nausea, vomiting, abdominal pain, diarrhea',
      'Visual changes (pathognomonic): yellow or green halos around lights, blurred vision, "everything looks yellow" (xanthopsia), hazy vision like dirty glasses',
      'Neuro: confusion, drowsiness, weakness, headache, disorientation',
      'Cardiac: bradycardia, irregular pulse, palpitations, syncope - can escalate to ventricular arrhythmia',
      'Narrow therapeutic window: toxicity is more likely when kidney function worsens, when the patient dehydrates, and when potassium or magnesium are low',
      'Patient on digoxin plus a loop diuretic plus new GI illness or visual changes is urgent-call territory',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 watchpoints table; 02-medications.md §6',
      external:
        '2022 AHA/ACC/HFSA Guideline (https://www.ahajournals.org/doi/10.1161/CIR.0000000000001063); Cleveland Clinic Journal - Digoxin is still useful (https://www.ccjm.org/content/91/8/489); StatPearls - Cardiac Glycoside and Digoxin Toxicity (https://www.ncbi.nlm.nih.gov/books/NBK459165/); Medscape - Digitalis Toxicity Clinical Presentation (https://emedicine.medscape.com/article/154336-clinical); PMC - Digoxin toxicity practical management (https://pmc.ncbi.nlm.nih.gov/articles/PMC10599802/)',
      sourceQuote:
        '"Digoxin toxicity is amplified by hypokalemia, hypomagnesemia, and hypercalcemia." (02-medications.md §6)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  antiarrhythmic: {
    classId: 'antiarrhythmic',
    displayName: 'Antiarrhythmic (amiodarone — primary in CHF + AFib)',
    commonDrugs: ['amiodarone'],
    caregiverWatchpoints: [
      'Pulmonary (most dangerous): new dry cough, shortness of breath, chest discomfort, low-grade fever - in a CHF patient this can be mistaken for worsening heart failure, do not auto-reassure',
      'Thyroid in either direction (14-18% of long-term users): hypothyroid signs (fatigue, cold intolerance, weight gain, dry skin, slowed thinking) or hyperthyroid signs (palpitations, weight loss, heat intolerance, tremor) - hyperthyroidism can precipitate HF decompensation',
      'Liver: jaundice (yellow eyes/skin), dark urine, right-upper abdominal pain',
      'Skin: blue-gray discoloration with sun exposure; severe sunburn after brief exposure (photosensitivity)',
      'Eye: corneal microdeposits (usually asymptomatic); rare optic neuropathy with vision loss',
      'Neuro: tremor, ataxia, peripheral neuropathy',
      'Drug interactions are many and potent - amiodarone roughly doubles digoxin levels, raises INR on warfarin (the prescriber typically adjusts warfarin when amiodarone is started or stopped), and stacks dangerously with QT-prolonging drugs',
      'Monitoring expectation: TSH and liver panel at baseline and every 6 months; chest X-ray annually; eye exam at baseline and yearly. If 6+ months on amiodarone with no labs logged, prompt a check at the next visit',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 watchpoints table; 02-medications.md §7',
      external:
        'Frontiers - Amiodarone multi-systemic toxicity case report (https://www.frontiersin.org/journals/cardiovascular-medicine/articles/10.3389/fcvm.2022.839441/full); AAFP - Amiodarone guidelines (https://www.aafp.org/pubs/afp/issues/2003/1201/p2189.html); PMC - Amiodarone pulmonary toxicity (https://pmc.ncbi.nlm.nih.gov/articles/PMC2687560/); NHS SPS - Amiodarone monitoring (https://www.sps.nhs.uk/monitorings/amiodarone-monitoring/)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  anticoagulant: {
    classId: 'anticoagulant',
    displayName: 'Anticoagulant (warfarin or DOAC)',
    commonDrugs: [
      'warfarin',
      'apixaban (Eliquis)',
      'rivaroxaban (Xarelto)',
      'dabigatran (Pradaxa)',
      'edoxaban (Savaysa)',
    ],
    caregiverWatchpoints: [
      'Call 911 / ER: vomiting blood or coffee-ground vomit; bright-red or black tarry stool; coughing up blood; sudden severe headache or confusion (possible intracranial bleed); major fall with head strike',
      'Same-day call: unusual bruising; bleeding gums that will not stop; nosebleed longer than 10 minutes; pink/red urine; prolonged menstrual bleeding; small cuts that will not clot',
      'Warfarin requires INR monitoring (target usually 2.0-3.0 for AFib) - missed INR checks are a common long-distance caregiver coordination problem',
      'Warfarin is diet-sensitive: sudden swings in vitamin K (kale, spinach, broccoli) move INR. Consistency matters more than restriction',
      'Any new antibiotic, antifungal, or amiodarone change for a warfarin patient should trigger an INR recheck',
      'DOACs do not require routine monitoring, which removes a trip-wire for non-adherence - missed-dose patterns should be surfaced aggressively because short half-lives leave a stroke window',
      'DOAC dosing changes with kidney function - apixaban, rivaroxaban, edoxaban, and dabigatran all need lower doses in reduced renal function',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 watchpoints table; 02-medications.md §8',
      external:
        'PubMed - Major bleeding risk AF anticoagulation (https://pubmed.ncbi.nlm.nih.gov/28854073/); JMCP - Major bleeding during anticoagulation AF (https://www.jmcp.org/doi/10.18553/jmcp.2017.23.9.968); JACC - ARISTOTLE major bleeding (https://www.jacc.org/doi/10.1016/j.jacc.2014.02.549); Consultant360 - DOAC vs warfarin bleeding (https://www.consultant360.com/article/cardiology/arrhythmia-ep/bleeding-risk-direct-oral-anticoagulants-compared-warfarin)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },
};

// The nine named decompensation patterns from chf-source-of-truth.md §6
// (and 02-medications.md §11 patterns A-I).
export type DecompensationPattern = {
  id: string;
  name: string;
  description: string; // 1-2 sentence plain-English mechanism
  observableSignals: readonly string[]; // what the caregiver might log that suggests this pattern
  meta: MedMeta;
};

export const DECOMPENSATION_PATTERNS: readonly DecompensationPattern[] = [
  // 1. Missed diuretic
  {
    id: 'missed_diuretic',
    name: 'Missed diuretic — fluid storm',
    description:
      'One or two skipped loop-diuretic doses let the kidney rebound and reabsorb more sodium and water than baseline, so fluid creeps back faster than the missed dose alone would predict. Weight rises silently within 24 hours and is usually visible by 48.',
    observableSignals: [
      'Weight up roughly 2-4 lb over 24-48 hours',
      'Ankles or calves visibly tighter; shoes do not fit the way they did',
      'New shortness of breath climbing the same stairs',
      'Sleeping on more pillows than last week',
      'Caregiver reports refusal, travel, pill-bottle mix-up, or lost prescription',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 (pattern 1); 02-medications.md §11 Pattern A',
      external:
        'JACC - Diuretic therapy state of the art (https://www.jacc.org/doi/10.1016/j.jacc.2019.12.059); Cleveland Clinic Journal - ADHF diuresis (https://www.ccjm.org/content/89/10/561)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  // 2. Double-dose diuretic
  {
    id: 'double_dose_diuretic',
    name: 'Double-dose diuretic — over-diuresis',
    description:
      'Two doses get given by mistake (two family members each give one, the patient forgets and re-doses, or an as-needed dose is taken on top of the daily dose). Within hours intravascular volume drops and the kidney is at risk of pre-renal injury and electrolyte loss.',
    observableSignals: [
      'Dizziness, near-falls, lightheaded standing',
      'Dry mouth, weak pulse, low urine output after an initial heavy void',
      'Resting heart rate higher than baseline (compensating for volume loss)',
      'Weight drop greater than ~3 lb in 24 hours without a planned dose change',
      'Caregiver reports possible doubled dose or confusion about who gave what',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 (pattern 2); 02-medications.md §11 Pattern B',
      external:
        'StatPearls - Furosemide (https://www.ncbi.nlm.nih.gov/books/NBK499921/); JACC - Diuretic therapy state of the art (https://www.jacc.org/doi/10.1016/j.jacc.2019.12.059)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  // 3. Beta-blocker abrupt stop
  {
    id: 'beta_blocker_abrupt_stop',
    name: 'Beta-blocker abrupt stop',
    description:
      'The sympathetic nervous system is suppressed during chronic beta-blocker use; if the drug is stopped suddenly (patient feels tired, sibling pauses it, pharmacy run-out), upregulated receptors rebound within days, producing tachycardia, hypertension, angina, and acute HF worsening.',
    observableSignals: [
      'Resting heart rate climbing into the 90s-100s+',
      'New anxiety, tremor, chest tightness',
      'Rebound blood-pressure elevation',
      'Acute shortness of breath or congestion 1-4 days after the stop',
      'Caregiver reports the beta blocker was paused or run out',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 (pattern 3); 02-medications.md §11 Pattern C',
      external:
        'PMC - Beta-blocker rebound phenomenon (https://pmc.ncbi.nlm.nih.gov/articles/PMC9724061/); Nature - Beta blocker rebound review (https://www.nature.com/articles/s41440-020-0449-6); PMC - Beta-blocker withdrawal in ADHF meta-analysis (https://pmc.ncbi.nlm.nih.gov/articles/PMC4777602/); JACC HF - Beta-blockers in acute HF (https://www.jacc.org/doi/10.1016/j.jchf.2015.04.009)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  // 4. Silent hyperkalemia
  {
    id: 'silent_hyperkalemia',
    name: 'Silent hyperkalemia',
    description:
      'The patient is on an MRA plus an ACE-I/ARB/ARNI baseline and an acute insult tips potassium up — dehydration, a new NSAID, a drop in kidney function, a potassium supplement, or a salt substitute. The signs are vague and easy to miss until an arrhythmia appears.',
    observableSignals: [
      'Muscle weakness, feeling heavy or "off"',
      'Tingling around the mouth or in the hands',
      'Palpitations or new slow/irregular pulse',
      'Recent gastro illness, NSAID use, started a potassium supplement, or switched to a salt substitute',
      'Med list shows MRA stacked with ACE-I, ARB, or ARNI',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 (pattern 4); 02-medications.md §11 Pattern D',
      external:
        'UK MHRA 2016 - spironolactone + RAS inhibitors (https://www.gov.uk/drug-safety-update/spironolactone-and-renin-angiotensin-system-drugs-in-heart-failure-risk-of-potentially-fatal-hyperkalaemia); Cleveland Clinic Journal - ACE-I/ARB K and renal monitoring (https://www.ccjm.org/content/86/9/601); AHA Journals - hyperkalemia MRA outcomes (https://www.ahajournals.org/doi/10.1161/circheartfailure.114.001104)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  // 5. Triple-whammy AKI
  {
    id: 'triple_whammy_aki',
    name: 'Triple-whammy AKI',
    description:
      'Loop diuretic drops intravascular volume, an ACE-I/ARB/ARNI blocks efferent arteriole constriction, and a newly added NSAID (or over-diuresis) blocks afferent arteriole dilation — kidney perfusion collapses. Risk roughly doubles versus baseline in older patients.',
    observableSignals: [
      'Decreasing urine output over days',
      'Worsening edema despite the same diuretic dose',
      'Fatigue, nausea, "feeling cruddy"',
      'Caregiver gave ibuprofen, Advil, Motrin, naproxen, Aleve, or Goody\'s for pain - or recently doubled the diuretic',
      'Med list already contains a loop diuretic plus ACE-I/ARB/ARNI (most CHF patients)',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 (pattern 5); 02-medications.md §9 + §11 Pattern E',
      external:
        'bpacnz - Avoiding the triple whammy (https://bpac.org.nz/2018/triple-whammy.aspx); PMC - Triple whammy AKI meta-analysis 2025 (https://pmc.ncbi.nlm.nih.gov/articles/PMC12569550/); Springer - Drug interactions affecting kidney function (https://link.springer.com/article/10.1007/s12325-021-01939-9); JAMA Internal Medicine - NSAIDs + diuretics and HF in elderly (https://jamanetwork.com/journals/jamainternalmedicine/fullarticle/205965)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  // 6. Digoxin toxicity with GI illness
  {
    id: 'digoxin_toxicity_gi_illness',
    name: 'Digoxin toxicity with new GI illness',
    description:
      'A patient on digoxin develops vomiting or diarrhea (gastro, food poisoning, a new med). Volume drops, kidney function falls, and the digoxin level climbs even without any dose change.',
    observableSignals: [
      'Nausea or anorexia layered on top of an existing GI illness',
      'Yellow or green halos around lights, blurred or "yellow" vision',
      'New confusion, drowsiness, weakness',
      'Bradycardia or irregular pulse',
      'Med list includes digoxin plus a loop diuretic',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 (pattern 6); 02-medications.md §6 + §11 Pattern F',
      external:
        'StatPearls - Cardiac Glycoside and Digoxin Toxicity (https://www.ncbi.nlm.nih.gov/books/NBK459165/); PMC - Digoxin toxicity practical management (https://pmc.ncbi.nlm.nih.gov/articles/PMC10599802/); Medscape - Digitalis Toxicity Clinical Presentation (https://emedicine.medscape.com/article/154336-clinical)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  // 7. Hidden sodium bomb
  {
    id: 'hidden_sodium_bomb',
    name: 'Hidden sodium bomb',
    description:
      'Effervescent or dissolvable OTC products (Alka-Seltzer, fizzy vitamin C, soluble aspirin, sodium-containing antacids) carry hundreds of mg of sodium per dose. A few days of use can deliver several thousand mg of unrecognized sodium and tip a compensated CHF patient into congestion.',
    observableSignals: [
      'Weight up over 2-5 days while diet "seems fine"',
      'Ankles up, blood pressure up, more breathless climbing the same stairs',
      'Recent log of Alka-Seltzer, dissolvable Tylenol, Emergen-C, Gaviscon, soluble aspirin, or any "fizzy tablet"',
      'Sodium-containing laxative use (Fleet enema, oral sodium phosphate)',
      'Restaurant-meal or processed-food binge mentioned in voice log',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 (pattern 7); 02-medications.md §10 + §11 Pattern G',
      external:
        'Inquirer case report - Alka-Seltzer and CHF (https://www.inquirer.com/health/expert-opinions/heart-failure-sodium-intake-alka-seltzer-20201016.html); LowSaltKitchen - Sodium in medicines (https://www.lowsaltkitchen.com/posts/salty-fact-sodium-in-medicines); HealthDay - Fizzy drugs salt risk (https://www.healthday.com/health-news/general-health/fizzy-drugs-may-pose-a-high-salt-danger-study-suggests-682552.html)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  // 8. Amiodarone pulmonary toxicity mimicking HF
  {
    id: 'amiodarone_pulmonary_toxicity',
    name: 'Amiodarone pulmonary toxicity mimicking HF',
    description:
      'After 6+ months on amiodarone, ~10% of patients develop interstitial pulmonary toxicity. The presentation - new dry cough, dyspnea, sometimes low-grade fever - mimics heart-failure worsening, but classic congestion clues are absent.',
    observableSignals: [
      'New dry cough and shortness of breath',
      'Weight is NOT up; ankles are NOT swollen; orthopnea is NOT new (the absence is the signal)',
      'Sometimes low-grade fever and chest discomfort',
      'Med list includes amiodarone for 6+ months',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 (pattern 8); 02-medications.md §7 + §11 Pattern H',
      external:
        'Frontiers - Amiodarone multi-systemic toxicity case report (https://www.frontiersin.org/journals/cardiovascular-medicine/articles/10.3389/fcvm.2022.839441/full); PMC - Amiodarone pulmonary toxicity (https://pmc.ncbi.nlm.nih.gov/articles/PMC2687560/); AAFP - Amiodarone guidelines (https://www.aafp.org/pubs/afp/issues/2003/1201/p2189.html)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  // 9. Steroid burst → fluid retention + BP rise
  {
    id: 'steroid_burst_decompensation',
    name: 'Steroid burst — fluid retention and BP rise',
    description:
      'A short oral-steroid course from urgent care or PCP (poison ivy, COPD flare, sinusitis, dental, rheumatologic) causes mineralocorticoid-like sodium and water retention. A 5-day burst can tip a compensated CHF patient into decompensation 2-5 days in.',
    observableSignals: [
      'Rapid weight gain and puffy face within 2-5 days of the burst',
      'Blood pressure trending up',
      'Worsening peripheral edema',
      'Blood sugar up if the patient is diabetic',
      'Recent log of prednisone, methylprednisolone, or dexamethasone (or a dental or COPD visit)',
    ],
    meta: {
      internal: 'chf-source-of-truth.md §6 (pattern 9); 02-medications.md §9 + §11 Pattern I',
      external:
        'Alberta Health - HF drugs to avoid (https://myhealth.alberta.ca/Health/pages/conditions.aspx?hwid=zp4024); 2022 AHA/ACC/HFSA Guideline (https://www.ahajournals.org/doi/10.1161/CIR.0000000000001063)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },
] as const;

// Red-flag combinations / OTC traps from chf-source-of-truth.md §6
// (each becomes a flag the app can surface).
export type RedFlagCombination = {
  id: string;
  description: string; // plain-English caregiver-facing reason
  triggerCondition: string; // structured-ish description of when to surface it
  meta: MedMeta;
};

export const RED_FLAG_COMBINATIONS: readonly RedFlagCombination[] = [
  // - NSAIDs (ibuprofen, naproxen) contraindicated in CHF
  {
    id: 'nsaid_in_chf',
    description:
      'NSAIDs (ibuprofen, naproxen, diclofenac, ketorolac, celecoxib) are functionally contraindicated in CHF. They block kidney prostaglandins and cause sodium and water retention, rising blood pressure, and falling kidney function. Acetaminophen (Tylenol) is the safer first choice for mild-to-moderate pain.',
    triggerCondition:
      'Voice log or med list mentions ibuprofen, Advil, Motrin, naproxen, Aleve, diclofenac, ketorolac, celecoxib, or "Goody\'s powder" while the patient has a CHF diagnosis.',
    meta: {
      internal: 'chf-source-of-truth.md §6 (red-flag combinations); 02-medications.md §9',
      external:
        'Kelley-Ross - NSAIDs and HF (https://www.kelley-ross.com/why-is-there-a-concern-with-nsaid-use-and-heart-failure/); Alberta Health - HF drugs to avoid (https://myhealth.alberta.ca/Health/pages/conditions.aspx?hwid=zp4024); JACC - HF after anti-inflammatories in T2DM (https://www.jacc.org/doi/10.1016/j.jacc.2023.02.027); PMC - Cardiovascular risk of NSAIDs review (https://pmc.ncbi.nlm.nih.gov/articles/PMC5422108/)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  // - ACE-I + ARB + MRA "triple whammy" — AKI risk
  {
    id: 'triple_whammy_renal_combination',
    description:
      'The "triple whammy" stack of an ACE-I/ARB/ARNI plus a diuretic plus an NSAID roughly doubles the risk of acute kidney injury in older patients. Most CHF patients are already on two of the three, so adding the NSAID is the match.',
    triggerCondition:
      'Med list shows ACE-I, ARB, or ARNI plus a loop diuretic AND a new NSAID is logged (OTC or prescription).',
    meta: {
      internal: 'chf-source-of-truth.md §6 (red-flag combinations); 02-medications.md §9',
      external:
        'bpacnz - Avoiding the triple whammy (https://bpac.org.nz/2018/triple-whammy.aspx); PMC - Triple whammy AKI meta-analysis 2025 (https://pmc.ncbi.nlm.nih.gov/articles/PMC12569550/); ScienceDirect - Triple whammy AKI review (https://www.sciencedirect.com/science/article/pii/S2013251415000139)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  // - Potassium stackers (ACE-I/ARB/ARNI/MRA/K+ supplements) — hyperkalemia
  {
    id: 'potassium_stackers_hyperkalemia',
    description:
      'Stacking potassium-sparing therapies — ACE-I, ARB, ARNI, MRA, oral potassium supplement, or potassium-chloride salt substitutes (NuSalt, Morton Salt Substitute) — can cause life-threatening hyperkalemia. Salt substitutes are the most-missed offender because they look like seasoning, not medication.',
    triggerCondition:
      'Med list contains an MRA AND any of: ACE-I, ARB, ARNI, potassium supplement, or potassium-chloride salt substitute. Risk is amplified if a recent illness, dehydration, or drop in kidney function is also logged.',
    meta: {
      internal: 'chf-source-of-truth.md §6 (red-flag combinations); 02-medications.md §9',
      external:
        'UK MHRA 2016 - spironolactone + RAS inhibitors (https://www.gov.uk/drug-safety-update/spironolactone-and-renin-angiotensin-system-drugs-in-heart-failure-risk-of-potentially-fatal-hyperkalaemia); Cleveland Clinic Journal - ACE-I/ARB K monitoring (https://www.ccjm.org/content/86/9/601)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  // - Steroid bursts — fluid retention
  {
    id: 'steroid_burst_fluid_retention',
    description:
      'Oral corticosteroid bursts (prednisone, methylprednisolone, dexamethasone) cause sodium and water retention through mineralocorticoid-like activity. A 5-day burst from urgent care for poison ivy, sinusitis, or a COPD flare can tip a compensated CHF patient into decompensation.',
    triggerCondition:
      'Voice log or med list mentions a new course of prednisone, methylprednisolone, dexamethasone, or "steroid pack" / "Medrol Dosepak" in a CHF patient.',
    meta: {
      internal: 'chf-source-of-truth.md §6 (red-flag combinations); 02-medications.md §9',
      external:
        'Alberta Health - HF drugs to avoid (https://myhealth.alberta.ca/Health/pages/conditions.aspx?hwid=zp4024)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  // - Real licorice — mineralocorticoid effect
  {
    id: 'real_licorice_mineralocorticoid',
    description:
      'Real black licorice, licorice-root tea, and some herbal digestive supplements contain glycyrrhizic acid, which inhibits 11β-HSD2 and lets cortisol act on mineralocorticoid receptors — producing sodium/water retention, low potassium, hypertension, and metabolic alkalosis. Effects begin within ~1 week of daily use and can precipitate hypertensive emergency, HF decompensation, or arrhythmia. (U.S. red licorice / Twizzlers contain no real licorice.)',
    triggerCondition:
      'Voice log mentions black licorice candy, licorice-root tea, DGL supplements in larger-than-trace doses, or "I have been eating a lot of licorice" while on CHF therapy.',
    meta: {
      internal: 'chf-source-of-truth.md §6 (red-flag combinations); 02-medications.md §10',
      external:
        'PMC - Licorice-induced apparent mineralocorticoid excess (https://pmc.ncbi.nlm.nih.gov/articles/PMC8126388/); NEJM - Licorice-induced hypermineralocorticoidism (https://www.nejm.org/doi/full/10.1056/NEJM199110243251706); Frontiers - Licorice pseudohyperaldosteronism (https://www.frontiersin.org/journals/endocrinology/articles/10.3389/fendo.2019.00484/full); CMAJ - Hypertensive emergency from licorice tea (https://www.cmaj.ca/content/191/21/e581)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  // - Effervescent OTCs (Alka-Seltzer etc.) — sodium load
  {
    id: 'effervescent_otc_sodium_load',
    description:
      'Effervescent and dissolvable OTC products use sodium bicarbonate or sodium carbonate as the fizz agent. A single Alka-Seltzer Original tablet contains ~567 mg of sodium; max-dose use can deliver 4,500+ mg of sodium — about 3x the AHA-recommended 1,500 mg/day cap for a CHF patient. A documented case describes new CHF caused by Alka-Seltzer overuse alone.',
    triggerCondition:
      'Voice log or med list mentions Alka-Seltzer, dissolvable Tylenol, effervescent vitamin C, Emergen-C, sodium-containing antacids (Gaviscon, some Tums formulations), soluble aspirin, or oral sodium phosphate / Fleet products in a CHF patient.',
    meta: {
      internal: 'chf-source-of-truth.md §6 (red-flag combinations); 02-medications.md §10',
      external:
        'Inquirer case report - Alka-Seltzer and CHF (https://www.inquirer.com/health/expert-opinions/heart-failure-sodium-intake-alka-seltzer-20201016.html); LowSaltKitchen - Sodium in medicines (https://www.lowsaltkitchen.com/posts/salty-fact-sodium-in-medicines); HealthDay - Fizzy drugs salt risk (https://www.healthday.com/health-news/general-health/fizzy-drugs-may-pose-a-high-salt-danger-study-suggests-682552.html)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  // - St. John's Wort, ginseng — multiple interactions
  {
    id: 'st_johns_wort_ginseng_interactions',
    description:
      'St. John\'s Wort is a potent CYP3A4 and P-glycoprotein inducer that lowers levels of warfarin (stroke risk), digoxin (loss of rate control / recurrent AFib), several DOACs, statins, and antiarrhythmics. Ginseng (Panax, American, Siberian/Eleuthero) can shift warfarin effect in either direction, decreases digoxin levels, and can raise blood pressure at higher doses. Both are AAFP-listed clinically important herb-drug interactions.',
    triggerCondition:
      'Voice log or med list mentions St. John\'s Wort, ginseng (any preparation), or "I started a herbal supplement" in a CHF patient — especially when warfarin, a DOAC, digoxin, or amiodarone is also on the med list.',
    meta: {
      internal: 'chf-source-of-truth.md §6 (red-flag combinations); 02-medications.md §10',
      external:
        'PMC - St John\'s wort drug interactions (https://pmc.ncbi.nlm.nih.gov/articles/PMC1874438/); BJCP - St John\'s wort and ginseng with warfarin (https://bpspubs.onlinelibrary.wiley.com/doi/10.1111/j.1365-2125.2003.02051.x); AAFP - Herbal-drug interactions (https://www.aafp.org/pubs/afp/issues/2008/0101/p73.html); GoodRx - St. John\'s wort interactions (https://www.goodrx.com/well-being/supplements-herbs/st-johns-wort-interactions)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },
] as const;

// Specific clinical safety constants

export const ENTRESTO_WASHOUT_HOURS = {
  value: 36,
  description:
    'Mandatory ACE-I -> ARNI washout window before first Entresto dose. No washout required ARB -> ARNI. Overlap dramatically raises angioedema risk because both neprilysin inhibition and ACE inhibition elevate bradykinin.',
  meta: {
    internal: 'chf-source-of-truth.md §6 watchpoints table; 02-medications.md §2 (36-hour washout rule)',
    external:
      'Entresto HCP dosing page, Novartis (https://www.entrestohcp.com/safety-and-dosing/dosing); SingleCare - Entresto washout (https://www.singlecare.com/blog/entresto-washout-period/); AAFP - Sacubitril/Valsartan for HF (https://www.aafp.org/pubs/afp/issues/2016/1015/p611.html); ACC Safe Prescribing of Sacubitril/Valsartan infographic',
    sourceQuote:
      '"Entresto must not be started within 36 hours of the last ACE-I dose (and vice versa)." (02-medications.md §2)',
    lastReviewed: '2026-04-29',
    reviewer: 'pending',
  },
} as const;

// "Never combined" pairs — flag immediately if med list shows both at once.
// Source: 02-medications.md §2 ("Why ACE-I / ARB / ARNI are NEVER combined").
export const FORBIDDEN_DRUG_COMBINATIONS: readonly {
  id: string;
  classes: readonly DrugClass[];
  reason: string;
  meta: MedMeta;
}[] = [
  // ACE-I + ARB
  {
    id: 'ace_inhibitor_plus_arb',
    classes: ['ace_inhibitor', 'arb'],
    reason:
      'ACE-I and ARB act on the same renin-angiotensin axis. Combining them doubles the risk of hyperkalemia, hypotension, acute kidney injury, and angioedema with no added survival benefit. Concurrent prescriptions usually mean a prescribing error or a mid-switch the caregiver should verify with the pharmacy.',
    meta: {
      internal: 'chf-source-of-truth.md §6 watchpoints table; 02-medications.md §2',
      external:
        'ACC Safe Prescribing of Sacubitril/Valsartan infographic (https://www.acc.org/~/media/Non-Clinical/Images/Footer%20Content/Media%20Center/Info%20Graphics/2018/06/Safe-Prescribing-and-Use-of-Sacubitril-Valsartan-Entresto-Print.pdf?la=en); AAFP - Sacubitril/Valsartan for HF (https://www.aafp.org/pubs/afp/issues/2016/1015/p611.html)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  // ACE-I + ARNI (without 36hr washout)
  {
    id: 'ace_inhibitor_plus_arni',
    classes: ['ace_inhibitor', 'arni'],
    reason:
      'ACE-I plus ARNI overlap dramatically raises angioedema risk because both neprilysin inhibition and ACE inhibition elevate bradykinin. Entresto must not be started within 36 hours of the last ACE-I dose (and vice versa). Concurrent prescriptions are a prescribing error unless the 36-hour washout has been observed.',
    meta: {
      internal: 'chf-source-of-truth.md §6 watchpoints table; 02-medications.md §2',
      external:
        'Entresto HCP dosing page, Novartis (https://www.entrestohcp.com/safety-and-dosing/dosing); SingleCare - Entresto washout (https://www.singlecare.com/blog/entresto-washout-period/); AAFP - Sacubitril/Valsartan for HF (https://www.aafp.org/pubs/afp/issues/2016/1015/p611.html)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },

  // ARB + ARNI
  {
    id: 'arb_plus_arni',
    classes: ['arb', 'arni'],
    reason:
      'ARNI already contains an ARB component (valsartan). Adding a separate ARB doubles renin-angiotensin blockade with no added benefit and compounds the risk of hyperkalemia, hypotension, and acute kidney injury. Concurrent prescriptions usually mean a prescribing error or a mid-switch the caregiver should verify.',
    meta: {
      internal: 'chf-source-of-truth.md §6 watchpoints table; 02-medications.md §2',
      external:
        'ACC Safe Prescribing of Sacubitril/Valsartan infographic (https://www.acc.org/~/media/Non-Clinical/Images/Footer%20Content/Media%20Center/Info%20Graphics/2018/06/Safe-Prescribing-and-Use-of-Sacubitril-Valsartan-Entresto-Print.pdf?la=en); AAFP - Sacubitril/Valsartan for HF (https://www.aafp.org/pubs/afp/issues/2016/1015/p611.html)',
      lastReviewed: '2026-04-29',
      reviewer: 'pending',
    },
  },
] as const;
