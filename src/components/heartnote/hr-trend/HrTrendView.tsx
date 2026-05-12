'use client';

// Client view for /trends/hr. Same chassis as Spo2TrendView, with three
// HR-specific divergences:
//
//   1. Range-bar chart per day (min / mean / max) for W/M/6M/Y; dots-only
//      on D (sub-day granularity has no range). Built on TraceChart's
//      `rangeBars` extension — not a separate chart file.
//   2. Hero is integer bpm.
//   3. Stat trio is Highest / Lowest / Today per mockup. "Today" =
//      latest reading inside today (patient tz); empty cell if none.
//   4. Default period is W per mockup.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Plus } from 'lucide-react';
import { TraceChart } from '@/components/heartnote/vitals-trend/TraceChart';
import {
  AddReadingSheet,
  type AddReadingInput,
} from '@/components/heartnote/vitals-trend/AddReadingSheet';
import { InfoMenu } from '@/components/heartnote/vitals-trend/InfoMenu';
import { ViewDataSheet } from '@/components/heartnote/vitals-trend/ViewDataSheet';
import type { VitalReadingConfig } from '@/components/heartnote/vitals-trend/vital-reading-config';
import type {
  VitalReading,
  WindowPeriod,
} from '@/lib/trends/vital-reading';
import { yScaleFor } from '@/lib/trends/y-scale';
import {
  backwardBoundForPeriod,
  dayTimeLabel,
  defaultEndForPeriod,
  forwardBoundForPeriod,
  subheadFor,
  windowSpanMs,
  xLabelsFor,
} from '@/lib/trends/window-math';
import {
  findTappedBucket,
  findTappedReading,
  TAP_MOVE_THRESHOLD_PX,
} from '@/lib/trends/tap-hit';
import { READING_RANGE } from '@/lib/clinical/reading-ranges';
import { HR_TIER_2_HIGH } from '@/lib/clinical/thresholds';
import { isoFromWallClock } from '@/lib/dates/from-wall-clock';
import {
  addHrReading,
  deleteHrReadings,
  deleteAllHrReadings,
} from '@/app/trends/hr/actions';

// Visual ceiling per docs/design/heartnote-vitals-trends-mockup.html
// Phone 2 (ticks at 60 / 80 / 100 / 110). NOT a clinical threshold —
// HR_TIER_2_VERY_HIGH (120) lives in thresholds.ts and remains the
// engine's alert boundary. Co-located here so the chart can change
// without touching the clinical constant file.
const HR_CHART_CEILING_BPM = 110;

interface Props {
  patientFirstName: string;
  timezone: string;
  today: string;
  allReadings: VitalReading[];
}

const PERIODS: WindowPeriod[] = ['D', 'W', 'M', '6M', 'Y'];

