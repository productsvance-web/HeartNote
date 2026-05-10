// Numeric stepper — minus / value-chip / plus. White-circle 36×36 sub-buttons,
// large Fraunces 30px value with dotted underline, optional unit suffix.
// Trailing register-#1 X (size 14, muted) renders when value is non-default.
//
// Visual register matches docs/design/heartnote-log-redesign-mockup.html
// (.stepper / .step-btn / .step-value). Canonical register #5 per
// .claude/rules/canonical-controls.md.

'use client';

import { Minus, Plus, X } from 'lucide-react';
import { useNumericInput } from './use-numeric-input';
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
  // When true, the tap-to-type input only accepts digits (no decimal). Used
  // for pillows / HR / SpO2 — caregivers don't pick "98.5 bpm".
  integer?: boolean;
  // Optional tighter floors for the tap-to-type input. The stepper's ±
  // buttons still respect `min`/`max` (those mirror DB validity); these
  // exist to stop someone typing clinically-incompatible values like
  // "55%" SpO2. Defaults to min/max.
  inputMin?: number;
  inputMax?: number;
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
}: Props) {
  // Display: when formatValue is provided, use it (e.g. "182.4 lb"). The
  // formatted value already includes the unit when relevant; we render the
  // unit suffix separately ONLY when the caller passed `unit` and didn't
  // bake it into formatValue. To stop the unit from disappearing during
  // tap-to-type (B1), we render the unit alongside the input as well.
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

  const decHold = useHoldRepeat(decrement);
  const incHold = useHoldRepeat(increment);

  const decDisabled = value !== null && value <= min;
  const incDisabled = value !== null && value >= max;

  const { editing, draft, setDraft, inputRef, beginEdit, finishEdit, sanitize } =
    useNumericInput(value, { integer });

  const commitDraft = () => {
    const cleaned = sanitize(draft);
    if (cleaned === '') {
      // Empty → leave value unchanged. Caregiver who wants to clear has
      // the trailing X.
      finishEdit();
      return;
    }
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) {
      finishEdit();
      return;
    }
    const lo = inputMin ?? min;
    const hi = inputMax ?? max;
    const clamped = Math.min(hi, Math.max(lo, parsed));
    const rounded = integer ? Math.round(clamped) : +clamped.toFixed(2);
    onChange(rounded);
    finishEdit();
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <CircleButton
        ariaLabel={`Decrement ${fieldLabel}`}
        disabled={decDisabled}
        holdHandlers={decHold}
      >
        <Minus size={14} strokeWidth={2.5} />
      </CircleButton>

      {editing ? (
        // Mirror the read-only chip exactly — flex-1 wrapper, baseline-flex
        // centered, the input auto-sizes to its content via the `size`
        // attribute so the digits land in the same horizontal slot they
        // occupied as text. Unit sits inline to the right just like read
        // mode. Dotted underline persists.
        <div
          className="font-display relative flex-1 flex items-baseline justify-center tabular-nums"
          style={{
            fontSize: 30,
            fontWeight: 400,
            lineHeight: 1,
            letterSpacing: '-1px',
            color: 'var(--foreground)',
            padding: '4px 4px 6px',
            borderRadius: 8,
          }}
        >
          <input
            ref={inputRef}
            type="text"
            inputMode={integer ? 'numeric' : 'decimal'}
            pattern={integer ? '[0-9]*' : '[0-9.]*'}
            value={draft}
            aria-label={`Edit ${fieldLabel}`}
            // size=N renders an input N characters wide. We clamp to a
            // sensible minimum so a one-digit draft doesn't become tiny.
            size={Math.max(2, draft.length || 3)}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              const text = e.clipboardData.getData('text');
              setDraft(sanitize(text));
            }}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitDraft();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                finishEdit();
              }
            }}
            // Inherit Fraunces 30px from the parent. Center-aligned so the
            // digits center within the auto-sized input — same visual
            // position they occupied in read mode.
            className="bg-transparent border-0 outline-0 text-center"
            style={{
              fontFamily: 'inherit',
              fontSize: 'inherit',
              fontWeight: 'inherit',
              lineHeight: 'inherit',
              letterSpacing: 'inherit',
              color: 'inherit',
              fontVariantNumeric: 'inherit',
              padding: 0,
              width: 'auto',
            }}
          />
          {unit && (
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--muted-foreground)',
                marginLeft: 5,
                letterSpacing: '0.1px',
                verticalAlign: '2px',
                whiteSpace: 'nowrap',
              }}
            >
              {unit}
            </span>
          )}
          {/* Dotted underline persists during edit so the chip doesn't
              visually morph mid-tap. */}
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
        </div>
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
