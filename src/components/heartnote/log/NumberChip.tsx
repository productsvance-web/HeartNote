// Single render path for the big Fraunces 30px value with optional unit
// suffix and dotted underline. The input is ALWAYS rendered — no
// editing/display mode swap, no twin JSX, no chance for the two states
// to drift on font, height, or alignment.
//
// Click → focus + select-all → typing replaces the draft. Blur commits.
// Auto-sizes via the HTML `size` attribute so the chip width tracks
// the digits.

'use client';

import { useRef, useState } from 'react';

interface Props {
  value: number | null;
  // Returns the user-facing text for `value` (e.g. (v) => v.toFixed(1)).
  // The chip's blur committer parses this string back, so formatValue
  // must return something the parser can read — digits + optional
  // single decimal. Don't include unit text in formatValue.
  formatValue?: (v: number) => string;
  unit?: string;
  placeholder?: string;
  // True for whole-number fields (BP, HR, SpO2, pillows). Strips '.'.
  integer?: boolean;
  // Tap-input clamps. Defaults match the storage validity range from the
  // caller; a tighter clinical floor (e.g. SpO2 ≥ 70) is passed as
  // inputMin so caregivers can't type "55" via keypad even though the
  // DB technically accepts it.
  inputMin: number;
  inputMax: number;
  // Called with the parsed + clamped + rounded numeric value on blur.
  // Empty input commits nothing (caregiver who wants to clear taps the
  // trailing X — register #1 in canonical-controls.md).
  onChange: (v: number) => void;
  // Aria label on the input.
  ariaLabel: string;
  // Stretch the chip to fill horizontal space inside its parent.
  flexFill?: boolean;
  // Smaller-variant size used by the dual-stepper halves (BP). Defaults
  // to the standard 30px Fraunces chip.
  fontSize?: number;
  showDottedUnderline?: boolean;
  // Hard cap on input length. SpO2 caps at 5 ("100.0") so the field
  // can't accept "1000" before commit-time clamp. Omit to leave the
  // browser default unbounded.
  maxLength?: number;
}

// Half-up rounding to N decimal places that's robust to IEEE-754
// representation error (e.g. 1.45 * 10 = 14.499999999999998).
// 90.55 → 90.6, 90.12 → 90.1, 44.45 → 44.5.
function roundHalfUp(value: number, places: number): number {
  return Number(`${Math.round(Number(`${value}e${places}`))}e-${places}`);
}

export function NumberChip({
  value,
  formatValue,
  unit,
  placeholder = '—',
  integer = false,
  inputMin,
  inputMax,
  onChange,
  ariaLabel,
  flexFill = true,
  fontSize = 30,
  showDottedUnderline = true,
  maxLength,
}: Props) {
  const formatted = (v: number): string => (formatValue ? formatValue(v) : String(v));

  // Only track an in-flight draft while focused. When not focused, the
  // input value is derived directly from `value` — no state to sync,
  // no useEffect, no chance to clobber an in-flight edit on external
  // value changes (± buttons, voice extraction, DB hydration). Set
  // draft to `null` to mean "show the value, not the draft."
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const focused = draft !== null;
  const displayValue = value === null ? '' : formatted(value);
  const inputValue = draft ?? displayValue;

  const sanitize = (s: string): string => {
    if (integer) return s.replace(/[^0-9]/g, '');
    const stripped = s.replace(/[^0-9.]/g, '');
    const firstDot = stripped.indexOf('.');
    if (firstDot === -1) return stripped;
    return stripped.slice(0, firstDot + 1) + stripped.slice(firstDot + 1).replace(/\./g, '');
  };

  const commit = () => {
    if (draft === null) return; // not focused; nothing to commit
    const cleaned = sanitize(draft);
    if (cleaned === '') {
      // Empty draft → discard, revert to value. Trailing X handles the
      // clear path (canonical register #1).
      setDraft(null);
      return;
    }
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) {
      setDraft(null);
      return;
    }
    const clamped = Math.min(inputMax, Math.max(inputMin, parsed));
    // Half-up to 1 decimal for non-integer fields. The earlier
    // `+clamped.toFixed(2)` kept 2 decimals internally even though every
    // formatValue caller renders 1 decimal — store/display now agree.
    const rounded = integer ? Math.round(clamped) : roundHalfUp(clamped, 1);
    onChange(rounded);
    setDraft(null); // back to value-derived display
  };

  // Show placeholder when not focused AND no value yet.
  const showPlaceholder = !focused && value === null;

  return (
    <span
      className={`font-display relative inline-flex items-baseline justify-center tabular-nums ${flexFill ? 'flex-1' : ''}`}
      style={{
        fontSize,
        fontWeight: 400,
        lineHeight: 1,
        letterSpacing: '-1px',
        color: value === null && !focused ? 'var(--muted-foreground)' : 'var(--foreground)',
        padding: '4px 4px 6px',
        borderRadius: 8,
      }}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        pattern={integer ? '[0-9]*' : '[0-9.]*'}
        maxLength={maxLength}
        value={showPlaceholder ? placeholder : inputValue}
        aria-label={ariaLabel}
        // size auto-grows the input to the visible content. The HTML
        // `size` attribute is the average-glyph-width hint; for Fraunces
        // tabular-nums at 30px, the actual rendered digit width exceeds
        // the browser's average-char metric, so we add 1 char of
        // headroom to stop 3-digit values (HR up to 450, SpO2 100,
        // BP 220) from clipping at the trailing edge of the input.
        // Min 3 so a single digit + headroom + cursor have room to land.
        size={Math.max(
          3,
          (showPlaceholder ? placeholder : inputValue).length + 1,
        )}
        onFocus={(e) => {
          // Initialize draft with the formatted value so a chip showing
          // "182.0" opens with "182.0", not "182" from the bare number.
          setDraft(displayValue);
          // Select-all so the first keystroke replaces the formatted draft.
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(sanitize(e.target.value))}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData('text');
          const sliced = maxLength ? text.slice(0, maxLength) : text;
          setDraft(sanitize(sliced));
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            inputRef.current?.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            // Discard draft, revert to displayed value, blur.
            setDraft(null);
            inputRef.current?.blur();
          }
        }}
        className="bg-transparent border-0 outline-0 text-center cursor-text"
        style={{
          // Inherit Fraunces sizing from the parent span — single source
          // for all type styling so display + edit can't drift.
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontWeight: 'inherit',
          lineHeight: 1,
          letterSpacing: 'inherit',
          color: 'inherit',
          fontVariantNumeric: 'inherit',
          padding: 0,
          // Pin to exactly 1em of the inherited font so the browser's
          // UA-default min-height on <input> doesn't make the chip
          // taller than the surrounding text.
          height: '1em',
          boxSizing: 'content-box',
        }}
      />
      {unit && !showPlaceholder && (
        <span
          aria-hidden
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
      {showDottedUnderline && (
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
      )}
    </span>
  );
}
