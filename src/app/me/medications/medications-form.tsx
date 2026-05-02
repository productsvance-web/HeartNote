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
import { UNIT_OPTIONS as ALL_UNITS, unitLabel } from '@/lib/medications/units';

type Mode = 'new' | 'edit';

interface Props {
  mode: Mode;
  medicationId?: string;
  initial?: Partial<MedicationPayload> & {
    isStopped?: boolean;
    allowedStrengths?: AllowedStrengths | null;
  };
  // When provided, the form calls submitAction INSTEAD of addMedication /
  // updateMedication, and onSaved fires on success. Used by the scan flow
  // so saving stays within /me/medications/scan instead of redirecting.
  submitAction?: (payload: MedicationPayload) => Promise<{ ok: boolean; error?: string }>;
  onSaved?: () => void;
  // Optional submit-button label override (e.g., "Add to my list" in scan).
  submitLabel?: string;
}

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
  dosesPerDay: 1,
  scheduleTimes: null,
  startedAt: '',
  notes: '',
};

export function MedicationForm({
  mode,
  medicationId,
  initial,
  submitAction,
  onSaved,
  submitLabel,
}: Props) {
  const initialDoses = initial?.dosesPerDay ?? blank.dosesPerDay;
  const initialDose = parseDose(initial?.dose);
  const [form, setForm] = useState<MedicationPayload>({ ...blank, ...initial });
  const [doseValue, setDoseValue] = useState<string>(initialDose.value);
  const [doseUnit, setDoseUnit] = useState<string>(initialDose.unit);
  const [allowedStrengths, setAllowedStrengths] = useState<AllowedStrengths | null>(
    initial?.allowedStrengths ?? null
  );
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
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

  // Debounced lookup as the caregiver types — fires 500ms after they stop.
  // Skips repeat lookups of the same name. The trim().length >= 3 guard
  // mirrors lookupDrugStrengths server-side so we don't burn requests on
  // single-letter typing. Same call powers both the dose-unit constraint
  // and the spell-correction chip.
  useEffect(() => {
    const name = form.drugName.trim();
    if (name.length < 3 || name === lastLookedUpRef.current) return;
    const timer = setTimeout(() => {
      lastLookedUpRef.current = name;
      void lookupDrugStrengths(name).then((r) => {
        setAllowedStrengths(r.allowedStrengths);
        setSuggestedName(r.suggestedName);
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [form.drugName]);

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
      if (submitAction) {
        const result = await submitAction(payload);
        if (!result.ok) {
          setError(result.error ?? 'Save failed');
        } else {
          onSaved?.();
        }
        return;
      }
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

  // RxNorm's approximate-match returns a corrected name when the typed
  // name is close-but-not-exact. Render a one-tap chip; if the caregiver
  // dismisses (just keeps typing), the insert still classifies correctly
  // server-side because the corrected RxCUI is what reaches RxClass.
  const showSuggestion =
    !!suggestedName &&
    suggestedName.toLowerCase() !== form.drugName.trim().toLowerCase();

  return (
    <div className="space-y-5">
      <Field label="Drug name">
        <input
          autoFocus={mode === 'new'}
          className={inputClass}
          value={form.drugName}
          onChange={(e) => setForm({ ...form, drugName: e.target.value })}
          placeholder="Lasix"
        />
        {showSuggestion && (
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, drugName: suggestedName! }))}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs text-foreground active:bg-muted/70"
          >
            Did you mean <span className="font-semibold">{suggestedName}</span>?
          </button>
        )}
      </Field>

      <div>
        <span className="block text-sm font-medium text-foreground mb-1.5">Dose</span>
        {/* Outer pill holds the number input. Inner white chip floats with
            margin all around (doesn't touch container borders), full-height
            of the inner space, bold typography, properly-cased unit label. */}
        <div className="flex items-stretch rounded-xl border border-border bg-background p-1 focus-within:ring-2 focus-within:ring-ring">
          <input
            type="number"
            inputMode="decimal"
            step="any"
            className="flex-1 min-w-0 bg-transparent border-0 px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
            value={doseValue}
            onChange={(e) => setDoseValue(e.target.value)}
            placeholder="40"
          />
          {unitLocked ? (
            <span
              className="ml-1 flex items-center justify-center w-[80px] rounded-l-none rounded-r-lg bg-white border border-border text-base font-bold text-foreground"
              aria-label={`Unit fixed to ${unitLabel(doseUnit)}`}
            >
              {unitLabel(doseUnit)}
            </span>
          ) : (
            <select
              className="ml-1 w-[80px] rounded-l-none rounded-r-lg bg-white border border-border text-base font-bold text-foreground text-center cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring appearance-none [&::-ms-expand]:hidden"
              value={doseUnit}
              onChange={(e) => setDoseUnit(e.target.value)}
              aria-label="Dose unit"
            >
              {ALL_UNITS.map((u) => (
                <option key={u} value={u}>
                  {unitLabel(u)}
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
          {isPending
            ? 'Saving…'
            : (submitLabel ?? (mode === 'new' ? 'Add medication' : 'Save changes'))}
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
