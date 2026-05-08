import { redirect } from 'next/navigation';
import {
  Mic,
  TrendingUp,
  Users,
  CalendarHeart,
  Settings,
  Heart,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { TodaysMedsCard } from '@/components/heartnote/TodaysMedsCard';
import { HeroAlertCard } from '@/components/heartnote/HeroAlertCard';
import { VitalsListCard } from '@/components/heartnote/VitalsListCard';
import { BaselineProgressCard } from '@/components/heartnote/BaselineProgressCard';
import type { TriggerRow } from '@/lib/vitals/per-vital-tier';
import { ROLLING_BASELINE_DAYS } from '@/lib/clinical/thresholds';
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
    .select(
      'id, display_name, relationship, dry_weight_lb, nyha_class, cardiologist_name, cardiologist_phone, normal_pillow_count',
    )
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  const patientName = patient?.display_name ?? 'them';
  const cardiologist = patient?.cardiologist_name;
  const cardiologistPhone = patient?.cardiologist_phone;

  const today = getTodayInTimezone(profile.timezone);

  const { data: todaysLogs } = patient
    ? await supabase
        .from('daily_logs')
        .select('id, processing_status, created_at')
        .eq('patient_id', patient.id)
        .eq('log_date', today)
        .order('created_at', { ascending: false })
        .limit(1)
    : { data: null };
  const todaysLog = todaysLogs?.[0] ?? null;

  const { data: assessment } = patient
    ? await supabase
        .from('daily_assessments')
        .select('tier, triggers, cold_start, evaluated_at')
        .eq('patient_id', patient.id)
        .eq('log_date', today)
        .maybeSingle()
    : { data: null };

  let priorLogDayCount = 0;
  if (patient && assessment?.cold_start) {
    const lookback = new Date();
    lookback.setUTCDate(lookback.getUTCDate() - 14);
    const { data: priorRows } = await supabase
      .from('daily_logs')
      .select('log_date')
      .eq('patient_id', patient.id)
      .gte('log_date', lookback.toISOString().slice(0, 10))
      .lt('log_date', today);
    priorLogDayCount = new Set((priorRows ?? []).map((r) => r.log_date)).size;
  }

  // Cold-start "starts at" date — first daily_logs entry — drives the
  // BaselineProgressCard's track labels. Only fetched when needed.
  let baselineStartedAt: string | null = null;
  if (patient && assessment?.cold_start) {
    const { data: firstLog } = await supabase
      .from('daily_logs')
      .select('log_date')
      .eq('patient_id', patient.id)
      .order('log_date', { ascending: true })
      .limit(1)
      .maybeSingle();
    baselineStartedAt = firstLog?.log_date ?? today;
  }

  // Weight series for HeroAlert spark — only fetched when an alert is
  // actually rendering and the lead trigger is weight-related.
  const triggers = (assessment?.triggers as TriggerRow[] | null) ?? [];
  const tier = assessment?.tier ?? null;
  const coldStart = assessment?.cold_start === true;
  const isAlertHeader = tier === 'tier_1_911' || tier === 'tier_2_today' || tier === 'tier_3_48hr';

  let weightSeries14d: { d: string; v: number }[] | null = null;
  let weightBaselineLb: number | null = null;
  if (patient && isAlertHeader && triggers.length > 0) {
    const lookback = new Date(`${today}T00:00:00Z`);
    lookback.setUTCDate(lookback.getUTCDate() - 14);
    const start = lookback.toISOString().slice(0, 10);
    const { data: weightRows } = await supabase
      .from('daily_log_readings')
      .select('log_date, value, recorded_at')
      .eq('patient_id', patient.id)
      .eq('field', 'weight_lb')
      .gte('log_date', start)
      .order('recorded_at', { ascending: true });
    if (weightRows && weightRows.length >= 2) {
      // Collapse to one point per day (most recent reading wins).
      const byDay = new Map<string, number>();
      for (const r of weightRows) byDay.set(r.log_date as string, Number(r.value));
      weightSeries14d = Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, v]) => ({ d, v }));
      // Baseline: 7-day-ago value if present, else the earliest reading in window.
      const sevenDaysAgo = isoDateOffset(today, -ROLLING_BASELINE_DAYS);
      weightBaselineLb =
        weightSeries14d.find((p) => p.d <= sevenDaysAgo)?.v ?? weightSeries14d[0].v;
    }
  }

  // Cold-start collecting list — count of distinct days each vital was
  // reported in the last 14 days. Empty on first day.
  let collecting: { key: string; label: string; summary: string; count: number }[] = [];
  if (patient && coldStart && baselineStartedAt) {
    collecting = await getCollectingCounts(supabase, patient.id, today);
  }

  const logStatus: 'none' | 'processing' | 'complete' =
    !todaysLog || todaysLog.processing_status === 'pending'
      ? 'none'
      : todaysLog.processing_status === 'complete'
        ? 'complete'
        : 'processing';

  const todaysLogTime = todaysLog?.created_at
    ? formatTime(todaysLog.created_at, profile.timezone)
    : null;

  const tiles = [
    { to: '/trends', label: 'Trends', Icon: TrendingUp, tint: 'var(--status-good-soft)' },
    { to: '/family', label: 'Family', Icon: Users, tint: 'oklch(0.93 0.02 220)' },
    { to: '/visits', label: 'Visit prep', Icon: CalendarHeart, tint: 'var(--status-watch-soft)' },
    { to: '/me', label: 'Settings', Icon: Settings, tint: 'var(--accent)' },
  ] as const;

  const showVitals =
    patient !== null && logStatus === 'complete' && tier !== null && !coldStart;
  const showBaseline =
    patient !== null && logStatus === 'complete' && tier === 'tier_4_log' && coldStart;
  const showHero = patient !== null && logStatus === 'complete' && isAlertHeader;
  const showSubhead = logStatus === 'complete' && (showVitals || showHero);

  return (
    <PhoneShell>
      <header className="px-6 pt-8">
        <p className="text-sm text-muted-foreground">
          {greet()}, {profile?.display_name ?? 'there'}.
        </p>
        <h1 className="font-display text-3xl text-foreground mt-1">
          How is <span className="italic">{patientName}</span> today?
        </h1>
        {showSubhead && todaysLogTime && (
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {patientName === 'them'
              ? `Today's check-in came in at ${todaysLogTime}.`
              : `${patientName}'s check-in came in at ${todaysLogTime}.`}
          </p>
        )}
      </header>

      <section className="mt-6 mx-4 rounded-3xl bg-card shadow-card p-6 animate-fade-up">
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

        {showHero && (
          <HeroAlertCard
            tone={tier === 'tier_3_48hr' ? 'watch' : 'alert'}
            triggers={triggers}
            weightSeries14d={weightSeries14d}
            weightBaselineLb={weightBaselineLb}
            cardiologistName={cardiologist ?? null}
            cardiologistPhone={cardiologistPhone ?? null}
            forceCall911={tier === 'tier_1_911'}
          />
        )}

        {logStatus === 'complete' && tier === null && (
          <div className="text-center py-2">
            <p className="text-sm text-muted-foreground">
              Log saved. Today&apos;s pattern read isn&apos;t available — tap below to add another note.
            </p>
          </div>
        )}

        {logStatus === 'complete' && tier === 'tier_4_log' && !coldStart && (
          <div className="text-center py-2">
            <p className="font-display text-2xl">Steady today.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Nothing pulling at your attention right now.
            </p>
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
                  ? "Processing today's log"
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

      {patient && showVitals && (
        <VitalsListCard
          supabase={supabase}
          patientId={patient.id}
          logDate={today}
          triggers={triggers}
          coldStart={coldStart}
          pillowBaseline={patient.normal_pillow_count ?? null}
        />
      )}

      {patient && showBaseline && baselineStartedAt && (
        <BaselineProgressCard
          daysLogged={Math.min(priorLogDayCount + 1, 7)}
          startedAt={baselineStartedAt}
          collecting={collecting}
        />
      )}

      {patient && (
        <TodaysMedsCard
          patientId={patient.id}
          tz={profile.timezone}
          date={today}
          patientName={patient.display_name}
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

async function getCollectingCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  patientId: string,
  today: string,
) {
  const start = isoDateOffset(today, -7);
  const [readings, events, logs] = await Promise.all([
    supabase
      .from('daily_log_readings')
      .select('log_date, field')
      .eq('patient_id', patientId)
      .eq('field', 'weight_lb')
      .gte('log_date', start)
      .lte('log_date', today),
    supabase
      .from('daily_log_symptom_events')
      .select('log_date, symptom, present')
      .eq('patient_id', patientId)
      .gte('log_date', start)
      .lte('log_date', today),
    supabase
      .from('daily_logs')
      .select('log_date, pillow_count')
      .eq('patient_id', patientId)
      .gte('log_date', start)
      .lte('log_date', today)
      .not('pillow_count', 'is', null),
  ]);

  const weightDays = new Set((readings.data ?? []).map((r) => r.log_date as string));
  const eventRows = (events.data ?? []) as { log_date: string; symptom: string; present: boolean }[];
  const swellingDays = new Set(eventRows.filter((r) => r.symptom === 'swelling').map((r) => r.log_date));
  const dyspneaDays = new Set(eventRows.filter((r) => r.symptom === 'dyspnea').map((r) => r.log_date));
  const coughDays = new Set(eventRows.filter((r) => r.symptom === 'cough').map((r) => r.log_date));
  const pillowDays = new Set((logs.data ?? []).map((r) => r.log_date as string));

  return [
    {
      key: 'weight',
      label: 'Weight',
      summary: weightDays.size > 0 ? `${weightDays.size} reading${weightDays.size === 1 ? '' : 's'}` : 'no readings yet',
      count: weightDays.size,
    },
    {
      key: 'swelling',
      label: 'Swelling',
      summary: swellingDays.size > 0 ? `${swellingDays.size} day${swellingDays.size === 1 ? '' : 's'} reported` : 'not reported yet',
      count: swellingDays.size,
    },
    {
      key: 'breathing',
      label: 'Breathing',
      summary: dyspneaDays.size > 0 ? `${dyspneaDays.size} day${dyspneaDays.size === 1 ? '' : 's'} reported` : 'not reported yet',
      count: dyspneaDays.size,
    },
    {
      key: 'pillows',
      label: 'Pillows',
      summary: pillowDays.size > 0 ? `${pillowDays.size} night${pillowDays.size === 1 ? '' : 's'} logged` : 'not logged yet',
      count: pillowDays.size,
    },
    {
      key: 'cough',
      label: 'Cough',
      summary: coughDays.size > 0 ? `${coughDays.size} day${coughDays.size === 1 ? '' : 's'} reported` : 'not reported yet',
      count: coughDays.size,
    },
  ];
}

function isoDateOffset(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function formatTime(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
}
