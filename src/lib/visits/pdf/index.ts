// Visit-handoff PDF — data loader.
//
// One function, one round-trip per slice. The render path (session 2/3) reads
// the returned shape and walks each section's view straight through. Adherence
// is intentionally not loaded here — the per-day RPC × 14 days × N meds is
// N+1; session 3 should add a window RPC and load it then.
//
// All queries lean on RLS for ownership: the caller passes an authenticated
// SupabaseClient; failed visibility surfaces as null/empty rather than 500.

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { MED_CLASS_VALUES } from '@/lib/medications/classes';

type Client = SupabaseClient<Database>;

// 30-day window for charts and the symptom timeline; the plan locks this.
const WINDOW_DAYS = 30;

// Cardinal symptoms shown in the visit-handoff timeline (one row per).
// "Sleep (pillows)" is NOT in this set — it's derived from `daily_logs.pillow_count`
// vs `patients.normal_pillow_count`, not from `daily_log_symptom_events`.
const TIMELINE_SYMPTOMS = ['dyspnea', 'swelling', 'cough'] as const;

export type TimelineSymptom = (typeof TIMELINE_SYMPTOMS)[number];

export interface VisitHandoffData {
  visit: {
    id: string;
    visitDate: string;
    visitKind: string | null;
    cardiologistName: string | null;
    questionsToAsk: unknown;
    notesAfter: string | null;
    lastVisitId: string | null;
  };
  patient: {
    id: string;
    displayName: string;
    relationship: string | null;
    dateOfBirth: string | null;
    dryWeightLb: number | null;
    normalPillowCount: number | null;
  };
  caregiver: {
    firstName: string;
  };
  windowStart: string;
  windowEnd: string;
  weightSeries: Array<{
    recordedAt: string;
    logDate: string;
    valueLb: number;
  }>;
  symptomEvents: Array<{
    recordedAt: string;
    logDate: string;
    symptom: TimelineSymptom;
    present: boolean;
    nocturnal: boolean | null;
  }>;
  pillowReadings: Array<{
    logDate: string;
    pillowCount: number;
  }>;
  triggersInWindow: Array<{
    logDate: string;
    tier: Database['public']['Enums']['alert_tier'];
    triggers: unknown;
  }>;
  activeMedications: Array<{
    id: string;
    drugName: string;
    drugClass: Database['public']['Enums']['med_class'];
    dose: string | null;
    form: string | null;
    cadenceKind: string;
    startedAt: string | null;
    endedAt: string | null;
  }>;
}

export async function loadVisitHandoffData(
  supabase: Client,
  visitId: string,
): Promise<VisitHandoffData | null> {
  const { data: visit } = await supabase
    .from('cardiology_visits')
    .select(
      'id, patient_id, visit_date, visit_kind, cardiologist_name, questions_to_ask, notes_after, last_visit_id',
    )
    .eq('id', visitId)
    .maybeSingle();
  if (!visit) return null;

  const { data: patient } = await supabase
    .from('patients')
    .select(
      'id, caregiver_id, display_name, relationship, date_of_birth, dry_weight_lb, normal_pillow_count',
    )
    .eq('id', visit.patient_id)
    .maybeSingle();
  if (!patient) return null;

  const windowEnd = visit.visit_date;
  const windowStart = isoDateOffset(windowEnd, -WINDOW_DAYS);

  const [
    { data: caregiver },
    { data: weightRows },
    { data: symptomRows },
    { data: pillowRows },
    { data: assessmentRows },
    { data: medRows },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', patient.caregiver_id)
      .maybeSingle(),
    supabase
      .from('daily_log_readings')
      .select('recorded_at, log_date, value')
      .eq('patient_id', patient.id)
      .eq('field', 'weight_lb')
      .gte('log_date', windowStart)
      .lte('log_date', windowEnd)
      .order('recorded_at', { ascending: true }),
    supabase
      .from('daily_log_symptom_events')
      .select('recorded_at, log_date, symptom, present, nocturnal')
      .eq('patient_id', patient.id)
      .in('symptom', TIMELINE_SYMPTOMS as unknown as string[])
      .gte('log_date', windowStart)
      .lte('log_date', windowEnd)
      .order('recorded_at', { ascending: true }),
    supabase
      .from('daily_logs')
      .select('log_date, pillow_count')
      .eq('patient_id', patient.id)
      .not('pillow_count', 'is', null)
      .gte('log_date', windowStart)
      .lte('log_date', windowEnd),
    supabase
      .from('daily_assessments')
      .select('log_date, tier, triggers')
      .eq('patient_id', patient.id)
      .gte('log_date', windowStart)
      .lte('log_date', windowEnd)
      .order('log_date', { ascending: false }),
    supabase
      .from('medications')
      .select('id, drug_name, drug_class, dose, form, cadence_kind, started_at, ended_at')
      .eq('patient_id', patient.id)
      .is('stopped_at', null),
  ]);

  return {
    visit: {
      id: visit.id,
      visitDate: visit.visit_date,
      visitKind: visit.visit_kind,
      cardiologistName: visit.cardiologist_name,
      questionsToAsk: visit.questions_to_ask,
      notesAfter: visit.notes_after,
      lastVisitId: visit.last_visit_id,
    },
    patient: {
      id: patient.id,
      displayName: patient.display_name,
      relationship: patient.relationship,
      dateOfBirth: patient.date_of_birth,
      dryWeightLb: numericOrNull(patient.dry_weight_lb),
      normalPillowCount: patient.normal_pillow_count,
    },
    caregiver: {
      firstName: firstWord(caregiver?.display_name),
    },
    windowStart,
    windowEnd,
    weightSeries: (weightRows ?? []).map((r) => ({
      recordedAt: r.recorded_at,
      logDate: r.log_date,
      valueLb: Number(r.value),
    })),
    symptomEvents: (symptomRows ?? []).map((r) => ({
      recordedAt: r.recorded_at,
      logDate: r.log_date,
      symptom: r.symptom as TimelineSymptom,
      present: r.present,
      nocturnal: r.nocturnal,
    })),
    pillowReadings: (pillowRows ?? [])
      .filter((r): r is { log_date: string; pillow_count: number } =>
        r.pillow_count !== null,
      )
      .map((r) => ({ logDate: r.log_date, pillowCount: r.pillow_count })),
    triggersInWindow: (assessmentRows ?? []).map((r) => ({
      logDate: r.log_date,
      tier: r.tier,
      triggers: r.triggers,
    })),
    activeMedications: sortByMedClass(
      (medRows ?? []).map((m) => ({
        id: m.id,
        drugName: m.drug_name,
        drugClass: m.drug_class,
        dose: m.dose,
        form: m.form,
        cadenceKind: m.cadence_kind,
        startedAt: m.started_at,
        endedAt: m.ended_at,
      })),
    ),
  };
}

// Sort by canonical med-class display order (loop_diuretic first, "other" last);
// matches the dashboard sort and the plan's spec for the meds table.
function sortByMedClass<T extends { drugClass: Database['public']['Enums']['med_class'] }>(
  rows: T[],
): T[] {
  const order = new Map<string, number>(
    MED_CLASS_VALUES.map((v, i) => [v, i]),
  );
  return [...rows].sort(
    (a, b) =>
      (order.get(a.drugClass) ?? 999) - (order.get(b.drugClass) ?? 999),
  );
}

function isoDateOffset(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function firstWord(s: string | null | undefined): string {
  if (!s) return '';
  return s.trim().split(/\s+/)[0] ?? '';
}

function numericOrNull(v: number | string | null): number | null {
  if (v === null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
