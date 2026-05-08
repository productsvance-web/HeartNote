import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { YesterdayLogCard } from '@/components/heartnote/YesterdayLogCard';
import { getYesterdayLog } from '@/lib/voice-log/yesterday';
import { VoiceLogClient } from './voice-log-client';

export default async function LogPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed_at, timezone')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarding_completed_at) redirect('/onboarding');

  const { data: patient } = await supabase
    .from('patients')
    .select('id, display_name, relationship')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!patient) redirect('/onboarding');

  // A day can have many daily_logs rows (one per dictation). On page load,
  // surface the most recent one so the caregiver sees their last entry.
  // `today` is the caregiver's local calendar day, not UTC — see
  // src/lib/dates/today.ts.
  const today = getTodayInTimezone(profile.timezone);
  const [todaysLogsRes, yesterdayLog] = await Promise.all([
    supabase
      .from('daily_logs')
      .select('id, processing_status, transcribed_text, structured_observations, created_at')
      .eq('patient_id', patient.id)
      .eq('log_date', today)
      .order('created_at', { ascending: false })
      .limit(1),
    getYesterdayLog(supabase, patient.id, today),
  ]);
  const todaysLog = todaysLogsRes.data?.[0] ?? null;

  return (
    <PhoneShell>
      <VoiceLogClient
        patientName={patient.display_name}
        patientId={patient.id}
        existingLogId={todaysLog?.id ?? null}
        existingStatus={todaysLog?.processing_status ?? null}
        existingTranscript={todaysLog?.transcribed_text ?? null}
        existingObservations={
          (todaysLog?.structured_observations as Record<string, unknown> | null) ?? null
        }
      />
      {yesterdayLog && <YesterdayLogCard log={yesterdayLog} />}
    </PhoneShell>
  );
}
