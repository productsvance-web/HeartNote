// BaselineLogPrompt — the cold-start home screen's call-to-action card.
// Even though the FAB is always visible, week-one caregivers don't yet
// know mic = log. This card calls the action out by name with a short
// time estimate.

import Link from 'next/link';
import { Mic, Loader2, Check } from 'lucide-react';

interface Props {
  alreadyLoggedToday: boolean;
  processing: boolean;
}

export function BaselineLogPrompt({ alreadyLoggedToday, processing }: Props) {
  if (processing) {
    return (
      <section className="mx-4 mt-5 rounded-2xl bg-card border border-border p-4 flex items-center gap-3">
        <span
          className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 animate-pulse-ring"
          style={{ background: 'var(--status-good-soft)', color: 'var(--status-good-foreground)' }}
        >
          <Loader2 size={18} className="animate-spin" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Listening to today&rsquo;s log…</p>
          <p className="text-xs text-muted-foreground mt-0.5">A few seconds — keep this open.</p>
        </div>
      </section>
    );
  }

  if (alreadyLoggedToday) {
    return (
      <section className="mx-4 mt-5 rounded-2xl bg-card border border-border p-4 flex items-center gap-3">
        <span
          className="h-10 w-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'var(--status-good-soft)', color: 'var(--status-good-foreground)' }}
        >
          <Check size={18} strokeWidth={2.4} />
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Today&rsquo;s check-in is in.</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tap the mic to add anything else you noticed.
          </p>
        </div>
      </section>
    );
  }

  return (
    <Link
      href="/log"
      className="mx-4 mt-5 flex items-center gap-3 rounded-2xl bg-card p-3.5 active:scale-[0.98] transition"
      style={{
        border: '1px solid color-mix(in oklab, var(--sage) 30%, transparent)',
        boxShadow: '0 1px 4px -2px color-mix(in oklab, var(--foreground) 8%, transparent)',
      }}
    >
      <span
        className="h-[42px] w-[42px] rounded-full flex items-center justify-center shrink-0"
        style={{
          background: 'color-mix(in oklab, var(--sage) 14%, var(--cream))',
          border: '1px solid color-mix(in oklab, var(--sage) 32%, transparent)',
          color: 'var(--accent-foreground)',
        }}
      >
        <Mic size={19} strokeWidth={1.85} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground" style={{ letterSpacing: '-0.005em' }}>
          Log today&rsquo;s check-in
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">~30 seconds · same five questions</p>
      </div>
      <span className="text-xs text-muted-foreground/50 shrink-0">→</span>
    </Link>
  );
}
