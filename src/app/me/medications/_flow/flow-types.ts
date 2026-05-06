// Shared types for the unified medication flow (manual / scan / edit).
//
// Three entry points share the post-selection chrome (drug name centered,
// prior selections appended as subtitle, back/X corners, Next at bottom)
// and the step components (TypeStep, StrengthStep, ScheduleStep). Each
// entry point owns its own controller — see NewMedicationFlow,
// EditMedicationFlow, ScanMedicationFlow.

import type { DrugDetails } from '@/lib/medications/rxnorm';

// What the user picked at search time. Manual flow's Search step yields
// one of these. Scan flow synthesizes one from OCR. Edit flow synthesizes
// one from the saved drug_name + rxcui.
export type DrugSelection =
  | {
      kind: 'rxnorm';
      rxcui: string;
      name: string;
      type: 'brand' | 'generic';
      ingredient: string | null;
      ingredientRxcui: string | null;
    }
  | {
      // Caregiver typed a name with no RxNorm match (or scan failed to
      // resolve). drug_class derives from classifyDrugByName at save time.
      kind: 'custom';
      name: string;
    };

// State shared by all three flow controllers. Each controller owns one
// of these and threads it through the step components.
export interface FlowState {
  selection: DrugSelection | null;
  drugDetails: DrugDetails | null;
  drugDetailsLoading: boolean;
  drugDetailsError: boolean;
  form: string | null;
  // Pre-formatted display string ("40 mg", "0.5 g", ""). Builders write
  // through to medications.dose unchanged.
  strength: string;
}

export const INITIAL_FLOW_STATE: FlowState = {
  selection: null,
  drugDetails: null,
  drugDetailsLoading: false,
  drugDetailsError: false,
  form: null,
  strength: '',
};
