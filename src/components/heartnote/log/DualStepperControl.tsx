// Dual-stepper for blood pressure: two adjacent half-stepper cards (Sys / Dia)
// with ±1 increment each side. Each half is its own cream card with a
// sage-mist border + 14px radius (mockup .stepper-half). Sys/Dia label
// sits at the trailing edge of each half. No "/" separator between halves.
//
// Trailing register #1 X is OPTIONAL on the dual-stepper — caregivers
// typically tap both numbers together.
//
// Visual register matches docs/design/heartnote-log-redesign-mockup.html
// (.stepper-dual / .stepper-half / .step-btn / .step-value / .half-label).

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
    <div className="flex items-center gap-2">
      <Half
        label="Systolic"
        shortLabel="sys"
        value={systolic}
        min={sysMin}
        max={sysMax}
        onDec={sysDecrement}
        onInc={sysIncrement}
        onCommit={(v) => onChange(v, diastolic)}
        decDisabled={systolic !== null && systolic <= sysMin}
        incDisabled={systolic !== null && systolic >= sysMax}
      />
      <Half
        label="Diastolic"
        shortLabel="dia"
        value={diastolic}
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
          className="inline-flex items-center justify-center text-muted-foreground active:text-foreground transition flex-shrink-0"
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
  shortLabel,
  value,
  min,
  max,
  onDec,
  onInc,
  onCommit,
  decDisabled,
  incDisabled,
}: {
  label: string;
  shortLabel: string;
  value: number | null;
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
    // .stepper-half — its own cream card, sage-mist border, 14px radius.
    <div
      className="flex flex-1 items-center justify-between gap-1"
      style={{
        background: 'var(--cream)',
        border: '1px solid var(--sage-mist)',
        borderRadius: 14,
        padding: '5px 8px',
      }}
    >
      <CompactCircle
        ariaLabel={`Decrement ${label}`}
        onClick={onDec}
        disabled={decDisabled}
      >
        <Minus size={11} strokeWidth={2.5} />
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
          className="font-display flex-1 min-w-0 text-center bg-transparent border-0 outline-0 tabular-nums"
          style={{
            fontSize: 22,
            fontWeight: 400,
            lineHeight: 1,
            letterSpacing: '-1px',
            color: 'var(--foreground)',
            padding: '3px 3px 4px',
          }}
        />
      ) : (
        <button
          type="button"
          onClick={beginEdit}
          aria-label={`${label} value`}
          className="font-display flex-1 min-w-0 text-center tabular-nums cursor-text"
          style={{
            fontSize: 22,
            fontWeight: 400,
            lineHeight: 1,
            letterSpacing: '-1px',
            color: value === null ? 'var(--muted-foreground)' : 'var(--foreground)',
            padding: '3px 3px 4px',
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
        <Plus size={11} strokeWidth={2.5} />
      </CompactCircle>
      {/* .half-label — Sys / Dia tag at the trailing edge in tiny ink-faint. */}
      <span
        aria-hidden
        className="flex-shrink-0 uppercase font-semibold"
        style={{
          fontSize: 9,
          letterSpacing: '0.6px',
          color: 'var(--ink-faint)',
          marginLeft: 2,
        }}
      >
        {shortLabel}
      </span>
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
  // 32×32 hit-target wraps a 26×26 visual circle to satisfy WCAG floor.
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center transition active:scale-[0.94] disabled:opacity-30 flex-shrink-0"
      style={{ width: 32, height: 32 }}
    >
      <span
        className="inline-flex items-center justify-center rounded-full"
        style={{
          width: 26,
          height: 26,
          background: 'transparent',
          border: '1px solid var(--sage-mist)',
          color: 'var(--foreground)',
        }}
      >
        {children}
      </span>
    </button>
  );
}
