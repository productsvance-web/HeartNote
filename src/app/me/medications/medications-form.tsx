'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  addMedication,
  updateMedication,
  stopMedication,
  restartMedication,
  lookupDrugStrengths,
} from './actions';
import type { MedicationPayload } from './actions';
import type { AllowedStrengths } from '@/lib/medications/classify';
import { MED_CLASS_ORDER, type MedClass } from '@/lib/medications/classes';

type Mode = 'new' | 'edit';

interface Props {
  mode: Mode;
  medicationId?: string;
  initial?: Partial<MedicationPayload> & {
    isStopped?: boolean;
    allowedStrengths?: AllowedStrengths | null;
  };
}

// Default unit list shown when RxNorm hasn't classified the drug. Matches
// the regex in actions.ts; keep in sync if either changes.
const ALL_UNITS = [
  'mg',
  'mcg',
  'g',
  'mL',
  'L',
  'units',
  'tablet',
  'capsule',
  'puff',
  'drop',
  'tsp',
  'tbsp',
] as const;

const DOSE_PARSE = /^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s*$/;

function parseDose(dose: string | undefined): { value: string; unit: string } {
  if (!dose) return { value: '', unit: 'mg' };
  const m = DOSE_PARSE.exec(dose);
  if (!m) return { value: '', unit: 'mg' };
  return { value: m[1], unit: m[2] };
}

const blank: MedicationPayload = {
  drugName: '',
  dose: '',
  frequency: '',
  dosesPerDay: 1,
  scheduleTimes: null,
  startedAt: '',
  notes: '',
};

