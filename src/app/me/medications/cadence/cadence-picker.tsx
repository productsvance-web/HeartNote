'use client';

import { Check } from 'lucide-react';
import type { CadenceKind } from '@/lib/medications/cadence';

interface Row {
  kind: CadenceKind;
  title: string;
  tagline: string;
}

const ROWS: Row[] = [
  { kind: 'every_day',      title: 'Every Day',                  tagline: 'Take dose at the same time.' },
  { kind: 'cyclical',       title: 'On a Cyclical Schedule',     tagline: 'Take every day for 21 days and pause for 7 days.' },
  { kind: 'specific_days',  title: 'On Specific Days of the Week', tagline: 'On Mondays, On Weekdays.' },
  { kind: 'every_few_days', title: 'Every Few Days',             tagline: 'Every other day, Every 3 days.' },
  { kind: 'as_needed',      title: 'As Needed',                  tagline: 'No fixed schedule.' },
];

interface Props {
  selected: CadenceKind | null;
  onSelect: (kind: CadenceKind) => void;
  onContinue: () => void;
  onCancel?: () => void;
  onSkip?: () => void;
}

export function CadencePicker({ selected, onSelect, onContinue, onCancel, onSkip }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Schedule</h2>
        <p className="text-xs text-muted-foreground mt-1">How often is this medication taken?</p>
      </div>

      <ul className="rounded-2xl bg-card shadow-card divide-y divide-border overflow-hidden">
        {ROWS.map((row) => {
          const isSelected = selected === row.kind;
          return (
            <li key={row.kind}>
              <button
                type="button"
                onClick={() => onSelect(row.kind)}
                className="w-full text-left px-4 py-3 flex items-center gap-3"
                aria-pressed={isSelected}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-foreground">{row.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{row.tagline}</p>
                </div>
                {isSelected && <Check size={18} className="text-foreground shrink-0" />}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border border-border px-6 py-3 text-sm font-medium"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={onContinue}
          disabled={selected === null}
          className="flex-1 rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold disabled:opacity-50"
        >
          Continue
        </button>
      </div>

      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="w-full text-center text-xs text-muted-foreground underline"
        >
          Skip — save without a schedule
        </button>
      )}
    </div>
  );
}
