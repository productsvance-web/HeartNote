// Aggregates everything the cardiology-visit handoff needs in a single
// server-side call. Pulls from real DB rows — daily_log_readings,
// daily_assessments, medications, daily_log_symptom_events. Never invents
// thresholds: weight delta is computed from real readings, triggers come
// from the alert engine's stored verdict, active meds come straight from
// the medications table.
//
// Plain-English: this is the "what's worth showing the cardiologist"
// summary. Last 14 days of weight, the alert/watch days the engine
// flagged, current medications, and how often each tracked symptom came
// up. The caregiver prints or screenshots this for the appointment.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface VisitHandoffData {
  weightSeries14d: { d: string; v: number }[];
  weightLatestLb: number | null;
  weight7dAgoLb: number | null;
  weightDelta7dLb: number | null;
  triggers14d: { date: string; tier: string; labels: string[] }[];
  activeMeds: { drugName: string; dose: string | null; drugClass: string }[];
  symptomDayCounts: { symptom: string; days: number }[];
  daysLogged14d: number;
  windowStart: string;
  windowEnd: string;
}

export async function generateVisitHandoff(
  supabase: SupabaseClient,
  patientId: string,
  today: string,
): Promise<VisitHandoffData> {
  const windowStart = isoDateOffset(today, -13);
  const sevenDaysAgo = isoDateOffset(today, -7);

  const [weightQ, assessmentsQ, medsQ, symptomsQ, logsQ] = await Promise.all([
    supabase
      .from('daily_log_readings')
      .select('log_date, value, recorded_at')
      .eq('patient_id', patientId)
      .eq('field', 'weight_lb')
      .gte('log_date', windowStart)
      .lte('log_date', today)
      .order('recorded_at', { ascending: true }),
    supabase
      .from('daily_assessments')
      .select('log_date, tier, triggers')
      .eq('patient_id', patientId)
      .gte('log_date', windowStart)
      .lte('log_date', today)
      .order('log_date', { ascending: false }),
    supabase
      .from('medications')
      .select('drug_name, drug_class, dose')
      .eq('patient_id', patientId)
      .is('stopped_at', null)
      .order('drug_name', { ascending: true }),
    supabase
      .from('daily_log_symptom_events')
      .select('symptom, log_date, present')
      .eq('patient_id', patientId)
      .eq('present', true)
      .gte('log_date', windowStart)
      .lte('log_date', today),
    supabase
      .from('daily_logs')
      .select('log_date')
      .eq('patient_id', patientId)
      .gte('log_date', windowStart)
      .lte('log_date', today),
  ]);

  // Weight: take the latest reading per day, then sort ascending.
  const weightByDay = new Map<string, number>();
  for (const r of (weightQ.data ?? []) as {
    log_date: string;
    value: number | string;
  }[]) {
    weightByDay.set(r.log_date, Number(r.value));
  }
  const weightSeries14d = Array.from(weightByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, v]) => ({ d, v }));
  const weightLatestLb =
    weightSeries14d.length > 0 ? weightSeries14d[weightSeries14d.length - 1].v : null;
  // Find the reading at-or-before `sevenDaysAgo`, fallback to the earliest.
  const weight7dAgoLb =
    weightSeries14d.find((p) => p.d <= sevenDaysAgo)?.v ?? weightSeries14d[0]?.v ?? null;
  const weightDelta7dLb =
    weightLatestLb !== null && weight7dAgoLb !== null
      ? Number((weightLatestLb - weight7dAgoLb).toFixed(1))
      : null;

  // Triggers: only return assessments whose tier was non-good (alert/watch).
  // Engine writes tier_4_log (cold-start sentinel) and `null` for routine
  // good days; those don't earn a row in the handoff.
  const triggers14d: VisitHandoffData['triggers14d'] = [];
  for (const a of (assessmentsQ.data ?? []) as {
    log_date: string;
    tier: string | null;
    triggers: { rule_id: string; label: string }[] | null;
  }[]) {
    if (
      a.tier === null ||
      a.tier === 'tier_4_log' ||
      a.tier === 'tier_5_baseline' ||
      !a.triggers ||
      a.triggers.length === 0
    ) {
      continue;
    }
    triggers14d.push({
      date: a.log_date,
      tier: a.tier,
      labels: a.triggers.map((t) => t.label),
    });
  }

  // Active meds.
  const activeMeds = ((medsQ.data ?? []) as {
    drug_name: string;
    drug_class: string;
    dose: string | null;
  }[]).map((m) => ({
    drugName: m.drug_name,
    dose: m.dose,
    drugClass: m.drug_class,
  }));

  // Symptom counts: distinct days per symptom kind.
  const symptomDays = new Map<string, Set<string>>();
  for (const s of (symptomsQ.data ?? []) as { symptom: string; log_date: string }[]) {
    if (!symptomDays.has(s.symptom)) symptomDays.set(s.symptom, new Set());
    symptomDays.get(s.symptom)!.add(s.log_date);
  }
  const symptomDayCounts = Array.from(symptomDays.entries())
    .map(([symptom, days]) => ({ symptom, days: days.size }))
    .sort((a, b) => b.days - a.days);

  const daysLogged14d = new Set(
    ((logsQ.data ?? []) as { log_date: string }[]).map((r) => r.log_date),
  ).size;

  return {
    weightSeries14d,
    weightLatestLb,
    weight7dAgoLb,
    weightDelta7dLb,
    triggers14d,
    activeMeds,
    symptomDayCounts,
    daysLogged14d,
    windowStart,
    windowEnd: today,
  };
}

function isoDateOffset(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
