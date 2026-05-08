// TrendsView — server component composing the Trends page body. Three
// data cards (weight, sleep, symptom mentions) + a visit-prep strip.
//
// Plain-English: this is the page that answers "what should I bring up
// at the next cardiology visit?" — the last two weeks of weight,
// nighttime restlessness, and symptom mentions, with a status badge on
// the weight card driven by the engine's verdict (so it never disagrees
// with the home headline).
//
// The Sleep and Symptom cards show numeric data only — no status badge.
// Inventing thresholds for those would conflict with the engine's
// canonical rule set; if a rule is worth firing, it will fire on the
// home screen.

import { Heart } from 'lucide-react';
import { StatusPip } from './StatusPip';
import { MiniTrendSpark } from './MiniTrendSpark';
import { CoughHeatmap, type CoughCell } from './CoughHeatmap';
import type { TrendSeries } from '@/lib/trends/series';
import type { Tier, TriggerRow } from '@/lib/vitals/per-vital-tier';
import {
  WEIGHT_ALERT_RULES,
  WEIGHT_WATCH_RULES,
} from '@/lib/vitals/per-vital-tier';
import { WEIGHT_GAIN_TIER_2_7D_LB, ROLLING_BASELINE_DAYS } from '@/lib/clinical/thresholds';

interface Props {
  patient: { display_name: string | null; dry_weight_lb: number | null };
  series: TrendSeries;
  triggers: TriggerRow[];
  coughCells: CoughCell[];
  today: string;
}

export function TrendsView({ series, triggers, coughCells, today }: Props) {
  if (series.loadError) {
    return <ErrorView />;
  }

  const weightTier = classifyWeightTierFromTriggers(triggers, series);
  const nocturnalThisWindow = coughCells.reduce((acc, c) => acc + c.nocturnal, 0);
  const flaggedCount =
    (weightTier === 'alert' || weightTier === 'watch' ? 1 : 0) +
    (nocturnalThisWindow > 0 ? 1 : 0);

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
          {headlineForCount(flaggedCount)}
        </h1>
      </header>

      <WeightCard series={series} tier={weightTier} />
      <CoughHeatmap cells={coughCells} today={today} />
      <SleepCard series={series} />
      <SymptomsCard series={series} />

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

function SleepCard({ series }: { series: TrendSeries }) {
  return (
    <section className="mx-4 mt-4 rounded-3xl bg-card border border-border shadow-card p-5">
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
    </section>
  );
}

function SymptomsCard({ series }: { series: TrendSeries }) {
  return (
    <section className="mx-4 mt-4 rounded-3xl bg-card border border-border shadow-card p-5">
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
      {series.topSymptoms7d.length > 0 && (
        <div className="mt-3 flex gap-1.5 flex-wrap">
          {series.topSymptoms7d.map((s) => (
            <span
              key={s.label}
              className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground"
            >
              {s.label}
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

// Read the engine's per-day assessment directly: if today's daily_assessments
// triggers includes a weight rule, that's the tier. Otherwise fall back to
// "good" when we have data, "unknown" when we don't. No re-implementation of
// thresholds here.
function classifyWeightTierFromTriggers(triggers: TriggerRow[], series: TrendSeries): Tier {
  const ids = new Set(triggers.map((t) => t.rule_id));
  for (const id of WEIGHT_ALERT_RULES) if (ids.has(id)) return 'alert';
  for (const id of WEIGHT_WATCH_RULES) if (ids.has(id)) return 'watch';
  if (series.weight14d.length >= 2) return 'good';
  return 'unknown';
}

function headlineForCount(n: number): string {
  if (n === 0) return 'Nothing pulling at your attention this week.';
  if (n === 1) return 'One pattern worth flagging at the next visit.';
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