export function MedicationForm({ mode, medicationId, initial }: Props) {
  const initialDoses = initial?.dosesPerDay ?? blank.dosesPerDay;
  const initialDose = parseDose(initial?.dose);
  const [form, setForm] = useState<MedicationPayload>({ ...blank, ...initial });
  const [doseValue, setDoseValue] = useState<string>(initialDose.value);
  const [doseUnit, setDoseUnit] = useState<string>(initialDose.unit);
  const [allowedStrengths, setAllowedStrengths] = useState<AllowedStrengths | null>(
    initial?.allowedStrengths ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const lastLookedUpRef = useRef<string | null>(null);

  const dosesPerDayChanged = mode === 'edit' && form.dosesPerDay !== initialDoses;
  const willClearSchedule =
    dosesPerDayChanged && (initial?.scheduleTimes?.length ?? 0) > 0;

  // When allowedStrengths changes (drug classified), reconcile doseUnit.
  // If user's current unit isn't in the allowed list, snap to the allowed one.
  useEffect(() => {
    if (allowedStrengths) {
      const allowed = allowedStrengths.unit.toLowerCase();
      if (doseUnit.toLowerCase() !== allowed) {
        setDoseUnit(allowed);
      }
    }
  }, [allowedStrengths, doseUnit]);

  // Lookup drug strengths on drug-name blur. Skips repeat lookups of the
  // same name (cheap guard against accidental refires).
  function lookupStrengthsForCurrent() {
    const name = form.drugName.trim();
    if (!name || name === lastLookedUpRef.current) return;
    lastLookedUpRef.current = name;
    void lookupDrugStrengths(name).then((r) => {
      setAllowedStrengths(r.allowedStrengths);
    });
  }

  function setDosesPerDay(n: number | null) {
    setForm((f) => {
      let nextSchedule: string[] | null = null;
      if (n !== null && f.scheduleTimes !== null) {
        const truncated = f.scheduleTimes.slice(0, n);
        const padded = [...truncated, ...Array(Math.max(0, n - truncated.length)).fill('')];
        nextSchedule = padded;
      }
      return { ...f, dosesPerDay: n, scheduleTimes: nextSchedule };
    });
  }

  function addScheduleTime() {
    setForm((f) => {
      if (f.dosesPerDay === null) return f;
      return { ...f, scheduleTimes: Array(f.dosesPerDay).fill('') };
    });
  }

  function setTimeAt(index: number, value: string) {
    setForm((f) => {
      if (f.dosesPerDay === null) return f;
      const start = f.scheduleTimes ?? Array(f.dosesPerDay).fill('');
      const next = [...start];
      next[index] = value;
      return { ...f, scheduleTimes: next };
    });
  }

  function clearAllTimes() {
    setForm((f) => ({ ...f, scheduleTimes: null }));
  }

  function submit() {
    setError(null);
    const cleanedTimes =
      form.scheduleTimes && form.scheduleTimes.every((t) => t.trim().length > 0)
        ? form.scheduleTimes
        : null;
    const dose = doseValue.trim() ? `${doseValue.trim()} ${doseUnit}` : '';
    const payload: MedicationPayload = { ...form, dose, scheduleTimes: cleanedTimes };

    startTransition(async () => {
      const result =
        mode === 'new'
          ? await addMedication(payload)
          : await updateMedication(medicationId!, payload, dosesPerDayChanged);
      if (!result.ok) setError(result.error);
    });
  }

  function onStop() {
    if (!medicationId) return;
    startTransition(async () => {
      const result = await stopMedication(medicationId);
      if (!result.ok) setError(result.error);
    });
  }

  function onRestart() {
    if (!medicationId) return;
    startTransition(async () => {
      const result = await restartMedication(medicationId);
      if (!result.ok) setError(result.error);
    });
  }

  const unitLocked = allowedStrengths !== null;
  const knownStrengths = allowedStrengths?.values
    .slice(0, 3)
    .map((v) => `${v} ${allowedStrengths.unit.toLowerCase()}`)
    .join(', ');

  return (
    <div className="space-y-5">
      <Field label="Drug name">
        <input
          autoFocus={mode === 'new'}
          className={inputClass}
          value={form.drugName}
          onChange={(e) => setForm({ ...form, drugName: e.target.value })}
          onBlur={lookupStrengthsForCurrent}
          placeholder="Lasix"
        />
      </Field>

      <div>
        <span className="block text-sm font-medium text-foreground mb-1.5">Dose</span>
        {/* Single pill: number input fills the left; unit chip flush-right,
            full-height, white, square on the left (abuts input), rounded
            on the right to match the container's pill shape. */}
        <div className="flex items-stretch rounded-xl border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
          <input
            type="number"
            inputMode="decimal"
            step="any"
            className="flex-1 min-w-0 bg-transparent border-0 px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
            value={doseValue}
            onChange={(e) => setDoseValue(e.target.value)}
            placeholder="40"
          />
          {unitLocked ? (
            <span
              className="flex items-center justify-center px-5 bg-white border-l border-border text-base font-bold text-foreground min-w-[72px]"
              aria-label={`Unit fixed to ${doseUnit}`}
            >
              {doseUnit}
            </span>
          ) : (
            <select
              className="px-5 bg-white border-l border-border text-base font-bold text-foreground cursor-pointer focus:outline-none min-w-[88px]"
              value={doseUnit}
              onChange={(e) => setDoseUnit(e.target.value)}
              aria-label="Dose unit"
            >
              {ALL_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          )}
        </div>
        {knownStrengths && (
          <p className="text-xs text-muted-foreground mt-1.5">
            Comes in {knownStrengths}
          </p>
        )}
      </div>

      <Field label="Frequency" hint="Free-form. Example: every morning">
        <input
          className={inputClass}
          value={form.frequency ?? ''}
          onChange={(e) => setForm({ ...form, frequency: e.target.value })}
          placeholder="every morning"
        />
      </Field>

      <Field label="Doses per day">
        <select
          className={inputClass}
          value={form.dosesPerDay === null ? 'prn' : String(form.dosesPerDay)}
          onChange={(e) =>
            setDosesPerDay(e.target.value === 'prn' ? null : Number(e.target.value))
          }
        >
          <option value="prn">As needed (PRN)</option>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}× per day
            </option>
          ))}
        </select>
      </Field>

      {willClearSchedule && (
        <p className="text-xs text-muted-foreground bg-muted/60 rounded-lg px-3 py-2">
          Heads up: changing doses-per-day will clear the existing time schedule.
        </p>
      )}

      {form.dosesPerDay !== null && (
        <Field label="Times (optional)" hint="Leave blank if you don't track exact times.">
          {form.scheduleTimes === null ? (
            <button
              type="button"
              className="text-sm text-foreground underline underline-offset-2"
              onClick={addScheduleTime}
            >
              Add times
            </button>
          ) : (
            <div className="space-y-2">
              {Array.from({ length: form.dosesPerDay }, (_, i) => (
                <input
                  key={i}
                  type="time"
                  className={inputClass}
                  value={form.scheduleTimes?.[i] ?? ''}
                  onChange={(e) => setTimeAt(i, e.target.value)}
                />
              ))}
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={clearAllTimes}
              >
                Remove time schedule
              </button>
            </div>
          )}
        </Field>
      )}

      <Field label="Started" hint="Optional">
        <input
          type="date"
          className={inputClass}
          value={form.startedAt ?? ''}
          onChange={(e) => setForm({ ...form, startedAt: e.target.value })}
        />
      </Field>

      <Field label="Notes" hint="Anything the prescriber said worth remembering.">
        <textarea
          className={inputClass}
          rows={3}
          value={form.notes ?? ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </Field>

      {mode === 'edit' && (
        <Field label="Drug class">
          <select
            className={inputClass}
            value={form.drugClass ?? 'other'}
            onChange={(e) => setForm({ ...form, drugClass: e.target.value as MedClass })}
          >
            {MED_CLASS_ORDER.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !form.drugName.trim()}
          className="flex-1 rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold disabled:opacity-50"
        >
          {isPending ? 'Saving…' : mode === 'new' ? 'Add medication' : 'Save changes'}
        </button>
      </div>

      {mode === 'edit' && medicationId && (
        <div className="border-t border-border pt-4 mt-6 space-y-3">
          {initial?.isStopped ? (
            <button
              type="button"
              onClick={onRestart}
              disabled={isPending}
              className="w-full rounded-full border border-border px-6 py-3 text-sm font-medium"
            >
              Restart this medication
            </button>
          ) : (
            <button
              type="button"
              onClick={onStop}
              disabled={isPending}
              className="w-full rounded-full border border-destructive/50 text-destructive px-6 py-3 text-sm font-medium"
            >
              Stop taking this
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-foreground mb-1.5">{label}</span>
      {hint && <span className="block text-xs text-muted-foreground mb-1.5">{hint}</span>}
      {children}
    </label>
  );
}
