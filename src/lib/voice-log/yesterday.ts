import type { SupabaseClient } from '@supabase/supabase-js';

// Yesterday's log + assessment, surfaced on /log so the caregiver has a
// reminder of what they reported the day before. Pure server query —
// reads daily_logs (latest row for yesterday) and daily_assessments
// (yesterday's tier).

export interface YesterdayLog {
  id: string; // daily_logs.id of the most-recent row for yesterday
  date: string; // ISO YYYY-MM-DD
  transcriptSnippet: string | null;
  caregiverSummary: string | null;
  tier: 'good' | 'watch' | 'alert' | 'unknown';
  tierLabel: string;
  symptomCount: number;
}

export async function getYesterdayLog(
  supabase: SupabaseClient,
  patientId: string,
  today: string,
): Promise<YesterdayLog | null> {
  const yesterday = isoDateOffset(today, -1);

  const [logsQ, assessmentQ, eventsQ] = await Promise.all([
    supabase
      .from('daily_logs')
      .select('id, transcribed_text, structured_observations, processing_status, created_at')
      .eq('patient_id', patientId)
      .eq('log_date', yesterday)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('daily_assessments')
      .select('tier')
      .eq('patient_id', patientId)
      .eq('log_date', yesterday)
      .maybeSingle(),
    supabase
      .from('daily_log_symptom_events')
      .select('symptom')
      .eq('patient_id', patientId)
      .eq('log_date', yesterday)
      .eq('present', true),
  ]);

  if (!logsQ.data || logsQ.data.processing_status !== 'complete') return null;

  const obs = logsQ.data.structured_observations as { caregiver_summary?: string } | null;
  const transcript =
    typeof logsQ.data.transcribed_text === 'string' && logsQ.data.transcribed_text.trim().length > 0
      ? logsQ.data.transcribed_text.trim()
      : null;
  const summary =
    typeof obs?.caregiver_summary === 'string' && obs.caregiver_summary.trim().length > 0
      ? obs.caregiver_summary.trim()
      : null;

  const tier = mapTier(assessmentQ.data?.tier ?? null);
  const symptomCount = new Set(
    ((eventsQ.data ?? []) as { symptom: string }[]).map((s) => s.symptom),
  ).size;

  return {
    id: logsQ.data.id as string,
    date: yesterday,
    transcriptSnippet: snippet(transcript ?? summary, 180),
    caregiverSummary: summary,
    tier,
    tierLabel: tierLabel(tier),
    symptomCount,
  };
}

function mapTier(t: string | null): YesterdayLog['tier'] {
  if (t === 'tier_1_911' || t === 'tier_2_today') return 'alert';
  if (t === 'tier_3_48hr') return 'watch';
  if (t === 'tier_4_log' || t === 'tier_5_baseline' || t === null) return 'unknown';
  return 'good';
}

function tierLabel(t: YesterdayLog['tier']): string {
  if (t === 'alert') return 'Alert';
  if (t === 'watch') return 'Watch';
  if (t === 'good') return 'Doing well';
  return 'Building baseline';
}

function snippet(s: string | null, max: number): string | null {
  if (!s) return null;
  if (s.length <= max) return s;
  return s.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function isoDateOffset(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
