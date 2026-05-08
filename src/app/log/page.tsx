import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
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
  // src/lib/dates/today.ts. The `allLogDates` query feeds the "Voice log ·
  // day N" eyebrow (N = distinct calendar days the patient has logged on,
  // counting today even when not yet logged so the eyebrow doesn't read
  // as "day N+1" the moment the caregiver opens the page).
  const today = getTodayInTimezone(profile.timezone);
  const [todaysLogsRes, yesterdayLog, allLogDatesRes] = await Promise.all([
    supabase
      .from('daily_logs')
      .select('id, processing_status, transcribed_text, structured_observations, created_at')
      .eq('patient_id', patient.id)
      .eq('log_date', today)
      .order('created_at', { ascending: false })
      .limit(1),
    getYesterdayLog(supabase, patient.id, today),
    supabase.from('daily_logs').select('log_date').eq('patient_id', patient.id),
  ]);
  const todaysLog = todaysLogsRes.data?.[0] ?? null;
  const distinctLogDates = new Set(
    (allLogDatesRes.data ?? []).map((r) => r.log_date as string),
  );
  const dayN = distinctLogDates.has(today)
    ? distinctLogDates.size
    : distinctLogDates.size + 1;

  const { headline, subhead } = shellCopyFor(todaysLog?.processing_status ?? null);

  return (
    <PhoneShell hideNav>
      <header className="px-6 pt-6 pb-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground active:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
          Home
        </Link>
        <p
          className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          style={{ letterSpacing: '0.08em' }}
        >
          Voice log · day {dayN}
        </p>
        <h1
          className="font-display text-[30px] text-foreground mt-1.5 leading-tight"
          style={{ letterSpacing: '-0.02em', fontWeight: 500 }}
        >
          {headline}
        </h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{subhead}</p>
      </header>
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

// Server-rendered headline + subhead for the /log shell. Only reflects the
// initial state at page load — the recording state machine inside
// VoiceLogClient owns dynamic state during dictation. "pending" rows on
// page load are treated as idle (they're stale shells from prior bailed
// recordings, per voice-log-client's existing reset logic).
function shellCopyFor(status: string | null): { headline: string; subhead: string } {
  if (status === 'complete') {
    return {
      headline: "Today's check-in is in.",
      subhead: 'Tap the mic to add anything else, or come back tomorrow.',
    };
  }
  if (status === 'failed') {
    return {
      headline: 'Something went wrong.',
      subhead: 'Tap the mic to try again.',
    };
  }
  if (status !== null && status !== 'pending') {
    return {
      headline: "Listening to today's log…",
      subhead: 'A few seconds — keep this open.',
    };
  }
  return {
    headline: 'Tap to log today.',
    subhead:
      'About 30 seconds is plenty. Sleep, weight, swelling, breath — whatever you noticed.',
  };
}
