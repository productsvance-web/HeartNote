// Per-field validation ranges for caregiver-reported vitals. Mirrors
// the DB CHECK constraints in
// supabase/migrations/20260501041617_voice_log_multi_readings.sql.
//
// Single source for both server-side zod refines and client-side picker
// validation — re-declaring these constants in two TS files invited drift
// (rule 1 in .claude/rules/code-quality.md). This module has no server-only
// imports so it's safe to pull into client bundles.

export type ReadingField = 'weight_lb' | 'resting_hr' | 'spo2' | 'systolic_bp' | 'diastolic_bp';

export const READING_RANGE: Record<ReadingField, [number, number]> = {
  weight_lb: [50, 700],
  resting_hr: [30, 220],
  spo2: [50, 100],
  systolic_bp: [60, 250],
  diastolic_bp: [30, 150],
};
