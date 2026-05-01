// ATC code → med_class mapping for HeartNote drug classification.
//
// Sources:
//   - WHO ATC/DDD Index: https://www.whocc.no/atc_ddd_index/
//   - NIH RxClass:       https://lhncbc.nlm.nih.gov/RxNav/APIs/RxClassAPIs.html
//
// The longest-prefix match wins so more-specific codes (e.g. C09DX04 for
// sacubitril/valsartan = ARNI) override their parent-family entry (C09D = ARB
// combinations). Anything with no matching prefix maps to 'other' — the
// caregiver can override the suggestion in the form.

import type { Database } from '@/lib/supabase/types';

export type MedClass = Database['public']['Enums']['med_class'];

interface AtcMapping {
  prefix: string;
  medClass: MedClass;
}

export const ATC_TO_MED_CLASS: readonly AtcMapping[] = [
  { prefix: 'C09DX04', medClass: 'arni' },
  { prefix: 'C03DA',   medClass: 'mra' },
  { prefix: 'C03C',    medClass: 'loop_diuretic' },
  { prefix: 'C09A',    medClass: 'ace_inhibitor' },
  { prefix: 'C09B',    medClass: 'ace_inhibitor' },
  { prefix: 'C09C',    medClass: 'arb' },
  { prefix: 'C09D',    medClass: 'arb' },
  { prefix: 'C07A',    medClass: 'beta_blocker' },
  { prefix: 'A10BK',   medClass: 'sglt2_inhibitor' },
  { prefix: 'C01AA',   medClass: 'digoxin' },
  { prefix: 'C01B',    medClass: 'antiarrhythmic' },
  { prefix: 'B01AA',   medClass: 'anticoagulant_warfarin' },
  { prefix: 'B01AE',   medClass: 'anticoagulant_doac' },
  { prefix: 'B01AF',   medClass: 'anticoagulant_doac' },
  { prefix: 'A12B',    medClass: 'potassium_supplement' },
];

export function classifyByAtcCodes(atcCodes: readonly string[]): MedClass {
  let bestPrefixLength = 0;
  let bestClass: MedClass = 'other';
  for (const code of atcCodes) {
    for (const { prefix, medClass } of ATC_TO_MED_CLASS) {
      if (code.startsWith(prefix) && prefix.length > bestPrefixLength) {
        bestPrefixLength = prefix.length;
        bestClass = medClass;
      }
    }
  }
  return bestClass;
}
