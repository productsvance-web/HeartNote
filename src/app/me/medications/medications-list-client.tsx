'use client';

// Client component owning the /me/medications list interactions:
// - Edit Mode toggle (replaces row chevrons with selectable rows)
// - Multi-select via tap; Stop and Delete bulk actions
// - Delete confirm dialog with real event count from getDeleteImpact
//
// Selection state is ephemeral — exiting Edit Mode or navigating away
// clears it (component unmounts on navigation, so no persistence needed).

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, ChevronRight, Pill, Plus } from 'lucide-react';
import { MED_CLASS_LABEL } from '@/lib/medications/classes';
import {
  deleteMedications,
  stopMedications,
  type DeleteMedicationsImpact,
} from './actions';
import type { Database } from '@/lib/supabase/types';

type MedClass = Database['public']['Enums']['med_class'];

export interface MedSummary {
  id: string;
  drug_name: string;
  drug_class: MedClass;
  dose: string | null;
  doses_per_day: number | null;
  schedule_times: string[] | null;
  stopped_at: string | null;
}

interface Props {
  active: MedSummary[];
  stopped: MedSummary[];
  patientName: string;
  addedId: string | null;
}

export function MedicationsListClient({ active, stopped, patientName, addedId }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pendingImpact, setPendingImpact] = useState<DeleteMedicationsImpact | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const hasMeds = active.length > 0 || stopped.length > 0;
  const selectedCount = selected.size;
  const totalMeds = active.length + stopped.length;
  const allSelected = totalMeds > 0 && selectedCount === totalMeds;

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set([...active, ...stopped].map((m) => m.id)));
    }
  }

  function exitEditMode() {
    setEditMode(false);
    setSelected(new Set());
    setPendingImpact(null);
    setError(null);
  }

  function handleStop() {
    if (selectedCount === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await stopMedications(Array.from(selected));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      exitEditMode();
      router.refresh();
    });
  }

  function handleOpenDeleteDialog() {
    if (selectedCount === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteMedications({
        ids: Array.from(selected),
        confirm: false,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (!result.performed) setPendingImpact(result.impact);
    });
  }

  function handleConfirmDelete() {
    if (!pendingImpact) return;
    const ids = pendingImpact.medications.map((m) => m.id);
    startTransition(async () => {
      const result = await deleteMedications({ ids, confirm: true });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPendingImpact(null);
      exitEditMode();
      router.refresh();
    });
  }

  return (
    <>
      {hasMeds && (
        <div className="mt-4 mx-4 flex items-center justify-between">
          {editMode ? (
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-sm text-muted-foreground underline underline-offset-2"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          ) : (
            <span aria-hidden="true" />
          )}
          <button
            type="button"
            onClick={() => (editMode ? exitEditMode() : setEditMode(true))}
            className="text-sm text-muted-foreground underline underline-offset-2"
          >
            {editMode ? 'Done' : 'Edit'}
          </button>
        </div>
      )}

      {error && (
        <p className="mx-4 mt-2 text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5">
          {error}
        </p>
      )}

      <section className="mt-2 mx-4 rounded-3xl bg-card shadow-card overflow-hidden">
        {active.length === 0 ? (
          <div className="p-6 text-center">
            <Pill size={28} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-foreground">No medications added yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add the meds {patientName} takes so dose tracking can work.
            </p>
          </div>
        ) : (
          <ul>
            {active.map((m) => (
              <ActiveRow
                key={m.id}
                med={m}
                editMode={editMode}
                selected={selected.has(m.id)}
                isJustAdded={addedId === m.id}
                onToggle={() => toggleSelected(m.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="mx-4 mt-4 space-y-2">
        <Link
          href="/me/medications/new"
          className="w-full flex items-center justify-center gap-2 rounded-full px-6 py-4 text-sm font-semibold border border-border bg-card"
        >
          <Plus size={16} />
          Add medication
        </Link>
        <Link
          href="/me/medications/scan"
          className="w-full flex items-center justify-center gap-2 rounded-full px-6 py-3 text-xs font-medium text-muted-foreground"
        >
          <Camera size={14} />
          Scan a label
        </Link>
      </section>

      {stopped.length > 0 && (
        <details className="mx-4 mt-6 rounded-2xl bg-card/60 border border-border">
          <summary className="px-4 py-3 text-sm text-muted-foreground cursor-pointer">
            Past medications ({stopped.length})
          </summary>
          <ul className="border-t border-border">
            {stopped.map((m) => (
              <StoppedRow
                key={m.id}
                med={m}
                editMode={editMode}
                selected={selected.has(m.id)}
                onToggle={() => toggleSelected(m.id)}
              />
            ))}
          </ul>
        </details>
      )}

      {/* Bottom padding so the sticky toolbar doesn't cover content */}
      {editMode && <div className="h-20" aria-hidden="true" />}

      {editMode && (
        <BulkActionBar
          selectedCount={selectedCount}
          isPending={isPending}
          onStop={handleStop}
          onDelete={handleOpenDeleteDialog}
        />
      )}

      {pendingImpact && (
        <DeleteConfirmDialog
          impact={pendingImpact}
          isPending={isPending}
          onCancel={() => setPendingImpact(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}

interface RowProps {
  med: MedSummary;
  editMode: boolean;
  selected: boolean;
  onToggle: () => void;
}

function ActiveRow({ med, editMode, selected, isJustAdded, onToggle }: RowProps & { isJustAdded: boolean }) {
  const body = (
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-foreground truncate">
        {med.drug_name}
        {med.dose ? ` · ${med.dose}` : ''}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5 truncate">
        {med.doses_per_day === null ? 'as needed' : `${med.doses_per_day}× per day`}
      </p>
      {isJustAdded && (
        <p className="text-xs mt-2 inline-block rounded-full bg-muted px-2.5 py-1 text-foreground">
          Classed as {MED_CLASS_LABEL[med.drug_class]} — tap to change
        </p>
      )}
    </div>
  );

  return (
    <li className="border-b border-border last:border-0">
      {editMode ? (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={selected}
          className="w-full flex items-start gap-3 p-4 text-left active:bg-muted/40 transition"
        >
          <SelectionMark selected={selected} />
          {body}
        </button>
      ) : (
        <Link
          href={`/me/medications/${med.id}`}
          className="flex items-start gap-3 p-4 active:bg-muted/40 transition"
        >
          {body}
          <ChevronRight size={18} className="text-muted-foreground mt-1 shrink-0" />
        </Link>
      )}
    </li>
  );
}

function StoppedRow({ med, editMode, selected, onToggle }: RowProps) {
  const body = (
    <span className="flex-1 text-sm truncate text-muted-foreground">
      {med.drug_name}
      {med.dose ? ` · ${med.dose}` : ''}
      <span className="ml-2 text-xs">stopped {med.stopped_at}</span>
    </span>
  );

  return (
    <li className="border-b border-border last:border-0">
      {editMode ? (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={selected}
          className="w-full flex items-center gap-3 p-4 text-left active:bg-muted/40 transition"
        >
          <SelectionMark selected={selected} />
          {body}
        </button>
      ) : (
        <Link
          href={`/me/medications/${med.id}`}
          className="flex items-center gap-3 p-4 text-muted-foreground"
        >
          {body}
          <ChevronRight size={16} />
        </Link>
      )}
    </li>
  );
}

function SelectionMark({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 h-5 w-5 shrink-0 rounded border-2 flex items-center justify-center transition ${
        selected
          ? 'bg-foreground border-foreground'
          : 'bg-background border-muted-foreground/60'
      }`}
    >
      {selected && (
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
          <path
            d="M2 6l3 3 5-6"
            stroke="var(--background)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

function BulkActionBar({
  selectedCount,
  isPending,
  onStop,
  onDelete,
}: {
  selectedCount: number;
  isPending: boolean;
  onStop: () => void;
  onDelete: () => void;
}) {
  const empty = selectedCount === 0;
  return (
    // z-50 sits above BottomNav (z-40) so the toolbar is visible while in
    // Edit Mode. Opaque card background + safe-area padding ensure the
    // toolbar fully covers the nav area on iOS.
    <div
      role="toolbar"
      aria-label="Bulk medication actions"
      className="fixed inset-x-0 bottom-0 z-50 bg-card border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-3 shadow-card"
    >
      <p className="text-sm text-muted-foreground">
        {empty ? 'Select medications' : `${selectedCount} selected`}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={empty || isPending}
          aria-disabled={empty || isPending || undefined}
          onClick={onStop}
          className="rounded-full px-4 py-2 text-sm font-medium border border-border bg-background disabled:opacity-50"
        >
          Stop
        </button>
        <button
          type="button"
          disabled={empty || isPending}
          aria-disabled={empty || isPending || undefined}
          onClick={onDelete}
          className="rounded-full px-4 py-2 text-sm font-medium bg-destructive text-destructive-foreground disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function DeleteConfirmDialog({
  impact,
  isPending,
  onCancel,
  onConfirm,
}: {
  impact: DeleteMedicationsImpact;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { medications, totalEvents } = impact;
  const isMulti = medications.length > 1;

  const title = isMulti
    ? `Delete ${medications.length} medications?`
    : `Delete ${medications[0]?.name ?? 'medication'}?`;

  const eventLine =
    totalEvents === 0
      ? '0 dose logs will be erased.'
      : isMulti
        ? `${totalEvents} dose logs across ${medications.length} medications will be erased.`
        : `${totalEvents} dose ${totalEvents === 1 ? 'log' : 'logs'} will be erased.`;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-body"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-card">
        <h2 id="delete-dialog-title" className="text-base font-semibold text-foreground">
          {title}
        </h2>
        <div id="delete-dialog-body">
          <p className="mt-2 text-sm text-foreground">{eventLine}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            These records can&rsquo;t be brought back.
          </p>
        </div>
        <div className="mt-5 flex gap-2 justify-end">
          <button
            type="button"
            disabled={isPending}
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-sm font-medium border border-border bg-background disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className="rounded-full px-4 py-2 text-sm font-medium bg-destructive text-destructive-foreground disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
