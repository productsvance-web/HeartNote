// VisitHandoff — the printable summary screen the caregiver hands to the
// cardiologist (or screenshots and texts to the on-call nurse). Real data,
// no mock; every number traces back to a row in the DB.

import { TrendingUp, AlertTriangle, Pill, Heart } from 'lucide-react';
import { MiniTrendSpark } from './MiniTrendSpark';
import type { VisitHandoffData } from '@/lib/visits/generate-handoff';
import { ROLLING_BASELINE_DAYS } from '@/lib/clinical/thresholds';

interface Props {
  data: VisitHandoffData;
  patientName: string;
  visitDate: string;
  visitKind: string | null;
  cardiologistName: string | null;
}

export function VisitHandoff({
  data,
  patientName,
  visitDate,
  visitKind,
  cardiologistName,
}: Props) {
  return (
    <div className="print-area">
      <header className="px-5 mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Visit handoff · last 14 days
        </p>
        <h2
          className="font-display text-[24px] text-foreground mt-1 leading-tight"
          style={{ letterSpacing: '-0.02em' }}
        >
          For {cardiologistName ?? 'cardiology'} on {prettyDate(visitDate)}.
        </h2>
        <p className="text-xs text-muted-foreground mt-1.5">
          {patientName} · {visitKind ?? 'visit'} · {data.daysLogged14d} morning
          {data.daysLogged14d === 1 ? '' : 's'} logged
        </p>
      </header>

      <WeightSection data={data} />
      <TriggersSection data={data} />
      <SymptomsSection data={data} />
      <MedsSection data={data} />
    </div>
  );
}

function WeightSection({ data }: { data: VisitHandoffData }) {
  const series = data.weightSeries14d;
  const delta = data.weightDelta7dLb;
  return (
    <section className="mx-4 mt-5 rounded-3xl bg-card border border-border shadow-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Dry weight
          </p>
          {data.weightLatestLb !== null ? (
            <p
              className="font-display text-[28px] text-foreground tabular-nums mt-1 leading-none"
              style={{ letterSpacing: '-0.02em' }}
            >
              {data.weightLatestLb.toFixed(1)}
              <span className="text-sm text-muted-foreground font-normal ml-1">lb</span>
            </p>
          ) : (
            <p className="font-display text-[28px] text-muted-foreground mt-1">—</p>
          )}
          {delta !== null ? (
            <p className="text-xs tabular-nums text-muted-foreground mt-1">
              {delta > 0 ? '↑' : delta < 0 ? '↓' : '·'} {Math.abs(delta).toFixed(1)} lb in{' '}
              {ROLLING_BASELINE_DAYS} days
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">No weight readings yet.</p>
          )}
        </div>
        <span
          className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
        >
          <TrendingUp size={16} />
        </span>
      </div>
      {series.length >= 2 && (
        <div className="mt-3">
          <MiniTrendSpark
            data={series.map((p) => ({ d: p.d, v: p.v }))}
            color="var(--sage)"
            baselineValue={data.weight7dAgoLb ?? undefined}
            height={64}
          />
        </div>
      )}
      {series.length === 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          No weight readings in the last 14 days.
        </p>
      )}
    </section>
  );
}

function TriggersSection({ data }: { data: VisitHandoffData }) {
  return (
    <section className="mx-4 mt-4 rounded-3xl bg-card border border-border shadow-card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Days HeartNote flagged
          </p>
          <p
            className="font-display text-[24px] text-foreground tabular-nums mt-1 leading-tight"
            style={{ letterSpacing: '-0.02em' }}
          >
            {data.triggers14d.length === 0
              ? 'None this window.'
              : `${data.triggers14d.length} day${data.triggers14d.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <span
          className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'var(--status-watch-soft)', color: 'var(--status-watch-foreground)' }}
        >
          <AlertTriangle size={16} />
        </span>
      </div>

      {data.triggers14d.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {data.triggers14d.map((t) => (
            <li
              key={`${t.date}-${t.tier}`}
              className="flex items-start gap-2 text-sm text-foreground"
            >
              <span className="text-muted-foreground tabular-nums min-w-[3.5rem] mt-0.5 text-xs">
                {prettyDate(t.date)}
              </span>
              <div className="flex-1 min-w-0">
                <span
                  className="text-[10.5px] font-semibold uppercase tracking-wider mr-2"
                  style={{
                    color:
                      t.tier === 'tier_2_today' || t.tier === 'tier_1_911'
                        ? 'var(--status-alert-foreground)'
                        : 'var(--status-watch-foreground)',
                  }}
                >
                  {tierLabel(t.tier)}
                </span>
                <span className="text-sm">{t.labels.join(' · ')}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SymptomsSection({ data }: { data: VisitHandoffData }) {
  return (
    <section className="mx-4 mt-4 rounded-3xl bg-card border border-border shadow-card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Symptom days
      </p>
      {data.symptomDayCounts.length === 0 ? (
        <p
          className="font-display text-[20px] text-foreground tabular-nums mt-1 leading-tight"
          style={{ letterSpacing: '-0.02em' }}
        >
          None reported in the last 14 days.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-1.5">
          {data.symptomDayCounts.slice(0, 8).map((s) => (
            <div key={s.symptom} className="flex items-center gap-3">
              <span className="text-sm text-foreground capitalize flex-1">
                {symptomLabel(s.symptom)}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {s.days} day{s.days === 1 ? '' : 's'} of 14
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MedsSection({ data }: { data: VisitHandoffData }) {
  return (
    <section className="mx-4 mt-4 rounded-3xl bg-card border border-border shadow-card p-5">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Active medications
        </p>
        <span
          className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
        >
          <Pill size={16} />
        </span>
      </div>
      {data.activeMeds.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-3">No medications on file.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {data.activeMeds.map((m) => (
            <li
              key={`${m.drugName}-${m.dose ?? ''}`}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="text-foreground font-medium">{m.drugName}</span>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {m.dose ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed flex items-start gap-1.5">
        <Heart size={11} className="shrink-0 mt-0.5" fill="currentColor" />
        HeartNote does not recommend dose changes. Anything that needs to change is the
        cardiologist&rsquo;s call.
      </p>
    </section>
  );
}

function tierLabel(tier: string): string {
  if (tier === 'tier_1_911') return 'Call 911';
  if (tier === 'tier_2_today') return 'Alert';
  if (tier === 'tier_3_48hr') return 'Watch';
  return tier;
}

function symptomLabel(s: string): string {
  if (s === 'dyspnea') return 'Shortness of breath';
  if (s === 'pnd') return 'Nighttime breathlessness';
  return s.replace(/_/g, ' ');
}

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function prettyDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
