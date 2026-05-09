import { redirect } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { TodaysMedsCard } from '@/components/heartnote/TodaysMedsCard';
import { HeroAlertCard } from '@/components/heartnote/HeroAlertCard';
import { VitalsListCard } from '@/components/heartnote/VitalsListCard';
import { BaselineProgressCard } from '@/components/heartnote/BaselineProgressCard';
import { BaselineLogPrompt } from '@/components/heartnote/BaselineLogPrompt';
import { HomeAffirmationCard } from '@/components/heartnote/HomeAffirmationCard';
import { countWord } from '@/lib/format/count';
import type { TriggerRow } from '@/lib/vitals/per-vital-tier';
import { getTodaySnapshot } from '@/lib/vitals/today-snapshot';
import { getBaselineContext } from '@/lib/vitals/baseline-context';
import { COLD_START_MIN_LOG_DAYS, ROLLING_BASELINE_DAYS } from '@/lib/clinical/thresholds';
import { formatHeaderEyebrow } from '@/lib/dates/format';
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
  const patientInitial = (patient?.display_name?.trim()[0] ?? '?').toUpperCase();
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

  // Latest LLM-generated reasoning for today's actionable alert (v0.5).
  // The engine writes a row each time it fires a non-tier-4 assessment;
  // we read the most recent for today. Null when no reasoning has been
  // generated yet (e.g. tier_4 day, or the Anthropic call failed and
  // returned null).
  const { data: latestAlertToday } = patient
    ? await supabase
        .from('alerts')
        .select('ai_reasoning')
        .eq('patient_id', patient.id)
        .gte('created_at', `${today}T00:00:00`)
        .lte('created_at', `${today}T23:59:59`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const aiReasoning = latestAlertToday?.ai_reasoning ?? null;

  const triggers = (assessment?.triggers as TriggerRow[] | null) ?? [];
  const tier = assessment?.tier ?? null;
  const coldStart = assessment?.cold_start === true;
  const isAlertHeader = tier === 'tier_1_911' || tier === 'tier_2_today' || tier === 'tier_3_48hr';

  const logStatus: 'none' | 'processing' | 'complete' =
    !todaysLog || todaysLog.processing_status === 'pending'
      ? 'none'
      : todaysLog.processing_status === 'complete'
        ? 'complete'
        : 'processing';

  const todaysLogTime = todaysLog?.created_at
    ? formatTime(todaysLog.created_at, profile.timezone)
    : null;

  // Cold-start branch — distinct layout (matches design-system Baseline Setup
  // page). No tier UI, no central card; just progress + collecting list.
  // Cold-start is decided by the engine's verdict on today's log; if no
  // assessment exists yet today, fall back to a heuristic based on the
  // count of distinct prior days in the last 14.
  const baselineWindow = patient
    ? await getBaselineWindow(supabase, patient.id, today)
    : { firstLoggedDate: null as string | null, loggedDates: [] as string[] };
  const priorLogDays = baselineWindow.loggedDates.filter((d) => d !== today);
  // What we pass to the card: prior dates plus today, but only count today
  // when its log has fully processed. A pending-today log shouldn't show
  // as a banked morning.
  const loggedDatesForCard =
    logStatus === 'complete' ? [...priorLogDays, today] : priorLogDays;
  const inColdStart =
    patient !== null &&
    (coldStart === true ||
      // No assessment yet today AND fewer than 7 distinct prior log days.
      (assessment === null && priorLogDays.length < 7));

  if (patient && inColdStart) {
    const collecting = await getCollectingCounts(supabase, patient.id, today);
    const todayBanked =
      logStatus === 'complete' && loggedDatesForCard.includes(today)
        ? loggedDatesForCard.length
        : 0;
    const coldStartSubhead =
      logStatus === 'complete' && todaysLogTime !== null && todayBanked > 0
        ? `${patientName === 'them' ? "Today's" : `${patientName}'s`} check-in came in at ${todaysLogTime}. Day ${Math.min(todayBanked, COLD_START_MIN_LOG_DAYS)} of ${COLD_START_MIN_LOG_DAYS}.`
        : 'Days 1–7 are just data. After seven mornings, we can flag the day something feels different.';
    return (
      <PhoneShell>
        <header className="px-6 pt-8 relative">
          <PatientInitialAvatar initial={patientInitial} />
          <p
            className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground pr-16"
            style={{ letterSpacing: '0.06em' }}
          >
            {formatHeaderEyebrow(today, profile.timezone)}
          </p>
          <h1 className="font-display text-3xl text-foreground mt-1 leading-tight pr-16">
            {greet()}, {profile?.display_name ?? 'there'}.
          </h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{coldStartSubhead}</p>
        </header>

        <BaselineProgressCard
          loggedDates={loggedDatesForCard}
          today={today}
          firstLoggedDate={baselineWindow.firstLoggedDate}
          collecting={collecting}
        />

        <BaselineLogPrompt
          alreadyLoggedToday={logStatus === 'complete'}
          processing={logStatus === 'processing'}
        />
      </PhoneShell>
    );
  }

  // Non-cold-start branch.
  const willShowVitals =
    patient !== null && logStatus === 'complete' && tier !== null;
  const snapshot = willShowVitals
    ? await getTodaySnapshot(supabase, patient!.id, today)
    : null;
  const baseline =
    willShowVitals && snapshot
      ? await getBaselineContext(
          supabase,
          patient!.id,
          today,
          coldStart,
          patient!.normal_pillow_count ?? null,
        )
      : null;

  // Weight series for HeroAlert spark — fetched only when alert is rendering.
  let weightSeries14d: { d: string; v: number }[] | null = null;
  let weightBaselineLb: number | null = null;
  if (patient && isAlertHeader && triggers.length > 0) {
    const lookback = isoDateOffset(today, -14);
    const { data: weightRows } = await supabase
      .from('daily_log_readings')
      .select('log_date, value, recorded_at')
      .eq('patient_id', patient.id)
      .eq('field', 'weight_lb')
      .gte('log_date', lookback)
      .order('recorded_at', { ascending: true });
    if (weightRows && weightRows.length >= 2) {
      const byDay = new Map<string, number>();
      for (const r of weightRows) byDay.set(r.log_date as string, Number(r.value));
      weightSeries14d = Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, v]) => ({ d, v }));
      const sevenDaysAgo = isoDateOffset(today, -ROLLING_BASELINE_DAYS);
      weightBaselineLb =
        weightSeries14d.find((p) => p.d <= sevenDaysAgo)?.v ?? weightSeries14d[0].v;
    }
  }

  const showVitals = willShowVitals && snapshot !== null && baseline !== null;
  const showHero = patient !== null && logStatus === 'complete' && isAlertHeader;
  const showSubhead = logStatus === 'complete' && (showVitals || showHero) && todaysLogTime !== null;
  // Affirmation card replaces the silent gap on green days. Gates: log
  // complete, snapshot loaded, engine ran (tier !== null), nothing flagged.
  // Mutually exclusive with showHero.
  const showAffirmation = showVitals && triggers.length === 0 && !showHero;

  return (
    <PhoneShell>
      <header className="px-6 pt-8 relative">
        <PatientInitialAvatar initial={patientInitial} />
        <p
          className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground pr-16"
          style={{ letterSpacing: '0.06em' }}
        >
          {formatHeaderEyebrow(today, profile.timezone)}
        </p>
        <h1 className="font-display text-3xl text-foreground mt-1 pr-16">
          {greet()}, {profile?.display_name ?? 'there'}.
        </h1>
        {showSubhead && (
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            {patientName === 'them'
              ? `Today's check-in came in at ${todaysLogTime}.`
              : `${patientName}'s check-in came in at ${todaysLogTime}.`}
            {triggers.length > 0 && (
              <>
                {' '}
                <span className="text-foreground font-medium">
                  {countWord(triggers.length)} thing{triggers.length === 1 ? '' : 's'} changed today.
                </span>
              </>
            )}
          </p>
        )}
      </header>

      {showHero && (
        <section className="mt-5 mx-4 rounded-3xl bg-card shadow-card p-5 animate-fade-up">
          <HeroAlertCard
            tone={tier === 'tier_3_48hr' ? 'watch' : 'alert'}
            triggers={triggers}
            aiReasoning={aiReasoning}
            weightSeries14d={weightSeries14d}
            weightBaselineLb={weightBaselineLb}
            cardiologistName={cardiologist ?? null}
            cardiologistPhone={cardiologistPhone ?? null}
            forceCall911={tier === 'tier_1_911'}
          />
        </section>
      )}

      {logStatus === 'processing' && (
        <section className="mt-5 mx-4 rounded-3xl bg-card shadow-card p-6 animate-fade-up">
          <div className="flex flex-col items-center gap-3 py-2">
            <div
              className="h-16 w-16 rounded-full flex items-center justify-center animate-pulse-ring"
              style={{ background: 'var(--status-good-soft)', color: 'var(--status-good-foreground)' }}
            >
              <Loader2 size={26} className="animate-spin" />
            </div>
            <p className="font-display text-lg">Listening to today&rsquo;s log…</p>
            <p className="text-xs text-muted-foreground">This usually takes a few seconds.</p>
          </div>
        </section>
      )}

      {logStatus === 'none' && !showHero && (
        <section className="mt-5 mx-4 rounded-3xl bg-card shadow-card p-6 animate-fade-up text-center">
          <p className="font-display text-2xl text-foreground">No check-in yet today.</p>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Tap the mic to dictate a 30-second update — sleep, weight, swelling, breath, or anything
            that feels off.
          </p>
        </section>
      )}

      {logStatus === 'complete' && tier === null && !showHero && (
        <section className="mt-5 mx-4 rounded-3xl bg-card shadow-card p-6 animate-fade-up text-center">
          <p className="text-sm text-muted-foreground">
            Log saved. Today&rsquo;s pattern read isn&rsquo;t available — tap the mic to add another
            note.
          </p>
        </section>
      )}

      {showAffirmation && snapshot && <HomeAffirmationCard snapshot={snapshot} />}

      {showVitals && snapshot && baseline && (
        <VitalsListCard snapshot={snapshot} baseline={baseline} triggers={triggers} />
      )}

      {patient && (
        <TodaysMedsCard
          patientId={patient.id}
          tz={profile.timezone}
          date={today}
          patientName={patient.display_name}
        />
      )}

      {patient && (await getUpcomingVisitChip(supabase, patient.id, today))}

      <Link
        href="/trends"
        className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">See the last two weeks.</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Weight, sleep, symptoms — patterns to bring to cardiology.
          </p>
        </div>
        <span className="text-xs font-medium" style={{ color: 'var(--accent-foreground)' }}>
          Trends →
        </span>
      </Link>
    </PhoneShell>
  );
}

