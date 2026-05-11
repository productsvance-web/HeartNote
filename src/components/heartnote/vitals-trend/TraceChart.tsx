// Trace chart for /trends/<vital> pages. Hard-angled polyline (no
// Bezier), thin sage stroke, faint horizontal gridlines, dots on every
// reading inside the visible window.
//
// The polyline includes ONE reading immediately before startMs and ONE
// reading immediately after endMs so the line correctly crosses the
// window boundary at the interpolated y. Apple Health's "continuity"
// behavior: a reading on May 9 visually connects to one on May 10 in
// the D window for May 10 because the segment crosses midnight at the
// y the line passes through.
//
// Optional alertFloor prop draws a dashed horizontal line at a clinical
// threshold (e.g. SpO2's 88% 911 floor). The line lives inside the same
// clipPath as the polyline so it never bleeds past chart edges.

import type { VitalReading } from '@/lib/trends/vital-reading';

type AxisLabel = { x: number; label: string };

interface Props {
  // ALL readings (sorted ascending by recorded_at). TraceChart picks
  // visible ones for dots and adjacent ones for polyline continuity.
  data: VitalReading[];
  startMs: number;
  endMs: number;
  xAxisLabels: AxisLabel[];
  yMin: number;
  yMax: number;
  yTicks: number[];
  height?: number;
  // When false, render dots only (no connecting line). W mode for both
  // weight and spo2 uses false — intra-week readings aren't a continuous
  // trend.
  showLine?: boolean;
  // Optional clinical floor line (SpO2 88% 911 floor). Drawn dashed,
  // inside the clipPath, beneath the polyline.
  alertFloor?: { y: number; color: string };
  // Optional area-fill mode (SpO2). When set, the chart renders the area
  // UNDER the trace line filled with a vertical gradient that hard-
  // transitions at thresholdY — sage above, coral below. The trace line
  // is still drawn on top as a thin stroke. Dots are colored per-point
  // (above thresholdY = above-color, below = below-color).
  areaFill?: {
    thresholdY: number;
    aboveColor: string;
    belowColor: string;
    aboveOpacity?: number;
    belowOpacity?: number;
  };
  // Optional range-bar mode (Heart rate). When provided, the chart
  // renders one vertical sage bar per entry from min to max with a
  // cream-stroked dot at the mean. The line + dots branch is
  // suppressed — bars + mean dots ARE the data marks.
  rangeBars?: {
    dayKey: string;
    min: number;
    mean: number;
    max: number;
    recordedAtMs: number;
  }[];
  // ID of the currently-tapped reading. When set, that reading's dot
  // gets the halo + larger radius treatment so the caregiver can see
  // which reading the hero is referencing. Pass the dayKey for
  // range-bar mode.
  selectedId?: string | null;
  ariaLabel?: string;
}

const W = 280;
const PAD_L = 6;
const PAD_R = 32;
const PAD_T = 12;
const PAD_B = 16;

