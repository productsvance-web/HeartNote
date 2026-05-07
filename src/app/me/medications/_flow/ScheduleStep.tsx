'use client';

import { useState } from 'react';
import { CadenceFields, type CadenceDraft } from '../cadence/cadence-fields';
import { MedFlowChrome } from './MedFlowChrome';

// Canonical end-screen for the unified medication flow. Wraps CadenceFields
// (embedded mode) inside the shared MedFlowChrome. Adds a subtitle row
// showing the resolved Type + Strength with a Change link, an optional
// Notes field (collapsed-by-default when empty so it doesn't dominate the
// surface), and an optional Stop / Restart row for edit mode.

type Mode = 'new' | 'edit' | 'scan';

interface Props {
  mode: Mode;
  drugName: string;
  form: string | null;
  strength: string;
  draft: CadenceDraft;
  onDraftChange: (next: CadenceDraft) => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  // Tap "Change" on the subtitle → go back to the Type step. Null when
  // there's no Type/Strength to revisit (e.g., a custom-name med with
  // form=null and strength='').
  onChangeType: (() => void) | null;
  // Notes (kept editable to avoid stranding existing rows' notes).
  notes: string;
  onNotesChange: (notes: string) => void;
  // Edit-only: Stop or Restart buttons at the bottom of the body.
  isStopped?: boolean;
  onStop?: () => void;
  onRestart?: () => void;
  // Scan flow only: enables a "Skip — save without a schedule" affordance
  // in the chrome's secondary slot. Saves with cadence_kind='as_needed'.
  allowSkip?: boolean;
  onSkip?: () => void;
}

export function ScheduleStep({
  mode,
  drugName,
  form,
  strength,
  draft,
  onDraftChange,
  onSave,
  saving,
  error,
  onClose,
  onChangeType,
  notes,
  onNotesChange,
  isStopped,
  onStop,
  onRestart,
  allowSkip,
  onSkip,
}: Props) {
  const [notesOpen, setNotesOpen] = useState(notes.trim().length > 0);

  const subtitle = buildSubtitle(form, strength);

  return (
    <MedFlowChrome
      title={drugName}
      subtitle={subtitle}
      onBack={null}
      onClose={onClose}
      primaryLabel={saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Save'}
      primaryDisabled={saving}
      onPrimary={onSave}
      secondaryLabel={allowSkip ? 'Skip — save without a schedule' : undefined}
      onSecondary={allowSkip && onSkip ? onSkip : undefined}
    >
      {onChangeType && (
        <div className="-mt-1 mb-3 flex justify-center">
          <button
            type="button"
            onClick={onChangeType}
            className="text-xs font-semibold text-primary"
          >
            Change type or strength
          </button>
        </div>
      )}

      <CadenceFields
        embedded
        drugLabel={drugName}
        form={form}
        draft={draft}
        onChange={onDraftChange}
        onSave={onSave}
        onCancel={onClose}
        saving={saving}
        error={error}
      />

      <div className="mt-5">
        {!notesOpen ? (
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="text-sm font-semibold text-primary"
          >
            + Add a note
          </button>
        ) : (
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Notes</p>
            <textarea
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Anything the prescriber said worth remembering."
            />
          </div>
        )}
      </div>

      {mode === 'edit' && (
        <div className="mt-6 border-t border-border pt-4">
          {isStopped ? (
            <button
              type="button"
              onClick={onRestart}
              className="w-full rounded-full border border-border bg-card px-6 py-3 text-sm font-medium"
            >
              Restart this medication
            </button>
          ) : (
            <button
              type="button"
              onClick={onStop}
              className="w-full rounded-full border border-destructive/50 bg-card px-6 py-3 text-sm font-medium text-destructive"
            >
              Stop {drugName}
            </button>
          )}
        </div>
      )}
    </MedFlowChrome>
  );
}

// Build the appended-selections subtitle, mirroring Apple Health's pattern:
// "Tablet" → "Tablet, 40 mg" → "Sublingual Spray, 400 mcg". Form is the
// verbatim RxNorm name (already title-case). Returns null when neither
// field is known (e.g., custom path with no strength yet).
function buildSubtitle(form: string | null, strength: string): string | null {
  const strengthLabel = strength.trim().length > 0 ? strength.trim() : null;
  if (form && strengthLabel) return `${form}, ${strengthLabel}`;
  if (form) return form;
  if (strengthLabel) return strengthLabel;
  return null;
}
