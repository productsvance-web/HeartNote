// Tap-to-type editing hook shared by StepperControl + DualStepperControl.Half.
// Both used to define identical state, sanitizer, and commit logic — the
// integer/decimal rule was the only meaningful difference and lived in two
// hand-tuned sanitizers (.claude/rules/code-quality.md anti-pattern #2).
//
// Returns the editing state, the draft text, the commit/begin handlers,
// and a ref to attach to the input. The caller decides what to do on
// commit (parse → clamp → onChange).

'use client';

import { useEffect, useRef, useState } from 'react';

interface Options {
  // When true, the sanitizer strips '.' so only digits survive. Used for
  // BP, HR, SpO2, pillows. When false (default), allows a single decimal
  // (used for weight).
  integer?: boolean;
}

export function useNumericInput(currentValue: number | null, options: Options = {}) {
  const { integer = false } = options;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const beginEdit = (initialDraft?: string) => {
    // Caller can override the initial draft (e.g. pass formatValue(value) so
    // a 182.0 chip opens with "182.0", not "182" from the bare number).
    if (initialDraft !== undefined) {
      setDraft(initialDraft);
    } else {
      setDraft(currentValue === null ? '' : String(currentValue));
    }
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  // Strip everything except digits (and a single decimal if integer=false).
  // Multiple decimals collapse to one (keeps the first), so "1.2.3" → "1.23".
  const sanitize = (input: string): string => {
    if (integer) return input.replace(/[^0-9]/g, '');
    const stripped = input.replace(/[^0-9.]/g, '');
    const firstDot = stripped.indexOf('.');
    if (firstDot === -1) return stripped;
    return (
      stripped.slice(0, firstDot + 1) +
      stripped.slice(firstDot + 1).replace(/\./g, '')
    );
  };

  return {
    editing,
    draft,
    setDraft,
    inputRef,
    beginEdit,
    cancelEdit,
    finishEdit: () => setEditing(false),
    sanitize,
  };
}
