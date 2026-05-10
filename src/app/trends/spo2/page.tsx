// Server component for /trends/spo2. Auth + onboarding + patient
// gates (mirrors src/app/trends/weight/page.tsx). Reads up to 13 months
// of SpO2 readings in one indexed query, then renders the client view.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { isoOffset } from '@/lib/dates/iso-offset';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { Spo2TrendView } from '@/components/heartnote/spo2-trend/Spo2TrendView';
import type { VitalReading } from '@/lib/trends/vital-reading';

const FETCH_DAYS = 366;

export default async function Spo2TrendPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed_at, timezone')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarding_completed_at) redirect('/onboarding');

  const { data: patient } = await supabase
    .from('patients')
    .select('id, display_name')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!patient) redirect('/onboarding');

  const today = getTodayInTimezone(profile.timezone);
  const lower = isoOffset(today, -FETCH_DAYS);

  const { data: rows } = await supabase
    .from('daily_log_readings')
    .select('id, value, recorded_at, log_date')
    .eq('patient_id', patient.id)
    .eq('field', 'spo2')
    .gte('log_date', lower)
    .lte('log_date', today)
    .order('recorded_at', { ascending: true });

  const allReadings: VitalReading[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    value: Number(r.value),
    recorded_at: r.recorded_at as string,
    log_date: r.log_date as string,
  }));

  const firstName = firstWord(patient.display_name) ?? 'Mom';

  return (
    <PhoneShell hideNav>
      <Spo2TrendView
        patientFirstName={firstName}
        timezone={profile.timezone}
        today={today}
        allReadings={allReadings}
      />
    </PhoneShell>
  );
}

function firstWord(s: string | null | undefined): string | null {
  if (!s) return null;
  const w = s.trim().split(/\s+/)[0];
  return w && w.length > 0 ? w : null;
}
