// Server-side data fetch for the home WeeklySynthesisCard. Pulls the four
// inputs the pure `buildWeeklySynthesis` needs — weights, symptom events,
// pillow counts, lead-diuretic adherence — for the rolling 7-day window
// and hands them off.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { evaluateMedAdherenceForDay } from '@/lib/medications/evaluate';
import { buildWeeklySynthesis, type WeeklySynthesis } from './weekly-synthesis';

type Client = SupabaseClient<Database>;

export async function getWeeklySynthesis(
  supabase: Client,
  patientId: string,
  patientName: string | null,
  today: string,
  tz: string,
  normalPillowCount: number | null,
): Promise<WeeklySynthesis> {
  const weeklyDates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    weeklyDates.push(d.toISOString().slice(0, 10));
  }
  const start = weeklyDates[0];

  const [weightsRes, eventsRes, pillowsRes, medsByDay] = await Promise.all([
    supabase
      .from('daily_log_readings')
      .select('log_date, value, recorded_at')
      .eq('patient_id', patientId)
      .eq('field', 'weight_lb')
      .gte('log_date', start)
      .lte('log_date', today)
      .order('recorded_at', { ascending: true }),
    supabase
      .from('daily_log_symptom_events')
      .select('log_date, symptom, present, nocturnal')
      .eq('patient_id', patientId)
      .gte('log_date', start)
      .lte('log_date', today),
    supabase
      .from('daily_logs')
      .select('log_date, pillow_count')
      .eq('patient_id', patientId)
      .gte('log_date', start)
      .lte('log_date', today)
      .not('pillow_count', 'is', null),
    Promise.all(
      weeklyDates.map((d) =>
        evaluateMedAdherenceForDay(supabase, patientId, { date: d, tz }),
      ),
    ),
  ]);

  // Collapse weights to one per day (latest recorded_at wins because rows
  // were ordered ascending — last Map.set for a given date is the latest).
  const weightByDay = new Map<string, number>();
  for (const r of weightsRes.data ?? []) {
    weightByDay.set(r.log_date as string, Number(r.value));
  }
  const weights = Array.from(weightByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([log_date, value]) => ({ log_date, value }));

  const symptomEvents = (
    (eventsRes.data ?? []) as {
      log_date: string;
      symptom: string;
      present: boolean;
      nocturnal: boolean | null;
    }[]
  ).map((r) => ({
    log_date: r.log_date,
    symptom: r.symptom,
    present: r.present,
    nocturnal: r.nocturnal,
  }));

  const pillowsByDay = (
    (pillowsRes.data ?? []) as { log_date: string; pillow_count: number | null }[]
  )
    .filter((r) => r.pillow_count !== null)
    .map((r) => ({ log_date: r.log_date, pillow_count: r.pillow_count as number }));

  // Lead diuretic: take the first loop_diuretic that appears in any of the
  // 7 days' adherence rows. activeDays = the dates where it was active per
  // the RPC (the RPC filters by start_date / end_date for us, so we don't
  // need to repeat that math here).
  let drugName: string | null = null;
  let dosesPerDay: number | null = null;
  const takenByDay: { log_date: string; taken: number }[] = [];
  const activeDays: string[] = [];
  for (let i = 0; i < weeklyDates.length; i++) {
    const date = weeklyDates[i];
    const diuretic = medsByDay[i].find((r) => r.drugClass === 'loop_diuretic');
    if (diuretic) {
      activeDays.push(date);
      takenByDay.push({ log_date: date, taken: diuretic.takenCount });
      drugName = diuretic.drugName;
      dosesPerDay = diuretic.dosesPerDay;
    }
  }
  const diuretic =
    drugName !== null
      ? { drugName, dosesPerDay, takenByDay, activeDays }
      : null;

  return buildWeeklySynthesis({
    patientName,
    today,
    weeklyDates,
    weights,
    symptomEvents,
    pillowsByDay,
    normalPillowCount,
    diuretic,
  });
}
