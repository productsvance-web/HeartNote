// HomeAffirmationCard — sage-tinted "all steady" card on green days. The
// home screen never goes silent: when the engine finished and nothing was
// flagged, this card affirms in the same calm register the cold-start hero
// uses for "we're learning." Same recipe — sage 11% tinted card, sage 28%
// border, soft sage shadow.
//
// Plain-English: when mom's morning log is in and nothing crossed a
// threshold, this card sits where HeroAlertCard would otherwise sit and
// summarizes the day's signals in one line ("weight 178.2 lb · breathing
// normal · no cough"). It never says "you're doing great" — that's the
// chirpy register the brand rejects.
//
// Gated upstream: dashboard/page.tsx renders this only when triggers
// length is 0 AND the engine wrote a non-null tier (we're past cold-start
// and the assessment ran). That gate is the source of truth — this
// component does not re-decide.
//
// Citations: research/04-caregiver-language.md (no chirpy copy);
// design source: home-screen.jsx hero recipe + screens.jsx good-state
// summary card.

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

// Picks up to three reported signals and joins them with " · ". Each
// vital reads from the snapshot and never invents data — if the caregiver
// didn't dictate a value, that vital is silent in the summary. Order
// follows the decompensation cascade (weight → swelling → breathing →
// pillows → cough) so the most prognostically important signal is first.
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
