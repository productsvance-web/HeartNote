import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Mic } from 'lucide-react';
import { requireOnboarded } from '@/lib/auth/require-onboarded';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { getSpo2Trend } from '@/lib/vitals/spo2';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { DailyBandsChart } from '@/components/heartnote/DailyBandsChart';

const WINDOW_DAYS = 14;

export default async function Spo2DetailPage() {
  await requireOnboarded();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single();
  if (!profile?.timezone) redirect('/onboarding');

  const { data: patient } = await supabase
    .from('patients')
    .select('id, display_name')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!patient) redirect('/onboarding');

  const today = getTodayInTimezone(profile.timezone);
  const trend = await getSpo2Trend(supabase, patient.id, today, WINDOW_DAYS);

  const hasData = trend.latest !== null;

  return (
    <PhoneShell>
      <header className="px-4 pt-6 flex items-center gap-2">
        <Link
          href="/dashboard"
          aria-label="Back to dashboard"
          className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/60"
        >
          <ChevronLeft size={20} />
        </Link>
        <h1 className="font-display text-xl text-foreground">SpO2</h1>
      </header>

      {hasData ? (
        <DataView
          trend={trend}
          today={today}
          patientName={patient.display_name}
        />
      ) : (
        <EmptyView patientName={patient.display_name} />
      )}
    </PhoneShell>
  );
}

function DataView({
  trend,
  today,
  patientName,
}: {
  trend: Awaited<ReturnType<typeof getSpo2Trend>>;
  today: string;
  patientName: string;
}) {
  const latest = trend.latest!;
  const footer =
    trend.daysLogged >= 3
      ? `${trend.daysLogged} of last ${WINDOW_DAYS} days logged.`
      : `${trend.daysLogged} ${trend.daysLogged === 1 ? 'reading' : 'readings'} in the last ${WINDOW_DAYS} days. Not enough to see a pattern yet.`;

  return (
    <>
      <section className="mt-6 mx-4 rounded-3xl bg-card shadow-card p-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {patientName}
        </p>
        <div className="mt-1 flex items-baseline gap-2">
          <p className="font-display text-5xl text-foreground">
            {Math.round(latest.value)}
            <span className="text-2xl text-muted-foreground ml-1">%</span>
          </p>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {formatLatestStamp(latest.recorded_at, today, latest.log_date)}
        </p>

        <div className="mt-5">
          <DailyBandsChart
            days={trend.days}
            todayLogDate={today}
            width={360}
            height={200}
            showAxes
          />
        </div>

        <p className="text-xs text-muted-foreground mt-4">{footer}</p>
      </section>
    </>
  );
}

function EmptyView({ patientName }: { patientName: string }) {
  return (
    <section className="mt-8 mx-4 rounded-3xl bg-card shadow-card p-6 text-center">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {patientName}
      </p>
      <p className="font-display text-2xl text-foreground mt-3">
        No SpO2 readings yet.
      </p>
      <p className="text-sm text-muted-foreground mt-2">
        Mention oxygen or SpO2 in a voice log and it&apos;ll show up here.
      </p>
      <Link
        href="/log"
        className="mt-6 w-full flex items-center justify-center gap-3 rounded-full px-6 py-4 text-primary-foreground font-semibold shadow-soft active:scale-[0.98] transition"
        style={{
          background:
            'linear-gradient(135deg, var(--sage), color-mix(in oklab, var(--sage) 70%, white))',
        }}
      >
        <Mic size={20} />
        Start a voice log
      </Link>
    </section>
  );
}

// "Logged today at 7:42 AM" / "Logged yesterday at 9:15 PM" / "Logged May 1"
function formatLatestStamp(
  recordedAt: string,
  todayLogDate: string,
  logDate: string,
): string {
  const time = new Date(recordedAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (logDate === todayLogDate) return `Logged today at ${time}`;
  const diff = daysBetween(logDate, todayLogDate);
  if (diff === 1) return `Logged yesterday at ${time}`;
  const date = new Date(`${logDate}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `Logged ${date} at ${time}`;
}

function daysBetween(earlier: string, later: string): number {
  const [y1, m1, d1] = earlier.split('-').map(Number);
  const [y2, m2, d2] = later.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}
