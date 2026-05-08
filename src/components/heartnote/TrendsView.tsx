// TrendsView — server component composing the Trends page body. Three
// sparkline cards (weight, sleep, symptoms) + a visit-prep strip.
//
// Plain-English: this is the page that answers "what should I bring up
// at the next cardiology visit?" — patterns over the last two weeks the
// caregiver may not have noticed day-to-day.

import { Heart } from 'lucide-react';
import { StatusPip } from './StatusPip';
import { MiniTrendSpark } from './MiniTrendSpark';
import type { TrendSeries } from '@/lib/trends/series';
import type { Tier } from '@/lib/vitals/per-vital-tier';
import { WEIGHT_GAIN_TIER_2_7D_LB, ROLLING_BASELINE_DAYS } from '@/lib/clinical/thresholds';

interface Props {
  patient: { display_name: string | null; dry_weight_lb: number | null };
  series: TrendSeries;
}

export function TrendsView({ series }: Props) {
  if (series.loadError) {
    return <ErrorView />;
  }

  const weightTier = classifyWeightTier(series);
  const sleepTier = classifySleepTier(series);
  const symptomsTier = classifySymptomsTier(series);

  const nonGoodCount = [weightTier, sleepTier, symptomsTier].filter((t) => t !== 'good' && t !== 'unknown').length;

  return (
    <div className="px-1">
      <header className="px-5 pt-8 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Trends · last 14 days
        </p>
        <h1
          className="font-display text-[28px] text-foreground mt-1.5 leading-tight"
          style={{ letterSpacing: '-0.02em' }}
        >
          {headlineForCount(nonGoodCount)}
        </h1>
      </header>

      <WeightCard series={series} tier={weightTier} />
      <SleepCard series={series} tier={sleepTier} />
      <SymptomsCard series={series} tier={symptomsTier} />

      <section className="mx-4 mt-5 mb-2 rounded-2xl bg-card border border-border p-4 flex items-start gap-3">
        <span
          className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'var(--status-good-soft)', color: 'var(--status-good-foreground)' }}
        >
          <Heart size={16} fill="currentColor" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">
            Bring this to the next cardiology visit.
          </p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Weight, symptoms, and questions worth asking — pulled from the last two weeks.
          </p>
        </div>
      </section>
    </div>
  );
}

function WeightCard({ series, tier }: { series: TrendSeries; tier: Tier }) {
  const last = series.weight14d[series.weight14d.length - 1] ?? null;
  const baseline = series.weight7dBaselineLb;
  const delta = last !== null && baseline !== null ? last.v - baseline : null;
  const threshold =
    baseline !== null && tier !== 'unknown' ? baseline + WEIGHT_GAIN_TIER_2_7D_LB : undefined;
  const sparkColor =
    tier === 'alert'
      ? 'var(--status-alert)'
      : tier === 'watch'
        ? 'var(--status-watch)'
        : 'var(--sage)';

  return (
    <section className="mx-4 mt-5 rounded-3xl bg-card border border-border shadow-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Dry weight
          </p>
          {last ? (
            <p
              className="font-display text-[28px] text-foreground tabular-nums mt-1 leading-none"
              style={{ letterSpacing: '-0.02em' }}
            >
              {last.v.toFixed(1)}
              <span className="text-sm text-muted-foreground font-normal ml-1">lb</span>
            </p>
          ) : (
            <p className="font-display text-[28px] text-muted-foreground mt-1">—</p>
          )}
          {delta !== null && (
            <p className="text-xs tabular-nums text-muted-foreground mt-1">
              {delta > 0 ? '↑' : delta < 0 ? '↓' : '·'} {Math.abs(delta).toFixed(1)} lb in {ROLLING_BASELINE_DAYS} days
            </p>
          )}
        </div>
        <Badge tier={tier} />
      </div>
      {series.weight14d.length >= 2 && (
        <div className="mt-3">
          <MiniTrendSpark
            data={series.weight14d.map((p) => ({ d: p.d, v: p.v }))}
            color={sparkColor}
            thresholdValue={threshold}
            baselineValue={baseline ?? undefined}
            height={64}
          />
        </div>
      )}
      {series.weight14d.length === 0 && (
        <p className="text-xs text-muted-foreground mt-2">No weight readings in the last 14 days.</p>
      )}
    </section>
  );
}

