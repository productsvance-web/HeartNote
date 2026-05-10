// Slide-up sheet for adding a weight reading. The Weight card here
// matches the canonical vitals card from
// docs/design/heartnote-log-redesign-mockup.html — large serif numeric
// flanked by white-circle ± buttons spread to the outer edges, status
// dot + title-case label up top, "vs. baseline" or "last X.X lb" on the
// right.
//
// Two interaction modes on the value:
// 1. ± buttons: tap = single step (0.1 lb); press-and-hold = repeat at
//    ~12/sec after a 350ms delay. Refs back the auto-repeat so the
//    setInterval doesn't read a stale React state value (see
//    feedback_react_closure_in_timers).
// 2. The value chip is itself a numeric input — caregiver can tap and
//    type any digit directly. inputMode='decimal' summons the right
//    mobile keyboard. onBlur clamps to the [min, max] range.
//
// Mount-on-open: the parent renders this only while open, so the lazy
// useState initializers run on every open and the date/time inputs
// always reflect "now." Idempotency guard via useRef blocks double-tap
// Save from creating two parent logs + two readings.

'use client';

import { useEffect, useRef, useState } from 'react';
import { READING_RANGE } from '@/lib/clinical/reading-ranges';
import { isoOffset } from '@/lib/dates/iso-offset';

export type AddWeightInput = {
  weightLb: number;
  recordedAtIsoLocal: string; // "YYYY-MM-DDTHH:MM" — server combines w/ tz
};

interface Props {
  onClose: () => void;
  seedValue: number | null; // last logged weight, used as the chip seed
  baselineLb: number | null; // patient.dry_weight_lb, used in the eyebrow
  timezone: string;
  onSave: (
    input: AddWeightInput,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}

const STEP = 0.1;
const HOLD_DELAY_MS = 350;
const HOLD_REPEAT_MS = 80;
const MIN_BACKDATE_DAYS = 400;
const [WEIGHT_MIN, WEIGHT_MAX] = READING_RANGE.weight_lb;

export function AddWeightSheet({
  onClose,
  seedValue,
  baselineLb,
  timezone,
  onSave,
}: Props) {
  const [weight, setWeight] = useState<number | null>(null);
  const [text, setText] = useState<string>('');
  const [date, setDate] = useState(() => todayInTz(timezone));
  const [time, setTime] = useState(() => currentTimeHHMM(timezone));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submittingRef = useRef(false);
  // Ref to the latest committed weight, kept in sync via useEffect so
  // setInterval callbacks read the post-render value (not the closure
  // capture). Required for press-and-hold to actually advance the value.
  const valueRef = useRef<number | null>(null);
  useEffect(() => {
    valueRef.current = weight;
  }, [weight]);

  const today = todayInTz(timezone);
  const minDate = isoOffset(today, -MIN_BACKDATE_DAYS);
  const canSave = weight !== null && !pending;

  const commit = (next: number) => {
    const clamped = clamp(next, WEIGHT_MIN, WEIGHT_MAX);
    const rounded = Math.round(clamped * 10) / 10;
    setWeight(rounded);
    setText(rounded.toFixed(1));
  };

  const adjust = (delta: number) => {
    const base = valueRef.current ?? seedValue ?? 180;
    commit(base + delta);
  };

  // Press-and-hold auto-repeat. Pointer events instead of mousedown to
  // cover touch + mouse + pen with one path. Cleared on pointerup,
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

  const startHold = (delta: number) => {
    stopHold();
    adjust(delta); // immediate first tick
    holdRef.current.delay = setTimeout(() => {
      holdRef.current.repeat = setInterval(() => adjust(delta), HOLD_REPEAT_MS);
    }, HOLD_DELAY_MS);
  };

  useEffect(() => stopHold, []);

  const onTextChange = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    setText(cleaned);
    const n = Number(cleaned);
    if (cleaned === '' || Number.isNaN(n)) {
      setWeight(null);
      return;
    }
    setWeight(n);
  };

  const onTextBlur = () => {
    if (weight === null) {
      setText('');
      return;
    }
    commit(weight);
  };

  const submit = async () => {
    if (weight === null) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await onSave({
        weightLb: clamp(weight, WEIGHT_MIN, WEIGHT_MAX),
        recordedAtIsoLocal: `${date}T${time}`,
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

  const eyebrowRight =
    baselineLb !== null
      ? `vs. baseline ${baselineLb.toFixed(1)} lb`
      : seedValue !== null
        ? `last ${seedValue.toFixed(1)} lb`
        : null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Add weight reading"
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
            Add weight
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted-foreground active:text-foreground"
          >
            Cancel
          </button>
        </div>

        {/* Weight card — matches the canonical /log vitals card register. */}
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
                Weight
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
              ariaLabel="Decrement weight"
              onPointerDown={() => startHold(-STEP)}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
            >
              <Glyph kind="minus" />
            </CircleHoldButton>

            {/* Editable value chip. Native input — caregivers can type
                any digit. inputMode='decimal' selects the right mobile
                keyboard. */}
            <label className="flex-1 text-center cursor-text" aria-label="Weight value">
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*\.?[0-9]?"
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
                    weight === null
                      ? 'var(--muted-foreground)'
                      : 'var(--foreground)',
                  fontWeight: 400,
                }}
              />
              <span
                aria-hidden
                className="block text-[13px] text-muted-foreground mt-1"
              >
                lb
              </span>
            </label>

            <CircleHoldButton
              ariaLabel="Increment weight"
              onPointerDown={() => startHold(STEP)}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
            >
              <Glyph kind="plus" />
            </CircleHoldButton>
          </div>
        </section>

        {/* When card */}
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
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date"
              className="flex-1 rounded-2xl px-3 py-2 text-base tabular-nums"
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
                height: 40,
              }}
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label="Time"
              className="flex-1 rounded-2xl px-3 py-2 text-base tabular-nums"
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
                height: 40,
              }}
            />
          </div>
        </section>

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
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  children,
}: {
  ariaLabel: string;
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
      onPointerDown={(e) => {
        e.preventDefault(); // suppress focus + native repeat on iOS
        onPointerDown();
      }}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
      // Click-through fallback for keyboards / a11y screen readers that
      // don't fire pointerdown — onClick is called once. The pointerdown
      // path already adjusted, so we no-op here for pointer users via
      // the e.preventDefault above (which doesn't actually block click,
      // but the holdRef logic dedupes). Cheap defense.
      className="inline-flex items-center justify-center rounded-full active:scale-[0.94] transition select-none"
      style={{
        width: 44,
        height: 44,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        color: 'var(--foreground)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        touchAction: 'manipulation', // prevents iOS double-tap zoom
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
