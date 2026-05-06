'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getDrugDetails } from '@/lib/medications/rxnorm';
import { addMedication, type MedicationPayload } from '../actions';
import { type CadenceDraft, newDraft } from '../cadence/cadence-fields';
import {
  rescheduleAll,
  requestNotificationPermission,
  checkPermissionState,
} from '@/lib/medications/notifications';
import { SearchStep } from './SearchStep';
import { TypeStep } from './TypeStep';
import { StrengthStep } from './StrengthStep';
import { ScheduleStep } from './ScheduleStep';
import { defaultCadenceKind } from './prn-default';
import {
  INITIAL_FLOW_STATE,
  type DrugSelection,
  type FlowState,
} from './flow-types';

type Step = 'search' | 'type' | 'strength' | 'schedule';

export function NewMedicationFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('search');
  const [state, setState] = useState<FlowState>(INITIAL_FLOW_STATE);
  // Cadence draft is initialized on first arrival at the schedule step
  // (we need form/ingredient to compute the PRN default). Held as null
  // until then so an unset value can't bleed into the payload.
  const [draft, setDraft] = useState<CadenceDraft | null>(null);
  const [notes, setNotes] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const lastFetchedRxcuiRef = useRef<string | null>(null);

  // Fetch RxNorm drug details (forms + strengths) when the user picks a
  // result. Skipped for custom-path selections.
  useEffect(() => {
    const sel = state.selection;
    if (!sel || sel.kind !== 'rxnorm') {
      lastFetchedRxcuiRef.current = null;
      return;
    }
    if (sel.rxcui === lastFetchedRxcuiRef.current) {
      setState((s) => ({ ...s, drugDetailsLoading: false }));
      return;
    }
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
    const name =
      state.selection?.kind === 'rxnorm'
        ? state.selection.name
        : state.selection?.kind === 'custom'
          ? state.selection.name
          : '';
    const message = name
      ? `Discard the entry for ${name}?`
      : 'Discard this medication entry?';
    if (state.selection && !window.confirm(message)) return;
    router.push('/me/medications');
  }

  function pickType(form: string) {
    // Changing the picked type clears strength so the StrengthStep
    // re-derives chips for the new form. Mirrors today's wizard semantics.
    setState((s) => ({ ...s, form, strength: '' }));
  }

  function gotoSchedule() {
    // Seed the cadence draft on first arrival so PRN-default applies for
    // sublingual nitroglycerin. Returning to the step keeps the existing
    // draft (don't overwrite the caregiver's edits).
    if (draft === null) {
      const ingredient =
        state.selection?.kind === 'rxnorm' ? state.selection.ingredient : null;
      const kind = defaultCadenceKind({ ingredient, form: state.form });
      setDraft(newDraft(kind));
    }
    setStep('schedule');
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
    if (!state.selection || !draft) return;
    const payload = buildPayload(draft, state.selection);
    setSaveError(null);
    startTransition(async () => {
      const result = await addMedication(payload);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      if (draft.kind !== 'as_needed') {
        const ps = await checkPermissionState();
        if (ps === 'prompt' || ps === 'prompt-with-rationale') {
          await requestNotificationPermission();
        }
      }
      await rescheduleAll();
      router.push(result.id ? `/me/medications?added=${result.id}` : '/me/medications');
    });
  }

  if (step === 'search') {
    return (
      <SearchStep
        selection={state.selection}
        onSelect={(selection) => {
          setState((s) => {
            const switched = !isSameSelection(s.selection, selection);
            if (!switched) return { ...s, selection };
            const willFetch = selection.kind === 'rxnorm';
            return {
              ...s,
              selection,
              form: null,
              strength: '',
              drugDetails: null,
              drugDetailsLoading: willFetch,
              drugDetailsError: false,
            };
          });
          // Reset the cadence draft so a re-pick applies the new PRN default.
          setDraft(null);
        }}
        onContinue={() => setStep('type')}
        onClose={close}
      />
    );
  }

  if (step === 'type') {
    if (!state.selection) {
      // Guard: shouldn't happen — Search step gates Continue on selection.
      setStep('search');
      return null;
    }
    return (
      <TypeStep
        selection={state.selection}
        drugDetails={state.drugDetails}
        loading={state.drugDetailsLoading}
        error={state.drugDetailsError}
        form={state.form}
        onPick={pickType}
        onContinue={() => setStep('strength')}
        onBack={() => setStep('search')}
        onClose={close}
      />
    );
  }

  if (step === 'strength') {
    if (!state.selection) {
      setStep('search');
      return null;
    }
    return (
      <StrengthStep
        selection={state.selection}
        form={state.form}
        drugDetails={state.drugDetails}
        strength={state.strength}
        onChange={(strength) => setState((s) => ({ ...s, strength }))}
        onContinue={gotoSchedule}
        onBack={() => setStep('type')}
        onClose={close}
      />
    );
  }

  // Schedule
  if (!state.selection || !draft) {
    setStep('search');
    return null;
  }
  return (
    <ScheduleStep
      mode="new"
      drugName={state.selection.name}
      form={state.form}
      strength={state.strength}
      draft={draft}
      onDraftChange={setDraft}
      onSave={save}
      saving={isPending}
      error={saveError}
      onClose={close}
      onChangeType={() => setStep('type')}
      notes={notes}
      onNotesChange={setNotes}
    />
  );
}

function isSameSelection(
  prev: DrugSelection | null,
  next: DrugSelection,
): boolean {
  if (!prev) return false;
  if (prev.kind === 'rxnorm' && next.kind === 'rxnorm') {
    return prev.rxcui === next.rxcui;
  }
  if (prev.kind === 'custom' && next.kind === 'custom') {
    return prev.name.trim().toLowerCase() === next.name.trim().toLowerCase();
  }
  return false;
}
