// SharedSnapshotView — the public-facing read-only render of mom's
// status. Reachable via a per-share token at /s/[token]; siblings open
// the link without an account.
//
// Strict redaction: nothing here exposes contact info, medications, the
// cardiologist, the voice-log transcript, or any column not explicitly
// included in the snapshot. The only PII surfaced is the patient's first
// name and the caregiver's first name (both already chosen as display
// names by the caregiver in their own profile).

import { Heart } from 'lucide-react';
import { MiniTrendSpark } from './MiniTrendSpark';
import { StatusPip } from './StatusPip';
import type { SharedSnapshot, SharedTier } from '@/lib/family/snapshot';
import { ROLLING_BASELINE_DAYS } from '@/lib/clinical/thresholds';

interface Props {
  snapshot: SharedSnapshot;
}

export function SharedSnapshotView({ snapshot }: Props) {
  const sparkColor =
    snapshot.tier === 'alert'
      ? 'var(--status-alert)'
      : snapshot.tier === 'watch'
        ? 'var(--status-watch)'
        : 'var(--sage)';
  return (
    <div
      className="min-h-screen bg-cream"
      style={{ background: 'linear-gradient(to bottom, var(--cream), var(--background))' }}
    >
      <div className="max-w-md mx-auto px-5 pb-10">
        <header className="pt-10 flex items-center gap-2">
          <Heart
            size={18}
            fill="currentColor"
            style={{ color: 'var(--status-alert)' }}
          />
          <span
            className="font-display text-lg font-medium"
            style={{ letterSpacing: '-0.01em' }}
          >
            HeartNote
          </span>
        </header>

        {snapshot.caregiverFirstName && (
          <p className="text-sm text-muted-foreground mt-6">
            Shared by {snapshot.caregiverFirstName}.
          </p>
        )}

        <h1
          className="font-display text-[34px] text-foreground mt-2 leading-tight"
          style={{ letterSpacing: '-0.02em' }}
        >
          How is <span className="italic">{snapshot.patientFirstName}</span> today?
        </h1>

        <section className="mt-6 rounded-3xl bg-card border border-border shadow-card p-5">
          <div className="flex items-center gap-3">
            <StatusPip tier={statusPipTier(snapshot.tier)} size={11} />
            <p
              className="font-display text-[22px] text-foreground"
              style={{ letterSpacing: '-0.02em' }}
            >
              {snapshot.tierLabel}
            </p>
          </div>
          {snapshot.lastLogAt && (
            <p className="text-xs text-muted-foreground mt-2">
              Last check-in {timeAgo(snapshot.lastLogAt)}
            </p>
          )}
          {!snapshot.lastLogAt && (
            <p className="text-xs text-muted-foreground mt-2">
              No check-in logged yet.
            </p>
          )}
        </section>

        {snapshot.weightSeries14d.length >= 2 && (
          <section className="mt-4 rounded-3xl bg-card border border-border shadow-card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Dry weight · last 14 days
            </p>
            {snapshot.weightDelta7dLb !== null && (
              <p
                className="font-display text-[22px] text-foreground tabular-nums mt-1 leading-tight"
                style={{ letterSpacing: '-0.02em' }}
              >
                {snapshot.weightDelta7dLb > 0
                  ? `↑ ${snapshot.weightDelta7dLb.toFixed(1)} lb`
                  : snapshot.weightDelta7dLb < 0
                    ? `↓ ${Math.abs(snapshot.weightDelta7dLb).toFixed(1)} lb`
                    : 'Steady'}
                <span className="text-sm text-muted-foreground font-normal ml-2">
                  in {ROLLING_BASELINE_DAYS} days
                </span>
              </p>
            )}
            <div className="mt-3">
              <MiniTrendSpark
                data={snapshot.weightSeries14d.map((p) => ({ d: p.d, v: p.v }))}
                color={sparkColor}
                height={60}
              />
            </div>
          </section>
        )}

        {snapshot.topSymptoms7d.length > 0 && (
          <section className="mt-4 rounded-3xl bg-card border border-border shadow-card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Symptoms · last 7 days
            </p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {snapshot.topSymptoms7d.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center gap-3 text-sm text-foreground"
                >
                  <span className="flex-1">{s.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {s.days} day{s.days === 1 ? '' : 's'} of 7
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {snapshot.weightSeries14d.length < 2 && snapshot.topSymptoms7d.length === 0 && (
          <section className="mt-4 rounded-3xl bg-card border border-border shadow-card p-5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Not enough check-ins yet to show a chart. Patterns become visible after about a
              week of daily logs.
            </p>
          </section>
        )}

        <footer className="mt-8 text-center px-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            This is a check-in shared by {snapshot.caregiverFirstName ?? 'a HeartNote caregiver'}.
            It isn&rsquo;t a medical record. For medical questions, contact{' '}
            <span className="italic">{snapshot.patientFirstName}</span>&rsquo;s cardiologist.
          </p>
        </footer>
      </div>
    </div>
  );
}

function statusPipTier(t: SharedTier): 'good' | 'watch' | 'alert' | 'unknown' {
  if (t === 'alert') return 'alert';
  if (t === 'watch') return 'watch';
  if (t === 'good') return 'good';
  return 'unknown';
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const min = Math.floor(ms / (60 * 1000));
  if (min < 60) return min <= 1 ? 'a minute ago' : `${min} minutes ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
