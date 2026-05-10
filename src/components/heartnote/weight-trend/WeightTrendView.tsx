'use client';

// Client view for /trends/weight. Owns the D/W/M/6M/Y filter state.
// Renders the back chevron + title, subject line, hero numeric, chart
// section, lead stat, stats trio, source footer, and the floating "+"
// utility button that opens AddWeightSheet. All windowing math lives in
// src/lib/trends/weight-window.ts so the view stays presentational.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { EkgChart } from './EkgChart';
import { AddWeightSheet, type AddWeightInput } from './AddWeightSheet';
import { InfoMenu } from './InfoMenu';
import { ViewDataSheet } from './ViewDataSheet';
import {
  lowerLogDateFor,
  windowSliceFor,
  intraDayRangeFor,
  type WeightReading,
  type WindowPeriod,
} from '@/lib/trends/weight-window';
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

export function WeightTrendView({
  patientFirstName,
  timezone,
  today,
  baselineLb,
  allReadings,
}: Props) {
  const router = useRouter();
  const [period, setPeriodRaw] = useState<WindowPeriod>('D');
  // endDate = the right edge of the visible window. Defaults to today;
  // chevrons step it backward / forward by one window-width. Period
  // change resets it to today.
  const [endDate, setEndDate] = useState(today);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewDataOpen, setViewDataOpen] = useState(false);

  const setPeriod = (p: WindowPeriod) => {
    setPeriodRaw(p);
    setEndDate(today);
  };

  const slice = useMemo(
    () => windowSliceFor(period, endDate, allReadings),
    [period, endDate, allReadings],
  );

  const latestEver =
    allReadings.length > 0 ? allReadings[allReadings.length - 1] : null;

  const hero = slice.length > 0 ? slice[slice.length - 1] : null;

  const intraDay = intraDayRangeFor(slice, today, timezone);

  const yScale = useMemo(() => yScaleFor(slice), [slice]);
  const xLabels = useMemo(
    () => xLabelsFor(period, endDate),
    [period, endDate],
  );

  const todayReadings = slice.filter((r) => r.log_date === today);
  const hasAnyReadings = allReadings.length > 0;
  const isAtToday = endDate === today;
  const subjectLine =
    todayReadings.length > 0 && isAtToday
      ? subjectFor(patientFirstName, todayReadings, timezone)
      : null;

  // Scrub bounds. Y is fixed (we only track 12 months). For other
  // periods, ◀ enables when there's any reading older than the visible
  // window's start; ▶ enables when the user has scrubbed back from today.
  const windowStart = lowerLogDateFor(period, endDate);
  const hasOlderData = allReadings.some((r) => r.log_date < windowStart);
  const canScrubBack = period !== 'Y' && hasOlderData;
  const canScrubForward = period !== 'Y' && endDate < today;
  const showScrubRow = period !== 'Y' && hasAnyReadings;
  const stepEnd = (dir: -1 | 1) =>
    setEndDate((curr) => stepEndDate(period, curr, dir, today));

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
        {subjectLine && (
          <p
            className="text-[12px] text-muted-foreground mt-2"
            style={{ letterSpacing: '0.3px' }}
          >
            {subjectLine}
          </p>
        )}

        {/* Hero. Real value renders large; the empty-state placeholder
            ("0.0 lb") renders at a quieter size so it doesn't dominate
            a page that has nothing to say yet. */}
        <div className="mt-3 flex items-end gap-2">
          <span
            className="font-display"
            style={{
              fontSize: hero ? 78 : 36,
              lineHeight: 0.95,
              letterSpacing: hero ? '-3px' : '-1px',
              fontWeight: 300,
              color: hero ? 'var(--foreground)' : 'var(--muted-foreground)',
            }}
          >
            {Math.floor(hero?.value ?? 0)}
            <span
              style={{
                fontSize: hero ? 48 : 22,
                letterSpacing: hero ? '-2px' : '-0.5px',
              }}
            >
              .{decimalPart(hero?.value ?? 0)}
            </span>
          </span>
          <span
            className="text-muted-foreground"
            style={{
              fontSize: hero ? 14 : 12,
              fontWeight: 500,
              letterSpacing: '0.3px',
              paddingBottom: hero ? 12 : 6,
            }}
          >
            lb
          </span>
        </div>
        {intraDay !== null && intraDay > 0 && (
          <div className="mt-2.5">
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase rounded-full px-2.5 py-1"
              style={{
                background: 'var(--status-watch-soft, #F2E3C5)',
                color: 'var(--status-watch-foreground, #8A6A35)',
                letterSpacing: '0.3px',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--status-watch, #C49C5A)',
                  display: 'inline-block',
                }}
              />
              ▲ {intraDay.toFixed(1)} lb across today
            </span>
          </div>
        )}

        {/* Chart section */}
        <div className="mt-6">
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
          {/* Scrub row — chevrons step the visible window backward /
              forward by one window-width. ◀ enables when older data
              exists; ▶ enables when the user has scrubbed back from
              today. Hidden on Y (we only track 12 months). */}
          {showScrubRow && (
            <div className="flex items-center justify-between mt-1 mb-2 px-1">
              <button
                type="button"
                aria-label="Older window"
                onClick={() => stepEnd(-1)}
                disabled={!canScrubBack}
                className="inline-flex items-center justify-center rounded-full active:scale-95 transition disabled:opacity-25"
                style={{
                  width: 28,
                  height: 28,
                  background: 'transparent',
                  color: 'var(--foreground)',
                  border: 'none',
                }}
              >
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
              <span
                className="text-[12px] text-muted-foreground tabular-nums"
                style={{ letterSpacing: '0.2px' }}
              >
                {rangeLabel(period, endDate, today, timezone)}
              </span>
              <button
                type="button"
                aria-label="Newer window"
                onClick={() => stepEnd(1)}
                disabled={!canScrubForward}
                className="inline-flex items-center justify-center rounded-full active:scale-95 transition disabled:opacity-25"
                style={{
                  width: 28,
                  height: 28,
                  background: 'transparent',
                  color: 'var(--foreground)',
                  border: 'none',
                }}
              >
                <ChevronRight size={16} strokeWidth={2} />
              </button>
            </div>
          )}

          {/* Aspect-ratio container so the SVG scales uniformly without
              stretching on wide viewports. The chart frame (gridlines +
              axis labels) renders even when the slice is empty. */}
          <div style={{ width: '100%', aspectRatio: '280 / 132' }}>
            <EkgChart
              data={slice}
              period={period}
              today={endDate}
              timezone={timezone}
              xAxisLabels={xLabels}
              yMin={yScale.min}
              yMax={yScale.max}
              yTicks={yScale.ticks}
            />
          </div>
          <div className="flex justify-between mt-1.5 px-1">
            {xLabels.map((l, i) => (
              <span
                key={i}
                className="text-muted-foreground"
                style={{
                  fontSize: 8.5,
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
            className="mt-2 grid grid-cols-3 rounded-2xl"
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

        {/* Source footer — only when readings exist, and only mentions
            the selected window (no "0 in today" footer noise). */}
        {hasAnyReadings && slice.length > 0 && (
          <p
            className="mt-3 text-[11px] italic text-muted-foreground"
            style={{ lineHeight: 1.5 }}
          >
            <b style={{ fontStyle: 'normal', fontWeight: 600 }}>
              {slice.length} reading{slice.length === 1 ? '' : 's'} in{' '}
              {labelFor(period)}
            </b>{' '}
            · {allReadings.length} total in the last year
          </p>
        )}
      </div>

      {/* Bottom-bar floating utility row. "i" (info menu) on the left,
          "+" (add reading) on the right. Both register #6 — Apple-Weather
          translucent cream + backdrop blur. */}
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

// Y-axis algorithm — same shape Apple Health uses:
//
// - Empty data            → 4 labels: [0, 50, 100, 150]
// - Single value (or all  → 3 labels centered on the value:
//   identical):             [v-10, v, v+10]. Dot sits on the middle
//                           gridline. Never on the bottom edge.
// - 2+ distinct values    → 4 labels at "nice" intervals (step from
//                           {1, 2, 5} × 10ⁿ), padded so neither the
//                           min nor max data point sits on the chart's
//                           top or bottom edge.
//
// The rule "no data point on the base" comes from the user; matches
// Apple Health's chart behavior precisely.
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

  // Single value (or multiple identical readings) → center on the
  // middle gridline. 3 labels.
  if (lo === hi) {
    const step = SINGLE_VALUE_HALF_RANGE_LB;
    const mid = Math.round(lo / step) * step;
    return {
      min: mid - step,
      max: mid + step,
      ticks: [mid - step, mid, mid + step],
    };
  }

  // 2+ distinct values → 4 labels with padding so the data sits
  // strictly inside [min, max], never on the edge.
  const span = hi - lo;
  const padding = Math.max(1, span * 0.1);
  const paddedLo = lo - padding;
  const paddedHi = hi + padding;
  let step = niceStep((paddedHi - paddedLo) / 3);
  let min = Math.floor(paddedLo / step) * step;
  let max = min + step * 3;
  // If snapping cut off the high end, bump the step to the next nice
  // value and retry. Converges in <= 2 iterations.
  while (max < paddedHi) {
    step = niceStep(step + 1);
    min = Math.floor(paddedLo / step) * step;
    max = min + step * 3;
  }
  return { min, max, ticks: [min, min + step, min + 2 * step, max] };
}

function xLabelsFor(
  period: WindowPeriod,
  today: string,
): { x: number; label: string }[] {
  switch (period) {
    case 'D':
      return [
        { x: 0, label: '12 AM' },
        { x: 0.25, label: '6 AM' },
        { x: 0.5, label: '12 PM' },
        { x: 0.75, label: '6 PM' },
        { x: 1, label: '12 AM' },
      ];
    case 'W': {
      const labels: { x: number; label: string }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = isoOffset(today, -i);
        labels.push({ x: (6 - i) / 6, label: weekdayLabel(d) });
      }
      return labels;
    }
    case 'M':
      return Array.from({ length: 5 }, (_, i) => ({
        x: i / 4,
        label: shortDateLabel(isoOffset(today, -30 + (i * 30) / 4)),
      }));
    case '6M':
      return Array.from({ length: 6 }, (_, i) => ({
        x: i / 5,
        label: monthLabel(isoOffset(today, -30 * (5 - i))),
      }));
    case 'Y':
      // 6 labels for Y (not 12) to keep the phone-width axis legible.
      return Array.from({ length: 6 }, (_, i) => ({
        x: i / 5,
        label: monthLabel(isoOffset(today, -60 * (5 - i))),
      }));
  }
}

function weekdayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d);
}

function shortDateLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(d);
}

function monthLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d);
}

function timeLabelFor(r: WeightReading, tz: string): string {
  const d = new Date(r.recorded_at);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
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

// Step the chart's visible-window end date by one window-width. Returns
// a YYYY-MM-DD string in the same calendar the input was in. Forward
// steps cap at `today` so the user can't scrub into the future.
function stepEndDate(
  period: WindowPeriod,
  endDate: string,
  dir: -1 | 1,
  today: string,
): string {
  if (period === 'Y') return today;
  const d = new Date(`${endDate}T00:00:00Z`);
  switch (period) {
    case 'D':
      d.setUTCDate(d.getUTCDate() + dir);
      break;
    case 'W':
      d.setUTCDate(d.getUTCDate() + dir * 7);
      break;
    case 'M':
      d.setUTCDate(d.getUTCDate() + dir * 30);
      break;
    case '6M':
      // 6 calendar months — matches lowerLogDateFor's month math so the
      // new window's start lines up with the previous window's end.
      d.setUTCMonth(d.getUTCMonth() + dir * 6);
      break;
  }
  const next = d.toISOString().slice(0, 10);
  if (dir === 1 && next > today) return today;
  return next;
}

function rangeLabel(
  period: WindowPeriod,
  endDate: string,
  today: string,
  tz: string,
): string {
  if (period === 'D') {
    if (endDate === today) return 'Today';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(new Date(`${endDate}T12:00:00Z`));
  }
  const start = lowerLogDateFor(period, endDate);
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'short',
      day: 'numeric',
      year:
        iso.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
    }).format(new Date(`${iso}T12:00:00Z`));
  return `${fmt(start)} – ${fmt(endDate)}`;
}

function subjectFor(
  name: string,
  todays: WeightReading[],
  tz: string,
): string {
  // Only called when todays.length > 0; render a positive read.
  const latest = todays[todays.length - 1];
  const t = timeLabelFor(latest, tz);
  return `${name} · ${todays.length} weigh-in${todays.length === 1 ? '' : 's'} today · latest ${t}`;
}

function labelFor(p: WindowPeriod): string {
  return p === 'D'
    ? 'today'
    : p === 'W'
      ? 'the past week'
      : p === 'M'
        ? 'the past month'
        : p === '6M'
          ? 'the past 6 months'
          : 'the past year';
}
