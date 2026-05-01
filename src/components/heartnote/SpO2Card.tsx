import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import {
  DailyBandsChart,
  type DailyBandsDay,
} from './DailyBandsChart';

interface Props {
  // Last 7 days, oldest → newest, today is the last entry.
  days: DailyBandsDay[];
  todayLogDate: string;
  // Most recent reading (any time within the dashboard's 30-day window).
  // The dashboard hides the card entirely when this is null, so the card
  // never has to render an empty state.
  latestValue: number;
  latestLogDate: string;
}

export function SpO2Card({ days, todayLogDate, latestValue, latestLogDate }: Props) {
  return (
    <Link
      href="/trends/spo2"
      className="mx-4 mt-5 block rounded-3xl bg-card shadow-card p-5 active:scale-[0.99] transition"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          SpO2
        </p>
        <ChevronRight size={16} className="text-muted-foreground" />
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <p className="font-display text-3xl text-foreground">
          {Math.round(latestValue)}
          <span className="text-base text-muted-foreground ml-0.5">%</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {relativeDayLabel(latestLogDate, todayLogDate)}
        </p>
      </div>

      <div className="mt-3">
        <DailyBandsChart
          days={days}
          todayLogDate={todayLogDate}
          width={320}
          height={56}
        />
      </div>
    </Link>
  );
}

// "Logged today" / "Logged yesterday" / "Logged Nd ago"
function relativeDayLabel(logDate: string, todayLogDate: string): string {
  if (logDate === todayLogDate) return 'Logged today';
  const diff = daysBetween(logDate, todayLogDate);
  if (diff === 1) return 'Logged yesterday';
  return `Logged ${diff}d ago`;
}

function daysBetween(earlier: string, later: string): number {
  const [y1, m1, d1] = earlier.split('-').map(Number);
  const [y2, m2, d2] = later.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}
