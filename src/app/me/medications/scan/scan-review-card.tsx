'use client';

import { useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import type { ResolvedMed } from '@/lib/medications/scan/schema';
import { addExtractedMedications, type MedicationPayload } from '../actions';
import { MedicationForm } from '../medications-form';
import { extractedMedToPayload } from './extracted-to-payload';
import { UNIT_OPTIONS as ALL_UNITS, unitLabel } from '@/lib/medications/units';

// Per-card UX (matches plan §Surfaces / scan-review-card):
//   1. Three confirm cells (drug name, dose, doses-per-day) with the
//      extracted values editable inline.
//   2. Once all three cells are confirmed AND non-empty, the card's
//      "Add to my list" button enables.
//   3. Tapping it expands the existing MedicationForm inline, pre-filled
//      with the confirmed cell values. Caregiver can edit additional
//      fields (schedule_times, started_at, notes) before final save.
//   4. Form save calls addExtractedMedications via submitAction so the
//      caregiver stays on /me/medications/scan; onSaved removes the card.
//
// Dose-change-flagged meds skip the cell UX entirely and render a
// non-interactive notice (build convention #6 — never auto-ingest a
// dose change as if it were a stable prescription).

interface Props {
  med: ResolvedMed;
  onSkip: () => void;
  onAdded: () => void;
  // Set when an "Add all" pass is in flight; per-card buttons disable
  // to prevent races with the batch insert.
  disabled?: boolean;
}

export function ScanReviewCard({ med, onSkip, onAdded, disabled }: Props) {
  if (med.is_dose_change) {
    return <DoseChangeNotice drugName={med.drug_name} onSkip={onSkip} />;
  }
  return <EditableCard med={med} onSkip={onSkip} onAdded={onAdded} disabled={disabled} />;
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

function EditableCard({ med, onSkip, onAdded, disabled }: Props) {
  // Prefer RxNorm-derived strength over OCR'd dose when both are present.
  const canonicalDoseSplit = med.strength ? splitStrength(med.strength) : null;
  const initialDoseValue =
    canonicalDoseSplit?.value ??
    (med.dose_value !== null ? String(med.dose_value) : '');
  const initialDoseUnit =
    canonicalDoseSplit?.unit ??
    (med.dose_unit !== null && med.dose_unit.trim().length > 0
      ? med.dose_unit.toLowerCase().trim()
      : 'mg');

  const initialDrugName = med.canonicalName ?? med.drug_name;
  const [drugName, setDrugName] = useState(initialDrugName);
  const [doseValue, setDoseValue] = useState(initialDoseValue);
  const [doseUnit, setDoseUnit] = useState(initialDoseUnit);
  const [dosesPerDay, setDosesPerDay] = useState<number | null>(med.doses_per_day);

  const [drugNameOK, setDrugNameOK] = useState(false);
  const [doseOK, setDoseOK] = useState(false);
  const [dosesOK, setDosesOK] = useState(false);

  const [expanded, setExpanded] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const allConfirmed =
    drugNameOK &&
    doseOK &&
    dosesOK &&
    drugName.trim().length > 0;

  // The form's submitAction; resolves the inserted med via the
  // non-redirecting addExtractedMedications batch action so the
  // caregiver stays on /me/medications/scan.
  async function submitFromForm(payload: MedicationPayload) {
    const result = await addExtractedMedications([payload]);
    if (result.failedIndexes.length === 0) {
      return { ok: true as const };
    }
    return { ok: false as const, error: result.errors[0] ?? 'Could not save.' };
  }

  if (expanded) {
    const initialPayload = extractedMedToPayload({
      drug_name: drugName,
      dose_value: doseValue.trim() ? Number(doseValue) : null,
      dose_unit: doseValue.trim() ? doseUnit : null,
      doses_per_day: dosesPerDay,
      is_dose_change: false,
      ndc: med.ndc,
      rxcui: med.rxcui,
      ingredient: med.ingredient,
      form: med.form,
      strength: med.strength,
      canonicalName: med.canonicalName,
    });
    return (
      <div className="rounded-2xl bg-card shadow-card p-4">
        {formError && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-3">
            {formError}
          </p>
        )}
        <MedicationForm
          mode="new"
          initial={initialPayload}
          submitAction={async (payload) => {
            setFormError(null);
            const result = await submitFromForm(payload);
            if (!result.ok) setFormError(result.error ?? 'Save failed');
            return result;
          }}
          onSaved={onAdded}
          submitLabel="Add to my list"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs text-muted-foreground underline"
          >
            Back to confirm step
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card shadow-card p-4 space-y-3">
      <Cell
        label="Drug name"
        confirmed={drugNameOK}
        onConfirm={() => setDrugNameOK((v) => !v)}
      >
        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
          {med.canonicalName ? 'Verified' : 'Read from label'}
        </p>
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
                {unitLabel(u)}
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

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          disabled={!allConfirmed || disabled}
          className="flex-1 rounded-full bg-foreground text-background px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          Add to my list
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          className="rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

// Split an RxNorm strength like "2.5 MG" or "10 MG/ML" into (value, unit).
// Returns null on unparseable input — caller falls back to OCR.
function splitStrength(s: string): { value: string; unit: string } | null {
  const m = /^(\d+(?:\.\d+)?)\s+(.+)$/.exec(s.trim());
  if (!m) return null;
  return { value: m[1], unit: m[2].toLowerCase() };
}

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
