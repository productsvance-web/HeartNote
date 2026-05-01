// Caregiver-phrasing synonym dictionary for live tile fill.
//
// Used in two places:
//   1. Passed to Deepgram as `keyterm=...` query params on the streaming
//      WebSocket — biases recognition toward CHF vocabulary so the transcript
//      itself is more accurate (replaces the Whisper-medical-prompt we lose).
//   2. Client-side string matching against the running transcript via
//      findMatchedKeyterms() — lights up tiles in real time as words appear.
//
// Adding a new caregiver phrasing is a one-line edit in this file. No code
// changes anywhere else. Keep entries lowercase; the matcher lowercases the
// transcript.

export type TileKey =
  | 'weight'
  | 'blood_pressure'
  | 'heart_rate'
  | 'oxygen'
  | 'breathing'
  | 'swelling'
  | 'energy'
  | 'sleep'
  | 'cough'
  | 'appetite';

export const KEYWORD_MAP: Record<TileKey, readonly string[]> = {
  weight: ['weight', 'weighed', 'weighs', 'pounds', 'lbs', 'scale'],

  blood_pressure: ['blood pressure', 'bp', 'systolic', 'diastolic'],

  heart_rate: ['heart rate', 'pulse', 'bpm', 'heartbeat'],

  oxygen: ['oxygen', 'spo2', 'sat', 'sats', 'pulse ox', 'pulse oximeter', 'o2'],

  breathing: [
    'short of breath',
    'out of breath',
    'shortness of breath',
    "can't catch her breath",
    "can't catch his breath",
    "couldn't catch her breath",
    'winded',
    'huffing',
    'puffing',
    'gasping',
    'wheezing',
    'labored breathing',
    'breathing hard',
    'panting',
    'dyspnea',
  ],

  swelling: [
    'puffy',
    'swollen',
    'swelling',
    'edema',
    'ankles look big',
    'feet are tight',
    'legs are tight',
    // Multi-word "fluid" phrasings only — bare "fluid" false-positives on
    // "she drank fluids" / "water pill flushed fluid."
    'fluid in her ankles',
    'fluid in his ankles',
    'fluid build-up',
    'fluid buildup',
    'bloated',
    'belly is bigger',
    'rings are tight',
    'shoes are tight',
  ],

  energy: [
    'tired',
    'exhausted',
    'wiped',
    'wiped out',
    'no energy',
    'low energy',
    'fatigue',
    'fatigued',
    'worn out',
    'sluggish',
    'dragging',
    'lethargic',
    'no pep',
  ],

  sleep: [
    'pillow',
    'pillows',
    'orthopnea',
    'propped up',
    'sat up to breathe',
    'woke up gasping',
    'woke gasping',
    'pnd',
    'slept upright',
    "couldn't lie flat",
  ],

  cough: [
    'cough',
    'coughing',
    'coughed',
    'hacking',
    'clearing throat',
    'phlegm',
    'sputum',
    'pink frothy',
    'pink froth',
    'frothy',
  ],

  appetite: [
    'appetite',
    "didn't eat",
    "didn't finish",
    'no appetite',
    'skipped meal',
    'skipped breakfast',
    'skipped lunch',
    'skipped dinner',
    'full quickly',
    'filled up fast',
    "couldn't finish",
    'picked at food',
    'pushed food around',
  ],
} as const;

// CHF medications passed to Deepgram as additional keyterm bias. These don't
// map to a tile (medication tracking is its own future feature) but biasing
// recognition keeps drug names from being mangled in the transcript that
// Claude later extracts against. Mix of generic + brand names; Deepgram caps
// keyterm tokens at ~500 (~100 words), comfortably under.
export const CHF_MEDICATION_KEYTERMS: readonly string[] = [
  // Loop diuretics
  'furosemide',
  'lasix',
  'torsemide',
  'demadex',
  'bumetanide',
  'bumex',
  // ARNI
  'sacubitril',
  'valsartan',
  'entresto',
  // ACE/ARB
  'lisinopril',
  'losartan',
  'enalapril',
  'ramipril',
  // Beta blockers
  'metoprolol',
  'carvedilol',
  'coreg',
  'bisoprolol',
  // MRA
  'spironolactone',
  'aldactone',
  'eplerenone',
  'inspra',
  // SGLT2
  'dapagliflozin',
  'farxiga',
  'empagliflozin',
  'jardiance',
  // Other
  'digoxin',
  'amiodarone',
  'warfarin',
  'eliquis',
  'apixaban',
  // Colloquial caregiver phrasings
  'water pill',
  'blood thinner',
  'heart pill',
] as const;

// Phrases that auto-stop recording when they appear at the END of a final
// transcript segment AND silence follows for ~1s. The trailing-position +
// silence-gate gating prevents false triggers like "I want to end note about
// the cough" — see voice-log-client.tsx for the gate logic.
export const END_RECORDING_PHRASES: readonly string[] = [
  // "end" family
  'end note',
  'end of note',
  'end log',
  'end of log',
  'end recording',
  'end of recording',
  // "stop" family
  'stop log',
  'stop note',
  'stop recording',
  // "save" family
  'save log',
  'save the log',
  'save and stop',
  // "done / finished" family
  "i'm done",
  'i am done',
  "i'm finished",
  'i am finished',
  // "that's all" family
  "that's all",
  'that is all',
] as const;

// Flat list of every term Deepgram should bias recognition toward. Sent as
// `keyterm=...` repeated query params on the WebSocket open.
export function allKeyterms(): readonly string[] {
  const symptomTerms = Object.values(KEYWORD_MAP).flat();
  return [...symptomTerms, ...CHF_MEDICATION_KEYTERMS];
}
