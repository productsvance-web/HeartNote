'use client';

// Client view for /trends/weight. Window state is a single endMs (ms
// since epoch) — the right edge of the visible window. Period
// determines the window's WIDTH; endMs determines its position.
//
// Drag on the chart pans the window through time (Apple Health style).
// Chevrons step by full window-width. Y has no scrub (we only track
// 12 months). Period change resets endMs to "now" / end-of-today.

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
  defaultEndForPeriod,
  forwardBoundForPeriod,
  shortDateLabel,
  subheadFor,
  windowSpanMs,
  xLabelsFor,
} from '@/lib/trends/window-math';
import { READING_RANGE } from '@/lib/clinical/reading-ranges';
import {
  addWeightReading,
  deleteWeightReadings,
  deleteAllWeightReadings,
} from '@/app/trends/weight/actions';

interface Props {
  patientFirstName: string;
  timezone: string;
  today: string;
  baselineLb: number | null;
  allReadings: VitalReading[];
}

const PERIODS: WindowPeriod[] = ['D', 'W', 'M', '6M', 'Y'];

// Weight-specific config consumed by the shared sheets.
const WEIGHT_CONFIG: VitalReadingConfig = {
  field: 'weight_lb',
  fieldLabel: 'Weight',
  unit: 'lb',
  range: READING_RANGE.weight_lb,
  step: 0.1,
  integer: false,
  splitDecimal: true,
  pressAndHold: true,
  formatValue: (v) => v.toFixed(1),
  sheetTitle: 'Add weight',
  listTitle: 'All weights',
  eyebrowLine: (baseline, seed) =>
    baseline !== null
      ? `vs. baseline ${baseline.toFixed(1)} lb`
      : seed !== null
        ? `last ${seed.toFixed(1)} lb`
        : null,
  deleteNoun: { singular: 'weight reading', plural: 'weight readings' },
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function WeightTrendView({
  patientFirstName,
  timezone,
  today,
  baselineLb,
  allReadings,
}: Props) {
  const router = useRouter();

  // Anchor + bounds derived from the data, not from "today".
  const latestMs = useMemo(
    () =>
      allReadings.length > 0
        ? Date.parse(allReadings[allReadings.length - 1].recorded_at)
        : null,
    [allReadings],
  );
  const oldestMs = useMemo(
    () =>
      allReadings.length > 0
        ? Date.parse(allReadings[0].recorded_at)
        : null,
    [allReadings],
  );

  const [period, setPeriodRaw] = useState<WindowPeriod>('D');

  // Period-aware default + bounds. D snaps to day boundaries; W to
  // weeks (Sun-Sat); M to calendar months. 6M/Y are rolling.
  const defaultEnd = useMemo(
    () => defaultEndForPeriod(period, latestMs, today, timezone),
    [period, latestMs, today, timezone],
  );
  const forwardBound = useMemo(
    () => forwardBoundForPeriod(period, today, timezone),
    [period, today, timezone],
  );
  const backwardBound = useMemo(
    () => backwardBoundForPeriod(period, oldestMs, today, timezone),
    [period, oldestMs, today, timezone],
  );

  const [endMs, setEndMs] = useState(() =>
    defaultEndForPeriod('D', latestMs, today, timezone),
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewDataOpen, setViewDataOpen] = useState(false);

  const setPeriod = (p: WindowPeriod) => {
    setPeriodRaw(p);
    setEndMs(defaultEndForPeriod(p, latestMs, today, timezone));
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

  const hero = slice.length > 0 ? slice[slice.length - 1] : null;

  // Y-axis is derived from the WHOLE dataset, not the visible window.
  // That keeps the axis stable as the user drags D-day-to-D-day instead
  // of zooming in on each day's tiny intra-day range. The 3-label
  // exception only fires when the entire table has a single reading.
  const yScale = useMemo(() => yScaleFor(allReadings), [allReadings]);
  const xLabels = useMemo(
    () => xLabelsFor(period, endMs, timezone),
    [period, endMs, timezone],
  );

  const subhead = useMemo(
    () => subheadFor(period, startMs, endMs, timezone, today),
    [period, startMs, endMs, timezone, today],
  );

  const hasAnyReadings = allReadings.length > 0;

  // Drag-to-scrub (Apple Health style). pointerdown on the chart starts
  // a drag; pointermove translates endMs by (-dx / chartWidth) × span.
  // pointerup ends. touch-action: pan-y on the container so vertical
  // page scrolling still works.
  const dragRef = useRef<{ startX: number; startEnd: number; w: number } | null>(
    null,
  );
  const chartWrapRef = useRef<HTMLDivElement | null>(null);

  const onChartPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (period === 'Y') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const w = chartWrapRef.current?.offsetWidth ?? 0;
    if (w <= 0) return;
    dragRef.current = { startX: e.clientX, startEnd: endMs, w };
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
    const span = windowSpanMs(period);

    if (period === 'D') {
      // Continuous drag in hour-units. Clamp to [backwardBound, forwardBound].
      const dt = -(dx / w) * span;
      setEndMs(clamp(startEnd + dt, backwardBound, forwardBound));
      return;
    }

    // W / M / 6M: swipe-paging. Each chart-width drag past a 25% threshold
    // = one full window-step. Preserves week / month boundaries (the
    // user's rule: "weeks scrub in entire weeks").
    const threshold = w * 0.25;
    if (Math.abs(dx) < threshold) {
      setEndMs(clamp(startEnd, backwardBound, forwardBound));
      return;
    }
    const steps = -Math.trunc(dx / threshold);
    const nextRaw = startEnd + steps * span;
    setEndMs(clamp(nextRaw, backwardBound, forwardBound));
  };

  const onChartPointerEnd = () => {
    dragRef.current = null;
  };

  useEffect(() => () => {
    dragRef.current = null;
  }, []);

  const onSave = async (input: AddReadingInput) => {
    const result = await addWeightReading(input);
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
          Weight
        </h1>
      </header>

      <div className="px-5 pb-32">
        {/* Hero. Same size whether data is present or muted-empty —
            keeps the layout still and stops the page from re-flowing
            as you scrub between empty and populated windows. */}
        <div className="mt-3 flex items-end gap-2">
          <span
            className="font-display"
            style={{
              fontSize: 36,
              lineHeight: 0.95,
              letterSpacing: '-1px',
              fontWeight: 300,
              color: hero ? 'var(--foreground)' : 'var(--muted-foreground)',
            }}
          >
            {Math.floor(hero?.value ?? 0)}
            <span style={{ fontSize: 22, letterSpacing: '-0.5px' }}>
              .{decimalPart(hero?.value ?? 0)}
            </span>
          </span>
          <span
            className="text-muted-foreground"
            style={{
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.3px',
              paddingBottom: 6,
            }}
          >
            lb
          </span>
        </div>
        {/* Subhead reflects the visible window's exact time range. */}
        <p
          className="text-[12px] text-muted-foreground mt-1"
          style={{ letterSpacing: '0.3px' }}
        >
          {subhead}
        </p>

        {/* Chart section */}
        <div className="mt-5">
          <div className="flex items-baseline justify-between px-0.5">
            <span
              className="font-display text-foreground"
              style={{ fontSize: 14, fontWeight: 500, letterSpacing: '-0.2px' }}
            >
              Weight
            </span>
            <span
              className="text-[10px] text-muted-foreground uppercase"
              style={{ letterSpacing: '0.5px', fontWeight: 500 }}
            >
              lb
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

          {/* Chart container — the drag handler lives here. The SVG inside
              uses an aspect-ratio box so it scales uniformly and never
              stretches on wide viewports. */}
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
              ariaLabel="Weight trend chart"
              // W shows dots only — readings within a single week are
              // independent weigh-ins, not a continuous trend. D / M /
              // 6M / Y connect the dots.
              showLine={period !== 'W'}
            />
          </div>
          {/* X axis labels are absolutely positioned at the same x-coordinate
              as their vertical gridline in the SVG. As the user drags, both
              gridlines and labels slide together — the dots stay anchored to
              their real timestamps in the visible window. */}
          <div
            className="relative"
            style={{ width: '100%', height: 14, marginTop: -2 }}
          >
            {xLabels.map((l, i) => {
              // Map fractional x in inner data area to a percentage of the
              // SVG container's full width. SVG = 280-wide, PAD_L = 6,
              // PAD_R = 32, innerW = 242 → label sits at PAD_L + l.x*innerW
              // in viewBox units, normalized to %.
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

        {/* Stats trio */}
        {slice.length > 0 && (
          <div
            className="mt-4 grid grid-cols-3 rounded-2xl"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
            }}
          >
            {tripleStats(slice, timezone).map((s, i) => (
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
      </div>

      {/* Bottom-bar floating utility row. */}
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
          aria-label="Add weight"
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
          config={WEIGHT_CONFIG}
          onClose={() => setSheetOpen(false)}
          seedValue={latestEver?.value ?? null}
          baselineValue={baselineLb}
          timezone={timezone}
          onSave={onSave}
        />
      )}

      {viewDataOpen && (
        <ViewDataSheet
          config={WEIGHT_CONFIG}
          readings={allReadings}
          patientFirstName={patientFirstName}
          timezone={timezone}
          today={today}
          onClose={() => setViewDataOpen(false)}
          deleteByIds={deleteWeightReadings}
          deleteAll={deleteAllWeightReadings}
        />
      )}
    </>
  );
}

function decimalPart(v: number): string {
  return Math.abs(v - Math.floor(v)).toFixed(1).slice(2);
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

function tripleStats(
  slice: VitalReading[],
  tz: string,
): { label: string; value: string; unit: string; sub: string }[] {
  const latest = slice[slice.length - 1];
  const sortedDesc = [...slice].sort((a, b) => b.value - a.value);
  const highest = sortedDesc[0];
  const lowest = sortedDesc[sortedDesc.length - 1];
  const range = slice.length === 1 ? 0 : highest.value - lowest.value;
  return [
    {
      label: 'Latest',
      value: latest.value.toFixed(1),
      unit: 'lb',
      sub: timeLabelFor(latest, tz),
    },
    {
      label: 'Highest',
      value: highest.value.toFixed(1),
      unit: 'lb',
      sub: timeLabelFor(highest, tz),
    },
    {
      label: 'Range',
      value: range.toFixed(1),
      unit: 'lb',
      sub: slice.length === 1 ? 'one reading' : 'across this window',
    },
  ];
}
