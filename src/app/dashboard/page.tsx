import { redirect } from 'next/navigation';
import { Mic, TrendingUp, Users, CalendarHeart, Settings, Heart, ChevronRight, Loader2, Phone, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { StatusRing } from '@/components/heartnote/StatusRing';
import { TodaysMedsCard } from '@/components/heartnote/TodaysMedsCard';
import { COLD_START_MIN_LOG_DAYS } from '@/lib/clinical/thresholds';
import Link from 'next/link';

type TriggerRow = { rule_id: string; label: string; evidence: Record<string, unknown> };

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
    .select('id, display_name, relationship, dry_weight_lb, nyha_class, cardiologist_name, cardiologist_phone')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  const patientName = patient?.display_name ?? 'them';
  const cardiologist = patient?.cardiologist_name;
  const cardiologistPhone = patient?.cardiologist_phone;

  const today = getTodayInTimezone(profile.timezone);

  // Multiple daily_logs rows can exist for one (patient, log_date) since the
  // multi-readings migration. Pull the most recent for processing-status.
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

  // Phase 1 alert engine writes one row per (patient, log_date). Read it
  // straight — never recompute (per code-quality.md rule #3).
  const { data: assessment } = patient
    ? await supabase
        .from('daily_assessments')
        .select('tier, triggers, cold_start, evaluated_at')
        .eq('patient_id', patient.id)
        .eq('log_date', today)
        .maybeSingle()
    : { data: null };

  // Cold-start "N of 7 days logged" copy needs the count of distinct prior log days.
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

  const logStatus: 'none' | 'processing' | 'complete' =
    !todaysLog || todaysLog.processing_status === 'pending'
      ? 'none'
      : todaysLog.processing_status === 'complete'
        ? 'complete'
        : 'processing';

  const triggers = (assessment?.triggers as TriggerRow[] | null) ?? [];
  const tier = assessment?.tier ?? null;
  const coldStart = assessment?.cold_start === true;

  const tiles = [
    { to: '/trends', label: 'Trends', Icon: TrendingUp, tint: 'var(--status-good-soft)' },
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

        {logStatus === 'complete' && tier === 'tier_1_911' && (
          <AlertBlock
            tone="alert"
            heading="Call 911 now"
            sub="Severe sign logged today"
            triggers={triggers}
            phoneCta={{ label: 'Call 911', href: 'tel:911', intent: 'call' }}
          />
        )}

        {logStatus === 'complete' && tier === 'tier_2_today' && (
          <AlertBlock
            tone="alert"
            heading="Call cardiologist today"
            sub="Pattern worth a phone call"
            triggers={triggers}
            phoneCta={cardiologistCta(cardiologist, cardiologistPhone)}
          />
        )}

        {logStatus === 'complete' && tier === 'tier_3_48hr' && (
          <AlertBlock
            tone="watch"
            heading="Call cardiologist within 48 hours"
            sub="Worth flagging at the next call"
            triggers={triggers}
            phoneCta={cardiologistCta(cardiologist, cardiologistPhone)}
          />
        )}

        {logStatus === 'complete' && tier === 'tier_4_log' && coldStart && (
          <div className="flex flex-col items-center text-center py-4">
            <div
              className="h-16 w-16 rounded-full flex items-center justify-center"
              style={{ background: 'var(--secondary)', color: 'var(--bluegray)' }}
            >
              <Heart size={26} />
            </div>
            <p className="font-display text-2xl mt-3">Building baseline</p>
            <p className="text-sm text-muted-foreground mt-1">
              {priorLogDayCount + 1} of {COLD_START_MIN_LOG_DAYS} days logged. Patterns become
              visible after about a week.
            </p>
          </div>
        )}

        {logStatus === 'complete' && tier === 'tier_4_log' && !coldStart && (
          <StatusRing status="good" />
        )}

        {logStatus === 'complete' && tier === null && (
          <div className="text-center py-2">
            <p className="text-sm text-muted-foreground">
              Log saved. Today&apos;s pattern read isn&apos;t available — tap below to add another note.
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

      {patient && (
        <TodaysMedsCard patientId={patient.id} tz={profile.timezone} date={today} />
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

type PhoneCta = { label: string; href: string; intent: 'call' | 'fallback' };

function cardiologistCta(name: string | null | undefined, phone: string | null | undefined): PhoneCta {
  if (phone) {
    return { label: `Call ${name ?? 'cardiologist'}`, href: `tel:${phone}`, intent: 'call' };
  }
  return { label: 'Add cardiologist phone in Settings', href: '/me', intent: 'fallback' };
}

function AlertBlock({
  tone,
  heading,
  sub,
  triggers,
  phoneCta,
}: {
  tone: 'alert' | 'watch';
  heading: string;
  sub: string;
  triggers: TriggerRow[];
  phoneCta: PhoneCta | null;
}) {
  const ringVar = tone === 'alert' ? 'var(--status-alert)' : 'var(--status-watch)';
  const softVar = tone === 'alert' ? 'var(--status-alert-soft)' : 'var(--status-watch-soft)';
  const fgVar = tone === 'alert' ? 'var(--status-alert-foreground)' : 'var(--status-watch-foreground)';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div
          className="h-12 w-12 rounded-full flex items-center justify-center shrink-0"
          style={{ background: softVar, color: fgVar }}
        >
          <AlertTriangle size={22} />
        </div>
        <div className="min-w-0">
          <p className="font-display text-xl text-foreground leading-tight">{heading}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
        </div>
      </div>

      {triggers.length > 0 && (
        <ul className="rounded-2xl px-4 py-3 space-y-1.5" style={{ background: softVar }}>
          {triggers.map((t) => (
            <li key={t.rule_id} className="text-sm" style={{ color: fgVar }}>
              • {t.label}
            </li>
          ))}
        </ul>
      )}

      {phoneCta && phoneCta.intent === 'call' && (
        <a
          href={phoneCta.href}
          className="w-full flex items-center justify-center gap-2 rounded-full px-5 py-4 text-white font-semibold shadow-soft active:scale-[0.98] transition"
          style={{ background: ringVar }}
        >
          <Phone size={18} />
          {phoneCta.label}
        </a>
      )}
      {phoneCta && phoneCta.intent === 'fallback' && (
        <Link
          href={phoneCta.href}
          className="w-full flex items-center justify-center gap-2 rounded-full px-5 py-4 font-semibold border active:scale-[0.98] transition"
          style={{ borderColor: ringVar, color: fgVar }}
        >
          <Phone size={18} />
          {phoneCta.label}
        </Link>
      )}
    </div>
  );
}
