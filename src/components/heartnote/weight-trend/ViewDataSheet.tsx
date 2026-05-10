// Read-only chronological list of all weight readings. Slide-up sheet
// pattern matches AddWeightSheet. Most-recent first. Each row:
// "182.4 lb" + relative date/time string. Mount-on-open from the parent.
//
// This is the v1 stub of "View Data" — the user is going to share
// styling screenshots, at which point this gets refined (sort, filter,
// delete, export, etc).

'use client';

import type { WeightReading } from '@/lib/trends/weight-window';

interface Props {
  readings: WeightReading[]; // sorted ascending by recorded_at
  timezone: string;
  today: string;
  onClose: () => void;
}

export function ViewDataSheet({ readings, timezone, today, onClose }: Props) {
  // Most-recent first for the list.
  const reversed = [...readings].reverse();

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="View weight data"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: 'rgba(28, 28, 28, 0.32)' }}
      />

      <div
        className="relative w-full max-w-md rounded-t-3xl px-5 pt-3 pb-6 flex flex-col"
        style={{
          background: 'var(--card)',
          boxShadow: '0 -10px 30px rgba(28, 28, 28, 0.16)',
          maxHeight: '85vh',
        }}
      >
        <div
          aria-hidden
          className="mx-auto mb-3 flex-shrink-0"
          style={{
            width: 38,
            height: 5,
            borderRadius: 999,
            background: 'color-mix(in oklab, var(--ink) 22%, transparent)',
          }}
        />

        <div className="flex items-baseline justify-between mb-4 flex-shrink-0">
          <h2
            className="font-display text-[20px] text-foreground"
            style={{ letterSpacing: '-0.2px', fontWeight: 500 }}
          >
            All weights
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted-foreground active:text-foreground"
          >
            Done
          </button>
        </div>

        {readings.length === 0 ? (
          <p className="text-[14px] text-muted-foreground py-8 text-center">
            No readings yet.
          </p>
        ) : (
          <div
            className="flex-1 overflow-y-auto rounded-2xl"
            style={{
              background: 'var(--card)',
              border: '0.5px solid var(--border)',
            }}
          >
            {reversed.map((r, i) => (
              <div
                key={`${r.recorded_at}-${i}`}
                className="flex items-baseline justify-between"
                style={{
                  padding: '14px 16px',
                  borderBottom:
                    i < reversed.length - 1
                      ? '0.5px solid var(--border)'
                      : 'none',
                }}
              >
                <span
                  className="font-display text-foreground tabular-nums"
                  style={{
                    fontSize: 18,
                    fontWeight: 500,
                    letterSpacing: '-0.2px',
                  }}
                >
                  {r.value.toFixed(1)}
                  <span
                    className="text-muted-foreground"
                    style={{ fontSize: 12, fontWeight: 500, marginLeft: 4 }}
                  >
                    lb
                  </span>
                </span>
                <span className="text-[12px] text-muted-foreground tabular-nums">
                  {whenLabel(r, today, timezone)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function whenLabel(r: WeightReading, today: string, tz: string): string {
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(r.recorded_at));
  if (r.log_date === today) return `Today, ${time}`;
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    year:
      r.log_date.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
  }).format(new Date(r.recorded_at));
  return `${date}, ${time}`;
}
