// Canonical med_class taxonomy + display order + caregiver-facing labels.
//
// Single source of truth: any UI list, Zod enum, or label map should import
// from here. Keeping this in one file prevents the form / list / Zod from
// drifting out of sync.
//
// Display order matches dashboard sort priority (loop diuretics first because
// they're the highest-signal CHF drug class for missed-dose alerting per
// research/02-medications.md §11 Pattern A). Postgres enum declaration order
// in supabase/migrations/20260428153829_initial_schema.sql happens to match,
// so `ORDER BY drug_class` in SQL produces the same visual order — change
// both together if you ever reorder.

import type { Database } from '@/lib/supabase/types';

export type MedClass = Database['public']['Enums']['med_class'];

// Tuple-first declaration so Zod's z.enum() infers a literal-union, not
// `string`. The `satisfies` clause keeps it cross-checked against the
// supabase-codegen MedClass type (any drift in the DB enum surfaces here).
export const MED_CLASS_VALUES = [
  'loop_diuretic',
  'ace_inhibitor',
  'arb',
  'arni',
  'beta_blocker',
  'mra',
  'sglt2_inhibitor',
  'digoxin',
  'antiarrhythmic',
  'anticoagulant_warfarin',
  'anticoagulant_doac',
  'potassium_supplement',
  'other',
] as const satisfies readonly MedClass[];

// `Record<MedClass, string>` forces every enum value to have a label —
// adding a value to MED_CLASS_VALUES without a label fails type-check.
export const MED_CLASS_LABEL: Record<MedClass, string> = {
  loop_diuretic: 'Loop diuretic',
  ace_inhibitor: 'ACE inhibitor',
  arb: 'ARB',
  arni: 'ARNI',
  beta_blocker: 'Beta blocker',
  mra: 'MRA',
  sglt2_inhibitor: 'SGLT2 inhibitor',
  digoxin: 'Digoxin',
  antiarrhythmic: 'Antiarrhythmic',
  anticoagulant_warfarin: 'Warfarin',
  anticoagulant_doac: 'DOAC anticoagulant',
  potassium_supplement: 'Potassium supplement',
  other: 'Other',
};

export const MED_CLASS_ORDER: ReadonlyArray<{ value: MedClass; label: string }> =
  MED_CLASS_VALUES.map((value) => ({ value, label: MED_CLASS_LABEL[value] }));
