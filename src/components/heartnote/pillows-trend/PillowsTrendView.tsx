'use client';

// Client view for /trends/pillows. Same chassis as Spo2/Hr/Weight with
// pillow-specific divergences:
//
//   1. Chart: LollipopChart with a faint baseline at the patient's
//      normal_pillow_count. No alert floor — orthopnea is a trend-up
//      signal, not a 911-level threshold.
//   2. Hero: "{value} pillows now" (integer + "pillows now" suffix
//      per mockup).
//   3. Y-axis: fixed [0, 3] per mockup. No nice-step.
//   4. Stat trio: 12-mo avg / Months at 2+ / Nights logged — computed
//      over the trailing 12 months REGARDLESS of chart period. Labels
//      are absolute ("12-mo avg"); making the math period-aware would
//      mean the label lies on D/W/M.
//   5. Add sheet: AddReadingSheet with `dateOnly: true` (no time
//      input — pillows is per-night).
//   6. Delete sheet uses `actionVerb: 'Clear'` because the underlying
//      mutation is an UPDATE setting pillow_count = NULL on the
//      daily_logs row — the row survives, the column is cleared.
//   7. Default period: Y per mockup.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Plus } from 'lucide-react';
import { LollipopChart } from '@/components/heartnote/vitals-trend/LollipopChart';
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
import {
  backwardBoundForPeriod,
  defaultEndForPeriod,
  forwardBoundForPeriod,
  subheadFor,
  windowSpanMs,
  xLabelsFor,
} from '@/lib/trends/window-math';
import { READING_RANGE } from '@/lib/clinical/reading-ranges';
import {
  addPillowReading,
  clearPillowReadings,
  clearAllPillowReadings,
} from '@/app/trends/pillows/actions';

// Fixed Y per mockup. The baseline line lives between 0 and 3 with
// ticks at every integer.
const PILLOWS_Y_MIN = 0;
const PILLOWS_Y_MAX = 3;
const PILLOWS_Y_TICKS = [0, 1, 2, 3];

const DAY_MS = 24 * 60 * 60 * 1000;

interface Props {
  patientFirstName: string;
  timezone: string;
  today: string;
  baselinePillowCount: number | null;
  allReadings: VitalReading[];
}

