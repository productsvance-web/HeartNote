import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { getTrendSeries } from '@/lib/trends/series';
import { getCoughHeatmapCells } from '@/lib/trends/cough-buckets';
import { TrendsView } from '@/components/heartnote/TrendsView';
import { PhoneShell } from '@/components/heartnote/PhoneShell';

export default async function TrendsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, onboarding_completed_at, timezone')
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
  const [series, assessment, coughCells] = await Promise.all([
    getTrendSeries(supabase, patient.id, today),
    supabase
      .from('daily_assessments')
      .select('triggers')
      .eq('patient_id', patient.id)
      .eq('log_date', today)
      .maybeSingle(),
    getCoughHeatmapCells(supabase, patient.id, today, profile.timezone),
  ]);
  const triggers =
    (assessment.data?.triggers as
      | { rule_id: string; label: string; evidence: Record<string, unknown> }[]
      | null) ?? [];

  return (
    <PhoneShell>
      <TrendsView
        patient={patient}
        series={series}
        triggers={triggers}
        coughCells={coughCells}
        today={today}
      />
    </PhoneShell>
  );
}