export function TraceChart({
  data,
  startMs,
  endMs,
  xAxisLabels,
  yMin,
  yMax,
  yTicks,
  height = 132,
  showLine = true,
  alertFloor,
  areaFill,
  rangeBars,
  selectedId,
  ariaLabel = 'Vital trend chart',
}: Props) {
  const innerW = W - PAD_L - PAD_R;
  const innerH = height - PAD_T - PAD_B;
  const span = Math.max(1, endMs - startMs);
  const clipId = `chart-clip-${startMs}`;

  const xOf = (ms: number) => PAD_L + ((ms - startMs) / span) * innerW;
  const yOf = (v: number) =>
    PAD_T + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  // Visible readings (the ones that get a dot).
  const visible = data.filter((r) => {
    const t = Date.parse(r.recorded_at);
    return t >= startMs && t <= endMs;
  });

  // For the polyline, include the reading immediately before startMs
  // and the one immediately after endMs so the trace correctly enters
  // and exits the chart frame through the window edges.
  const polyIndices: number[] = [];
  let firstIn = -1;
  let lastIn = -1;
  for (let i = 0; i < data.length; i++) {
    const t = Date.parse(data[i].recorded_at);
    if (t >= startMs && t <= endMs) {
      if (firstIn === -1) firstIn = i;
      lastIn = i;
    }
  }
  if (firstIn !== -1) {
    if (firstIn > 0) polyIndices.push(firstIn - 1);
    for (let i = firstIn; i <= lastIn; i++) polyIndices.push(i);
    if (lastIn < data.length - 1) polyIndices.push(lastIn + 1);
  } else {
    // No readings visible. Bridge across the empty window if there's a
    // reading before AND after — same Apple behavior on truly-quiet days.
    let before = -1;
    let after = -1;
    for (let i = 0; i < data.length; i++) {
      const t = Date.parse(data[i].recorded_at);
      if (t < startMs) before = i;
      if (t > endMs && after === -1) after = i;
    }
    if (before !== -1 && after !== -1) {
      polyIndices.push(before, after);
    }
  }

  // For the polyline (weight) we use polyIndices, which includes one
  // reading immediately before startMs and one after endMs so the line
  // crosses the window boundary at the interpolated y (Apple Health
  // continuity).
  //
  // For the smoothed area chart (spo2), adjacent off-screen readings
  // warp the Bezier control points and create overshoot loops at the
  // visible edges. So we build the smoothed path from ONLY the visible
  // readings — the area fill closes via the bottom corners and still
  // looks continuous across windows.
  const xs = polyIndices.map((i) => xOf(Date.parse(data[i].recorded_at)));
  const ys = polyIndices.map((i) => yOf(data[i].value));
  const visibleXs = visible.map((r) =>
    xOf(Date.parse(r.recorded_at)),
  );
  const visibleYs = visible.map((r) => yOf(r.value));

  const path = areaFill
    ? visibleXs.length >= 2
      ? smoothPath(visibleXs, visibleYs)
      : ''
    : xs.length >= 2
      ? polylinePath(xs, ys)
      : '';

  // Area path = visible-only trace ending closed to chart bottom-right,
  // then bottom-left, back to start. Single-visible-reading windows
  // produce no area (no segment to close). Rendered behind the polyline.
  const bottomY = height - PAD_B;
  const areaPath =
    areaFill && visibleXs.length >= 2
      ? `${path} L ${visibleXs[visibleXs.length - 1].toFixed(1)} ${bottomY} L ${visibleXs[0].toFixed(1)} ${bottomY} Z`
      : '';

  // Gradient stops position (fraction of inner chart height).
  const gradId = `area-grad-${startMs}`;
  const thresholdOffset = areaFill
    ? clamp((yOf(areaFill.thresholdY) - PAD_T) / innerH, 0, 1)
    : 0;
  const aboveOpacity = areaFill?.aboveOpacity ?? 0.32;
  const belowOpacity = areaFill?.belowOpacity ?? 0.38;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      aria-label={ariaLabel}
      style={{ pointerEvents: 'none' }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={PAD_L} y={PAD_T} width={innerW} height={innerH} />
        </clipPath>
        {areaFill && (
          <linearGradient
            id={gradId}
            x1={0}
            y1={PAD_T}
            x2={0}
            y2={height - PAD_B}
            gradientUnits="userSpaceOnUse"
          >
            <stop
              offset={0}
              stopColor={areaFill.aboveColor}
              stopOpacity={aboveOpacity}
            />
            <stop
              offset={thresholdOffset}
              stopColor={areaFill.aboveColor}
              stopOpacity={aboveOpacity}
            />
            <stop
              offset={thresholdOffset}
              stopColor={areaFill.belowColor}
              stopOpacity={belowOpacity}
            />
            <stop
              offset={1}
              stopColor={areaFill.belowColor}
              stopOpacity={belowOpacity}
            />
          </linearGradient>
        )}
      </defs>

      {yTicks.map((tick) => {
        const y = yOf(tick);
        return (
          <g key={tick}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y}
              y2={y}
              stroke="#A89A8B"
              strokeWidth="0.5"
              strokeDasharray="2 3"
              opacity="0.32"
            />
            <text
              x={W - 4}
              y={y + 3.6}
              textAnchor="end"
              fontFamily="Inter, sans-serif"
              fontSize="10"
              fontWeight="500"
              fill="#6B5E52"
              style={{ letterSpacing: '0.1px' }}
            >
              {tick}
            </text>
          </g>
        );
      })}

      {xAxisLabels.map((lbl, i) => {
        const x = PAD_L + lbl.x * innerW;
        return (
          <line
            key={i}
            x1={x}
            x2={x}
            y1={PAD_T}
            y2={height - PAD_B}
            stroke="#A89A8B"
            strokeWidth="0.5"
            strokeDasharray="2 3"
            opacity={xAxisLabels.length > 8 ? 0.18 : 0.26}
          />
        );
      })}

      {/* Area + polyline + dots + alertFloor all clipped to the chart
          frame so adjacent-reading segments don't paint over the y-axis
          labels or outside the chart. Render order: area fill (bottom),
          dashed floor, polyline, dots (top). */}
      <g clipPath={`url(#${clipId})`}>
        {areaFill && areaPath && (
          <path
            d={areaPath}
            fill={`url(#${gradId})`}
            stroke="none"
          />
        )}
        {alertFloor && yOf(alertFloor.y) >= PAD_T && yOf(alertFloor.y) <= height - PAD_B && (
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={yOf(alertFloor.y)}
            y2={yOf(alertFloor.y)}
            stroke={alertFloor.color}
            strokeWidth="1"
            strokeDasharray="4 3"
            opacity="0.85"
          />
        )}
        {showLine && !rangeBars && path && (
          <path
            d={path}
            fill="none"
            stroke="#5A6B5C"
            strokeWidth="1.0"
            strokeLinecap="butt"
            strokeLinejoin="miter"
          />
        )}
        {rangeBars?.map((r, i) => {
          const x = xOf(r.recordedAtMs);
          const yMax = yOf(r.max);
          const yMin = yOf(r.min);
          const yMean = yOf(r.mean);
          const isLast = i === rangeBars.length - 1;
          // Selected bar takes the same accented treatment as "last."
          const isAccent = selectedId
            ? selectedId === r.dayKey
            : isLast;
          return (
            <g key={r.dayKey}>
              <rect
                x={x - 1.6}
                y={yMax}
                width={3.2}
                height={Math.max(yMin - yMax, 1)}
                rx={1.6}
                fill={isAccent ? '#5A6B5C' : '#7E9080'}
                opacity={isAccent ? 1 : 0.65}
              />
              {isAccent && (
                <circle
                  cx={x}
                  cy={yMean}
                  r={6}
                  fill="rgba(126,144,128,0.30)"
                />
              )}
              <circle
                cx={x}
                cy={yMean}
                r={isAccent ? 3.4 : 2.2}
                fill="#FBF7F0"
                stroke={isAccent ? '#5A6B5C' : '#7E9080'}
                strokeWidth={1.5}
              />
            </g>
          );
        })}
        {!rangeBars && visible.map((r) => {
          // In areaFill mode, color each dot by whether the reading is
          // above or below the clinical threshold. Otherwise default to
          // sage-deep (the weight register).
          const fill = areaFill
            ? r.value >= areaFill.thresholdY
              ? areaFill.aboveColor
              : areaFill.belowColor
            : '#5A6B5C';
          const isSelected = selectedId === r.id;
          // areaFill adds a cream stroke around each dot so it visually
          // separates from the colored fill below (Apple Health pattern).
          // Weight (no areaFill) renders bare dots — its register has
          // no fill to separate from. Selected dot gets a halo + larger
          // radius (same accent the rangeBars + dumbbell use).
          return (
            <g key={r.id}>
              {isSelected && (
                <circle
                  cx={xOf(Date.parse(r.recorded_at))}
                  cy={yOf(r.value)}
                  r={7}
                  fill="rgba(126,144,128,0.30)"
                />
              )}
              <circle
                cx={xOf(Date.parse(r.recorded_at))}
                cy={yOf(r.value)}
                r={isSelected ? 4 : areaFill ? 3.5 : 2.5}
                fill={fill}
                stroke={
                  isSelected ? '#FBF7F0' : areaFill ? '#FBF7F0' : undefined
                }
                strokeWidth={isSelected ? 1.5 : areaFill ? 2 : undefined}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function polylinePath(xs: number[], ys: number[]): string {
  if (xs.length === 0) return '';
  let d = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 1; i < xs.length; i++) {
    d += ` L ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`;
  }
  return d;
}

// Catmull-Rom-style smoothing converted to cubic Bezier segments. Each
// segment between Pi and Pi+1 uses control points derived from the
// neighbors Pi-1 and Pi+2 (or the segment endpoints themselves at the
// boundaries). Tension 0.5 = a moderately smooth curve that still
// passes through every data point — no overshoot.
function smoothPath(xs: number[], ys: number[]): string {
  const n = xs.length;
  if (n === 0) return '';
  if (n === 1) return `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  let d = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0x = i === 0 ? xs[0] : xs[i - 1];
    const p0y = i === 0 ? ys[0] : ys[i - 1];
    const p1x = xs[i];
    const p1y = ys[i];
    const p2x = xs[i + 1];
    const p2y = ys[i + 1];
    const p3x = i + 2 < n ? xs[i + 2] : xs[n - 1];
    const p3y = i + 2 < n ? ys[i + 2] : ys[n - 1];

    const cp1x = p1x + (p2x - p0x) / 6;
    const cp1y = p1y + (p2y - p0y) / 6;
    const cp2x = p2x - (p3x - p1x) / 6;
    const cp2y = p2y - (p3y - p1y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2x.toFixed(1)} ${p2y.toFixed(1)}`;
  }
  return d;
}
