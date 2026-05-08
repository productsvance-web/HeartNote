// BaselineProgressCard — shown on the home screen during the first
// 7 days of logging. Replaces the production "Building baseline · 1 of 7
// days logged" text block with a 7-dot progress track + a 5-row
// "What we're learning" list, both designed so days 1–7 feel like
// progress instead of a paywall.
//
// Plain-English: when mom is brand-new to HeartNote, the home screen
// can't say "today is a watch day" yet — there's no baseline to compare
// against. So instead we say: we're learning what normal looks like, and
// after 7 mornings we can tell you when something's different.

import { COLD_START_MIN_LOG_DAYS } from '@/lib/clinical/thresholds';

interface CollectingRow {
  key: string;
  label: string;
  summary: string;
  count: number;
}

interface Props {
  daysLogged: number; // 1..7 inclusive
  startedAt: string; // ISO date YYYY-MM-DD
  collecting: CollectingRow[];
}

export function BaselineProgressCard({ daysLogged, startedAt, collecting }: Props) {
  const totalDays = COLD_START_MIN_LOG_DAYS;
  const dotsLeft = Math.max(0, totalDays - daysLogged);
  const finishDate = isoDateOffset(startedAt, totalDays - 1);
  return (
    <section className="mx-4 mt-5 flex flex-col gap-4">
      <div
        className="rounded-3xl p-5"
        style={{
          background: 'color-mix(in oklab, var(--sage) 11%, var(--card))',
          border: '1px solid color-mix(in oklab, var(--sage) 28%, transparent)',
          boxShadow: '0 2px 16px -8px color-mix(in oklab, var(--sage) 38%, transparent)',
        }}
      >
        <div className="flex items-baseline justify-between mb-4">
          <p
            className="text-[10.5px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--accent-foreground)' }}
          >
            Setup · day {daysLogged} of {totalDays}
          </p>
          <p className="text-[11px] tabular-nums text-muted-foreground">
            started {prettyDate(startedAt)}
          </p>
        </div>

        <ProgressTrack daysLogged={daysLogged} totalDays={totalDays} startedAt={startedAt} />

        <div
          className="mt-4 pt-3"
          style={{ borderTop: '0.5px solid color-mix(in oklab, var(--sage) 22%, transparent)' }}
        >
          <p
            className="font-display text-[17px] font-medium text-foreground leading-snug"
            style={{ letterSpacing: '-0.015em' }}
          >
            {headlineFor(daysLogged, totalDays)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {dotsLeft === 0
              ? `Today completes the baseline.`
              : `${dotsLeft} more morning${dotsLeft === 1 ? '' : 's'} · ${prettyDate(finishDate)}`}
          </p>
        </div>
      </div>

      <div className="flex items-baseline justify-between px-1.5">
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          What we&rsquo;re learning
        </p>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {daysLogged} morning{daysLogged === 1 ? '' : 's'} logged
        </p>
      </div>

      <div className="rounded-3xl bg-card border border-border shadow-card overflow-hidden">
        {collecting.map((row, i) => (
          <CollectingRowView key={row.key} row={row} isLast={i === collecting.length - 1} />
        ))}
      </div>
    </section>
  );
}

function ProgressTrack({
  daysLogged,
  totalDays,
  startedAt,
}: {
  daysLogged: number;
  totalDays: number;
  startedAt: string;
}) {
  const filledFraction =
    daysLogged <= 1
      ? 0
      : daysLogged >= totalDays
        ? 100
        : ((daysLogged - 1) / (totalDays - 1)) * 100;

  return (
    <div className="relative px-0.5">
      <div
        className="absolute h-0.5 rounded-full"
        style={{
          top: 13,
          left: 17,
          right: 17,
          background: `linear-gradient(to right,
            var(--sage) 0%,
            var(--sage) ${filledFraction}%,
            color-mix(in oklab, var(--sage) 22%, transparent) ${filledFraction}%,
            color-mix(in oklab, var(--sage) 22%, transparent) 100%)`,
        }}
      />
      <div className="relative flex justify-between items-start">
        {Array.from({ length: totalDays }).map((_, i) => {
          const dayNum = i + 1;
          const date = isoDateOffset(startedAt, i);
          const isDone = dayNum < daysLogged;
          const isToday = dayNum === daysLogged;
          const dayLetter = dayLetterFor(date);
          const dayOfMonth = Number(date.slice(8, 10));
          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div
                className="rounded-full flex items-center justify-center relative"
                style={{
                  width: isToday ? 30 : 26,
                  height: isToday ? 30 : 26,
                  marginTop: isToday ? -2 : 0,
                  background: isDone ? 'var(--sage)' : 'var(--card)',
                  border: isDone
                    ? 'none'
                    : isToday
                      ? '2.5px solid var(--sage)'
                      : '1.5px dashed color-mix(in oklab, var(--sage) 38%, transparent)',
                  boxShadow: isToday
                    ? '0 0 0 5px color-mix(in oklab, var(--sage) 16%, transparent)'
                    : 'none',
                }}
              >
                {isDone && (
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2.5 6.2l2.4 2.4 4.6-5"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
                {isToday && (
                  <span
                    className="rounded-full animate-pulse-ring"
                    style={{ width: 9, height: 9, background: 'var(--sage)' }}
                  />
                )}
              </div>
              <p
                className="text-[10px] font-semibold tabular-nums"
                style={{
                  color: dayNum > daysLogged ? 'var(--muted-foreground)' : 'var(--foreground)',
                }}
              >
                {dayLetter}
              </p>
              <p className="text-[9.5px] tabular-nums text-muted-foreground -mt-0.5">{dayOfMonth}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CollectingRowView({ row, isLast }: { row: CollectingRow; isLast: boolean }) {
  const has = row.count > 0;
  return (
    <div
      className="flex items-center gap-3 px-5 py-3"
      style={{
        minHeight: 50,
        borderBottom: isLast
          ? 'none'
          : '0.5px solid color-mix(in oklab, var(--border) 80%, transparent)',
      }}
    >
      <span
        className="rounded-full shrink-0"
        style={{
          width: 9,
          height: 9,
          background: has ? 'var(--sage)' : 'transparent',
          border: has
            ? 'none'
            : '1.5px dashed color-mix(in oklab, var(--sage) 40%, transparent)',
        }}
      />
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium text-foreground"
          style={{ letterSpacing: '-0.005em' }}
        >
          {row.label}
        </p>
        <p className="text-[11.5px] tabular-nums text-muted-foreground mt-0.5">{row.summary}</p>
      </div>
      <span
        className="text-[10.5px] font-semibold tabular-nums px-2 py-0.5 rounded-full"
        style={{
          color: 'var(--accent-foreground)',
          background: has
            ? 'color-mix(in oklab, var(--sage) 14%, var(--cream))'
            : 'var(--muted)',
          letterSpacing: '0.02em',
        }}
      >
        {row.count}/7
      </span>
    </div>
  );
}

function headlineFor(daysLogged: number, totalDays: number): string {
  if (daysLogged >= totalDays) return 'Today completes the baseline.';
  const remaining = totalDays - daysLogged;
  if (daysLogged === 1) return "We're starting to learn what normal looks like.";
  if (daysLogged === 2) return 'Two mornings in. Five to go.';
  if (daysLogged === 3) return 'Three mornings in. Four to go.';
  if (daysLogged === 4 || daysLogged === 5)
    return `Almost there — ${remaining} morning${remaining === 1 ? '' : 's'} to go.`;
  return `One more morning to go.`;
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function dayLetterFor(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return DAY_LETTERS[d.getUTCDay()];
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

function isoDateOffset(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
