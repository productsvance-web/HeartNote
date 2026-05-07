'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { type DrugDetails } from '@/lib/medications/rxnorm';
import { UNIT_OPTIONS, unitLabel } from '@/lib/medications/units';
import { MedFlowChrome } from './MedFlowChrome';
import type { DrugSelection } from './flow-types';

// Apple Health's pattern for the strength screen: one full-width row per
// available strength, single column inside a card, checkmark on the right
// when selected. "Add Custom" is a tertiary link below the list — opens
// a number+unit input. Falls back to the input directly when there's no
// list to show (custom-name drug, fetch failure, no strengths for the
// chosen form).

interface Props {
  selection: DrugSelection;
  form: string | null;
  drugDetails: DrugDetails | null;
  strength: string;
  onChange: (strength: string) => void;
  onContinue: () => void;
  onBack: () => void;
  onClose: () => void;
}

export function StrengthStep({
  selection,
  form,
  drugDetails,
  strength,
  onChange,
  onContinue,
  onBack,
  onClose,
}: Props) {
  const formStrengths = matchingStrengths(drugDetails, form);
  const hasList = formStrengths.length > 0;
  const matchedRow =
    hasList && formStrengths.some((s) => formatStrengthForDose(s) === strength);
  // Custom mode: caregiver tapped "Add Custom" or there's no list to show.
  // Initialized once at mount; toggling between modes is explicit.
  const [customMode, setCustomMode] = useState(
    !hasList || (strength.length > 0 && !matchedRow)
  );

  return (
    <MedFlowChrome
      title={selection.name}
      subtitle={form}
      onBack={onBack}
      onClose={onClose}
      primaryLabel="Continue"
      primaryDisabled={strength.trim().length === 0}
      onPrimary={onContinue}
    >
      <div className="space-y-4">
        <h1 className="font-display text-2xl text-foreground">Choose the medication strength.</h1>

        {hasList && !customMode && (
          <ul className="rounded-2xl bg-card shadow-card divide-y divide-border overflow-hidden">
            {formStrengths.map((s) => {
              const formatted = formatStrengthForDose(s);
              const selected = strength === formatted;
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => onChange(formatted)}
                    className="w-full text-left px-4 py-3.5 text-base text-foreground flex items-center justify-between gap-3"
                  >
                    <span>{formatted}</span>
                    {selected && <Check size={18} className="text-foreground" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {hasList && !customMode && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              You can add a custom medication if strength is not available.
            </p>
            <button
              type="button"
              onClick={() => {
                setCustomMode(true);
                onChange('');
              }}
              className="text-sm font-semibold text-primary"
            >
              Add Custom
            </button>
          </div>
        )}

        {(!hasList || customMode) && (
          <ManualStrength
            strength={strength}
            onChange={onChange}
            fallback={!hasList}
          />
        )}

        {hasList && customMode && (
          <button
            type="button"
            onClick={() => setCustomMode(false)}
            className="text-xs text-muted-foreground underline"
          >
            Use a listed strength
          </button>
        )}
      </div>
    </MedFlowChrome>
  );
}

// Manual number + unit field. Fully controlled — value+unit are derived
// from the parent's `strength` prop on every render so OCR-sourced
// values arriving post-mount are visible without internal-state drift.
function ManualStrength({
  strength,
  onChange,
  fallback,
}: {
  strength: string;
  onChange: (next: string) => void;
  fallback: boolean;
}) {
  const trimmed = strength.trim();
  const value = trimmed.split(/\s+/)[0] ?? '';
  const unit =
    trimmed.split(/\s+/).slice(1).join(' ').toLowerCase() ||
    (fallback ? '%' : 'mg');

  function emit(nextValue: string, nextUnit: string) {
    onChange(nextValue.trim() ? `${nextValue.trim()} ${nextUnit}` : '');
  }

  const knownUnits = UNIT_OPTIONS.map((u) => u.toLowerCase()) as string[];
  const extraUnit =
    unit && unit !== '%' && !knownUnits.includes(unit) ? unit : null;

  return (
    <div className="flex gap-2">
      <input
        type="number"
        inputMode="decimal"
        step="any"
        className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        value={value}
        onChange={(e) => emit(e.target.value, unit)}
        placeholder="40"
      />
      <select
        className="w-[90px] rounded-xl border border-border bg-background px-3 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        value={unit}
        onChange={(e) => emit(value, e.target.value)}
      >
        {extraUnit && <option value={extraUnit}>{extraUnit}</option>}
        {UNIT_OPTIONS.map((u) => (
          <option key={u} value={u.toLowerCase()}>
            {unitLabel(u)}
          </option>
        ))}
        <option value="%">%</option>
      </select>
    </div>
  );
}

function matchingStrengths(drugDetails: DrugDetails | null, form: string | null): string[] {
  if (!drugDetails || !form) return [];
  return drugDetails.forms.find((f) => f.name === form)?.strengths ?? [];
}

// RxNorm strengths are uppercase ("40 MG"). The medications table stores
// doses in caregiver-readable case ("40 mg") — match that. Sub-1-mg
// leading values get rewritten to micrograms ("0.09 MG/ACTUAT" →
// "90 mcg/actuat") because that's how the inhaler label reads.
function formatStrengthForDose(strength: string): string {
  const promoted = strength.replace(
    /^(\d+(?:\.\d+)?)\s+MG\b/i,
    (match, num) => {
      const value = parseFloat(num);
      if (!Number.isFinite(value) || value >= 1) return match;
      // Preserve one decimal so half-mcg strengths (levothyroxine 12.5
      // mcg = 0.0125 MG) survive the conversion. Round-half-up at the
      // 0.1-mcg place; trim a trailing ".0" so "90.0 MCG" reads as "90
      // MCG".
      const mcg = Math.round(value * 10000) / 10;
      const display = Number.isInteger(mcg) ? String(mcg) : mcg.toFixed(1);
      return `${display} MCG`;
    }
  );
  return promoted.replace(/\b(MG|MCG|G|ML|L|MEQ)\b/g, (m) => m.toLowerCase());
}
