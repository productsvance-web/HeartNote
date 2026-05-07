'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { type DrugDetails } from '@/lib/medications/rxnorm';
import { MedFlowChrome } from './MedFlowChrome';
import type { DrugSelection } from './flow-types';

// Apple Health's strength screen has two distinct shapes based on whether
// their drug DB has known strengths for the (drug, form) pair:
//
//   Known strengths  → "Choose the medication strength."
//                       Single-column row list (one row per strength,
//                       checkmark on the right when selected) inside a
//                       card. "Add Custom" tertiary link below the list.
//                       No Skip.
//
//   No strengths     → "Add the medication strength."
//                       Stacked sections: a single-line "Strength" text
//                       input above, then a "Choose Unit" row list below.
//                       Next + Skip buttons in the footer.
//
// We replicate both shapes so the manual-entry path mirrors what Apple
// does (which is what the caregiver will compare against on iPhone).

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

// Units offered in the manual-input branch. Hand-listed (not derived from
// UNIT_OPTIONS) because UNIT_OPTIONS includes quantity nouns (tablet,
// capsule, puff, drop, tsp, tbsp) that are nonsensical as strength units
// — "40 tablet" is meaningless. Apple Health's manual screen shows only
// mass / volume / percent units, which is what makes physical sense for
// a concentration or unit-dose strength.
const MANUAL_UNITS: readonly string[] = ['mg', 'mcg', 'g', 'mL', '%'];

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

  // Tri-state so the manual/list decision stays reactive to drugDetails
  // arriving post-mount. 'auto' is the default — manual when there's no
  // list yet OR the existing strength doesn't match a row; list mode
  // otherwise. The user can override by tapping "Add Custom" → 'custom',
  // or "Use a listed strength" → 'list'. A single useState(boolean) here
  // would latch at mount-time and keep a fast user stuck in manual when
  // RxNorm responds late.
  const [customToggle, setCustomToggle] = useState<'auto' | 'custom' | 'list'>(
    'auto'
  );
  const inManual =
    customToggle === 'custom' ||
    (customToggle === 'auto' && (!hasList || (strength.length > 0 && !matchedRow)));
  const titleText = inManual
    ? 'Add the medication strength.'
    : 'Choose the medication strength.';

  // Manual-mode strength is parsed back into a value+unit pair on every
  // render — fully controlled, no internal state to drift with prop
  // updates.
  const trimmed = strength.trim();
  const manualValue = trimmed.split(/\s+/)[0] ?? '';
  const manualUnit =
    trimmed.split(/\s+/).slice(1).join(' ').toLowerCase() ||
    (form ? 'mg' : '%');

  function emitManual(nextValue: string, nextUnit: string) {
    onChange(nextValue.trim() ? `${nextValue.trim()} ${nextUnit}` : '');
  }

  function skip() {
    onChange('');
    onContinue();
  }

  // Subtitle reactively appends the selected strength so the chrome
  // mirrors Apple Health's pattern: the user sees "Injection Solution, 1
  // mg / 4 ml" on the strength screen as soon as the row is checked,
  // before tapping Next.
  const subtitle = buildSubtitle(form, strength);

  return (
    <MedFlowChrome
      title={selection.name}
      subtitle={subtitle}
      onBack={onBack}
      onClose={onClose}
      primaryLabel="Next"
      primaryDisabled={strength.trim().length === 0}
      onPrimary={onContinue}
      secondaryLabel={inManual ? 'Skip' : undefined}
      onSecondary={inManual ? skip : undefined}
    >
      <div className="space-y-5">
        <h1 className="font-display text-2xl text-foreground">{titleText}</h1>

        {hasList && !inManual && (
          <>
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

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                You can add a custom medication if strength is not available.
              </p>
              <button
                type="button"
                onClick={() => {
                  setCustomToggle('custom');
                  onChange('');
                }}
                className="text-sm font-semibold text-primary"
              >
                Add Custom
              </button>
            </div>
          </>
        )}

        {inManual && (
          <>
            <div>
              <p className="text-base font-semibold text-foreground mb-2">Strength</p>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={manualValue}
                onChange={(e) => emitManual(e.target.value, manualUnit)}
                placeholder="Add Strength"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <p className="text-base font-semibold text-foreground mb-2">Choose Unit</p>
              <ul className="rounded-2xl bg-card shadow-card divide-y divide-border overflow-hidden">
                {MANUAL_UNITS.map((u) => {
                  const lower = u.toLowerCase();
                  const selected = manualUnit === lower;
                  return (
                    <li key={u}>
                      <button
                        type="button"
                        onClick={() => emitManual(manualValue, lower)}
                        className="w-full text-left px-4 py-3.5 text-base text-foreground flex items-center justify-between gap-3"
                      >
                        <span>{u}</span>
                        {selected && <Check size={18} className="text-foreground" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}

        {hasList && inManual && (
          <button
            type="button"
            onClick={() => {
              setCustomToggle('list');
              onChange('');
            }}
            className="text-xs text-muted-foreground underline"
          >
            Use a listed strength
          </button>
        )}
      </div>
    </MedFlowChrome>
  );
}

function buildSubtitle(form: string | null, strength: string): string | null {
  const strengthLabel = strength.trim().length > 0 ? strength.trim() : null;
  if (form && strengthLabel) return `${form}, ${strengthLabel}`;
  if (form) return form;
  if (strengthLabel) return strengthLabel;
  return null;
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
