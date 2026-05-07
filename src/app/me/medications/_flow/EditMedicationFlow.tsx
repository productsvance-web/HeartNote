'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getDrugDetails } from '@/lib/medications/rxnorm';
import {
  updateMedication,
  stopMedication,
  restartMedication,
  type MedicationPayload,
} from '../actions';
import { type CadenceDraft } from '../cadence/cadence-fields';
import {
  rescheduleAll,
  requestNotificationPermission,
  checkPermissionState,
  cancelNotificationsForMed,
} from '@/lib/medications/notifications';
import { TypeStep } from './TypeStep';
import { StrengthStep } from './StrengthStep';
import { ScheduleStep } from './ScheduleStep';
import {
  type DrugSelection,
  type FlowState,
} from './flow-types';

export interface EditInitial {
  id: string;
  drugName: string;
  rxcui: string | null;
  ingredient: string | null;
  form: string | null;
  dose: string;
  notes: string;
  isStopped: boolean;
  draft: CadenceDraft;
}

interface Props {
  initial: EditInitial;
}

type Step = 'schedule' | 'type' | 'strength';

export function EditMedicationFlow({ initial }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('schedule');
  const initialSelection: DrugSelection = initial.rxcui
    ? {
        kind: 'rxnorm',
        rxcui: initial.rxcui,
        name: initial.drugName,
        // Edit flow stores generic-vs-brand only via ingredient: when
        // ingredient is set and differs from drugName, it was a brand pick.
        type:
          initial.ingredient &&
          initial.ingredient.toLowerCase() !== initial.drugName.toLowerCase()
            ? 'brand'
            : 'generic',
        ingredient: initial.ingredient,
        ingredientRxcui: null,
      }
    : { kind: 'custom', name: initial.drugName };

  const [state, setState] = useState<FlowState>({
    selection: initialSelection,
    drugDetails: null,
    drugDetailsLoading: initial.rxcui !== null,
    drugDetailsError: false,
    form: initial.form,
    strength: initial.dose,
  });
  const [draft, setDraft] = useState<CadenceDraft>(initial.draft);
  const [notes, setNotes] = useState(initial.notes);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const lastFetchedRxcuiRef = useRef<string | null>(null);

  useEffect(() => {
    const sel = state.selection;
    if (!sel || sel.kind !== 'rxnorm') return;
    if (sel.rxcui === lastFetchedRxcuiRef.current) return;
    lastFetchedRxcuiRef.current = sel.rxcui;
    const controller = new AbortController();
    getDrugDetails({
      rxcui: sel.rxcui,
      type: sel.type,
      drugName: sel.name,
      ingredientName: sel.ingredient ?? undefined,
      ingredientRxcui: sel.ingredientRxcui ?? undefined,
      signal: controller.signal,
    })
      .then((details) => {
        if (controller.signal.aborted) return;
        setState((s) => ({
          ...s,
          drugDetails: details,
          drugDetailsLoading: false,
          drugDetailsError: details.forms.length === 0,
        }));
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState((s) => ({
          ...s,
          drugDetails: null,
          drugDetailsLoading: false,
          drugDetailsError: true,
        }));
      });
    return () => {
      controller.abort();
    };
  }, [state.selection]);

  function close() {
    router.push('/me/medications');
  }

  function buildPayload(d: CadenceDraft, sel: DrugSelection): MedicationPayload {
    return {
      drugName: sel.name,
      dose: state.strength,
      cadenceKind: d.kind,
      cycleOnDays: d.cycleOnDays,
      cycleOffDays: d.cycleOffDays,
      intervalDays: d.intervalDays,
      startedAt: d.kind === 'as_needed' ? '' : d.startedAt,
      endedAt: d.kind === 'as_needed' ? '' : d.endedAt,
      notes,
      doseTimes: d.doseTimes.map((dt, i) => ({
        timeOfDay: dt.timeOfDay,
        quantity: dt.quantity,
        ordinal: i,
        appliesToDow: dt.appliesToDow,
      })),
      rxcui: sel.kind === 'rxnorm' ? sel.rxcui : null,
      ingredient: sel.kind === 'rxnorm' ? sel.ingredient : null,
      form: state.form,
    };
  }

  function save() {
    if (!state.selection) return;
    // Schedule replacement on an active med wipes existing dose-time rows
    // and reschedules notifications. Class-B destructive op per
    // .claude/rules/destructive-actions.md — echo the drug name so the
    // caregiver can verify they're operating on the right entity.
    if (!window.confirm(`Replace the schedule for ${initial.drugName}?`)) return;
    const payload = buildPayload(draft, state.selection);
    setError(null);
    startTransition(async () => {
      const result = await updateMedication(initial.id, payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (draft.kind !== 'as_needed') {
        const ps = await checkPermissionState();
        if (ps === 'prompt' || ps === 'prompt-with-rationale') {
          await requestNotificationPermission();
        }
      }
      await rescheduleAll();
      router.push('/me/medications');
    });
  }

  function onStop() {
    if (!window.confirm(`Stop ${initial.drugName}?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await stopMedication(initial.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      void cancelNotificationsForMed(initial.id);
      router.push('/me/medications');
    });
  }

  function onRestart() {
    setError(null);
    startTransition(async () => {
      const result = await restartMedication(initial.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await rescheduleAll();
      router.push('/me/medications');
    });
  }

  if (step === 'type') {
    if (!state.selection) {
      setStep('schedule');
      return null;
    }
    return (
      <TypeStep
        selection={state.selection}
        drugDetails={state.drugDetails}
        loading={state.drugDetailsLoading}
        error={state.drugDetailsError}
        form={state.form}
        onPick={(form) => setState((s) => ({ ...s, form, strength: '' }))}
        onContinue={() => setStep('strength')}
        onBack={() => setStep('schedule')}
        onClose={close}
      />
    );
  }

  if (step === 'strength') {
    if (!state.selection) {
      setStep('schedule');
      return null;
    }
    return (
      <StrengthStep
        selection={state.selection}
        form={state.form}
        drugDetails={state.drugDetails}
        strength={state.strength}
        onChange={(strength) => setState((s) => ({ ...s, strength }))}
        onContinue={() => setStep('schedule')}
        onBack={() => setStep('type')}
        onClose={close}
      />
    );
  }

  return (
    <ScheduleStep
      mode="edit"
      drugName={initial.drugName}
      form={state.form}
      strength={state.strength}
      draft={draft}
      onDraftChange={setDraft}
      onSave={save}
      saving={isPending}
      error={error}
      onClose={close}
      onChangeType={() => setStep('type')}
      notes={notes}
      onNotesChange={setNotes}
      isStopped={initial.isStopped}
      onStop={onStop}
      onRestart={onRestart}
    />
  );
}
