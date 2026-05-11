// Read + delete UI for any single-value vital's readings. Slide-up sheet
// with two modes:
//
// Read mode: chronological list (most-recent first), "Edit" toggles
// into select mode, "Delete all" pill at the bottom fires a window
// .confirm() that echoes the patient's first name + count.
//
// Select mode: rows have circular checkboxes; "Select all" toggles all;
// bottom action bar has Delete (N) + Cancel.
//
// Destructive-actions.md classification: vital readings are class-B
// (reversible-with-effort: caregiver can re-enter). Both single/multi
// delete and "delete all" use confirm() with the target identity in
// the prompt — no typed-confirmation modal.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import type { VitalReading } from '@/lib/trends/vital-reading';
import type { VitalReadingConfig } from './vital-reading-config';

type DeleteResult = { ok: true; deleted: number } | { ok: false; error: string };

interface Props {
  config: VitalReadingConfig;
  readings: VitalReading[]; // sorted ascending by recorded_at
  patientFirstName: string;
  timezone: string;
  today: string;
  onClose: () => void;
  // Delete actions are passed in (not imported) so each /trends/<vital>
  // page wires its own server actions without ViewDataSheet importing
  // them by name.
  deleteByIds: (input: { ids: string[] }) => Promise<DeleteResult>;
  deleteAll: () => Promise<DeleteResult>;
}

