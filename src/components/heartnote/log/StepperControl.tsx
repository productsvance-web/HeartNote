// Numeric stepper — minus / value-chip / plus. White-circle sub-buttons,
// 36×36 hit. Optional trailing register-#1 X (size 14, muted) when value
// is non-default. Used for weight + pillow count on /log/manual.
//
// Canonical register #5 per .claude/rules/canonical-controls.md.

'use client';

import { Minus, Plus, X } from 'lucide-react';

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
}: Props) {
  const display =
    value === null
      ? placeholder
      : formatValue
        ? formatValue(value)
        : unit
          ? `${value} ${unit}`
          : String(value);

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

  const decDisabled = value !== null && value <= min;
  const incDisabled = value !== null && value >= max;

  return (
    <div className="flex items-center gap-3">
      <CircleButton
        ariaLabel={`Decrement ${fieldLabel}`}
        onClick={decrement}
        disabled={decDisabled}
      >
        <Minus size={16} strokeWidth={2.5} />
      </CircleButton>

      <span
        className="inline-flex items-center justify-center rounded-full text-base tabular-nums px-4"
        style={{
          minWidth: 96,
          height: 36,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          color: value === null ? 'var(--muted-foreground)' : 'var(--foreground)',
          fontWeight: value === null ? 400 : 500,
        }}
      >
        {display}
      </span>

      <CircleButton
        ariaLabel={`Increment ${fieldLabel}`}
        onClick={increment}
        disabled={incDisabled}
      >
        <Plus size={16} strokeWidth={2.5} />
      </CircleButton>

      {canClear && (
        <button
          type="button"
          aria-label={`Clear ${fieldLabel}`}
          onClick={onClear}
          className="inline-flex items-center justify-center text-muted-foreground active:text-foreground transition"
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
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center rounded-full transition active:scale-[0.94] disabled:opacity-30"
      style={{
        width: 36,
        height: 36,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        color: 'var(--foreground)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      {children}
    </button>
  );
}
