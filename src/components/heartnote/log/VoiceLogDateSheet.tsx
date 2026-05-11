// Bottom sheet that asks "When is this voice log for?" before a recording
// starts. Two-mode UI:
//
//   1. "Today" — primary CTA. One tap closes the sheet and starts the
//      recording for today's local date.
//
//   2. "Another day" — reveals a date picker (defaulted to today, max =
//      today, min = MAX_BACKDATE_DAYS ago) plus a "Start recording" CTA.
//      Confirming closes the sheet and starts the recording for the
//      chosen date.
//
// Time is intentionally NOT a picker. The recording happens now; the
// chosen date is what's attributed to log_date. If time-precise
// backdating is needed later (e.g., "this is for yesterday's morning
// check"), that's a separate column on daily_logs and a follow-up.
//
// The sheet is bottom-anchored, mount-on-open, and matches the
// AddReadingSheet visual register (drag handle, Cancel link top-right,
// rounded card sections, sage-deep CTA pill).

'use client';

import { useState } from 'react';
import { isoOffset } from '@/lib/dates/iso-offset';
import { MAX_BACKDATE_DAYS } from '@/lib/dates/backdate-window';

interface Props {
  open: boolean;
  // YYYY-MM-DD in the patient's timezone — used as the picker's default,
  // ceiling, and the "Today" button's target date.
  todayLocal: string;
  onCancel: () => void;
  // logDate is YYYY-MM-DD in patient-local time. Caller wires it to
  // flushAndStartVoice as the new daily_logs row's log_date.
  onConfirm: (logDate: string) => void;
}

export function VoiceLogDateSheet({
  open,
  todayLocal,
  onCancel,
  onConfirm,
}: Props) {
  const [mode, setMode] = useState<'choose' | 'pick'>('choose');
  const [date, setDate] = useState<string>(todayLocal);

  if (!open) return null;

  const minDate = isoOffset(todayLocal, -MAX_BACKDATE_DAYS);
  const isFuture = date > todayLocal;
  const isTooOld = date < minDate;
  const canStart = !isFuture && !isTooOld;

  const handleStartToday = () => {
    onConfirm(todayLocal);
  };
  const handleStartPicked = () => {
    if (!canStart) return;
    onConfirm(date);
  };
  const handleCancel = () => {
    setMode('choose');
    setDate(todayLocal);
    onCancel();
  };

  const dateLabel = formatHumanDate(date);
  const todayLabel = formatHumanDate(todayLocal);

  return (
    <div
      // z-60 sits above the bottom-pinned LogComposer (z-50) so the sheet
      // and its backdrop fully cover the mic button while choosing a date.
      // Matches SymptomsModal and AlertGlow's z-stack.
      className="fixed inset-0 z-[60] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Choose voice log date"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={handleCancel}
        className="absolute inset-0"
        style={{ background: 'rgba(28, 28, 28, 0.32)' }}
      />

      <div
        className="relative w-full max-w-md rounded-t-3xl px-5 pt-3 pb-6"
        style={{
          background: 'var(--card)',
          boxShadow: '0 -10px 30px rgba(28, 28, 28, 0.16)',
        }}
      >
        <div
          aria-hidden
          className="mx-auto mb-3"
          style={{
            width: 38,
            height: 5,
            borderRadius: 999,
            background: 'color-mix(in oklab, var(--ink) 22%, transparent)',
          }}
        />

        <div className="flex items-baseline justify-between mb-4">
          <h2
            className="font-display text-[20px] text-foreground"
            style={{ letterSpacing: '-0.2px', fontWeight: 500 }}
          >
            When is this voice log for?
          </h2>
          <button
            type="button"
            onClick={handleCancel}
            className="text-sm text-muted-foreground active:text-foreground"
          >
            Cancel
          </button>
        </div>

        {/* Two-button choice. "Today" is the prominent default-path. */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleStartToday}
            className="text-left rounded-2xl px-5 py-4 transition active:scale-[0.99]"
            style={{
              background: 'var(--sage-deep)',
              color: 'var(--card)',
              boxShadow:
                '0 4px 14px color-mix(in oklab, var(--sage-deep) 25%, transparent)',
            }}
          >
            <div className="text-[16px] font-semibold">Today</div>
            <div className="text-[13px] opacity-80 mt-0.5">
              {todayLabel} · start recording now
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              setMode((m) => (m === 'pick' ? 'choose' : 'pick'))
            }
            className="text-left rounded-2xl px-5 py-4 transition active:scale-[0.99]"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            }}
            aria-expanded={mode === 'pick'}
          >
            <div className="text-[16px] font-semibold">Another day</div>
            <div className="text-[13px] text-muted-foreground mt-0.5">
              {mode === 'pick' ? 'Pick a date below' : 'Backdate this log'}
            </div>
          </button>
        </div>

        {mode === 'pick' && (
          <>
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
                  Date
                </span>
              </div>
              <input
                type="date"
                value={date}
                min={minDate}
                max={todayLocal}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Date this voice log is for"
                className="w-full rounded-2xl px-3 py-2 text-base tabular-nums"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  height: 40,
                }}
              />
              <p
                className="mt-2 text-[12px] text-muted-foreground"
                aria-live="polite"
              >
                {isFuture
                  ? 'Date is in the future.'
                  : isTooOld
                    ? 'Date is too far in the past.'
                    : `Recording will be saved for ${dateLabel}.`}
              </p>
            </section>

            <button
              type="button"
              onClick={handleStartPicked}
              disabled={!canStart}
              aria-disabled={!canStart}
              className="mt-4 w-full rounded-full font-semibold transition active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'var(--sage-deep)',
                color: 'var(--card)',
                height: 52,
                fontSize: 16,
                boxShadow:
                  '0 4px 14px color-mix(in oklab, var(--sage-deep) 25%, transparent)',
              }}
            >
              Start recording
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function formatHumanDate(iso: string): string {
  // YYYY-MM-DD → "Mon, May 11" using local interpretation. The input is
  // already a wall-clock date (no time), so constructing via Date(iso)
  // would parse as UTC midnight — instead we split + use Date.UTC then
  // format with the same UTC timezone to keep day-of-week stable.
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(dt);
}
