import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
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

  // If today's log already exists, surface it. `today` is the caregiver's
  // local calendar day, not UTC — see src/lib/dates/today.ts.
  const today = getTodayInTimezone(profile.timezone);
  const { data: todaysLog } = await supabase
    .from('daily_logs')
    .select('id, processing_status, transcribed_text, structured_observations, created_at')
    .eq('patient_id', patient.id)
    .eq('log_date', today)
    .maybeSingle();

  return (
    <PhoneShell>
      <header className="px-6 pt-8">
        <p className="text-sm text-muted-foreground">Today&apos;s check-in</p>
        <h1 className="font-display text-3xl text-foreground mt-1">
          How is <span className="italic">{patient.display_name}</span>?
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Tap and talk for up to 2 minutes — weight, breathing, swelling, energy, sleep, cough,
          appetite, anything that feels off. Watch the tiles fill as you speak.
        </p>
      </header>

      <VoiceLogClient
        patientId={patient.id}
        existingLogId={todaysLog?.id ?? null}
        existingStatus={todaysLog?.processing_status ?? null}
        existingTranscript={todaysLog?.transcribed_text ?? null}
        existingObservations={
          (todaysLog?.structured_observations as Record<string, unknown> | null) ?? null
        }
      />
    </PhoneShell>
  );
}
