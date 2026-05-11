'use client';

// Client view for /trends/bp. Mirrors Spo2/Hr structure with BP-
// specific divergences:
//
//   1. Data shape: BpPair (sys + dia per reading, joined server-side
//      by source_log_id). All visualisation, sliding, and stat math
//      operates on pairs.
//   2. Chart: DumbbellChart, fixed Y [60, 150] with 90 dashed line.
//      The Y is fixed (not nice-step) because BP reads better with
//      clinical-context tick marks.
//   3. Hero: "128 / 76 mmHg" (smaller serif than spo2).
//   4. Add sheet: AddBpSheet (paired stepper). Not VitalReadingConfig-
//      driven.
//   5. View+delete sheet: ViewBpDataSheet (BP-specific, pair-keyed).
//   6. Default period: M per mockup.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Plus } from 'lucide-react';
import {
  DumbbellChart,
  DUMBBELL_LEGEND,
} from '@/components/heartnote/vitals-trend/DumbbellChart';
import { AddBpSheet, type AddBpInput } from '@/components/heartnote/vitals-trend/AddBpSheet';
import { InfoMenu } from '@/components/heartnote/vitals-trend/InfoMenu';
import { ViewBpDataSheet } from './ViewBpDataSheet';
import type { BpPair } from '@/lib/trends/bp-pair';
import type { WindowPeriod } from '@/lib/trends/vital-reading';
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
import { SBP_TIER_2_LOW } from '@/lib/clinical/thresholds';
import {
  addBpReading,
  deleteBpReadings,
  deleteAllBpReadings,
} from '@/app/trends/bp/actions';

// Fixed Y per mockup. Not in thresholds.ts — these are visual choices
// (the 90 dashed line is the clinical line; it imports from
// thresholds.ts as SBP_TIER_2_LOW).
const BP_Y_MIN = 60;
const BP_Y_MAX = 150;
const BP_Y_TICKS = [60, 90, 120, 150];

interface Props {
  patientFirstName: string;
  timezone: string;
  today: string;
  allPairs: BpPair[]; // sorted asc by recorded_at
}

