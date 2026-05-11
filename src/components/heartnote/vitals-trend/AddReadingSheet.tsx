// Slide-up sheet for adding a single-value vital reading. Generic over
// weight (0.1 precision + press-and-hold) and spo2 (integer-only + tap).
// Driven by a VitalReadingConfig.
//
// The card here matches the canonical /log vitals card register: large
// serif numeric flanked by white-circle ± buttons spread to the outer
// edges, status dot + title-case label up top, eyebrow line on the
// right.
//
// Two interaction modes on the value:
// 1. ± buttons: tap = single step. If config.pressAndHold is true, press-
//    and-hold repeats at ~12/sec after a 350ms delay (the weight pattern).
//    Refs back the auto-repeat so the setInterval doesn't read a stale
//    React state value (feedback_react_closure_in_timers).
// 2. The value chip is a numeric input — caregiver can tap and type any
//    digit. inputMode='decimal' on weight, 'numeric' on integer configs.
//    onBlur clamps to [min, max].
//
// Mount-on-open: the parent renders this only while open, so the lazy
// useState initializers run on every open and the date/time inputs
// always reflect "now." Idempotency guard via useRef blocks double-tap
// Save from creating two parent logs + two readings.

'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_BACKDATE_DAYS } from '@/lib/dates/backdate-window';
import type { VitalReadingConfig } from './vital-reading-config';
import { WhenCard } from './WhenCard';

export type AddReadingInput = {
  value: number;
  recordedAtIsoLocal: string;
};