const HR_CONFIG: VitalReadingConfig = {
  field: 'resting_hr',
  fieldLabel: 'Resting heart rate',
  unit: 'bpm',
  range: READING_RANGE.resting_hr,
  step: 1,
  integer: true,
  splitDecimal: false,
  pressAndHold: false,
  formatValue: (v) => String(Math.round(v)),
  sheetTitle: 'Add resting heart rate',
  listTitle: 'All heart-rate readings',
  eyebrowLine: (_baseline, seed) =>
    seed !== null ? `last ${Math.round(seed)} bpm` : null,
  deleteNoun: {
    singular: 'heart-rate reading',
    plural: 'heart-rate readings',
  },
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function HrTrendView({
  patientFirstName,
  timezone,
  today,
  allReadings,
}: Props) {
  const router = useRouter();

  const oldestMs = useMemo(
    () =>
      allReadings.length > 0
        ? Date.parse(allReadings[0].recorded_at)
        : null,
    [allReadings],
  );

  const [period, setPeriodRaw] = useState<WindowPeriod>('W');

  const forwardBound = useMemo(
    () => forwardBoundForPeriod(period, today, timezone),
    [period, today, timezone],
  );
  const backwardBound = useMemo(
    () => backwardBoundForPeriod(period, oldestMs, today, timezone),
    [period, oldestMs, today, timezone],
  );

  const [endMs, setEndMs] = useState(() =>
    defaultEndForPeriod('W', today, timezone),
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewDataOpen, setViewDataOpen] = useState(false);
  // Selection is either a per-reading id (D mode) or a per-bucket
  // dayKey (W/M/6M/Y range-bar mode). The two never coexist —
  // changing periods clears it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const setPeriod = (p: WindowPeriod) => {
    setPeriodRaw(p);
    setEndMs(defaultEndForPeriod(p, today, timezone));
    setSelectedId(null);
  };

  const startMs = endMs - windowSpanMs(period);

  const slice = useMemo(() => {
    return allReadings.filter((r) => {
      const t = Date.parse(r.recorded_at);
      return t >= startMs && t <= endMs;
    });
  }, [allReadings, startMs, endMs]);

  const latestEver =
    allReadings.length > 0 ? allReadings[allReadings.length - 1] : null;

  // D-view selects individual readings; W/M/6M/Y select per-day
  // aggregations (rangeBars). The hero / subhead unify around a
  // "display" shape: { value, recorded_at }.
  const usesRangeBars = period !== 'D';

  // Floor: 100 (HR_TIER_2_HIGH dashed alert line must stay visible).
  // Ceiling: 110 (mockup visual choice).
  const yScale = useMemo(
    () =>
      yScaleFor(allReadings, {
        floor: HR_TIER_2_HIGH,
        ceiling: HR_CHART_CEILING_BPM,
        singleValueHalfRange: 10,
      }),
    [allReadings],
  );
  const xLabels = useMemo(
    () => xLabelsFor(period, endMs, timezone),
    [period, endMs, timezone],
  );

  // Per-day min/mean/max for W/M; per-week for 6M/Y. D shows dots-only.
  const rangeBars = useMemo(
    () => buildRangeBars(slice, period, timezone),
    [slice, period, timezone],
  );

  // Resolve the selected entity. In range-bar mode it's a bucket
  // (matched by dayKey); in D mode it's an individual reading.
  const selectedBucket = usesRangeBars && selectedId
    ? rangeBars.find((b) => b.dayKey === selectedId) ?? null
    : null;
  const selectedReading = !usesRangeBars && selectedId
    ? slice.find((r) => r.id === selectedId) ?? null
    : null;

  // Hero value + timestamp, unified across the two selection modes.
  const heroValue = selectedBucket
    ? selectedBucket.mean
    : selectedReading
      ? selectedReading.value
      : slice.length > 0
        ? slice[slice.length - 1].value
        : null;
  const heroMs = selectedBucket
    ? selectedBucket.recordedAtMs
    : selectedReading
      ? Date.parse(selectedReading.recorded_at)
      : slice.length > 0
        ? Date.parse(slice[slice.length - 1].recorded_at)
        : null;

  const subhead = useMemo(() => {
    if (isDragging && period === 'D') {
      return dayTimeLabel(endMs, timezone, today);
    }
    if (selectedBucket || selectedReading) {
      // Always describe the selected entity by its calendar timestamp.
      return heroMs !== null
        ? dayTimeLabel(heroMs, timezone, today)
        : '';
    }
    return subheadFor(period, startMs, endMs, timezone, today);
  }, [
    isDragging,
    selectedBucket,
    selectedReading,
    heroMs,
    period,
    startMs,
    endMs,
    timezone,
    today,
  ]);

  const hasAnyReadings = allReadings.length > 0;

  const dragRef = useRef<{
    startX: number;
    startEnd: number;
    w: number;
    moved: boolean;
  } | null>(null);
  const chartWrapRef = useRef<HTMLDivElement | null>(null);

  const onChartPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const w = chartWrapRef.current?.offsetWidth ?? 0;
    if (w <= 0) return;
    dragRef.current = {
      startX: e.clientX,
      startEnd: endMs,
      w,
      moved: false,
    };
    setIsDragging(true);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore — Safari can throw on pointer capture in rare cases
    }
  };

  const onChartPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const { startX, startEnd, w } = dragRef.current;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > TAP_MOVE_THRESHOLD_PX) {
      dragRef.current.moved = true;
    }
    if (period === 'Y') return;
    const span = windowSpanMs(period);

    if (period === 'D') {
      const dt = -(dx / w) * span;
      setEndMs(clamp(startEnd + dt, backwardBound, forwardBound));
      return;
    }

    const threshold = w * 0.25;
    if (Math.abs(dx) < threshold) {
      setEndMs(clamp(startEnd, backwardBound, forwardBound));
      return;
    }
    const steps = -Math.trunc(dx / threshold);
    const nextRaw = startEnd + steps * span;
    setEndMs(clamp(nextRaw, backwardBound, forwardBound));
  };

  const onChartPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);
    if (!drag || drag.moved) return;
    const wrap = chartWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    if (usesRangeBars) {
      const tapped = findTappedBucket(
        rangeBars,
        startMs,
        endMs,
        xPx,
        rect.width,
      );
      setSelectedId(tapped ? tapped.dayKey : null);
    } else {
      const tapped = findTappedReading(slice, startMs, endMs, xPx, rect.width);
      setSelectedId(tapped ? tapped.id : null);
    }
  };

  useEffect(() => () => {
    dragRef.current = null;
  }, []);

  const onSave = async (input: AddReadingInput) => {
    const result = await addHrReading(input);
    if (result.ok) router.refresh();
    return result;
  };

  return (
    <>
      <header className="px-5 pt-4 pb-2 flex items-center gap-2">
        <Link
          href="/trends"
          aria-label="Back to trends"
          className="inline-flex items-center justify-center rounded-full"
          style={{
            width: 32,
            height: 32,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
          }}
        >
          <ChevronLeft size={14} />
        </Link>
        <h1
          className="font-display text-[16px]"
          style={{ letterSpacing: '-0.2px', fontWeight: 500 }}
        >
          Resting heart rate
        </h1>
      </header>

      <div className="px-5 pb-32">
        <div className="mt-3 flex items-end gap-2">
          <span
            className="font-display"
            style={{
              fontSize: 78,
              lineHeight: 0.95,
              letterSpacing: '-3px',
              fontWeight: 300,
              color:
                heroValue !== null
                  ? 'var(--foreground)'
                  : 'var(--muted-foreground)',
            }}
          >
            {heroValue !== null ? Math.round(heroValue) : '—'}
          </span>
          <span
            className="text-muted-foreground"
            style={{
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: '0.3px',
              paddingBottom: 12,
            }}
          >
            bpm
          </span>
        </div>
        <p
          className="text-[12px] text-muted-foreground mt-1"
          style={{ letterSpacing: '0.3px' }}
        >
          {subhead}
        </p>

        <div className="mt-5">
          <div className="flex items-baseline justify-between px-0.5">
            <span
              className="font-display text-foreground"
              style={{ fontSize: 14, fontWeight: 500, letterSpacing: '-0.2px' }}
            >
              Resting heart rate
            </span>
            <span
              className="text-[10px] text-muted-foreground uppercase"
              style={{ letterSpacing: '0.5px', fontWeight: 500 }}
            >
              bpm
            </span>
          </div>
          <div
            className="flex gap-0.5 rounded-full p-[3px] my-3"
            style={{ background: 'var(--cream-soft, #EFE7D9)' }}
            role="tablist"
            aria-label="Time range"
          >
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={period === p}
                onClick={() => setPeriod(p)}
                className="flex-1 rounded-full text-[11px] font-semibold uppercase transition"
                style={{
                  padding: '6px 0',
                  background: period === p ? 'var(--card)' : 'transparent',
                  color:
                    period === p
                      ? 'var(--foreground)'
                      : 'var(--muted-foreground)',
                  letterSpacing: '0.5px',
                  boxShadow:
                    period === p
                      ? '0 1px 3px rgba(60, 50, 40, 0.10)'
                      : 'none',
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <div
            ref={chartWrapRef}
            onPointerDown={onChartPointerDown}
            onPointerMove={onChartPointerMove}
            onPointerUp={onChartPointerEnd}
            onPointerCancel={onChartPointerEnd}
            style={{
              width: '100%',
              aspectRatio: '280 / 132',
              touchAction: period === 'Y' ? 'auto' : 'pan-y',
              cursor: period === 'Y' ? 'default' : 'ew-resize',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            <TraceChart
              data={allReadings}
              startMs={startMs}
              endMs={endMs}
              xAxisLabels={xLabels}
              yMin={yScale.min}
              yMax={yScale.max}
              yTicks={yScale.ticks}
              ariaLabel="Heart-rate trend chart"
              // D shows individual readings as dots — sub-day granularity
              // has no "range." W/M/6M/Y show range bars per group.
              showLine={false}
              rangeBars={period === 'D' ? undefined : rangeBars}
              alertFloor={{
                y: HR_TIER_2_HIGH,
                color: 'var(--destructive, #C46A4A)',
              }}
              selectedId={selectedId}
            />
          </div>
          <div
            className="relative"
            style={{ width: '100%', height: 14, marginTop: -2 }}
          >
            {xLabels.map((l, i) => {
              const positionPct = ((6 + l.x * 242) / 280) * 100;
              return (
                <span
                  key={i}
                  className="absolute text-muted-foreground"
                  style={{
                    left: `${positionPct}%`,
                    transform: 'translateX(-50%)',
                    top: 0,
                    fontSize: 9,
                    letterSpacing: '0.2px',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {l.label}
                </span>
              );
            })}
          </div>
        </div>

        {hasAnyReadings && (
          <div
            className="mt-4 grid grid-cols-3 rounded-2xl"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
            }}
          >
            {tripleStatsHr(slice, today, timezone).map((s, i) => (
              <div key={s.label} className="px-3 pt-3 pb-2.5 relative">
                {i > 0 && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-3 bottom-3 w-px"
                    style={{ background: 'var(--border)' }}
                  />
                )}
                <p
                  className="text-[8.5px] font-semibold uppercase text-muted-foreground mb-1"
                  style={{ letterSpacing: '0.8px' }}
                >
                  {s.label}
                </p>
                <p
                  className="font-display text-foreground"
                  style={{
                    fontSize: 17,
                    fontWeight: 500,
                    lineHeight: 1.1,
                    letterSpacing: '-0.3px',
                  }}
                >
                  {s.value}
                  <span
                    className="text-muted-foreground"
                    style={{ fontSize: 9.5, fontWeight: 500, marginLeft: 1 }}
                  >
                    {s.unit}
                  </span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                  {s.sub}
                </p>
              </div>
            ))}
          </div>
        )}

        {hasAnyReadings && slice.length > 0 && (
          <p
            className="mt-3 text-[11px] italic text-muted-foreground"
            style={{ lineHeight: 1.5 }}
          >
            <b style={{ fontStyle: 'normal', fontWeight: 600 }}>
              {slice.length} reading{slice.length === 1 ? '' : 's'} in this
              window
            </b>{' '}
            · {allReadings.length} total in the last year
          </p>
        )}

        {!hasAnyReadings && (
          <p
            className="mt-3 text-[11px] italic text-muted-foreground"
            style={{ lineHeight: 1.5 }}
          >
            No readings yet — tap + to add the first.
          </p>
        )}
      </div>

      <div
        className="fixed left-0 right-0 flex justify-between items-end pointer-events-none"
        style={{
          bottom: 22,
          paddingLeft: 28,
          paddingRight: 28,
          zIndex: 30,
        }}
      >
        <InfoMenu
          items={[
            { label: 'View data', onSelect: () => setViewDataOpen(true) },
          ]}
        />
        <button
          type="button"
          aria-label="Add resting heart rate"
          onClick={() => setSheetOpen(true)}
          className="inline-flex items-center justify-center rounded-full pointer-events-auto active:scale-95 transition"
          style={{
            width: 46,
            height: 46,
            background: 'rgba(251, 247, 240, 0.55)',
            border: '1px solid color-mix(in oklab, #3D332A 22%, transparent)',
            color: '#6B5E52',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          <Plus size={20} strokeWidth={1.6} />
        </button>
      </div>

      {sheetOpen && (
        <AddReadingSheet
          config={HR_CONFIG}
          onClose={() => setSheetOpen(false)}
          seedValue={latestEver?.value ?? null}
          baselineValue={null}
          timezone={timezone}
          onSave={onSave}
        />
      )}

      {viewDataOpen && (
        <ViewDataSheet
          config={HR_CONFIG}
          readings={allReadings}
          patientFirstName={patientFirstName}
          timezone={timezone}
          today={today}
          onClose={() => setViewDataOpen(false)}
          deleteByIds={deleteHrReadings}
          deleteAll={deleteAllHrReadings}
        />
      )}
    </>
  );
}

// ─── Range-bar aggregation ──────────────────────────────────────────────────

// Group the visible slice into buckets and compute {min, mean, max} per
// bucket. W/M bucket by log_date; 6M/Y bucket by ISO calendar week so
// 50+ days don't render as 50 micro-bars. D returns empty (the chart
// falls back to dots).
function buildRangeBars(
  slice: VitalReading[],
  period: WindowPeriod,
  tz: string,
): { dayKey: string; min: number; mean: number; max: number; recordedAtMs: number }[] {
  if (period === 'D' || slice.length === 0) return [];

  const byBucket = new Map<string, VitalReading[]>();
  for (const r of slice) {
    const key =
      period === 'W' || period === 'M' ? r.log_date : weekKey(r.log_date);
    const arr = byBucket.get(key);
    if (arr) arr.push(r);
    else byBucket.set(key, [r]);
  }

  const out: { dayKey: string; min: number; mean: number; max: number; recordedAtMs: number }[] = [];
  for (const [key, rs] of byBucket.entries()) {
    const values = rs.map((r) => r.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const anchorDay = period === 'W' || period === 'M' ? key : key;
    const isoNoon = isoFromWallClock(`${anchorDay}T12:00`, tz);
    const recordedAtMs = isoNoon ? Date.parse(isoNoon) : Date.now();
    out.push({ dayKey: key, min, mean, max, recordedAtMs });
  }
  out.sort((a, b) => a.recordedAtMs - b.recordedAtMs);
  return out;
}

// ISO week key for 6M/Y bucketing. log_date is YYYY-MM-DD; compute the
// Sunday-anchored week start (cheap approximation — exact ISO Mon-Sun
// boundary isn't load-bearing for visual aggregation).
function weekKey(logDate: string): string {
  const d = new Date(`${logDate}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Sun
  const sunday = new Date(d.getTime() - dow * 24 * 60 * 60 * 1000);
  return sunday.toISOString().slice(0, 10);
}

// ─── Stats trio ──────────────────────────────────────────────────────────────

function timeLabelFor(r: VitalReading, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(r.recorded_at));
}

function shortDateLabelLocal(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
  }).format(new Date(ms));
}

function tripleStatsHr(
  slice: VitalReading[],
  today: string,
  tz: string,
): { label: string; value: string; unit: string; sub: string }[] {
  if (slice.length === 0) {
    return [
      { label: 'Highest', value: '—', unit: '', sub: '' },
      { label: 'Lowest', value: '—', unit: '', sub: '' },
      { label: 'Today', value: '—', unit: '', sub: '' },
    ];
  }
  const sortedAsc = [...slice].sort((a, b) => a.value - b.value);
  const lowest = sortedAsc[0];
  const highest = sortedAsc[sortedAsc.length - 1];
  const todayReadings = slice.filter((r) => r.log_date === today);
  const todayLatest =
    todayReadings.length > 0 ? todayReadings[todayReadings.length - 1] : null;
  const fmt = (v: number) => String(Math.round(v));
  return [
    {
      label: 'Highest',
      value: fmt(highest.value),
      unit: 'bpm',
      sub: subLabel(highest, today, tz),
    },
    {
      label: 'Lowest',
      value: fmt(lowest.value),
      unit: 'bpm',
      sub: subLabel(lowest, today, tz),
    },
    todayLatest
      ? {
          label: 'Today',
          value: fmt(todayLatest.value),
          unit: 'bpm',
          sub: timeLabelFor(todayLatest, tz),
        }
      : {
          label: 'Today',
          value: '—',
          unit: '',
          sub: 'no reading today',
        },
  ];
}

function subLabel(r: VitalReading, today: string, tz: string): string {
  if (r.log_date === today) return timeLabelFor(r, tz);
  return shortDateLabelLocal(Date.parse(r.recorded_at), tz);
}
