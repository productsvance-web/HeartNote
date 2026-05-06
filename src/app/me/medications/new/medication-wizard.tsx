'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, X } from 'lucide-react';
import { getDrugDetails } from '@/lib/medications/rxnorm';
import { addMedication, type MedicationPayload } from '../actions';
import { CadenceFlow, type CadenceDraft } from '../cadence/cadence-flow';
import {
  rescheduleAll,
  requestNotificationPermission,
  checkPermissionState,
} from '@/lib/medications/notifications';
import { StepSearch } from './step-search';
import { StepForm } from './step-form';
import { StepStrength } from './step-strength';
import { StepDetails } from './step-details';
import {
  INITIAL_STATE,
  type StepIndex,
  type WizardState,
} from './wizard-types';

interface Props {
  // True when the wizard was entered from /me/medications/scan (via
  // ?from=scan). Routes save back to scan and the close button returns
  // there too.
  fromScan: boolean;
}

export function MedicationWizard({ fromScan }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<StepIndex>(1);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const lastFetchedRxcuiRef = useRef<string | null>(null);

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
          form: s.form ?? details.preselectedForm,
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

  function goNext() {
    setStep((s) => Math.min(5, s + 1) as StepIndex);
  }

  function goBack() {
    setStep((s) => Math.max(1, s - 1) as StepIndex);
  }

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
    if (!window.confirm(message)) return;
    router.push(fromScan ? '/me/medications/scan' : '/me/medications');
  }

  function buildPayload(cadence: CadenceDraft): MedicationPayload | null {
    if (!state.selection) return null;
    const sel = state.selection;
    return {
      drugName: sel.name,
      dose: state.strength,
      cadenceKind: cadence.kind,
      cycleOnDays: cadence.cycleOnDays,
      cycleOffDays: cadence.cycleOffDays,
      intervalDays: cadence.intervalDays,
      startedAt: cadence.kind === 'as_needed' ? '' : cadence.startedAt || state.startedAt,
      endedAt: cadence.kind === 'as_needed' ? '' : cadence.endedAt,
      notes: state.notes,
      doseTimes: cadence.doseTimes.map((dt, i) => ({
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
    const payload = buildPayload(state.cadence);
    if (!payload) return;
    setSaveError(null);
    startTransition(async () => {
      const result = await addMedication(payload);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      if (state.cadence.kind !== 'as_needed') {
        const ps = await checkPermissionState();
        if (ps === 'prompt' || ps === 'prompt-with-rationale') {
          await requestNotificationPermission();
        }
      }
      await rescheduleAll();
      const dest = fromScan
        ? '/me/medications/scan'
        : result.id
          ? `/me/medications?added=${result.id}`
          : '/me/medications';
      router.push(dest);
    });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 pt-6 pb-2">
        {step > 1 ? (
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="p-2 -ml-2 text-foreground"
          >
            <ChevronLeft size={24} />
          </button>
        ) : (
          <span className="w-10" aria-hidden="true" />
        )}
        <span className="text-xs font-medium text-muted-foreground">Step {step} of 5</span>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="p-2 -mr-2 text-foreground"
        >
          <X size={22} />
        </button>
      </header>

      <main className="flex-1 px-6 pb-8">
        {step === 1 && (
          <StepSearch
            selection={state.selection}
            onSelect={(selection) => {
              setState((s) => {
                const switched = !isSameSelection(s.selection, selection);
                if (!switched) {
                  return { ...s, selection };
                }
                const willFetch = selection.kind === 'rxnorm';
                return {
                  ...s,
                  selection,
                  form: null,
                  strength: '',
                  drugDetails: null,
                  drugDetailsLoading: willFetch,
                  drugDetailsError: false,
                  cadence: INITIAL_STATE.cadence,
                };
              });
            }}
            onContinue={goNext}
          />
        )}
        {step === 2 && (
          <StepForm
            selection={state.selection}
            drugDetails={state.drugDetails}
            loading={state.drugDetailsLoading}
            error={state.drugDetailsError}
            form={state.form}
            onPick={(form) => setState((s) => ({ ...s, form, strength: '' }))}
            onContinue={goNext}
          />
        )}
        {step === 3 && (
          <StepStrength
            selection={state.selection}
            form={state.form}
            drugDetails={state.drugDetails}
            strength={state.strength}
            onChange={(strength) => setState((s) => ({ ...s, strength }))}
            onContinue={goNext}
          />
        )}
        {step === 4 && (
          <CadenceFlow
            drugLabel={state.selection?.kind ? state.selection.name : 'this medication'}
            initial={state.cadence}
            form={state.form}
            onCancel={goBack}
            onSave={async (next) => {
              setState((s) => ({ ...s, cadence: next }));
              goNext();
              return { ok: true };
            }}
          />
        )}
        {step === 5 && (
          <StepDetails
            startedAt={state.startedAt}
            notes={state.notes}
            saveError={saveError}
            saving={isPending}
            onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
            onSave={save}
          />
        )}
      </main>
    </div>
  );
}

function isSameSelection(
  prev: WizardState['selection'],
  next: WizardState['selection']
): boolean {
  if (!prev || !next) return false;
  if (prev.kind === 'rxnorm' && next.kind === 'rxnorm') {
    return prev.rxcui === next.rxcui;
  }
  if (prev.kind === 'custom' && next.kind === 'custom') {
    return prev.name.trim().toLowerCase() === next.name.trim().toLowerCase();
  }
  return false;
}
