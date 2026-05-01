'use client';

import { useState, useTransition } from 'react';
import { addMedication, updateMedication, stopMedication, restartMedication } from './actions';
import type { MedicationPayload } from './actions';
import type { Database } from '@/lib/supabase/types';

type MedClass = Database['public']['Enums']['med_class'];

const MED_CLASS_OPTIONS: { value: MedClass; label: string }[] = [
  { value: 'loop_diuretic', label: 'Loop diuretic' },
  { value: 'ace_inhibitor', label: 'ACE inhibitor' },
  { value: 'arb', label: 'ARB' },
  { value: 'arni', label: 'ARNI' },
  { value: 'beta_blocker', label: 'Beta blocker' },
  { value: 'mra', label: 'MRA' },
  { value: 'sglt2_inhibitor', label: 'SGLT2 inhibitor' },
  { value: 'digoxin', label: 'Digoxin' },
  { value: 'antiarrhythmic', label: 'Antiarrhythmic' },
  { value: 'anticoagulant_warfarin', label: 'Warfarin' },
  { value: 'anticoagulant_doac', label: 'DOAC anticoagulant' },
  { value: 'potassium_supplement', label: 'Potassium supplement' },
  { value: 'other', label: 'Other' },
];

type Mode = 'new' | 'edit';

interface Props {
  mode: Mode;
  medicationId?: string;
  initial?: Partial<MedicationPayload> & { isStopped?: boolean };
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
  const [form, setForm] = useState<MedicationPayload>({
    ...blank,
    ...initial,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dosesPerDayChanged = mode === 'edit' && form.dosesPerDay !== initialDoses;
  const willClearSchedule =
    dosesPerDayChanged && (initial?.scheduleTimes?.length ?? 0) > 0;

  function setDosesPerDay(n: number | null) {
    setForm((f) => {
      // Adjust schedule_times length to match the new dose count.
      // - PRN → null
      // - smaller count → truncate
      // - larger count → pad with empty strings (optional)
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
      const start = f.scheduleTimes ?? Array(f.dosesPerDay).fill('');
      return { ...f, scheduleTimes: start.map((t, i) => (i === 0 && !t ? '08:00' : t)) };
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
    // Normalize: if any time is empty, send null (caregiver didn't commit
    // to a clock schedule). Otherwise send the array.
    const cleanedTimes =
      form.scheduleTimes && form.scheduleTimes.every((t) => t.trim().length > 0)
        ? form.scheduleTimes
        : null;
    const payload: MedicationPayload = { ...form, scheduleTimes: cleanedTimes };

    startTransition(async () => {
      const result =
        mode === 'new'
          ? await addMedication(payload)
          : await updateMedication(medicationId!, payload, dosesPerDayChanged);
      if (!result.ok) setError(result.error);
      // On success, action redirects.
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
      </Field>

      <Field label="Dose" hint="Free-form. Example: 40 mg">
        <input
          className={inputClass}
          value={form.dose ?? ''}
          onChange={(e) => setForm({ ...form, dose: e.target.value })}
          placeholder="40 mg"
        />
      </Field>

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
          Heads up: changing doses-per-day will clear the existing time schedule. You can
          re-enter times below or leave them blank.
        </p>
      )}

      {form.dosesPerDay !== null && (
        <Field label={`Times (optional)`} hint="Leave blank if you don't track exact times.">
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
            onChange={(e) =>
              setForm({ ...form, drugClass: e.target.value as MedClass })
            }
          >
            {MED_CLASS_OPTIONS.map((opt) => (
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