// Single query that supplies both pieces the cold-start branch needs:
// every distinct logged date in the last 14 days (drives the 7-dot track
// and the cold-start gate) and the patient's first-ever logged date (so
// the "started May 5" eyebrow reads correctly even for caregivers who
// started > 14 days ago).
async function getBaselineWindow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  patientId: string,
  today: string,
): Promise<{ firstLoggedDate: string | null; loggedDates: string[] }> {
  const lookback = isoDateOffset(today, -14);
  const [windowQ, firstQ] = await Promise.all([
    supabase
      .from('daily_logs')
      .select('log_date')
      .eq('patient_id', patientId)
      .gte('log_date', lookback)
      .lte('log_date', today),
    supabase
      .from('daily_logs')
      .select('log_date')
      .eq('patient_id', patientId)
      .order('log_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  const loggedDates = Array.from(
    new Set((windowQ.data ?? []).map((r) => r.log_date as string)),
  ).sort();
  const firstLoggedDate = (firstQ.data?.log_date as string | undefined) ?? null;
  return { firstLoggedDate, loggedDates };
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
      summary:
        weightDays.size > 0
          ? `${weightDays.size} reading${weightDays.size === 1 ? '' : 's'}`
          : 'no readings yet',
      count: weightDays.size,
    },
    {
      key: 'swelling',
      label: 'Swelling',
      summary:
        swellingDays.size > 0
          ? `${swellingDays.size} day${swellingDays.size === 1 ? '' : 's'} reported`
          : 'not reported yet',
      count: swellingDays.size,
    },
    {
      key: 'breathing',
      label: 'Breathing',
      summary:
        dyspneaDays.size > 0
          ? `${dyspneaDays.size} day${dyspneaDays.size === 1 ? '' : 's'} reported`
          : 'not reported yet',
      count: dyspneaDays.size,
    },
    {
      key: 'pillows',
      label: 'Pillows',
      summary:
        pillowDays.size > 0
          ? `${pillowDays.size} night${pillowDays.size === 1 ? '' : 's'} logged`
          : 'not logged yet',
      count: pillowDays.size,
    },
    {
      key: 'cough',
      label: 'Cough',
      summary:
        coughDays.size > 0
          ? `${coughDays.size} day${coughDays.size === 1 ? '' : 's'} reported`
          : 'not reported yet',
      count: coughDays.size,
    },
  ];
}

