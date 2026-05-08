import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarHeart, Plus, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { PhoneShell } from '@/components/heartnote/PhoneShell';

export default async function VisitsPage() {
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
    .select('id, display_name')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!patient) redirect('/onboarding');

  const today = getTodayInTimezone(profile.timezone);

  const { data: visits } = await supabase
    .from('cardiology_visits')
    .select('id, visit_date, cardiologist_name, visit_kind, notes_after')
    .eq('patient_id', patient.id)
    .order('visit_date', { ascending: false });

  const allVisits = (visits ?? []) as VisitRow[];
  const upcoming = allVisits
    .filter((v) => v.visit_date >= today)
    .sort((a, b) => a.visit_date.localeCompare(b.visit_date));
  const past = allVisits
    .filter((v) => v.visit_date < today)
    .sort((a, b) => b.visit_date.localeCompare(a.visit_date));

  return (
    <PhoneShell>
      <header className="px-6 pt-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Visits
        </p>
        <h1
          className="font-display text-[28px] text-foreground mt-1 leading-tight"
          style={{ letterSpacing: '-0.02em' }}
        >
          {upcoming.length === 0
            ? 'No cardiology visit scheduled.'
            : nextVisitHeadline(upcoming[0])}
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          Walk into the cardiologist&rsquo;s office ready — weight, symptoms, meds, and
          questions worth asking, all in one screen.
        </p>
      </header>

      <Link
        href="/visits/new"
        className="mx-4 mt-5 flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium active:scale-[0.98] transition"
        style={{
          background: 'var(--primary)',
          color: 'var(--primary-foreground)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <Plus size={16} strokeWidth={2.4} />
        Schedule a visit
      </Link>

      {upcoming.length > 0 && (
        <section className="mt-6 px-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1.5 pb-2">
            Upcoming
          </p>
          <div className="rounded-3xl bg-card border border-border shadow-card overflow-hidden">
            {upcoming.map((v, i) => (
              <VisitListRow key={v.id} visit={v} isLast={i === upcoming.length - 1} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="mt-5 px-4 mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1.5 pb-2">
            Past visits
          </p>
          <div className="rounded-3xl bg-card border border-border shadow-card overflow-hidden">
            {past.slice(0, 12).map((v, i) => (
              <VisitListRow
                key={v.id}
                visit={v}
                isLast={i === Math.min(past.length, 12) - 1}
                isPast
              />
            ))}
          </div>
        </section>
      )}

      {upcoming.length === 0 && past.length === 0 && (
        <section
          className="mx-4 mt-6 rounded-3xl p-5"
          style={{
            background: 'color-mix(in oklab, var(--sage) 10%, var(--card))',
            border: '1px solid color-mix(in oklab, var(--sage) 24%, transparent)',
          }}
        >
          <p className="text-sm leading-relaxed text-foreground">
            HeartNote keeps the last two weeks of weight, symptoms, and medications in one
            screen — handy for the cardiologist&rsquo;s 14-minute slot. Schedule a visit and
            we&rsquo;ll prepare it.
          </p>
        </section>
      )}
    </PhoneShell>
  );
}

interface VisitRow {
  id: string;
  visit_date: string;
  cardiologist_name: string | null;
  visit_kind: string | null;
  notes_after: string | null;
}

function nextVisitHeadline(v: VisitRow): string {
  return `${prettyVisitKind(v.visit_kind)} on ${prettyDate(v.visit_date)}.`;
}

function VisitListRow({
  visit,
  isLast,
  isPast = false,
}: {
  visit: VisitRow;
  isLast: boolean;
  isPast?: boolean;
}) {
  return (
    <Link
      href={`/visits/${visit.id}`}
      className="flex items-center gap-3 px-5 py-3.5 active:bg-muted/40 transition-colors"
      style={{
        minHeight: 60,
        borderBottom: isLast
          ? 'none'
          : '0.5px solid color-mix(in oklab, var(--border) 80%, transparent)',
      }}
    >
      <span
        className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
      >
        <CalendarHeart size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground tabular-nums">
          {prettyDate(visit.visit_date)} · {prettyVisitKind(visit.visit_kind)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {visit.cardiologist_name ?? 'Cardiology'}
          {isPast && (visit.notes_after ? ' · notes saved' : ' · add notes')}
        </p>
      </div>
      <ChevronRight size={16} className="text-muted-foreground/50 shrink-0" />
    </Link>
  );
}

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function prettyDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function prettyVisitKind(kind: string | null): string {
  if (kind === 'follow_up') return 'Follow-up';
  if (kind === 'new_symptoms') return 'New symptoms';
  if (kind === 'routine') return 'Routine';
  return 'Visit';
}
