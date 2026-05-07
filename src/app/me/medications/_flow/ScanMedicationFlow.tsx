'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { getDrugDetails } from '@/lib/medications/rxnorm';
import { type CadenceDraft, newDraft } from '../cadence/cadence-fields';
import { type MedicationPayload } from '../actions';
import type { ResolvedMed } from '@/lib/medications/scan/schema';
import { extractedMedToPayload, toTitleCase } from '../scan/extracted-to-payload';
import { TypeStep } from './TypeStep';
import { StrengthStep } from './StrengthStep';
import { ScheduleStep } from './ScheduleStep';
import { defaultCadenceKind } from './prn-default';
import { type DrugSelection, type FlowState } from './flow-types';

// Per-card flow inside the scan flow's outer multi-card review. Lands on
// the Schedule step with form + strength prefilled from OCR. The caregiver
// can revisit Type / Strength via the "Change" link in the subtitle. The
// outer ScanClient owns the multi-card queue, "Add all" batch action, and
// the dose-change short-circuit (per build conv #6).

interface Props {
  med: ResolvedMed;
  // Save handler injected by the parent so the per-card flow stays
  // ignorant of batch semantics. Returns ok/err so this component can
  // surface inline errors.
  onSave: (
    payload: MedicationPayload,
    cadenceKind: CadenceDraft['kind']
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCancel: () => void;
  // Multi-med scans expose a "Skip — save without a schedule" affordance
  // that saves with as_needed cadence so the caregiver can move on.
  allowSkip?: boolean;
}

type Step = 'schedule' | 'type' | 'strength';

export function ScanMedicationFlow({ med, onSave, onCancel, allowSkip }: Props) {
  // Synthesize a DrugSelection from the resolved scan. Treat NDC-resolved
  // meds as rxnorm picks; fallback to custom when neither rxcui nor a
  // resolved canonical name was available.
  const initialSelection: DrugSelection = med.rxcui
    ? {
        kind: 'rxnorm',
        rxcui: med.rxcui,
        name: toTitleCase(
          med.drug_name.trim().length > 0 ? med.drug_name : (med.canonicalName ?? '')
        ),
        type:
          med.ingredient &&
          med.canonicalName &&
          med.ingredient.toLowerCase() !== (med.drug_name || '').toLowerCase()
            ? 'brand'
            : 'generic',
        ingredient: med.ingredient,
        ingredientRxcui: null,
      }
    : { kind: 'custom', name: toTitleCase(med.drug_name.trim()) };

  const initialPayload = extractedMedToPayload(med);

  const [step, setStep] = useState<Step>('schedule');
  const [state, setState] = useState<FlowState>({
    selection: initialSelection,
    drugDetails: null,
    drugDetailsLoading: med.rxcui !== null,
    drugDetailsError: false,
    form: med.form,
    strength: initialPayload.dose ?? '',
  });
  const [draft, setDraft] = useState<CadenceDraft>(() =>
    newDraft(defaultCadenceKind({ ingredient: med.ingredient, form: med.form }))
  );
  const [notes, setNotes] = useState('');
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

  function buildPayload(d: CadenceDraft): MedicationPayload {
    return {
      ...initialPayload,
      dose: state.strength,
      form: state.form,
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
    };
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await onSave(buildPayload(draft), draft.kind);
      if (!result.ok) setError(result.error);
    });
  }

  function skip() {
    setError(null);
    const skipDraft = newDraft('as_needed');
    startTransition(async () => {
      const result = await onSave(buildPayload(skipDraft), 'as_needed');
      if (!result.ok) setError(result.error);
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
        onClose={onCancel}
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
        onClose={onCancel}
      />
    );
  }

  return (
    <ScheduleStep
      mode="scan"
      drugName={state.selection?.name ?? toTitleCase(med.drug_name)}
      form={state.form}
      strength={state.strength}
      draft={draft}
      onDraftChange={setDraft}
      onSave={save}
      saving={isPending}
      error={error}
      onClose={onCancel}
      onChangeType={() => setStep('type')}
      notes={notes}
      onNotesChange={setNotes}
      allowSkip={allowSkip}
      onSkip={skip}
    />
  );
}
