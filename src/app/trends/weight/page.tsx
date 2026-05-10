// Server component for /trends/weight. Auth + onboarding + patient
// gates (mirrors src/app/trends/page.tsx). Reads up to 13 months of
// weight readings in one indexed query, then renders the client view.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { isoOffset } from '@/lib/dates/iso-offset';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { WeightTrendView } from '@/components/heartnote/weight-trend/WeightTrendView';
import type { WeightReading } from '@/lib/trends/weight-window';

// Rolling 12 months. 366 covers leap years; the Y window helper trims
// further to the patient-tz calendar.
const FETCH_DAYS = 366;

export default async function WeightTrendPage() {
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
    .select('id, display_name, dry_weight_lb')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!patient) redirect('/onboarding');

  const today = getTodayInTimezone(profile.timezone);
  const lower = isoOffset(today, -FETCH_DAYS);

  const { data: rows } = await supabase
    .from('daily_log_readings')
    .select('value, recorded_at, log_date')
    .eq('patient_id', patient.id)
    .eq('field', 'weight_lb')
    .gte('log_date', lower)
    .lte('log_date', today)
    .order('recorded_at', { ascending: true });

  const allReadings: WeightReading[] = (rows ?? []).map((r) => ({
    value: Number(r.value),
    recorded_at: r.recorded_at as string,
    log_date: r.log_date as string,
  }));

  const firstName = firstWord(patient.display_name) ?? 'Mom';

  const baselineLb =
    patient.dry_weight_lb !== null ? Number(patient.dry_weight_lb) : null;

  return (
    <PhoneShell hideNav>
      <WeightTrendView
        patientFirstName={firstName}
        timezone={profile.timezone}
        today={today}
        baselineLb={baselineLb}
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