interface Props {
  config: VitalReadingConfig;
  onClose: () => void;
  // Last logged value of this vital, used as the chip seed for ± taps.
  seedValue: number | null;
  // Patient-level reference (e.g. dry_weight_lb for weight). Some
  // vitals don't have one and pass null.
  baselineValue: number | null;
  timezone: string;
  onSave: (
    input: AddReadingInput,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}

const HOLD_DELAY_MS = 350;
const HOLD_REPEAT_MS = 80;

export function AddReadingSheet({
  config,
  onClose,
  seedValue,
  baselineValue,
  timezone,
  onSave,
}: Props) {
  const [MIN, MAX] = config.range;
  const STEP = config.step;
  const INTEGER = config.integer;

  const [value, setValue] = useState<number | null>(null);
  const [text, setText] = useState<string>('');
  const [date, setDate] = useState(() => todayInTz(timezone));
  const [time, setTime] = useState(() => currentTimeHHMM(timezone));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submittingRef = useRef(false);
  // Latest committed value, kept in sync via useEffect so setInterval
  // callbacks read the post-render value (not the closure capture).
  // Required for press-and-hold to actually advance the value.
  const valueRef = useRef<number | null>(null);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const canSave = value !== null && !pending;

  const commit = (next: number) => {
    const clamped = clamp(next, MIN, MAX);
    const rounded = INTEGER
      ? Math.round(clamped)
      : Math.round(clamped * 10) / 10;
    setValue(rounded);
    setText(INTEGER ? String(rounded) : rounded.toFixed(1));
  };

  const adjust = (delta: number) => {
    const base = valueRef.current ?? seedValue ?? (MIN + MAX) / 2;
    commit(base + delta);
  };

  // Press-and-hold auto-repeat (weight pattern). Pointer events instead
  // of mousedown to cover touch + mouse + pen. Cleared on pointerup,
  // pointerleave, pointercancel, and unmount.
  const holdRef = useRef<{
    delay: ReturnType<typeof setTimeout> | null;
    repeat: ReturnType<typeof setInterval> | null;
  }>({ delay: null, repeat: null });

  const stopHold = () => {
    if (holdRef.current.delay) {
      clearTimeout(holdRef.current.delay);
      holdRef.current.delay = null;
    }
    if (holdRef.current.repeat) {
      clearInterval(holdRef.current.repeat);
      holdRef.current.repeat = null;
    }
  };

  const startTap = (delta: number) => {
    if (config.pressAndHold) {
      stopHold();
      adjust(delta); // immediate first tick
      holdRef.current.delay = setTimeout(() => {
        holdRef.current.repeat = setInterval(
          () => adjust(delta),
          HOLD_REPEAT_MS,
        );
      }, HOLD_DELAY_MS);
    } else {
      // Tap-only mode (spo2). One adjust per pointerdown, no repeat.
      adjust(delta);
    }
  };

  useEffect(() => stopHold, []);

  const onTextChange = (raw: string) => {
    const cleaned = INTEGER
      ? raw.replace(/[^0-9]/g, '')
      : raw.replace(/[^0-9.]/g, '');
    setText(cleaned);
    const n = Number(cleaned);
    if (cleaned === '' || Number.isNaN(n)) {
      setValue(null);
      return;
    }
    setValue(n);
  };

  const onTextBlur = () => {
    if (value === null) {
      setText('');
      return;
    }
    commit(value);
  };

  const submit = async () => {
    if (value === null) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPending(true);
    setError(null);
    // Date-only configs (pillows) stamp noon at save time — caregivers
    // log "pillows tonight" as a per-night summary, not a per-moment
    // reading.
    const effectiveTime = config.dateOnly ? '12:00' : time;
    try {
      const result = await onSave({
        value: clamp(value, MIN, MAX),
        recordedAtIsoLocal: `${date}T${effectiveTime}`,
      });
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
        setPending(false);
        submittingRef.current = false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
      setPending(false);
      submittingRef.current = false;
    }
  };

  const eyebrowRight = config.eyebrowLine(baselineValue, seedValue);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Add ${config.fieldLabel.toLowerCase()} reading`}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
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
            {config.sheetTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted-foreground active:text-foreground"
          >
            Cancel
          </button>
        </div>

        {/* Value card — matches the canonical /log vitals card register. */}
        <section
          className="rounded-3xl px-5 pt-4 pb-5"
          style={{
            background: 'var(--card)',
            border: '0.5px solid var(--border)',
            boxShadow:
              '0 1px 8px color-mix(in oklab, var(--sage) 6%, transparent)',
          }}
        >
          <div className="flex items-baseline justify-between mb-4">
            <div className="flex items-center gap-2">
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
                {config.fieldLabel}
              </span>
            </div>
            {eyebrowRight && (
              <span className="text-[12px] text-muted-foreground tabular-nums">
                {eyebrowRight}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <CircleHoldButton
              ariaLabel={`Decrement ${config.fieldLabel.toLowerCase()}`}
              disabled={value !== null && value <= MIN}
              onPointerDown={() => startTap(-STEP)}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
            >
              <Glyph kind="minus" />
            </CircleHoldButton>

            {/* Editable value chip. Native input — caregiver can type any
                digit. inputMode = 'decimal' for weight, 'numeric' for
                integer configs (spo2). */}
            <label
              className="flex-1 text-center cursor-text"
              aria-label={`${config.fieldLabel} value`}
            >
              <input
                type="text"
                inputMode={INTEGER ? 'numeric' : 'decimal'}
                pattern={INTEGER ? '[0-9]*' : '[0-9]*\\.?[0-9]?'}
                value={text}
                onChange={(e) => onTextChange(e.target.value)}
                onBlur={onTextBlur}
                placeholder="—"
                className="w-full text-center bg-transparent border-0 outline-none font-display tabular-nums"
                style={{
                  fontSize: 44,
                  lineHeight: 1,
                  letterSpacing: '-1.5px',
                  color:
                    value === null
                      ? 'var(--muted-foreground)'
                      : 'var(--foreground)',
                  fontWeight: 400,
                }}
              />
              <span
                aria-hidden
                className="block text-[13px] text-muted-foreground mt-1"
              >
                {config.unit}
              </span>
            </label>

            <CircleHoldButton
              ariaLabel={`Increment ${config.fieldLabel.toLowerCase()}`}
              disabled={value !== null && value >= MAX}
              onPointerDown={() => startTap(STEP)}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
            >
              <Glyph kind="plus" />
            </CircleHoldButton>
          </div>
        </section>

        <WhenCard
          date={date}
          time={time}
          onDateChange={setDate}
          onTimeChange={setTime}
          timezone={timezone}
          minBackdateDays={MAX_BACKDATE_DAYS}
          dateOnly={config.dateOnly}
        />

        {error && (
          <p
            className="mt-3 text-[13px] text-center"
            style={{ color: 'var(--status-alert-foreground)' }}
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!canSave}
          aria-disabled={!canSave}
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
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function CircleHoldButton({
  ariaLabel,
  disabled = false,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  children,
}: {
  ariaLabel: string;
  disabled?: boolean;
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={
        disabled
          ? undefined
          : (e) => {
              e.preventDefault();
              onPointerDown();
            }
      }
      onPointerUp={disabled ? undefined : onPointerUp}
      onPointerLeave={disabled ? undefined : onPointerLeave}
      onPointerCancel={disabled ? undefined : onPointerCancel}
      className="inline-flex items-center justify-center rounded-full active:scale-[0.94] transition select-none disabled:opacity-30 disabled:active:scale-100"
      style={{
        width: 44,
        height: 44,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        color: 'var(--foreground)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        touchAction: 'manipulation',
      }}
    >
      {children}
    </button>
  );
}

function Glyph({ kind }: { kind: 'minus' | 'plus' }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {kind === 'plus' ? (
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      ) : (
        <path d="M5 12h14" />
      )}
    </svg>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function currentTimeHHMM(tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
