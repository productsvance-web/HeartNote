// Shared types for the medication-add wizard. The parent
// MedicationWizard owns one WizardState; each step receives the slice it
// needs and a setter. Keeping the type module-local to /me/medications/new
// because no other route reads or writes this shape.

import type { DrugDetails } from '@/lib/medications/rxnorm';
import type { CadenceDraft } from '../cadence/cadence-flow';
import { todayYmd } from '../cadence/cadence-fields';

export type DrugSelection =
  | {
      kind: 'rxnorm';
      rxcui: string;
      name: string;
      type: 'brand' | 'generic';
      // Set only when type === 'brand'.
      ingredient: string | null;
      ingredientRxcui: string | null;
    }
  | {
      // Caregiver typed a name with no RxNorm match and chose to add it
      // anyway. drug_class will be derived via classifyDrugByName from the
      // typed string at save time.
      kind: 'custom';
      name: string;
    };

export interface WizardState {
  selection: DrugSelection | null;
  // Populated when the parent fetches getDrugDetails after step 1. Null
  // for custom-path or while loading. The same response powers steps 2
  // and 3 — we never call getDrugDetails twice for the same selection.
  drugDetails: DrugDetails | null;
  drugDetailsLoading: boolean;
  drugDetailsError: boolean;
  form: string | null;
  // Pre-formatted display string ("40 mg", "0.5 g", ""). The wizard
  // builds this from chip selection or from custom number+unit input,
  // and writes it through to medications.dose unchanged.
  strength: string;
  cadence: CadenceDraft;
  startedAt: string;
  notes: string;
}

// Computed once at module load so brand-new wizard sessions see today's
// date in the Duration card without an explicit fetch. The user can clear
// or edit. Edge case: a tab kept open past midnight will retain the prior
// day's date until the bundle reloads — accepted tradeoff (no zero
// customers) over the complexity of converting these to live builders.
const INITIAL_CADENCE: CadenceDraft = {
  kind: 'as_needed',
  cycleOnDays: null,
  cycleOffDays: null,
  cycleUnit: 'day',
  intervalDays: null,
  startedAt: todayYmd(),
  endedAt: '',
  doseTimes: [],
  groups: [],
};

export const INITIAL_STATE: WizardState = {
  selection: null,
  drugDetails: null,
  drugDetailsLoading: false,
  drugDetailsError: false,
  form: null,
  strength: '',
  cadence: INITIAL_CADENCE,
  startedAt: todayYmd(),
  notes: '',
};

// 1: Search → 2: Form → 3: Strength → 4: Cadence → 5: Details.
export type StepIndex = 1 | 2 | 3 | 4 | 5;
