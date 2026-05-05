'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, X } from 'lucide-react';
import { getDrugDetails } from '@/lib/medications/rxnorm';
import { addMedicationFromWizard } from './wizard-action';
import { StepSearch } from './step-search';
import { StepForm } from './step-form';
import { StepStrength } from './step-strength';
import { StepDose } from './step-dose';
import { StepTimes } from './step-times';
import { StepDetails } from './step-details';
import {
  INITIAL_STATE,
  type StepIndex,
  type WizardState,
} from './wizard-types';

interface Props {
  // True when the wizard was entered from /me/medications/scan (via
  // ?from=scan). Routes save back to scan and the close button returns
  // there too. PR-2b will produce this URL from scan cards.
  fromScan: boolean;
}

export function MedicationWizard({ fromScan }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<StepIndex>(1);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const lastFetchedRxcuiRef = useRef<string | null>(null);

  // Fetch DrugDetails when the user picks an rxnorm result in step 1.
  // Custom-path selections skip the fetch; steps 2/3 use generic
  // fallbacks. The ref guards against re-fetching the same rxcui when
  // the user navigates back to step 1 and re-confirms the same drug.
  //
  // Synchronous loading=true reset lives in the onSelect handler below
  // (event handler, not effect body) so the effect only contains the
  // async fetch — keeps react-hooks/set-state-in-effect happy. setState
  // inside .then() is asynchronous and not flagged by the rule.
  useEffect(() => {
    const sel = state.selection;
    if (!sel || sel.kind !== 'rxnorm') {
      lastFetchedRxcuiRef.current = null;
      return;
    }
    if (sel.rxcui === lastFetchedRxcuiRef.current) return;
    lastFetchedRxcuiRef.current = sel.rxcui;
    let cancelled = false;
    getDrugDetails({
      rxcui: sel.rxcui,
      type: sel.type,
      drugName: sel.name,
      ingredientName: sel.ingredient ?? undefined,
      ingredientRxcui: sel.ingredientRxcui ?? undefined,
    })
      .then((details) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          drugDetails: details,
          drugDetailsLoading: false,
          drugDetailsError: details.forms.length === 0,
          form: s.form ?? details.preselectedForm,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          drugDetails: null,
          drugDetailsLoading: false,
          drugDetailsError: true,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [state.selection]);

  function goNext() {
    setStep((s) => {
      // Step 4 → skip Times when PRN.
      if (s === 4 && state.dosesPerDay === null) return 6;
      return Math.min(6, s + 1) as StepIndex;
    });
  }

  function goBack() {
    setStep((s) => {
      // Step 6 → skip Times when PRN.
      if (s === 6 && state.dosesPerDay === null) return 4;
      return Math.max(1, s - 1) as StepIndex;
    });
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

  function save() {
    if (!state.selection) return;
    setSaveError(null);
    const sel = state.selection;
    startTransition(async () => {
      const result = await addMedicationFromWizard({
        drugName: sel.name,
        rxcui: sel.kind === 'rxnorm' ? sel.rxcui : null,
        form: state.form,
        ingredient: sel.kind === 'rxnorm' ? sel.ingredient : null,
        dose: state.strength,
        pillsPerDose: state.pillsPerDose,
        dosesPerDay: state.dosesPerDay,
        scheduleTimes: state.scheduleTimes,
        startedAt: state.startedAt,
        notes: state.notes,
        returnToScan: fromScan,
      });
      if (!result.ok) setSaveError(result.error);
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
        <span className="text-xs font-medium text-muted-foreground">
          Step {visibleStepNumber(step, state.dosesPerDay)} of{' '}
          {visibleStepTotal(state.dosesPerDay)}
        </span>
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
              // Re-picking invalidates downstream choices and primes the
              // loading state for the upcoming getDrugDetails fetch.
              const willFetch = selection.kind === 'rxnorm';
              setState((s) => ({
                ...s,
                selection,
                form: null,
                strength: '',
                drugDetails: null,
                drugDetailsLoading: willFetch,
                drugDetailsError: false,
              }));
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
          <StepDose
            form={state.form}
            pillsPerDose={state.pillsPerDose}
            dosesPerDay={state.dosesPerDay}
            onChange={(patch) =>
              setState((s) => {
                // Changing dosesPerDay invalidates the existing time
                // schedule: PRN means no times, and a different count
                // means the array length is wrong. Clearing here avoids
                // a save-time CHECK constraint failure and a
                // .trim()-on-undefined crash if the user ever returns
                // to step 5 with a stale array.
                const dosesChanged =
                  patch.dosesPerDay !== undefined &&
                  patch.dosesPerDay !== s.dosesPerDay;
                return {
                  ...s,
                  ...patch,
                  scheduleTimes: dosesChanged ? null : s.scheduleTimes,
                };
              })
            }
            onContinue={goNext}
          />
        )}
        {step === 5 && (
          <StepTimes
            dosesPerDay={state.dosesPerDay}
            scheduleTimes={state.scheduleTimes}
            onChange={(scheduleTimes) =>
              setState((s) => ({ ...s, scheduleTimes }))
            }
            onContinue={goNext}
          />
        )}
        {step === 6 && (
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

// Step 5 (Times) is hidden when dosesPerDay is null (PRN). Display the
// step counter as 5-of-5 instead of 6-of-6 in that case so the user
// doesn't see a phantom step disappear.
function visibleStepTotal(dosesPerDay: number | null): number {
  return dosesPerDay === null ? 5 : 6;
}

function visibleStepNumber(step: StepIndex, dosesPerDay: number | null): number {
  if (dosesPerDay === null && step === 6) return 5;
  return step;
}
