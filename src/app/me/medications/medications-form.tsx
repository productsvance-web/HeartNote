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
import { CadenceFlow, type CadenceDraft } from './cadence/cadence-flow';
import {
  formatCadenceSummary,
  type CadenceKind,
} from '@/lib/medications/cadence';
import {
  rescheduleAll,
  requestNotificationPermission,
  checkPermissionState,
  cancelNotificationsForMed,
} from '@/lib/medications/notifications';

type Mode = 'new' | 'edit';

interface InitialDoseTime {
  timeOfDay: string;
  quantity: number;
  appliesToDow: number | null;
}

interface FormInitial {
  drugName?: string;
  dose?: string;
  cadenceKind?: CadenceKind;
  cycleOnDays?: number | null;
  cycleOffDays?: number | null;
  intervalDays?: number | null;
  startedAt?: string;
  notes?: string;
  isStopped?: boolean;
  allowedStrengths?: AllowedStrengths | null;
  doseTimes?: InitialDoseTime[];
}

interface Props {
  mode: Mode;
  medicationId?: string;
  initial?: FormInitial;
  // When provided, the form calls submitAction INSTEAD of addMedication /
  // updateMedication, and onSaved fires on success. Used by the scan flow
  // so saving stays within /me/medications/scan instead of redirecting.
  submitAction?: (payload: MedicationPayload) => Promise<{ ok: boolean; error?: string }>;
  onSaved?: () => void;
  // Optional submit-button label override (e.g., "Add to my list" in scan).
  submitLabel?: string;
}

const DOSE_PARSE = /^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z/]+)\s*$/;

function parseDose(dose: string | undefined): { value: string; unit: string } {
  if (!dose) return { value: '', unit: 'mg' };
  const m = DOSE_PARSE.exec(dose);
  if (!m) return { value: '', unit: 'mg' };
  return { value: m[1], unit: m[2].toLowerCase() };
}

function buildInitialDraft(initial: FormInitial | undefined): CadenceDraft {
  const kind = (initial?.cadenceKind ?? 'as_needed') as CadenceKind;
  const doseTimes = (initial?.doseTimes ?? []).map((dt) => ({
    timeOfDay: dt.timeOfDay,
    quantity: dt.quantity,
    appliesToDow: dt.appliesToDow,
  }));
  // Reconstruct groups for specific_days from the distinct bitmaps.
  const groups =
    kind === 'specific_days'
      ? Array.from(new Set(doseTimes.map((dt) => dt.appliesToDow ?? 0)))
      : [];
  // Heuristic: if cycleOnDays is a multiple of 7 and >= 7, present the
  // cyclical UI in 'week' units. Otherwise 'day'.
  const cycleUnit: 'day' | 'week' =
    kind === 'cyclical' &&
    initial?.cycleOnDays != null &&
    initial.cycleOnDays >= 7 &&
    initial.cycleOnDays % 7 === 0 &&
    (initial.cycleOffDays ?? 0) % 7 === 0
      ? 'week'
      : 'day';
  return {
    kind,
    cycleOnDays: initial?.cycleOnDays ?? null,
    cycleOffDays: initial?.cycleOffDays ?? null,
    cycleUnit,
    intervalDays: initial?.intervalDays ?? null,
    startedAt: initial?.startedAt ?? '',
    doseTimes,
    groups,
  };
}

