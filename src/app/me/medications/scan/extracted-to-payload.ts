// Adapter at the boundary between the API output schema (Gemini's shape:
// dose_value + dose_unit as separate fields, doses_per_day nullable for
// PRN) and the form payload schema (a single `dose: string` matching
// DOSE_FORMAT). Architectural decision #17 in the plan.

import type { ExtractedMed } from '@/lib/medications/scan/schema';
import type { MedicationPayload } from '../actions';

export function extractedMedToPayload(med: ExtractedMed): MedicationPayload {
  const dose =
    med.dose_value !== null && med.dose_unit !== null && med.dose_unit.trim().length > 0
      ? `${med.dose_value} ${med.dose_unit.toLowerCase().trim()}`
      : '';
  return {
    drugName: med.drug_name.trim(),
    dose,
    dosesPerDay: med.doses_per_day,
    scheduleTimes: null,
    startedAt: '',
    notes: '',
  };
}