export function ViewDataSheet({
  config,
  readings,
  patientFirstName,
  timezone,
  today,
  onClose,
  deleteByIds,
  deleteAll,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const reversed = [...readings].reverse();
  const hasReadings = readings.length > 0;
  const selectedCount = selected.size;
  const allSelected = hasReadings && selectedCount === readings.length;

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(readings.map((r) => r.id)));
  };

  const exitEdit = () => {
    setEditing(false);
    setSelected(new Set());
    setError(null);
  };

  // 'Delete' for permanently-destroying-row vitals (weight, spo2, hr,
  // bp); 'Clear' for daily_logs-column vitals (pillows) where the
  // underlying mutation is an UPDATE setting the column to NULL.
  const verb = config.actionVerb ?? 'Delete';
  const inProgressVerb = verb === 'Clear' ? 'Clearing' : 'Deleting';

  const onDeleteSelected = () => {
    if (selectedCount === 0) return;
    const range = rangeLabel(
      reversed.filter((r) => selected.has(r.id)),
      timezone,
    );
    const msg =
      selectedCount === 1
        ? `${verb} the ${config.deleteNoun.singular} from ${range}?`
        : `${verb} ${selectedCount} ${config.deleteNoun.plural} (${range})?`;
    if (!window.confirm(msg)) return;
    setError(null);
    startTransition(async () => {
      const ids = Array.from(selected);
      const result = await deleteByIds({ ids });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      exitEdit();
      router.refresh();
    });
  };

  const onDeleteAll = () => {
    if (readings.length === 0) return;
    // 'Clear' is reversible-with-effort (caregiver can re-enter), so
    // the "cannot be undone" clause only attaches to the destructive
    // 'Delete' variant.
    const msg =
      verb === 'Clear'
        ? `${verb} ${readings.length} ${config.deleteNoun.plural} from ${patientFirstName}'s logs?`
        : `${verb} all ${readings.length} of ${patientFirstName}'s ${config.deleteNoun.plural}? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAll();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      exitEdit();
      router.refresh();
    });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`View ${config.fieldLabel.toLowerCase()} data`}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: 'rgba(28, 28, 28, 0.32)' }}
      />

      <div
        className="relative w-full max-w-md rounded-t-3xl px-5 pt-3 pb-6 flex flex-col"
        style={{
          background: 'var(--card)',
          boxShadow: '0 -10px 30px rgba(28, 28, 28, 0.16)',
          maxHeight: '85vh',
        }}
      >
        <div
          aria-hidden
          className="mx-auto mb-3 flex-shrink-0"
          style={{
            width: 38,
            height: 5,
            borderRadius: 999,
            background: 'color-mix(in oklab, var(--ink) 22%, transparent)',
          }}
        />

        <div className="flex items-baseline justify-between mb-4 flex-shrink-0">
          <h2
            className="font-display text-[20px] text-foreground"
            style={{ letterSpacing: '-0.2px', fontWeight: 500 }}
          >
            {config.listTitle}
          </h2>
          {hasReadings ? (
            editing ? (
              <button
                type="button"
                onClick={toggleAll}
                className="text-sm text-foreground active:opacity-60"
                disabled={pending}
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-sm text-foreground active:opacity-60"
              >
                Edit
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-muted-foreground active:text-foreground"
            >
              Done
            </button>
          )}
        </div>

        {!hasReadings ? (
          <p className="text-[14px] text-muted-foreground py-8 text-center">
            No readings yet.
          </p>
        ) : (
          <div
            className="flex-1 overflow-y-auto rounded-2xl"
            style={{
              background: 'var(--card)',
              border: '0.5px solid var(--border)',
            }}
          >
            {reversed.map((r, i) => {
              const isSelected = selected.has(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={!editing || pending}
                  onClick={() => editing && toggleRow(r.id)}
                  className="w-full flex items-center justify-between text-left active:bg-muted transition disabled:cursor-default"
                  style={{
                    padding: '14px 16px',
                    borderBottom:
                      i < reversed.length - 1
                        ? '0.5px solid var(--border)'
                        : 'none',
                    background: 'transparent',
                  }}
                >
                  {editing && (
                    <span
                      aria-hidden
                      className="mr-3 inline-flex items-center justify-center rounded-full"
                      style={{
                        width: 22,
                        height: 22,
                        border: `1.5px solid ${isSelected ? 'var(--sage-deep)' : 'var(--border)'}`,
                        background: isSelected
                          ? 'var(--sage-deep)'
                          : 'transparent',
                        color: 'white',
                        flexShrink: 0,
                      }}
                    >
                      {isSelected && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      )}
                    </span>
                  )}
                  <span
                    className="font-display text-foreground tabular-nums flex-1 text-left"
                    style={{
                      fontSize: 18,
                      fontWeight: 500,
                      letterSpacing: '-0.2px',
                    }}
                  >
                    {config.formatValue(r.value)}
                    <span
                      className="text-muted-foreground"
                      style={{ fontSize: 12, fontWeight: 500, marginLeft: 4 }}
                    >
                      {config.unit}
                    </span>
                  </span>
                  <span className="text-[12px] text-muted-foreground tabular-nums">
                    {whenLabel(r, today, timezone)}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <p
            className="mt-3 text-[13px] text-center"
            style={{ color: 'var(--status-alert-foreground)' }}
          >
            {error}
          </p>
        )}

        {hasReadings && editing && (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={exitEdit}
              disabled={pending}
              className="flex-1 rounded-full text-sm font-medium border disabled:opacity-50"
              style={{
                height: 44,
                background: 'var(--card)',
                borderColor: 'var(--border)',
                color: 'var(--foreground)',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onDeleteSelected}
              disabled={selectedCount === 0 || pending}
              className="flex-1 rounded-full text-sm font-semibold disabled:opacity-40"
              style={{
                height: 44,
                background: 'var(--destructive, #C46A4A)',
                color: 'white',
              }}
            >
              {pending
                ? `${inProgressVerb}…`
                : selectedCount === 0
                  ? verb
                  : `${verb} (${selectedCount})`}
            </button>
          </div>
        )}

        {hasReadings && !editing && (
          <button
            type="button"
            onClick={onDeleteAll}
            disabled={pending}
            className="mt-4 inline-flex items-center justify-center gap-1.5 self-center text-sm rounded-full px-4 py-2 active:opacity-70 transition disabled:opacity-50"
            style={{
              color: 'var(--destructive, #C46A4A)',
              background: 'transparent',
              border: '1px solid color-mix(in oklab, var(--destructive, #C46A4A) 30%, transparent)',
            }}
          >
            <Trash2 size={14} />
            {pending
              ? `${inProgressVerb}…`
              : verb === 'Clear'
                ? `Clear all ${config.fieldLabel.toLowerCase()} data`
                : `Delete all ${config.fieldLabel.toLowerCase()} data`}
          </button>
        )}
      </div>
    </div>
  );
}

function whenLabel(r: VitalReading, today: string, tz: string): string {
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(r.recorded_at));
  if (r.log_date === today) return `Today, ${time}`;
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    year:
      r.log_date.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
  }).format(new Date(r.recorded_at));
  return `${date}, ${time}`;
}

function rangeLabel(rs: VitalReading[], tz: string): string {
  if (rs.length === 0) return '';
  if (rs.length === 1) {
    const r = rs[0];
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(r.recorded_at));
  }
  // rs is reversed (most-recent first), so [0] is newest, [last] oldest
  const newest = rs[0];
  const oldest = rs[rs.length - 1];
  const newestStr = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
  }).format(new Date(newest.recorded_at));
  const oldestStr = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
  }).format(new Date(oldest.recorded_at));
  return `${oldestStr} – ${newestStr}`;
}

