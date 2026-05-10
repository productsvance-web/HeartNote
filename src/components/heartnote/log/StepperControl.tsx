// Numeric stepper — minus / value-chip / plus. White-circle sub-buttons,
// 36×36 hit. Optional trailing register-#1 X (size 14, muted) when value
// is non-default. Used for weight + pillow count on /log/manual.
//
// Canonical register #5 per .claude/rules/canonical-controls.md.

'use client';

import { useEffect, useRef, useState } from 'react';
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

  // Tap-to-type on the value chip. Tapping the chip swaps it for a numeric
  // input; blur or Enter parses + clamps + commits. Paste strips non-digits
  // and a single decimal before parsing so "184 lb" → 184.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const beginEdit = () => {
    setDraft(value === null ? '' : String(value));
    setEditing(true);
  };

  const commitDraft = () => {
    const cleaned = sanitizeNumeric(draft);
    if (cleaned === '') {
      // Empty → leave value unchanged. Caregiver who wants to clear has
      // the trailing X.
      setEditing(false);
      return;
    }
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) {
      setEditing(false);
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    const rounded = +clamped.toFixed(2);
    onChange(rounded);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3">
      <CircleButton
        ariaLabel={`Decrement ${fieldLabel}`}
        onClick={decrement}
        disabled={decDisabled}
      >
        <Minus size={16} strokeWidth={2.5} />
      </CircleButton>

      {editing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          pattern="[0-9.]*"
          value={draft}
          aria-label={`Edit ${fieldLabel}`}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text');
            setDraft(sanitizeNumeric(text));
          }}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitDraft();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className="inline-flex items-center justify-center rounded-full text-base tabular-nums px-4 text-center"
          style={{
            minWidth: 96,
            height: 36,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
            fontWeight: 500,
          }}
        />
      ) : (
        <button
          type="button"
          onClick={beginEdit}
          aria-label={`Edit ${fieldLabel}`}
          className="inline-flex items-center justify-center rounded-full text-base tabular-nums px-4 transition active:scale-[0.97]"
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
        </button>
      )}

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

// Strip everything except digits and a single decimal point. "184 lb" → "184".
// "2.5 kg paste-blob" → "2.5". Multiple decimals collapse to one (keeps the
// first), so "1.2.3" → "1.23".
function sanitizeNumeric(input: string): string {
  const stripped = input.replace(/[^0-9.]/g, '');
  const firstDot = stripped.indexOf('.');
  if (firstDot === -1) return stripped;
  return (
    stripped.slice(0, firstDot + 1) +
    stripped.slice(firstDot + 1).replace(/\./g, '')
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
