// Sage-tinted "all steady" card on green days. Gated by dashboard/page.tsx
// (rendered only when triggers.length === 0 AND tier !== null) — this
// component does not re-decide. Same card recipe as the cold-start hero.

import type { TodaySnapshot } from '@/lib/vitals/today-snapshot';

interface Props {
  snapshot: TodaySnapshot;
}

export function HomeAffirmationCard({ snapshot }: Props) {
  const summary = summarize(snapshot);

  return (
    <section className="mx-4 mt-5 animate-fade-up">
      <div
        className="rounded-3xl p-5"
        style={{
          background: 'color-mix(in oklab, var(--sage) 11%, var(--card))',
          border: '1px solid color-mix(in oklab, var(--sage) 28%, transparent)',
          boxShadow: '0 2px 16px -8px color-mix(in oklab, var(--sage) 38%, transparent)',
        }}
      >
        <p
          className="flex items-center gap-2 text-[10.5px] font-semibold uppercase"
          style={{
            letterSpacing: '0.08em',
            color: 'var(--accent-foreground)',
          }}
        >
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--status-good)' }}
          />
          All steady
        </p>
        <h2
          className="font-display text-[19px] text-foreground leading-snug mt-2"
          style={{ letterSpacing: '-0.015em' }}
        >
          Doing well today.
        </h2>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{summary}</p>
      </div>
    </section>
  );
}

// Joins up to 3 reported signals with " · ", in decompensation-cascade
// order (weight → swelling → breathing → pillows → cough). Silent on
// signals the caregiver didn't dictate.
function summarize(snap: TodaySnapshot): string {
  const parts: string[] = [];
  if (snap.weightLb !== null) parts.push(`weight ${snap.weightLb.toFixed(1)} lb`);
  if (snap.swelling?.present === false) parts.push('no swelling');
  if (snap.dyspnea?.present === false) parts.push('breathing normal');
  if (snap.pillowCount !== null) {
    parts.push(`${snap.pillowCount} pillow${snap.pillowCount === 1 ? '' : 's'}`);
  }
  if (snap.cough?.present === false) parts.push('no cough');

  if (parts.length === 0) return "Today's check-in is in. Nothing flagged.";
  return parts.slice(0, 3).join(' · ');
}
