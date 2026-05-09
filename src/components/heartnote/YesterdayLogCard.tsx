// YesterdayLogCard — small reminder strip on /log so the caregiver has
// context for today's dictation. Renders nothing when there's no
// yesterday log to show; never empty-card.
//
// Anatomy: muted recap with the transcript snippet + tier badge +
// symptom count, plus an "Edit" link the caregiver can use to fix what
// the AI misheard. The /log screen is not in
// docs/design/heartnote-home-mockup.html — visual register inherited
// from the home screen tokens.

import Link from 'next/link';
import type { YesterdayLog } from '@/lib/voice-log/yesterday';

interface Props {
  log: YesterdayLog;
}

export function YesterdayLogCard({ log }: Props) {
  return (
    <section className="mx-4 mt-2 rounded-3xl bg-card border border-border shadow-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Yesterday&rsquo;s log
        </p>
        <Link
          href={`/log/${log.id}/edit`}
          className="text-[11px] font-semibold underline underline-offset-2"
          style={{ color: 'var(--accent-foreground)' }}
        >
          Edit
        </Link>
      </div>
      {log.transcriptSnippet ? (
        <p
          className="text-sm text-foreground mt-2 leading-relaxed"
          style={{ letterSpacing: '-0.005em' }}
        >
          &ldquo;{log.transcriptSnippet}&rdquo;
        </p>
      ) : (
        <p className="text-sm text-muted-foreground mt-2">
          A log was saved but the transcript isn&rsquo;t available.
        </p>
      )}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        <Pill tier={log.tier} label={log.tierLabel} />
        {log.symptomCount > 0 && (
          <Pill
            tier="muted"
            label={`${log.symptomCount} symptom${log.symptomCount === 1 ? '' : 's'}`}
          />
        )}
      </div>
    </section>
  );
}

function Pill({
  tier,
  label,
}: {
  tier: YesterdayLog['tier'] | 'muted';
  label: string;
}) {
  const bg =
    tier === 'alert'
      ? 'var(--status-alert-soft)'
      : tier === 'watch'
        ? 'var(--status-watch-soft)'
        : tier === 'good'
          ? 'var(--status-good-soft)'
          : 'var(--muted)';
  const fg =
    tier === 'alert'
      ? 'var(--status-alert-foreground)'
      : tier === 'watch'
        ? 'var(--status-watch-foreground)'
        : tier === 'good'
          ? 'var(--status-good-foreground)'
          : 'var(--muted-foreground)';
  return (
    <span
      className="text-[11.5px] font-medium px-2.5 py-1 rounded-full"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );
}
