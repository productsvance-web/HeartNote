'use client';

import { useState } from 'react';
import type { CadenceKind } from '@/lib/medications/cadence';
import { CadencePicker } from './cadence-picker';
import { CadenceFields, newDraft, type CadenceDraft } from './cadence-fields';

interface Props {
  drugLabel: string;
  initial?: CadenceDraft;
  onSave: (draft: CadenceDraft) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCancel: () => void;
  saving?: boolean;
  // When true, the picker is shown first; the caller is changing an
  // existing schedule and should see a confirm before destructive replace.
  confirmReplace?: boolean;
  // When set, exposes a "Skip — save without a schedule" link on the
  // picker that saves the med with cadence_kind = 'as_needed'. Used by
  // the scan flow's per-card review.
  allowSkip?: boolean;
}

export function CadenceFlow({ drugLabel, initial, onSave, onCancel, saving, confirmReplace, allowSkip }: Props) {
  const [step, setStep] = useState<'pick' | 'fields'>(initial ? 'fields' : 'pick');
  const [pickedKind, setPickedKind] = useState<CadenceKind | null>(initial?.kind ?? null);
  const [draft, setDraft] = useState<CadenceDraft | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);

  function pickKind(k: CadenceKind) {
    setPickedKind(k);
  }

  function continueToFields() {
    if (pickedKind === null) return;
    setDraft(newDraft(pickedKind, draft ?? undefined));
    setStep('fields');
    setError(null);
  }

  async function save() {
    if (!draft) return;
    if (confirmReplace) {
      const ok = window.confirm(`Replace the schedule for ${drugLabel}?`);
      if (!ok) return;
    }
    setError(null);
    const result = await onSave(draft);
    if (!result.ok) {
      setError(result.error);
    }
  }

  async function skipAsNeeded() {
    const skipDraft = newDraft('as_needed');
    setError(null);
    const result = await onSave(skipDraft);
    if (!result.ok) setError(result.error);
  }

  if (step === 'pick' || !draft) {
    return (
      <div className="space-y-3">
        <CadencePicker
          selected={pickedKind}
          onSelect={pickKind}
          onContinue={continueToFields}
          onCancel={onCancel}
          onSkip={allowSkip ? skipAsNeeded : undefined}
        />
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>
    );
  }

  return (
    <CadenceFields
      drugLabel={drugLabel}
      draft={draft}
      onChange={setDraft}
      onBack={() => setStep('pick')}
      onSave={save}
      saving={saving}
      error={error}
    />
  );
}

export type { CadenceDraft };
