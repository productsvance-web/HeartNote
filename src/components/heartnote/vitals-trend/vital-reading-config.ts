// Per-vital config for the shared AddReadingSheet / ViewDataSheet
// primitives in this directory. Each /trends/<vital> page declares one
// of these constants and passes it down.
//
// Lives in components/ (not lib/) because it's coupled to the React
// components that consume it.

import type { ReadingField } from '@/lib/clinical/reading-ranges';

export interface VitalReadingConfig {
  // daily_log_readings.field value.
  field: ReadingField;
  // Display label ("Weight", "Oxygen").
  fieldLabel: string;
  // Display unit ("lb", "%").
  unit: string;
  // Validation bounds, sourced from READING_RANGE[field].
  range: [number, number];
  // Stepper increment.
  step: number;
  // True → tap-only stepper, integer-only input. False → 0.1 precision +
  // press-and-hold (weight pattern).
  integer: boolean;
  // Show the large-numeric value with an integer-+-decimal split (weight)
  // or as a single rounded integer (spo2). True = split (weight); false
  // = single integer (spo2).
  splitDecimal: boolean;
  // Whether the stepper ± buttons repeat on press-and-hold (weight) or
  // only fire once per tap (spo2). When false, tap-only.
  pressAndHold: boolean;
  // Formatter for inline list rows and stat-trio cells.
  formatValue: (v: number) => string;
  // Sheet header text ("Add weight", "Add oxygen").
  sheetTitle: string;
  // Header text for the View-data sheet ("All weights", "All oxygen readings").
  listTitle: string;
  // Eyebrow line above the stepper. baseline = patient-level reference
  // (only weight has one today); seed = last logged value.
  eyebrowLine: (
    baseline: number | null,
    seed: number | null,
  ) => string | null;
  // Singular/plural noun ONLY used in destructive confirm() prompts.
  deleteNoun: { singular: string; plural: string };
}
