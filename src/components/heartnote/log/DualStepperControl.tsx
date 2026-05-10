// Dual-stepper for blood pressure: two adjacent half-steppers (Sys / Dia)
// with ±1 increment each side. Compact 26×26 glyph variant of canonical
// register #5 (per design mockup phone-1 dual-stepper); 32×32 hit-target
// floor preserved via padding.
//
// Trailing register #1 X is OPTIONAL on the dual-stepper because clearing
// one half without the other rarely makes sense. Caregivers typically tap
// both numbers together via the chip-tap-to-type or both ± buttons.

'use client';

import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import { READING_RANGE } from '@/lib/clinical/reading-ranges';

interface Props {
  systolic: number | null;
  diastolic: number | null;
  defaultSystolic: number | null;
  defaultDiastolic: number | null;
  onChange: (sys: number | null, dia: number | null) => void;
  onClear?: () => void;
}

export function DualStepperControl({
  systolic,
  diastolic,
  defaultSystolic,
  defaultDiastolic,
  onChange,
  onClear,
}: Props) {
  const [sysMin, sysMax] = READING_RANGE.systolic_bp;
  const [diaMin, diaMax] = READING_RANGE.diastolic_bp;

  const sysDecrement = () => {
    const base = systolic ?? defaultSystolic ?? sysMin;
    onChange(Math.max(sysMin, base - 1), diastolic);
  };
  const sysIncrement = () => {
    const base = systolic ?? defaultSystolic ?? sysMin;
    onChange(Math.min(sysMax, base + 1), diastolic);
  };
  const diaDecrement = () => {
    const base = diastolic ?? defaultDiastolic ?? diaMin;
    onChange(systolic, Math.max(diaMin, base - 1));
  };
  const diaIncrement = () => {
    const base = diastolic ?? defaultDiastolic ?? diaMin;
    onChange(systolic, Math.min(diaMax, base + 1));
  };

  const canClear =
    onClear !== undefined &&
    (systolic !== null || diastolic !== null) &&
    (systolic !== defaultSystolic || diastolic !== defaultDiastolic);

  return (
    <div className="flex items-center gap-3">
      <Half
        label="Systolic"
        value={systolic}
        suffix="sys"
        min={sysMin}
        max={sysMax}
        onDec={sysDecrement}
        onInc={sysIncrement}
        onCommit={(v) => onChange(v, diastolic)}
        decDisabled={systolic !== null && systolic <= sysMin}
        incDisabled={systolic !== null && systolic >= sysMax}
      />
      <span className="text-base font-medium text-muted-foreground">/</span>
      <Half
        label="Diastolic"
        value={diastolic}
        suffix="dia"
        min={diaMin}
        max={diaMax}
        onDec={diaDecrement}
        onInc={diaIncrement}
        onCommit={(v) => onChange(systolic, v)}
        decDisabled={diastolic !== null && diastolic <= diaMin}
        incDisabled={diastolic !== null && diastolic >= diaMax}
      />
      {canClear && (
        <button
          type="button"
          aria-label="Clear blood pressure"
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

function Half({
  label,
  value,
  suffix,
  min,
  max,
  onDec,
  onInc,
  onCommit,
  decDisabled,
  incDisabled,
}: {
  label: string;
  value: number | null;
  suffix: string;
  min: number;
  max: number;
  onDec: () => void;
  onInc: () => void;
  onCommit: (v: number) => void;
  decDisabled: boolean;
  incDisabled: boolean;
}) {
  // Tap-to-type on each half. Same sanitize/clamp/commit shape as
  // StepperControl. Empty draft on commit keeps the existing value.
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
      setEditing(false);
      return;
    }
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) {
      setEditing(false);
      return;
    }
    const clamped = Math.min(max, Math.max(min, Math.round(parsed)));
    onCommit(clamped);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-1.5">
      <CompactCircle
        ariaLabel={`Decrement ${label}`}
        onClick={onDec}
        disabled={decDisabled}
      >
        <Minus size={14} strokeWidth={2.5} />
      </CompactCircle>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9.]*"
          value={draft}
          aria-label={`Edit ${label}`}
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
          className="inline-flex items-center justify-center rounded-full text-base tabular-nums px-3 text-center"
          style={{
            minWidth: 60,
            height: 32,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
            fontWeight: 500,
          }}
          data-suffix={suffix}
        />
      ) : (
        <button
          type="button"
          onClick={beginEdit}
          aria-label={`${label} value`}
          data-suffix={suffix}
          className="inline-flex items-center justify-center rounded-full text-base tabular-nums px-3 transition active:scale-[0.97]"
          style={{
            minWidth: 60,
            height: 32,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: value === null ? 'var(--muted-foreground)' : 'var(--foreground)',
            fontWeight: value === null ? 400 : 500,
          }}
        >
          {value === null ? '—' : value}
        </button>
      )}
      <CompactCircle
        ariaLabel={`Increment ${label}`}
        onClick={onInc}
        disabled={incDisabled}
      >
        <Plus size={14} strokeWidth={2.5} />
      </CompactCircle>
    </div>
  );
}

function sanitizeNumeric(input: string): string {
  const stripped = input.replace(/[^0-9.]/g, '');
  const firstDot = stripped.indexOf('.');
  if (firstDot === -1) return stripped;
  return (
    stripped.slice(0, firstDot + 1) +
    stripped.slice(firstDot + 1).replace(/\./g, '')
  );
}

function CompactCircle({
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
      // 32×32 hit target wraps a 26×26 visual circle to match the
      // mockup's compact dual-stepper.
      className="inline-flex items-center justify-center transition active:scale-[0.94] disabled:opacity-30"
      style={{ width: 32, height: 32 }}
    >
      <span
        className="inline-flex items-center justify-center rounded-full"
        style={{
          width: 26,
          height: 26,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          color: 'var(--foreground)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        {children}
      </span>
    </button>
  );
}
