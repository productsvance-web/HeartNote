// Server component for /trends/bp. Fetches up to 13 months of sys +
// dia rows in one query and joins them into BpPair[] on the server by
// source_log_id. Pairs missing either half are silently dropped (the
// action's rollback should prevent that state).

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { isoOffset } from '@/lib/dates/iso-offset';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { BpTrendView } from '@/components/heartnote/bp-trend/BpTrendView';
import type { BpPair } from '@/lib/trends/bp-pair';

const FETCH_DAYS = 366;

export default async function BpTrendPage() {
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
    .select('id, value, recorded_at, log_date, field, source_log_id')
    .eq('patient_id', patient.id)
    .in('field', ['systolic_bp', 'diastolic_bp'])
    .gte('log_date', lower)
    .lte('log_date', today)
    .order('recorded_at', { ascending: true });

  const pairs = pairBpRows(rows ?? []);

  const firstName = firstWord(patient.display_name) ?? 'Mom';

  return (
    <PhoneShell hideNav>
      <BpTrendView
        patientFirstName={firstName}
        timezone={profile.timezone}
        today={today}
        allPairs={pairs}
      />
    </PhoneShell>
  );
}

type RawReadingRow = {
  id: string;
  value: number | string;
  recorded_at: string;
  log_date: string;
  field: string;
  source_log_id: string | null;
};

function pairBpRows(rows: RawReadingRow[]): BpPair[] {
  // Group by source_log_id so the sys + dia pair is reconstructed even
  // if the underlying inserts landed milliseconds apart with different
  // recorded_at clamps. source_log_id is the canonical pair key.
  const grouped = new Map<
    string,
    { sys?: RawReadingRow; dia?: RawReadingRow }
  >();
  for (const r of rows) {
    if (!r.source_log_id) continue;
    const entry = grouped.get(r.source_log_id) ?? {};
    if (r.field === 'systolic_bp') entry.sys = r;
    else if (r.field === 'diastolic_bp') entry.dia = r;
    grouped.set(r.source_log_id, entry);
  }
  const pairs: BpPair[] = [];
  for (const [sourceLogId, { sys, dia }] of grouped.entries()) {
    if (!sys || !dia) continue; // drop orphaned halves
    pairs.push({
      sourceLogId,
      sysId: sys.id,
      diaId: dia.id,
      sys: Number(sys.value),
      dia: Number(dia.value),
      recorded_at: sys.recorded_at,
      log_date: sys.log_date,
    });
  }
  pairs.sort(
    (a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at),
  );
  return pairs;
}

function firstWord(s: string | null | undefined): string | null {
  if (!s) return null;
  const w = s.trim().split(/\s+/)[0];
  return w && w.length > 0 ? w : null;
}
