// Add-blood-pressure sheet. Two integer steppers wrapping
// DualStepperControl from the /log register. Distinct from
// AddReadingSheet because BP has TWO values per reading + the seed
// contract is (seedSys, seedDia) instead of one scalar.
//
// Visual chrome (slide-up, drag handle, header, Save button) matches
// AddReadingSheet so the two sheets read as siblings.

'use client';

import { useEffect, useRef, useState } from 'react';
import { DualStepperControl } from '@/components/heartnote/log/DualStepperControl';
import { READING_RANGE } from '@/lib/clinical/reading-ranges';
import { MAX_BACKDATE_DAYS } from '@/lib/dates/backdate-window';
import { WhenCard } from './WhenCard';

export type AddBpInput = {
  systolic: number;
  diastolic: number;
  recordedAtIsoLocal: string;
};

interface Props {
  onClose: () => void;
  seedSys: number | null;
  seedDia: number | null;
  timezone: string;
  onSave: (
    input: AddBpInput,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}


export function AddBpSheet({
  onClose,
  seedSys,
  seedDia,
  timezone,
  onSave,
}: Props) {
  // Both values start unset — caregiver dials in via the stepper.
  // Seed is shown as the eyebrow ("last 128/76 mmHg") so the caregiver
  // can tell whether they're on the right track without auto-filling
  // values that might be wrong for this reading.
  const [sys, setSys] = useState<number | null>(null);
  const [dia, setDia] = useState<number | null>(null);
  const [date, setDate] = useState(() => todayInTz(timezone));
  const [time, setTime] = useState(() => currentTimeHHMM(timezone));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submittingRef = useRef(false);

  const canSave = sys !== null && dia !== null && !pending;

  const onStepperChange = (nextSys: number | null, nextDia: number | null) => {
    setSys(nextSys);
    setDia(nextDia);
  };

  const onClear = () => {
    setSys(null);
    setDia(null);
  };

  const submit = async () => {
    if (sys === null || dia === null) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await onSave({
        systolic: sys,
        diastolic: dia,
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

  useEffect(() => () => {
    submittingRef.current = false;
  }, []);

  // Eyebrow contract: only render when BOTH seeds are present (a
  // half-seed would look broken). Hardcoded here — BP doesn't use
  // VitalReadingConfig.eyebrowLine because that callback takes a
  // single seed scalar.
  const eyebrowRight =
    seedSys !== null && seedDia !== null
      ? `last ${Math.round(seedSys)}/${Math.round(seedDia)} mmHg`
      : null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Add blood pressure reading"
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
            Add blood pressure
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted-foreground active:text-foreground"
          >
            Cancel
          </button>
        </div>

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
                Blood pressure
              </span>
            </div>
            {eyebrowRight && (
              <span className="text-[12px] text-muted-foreground tabular-nums">
                {eyebrowRight}
              </span>
            )}
          </div>

          <DualStepperControl
            systolic={sys}
            diastolic={dia}
            defaultSystolic={seedSys ?? READING_RANGE.systolic_bp[0]}
            defaultDiastolic={seedDia ?? READING_RANGE.diastolic_bp[0]}
            onChange={onStepperChange}
            onClear={onClear}
          />
        </section>

        <WhenCard
          date={date}
          time={time}
          onDateChange={setDate}
          onTimeChange={setTime}
          timezone={timezone}
          minBackdateDays={MAX_BACKDATE_DAYS}
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
