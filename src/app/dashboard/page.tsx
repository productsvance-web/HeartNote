import { redirect } from 'next/navigation';
import { Mic, Users, CalendarHeart, Settings, Heart, ChevronRight, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { getSpo2Trend } from '@/lib/vitals/spo2';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { StatusRing } from '@/components/heartnote/StatusRing';
import { SpO2Card } from '@/components/heartnote/SpO2Card';
import Link from 'next/link';

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default async function DashboardPage() {
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
    .select('id, display_name, relationship, dry_weight_lb, nyha_class, cardiologist_name')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  const patientName = patient?.display_name ?? 'them';
  const cardiologist = patient?.cardiologist_name;

  // Caregiver-local calendar day; UTC would mis-bucket evening / early-morning
  // logs. See src/lib/dates/today.ts.
  const today = getTodayInTimezone(profile.timezone);
  const { data: todaysLog } = patient
    ? await supabase
        .from('daily_logs')
        .select('id, processing_status, transcribed_text, created_at')
        .eq('patient_id', patient.id)
        .eq('log_date', today)
        .maybeSingle()
    : { data: null };

  // SpO2 mini trend for the dashboard card. Falls back to null on query
  // error so the card silently disappears rather than crashing the dashboard.
  const spo2 = patient
    ? await getSpo2Trend(supabase, patient.id, today, 7).catch(() => null)
    : null;

  // Until we wire alert logic, derive a simple display status from the log state.
  // 'pending' here means a row exists from a record-attempt that never submitted
  // a transcript — same as no log at all from the caregiver's perspective.
  // No log yet / pending → empty (no ring). Analyzing → loading visual.
  // Complete → 'good' (placeholder until tier-detection is wired).
  const logStatus: 'none' | 'processing' | 'complete' =
    !todaysLog || todaysLog.processing_status === 'pending'
      ? 'none'
      : todaysLog.processing_status === 'complete'
        ? 'complete'
        : 'processing';

  const tiles = [
    { to: '/family', label: 'Family', Icon: Users, tint: 'oklch(0.93 0.02 220)' },
    { to: '/visits', label: 'Visit prep', Icon: CalendarHeart, tint: 'var(--status-watch-soft)' },
    { to: '/me', label: 'Settings', Icon: Settings, tint: 'var(--accent)' },
  ] as const;

  return (
    <PhoneShell>
      <header className="px-6 pt-8">
        <p className="text-sm text-muted-foreground">{greet()}, {profile?.display_name ?? 'there'}.</p>
        <h1 className="font-display text-3xl text-foreground mt-1">
          How is <span className="italic">{patientName}</span> today?
        </h1>
      </header>

      <section className="mt-6 mx-4 rounded-3xl bg-card shadow-card p-6 animate-fade-up">
        {logStatus === 'complete' && <StatusRing status="good" />}

        {logStatus === 'processing' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div
              className="h-16 w-16 rounded-full flex items-center justify-center animate-pulse-ring"
              style={{ background: 'var(--status-good-soft)', color: 'var(--status-good-foreground)' }}
            >
              <Loader2 size={26} className="animate-spin" />
            </div>
            <p className="font-display text-lg">Listening to today&apos;s log…</p>
            <p className="text-xs text-muted-foreground">This usually takes a few seconds.</p>
          </div>
        )}

        {logStatus === 'none' && (
          <div className="text-center py-2">
            <p className="text-sm text-muted-foreground">
              No check-in for today yet. Tap below for a 30-second log — weight, breathing,
              swelling, energy, or anything that feels off.
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between rounded-2xl bg-muted/60 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {patient?.relationship ?? 'Patient'}
            </p>
            <p className="text-lg font-semibold text-foreground">{patientName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {logStatus === 'complete'
                ? 'Logged today'
                : logStatus === 'processing'
                  ? 'Processing today’s log'
                  : 'No log yet today'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {patient?.dry_weight_lb ? 'Dry weight' : 'NYHA'}
            </p>
            <p className="text-lg font-semibold text-foreground">
              {patient?.dry_weight_lb ? `${patient.dry_weight_lb} lb` : patient?.nyha_class ?? '—'}
            </p>
          </div>
        </div>

        {logStatus !== 'processing' && (
          <Link
            href="/log"
            className="mt-5 w-full flex items-center justify-center gap-3 rounded-full px-6 py-5 text-primary-foreground font-semibold text-base shadow-soft active:scale-[0.98] transition"
            style={{
              background:
                'linear-gradient(135deg, var(--sage), color-mix(in oklab, var(--sage) 70%, white))',
            }}
          >
            <Mic size={22} />
            {logStatus === 'complete' ? 'Add to today’s log' : 'Start daily log'}
            <span className="text-xs font-normal opacity-80">· 30 sec</span>
          </Link>
        )}
      </section>

      {spo2?.latest && (
        <SpO2Card
          days={spo2.days}
          todayLogDate={today}
          latestValue={spo2.latest.value}
          latestLogDate={spo2.latest.log_date}
        />
      )}

      <Link
        href="/me"
        className="mx-4 mt-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card"
      >
        <div
          className="h-10 w-10 rounded-full flex items-center justify-center"
          style={{ background: 'var(--status-good-soft)', color: 'var(--status-good-foreground)' }}
        >
          <Heart size={18} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Welcome to HeartNote</p>
          <p className="text-xs text-muted-foreground">
            {cardiologist ? `${cardiologist} is on file. ` : ''}Voice log, alerts, and visit prep
            unlock as we build them.
          </p>
        </div>
        <ChevronRight size={18} className="text-muted-foreground" />
      </Link>

      <section className="mx-4 mt-5 grid grid-cols-2 gap-3">
        {tiles.map(({ to, label, Icon, tint }) => (
          <Link
            key={to}
            href={to}
            className="rounded-2xl bg-card p-4 shadow-card flex flex-col gap-3 active:scale-[0.98] transition"
          >
            <div
              className="h-11 w-11 rounded-xl flex items-center justify-center text-foreground"
              style={{ background: tint }}
            >
              <Icon size={20} />
            </div>
            <div>
              <p className="font-semibold text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">Coming soon</p>
            </div>
          </Link>
        ))}
      </section>

      <footer className="mt-10 mb-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
        Built with{' '}
        <Heart
          size={12}
          className="inline"
          style={{ color: 'var(--status-alert)' }}
          fill="currentColor"
        />{' '}
        for caregivers
      </footer>
    </PhoneShell>
  );
}