export function MedicationForm({
  mode,
  medicationId,
  initial,
  submitAction,
  onSaved,
  submitLabel,
}: Props) {
  const initialDose = parseDose(initial?.dose);
  const [drugName, setDrugName] = useState(initial?.drugName ?? '');
  const [doseValue, setDoseValue] = useState<string>(initialDose.value);
  const [doseUnit, setDoseUnit] = useState<string>(initialDose.unit);
  const [notes, setNotes] = useState<string>(initial?.notes ?? '');
  const [startedAt, setStartedAt] = useState<string>(initial?.startedAt ?? '');
  const [draft, setDraft] = useState<CadenceDraft>(() => buildInitialDraft(initial));
  const [editingCadence, setEditingCadence] = useState(false);
  const [allowedStrengths, setAllowedStrengths] = useState<AllowedStrengths | null>(
    initial?.allowedStrengths ?? null
  );
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const lastLookedUpRef = useRef<string | null>(null);

  useEffect(() => {
    const name = drugName.trim();
    if (name.length < 3 || name === lastLookedUpRef.current) return;
    const timer = setTimeout(() => {
      lastLookedUpRef.current = name;
      void lookupDrugStrengths(name).then((r) => {
        setAllowedStrengths(r.allowedStrengths);
        setSuggestedName(r.suggestedName);
        // Snap doseUnit to the allowed value when classification arrives.
        // Keeps the (locked) unit chip in sync with the strength constraint
        // even if the user typed a unit before the lookup completed.
        if (r.allowedStrengths) {
          setDoseUnit(r.allowedStrengths.unit.toLowerCase());
        }
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [drugName]);

  function buildPayload(forDraft: CadenceDraft): MedicationPayload {
    const dose = doseValue.trim() ? `${doseValue.trim()} ${doseUnit}` : '';
    return {
      drugName,
      dose,
      cadenceKind: forDraft.kind,
      cycleOnDays: forDraft.cycleOnDays,
      cycleOffDays: forDraft.cycleOffDays,
      intervalDays: forDraft.intervalDays,
      startedAt: forDraft.kind === 'cyclical' || forDraft.kind === 'every_few_days'
        ? forDraft.startedAt
        : startedAt,
      notes,
      doseTimes: forDraft.doseTimes.map((dt, i) => ({
        timeOfDay: dt.timeOfDay,
        quantity: dt.quantity,
        ordinal: i,
        appliesToDow: dt.appliesToDow,
      })),
    };
  }

  async function syncNotifications(forDraft: CadenceDraft) {
    if (forDraft.kind === 'as_needed') {
      // Re-balance to drop any stale fires for this med.
      await rescheduleAll();
      return;
    }
    const state = await checkPermissionState();
    if (state === 'prompt' || state === 'prompt-with-rationale') {
      await requestNotificationPermission();
    }
    await rescheduleAll();
  }

  function submit(forDraft: CadenceDraft = draft): Promise<{ ok: true } | { ok: false; error: string }> {
    setError(null);
    return new Promise((resolve) => {
      startTransition(async () => {
        const payload = buildPayload(forDraft);
        if (submitAction) {
          const result = await submitAction(payload);
          if (!result.ok) {
            setError(result.error ?? 'Save failed');
            resolve({ ok: false, error: result.error ?? 'Save failed' });
          } else {
            void syncNotifications(forDraft);
            onSaved?.();
            resolve({ ok: true });
          }
          return;
        }
        const result =
          mode === 'new'
            ? await addMedication(payload)
            : await updateMedication(medicationId!, payload);
        if (!result.ok) {
          setError(result.error);
          resolve({ ok: false, error: result.error });
        } else {
          void syncNotifications(forDraft);
          resolve({ ok: true });
        }
      });
    });
  }

  function onStop() {
    if (!medicationId) return;
    startTransition(async () => {
      const result = await stopMedication(medicationId);
      if (!result.ok) setError(result.error);
      else void cancelNotificationsForMed(medicationId);
    });
  }

  function onRestart() {
    if (!medicationId) return;
    startTransition(async () => {
      const result = await restartMedication(medicationId);
      if (!result.ok) setError(result.error);
      else void rescheduleAll();
    });
  }

  const unitLocked = allowedStrengths !== null;
  const knownStrengths = allowedStrengths?.values
    .slice(0, 3)
    .map((v) => `${v} ${allowedStrengths.unit.toLowerCase()}`)
    .join(', ');

  const showSuggestion =
    !!suggestedName && suggestedName.toLowerCase() !== drugName.trim().toLowerCase();

  if (editingCadence) {
    return (
      <CadenceFlow
        drugLabel={drugName.trim() || 'this medication'}
        initial={draft}
        confirmReplace={mode === 'edit' && (initial?.doseTimes?.length ?? 0) > 0}
        onCancel={() => setEditingCadence(false)}
        onSave={async (next) => {
          const result = await submit(next);
          if (result.ok) {
            setDraft(next);
            setEditingCadence(false);
            return { ok: true };
          }
          return result;
        }}
        saving={isPending}
      />
    );
  }

  return (
    <div className="space-y-5">
      <Field label="Drug name">
        <input
          autoFocus={mode === 'new'}
          className={inputClass}
          value={drugName}
          onChange={(e) => setDrugName(e.target.value)}
          placeholder="Lasix"
        />
        {showSuggestion && (
          <button
            type="button"
            onClick={() => setDrugName(suggestedName!)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs text-foreground active:bg-muted/70"
          >
            Did you mean <span className="font-semibold">{suggestedName}</span>?
          </button>
        )}
      </Field>

      <div>
        <span className="block text-sm font-medium text-foreground mb-1.5">Strength</span>
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
        <p className="text-xs text-muted-foreground mt-1.5">
          {knownStrengths
            ? `Comes in ${knownStrengths}.`
            : 'Strength of one tablet, capsule, or unit dose.'}
        </p>
      </div>

      <Field label="Schedule">
        <button
          type="button"
          onClick={() => setEditingCadence(true)}
          className="w-full text-left rounded-xl border border-border bg-background px-4 py-3"
        >
          <p className="text-sm text-foreground">
            {formatCadenceSummary({
              cadenceKind: draft.kind,
              cycleOnDays: draft.cycleOnDays,
              cycleOffDays: draft.cycleOffDays,
              intervalDays: draft.intervalDays,
              doseTimes: draft.doseTimes.map((dt) => ({
                timeOfDay: dt.timeOfDay,
                appliesToDow: dt.appliesToDow,
              })),
            })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Tap to change</p>
        </button>
      </Field>

      <Field label="Started" hint="Optional">
        <input
          type="date"
          className={inputClass}
          value={startedAt}
          onChange={(e) => setStartedAt(e.target.value)}
        />
      </Field>

      <Field label="Notes" hint="Anything the prescriber said worth remembering.">
        <textarea
          className={inputClass}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={isPending || !drugName.trim()}
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
