// BaselineProgressCard — shown on the home screen during the first
// 7 banked logs. Replaces the production "Building baseline · 1 of 7"
// text block with a 7-dot bank-of-7 progress track + a 5-row "What
// we're learning" list, both designed so days 1–7 feel like progress
// instead of a paywall.
//
// Plain-English: when mom is brand-new to HeartNote, the home screen
// can't say "today is a watch day" yet — there's no baseline to compare
// against. So instead we say: we're learning what normal looks like, and
// after 7 mornings we can tell you when something's different.
//
// Why the calendar math is honest, not index-driven:
// each dot represents one banked logged-morning, and its date label is
// the actual date that bank happened. When a caregiver skipped a day,
// the gap is encoded in the date labels (e.g., dot 1 = May 1, dot 2 =
// May 4 — the missing May 2 / May 3 simply never made it into the bank).
// The today pulse sits on the next-up slot and is labeled with today's
// real date.

import { COLD_START_MIN_LOG_DAYS } from '@/lib/clinical/thresholds';

interface CollectingRow {
  key: string;
  label: string;
  summary: string;
  count: number;
}

interface Props {
  loggedDates: string[]; // sorted ascending, distinct ISO YYYY-MM-DD; includes today only if today has a complete log
  today: string; // ISO YYYY-MM-DD in caregiver TZ
  startedAt: string; // ISO YYYY-MM-DD — first daily_logs.log_date, or today if none
  collecting: CollectingRow[];
}

export function BaselineProgressCard({ loggedDates, today, startedAt, collecting }: Props) {
  const totalDays = COLD_START_MIN_LOG_DAYS;
  const todayLogged = loggedDates.includes(today);
  // The "banked" mornings are everything we count as fully complete.
  // Today's bank only exists if today is in loggedDates.
  const banked = todayLogged ? loggedDates.slice(0, -1) : loggedDates;
  const daysBanked = banked.length;
  // Today's slot is right after the banked ones, capped at 7.
  const todayPosition = Math.min(daysBanked + 1, totalDays);
  // The headline / footer count includes today only when it's complete —
  // matches the eyebrow (we say "day N of 7" where N is the morning we
  // are currently working on, with today included after it banks).
  const morningsForCopy = todayLogged ? loggedDates.length : daysBanked + 1;
  const remaining = Math.max(0, totalDays - (todayLogged ? loggedDates.length : daysBanked));

  // Build 7 dot descriptors. Position 1..7 is 1-indexed in the JSX but we
  // store as 0..6 here.
  const dots = Array.from({ length: totalDays }, (_, i) => {
    const position = i + 1;
    if (position < todayPosition) {
      // Banked morning. Date label is the actual date that bank happened.
      return {
        date: banked[i] ?? today,
        state: 'done' as const,
      };
    }
    if (position === todayPosition) {
      return { date: today, state: 'today' as const };
    }
    // Future slot — labeled with a forward calendar projection, so the
    // caregiver can see roughly when day-7 lands if they log every
    // morning from now. Honest about being a projection because the
    // dot is dashed (we don't promise this date will fill).
    return {
      date: isoDateOffset(today, position - todayPosition),
      state: 'future' as const,
    };
  });

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
            Setup · day {Math.min(morningsForCopy, totalDays)} of {totalDays}
          </p>
          <p className="text-[11px] tabular-nums text-muted-foreground">
            started {prettyDate(startedAt)}
          </p>
        </div>

        <ProgressTrack dots={dots} todayPosition={todayPosition} />

        <div
          className="mt-4 pt-3"
          style={{ borderTop: '0.5px solid color-mix(in oklab, var(--sage) 22%, transparent)' }}
        >
          <p
            className="font-display text-[17px] font-medium text-foreground leading-snug"
            style={{ letterSpacing: '-0.015em' }}
          >
            {headlineFor(todayLogged ? loggedDates.length : daysBanked, totalDays)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {remaining === 0
              ? 'Today completes the baseline.'
              : `${remaining} more morning${remaining === 1 ? '' : 's'} to go.`}
          </p>
        </div>
      </div>

      <div className="flex items-baseline justify-between px-1.5">
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          What we&rsquo;re learning
        </p>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {daysBanked} morning{daysBanked === 1 ? '' : 's'} logged
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

interface DotDesc {
  date: string;
  state: 'done' | 'today' | 'future';
}

function ProgressTrack({
  dots,
  todayPosition,
}: {
  dots: DotDesc[];
  todayPosition: number;
}) {
  // Gradient bar fills up to today's position.
  const filledFraction =
    todayPosition <= 1 ? 0 : ((todayPosition - 1) / (dots.length - 1)) * 100;

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
        {dots.map((dot, i) => {
          const isDone = dot.state === 'done';
          const isToday = dot.state === 'today';
          const dayLetter = dayLetterFor(dot.date);
          const dayOfMonth = Number(dot.date.slice(8, 10));
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
                  color: dot.state === 'future' ? 'var(--muted-foreground)' : 'var(--foreground)',
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
  if (daysLogged <= 1) return "We're starting to learn what normal looks like.";
  if (daysLogged === 2) return 'Two mornings in. Five to go.';
  if (daysLogged === 3) return 'Three mornings in. Four to go.';
  if (daysLogged === 4 || daysLogged === 5)
    return `Almost there — ${remaining} morning${remaining === 1 ? '' : 's'} to go.`;
  return 'One more morning to go.';
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
