// BP-specific read+delete sheet. Iterates BpPair[] (one row per
// reading event) instead of the shared VitalReading[]. Selection keys
// are source_log_id so a partial-pair delete is impossible.
//
// Generic-izing the shared ViewDataSheet for one extra caller costs
// more in surface area than this 200-line fork costs in duplication.
// Plan-engineering-AC cap: if this file exceeds 250 lines, switch to a
// generic <TRow> on ViewDataSheet.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import type { BpPair } from '@/lib/trends/bp-pair';

type DeleteResult =
  | { ok: true; deleted: number }
  | { ok: false; error: string };

interface Props {
  pairs: BpPair[]; // sorted asc by recorded_at
  patientFirstName: string;
  timezone: string;
  today: string;
  onClose: () => void;
  deleteByPairs: (input: { sourceLogIds: string[] }) => Promise<DeleteResult>;
  deleteAll: () => Promise<DeleteResult>;
}

export function ViewBpDataSheet({
  pairs,
  patientFirstName,
  timezone,
  today,
  onClose,
  deleteByPairs,
  deleteAll,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const reversed = [...pairs].reverse();
  const hasPairs = pairs.length > 0;
  const selectedCount = selected.size;
  const allSelected = hasPairs && selectedCount === pairs.length;

  const toggleRow = (sourceLogId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sourceLogId)) next.delete(sourceLogId);
      else next.add(sourceLogId);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(pairs.map((p) => p.sourceLogId)));
  };

  const exitEdit = () => {
    setEditing(false);
    setSelected(new Set());
    setError(null);
  };

  const onDeleteSelected = () => {
    if (selectedCount === 0) return;
    const range = rangeLabel(
      reversed.filter((p) => selected.has(p.sourceLogId)),
      timezone,
    );
    const msg =
      selectedCount === 1
        ? `Delete the blood pressure reading from ${range}?`
        : `Delete ${selectedCount} blood pressure readings (${range})?`;
    if (!window.confirm(msg)) return;
    setError(null);
    startTransition(async () => {
      const sourceLogIds = Array.from(selected);
      const result = await deleteByPairs({ sourceLogIds });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      exitEdit();
      router.refresh();
    });
  };

  const onDeleteAll = () => {
    if (pairs.length === 0) return;
    const msg = `Delete all ${pairs.length} of ${patientFirstName}'s blood pressure readings? This cannot be undone.`;
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
      aria-label="View blood pressure data"
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
            All blood pressure readings
          </h2>
          {hasPairs ? (
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

        {!hasPairs ? (
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
            {reversed.map((p, i) => {
              const isSelected = selected.has(p.sourceLogId);
              return (
                <button
                  key={p.sourceLogId}
                  type="button"
                  disabled={!editing || pending}
                  onClick={() => editing && toggleRow(p.sourceLogId)}
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
                    {p.sys} / {p.dia}
                    <span
                      className="text-muted-foreground"
                      style={{ fontSize: 12, fontWeight: 500, marginLeft: 4 }}
                    >
                      mmHg
                    </span>
                  </span>
                  <span className="text-[12px] text-muted-foreground tabular-nums">
                    {whenLabel(p, today, timezone)}
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

        {hasPairs && editing && (
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
                ? 'Deleting…'
                : selectedCount === 0
                  ? 'Delete'
                  : `Delete (${selectedCount})`}
            </button>
          </div>
        )}

        {hasPairs && !editing && (
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
            {pending ? 'Deleting…' : 'Delete all blood pressure data'}
          </button>
        )}
      </div>
    </div>
  );
}

function whenLabel(p: BpPair, today: string, tz: string): string {
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(p.recorded_at));
  if (p.log_date === today) return `Today, ${time}`;
  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    year:
      p.log_date.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
  }).format(new Date(p.recorded_at));
  return `${date}, ${time}`;
}

function rangeLabel(ps: BpPair[], tz: string): string {
  if (ps.length === 0) return '';
  if (ps.length === 1) {
    const p = ps[0];
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(p.recorded_at));
  }
  const newest = ps[0];
  const oldest = ps[ps.length - 1];
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
