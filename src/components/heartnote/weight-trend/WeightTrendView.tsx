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
import { EkgChart } from './EkgChart';
import { AddWeightSheet, type AddWeightInput } from './AddWeightSheet';
import { InfoMenu } from './InfoMenu';
import { ViewDataSheet } from './ViewDataSheet';
import type {
  WeightReading,
  WindowPeriod,
} from '@/lib/trends/weight-window';
import { isoFromWallClock } from '@/lib/dates/from-wall-clock';
import { isoOffset } from '@/lib/dates/iso-offset';
import { addWeightReading } from '@/app/trends/weight/actions';

interface Props {
  patientFirstName: string;
  timezone: string;
  today: string;
  baselineLb: number | null;
  allReadings: WeightReading[];
}

const PERIODS: WindowPeriod[] = ['D', 'W', 'M', '6M', 'Y'];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function windowSpanMs(period: WindowPeriod): number {
  switch (period) {
    case 'D':
      return DAY_MS;
    case 'W':
      return 7 * DAY_MS;
    case 'M':
      return 30 * DAY_MS;
    case '6M':
      return 182 * DAY_MS;
    case 'Y':
      return 365 * DAY_MS;
  }
}

// End-of-day midnight in patient tz, given a YYYY-MM-DD calendar date.
function endOfDayMs(dayIso: string, tz: string): number {
  const next = isoOffset(dayIso, 1);
  const iso = isoFromWallClock(`${next}T00:00`, tz);
  return iso ? Date.parse(iso) : Date.now();
}

function isoDateOf(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

// Default end-of-window: end of the day containing the latest reading,
// or end of today if no data yet. So D opens on the day the user last
// weighed in — not on a blank "today" if they haven't logged today.
function defaultEndFor(
  latestMs: number | null,
  today: string,
  tz: string,
): number {
  if (latestMs === null) return endOfDayMs(today, tz);
  return endOfDayMs(isoDateOf(latestMs, tz), tz);
}

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

  // Default endMs = end of the latest reading's day. If there's no data,
  // end of today.
  const defaultEnd = useMemo(
    () => defaultEndFor(latestMs, today, timezone),
    [latestMs, today, timezone],
  );

  // Forward bound: user can scrub forward to today (real-time), even if
  // no data exists in those days. Backward bound: user cannot scrub past
  // the day the oldest reading was logged. With no data, both bounds
  // collapse to end-of-today and scrub is effectively disabled.
  const forwardBound = useMemo(
    () => endOfDayMs(today, timezone),
    [today, timezone],
  );
  const backwardBound = useMemo(
    () =>
      oldestMs !== null
        ? endOfDayMs(isoDateOf(oldestMs, timezone), timezone)
        : forwardBound,
    [oldestMs, timezone, forwardBound],
  );

  const [period, setPeriodRaw] = useState<WindowPeriod>('D');
  const [endMs, setEndMs] = useState(defaultEnd);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewDataOpen, setViewDataOpen] = useState(false);

  const setPeriod = (p: WindowPeriod) => {
    setPeriodRaw(p);
    setEndMs(defaultEnd);
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

  const yScale = useMemo(() => yScaleFor(slice), [slice]);
  const xLabels = useMemo(
    () => xLabelsFor(period, endMs, timezone),
    [period, endMs, timezone],
  );

  const subhead = useMemo(
    () => subheadFor(period, startMs, endMs, timezone),
    [period, startMs, endMs, timezone],
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

    // W / M / 6M: swipe-paging. Each chart-width drag = one full
    // window-step (preserves week / month boundaries). Drag past 50%
    // threshold = step; smaller drags hold position. The user's rule:
    // "weeks scrub in entire weeks."
    const threshold = w * 0.5;
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

  const onSave = async (input: AddWeightInput) => {
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
            <EkgChart
              data={slice}
              startMs={startMs}
              endMs={endMs}
              xAxisLabels={xLabels}
              yMin={yScale.min}
              yMax={yScale.max}
              yTicks={yScale.ticks}
            />
          </div>
          {/* X axis labels sit flush under the chart so the eye can
              connect each label to its vertical gridline. Tight margin,
              right-padding matches the chart's PAD_R reservation for
              y-axis labels (32px on a 280-unit canvas → ~11.4% of width). */}
          <div
            className="flex justify-between"
            style={{ marginTop: -2, paddingLeft: 2, paddingRight: '11.4%' }}
          >
            {xLabels.map((l, i) => (
              <span
                key={i}
                className="text-muted-foreground"
                style={{
                  fontSize: 9,
                  letterSpacing: '0.2px',
                  fontWeight: 500,
                }}
              >
                {l.label}
              </span>
            ))}
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
        <AddWeightSheet
          onClose={() => setSheetOpen(false)}
          seedValue={latestEver?.value ?? null}
          baselineLb={baselineLb}
          timezone={timezone}
          onSave={onSave}
        />
      )}

      {viewDataOpen && (
        <ViewDataSheet
          readings={allReadings}
          patientFirstName={patientFirstName}
          timezone={timezone}
          today={today}
          onClose={() => setViewDataOpen(false)}
        />
      )}
    </>
  );
}

