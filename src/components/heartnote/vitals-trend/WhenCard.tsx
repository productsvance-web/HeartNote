// Date + time card used by the add-reading sheets. Extracted so the
// single-value AddReadingSheet and the paired-value AddBpSheet share
// one input layout (and so date-only vitals like pillows can disable
// the time half without diverging the card).

'use client';

import { isoOffset } from '@/lib/dates/iso-offset';

interface Props {
  date: string;
  time: string;
  onDateChange: (next: string) => void;
  onTimeChange: (next: string) => void;
  timezone: string;
  minBackdateDays: number;
  // When true, render only the date input full-width. The time slot
  // is hidden; consumers stamp '12:00' at save time. Used by pillows
  // (per-night summary, no exact hour).
  dateOnly?: boolean;
}

export function WhenCard({
  date,
  time,
  onDateChange,
  onTimeChange,
  timezone,
  minBackdateDays,
  dateOnly = false,
}: Props) {
  const today = todayInTz(timezone);
  const minDate = isoOffset(today, -minBackdateDays);

  return (
    <section
      className="mt-3 rounded-3xl px-5 pt-4 pb-5"
      style={{
        background: 'var(--card)',
        border: '0.5px solid var(--border)',
        boxShadow:
          '0 1px 8px color-mix(in oklab, var(--sage) 6%, transparent)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--sage-deep)',
          }}
        />
        <span
          className="text-[15px] font-semibold text-foreground"
          style={{ letterSpacing: '-0.1px' }}
        >
          When
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          min={minDate}
          max={today}
          onChange={(e) => onDateChange(e.target.value)}
          aria-label="Date"
          className="flex-1 rounded-2xl px-3 py-2 text-base tabular-nums"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
            height: 40,
          }}
        />
        {!dateOnly && (
          <input
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            aria-label="Time"
            className="flex-1 rounded-2xl px-3 py-2 text-base tabular-nums"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
              height: 40,
            }}
          />
        )}
      </div>
    </section>
  );
}

function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
