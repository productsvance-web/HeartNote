// Dual-stepper for blood pressure: two adjacent half-stepper cards (Sys / Dia)
// with ±1 increment each side. Each half is its own cream card with a
// sage-mist border + 14px radius (mockup .stepper-half). Sys/Dia label
// sits at the trailing edge of each half. No "/" separator between halves.
//
// Trailing register #1 X is OPTIONAL on the dual-stepper — caregivers
// typically tap both numbers together.
//
// BP halves are integer-only (B2 fix); tap-to-type input strips '.'.
//
// Visual register matches docs/design/heartnote-log-redesign-mockup.html
// (.stepper-dual / .stepper-half / .step-btn / .step-value / .half-label).

'use client';

import { Minus, Plus, X } from 'lucide-react';
import { READING_RANGE } from '@/lib/clinical/reading-ranges';
import { NumberChip } from './NumberChip';
import { useHoldRepeat } from './use-hold-repeat';

// Tighter clinical floors for the tap-to-type input. The stepper buttons
// still respect the wider DB-validity ranges in READING_RANGE; these
// floors stop someone typing values incompatible with consciousness.
const SYS_INPUT_MIN = 70;
const DIA_INPUT_MIN = 30;

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
        inputMin={SYS_INPUT_MIN}
        inputMax={sysMax}
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
        inputMin={DIA_INPUT_MIN}
        inputMax={diaMax}
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
  inputMin,
  inputMax,
  onDec,
  onInc,
  onCommit,
  decDisabled,
  incDisabled,
}: {
  label: string;
  shortLabel: string;
  value: number | null;
  // min/max for the ± buttons live on the parent (it does the clamping
  // before calling onDec/onInc); this child only needs the input floor/ceil.
  inputMin: number;
  inputMax: number;
  onDec: () => void;
  onInc: () => void;
  onCommit: (v: number) => void;
  decDisabled: boolean;
  incDisabled: boolean;
}) {
  const decHold = useHoldRepeat(onDec);
  const incHold = useHoldRepeat(onInc);

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
        disabled={decDisabled}
        holdHandlers={decHold}
      >
        <Minus size={11} strokeWidth={2.5} />
      </CompactCircle>
      <NumberChip
        value={value}
        integer
        inputMin={inputMin}
        inputMax={inputMax}
        onChange={onCommit}
        ariaLabel={`Edit ${label}`}
        fontSize={22}
        showDottedUnderline={false}
      />
      <CompactCircle
        ariaLabel={`Increment ${label}`}
        disabled={incDisabled}
        holdHandlers={incHold}
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

function CompactCircle({
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
  // 32×32 hit-target wraps a 26×26 visual circle to satisfy WCAG floor.
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      {...(disabled ? {} : holdHandlers)}
      className="inline-flex items-center justify-center transition active:scale-[0.94] disabled:opacity-30 flex-shrink-0 touch-none"
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
