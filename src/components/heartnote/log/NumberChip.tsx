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
    const rounded = integer ? Math.round(clamped) : +clamped.toFixed(2);
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
        value={showPlaceholder ? placeholder : inputValue}
        aria-label={ariaLabel}
        // size auto-grows the input to the visible content. min 2 so a
        // single digit doesn't render as a tiny field; min 3 when empty
        // so the placeholder ('—') and the cursor have room to land.
        size={Math.max(2, (showPlaceholder ? placeholder : inputValue).length || 3)}
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
          setDraft(sanitize(text));
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
