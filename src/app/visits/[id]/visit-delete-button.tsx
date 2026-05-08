'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteVisit } from '@/app/visits/actions';

interface Props {
  visitId: string;
  visitDate: string; // ISO YYYY-MM-DD
  visitDateLabel: string; // human-readable like "May 14"
}

export function VisitDeleteButton({ visitId, visitDate, visitDateLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Required typed confirmation — must match the visit's ISO date exactly,
  // per .claude/rules/destructive-actions.md. Removes the "delete the wrong
  // visit by mistake" failure mode the project's destructive-actions rule
  // was added to prevent.
  const enabled = typed.trim() === visitDate && !pending;

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await deleteVisit({ visitId, confirmedDate: visitDate });
      if (res?.error) setError(res.error);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <Trash2 size={13} />
        Delete this visit
      </button>
    );
  }

  return (
    <div
      className="mt-2 rounded-2xl border p-4"
      style={{
        background: 'var(--status-alert-soft)',
        borderColor: 'color-mix(in oklab, var(--status-alert) 30%, transparent)',
      }}
    >
      <p className="text-sm font-semibold" style={{ color: 'var(--status-alert-foreground)' }}>
        Permanently delete the {visitDateLabel} visit and all its notes?
      </p>
      <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--status-alert-foreground)' }}>
        Type the visit date verbatim to confirm: <span className="tabular-nums font-mono">{visitDate}</span>
      </p>
      <input
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={visitDate}
        className="mt-3 w-full rounded-xl bg-card border border-border px-3 py-2 text-sm tabular-nums font-mono"
      />
      {error && (
        <p className="text-xs mt-2" style={{ color: 'var(--status-alert-foreground)' }}>
          {error}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTyped('');
            setError(null);
          }}
          className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!enabled}
          className="rounded-full px-3 py-1.5 text-xs font-medium"
          style={{
            background: enabled ? 'var(--status-alert)' : 'var(--muted)',
            color: enabled ? 'white' : 'var(--muted-foreground)',
          }}
        >
          {pending ? 'Deleting…' : `Delete the ${visitDateLabel} visit`}
        </button>
      </div>
    </div>
  );
}
