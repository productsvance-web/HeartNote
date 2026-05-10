'use client';

// Client view for /trends/weight. Owns the D/W/M/6M/Y filter state.
// Renders the back chevron + title, subject line, hero numeric, chart
// section, lead stat, stats trio, source footer, and the floating "+"
// utility button that opens AddWeightSheet. All windowing math lives in
// src/lib/trends/weight-window.ts so the view stays presentational.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Plus } from 'lucide-react';
import { EkgChart } from './EkgChart';
import { AddWeightSheet, type AddWeightInput } from './AddWeightSheet';
import {
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
  const [period, setPeriod] = useState<WindowPeriod>('D');
  const [sheetOpen, setSheetOpen] = useState(false);

  const slice = useMemo(
    () => windowSliceFor(period, today, allReadings),
    [period, today, allReadings],
  );

  const latestEver =
    allReadings.length > 0 ? allReadings[allReadings.length - 1] : null;

  // Hero strictly reflects the selected window. If the user picked D
  // and nothing was logged today, the hero is "—" — anything else
  // (e.g., showing the most-recent-ever value with a "0 readings today"
  // subhead) reads contradictory.
  const hero = slice.length > 0 ? slice[slice.length - 1] : null;

  const intraDay = intraDayRangeFor(slice, today, timezone);

  const yScale = useMemo(() => yScaleFor(slice, hero), [slice, hero]);
  const yTicks = useMemo(
    () => tickStepsFor(yScale.min, yScale.max),
    [yScale],
  );
  const xLabels = useMemo(() => xLabelsFor(period, today), [period, today]);

  const todayReadings = slice.filter((r) => r.log_date === today);
  const hasAnyReadings = allReadings.length > 0;
  // Subject line only when there's something to say about today.
  const subjectLine =
    todayReadings.length > 0
      ? subjectFor(patientFirstName, todayReadings, timezone)
      : null;

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

        {/* Hero — only render when the selected window has data. */}
        {hero && (
          <div className="mt-3 flex items-end gap-2.5">
            <span
              className="font-display text-foreground"
              style={{
                fontSize: 78,
                lineHeight: 0.95,
                letterSpacing: '-3px',
                fontWeight: 300,
              }}
            >
              {Math.floor(hero.value)}
              <span style={{ fontSize: 48, letterSpacing: '-2px' }}>
                .{decimalPart(hero.value)}
              </span>
            </span>
            <span
              className="text-muted-foreground pb-3"
              style={{ fontSize: 14, fontWeight: 500, letterSpacing: '0.3px' }}
            >
              lb
            </span>
          </div>
        )}
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
          {/* Aspect-ratio container so the SVG scales uniformly without
              stretching on wide viewports. The chart frame (gridlines +
              axis labels) renders even when the slice is empty — no
              synthetic "tap + below" copy. */}
          <div style={{ width: '100%', aspectRatio: '280 / 132' }}>
            <EkgChart
              data={slice}
              period={period}
              timezone={timezone}
              xAxisLabels={xLabels}
              yMin={yScale.min}
              yMax={yScale.max}
              yTicks={yTicks}
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

      {/* "+" floating utility button (matches the bottom-bar mic/ear pattern
          from heartnote-log-redesign-mockup.html — see canonical-controls.md
          register #6) */}
      <div
        className="fixed left-0 right-0 flex justify-end pointer-events-none"
        style={{ bottom: 22, paddingRight: 28, zIndex: 30 }}
      >
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
    </>
  );
}

function decimalPart(v: number): string {
  return Math.abs(v - Math.floor(v)).toFixed(1).slice(2);
}

// Y-axis always snaps to increments of 10 (lb). Examples:
//   value 209  → min 200, max 220 (range 20)
//   value 215  → min 210, max 230 (range 20)
//   178..209  → min 170, max 210 (range 40)
//   single 178 → min 170, max 190 (range 20)
// Minimum span is 20 lb so the trace doesn't pancake on a single reading.
const Y_AXIS_SNAP_LB = 10;
const Y_AXIS_MIN_SPAN_LB = 20;

function yScaleFor(
  slice: WeightReading[],
  hero: WeightReading | null,
): { min: number; max: number } {
  const values = slice.map((r) => r.value);
  if (hero && !slice.includes(hero)) values.push(hero.value);
  if (values.length === 0) return { min: 150, max: 200 };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const min = Math.floor(lo / Y_AXIS_SNAP_LB) * Y_AXIS_SNAP_LB;
  const ceilMax = Math.ceil(hi / Y_AXIS_SNAP_LB) * Y_AXIS_SNAP_LB;
  const max = Math.max(ceilMax, min + Y_AXIS_MIN_SPAN_LB);
  return { min, max };
}

// Ticks every 10 lb across the snapped y-domain.
function tickStepsFor(min: number, max: number): number[] {
  const ticks: number[] = [];
  for (let v = min; v <= max; v += Y_AXIS_SNAP_LB) ticks.push(v);
  return ticks;
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
