'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { saveQuestions } from '@/app/visits/actions';

interface Props {
  visitId: string;
  initialQuestions: string[];
}

export function VisitQuestionsEditor({ visitId, initialQuestions }: Props) {
  // Local state — mutations don't hit the DB until "Save changes" fires the
  // server action. Refresh discards unsaved edits, which matches the design
  // intent (one atomic save per editing session).
  const [questions, setQuestions] = useState<string[]>(
    initialQuestions.length > 0 ? initialQuestions : [''],
  );
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function update(i: number, value: string) {
    setQuestions((prev) => prev.map((q, idx) => (idx === i ? value : q)));
  }

  function add() {
    setQuestions((prev) => [...prev, '']);
  }

  function remove(i: number) {
    setQuestions((prev) => (prev.length === 1 ? [''] : prev.filter((_, idx) => idx !== i)));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const cleaned = questions.map((q) => q.trim()).filter((q) => q.length > 0);
      const res = await saveQuestions({ visitId, questions: cleaned });
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
        Questions worth asking
      </p>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
        Edit, add, or remove. These print at the bottom of the handoff.
      </p>

      <div className="mt-4 flex flex-col gap-2">
        {questions.map((q, i) => (
          <div key={i} className="flex items-start gap-2">
            <textarea
              value={q}
              onChange={(e) => update(i, e.target.value)}
              rows={2}
              placeholder="Type a question…"
              className="flex-1 text-sm rounded-2xl border border-border bg-background px-3 py-2 leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground active:scale-95 transition"
              aria-label="Remove question"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-foreground"
        style={{ color: 'var(--accent-foreground)' }}
      >
        <Plus size={15} />
        Add a question
      </button>

      <div className="mt-4 flex items-center justify-between gap-3">
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
          Save changes
        </button>
      </div>
    </section>
  );
}