function SleepCard({ series, tier }: { series: TrendSeries; tier: Tier }) {
  return (
    <section className="mx-4 mt-4 rounded-3xl bg-card border border-border shadow-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sleep
          </p>
          <p
            className="font-display text-[28px] text-foreground tabular-nums mt-1 leading-none"
            style={{ letterSpacing: '-0.02em' }}
          >
            {series.restlessNights14d}
            <span className="text-sm text-muted-foreground font-normal ml-1">restless</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1 tabular-nums">
            {series.restlessNights14d === 0
              ? 'no nighttime cough or extra pillows'
              : `${series.restlessNights14d} night${series.restlessNights14d === 1 ? '' : 's'} / 14d`}
          </p>
        </div>
        <Badge tier={tier} />
      </div>
    </section>
  );
}

function SymptomsCard({ series, tier }: { series: TrendSeries; tier: Tier }) {
  return (
    <section className="mx-4 mt-4 rounded-3xl bg-card border border-border shadow-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Symptom mentions
          </p>
          <p
            className="font-display text-[28px] text-foreground tabular-nums mt-1 leading-none"
            style={{ letterSpacing: '-0.02em' }}
          >
            {series.symptomsTotal7d}
            <span className="text-sm text-muted-foreground font-normal ml-1">this week</span>
          </p>
        </div>
        <Badge tier={tier} />
      </div>
      {series.topSymptoms7d.length > 0 && (
        <div className="mt-3 flex gap-1.5 flex-wrap">
          {series.topSymptoms7d.map((s) => (
            <span
              key={s.label}
              className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground tabular-nums"
            >
              {s.label} · {s.count}
            </span>
          ))}
        </div>
      )}
      {series.topSymptoms7d.length === 0 && series.symptomsTotal7d === 0 && (
        <p className="text-xs text-muted-foreground mt-2">No symptoms reported in the last 7 days.</p>
      )}
    </section>
  );
}

function Badge({ tier }: { tier: Tier }) {
  if (tier === 'unknown') return null;
  const label = tier === 'alert' ? 'Alert' : tier === 'watch' ? 'Watch' : 'Good';
  const bg =
    tier === 'alert'
      ? 'var(--status-alert-soft)'
      : tier === 'watch'
        ? 'var(--status-watch-soft)'
        : 'var(--status-good-soft)';
  const fg =
    tier === 'alert'
      ? 'var(--status-alert-foreground)'
      : tier === 'watch'
        ? 'var(--status-watch-foreground)'
        : 'var(--status-good-foreground)';
  return (
    <span
      className="text-[11.5px] font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 shrink-0"
      style={{ background: bg, color: fg }}
    >
      <StatusPip tier={tier} size={6} />
      {label}
    </span>
  );
}

function classifyWeightTier(series: TrendSeries): Tier {
  if (series.weight14d.length === 0) return 'unknown';
  if (series.weight14d.length === 1) return 'unknown';
  const last = series.weight14d[series.weight14d.length - 1].v;
  const baseline = series.weight7dBaselineLb;
  if (baseline === null) return 'unknown';
  const delta = last - baseline;
  if (delta >= WEIGHT_GAIN_TIER_2_7D_LB) return 'alert';
  if (delta >= 1) return 'watch';
  return 'good';
}

function classifySleepTier(series: TrendSeries): Tier {
  if (series.restlessNights14d === 0) return 'good';
  if (series.restlessNights14d <= 2) return 'good';
  if (series.restlessNights14d <= 5) return 'watch';
  return 'alert';
}

function classifySymptomsTier(series: TrendSeries): Tier {
  if (series.symptomsTotal7d === 0) return 'good';
  if (series.symptomsTotal7d <= 3) return 'good';
  if (series.symptomsTotal7d <= 6) return 'watch';
  return 'alert';
}

const NUMBER_WORD = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

function headlineForCount(n: number): string {
  if (n === 0) return 'Nothing pulling at your attention this week.';
  if (n === 1) return 'One pattern worth flagging at the next visit.';
  if (n < 10) return `${NUMBER_WORD[n]} patterns worth flagging at the next visit.`;
  return `${n} patterns worth flagging at the next visit.`;
}

function ErrorView() {
  return (
    <div className="px-5 pt-8">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Trends · last 14 days
      </p>
      <h1 className="font-display text-[28px] text-foreground mt-1">Couldn&rsquo;t load trends.</h1>
      <p className="text-sm text-muted-foreground mt-2">
        This data isn&rsquo;t loading right now. Try again in a moment.
      </p>
    </div>
  );
}
