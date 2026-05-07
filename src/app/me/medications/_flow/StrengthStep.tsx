'use client';

import { useState } from 'react';
import {
  FORM_COUNT_NOUN,
  type DrugDetails,
} from '@/lib/medications/rxnorm';
import { UNIT_OPTIONS, unitLabel } from '@/lib/medications/units';
import { MedFlowChrome } from './MedFlowChrome';
import type { DrugSelection } from './flow-types';

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

const PILL_NOUNS = new Set(['tablet', 'capsule']);

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
  const isPillForm = !!form && PILL_NOUNS.has(FORM_COUNT_NOUN[form]?.single ?? '');
  const showChips = isPillForm && formStrengths.length > 0;
  const matchedChip = showChips
    ? formStrengths.some((s) => formatChipForDose(s) === strength)
    : false;
  const [manualMode, setManualMode] = useState(
    !showChips || (strength.length > 0 && !matchedChip)
  );

  // No auto-prefill on manual entry — user explicitly opts into a strength
  // (per the unification plan; mirrors Apple Health's behavior). Scan flow
  // bypasses this step entirely when OCR resolved a strength.

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
        <h1 className="font-display text-2xl text-foreground">Add the medication strength.</h1>

        {showChips && !manualMode && (
          <div className="space-y-3">
            <ul className="grid grid-cols-3 gap-2">
              {formStrengths.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => onChange(formatChipForDose(s))}
                    className={`w-full rounded-full border px-3 py-2.5 text-sm ${
                      strength === formatChipForDose(s)
                        ? 'border-foreground bg-foreground/5 text-foreground'
                        : 'border-border bg-card text-foreground'
                    }`}
                  >
                    {formatChipForDose(s)}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => setManualMode(true)}
                  className="w-full rounded-full border border-dashed border-border bg-card px-3 py-2.5 text-sm text-foreground"
                >
                  Custom
                </button>
              </li>
            </ul>
          </div>
        )}

        {(!showChips || manualMode) && (
          <ManualStrength
            strength={strength}
            onChange={onChange}
            fallback={!showChips}
          />
        )}

        {showChips && manualMode && (
          <button
            type="button"
            onClick={() => setManualMode(false)}
            className="text-xs text-muted-foreground underline"
          >
            Use a listed strength
          </button>
        )}

        {!showChips && drugDetails && drugDetails.forms.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Strength options unavailable; enter manually.
          </p>
        )}
      </div>
    </MedFlowChrome>
  );
}

// Manual number + unit field. Fully controlled — value+unit are derived
// from the parent's `strength` prop on every render. Internal state
// mirroring the prop class hid the OCR-sourced strength on first paint
// (prefill fires post-mount, but useState initializers had already
// captured the empty value). Splitting on each render is cheap and
// removes the prop-vs-state divergence class entirely.
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
function formatChipForDose(strength: string): string {
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
