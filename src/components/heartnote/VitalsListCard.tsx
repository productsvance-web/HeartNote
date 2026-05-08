// "Today's signals" — server component. Five rows: weight, swelling,
// breathing, pillows, cough. Each row's tier comes from the per-vital
// classifier, which reads the engine's daily_assessments.triggers (so
// row pips never disagree with the home headline).

import { ChevronRight } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getTodaySnapshot } from '@/lib/vitals/today-snapshot';
import { getBaselineContext } from '@/lib/vitals/baseline-context';
import { classifyVitals, type PerVitalRow, type TriggerRow } from '@/lib/vitals/per-vital-tier';
import { StatusPip } from './StatusPip';

interface Props {
  supabase: SupabaseClient;
  patientId: string;
  logDate: string;
  triggers: TriggerRow[];
  coldStart: boolean;
  pillowBaseline: number | null;
}

export async function VitalsListCard({
  supabase,
  patientId,
  logDate,
  triggers,
  coldStart,
  pillowBaseline,
}: Props) {
  const snap = await getTodaySnapshot(supabase, patientId, logDate);
  if (!snap) return null;

  const baseline = await getBaselineContext(
    supabase,
    patientId,
    logDate,
    coldStart,
    pillowBaseline,
  );

  const rows = classifyVitals(snap, triggers, baseline);
  const reported = rows.filter((r) => r.tier !== 'unknown').length;

  return (
    <section className="mx-4 mt-5">
      <div className="flex items-baseline justify-between px-1.5 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Today&rsquo;s signals
        </p>
        <p className="text-[11px] text-muted-foreground tabular-nums">{reported} of 5 logged</p>
      </div>
      <div className="rounded-3xl bg-card border border-border shadow-card overflow-hidden">
        {rows.map((row, i) => (
          <VitalRow key={row.key} row={row} isLast={i === rows.length - 1} />
        ))}
      </div>
    </section>
  );
}

function VitalRow({ row, isLast }: { row: PerVitalRow; isLast: boolean }) {
  const subColor =
    row.tier === 'alert'
      ? 'var(--status-alert-foreground)'
      : row.tier === 'watch'
        ? 'var(--status-watch-foreground)'
        : 'var(--muted-foreground)';
  return (
    <div
      className="flex items-center gap-3 px-5 py-3"
      style={{
        minHeight: 52,
        borderBottom: isLast
          ? 'none'
          : '0.5px solid color-mix(in oklab, var(--border) 80%, transparent)',
      }}
    >
      <StatusPip tier={row.tier} size={9} />
      <div className="flex-1 min-w-0">
        <p className="text-[14.5px] font-medium text-foreground leading-tight">{row.label}</p>
      </div>
      <div className="text-right shrink-0">
        <p
          className="text-sm font-medium text-foreground tabular-nums leading-tight"
          style={{ letterSpacing: '-0.005em' }}
        >
          {row.value}
        </p>
        {row.sub && (
          <p className="text-[11.5px] tabular-nums mt-0.5" style={{ color: subColor }}>
            {row.sub}
          </p>
        )}
      </div>
      <ChevronRight size={14} className="text-muted-foreground/40 shrink-0" />
    </div>
  );
}
