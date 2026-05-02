'use client';

import { useState, useTransition } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import type { ExtractedMed } from '@/lib/medications/scan/schema';
import { addExtractedMedications, type MedicationPayload } from '../actions';
import { extractedMedToPayload } from './extracted-to-payload';

// Per-card UX:
//   - Three field cells (drug name, dose, doses-per-day). Each cell shows
//     its extracted value editable inline, plus a Confirm checkbox.
//   - Once all three cells are confirmed AND non-empty, the card's
//     "Add to my list" button enables.
//   - Saves via addExtractedMedications([payload]) — non-redirecting so
//     the parent ScanClient can keep working through other cards.
//   - Dose-change-flagged meds skip the cell UX entirely and render a
//     non-interactive notice (build convention #6).

interface Props {
  med: ExtractedMed;
  onSkip: () => void;
  onAdded: () => void;
}

const ALL_UNITS = [
  'mg', 'mcg', 'g', 'mL', 'L', 'units',
  'tablet', 'capsule', 'puff', 'drop', 'tsp', 'tbsp',
] as const;

const UNIT_LABELS: Record<string, string> = {
  mg: 'mg', mcg: 'mcg', g: 'g', ml: 'mL', l: 'L',
  units: 'Units', tablet: 'Tablet', capsule: 'Capsule',
  puff: 'Puff', drop: 'Drop', tsp: 'tsp', tbsp: 'tbsp',
};

export function ScanReviewCard({ med, onSkip, onAdded }: Props) {
  if (med.is_dose_change) {
    return <DoseChangeNotice drugName={med.drug_name} onSkip={onSkip} />;
  }
  return <EditableCard med={med} onSkip={onSkip} onAdded={onAdded} />;
}

function DoseChangeNotice({
  drugName,
  onSkip,
}: {
  drugName: string;
  onSkip: () => void;
}) {
  return (
    <div className="rounded-2xl bg-card shadow-card p-4 border border-border">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="text-foreground mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-foreground">{drugName}</p>
          <p className="text-xs text-muted-foreground mt-1">
            This label has dose-change instructions. Confirm with the prescriber and add manually.
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground underline"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function EditableCard({ med, onSkip, onAdded }: Props) {
  const initialDoseValue =
    med.dose_value !== null ? String(med.dose_value) : '';
  const initialDoseUnit =
    med.dose_unit !== null && med.dose_unit.trim().length > 0
      ? med.dose_unit.toLowerCase().trim()
      : 'mg';

  const [drugName, setDrugName] = useState(med.drug_name);
  const [doseValue, setDoseValue] = useState(initialDoseValue);
  const [doseUnit, setDoseUnit] = useState(initialDoseUnit);
  const [dosesPerDay, setDosesPerDay] = useState<number | null>(med.doses_per_day);

  const [drugNameOK, setDrugNameOK] = useState(false);
  const [doseOK, setDoseOK] = useState(false);
  const [dosesOK, setDosesOK] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allConfirmed =
    drugNameOK &&
    doseOK &&
    dosesOK &&
    drugName.trim().length > 0;

  function save() {
    setError(null);
    const payload: MedicationPayload = extractedMedToPayload({
      drug_name: drugName,
      dose_value: doseValue.trim() ? Number(doseValue) : null,
      dose_unit: doseValue.trim() ? doseUnit : null,
      doses_per_day: dosesPerDay,
      is_dose_change: false,
    });
    startTransition(async () => {
      const result = await addExtractedMedications([payload]);
      if (result.failedIndexes.length === 0) {
        onAdded();
      } else {
        setError(result.errors[0] ?? 'Could not save.');
      }
    });
  }

  return (
    <div className="rounded-2xl bg-card shadow-card p-4 space-y-3">
      <Cell
        label="Drug name"
        confirmed={drugNameOK}
        onConfirm={() => setDrugNameOK((v) => !v)}
      >
        <input
          className={inputClass}
          value={drugName}
          onChange={(e) => {
            setDrugName(e.target.value);
            setDrugNameOK(false);
          }}
          placeholder="Lasix"
        />
      </Cell>

      <Cell
        label="Dose"
        confirmed={doseOK}
        onConfirm={() => setDoseOK((v) => !v)}
      >
        <div className="flex gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="any"
            className={`${inputClass} flex-1`}
            value={doseValue}
            onChange={(e) => {
              setDoseValue(e.target.value);
              setDoseOK(false);
            }}
            placeholder="40"
          />
          <select
            className={`${inputClass} w-[90px]`}
            value={doseUnit}
            onChange={(e) => {
              setDoseUnit(e.target.value);
              setDoseOK(false);
            }}
          >
            {ALL_UNITS.map((u) => (
              <option key={u} value={u.toLowerCase()}>
                {UNIT_LABELS[u.toLowerCase()] ?? u}
              </option>
            ))}
          </select>
        </div>
      </Cell>

      <Cell
        label="Doses per day"
        confirmed={dosesOK}
        onConfirm={() => setDosesOK((v) => !v)}
      >
        <select
          className={inputClass}
          value={dosesPerDay === null ? 'prn' : String(dosesPerDay)}
          onChange={(e) => {
            setDosesPerDay(e.target.value === 'prn' ? null : Number(e.target.value));
            setDosesOK(false);
          }}
        >
          <option value="prn">As needed (PRN)</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}× per day
            </option>
          ))}
        </select>
      </Cell>

      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={!allConfirmed || isPending}
          className="flex-1 rounded-full bg-foreground text-background px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {isPending ? 'Adding…' : 'Add to my list'}
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={isPending}
          className="rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

function Cell({
  label,
  confirmed,
  onConfirm,
  children,
}: {
  label: string;
  confirmed: boolean;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={onConfirm}
          aria-label={confirmed ? 'Mark not confirmed' : 'Confirm'}
          className={
            confirmed
              ? 'flex items-center gap-1 rounded-full bg-foreground text-background px-2.5 py-1 text-xs font-semibold'
              : 'flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground'
          }
        >
          <Check size={12} />
          {confirmed ? 'Confirmed' : 'Confirm'}
        </button>
      </div>
      {children}
    </div>
  );
}
