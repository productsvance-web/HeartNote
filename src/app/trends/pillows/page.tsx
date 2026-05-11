// Server component for /trends/pillows. Reads up to 13 months of
// daily_logs rows where pillow_count is non-null. Each row maps to one
// VitalReading at noon-of-log-date in patient tz (pillows is per-night;
// the exact hour has no meaning).

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { isoFromWallClock } from '@/lib/dates/from-wall-clock';
import { isoOffset } from '@/lib/dates/iso-offset';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { PillowsTrendView } from '@/components/heartnote/pillows-trend/PillowsTrendView';
import type { VitalReading } from '@/lib/trends/vital-reading';

const FETCH_DAYS = 366;

export default async function PillowsTrendPage() {
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
    .select('id, display_name, normal_pillow_count')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!patient) redirect('/onboarding');

  const today = getTodayInTimezone(profile.timezone);
  const lower = isoOffset(today, -FETCH_DAYS);

  const { data: rows } = await supabase
    .from('daily_logs')
    .select('id, log_date, pillow_count, created_at')
    .eq('patient_id', patient.id)
    .gte('log_date', lower)
    .lte('log_date', today)
    .not('pillow_count', 'is', null)
    .order('created_at', { ascending: true });

  const allReadings: VitalReading[] = (rows ?? []).map((r) => {
    const recorded_at =
      isoFromWallClock(`${r.log_date}T12:00`, profile.timezone) ??
      (r.created_at as string);
    return {
      id: r.id as string,
      value: Number(r.pillow_count),
      recorded_at,
      log_date: r.log_date as string,
    };
  });

  const firstName = firstWord(patient.display_name) ?? 'Mom';
  const baselinePillowCount =
    typeof patient.normal_pillow_count === 'number'
      ? patient.normal_pillow_count
      : null;

  return (
    <PhoneShell hideNav>
      <PillowsTrendView
        patientFirstName={firstName}
        timezone={profile.timezone}
        today={today}
        baselinePillowCount={baselinePillowCount}
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
