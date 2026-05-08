import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { createVisit } from '@/app/visits/actions';

export default async function NewVisitPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, onboarding_completed_at, timezone')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarding_completed_at) redirect('/onboarding');

  const { data: patient } = await supabase
    .from('patients')
    .select('id, display_name, cardiologist_name')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!patient) redirect('/onboarding');

  const today = getTodayInTimezone(profile.timezone);

  return (
    <PhoneShell>
      <header className="px-6 pt-8">
        <Link
          href="/visits"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ChevronLeft size={16} />
          Visits
        </Link>
        <h1
          className="font-display text-[28px] text-foreground mt-3 leading-tight"
          style={{ letterSpacing: '-0.02em' }}
        >
          Schedule a cardiology visit.
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          The handoff fills in automatically from the last 14 days.
        </p>
      </header>

      {error && (
        <div
          className="mx-4 mt-4 rounded-2xl p-3 text-sm leading-relaxed"
          style={{
            background: 'var(--status-alert-soft)',
            color: 'var(--status-alert-foreground)',
          }}
        >
          {error === 'invalid'
            ? 'Pick a date and a kind of visit, then try again.'
            : 'Could not save the visit. Try again in a moment.'}
        </div>
      )}

      <form action={createVisit} className="mx-4 mt-6 flex flex-col gap-5">
        <fieldset className="rounded-3xl bg-card border border-border shadow-card p-5">
          <legend className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Visit date
          </legend>
          <input
            type="date"
            name="visit_date"
            min={today}
            defaultValue={today}
            required
            className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-3 text-base"
          />
        </fieldset>

        <fieldset className="rounded-3xl bg-card border border-border shadow-card p-5">
          <legend className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Cardiologist name
          </legend>
          <input
            type="text"
            name="cardiologist_name"
            defaultValue={patient.cardiologist_name ?? ''}
            placeholder="Dr. ____"
            maxLength={120}
            className="mt-2 w-full rounded-2xl border border-border bg-background px-3 py-3 text-base"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Leave blank to use the cardiologist on file.
          </p>
        </fieldset>

        <fieldset className="rounded-3xl bg-card border border-border shadow-card p-5">
          <legend className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Kind of visit
          </legend>
          <div className="mt-2 flex flex-col gap-2">
            <KindRadio value="routine" label="Routine check-in" defaultChecked />
            <KindRadio value="follow_up" label="Follow-up on a recent change" />
            <KindRadio value="new_symptoms" label="New symptoms — same-day or this week" />
          </div>
        </fieldset>

        <button
          type="submit"
          className="rounded-full px-5 py-3 text-sm font-medium active:scale-[0.98] transition"
          style={{
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          Save visit
        </button>
      </form>
    </PhoneShell>
  );
}

function KindRadio({
  value,
  label,
  defaultChecked = false,
}: {
  value: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-border bg-background px-3 py-3 text-sm cursor-pointer">
      <input
        type="radio"
        name="visit_kind"
        value={value}
        required
        defaultChecked={defaultChecked}
        className="accent-primary"
      />
      {label}
    </label>
  );
}
