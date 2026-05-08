'use client';

import { useState, useTransition } from 'react';
import { saveNotes } from '@/app/visits/actions';

interface Props {
  visitId: string;
  initialNotes: string | null;
}

export function VisitNotesEditor({ visitId, initialNotes }: Props) {
  const [text, setText] = useState<string>(initialNotes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveNotes({ visitId, notes: text });
      if (res.error) {
        setError(res.error);
        return;
      }
      setSavedAt(Date.now());
    });
  }

  return (
    <section className="mx-4 mt-4 rounded-3xl bg-card border border-border shadow-card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Notes from the visit
      </p>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
        What did the cardiologist say? Med changes, follow-ups, anything to
        watch for.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder="The cardiologist said…"
        className="mt-3 w-full text-sm rounded-2xl border border-border bg-background px-3 py-2 leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-y"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          {savedAt && !pending && !error ? 'Saved.' : pending ? 'Saving…' : ''}
          {error && <span style={{ color: 'var(--status-alert-foreground)' }}>{error}</span>}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-full px-4 py-2 text-sm font-medium"
          style={{
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
            opacity: pending ? 0.7 : 1,
          }}
        >
          Save notes
        </button>
      </div>
    </section>
  );
}
