// 14-day series + roll-ups for the Trends page. All queries filter by
// patient_id and a fixed window; RLS ensures the caregiver only sees
// their own patients.

import type { SupabaseClient } from '@supabase/supabase-js';

export type WeightPoint = { d: string; v: number };

export type TrendSeries = {
  weight14d: WeightPoint[];
  weight7dBaselineLb: number | null;
  restlessNights14d: number;
  symptomsTotal7d: number;
  topSymptoms7d: { label: string; count: number }[];
  loadError: boolean;
};

export async function getTrendSeries(
  supabase: SupabaseClient,
  patientId: string,
  today: string,
): Promise<TrendSeries> {
  const start14 = isoDateOffset(today, -14);
  const start7 = isoDateOffset(today, -7);
  const start7Baseline = isoDateOffset(today, -7);

  try {
    const [weightRows, pillowRows, coughRows, symptomRows, patientRow] = await Promise.all([
      supabase
        .from('daily_log_readings')
        .select('log_date, value, recorded_at')
        .eq('patient_id', patientId)
        .eq('field', 'weight_lb')
        .gte('log_date', start14)
        .lte('log_date', today)
        .order('recorded_at', { ascending: true }),
      supabase
        .from('daily_logs')
        .select('log_date, pillow_count')
        .eq('patient_id', patientId)
        .gte('log_date', start14)
        .lte('log_date', today)
        .not('pillow_count', 'is', null),
      supabase
        .from('daily_log_symptom_events')
        .select('log_date')
        .eq('patient_id', patientId)
        .eq('symptom', 'cough')
        .eq('present', true)
        .eq('nocturnal', true)
        .gte('log_date', start14)
        .lte('log_date', today),
      supabase
        .from('daily_log_symptom_events')
        .select('symptom, log_date, present')
        .eq('patient_id', patientId)
        .eq('present', true)
        .gte('log_date', start7)
        .lte('log_date', today),
      supabase
        .from('patients')
        .select('normal_pillow_count')
        .eq('id', patientId)
        .single(),
    ]);

    if (
      weightRows.error ||
      pillowRows.error ||
      coughRows.error ||
      symptomRows.error ||
      patientRow.error
    ) {
      return emptySeries(true);
    }

    // Collapse weight to one point per day (most recent).
    const byDay = new Map<string, number>();
    for (const r of weightRows.data ?? []) {
      byDay.set(r.log_date as string, Number(r.value));
    }
    const weight14d: WeightPoint[] = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, v]) => ({ d, v }));

    const weight7dBaselineLb =
      weight14d.find((p) => p.d <= start7Baseline)?.v ?? weight14d[0]?.v ?? null;

    // Restless nights = nights where nocturnal cough OR pillow_count above
    // patient's baseline.
    const baseline = patientRow.data?.normal_pillow_count ?? 1;
    const elevatedPillowDays = new Set(
      (pillowRows.data ?? [])
        .filter((r) => Number(r.pillow_count) > baseline)
        .map((r) => r.log_date as string),
    );
    const coughNights = new Set((coughRows.data ?? []).map((r) => r.log_date as string));
    const restlessNights = new Set([...elevatedPillowDays, ...coughNights]);

    const symptomCounts = new Map<string, number>();
    let symptomsTotal = 0;
    for (const r of (symptomRows.data ?? []) as { symptom: string }[]) {
      symptomCounts.set(r.symptom, (symptomCounts.get(r.symptom) ?? 0) + 1);
      symptomsTotal += 1;
    }
    const topSymptoms7d = Array.from(symptomCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 4)
      .map(([symptom, count]) => ({ label: prettySymptom(symptom), count }));

    return {
      weight14d,
      weight7dBaselineLb,
      restlessNights14d: restlessNights.size,
      symptomsTotal7d: symptomsTotal,
      topSymptoms7d,
      loadError: false,
    };
  } catch {
    return emptySeries(true);
  }
}

function emptySeries(loadError: boolean): TrendSeries {
  return {
    weight14d: [],
    weight7dBaselineLb: null,
    restlessNights14d: 0,
    symptomsTotal7d: 0,
    topSymptoms7d: [],
    loadError,
  };
}

const SYMPTOM_LABEL: Record<string, string> = {
  dyspnea: 'Shortness of breath',
  cough: 'Cough',
  chest_pain: 'Chest pain',
  swelling: 'Swelling',
  fatigue: 'Tired',
  pnd: 'Woke up gasping',
  syncope: 'Fainted',
  cognition_change: 'Confusion',
  extremities_cold_clammy: 'Cold and clammy',
  cyanosis: 'Bluish lips',
  early_satiety: 'Full early',
  pulse_irregular: 'Irregular pulse',
  dizziness: 'Dizzy',
  nausea: 'Nausea',
};

function prettySymptom(symptom: string): string {
  return SYMPTOM_LABEL[symptom] ?? symptom;
}

function isoDateOffset(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
