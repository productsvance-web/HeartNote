// /log/manual — tap-only entry path. Five vitals cards: weight, swelling
// (with body region + clears-overnight when severity ≥ 1), breathing,
// pillows, cough. Each save creates a new daily_logs row and writes only
// the fields the caregiver touched.
//
// Plan: docs/superpowers/plans/2026-05-09-vitals-manual-entry.md.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { ManualEntryClient } from './manual-entry-client';

export default async function ManualEntryPage() {
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

  // Look up the latest weight reading for the seed value of the stepper.
  // Stepper still starts at "—" (untouched) — this is just so increment
  // from a sensible base instead of from min. maybeSingle so a cold-start
  // patient with no readings doesn't trip a 406.
  const { data: latestWeight } = await supabase
    .from('daily_log_readings')
    .select('value')
    .eq('patient_id', patient.id)
    .eq('field', 'weight_lb')
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

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
          Manual entry
        </p>
        <h1
          className="font-display text-[30px] text-foreground mt-1.5 leading-tight"
          style={{ letterSpacing: '-0.02em', fontWeight: 500 }}
        >
          Tap what you noticed.
        </h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Skip anything you didn&rsquo;t check &mdash; only what you tap gets saved.
        </p>
      </header>
      <ManualEntryClient
        latestWeightLb={latestWeight?.value ?? null}
        normalPillowCount={patient.normal_pillow_count ?? 1}
        today={today}
      />
    </PhoneShell>
  );
}