const PERIODS: WindowPeriod[] = ['D', 'W', 'M', '6M', 'Y'];

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function BpTrendView({
  patientFirstName,
  timezone,
  today,
  allPairs,
}: Props) {
  const router = useRouter();

  const oldestMs = useMemo(
    () =>
      allPairs.length > 0 ? Date.parse(allPairs[0].recorded_at) : null,
    [allPairs],
  );

  const [period, setPeriodRaw] = useState<WindowPeriod>('M');

  const forwardBound = useMemo(
    () => forwardBoundForPeriod(period, today, timezone),
    [period, today, timezone],
  );
  const backwardBound = useMemo(
    () => backwardBoundForPeriod(period, oldestMs, today, timezone),
    [period, oldestMs, today, timezone],
  );

  const [endMs, setEndMs] = useState(() =>
    defaultEndForPeriod('M', today, timezone),
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewDataOpen, setViewDataOpen] = useState(false);
  // selectedId is a BpPair's sourceLogId — the canonical pair key.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const setPeriod = (p: WindowPeriod) => {
    setPeriodRaw(p);
    setEndMs(defaultEndForPeriod(p, today, timezone));
    setSelectedId(null);
  };

  const startMs = endMs - windowSpanMs(period);

  const slice = useMemo(() => {
    return allPairs.filter((p) => {
      const t = Date.parse(p.recorded_at);
      return t >= startMs && t <= endMs;
    });
  }, [allPairs, startMs, endMs]);

  const latestEver =
    allPairs.length > 0 ? allPairs[allPairs.length - 1] : null;

  const selected = selectedId
    ? slice.find((p) => p.sourceLogId === selectedId) ?? null
    : null;
  const hero = selected ?? (slice.length > 0 ? slice[slice.length - 1] : null);

  const xLabels = useMemo(
    () => xLabelsFor(period, endMs, timezone),
    [period, endMs, timezone],
  );

  const subhead = useMemo(() => {
    if (isDragging && period === 'D') {
      return dayTimeLabel(endMs, timezone, today);
    }
    if (selected) {
      return dayTimeLabel(
        Date.parse(selected.recorded_at),
        timezone,
        today,
      );
    }
    return subheadFor(period, startMs, endMs, timezone, today);
  }, [isDragging, selected, period, startMs, endMs, timezone, today]);

  const hasAnyPairs = allPairs.length > 0;

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
      // ignore
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
    const tapped = findTappedReading(slice, startMs, endMs, xPx, rect.width);
    setSelectedId(tapped ? tapped.sourceLogId : null);
  };

  useEffect(() => () => {
    dragRef.current = null;
  }, []);

  const onSave = async (input: AddBpInput) => {
    const result = await addBpReading(input);
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
          Blood pressure
        </h1>
      </header>

      <div className="px-5 pb-32">
        {/* Hero — "128 / 76" with sage-mist slash, smaller font per
            mockup .hero-value.bp. */}
        <div className="mt-3 flex items-end gap-2">
          <span
            className="font-display tabular-nums"
            style={{
              fontSize: 58,
              lineHeight: 0.95,
              letterSpacing: '-2px',
              fontWeight: 300,
              color: hero ? 'var(--foreground)' : 'var(--muted-foreground)',
            }}
          >
            {hero ? Math.round(hero.sys) : '—'}
            <span
              style={{
                color: 'var(--muted-foreground)',
                fontWeight: 300,
              }}
            >
              /
            </span>
            {hero ? Math.round(hero.dia) : '—'}
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
            mmHg
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
              Systolic / Diastolic
            </span>
            <span
              className="text-[10px] text-muted-foreground uppercase"
              style={{ letterSpacing: '0.5px', fontWeight: 500 }}
            >
              mmHg
            </span>
          </div>
          {/* sys/dia legend lives here in its own HTML row so it never
              overlaps the chart data (the in-SVG legend in the mockup
              clipped readings near the top edge). */}
          <div className="flex items-center gap-4 mt-2 px-0.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
              <span
                aria-hidden
                className="inline-block rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  background: DUMBBELL_LEGEND.sysColor,
                }}
              />
              <span style={{ color: DUMBBELL_LEGEND.sysColor }}>sys</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
              <span
                aria-hidden
                className="inline-block rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  background: DUMBBELL_LEGEND.diaColor,
                }}
              />
              <span style={{ color: DUMBBELL_LEGEND.diaColor }}>dia</span>
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
            <DumbbellChart
              pairs={allPairs}
              startMs={startMs}
              endMs={endMs}
              xAxisLabels={xLabels}
              yMin={BP_Y_MIN}
              yMax={BP_Y_MAX}
              yTicks={BP_Y_TICKS}
              alertFloor={{
                y: SBP_TIER_2_LOW,
                color: 'var(--destructive, #C46A4A)',
              }}
              selectedId={selectedId}
              ariaLabel="Blood pressure trend chart"
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

        {hasAnyPairs && (
          <div
            className="mt-4 grid grid-cols-3 rounded-2xl"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
            }}
          >
            {tripleStatsBp(slice, today, timezone).map((s, i) => (
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

        {hasAnyPairs && slice.length > 0 && (
          <p
            className="mt-3 text-[11px] italic text-muted-foreground"
            style={{ lineHeight: 1.5 }}
          >
            <b style={{ fontStyle: 'normal', fontWeight: 600 }}>
              {slice.length} reading{slice.length === 1 ? '' : 's'} in this
              window
            </b>{' '}
            · {allPairs.length} total in the last year
          </p>
        )}

        {!hasAnyPairs && (
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
          aria-label="Add blood pressure"
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
        <AddBpSheet
          onClose={() => setSheetOpen(false)}
          seedSys={latestEver?.sys ?? null}
          seedDia={latestEver?.dia ?? null}
          timezone={timezone}
          onSave={onSave}
        />
      )}

      {viewDataOpen && (
        <ViewBpDataSheet
          pairs={allPairs}
          patientFirstName={patientFirstName}
          timezone={timezone}
          today={today}
          onClose={() => setViewDataOpen(false)}
          deleteByPairs={deleteBpReadings}
          deleteAll={deleteAllBpReadings}
        />
      )}
    </>
  );
}

// ─── Stats trio ──────────────────────────────────────────────────────────────

function timeLabelFor(p: BpPair, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(p.recorded_at));
}

function shortDateLabelLocal(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
  }).format(new Date(ms));
}

function tripleStatsBp(
  slice: BpPair[],
  today: string,
  tz: string,
): { label: string; value: string; unit: string; sub: string }[] {
  if (slice.length === 0) {
    return [
      { label: 'Highest sys', value: '—', unit: '', sub: '' },
      { label: 'Lowest sys', value: '—', unit: '', sub: '' },
      { label: 'Readings', value: '—', unit: '', sub: '' },
    ];
  }
  // Tiebreak on equal sys: most-recent wins. slice is asc by
  // recorded_at, so iterating with <= / >= overwrites earlier ties with
  // later ones — the caregiver sees the dia from the more recent pair.
  let lowest = slice[0];
  let highest = slice[0];
  for (const p of slice) {
    if (p.sys <= lowest.sys) lowest = p;
    if (p.sys >= highest.sys) highest = p;
  }
  // BP is integer-only at the action level, but voice-log inserts via
  // the apply_voice_log_extraction RPC carry decimals from the
  // structured-extraction pass. Round at render so the trio cells
  // never show "107.7 / 92.9".
  return [
    {
      label: 'Highest sys',
      value: String(Math.round(highest.sys)),
      unit: ` / ${Math.round(highest.dia)}`,
      sub: subLabel(highest, today, tz),
    },
    {
      label: 'Lowest sys',
      value: String(Math.round(lowest.sys)),
      unit: ` / ${Math.round(lowest.dia)}`,
      sub: subLabel(lowest, today, tz),
    },
    {
      label: 'Readings',
      value: String(slice.length),
      unit: '',
      // Provenance varies (voice-log + manual entry); drop the "cuff,
      // all manual" copy from the mockup since it isn't always true.
      sub: 'in this window',
    },
  ];
}

function subLabel(p: BpPair, today: string, tz: string): string {
  if (p.log_date === today) return timeLabelFor(p, tz);
  return shortDateLabelLocal(Date.parse(p.recorded_at), tz);
}
