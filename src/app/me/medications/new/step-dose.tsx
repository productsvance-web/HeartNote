'use client';

import { FORM_COUNT_NOUN } from '@/lib/medications/rxnorm';

interface Props {
  form: string | null;
  pillsPerDose: number;
  dosesPerDay: number | null;
  onChange: (patch: { pillsPerDose?: number; dosesPerDay?: number | null }) => void;
  onContinue: () => void;
}

export function StepDose({
  form,
  pillsPerDose,
  dosesPerDay,
  onChange,
  onContinue,
}: Props) {
  // Forms that aren't in the noun map (cream, oral solution, etc.) skip
  // the count question. The strength field already encodes "how much" for
  // those — asking "how many creams per dose" makes no sense.
  const noun = form ? FORM_COUNT_NOUN[form] : undefined;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl text-foreground">How is it taken?</h1>

      {noun && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            How many {noun.plural} per dose?
          </label>
          <select
            value={String(pillsPerDose)}
            onChange={(e) => onChange({ pillsPerDose: Number(e.target.value) })}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? noun.single : noun.plural}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          How often per day?
        </label>
        <select
          value={dosesPerDay === null ? 'prn' : String(dosesPerDay)}
          onChange={(e) =>
            onChange({
              dosesPerDay: e.target.value === 'prn' ? null : Number(e.target.value),
            })
          }
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="prn">As needed (PRN)</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}× per day
            </option>
          ))}
        </select>
      </div>

      <div className="pt-4">
        <button
          type="button"
          onClick={onContinue}
          className="w-full rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
