'use client';

import { useState } from 'react';
import {
  FORM_COUNT_NOUN,
  type DrugDetails,
} from '@/lib/medications/rxnorm';
import { UNIT_OPTIONS, unitLabel } from '@/lib/medications/units';
import type { DrugSelection } from './wizard-types';

interface Props {
  selection: DrugSelection | null;
  form: string | null;
  drugDetails: DrugDetails | null;
  strength: string;
  onChange: (strength: string) => void;
  onContinue: () => void;
}

const PILL_NOUNS = new Set(['tablet', 'capsule']);

export function StepStrength({
  selection,
  form,
  drugDetails,
  strength,
  onChange,
  onContinue,
}: Props) {
  // Manual mode toggles in two cases: caregiver picked Custom chip, or
  // there are no chips to show. Local state remembers their choice when
  // toggling; a `useState` initializer derives from the strength prop on
  // mount so going back to step 3 with a previously-typed value
  // re-enters manual mode automatically.
  const formStrengths = matchingStrengths(drugDetails, form);
  const isPillForm = !!form && PILL_NOUNS.has(FORM_COUNT_NOUN[form]?.single ?? '');
  const showChips = isPillForm && formStrengths.length > 0;
  const matchedChip = showChips
    ? formStrengths.some((s) => formatChipForDose(s) === strength)
    : false;
  const [manualMode, setManualMode] = useState(
    !showChips || (strength.length > 0 && !matchedChip)
  );

  const drugName = selection?.kind === 'rxnorm' || selection?.kind === 'custom'
    ? selection.name
    : '';

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {drugName}
        {form ? ` · ${form}` : ''}
      </p>
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

      <div className="pt-4">
        <button
          type="button"
          onClick={onContinue}
          disabled={strength.trim().length === 0}
          className="w-full rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// Manual number + unit field. Splits the formatted dose string on the
// space between value and unit so the controls re-hydrate when a user
// goes back to step 3.
function ManualStrength({
  strength,
  onChange,
  fallback,
}: {
  strength: string;
  onChange: (next: string) => void;
  fallback: boolean;
}) {
  const initialValue = strength.trim().split(/\s+/)[0] ?? '';
  const initialUnit = strength.trim().split(/\s+/).slice(1).join(' ').toLowerCase() || (fallback ? 'mg' : '%');
  const [value, setValue] = useState(initialValue);
  const [unit, setUnit] = useState(initialUnit);

  function emit(nextValue: string, nextUnit: string) {
    setValue(nextValue);
    setUnit(nextUnit);
    onChange(nextValue.trim() ? `${nextValue.trim()} ${nextUnit}` : '');
  }

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

// RxNorm strengths are uppercase ("40 MG", "0.5 G/ML"). The medications
// table stores doses in caregiver-readable case ("40 mg") — match that.
function formatChipForDose(strength: string): string {
  return strength.replace(/\b(MG|MCG|G|ML|L|MEQ)\b/g, (m) => m.toLowerCase());
}
