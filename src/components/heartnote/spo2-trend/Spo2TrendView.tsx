'use client';

// Client view for /trends/spo2. Same windowing model + drag-to-scrub
// behavior as WeightTrendView (single endMs ms-since-epoch, D scrubs
// continuously, W/M/6M paginate at 25% threshold, Y has no scrub).
//
// Differences from WeightTrendView:
//   - Hero shows integer-only ("96 %"), not the split-decimal weight pattern.
//   - Y-scale clamps to floor=88 / ceiling=100 so the 911 floor is always
//     on screen; single-value half-range is 5 (vs weight's 10).
//   - TraceChart gets an alertFloor at 88 — dashed coral line.
//   - Stat trio is Latest / Lowest / Highest. Lowest is the clinically
//     directional cell for SpO2.

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
  findTappedReading,
  TAP_MOVE_THRESHOLD_PX,
} from '@/lib/trends/tap-hit';
import { READING_RANGE } from '@/lib/clinical/reading-ranges';
import { SPO2_TIER_1_911 } from '@/lib/clinical/thresholds';
import {
  addSpo2Reading,
  deleteSpo2Readings,
  deleteAllSpo2Readings,
} from '@/app/trends/spo2/actions';

interface Props {
  patientFirstName: string;
  timezone: string;
  today: string;
  allReadings: VitalReading[];
}

const PERIODS: WindowPeriod[] = ['D', 'W', 'M', '6M', 'Y'];

