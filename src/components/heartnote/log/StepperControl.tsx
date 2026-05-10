// Numeric stepper — minus / NumberChip / plus, with optional trailing
// register-#1 X to clear when the value differs from the seed.
//
// The chip itself is one component (NumberChip) with a single render
// path; this file just composes the surrounding ± buttons + clear X.
//
// Visual register matches docs/design/heartnote-log-redesign-mockup.html
// (.stepper / .step-btn). Canonical register #5 per
// .claude/rules/canonical-controls.md.

'use client';

import { Minus, Plus, X } from 'lucide-react';
import { NumberChip } from './NumberChip';
import { useHoldRepeat } from './use-hold-repeat';

interface Props {
  value: number | null;
  defaultValue?: number | null;
  min: number;
  max: number;
  step: number;
  fieldLabel: string;
  unit?: string;
  formatValue?: (v: number) => string;
  placeholder?: string;
  onChange: (v: number) => void;
  onClear?: () => void;
  // Whole-number variant — used for pillows / HR / SpO2.
  integer?: boolean;
  // Optional tighter input floors (vs. min/max which mirror DB validity).
  // Stop someone typing clinically-incompatible values like "55%" SpO2.
  inputMin?: number;
  inputMax?: number;
  // Hard cap on input length — see NumberChip.maxLength.
  maxLength?: number;
}

export function StepperControl({
  value,
  defaultValue = null,
  min,
  max,
  step,
  fieldLabel,
  unit,
  formatValue,
  placeholder = '—',
  onChange,
  onClear,
  integer = false,
  inputMin,
  inputMax,
  maxLength,
}: Props) {
  const canClear =
    onClear !== undefined && value !== null && value !== defaultValue;

  const decrement = () => {
    const base = value ?? defaultValue ?? min;
    onChange(Math.max(min, +(base - step).toFixed(2)));
  };
  const increment = () => {
    const base = value ?? defaultValue ?? min;
    onChange(Math.min(max, +(base + step).toFixed(2)));
  };

  const decHold = useHoldRepeat(decrement);
  const incHold = useHoldRepeat(increment);

  const decDisabled = value !== null && value <= min;
  const incDisabled = value !== null && value >= max;

  return (
    <div className="flex items-center justify-between gap-3">
      <CircleButton
        ariaLabel={`Decrement ${fieldLabel}`}
        disabled={decDisabled}
        holdHandlers={decHold}
      >
        <Minus size={14} strokeWidth={2.5} />
      </CircleButton>

      <NumberChip
        value={value}
        formatValue={formatValue}
        unit={unit}
        placeholder={placeholder}
        integer={integer}
        inputMin={inputMin ?? min}
        inputMax={inputMax ?? max}
        onChange={onChange}
        ariaLabel={`Edit ${fieldLabel}`}
        maxLength={maxLength}
      />

      <CircleButton
        ariaLabel={`Increment ${fieldLabel}`}
        disabled={incDisabled}
        holdHandlers={incHold}
      >
        <Plus size={14} strokeWidth={2.5} />
      </CircleButton>

      {canClear && (
        <button
          type="button"
          aria-label={`Clear ${fieldLabel}`}
          onClick={onClear}
          className="inline-flex items-center justify-center text-muted-foreground active:text-foreground transition flex-shrink-0"
          style={{ width: 32, height: 32 }}
        >
          <X size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

function CircleButton({
  children,
  ariaLabel,
  disabled,
  holdHandlers,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  disabled?: boolean;
  holdHandlers: ReturnType<typeof useHoldRepeat>;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      {...(disabled ? {} : holdHandlers)}
      className="inline-flex items-center justify-center rounded-full transition active:scale-[0.94] disabled:opacity-30 flex-shrink-0 touch-none"
      style={{
        width: 36,
        height: 36,
        background: 'var(--cream)',
        border: '1px solid var(--sage-mist)',
        color: 'var(--foreground)',
      }}
    >
      {children}
    </button>
  );
}
