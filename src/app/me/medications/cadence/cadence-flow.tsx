'use client';

import { useState } from 'react';
import { CadenceFields, newDraft, type CadenceDraft } from './cadence-fields';

interface Props {
  drugLabel: string;
  initial?: CadenceDraft;
  // Verbatim RxNorm form (e.g., "Oral Tablet"). Plumbed to CadenceFields
  // for form-aware quantity rendering ("1 tablet" instead of "1 dose").
  // Null when unknown (custom-entered med, scan with no NDC match).
  form?: string | null;
  onSave: (draft: CadenceDraft) => Promise<{ ok: true } | { ok: false; error: string }>;
  onCancel: () => void;
  saving?: boolean;
  // When true, the user is changing an existing schedule and should see a
  // confirm before destructive replace.
  confirmReplace?: boolean;
  // When set, exposes a "Skip — save without a schedule" link that saves
  // the med with cadence_kind = 'as_needed'. Used by the scan flow's
  // per-card review.
  allowSkip?: boolean;
}

export function CadenceFlow({
  drugLabel,
  initial,
  form,
  onSave,
  onCancel,
  saving,
  confirmReplace,
  allowSkip,
}: Props) {
  // Default to `every_day` for fresh entries (scan flow lands here without
  // an initial draft). The caregiver almost always wants a daily schedule;
  // making them dig past `as_needed` for the common case is friction. They
  // can still pick `as_needed` from the inline kind list.
  const [draft, setDraft] = useState<CadenceDraft>(initial ?? newDraft('every_day'));
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (confirmReplace) {
      const ok = window.confirm(`Replace the schedule for ${drugLabel}?`);
      if (!ok) return;
    }
    setError(null);
    const result = await onSave(draft);
    if (!result.ok) setError(result.error);
  }

  async function skipAsNeeded() {
    const skipDraft = newDraft('as_needed');
    setError(null);
    const result = await onSave(skipDraft);
    if (!result.ok) setError(result.error);
  }

  return (
    <CadenceFields
      drugLabel={drugLabel}
      form={form ?? null}
      draft={draft}
      onChange={setDraft}
      onSave={save}
      onCancel={onCancel}
      onSkip={allowSkip ? skipAsNeeded : undefined}
      saving={saving}
      error={error}
    />
  );
}

export type { CadenceDraft };
