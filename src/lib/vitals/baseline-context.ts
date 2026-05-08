// Baseline context the per-vital classifier compares "today" against.
// Mirrors the alert engine's lookback windows (ROLLING_BASELINE_DAYS = 7)
// so the row sub-lines stay consistent with the headline tier.

import type { SupabaseClient } from '@supabase/supabase-js';
import { ROLLING_BASELINE_DAYS } from '@/lib/clinical/thresholds';
import type { BaselineCtx } from './per-vital-tier';

export async function getBaselineContext(
  supabase: SupabaseClient,
  patientId: string,
  logDate: string,
  coldStart: boolean,
  pillowBaselineFromPatient: number | null,
): Promise<BaselineCtx> {
  const start = isoDateOffset(logDate, -ROLLING_BASELINE_DAYS);
  const startWeight = isoDateOffset(logDate, -ROLLING_BASELINE_DAYS - 1);

  const [weightAtWeek, pillowsPrior, swellingPrior, coughPrior] = await Promise.all([
    supabase
      .from('daily_log_readings')
      .select('value, recorded_at')
      .eq('patient_id', patientId)
      .eq('field', 'weight_lb')
      .gte('log_date', startWeight)
      .lte('log_date', start)
      .order('recorded_at', { ascending: false })
      .limit(1),
    supabase
      .from('daily_logs')
      .select('pillow_count')
      .eq('patient_id', patientId)
      .gte('log_date', start)
      .lt('log_date', logDate)
      .not('pillow_count', 'is', null),
    supabase
      .from('daily_log_symptom_events')
      .select('log_date')
      .eq('patient_id', patientId)
      .eq('symptom', 'swelling')
      .eq('present', true)
      .gte('log_date', start)
      .lt('log_date', logDate),
    supabase
      .from('daily_log_symptom_events')
      .select('log_date')
      .eq('patient_id', patientId)
      .eq('symptom', 'cough')
      .eq('present', true)
      .eq('nocturnal', true)
      .gte('log_date', start)
      .lt('log_date', logDate),
  ]);

  const pillowCounts = (pillowsPrior.data ?? [])
    .map((r) => Number(r.pillow_count))
    .filter((n) => Number.isFinite(n));
  const pillow7dMax = pillowCounts.length ? Math.max(...pillowCounts) : null;

  const swellingDays = new Set((swellingPrior.data ?? []).map((r) => r.log_date)).size;
  const coughNights = new Set((coughPrior.data ?? []).map((r) => r.log_date)).size;

  return {
    weight7dAgoLb: weightAtWeek.data?.[0]?.value ? Number(weightAtWeek.data[0].value) : null,
    pillow7dMax,
    pillowBaseline: pillowBaselineFromPatient,
    swellingPriorWeekDays: swellingDays,
    coughNocturnalPriorWeekNights: coughNights,
    coldStart,
  };
}

function isoDateOffset(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
