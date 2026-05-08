// Server query helpers used by the home VitalsList card and the Trends
// page. Returns the rows the per-vital classifier needs to label today's
// signals — never recomputes the engine's tier verdict (that's read from
// daily_assessments).
//
// All queries go through the authenticated supabase server client; RLS
// confines them to the caregiver's own patients.

import type { SupabaseClient } from '@supabase/supabase-js';

export type SwellingObservation = {
  present: boolean;
  severity: number | null;
  resolvesOvernight: boolean | null;
  bodyRegion: string | null;
};

export type DyspneaObservation = {
  present: boolean;
  severity: number | null;
};

export type CoughObservation = {
  present: boolean;
  nocturnal: boolean | null;
};

export type TodaySnapshot = {
  weightLb: number | null;
  weightAt: string | null;
  swelling: SwellingObservation | null;
  dyspnea: DyspneaObservation | null;
  pillowCount: number | null;
  cough: CoughObservation | null;
  activityStepChange: 'none' | 'mild_slowdown' | 'severe_change' | null;
  signalsReportedCount: number;
};

export async function getTodaySnapshot(
  supabase: SupabaseClient,
  patientId: string,
  logDate: string,
): Promise<TodaySnapshot | null> {
  const [readings, events, logs] = await Promise.all([
    supabase
      .from('daily_log_readings')
      .select('field, value, recorded_at')
      .eq('patient_id', patientId)
      .eq('log_date', logDate)
      .eq('field', 'weight_lb')
      .order('recorded_at', { ascending: false })
      .limit(1),
    supabase
      .from('daily_log_symptom_events')
      .select('symptom, present, severity, body_region, nocturnal, resolves_overnight')
      .eq('patient_id', patientId)
      .eq('log_date', logDate),
    supabase
      .from('daily_logs')
      .select('pillow_count, activity_step_change')
      .eq('patient_id', patientId)
      .eq('log_date', logDate)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  if (readings.error || events.error || logs.error) return null;

  const weightRow = readings.data?.[0] ?? null;
  const eventsRows = events.data ?? [];
  const logRow = logs.data?.[0] ?? null;

  const swellingRow = pickSymptom(eventsRows, 'swelling');
  const dyspneaRow = pickSymptom(eventsRows, 'dyspnea');
  const coughRow = pickSymptom(eventsRows, 'cough');

  const swelling: SwellingObservation | null = swellingRow
    ? {
        present: swellingRow.present === true,
        severity: numericOrNull(swellingRow.severity),
        resolvesOvernight: boolOrNull(swellingRow.resolves_overnight),
        bodyRegion: stringOrNull(swellingRow.body_region),
      }
    : null;

  const dyspnea: DyspneaObservation | null = dyspneaRow
    ? { present: dyspneaRow.present === true, severity: numericOrNull(dyspneaRow.severity) }
    : null;

  const cough: CoughObservation | null = coughRow
    ? { present: coughRow.present === true, nocturnal: boolOrNull(coughRow.nocturnal) }
    : null;

  const pillowCount = logRow?.pillow_count ?? null;
  const activityStepChange =
    (logRow?.activity_step_change as TodaySnapshot['activityStepChange']) ?? null;

  const signalsReportedCount = [
    weightRow ? 1 : 0,
    swelling ? 1 : 0,
    dyspnea || activityStepChange ? 1 : 0,
    pillowCount !== null ? 1 : 0,
    cough ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  return {
    weightLb: weightRow ? numericOrNull(weightRow.value) : null,
    weightAt: weightRow ? stringOrNull(weightRow.recorded_at) : null,
    swelling,
    dyspnea,
    pillowCount: pillowCount === null ? null : Number(pillowCount),
    cough,
    activityStepChange,
    signalsReportedCount,
  };
}

type SymptomRow = {
  symptom: string;
  present: boolean;
  severity: number | null;
  body_region: string | null;
  nocturnal: boolean | null;
  resolves_overnight: boolean | null;
};

function pickSymptom(rows: SymptomRow[], key: string): SymptomRow | null {
  // Prefer present=true if it exists for the symptom; otherwise fall back to
  // any present=false row (still meaningful — caregiver explicitly said "no
  // swelling today" rather than skipping the question).
  const all = rows.filter((r) => r.symptom === key);
  return all.find((r) => r.present === true) ?? all[0] ?? null;
}

function numericOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function stringOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

function boolOrNull(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  return Boolean(v);
}