// SpO2-specific config consumed by the shared sheets. One-decimal
// precision throughout — matches the voice-log extraction pattern, the
// DB CHECK constraint (which allows decimals), and the weight register
// (also 0.1 precision with press-and-hold).
const SPO2_CONFIG: VitalReadingConfig = {
  field: 'spo2',
  fieldLabel: 'Oxygen',
  unit: '%',
  range: READING_RANGE.spo2,
  step: 0.1,
  integer: false,
  splitDecimal: true,
  pressAndHold: true,
  formatValue: (v) => v.toFixed(1),
  sheetTitle: 'Add oxygen',
  listTitle: 'All oxygen readings',
  // Patients have no "baseline SpO2" column. Eyebrow shows the previous
  // reading only, when there is one.
  eyebrowLine: (_baseline, seed) =>
    seed !== null ? `last ${seed.toFixed(1)} %` : null,
  deleteNoun: {
    singular: 'oxygen reading',
    plural: 'oxygen readings',
  },
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function Spo2TrendView({
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

  const [period, setPeriodRaw] = useState<WindowPeriod>('D');

  const forwardBound = useMemo(
    () => forwardBoundForPeriod(period, today, timezone),
    [period, today, timezone],
  );
  const backwardBound = useMemo(
    () => backwardBoundForPeriod(period, oldestMs, today, timezone),
    [period, oldestMs, today, timezone],
  );

  const [endMs, setEndMs] = useState(() =>
    defaultEndForPeriod('D', today, timezone),
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewDataOpen, setViewDataOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const selected = selectedId
    ? slice.find((r) => r.id === selectedId) ?? null
    : null;
  const hero = selected ?? (slice.length > 0 ? slice[slice.length - 1] : null);

  // Y-axis derived from the whole dataset with floor + ceiling clamps
  // so the 88% line is always on screen and the chart never extends
  // above the physiological ceiling of 100%.
  const yScale = useMemo(
    () =>
      yScaleFor(allReadings, {
        floor: SPO2_TIER_1_911,
        ceiling: 100,
        singleValueHalfRange: 5,
      }),
    [allReadings],
  );
  const xLabels = useMemo(
    () => xLabelsFor(period, endMs, timezone),
    [period, endMs, timezone],
  );

  const subhead = useMemo(() => {
    if (selected) {
      return dayTimeLabel(
        Date.parse(selected.recorded_at),
        timezone,
        today,
      );
    }
    return subheadFor(period, startMs, endMs, timezone, today);
  }, [selected, period, startMs, endMs, timezone, today]);

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
    if (!drag || drag.moved) return;
    const wrap = chartWrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const tapped = findTappedReading(slice, startMs, endMs, xPx, rect.width);
    setSelectedId(tapped ? tapped.id : null);
  };

  useEffect(() => () => {
    dragRef.current = null;
  }, []);

  const onSave = async (input: AddReadingInput) => {
    const result = await addSpo2Reading(input);
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
          Oxygen
        </h1>
      </header>

      <div className="px-5 pb-32">
        {/* Hero. Same split-decimal pattern as weight (large integer +
            smaller decimal). One-decimal precision matches the rest of
            the SpO2 stack. */}
        <div className="mt-3 flex items-end gap-2">
          <span
            className="font-display"
            style={{
              fontSize: 78,
              lineHeight: 0.95,
              letterSpacing: '-3px',
              fontWeight: 300,
              color: hero ? 'var(--foreground)' : 'var(--muted-foreground)',
            }}
          >
            {hero ? Math.floor(hero.value) : '—'}
            {hero && (
              <span style={{ fontSize: 48, letterSpacing: '-2px' }}>
                .{decimalPart(hero.value)}
              </span>
            )}
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
            %
          </span>
        </div>
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
              Oxygen saturation
            </span>
            <span
              className="text-[10px] text-muted-foreground uppercase"
              style={{ letterSpacing: '0.5px', fontWeight: 500 }}
            >
              %
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
              ariaLabel="Oxygen trend chart"
              // W shows dots only — intra-week oxygen readings aren't a
              // continuous trend. D / M / 6M / Y connect the dots.
              showLine={period !== 'W'}
              // Faint coral line at 88 — matches the Phone 4 mockup
              // even though the area-fill's gradient transition also
              // sits there. Keeping both gives the floor a sharper
              // visual edge.
              alertFloor={{
                y: SPO2_TIER_1_911,
                color: 'var(--destructive, #C46A4A)',
              }}
              // Area chart: sage tint above 88, coral tint below.
              // Matches docs/design/heartnote-vitals-trends-mockup.html
              // Phone 4. Dots are coral when sub-88, sage otherwise.
              areaFill={{
                thresholdY: SPO2_TIER_1_911,
                aboveColor: '#5A6B5C',
                belowColor: 'var(--destructive, #C46A4A)',
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

        {/* Stats trio — Latest / Lowest / Highest. Lowest is the
            clinically directional cell for SpO2. Shell stays rendered
            whenever the dataset has data so the layout doesn't jump
            during scrub. */}
        {hasAnyReadings && (
          <div
            className="mt-4 grid grid-cols-3 rounded-2xl"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
            }}
          >
            {(slice.length > 0
              ? tripleStatsSpo2(slice, timezone)
              : tripleStatsSpo2Empty()
            ).map((s, i) => (
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
          aria-label="Add oxygen reading"
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
          config={SPO2_CONFIG}
          onClose={() => setSheetOpen(false)}
          seedValue={latestEver?.value ?? null}
          baselineValue={null}
          timezone={timezone}
          onSave={onSave}
        />
      )}

      {viewDataOpen && (
        <ViewDataSheet
          config={SPO2_CONFIG}
          readings={allReadings}
          patientFirstName={patientFirstName}
          timezone={timezone}
          today={today}
          onClose={() => setViewDataOpen(false)}
          deleteByIds={deleteSpo2Readings}
          deleteAll={deleteAllSpo2Readings}
        />
      )}
    </>
  );
}

// ─── Stats trio (SpO2-specific) ─────────────────────────────────────────────

function timeLabelFor(r: VitalReading, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(r.recorded_at));
}

function tripleStatsSpo2Empty(): {
  label: string;
  value: string;
  unit: string;
  sub: string;
}[] {
  return [
    { label: 'Latest', value: '—', unit: '', sub: '' },
    { label: 'Lowest', value: '—', unit: '', sub: '' },
    { label: 'Highest', value: '—', unit: '', sub: '' },
  ];
}

function tripleStatsSpo2(
  slice: VitalReading[],
  tz: string,
): { label: string; value: string; unit: string; sub: string }[] {
  const latest = slice[slice.length - 1];
  const sortedAsc = [...slice].sort((a, b) => a.value - b.value);
  const lowest = sortedAsc[0];
  const highest = sortedAsc[sortedAsc.length - 1];
  const fmt = (v: number) => v.toFixed(1);
  return [
    {
      label: 'Latest',
      value: fmt(latest.value),
      unit: '%',
      sub: timeLabelFor(latest, tz),
    },
    {
      label: 'Lowest',
      value: fmt(lowest.value),
      unit: '%',
      sub: timeLabelFor(lowest, tz),
    },
    {
      label: 'Highest',
      value: fmt(highest.value),
      unit: '%',
      sub: timeLabelFor(highest, tz),
    },
  ];
}

function decimalPart(v: number): string {
  return Math.abs(v - Math.floor(v)).toFixed(1).slice(2);
}
