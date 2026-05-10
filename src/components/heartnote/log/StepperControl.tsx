// Numeric stepper — minus / value-chip / plus. White-circle 36×36 sub-buttons,
// large Fraunces 30px value with dotted underline, optional unit suffix.
// Trailing register-#1 X (size 14, muted) renders when value is non-default.
//
// Visual register matches docs/design/heartnote-log-redesign-mockup.html
// (.stepper / .step-btn / .step-value). Canonical register #5 per
// .claude/rules/canonical-controls.md.

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
  // Display: when formatValue is provided, use it (e.g. "182.4"). Otherwise
  // fall back to a stringified value. The unit (if any) renders separately
  // as a smaller Inter span via the .unit child below.
  const numericDisplay =
    value === null
      ? placeholder
      : formatValue
        ? formatValue(value)
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

  // Tap-to-type on the value chip. Tapping swaps it for a numeric input;
  // blur or Enter parses + clamps + commits. The input inherits Fraunces
  // 30px so the value doesn't visually shrink during edit.
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
    <div className="flex items-center justify-between gap-3">
      <CircleButton
        ariaLabel={`Decrement ${fieldLabel}`}
        onClick={decrement}
        disabled={decDisabled}
      >
        <Minus size={14} strokeWidth={2.5} />
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
          // Inherit Fraunces 30px so the chip doesn't shrink during edit.
          className="font-display flex-1 text-center bg-transparent border-0 outline-0 tabular-nums"
          style={{
            fontSize: 30,
            fontWeight: 400,
            lineHeight: 1,
            letterSpacing: '-1px',
            color: 'var(--foreground)',
            padding: '4px 4px 6px',
          }}
        />
      ) : (
        <button
          type="button"
          onClick={beginEdit}
          aria-label={`Edit ${fieldLabel}`}
          // Big serif value chip with dotted underline. flex:1 means it
          // expands to fill the space between the ± buttons.
          className="font-display relative flex-1 text-center tabular-nums cursor-text"
          style={{
            fontSize: 30,
            fontWeight: 400,
            lineHeight: 1,
            letterSpacing: '-1px',
            color: value === null ? 'var(--muted-foreground)' : 'var(--foreground)',
            padding: '4px 4px 6px',
            borderRadius: 8,
          }}
        >
          {numericDisplay}
          {unit && value !== null && (
            <span
              // Unit suffix in Inter 12px ink-soft, vertical-align nudged.
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--muted-foreground)',
                marginLeft: 5,
                letterSpacing: '0.1px',
                verticalAlign: '2px',
              }}
            >
              {unit}
            </span>
          )}
          {/* Dotted underline (mockup .step-value::after). Fades to 50% */}
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: '30%',
              right: '30%',
              bottom: 1,
              height: 1,
              borderBottom: '1px dotted var(--ink-faint)',
              opacity: 0.5,
            }}
          />
        </button>
      )}

      <CircleButton
        ariaLabel={`Increment ${fieldLabel}`}
        onClick={increment}
        disabled={incDisabled}
      >
        <Plus size={14} strokeWidth={2.5} />
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
      className="inline-flex items-center justify-center rounded-full transition active:scale-[0.94] disabled:opacity-30 flex-shrink-0"
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