// Surfaces an upcoming cardiology visit on the home screen when one is
// scheduled within the next 14 days. Renders nothing when no upcoming
// visit exists or when the next visit is more than 14 days out — beyond
// that, the home screen doesn't need to be a daily reminder.
async function getUpcomingVisitChip(
  supabase: Awaited<ReturnType<typeof createClient>>,
  patientId: string,
  today: string,
) {
  const horizon = isoDateOffset(today, 14);
  const { data } = await supabase
    .from('cardiology_visits')
    .select('id, visit_date, cardiologist_name, visit_kind')
    .eq('patient_id', patientId)
    .gte('visit_date', today)
    .lte('visit_date', horizon)
    .order('visit_date', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const daysOut = daysBetween(today, data.visit_date);
  const sub =
    daysOut === 0
      ? 'Today'
      : daysOut === 1
        ? 'Tomorrow'
        : `In ${daysOut} days`;

  return (
    <Link
      href={`/visits/${data.id}`}
      className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">
          Cardiology · {prettyDateLong(data.visit_date)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {sub} · {data.cardiologist_name ?? 'open the handoff'}
        </p>
      </div>
      <span className="text-xs font-medium" style={{ color: 'var(--accent-foreground)' }}>
        Open →
      </span>
    </Link>
  );
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

const MONTH_ABBR_DASH = [
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

function prettyDateLong(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${MONTH_ABBR_DASH[d.getUTCMonth()]} ${d.getUTCDate()}`;
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

// Sage-tinted patient initial bubble in the header's top-right corner.
function PatientInitialAvatar({ initial }: { initial: string }) {
  return (
    <span
      aria-hidden
      className="absolute right-6 top-8 h-[38px] w-[38px] rounded-full flex items-center justify-center font-display text-base font-medium"
      style={{
        background: 'color-mix(in oklab, var(--sage) 20%, var(--cream))',
        border: '1px solid color-mix(in oklab, var(--sage) 35%, transparent)',
        color: 'var(--accent-foreground)',
        letterSpacing: '-0.01em',
      }}
    >
      {initial}
    </span>
  );
}