function decimalPart(v: number): string {
  return Math.abs(v - Math.floor(v)).toFixed(1).slice(2);
}

// ─── Y axis ──────────────────────────────────────────────────────────────────

const NICE_MULTIPLIERS = [1, 2, 5];
const SINGLE_VALUE_HALF_RANGE_LB = 10;

function niceStep(rawStep: number): number {
  if (rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const base = Math.pow(10, exponent);
  for (const m of NICE_MULTIPLIERS) {
    if (m * base >= rawStep) return m * base;
  }
  return 10 * base;
}

function yScaleFor(slice: WeightReading[]): {
  min: number;
  max: number;
  ticks: number[];
} {
  if (slice.length === 0) {
    return { min: 0, max: 150, ticks: [0, 50, 100, 150] };
  }
  const values = slice.map((r) => r.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);

  if (lo === hi) {
    const step = SINGLE_VALUE_HALF_RANGE_LB;
    const mid = Math.round(lo / step) * step;
    return {
      min: mid - step,
      max: mid + step,
      ticks: [mid - step, mid, mid + step],
    };
  }

  const span = hi - lo;
  const padding = Math.max(1, span * 0.1);
  const paddedLo = lo - padding;
  const paddedHi = hi + padding;
  let step = niceStep((paddedHi - paddedLo) / 3);
  let min = Math.floor(paddedLo / step) * step;
  let max = min + step * 3;
  while (max < paddedHi) {
    step = niceStep(step + 1);
    min = Math.floor(paddedLo / step) * step;
    max = min + step * 3;
  }
  return { min, max, ticks: [min, min + step, min + 2 * step, max] };
}

// ─── X labels ────────────────────────────────────────────────────────────────

function xLabelsFor(
  period: WindowPeriod,
  endMs: number,
  tz: string,
): { x: number; label: string }[] {
  const span = windowSpanMs(period);
  const startMs = endMs - span;
  if (period === 'D') {
    // 5 labels at 0%, 25%, 50%, 75%, 100%, formatted as hour-of-day.
    return Array.from({ length: 5 }, (_, i) => ({
      x: i / 4,
      label: hourLabel(startMs + (i / 4) * span, tz),
    }));
  }
  if (period === 'W') {
    // 7 labels — one per day in the window — showing weekday short names.
    return Array.from({ length: 7 }, (_, i) => ({
      x: i / 6,
      label: weekdayLabel(startMs + (i / 6) * span, tz),
    }));
  }
  if (period === 'M') {
    return Array.from({ length: 5 }, (_, i) => ({
      x: i / 4,
      label: shortDateLabel(startMs + (i / 4) * span, tz),
    }));
  }
  // 6M and Y use month labels at evenly-spaced positions. 6 labels.
  return Array.from({ length: 6 }, (_, i) => ({
    x: i / 5,
    label: monthLabel(startMs + (i / 5) * span, tz),
  }));
}

function hourLabel(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: true,
  }).format(new Date(ms));
}

function weekdayLabel(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).format(new Date(ms));
}

function shortDateLabel(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
  }).format(new Date(ms));
}

function monthLabel(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
  }).format(new Date(ms));
}

// ─── Subhead ─────────────────────────────────────────────────────────────────

function subheadFor(
  period: WindowPeriod,
  startMs: number,
  endMs: number,
  tz: string,
): string {
  if (period === 'D') {
    return `${dayTimeLabel(startMs, tz)} – ${dayTimeLabel(endMs, tz)}`;
  }
  return `${shortDateLabel(startMs, tz)} – ${shortDateLabel(endMs, tz)}`;
}

// "Yesterday, 9 AM" / "Today, 11 PM" / "May 5, 9 AM"
function dayTimeLabel(ms: number, tz: string): string {
  const dayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
  const todayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const yesterdayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - DAY_MS));
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: true,
  }).format(new Date(ms));
  if (dayKey === todayKey) return `Today, ${time}`;
  if (dayKey === yesterdayKey) return `Yesterday, ${time}`;
  return `${shortDateLabel(ms, tz)}, ${time}`;
}

// ─── Stats trio ──────────────────────────────────────────────────────────────

function timeLabelFor(r: WeightReading, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(r.recorded_at));
}

function tripleStats(
  slice: WeightReading[],
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
