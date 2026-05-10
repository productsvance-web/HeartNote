// Slide-up sheet for adding a weight reading. Uses the existing
// VitalsRow + StepperControl design-system components. Date and time
// are native <input> controls — best mobile UX, no extra deps.
//
// Mount-on-open: the parent renders this component only while the sheet
// is open, so every open is a fresh mount. That makes the lazy useState
// initializers run on every open — the time input always reflects "now,"
// and there is no useEffect-reset (which the React lint rule rightly
// flags as a cascading-render anti-pattern).

'use client';

import { useRef, useState } from 'react';
import { VitalsRow } from '@/components/heartnote/manual-entry/VitalsRow';
import { StepperControl } from '@/components/heartnote/manual-entry/StepperControl';
import { READING_RANGE } from '@/lib/clinical/reading-ranges';
import { isoOffset } from '@/lib/dates/iso-offset';

export type AddWeightInput = {
  weightLb: number;
  recordedAtIsoLocal: string; // "YYYY-MM-DDTHH:MM" — server combines w/ tz
};

interface Props {
  onClose: () => void;
  seedValue: number | null;
  today: string; // YYYY-MM-DD in patient tz, used as the date input max
  timezone: string;
  onSave: (
    input: AddWeightInput,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}

const MIN_BACKDATE_DAYS = 400;

export function AddWeightSheet({
  onClose,
  seedValue,
  today,
  timezone,
  onSave,
}: Props) {
  const [weight, setWeight] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState(() => currentTimeHHMM(timezone));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Idempotency guard. The disabled-attribute lag between tap and React
  // commit lets a fast double-tap (especially synthesized touch+click on
  // Safari) fire the action twice. Without this, we'd insert two parent
  // logs + two readings on a single user intent.
  const submittingRef = useRef(false);

  const minDate = isoOffset(today, -MIN_BACKDATE_DAYS);
  const canSave = weight !== null && !pending;

  const submit = async () => {
    if (weight === null) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await onSave({
        weightLb: weight,
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

        <div className="space-y-3">
          <VitalsRow
            label="Weight"
            secondary={
              seedValue !== null ? `last ${seedValue.toFixed(1)} lb` : undefined
            }
          >
            <StepperControl
              value={weight}
              defaultValue={seedValue}
              min={READING_RANGE.weight_lb[0]}
              max={READING_RANGE.weight_lb[1]}
              step={0.2}
              fieldLabel="weight"
              formatValue={(v) => `${v.toFixed(1)} lb`}
              placeholder="— lb"
              onChange={setWeight}
              onClear={() => setWeight(null)}
            />
          </VitalsRow>

          <VitalsRow label="When">
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
          </VitalsRow>
        </div>

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

function currentTimeHHMM(tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}