const PERIODS: WindowPeriod[] = ['D', 'W', 'M', '6M', 'Y'];

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function PillowsTrendView({
  patientFirstName,
  timezone,
  today,
  baselinePillowCount,
  allReadings,
}: Props) {
  const router = useRouter();

  // Eyebrow contract: baseline if known, otherwise the last reading.
  const eyebrowText = useMemo(() => {
    if (baselinePillowCount !== null) {
      return `baseline ${baselinePillowCount} pillow${baselinePillowCount === 1 ? '' : 's'}`;
    }
    const last = allReadings[allReadings.length - 1];
    return last ? `last ${Math.round(last.value)}` : null;
  }, [baselinePillowCount, allReadings]);

  const PILLOWS_CONFIG: VitalReadingConfig = useMemo(
    () => ({
      field: 'pillow_count',
      fieldLabel: 'Pillows',
      unit: 'pillows',
      range: READING_RANGE.pillow_count,
      step: 1,
      integer: true,
      splitDecimal: false,
      pressAndHold: false,
      formatValue: (v) => String(Math.round(v)),
      sheetTitle: 'Add pillows tonight',
      listTitle: 'All pillow counts',
      dateOnly: true,
      actionVerb: 'Clear',
      eyebrowLine: () => eyebrowText,
      deleteNoun: {
        singular: 'pillow count',
        plural: 'pillow counts',
      },
    }),
    [eyebrowText],
  );

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

  const [period, setPeriodRaw] = useState<WindowPeriod>('Y');

  const forwardBound = useMemo(
    () => forwardBoundForPeriod(period, today, timezone),
    [period, today, timezone],
  );
  const backwardBound = useMemo(
    () => backwardBoundForPeriod(period, oldestMs, today, timezone),
    [period, oldestMs, today, timezone],
  );

  const [endMs, setEndMs] = useState(() =>
    defaultEndForPeriod('Y', latestMs, today, timezone),
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

  const xLabels = useMemo(
    () => xLabelsFor(period, endMs, timezone),
    [period, endMs, timezone],
  );

  const subhead = useMemo(
    () => subheadFor(period, startMs, endMs, timezone, today),
    [period, startMs, endMs, timezone, today],
  );

  const hasAnyReadings = allReadings.length > 0;

  // Trailing-12-months stats — computed off allReadings, not slice.
  // Labels are absolute ("12-mo avg"); period-aware math would make
  // the label lie on D/W/M.
  const trailingStats = useMemo(
    () => computeTrailingStats(allReadings, today, timezone),
    [allReadings, today, timezone],
  );

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
      // ignore
    }
  };

  const onChartPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const { startX, startEnd, w } = dragRef.current;
    const dx = e.clientX - startX;
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

  const onChartPointerEnd = () => {
    dragRef.current = null;
  };

  useEffect(() => () => {
    dragRef.current = null;
  }, []);

  // Adapter: the shared AddReadingSheet onSave passes
  // { value, recordedAtIsoLocal }. Pillows' action wants
  // { pillowCount, logDate } — slice the YYYY-MM-DD off the front.
  const onSave = async (input: AddReadingInput) => {
    const logDate = input.recordedAtIsoLocal.slice(0, 10);
    const result = await addPillowReading({
      pillowCount: Math.round(input.value),
      logDate,
    });
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
          Pillows tonight
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
              color: hero ? 'var(--foreground)' : 'var(--muted-foreground)',
            }}
          >
            {hero ? Math.round(hero.value) : '—'}
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
            pillows now
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
              Pillows per night
            </span>
            <span
              className="text-[10px] text-muted-foreground uppercase"
              style={{ letterSpacing: '0.5px', fontWeight: 500 }}
            >
              count
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
            <LollipopChart
              data={allReadings}
              baseline={baselinePillowCount}
              startMs={startMs}
              endMs={endMs}
              xAxisLabels={xLabels}
              yMin={PILLOWS_Y_MIN}
              yMax={PILLOWS_Y_MAX}
              yTicks={PILLOWS_Y_TICKS}
              ariaLabel="Pillows trend chart"
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

        {trailingStats && (
          <div
            className="mt-4 grid grid-cols-3 rounded-2xl"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
            }}
          >
            {[
              {
                label: '12-mo avg',
                value: trailingStats.avg.toFixed(1),
                unit: '',
                sub: 'per night',
              },
              {
                label: 'Months at 2+',
                value: String(trailingStats.monthsAt2Plus),
                unit: '/12',
                sub: 'months above baseline',
              },
              {
                label: 'Nights logged',
                value: String(trailingStats.nightsLogged),
                unit: '',
                sub: 'aggregated',
              },
            ].map((s, i) => (
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
          aria-label="Add pillows tonight"
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
          config={PILLOWS_CONFIG}
          onClose={() => setSheetOpen(false)}
          seedValue={latestEver?.value ?? null}
          baselineValue={baselinePillowCount}
          timezone={timezone}
          onSave={onSave}
        />
      )}

      {viewDataOpen && (
        <ViewDataSheet
          config={PILLOWS_CONFIG}
          readings={allReadings}
          patientFirstName={patientFirstName}
          timezone={timezone}
          today={today}
          onClose={() => setViewDataOpen(false)}
          deleteByIds={clearPillowReadings}
          deleteAll={clearAllPillowReadings}
        />
      )}
    </>
  );
}

// ─── Trailing-12-month stats ────────────────────────────────────────────────

function computeTrailingStats(
  allReadings: VitalReading[],
  today: string,
  tz: string,
): {
  avg: number;
  monthsAt2Plus: number;
  nightsLogged: number;
} | null {
  if (allReadings.length === 0) return null;
  const todayMs = Date.parse(`${today}T23:59:59`);
  const yearAgoMs = todayMs - 365 * DAY_MS;
  const trailing = allReadings.filter(
    (r) => Date.parse(r.recorded_at) >= yearAgoMs,
  );
  if (trailing.length === 0) return null;

  const avg =
    trailing.reduce((sum, r) => sum + r.value, 0) / trailing.length;

  // Months-at-2+: group by YYYY-MM (patient tz) and count months whose
  // monthly average >= 2.
  const monthlyTotals = new Map<string, { sum: number; n: number }>();
  for (const r of trailing) {
    const ymKey = ymOf(r.recorded_at, tz);
    const entry = monthlyTotals.get(ymKey) ?? { sum: 0, n: 0 };
    entry.sum += r.value;
    entry.n += 1;
    monthlyTotals.set(ymKey, entry);
  }
  let monthsAt2Plus = 0;
  for (const { sum, n } of monthlyTotals.values()) {
    if (sum / n >= 2) monthsAt2Plus += 1;
  }

  // Nights logged: count of distinct log_date values.
  const distinctDates = new Set(trailing.map((r) => r.log_date));
  const nightsLogged = distinctDates.size;

  return { avg, monthsAt2Plus, nightsLogged };
}

function ymOf(iso: string, tz: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  return `${y}-${m}`;
}
