// EKG-style trace chart for the /trends/weight page. Hard-angled
// polyline (no Bezier smoothing), thin sage stroke, faint horizontal
// gridlines, dots on every reading inside the visible window.
//
// The polyline includes ONE reading immediately before startMs and ONE
// reading immediately after endMs so the line correctly crosses the
// window boundary at the interpolated y. This is the "continuity"
// behavior Apple Health uses — a reading on May 9 visually connects to
// one on May 10 in the D window for May 10 because the May 9 segment
// gets clipped at midnight (right at the y the line passes through).
//
// The connecting segments outside the chart's data area are clipped by
// a <clipPath> so the line never bleeds onto the y-axis labels or
// outside the chart frame.

import type { WeightReading } from '@/lib/trends/weight-window';

type AxisLabel = { x: number; label: string };

interface Props {
  // ALL readings (sorted ascending by recorded_at). EkgChart picks
  // visible ones for dots and adjacent ones for polyline continuity.
  data: WeightReading[];
  startMs: number;
  endMs: number;
  xAxisLabels: AxisLabel[];
  yMin: number;
  yMax: number;
  yTicks: number[];
  height?: number;
  // When false, render dots only (no connecting line). W mode uses
  // false because intra-week weigh-ins aren't a continuous trend.
  showLine?: boolean;
}

const W = 280;
const PAD_L = 6;
const PAD_R = 32;
const PAD_T = 12;
const PAD_B = 16;

export function EkgChart({
  data,
  startMs,
  endMs,
  xAxisLabels,
  yMin,
  yMax,
  yTicks,
  height = 132,
  showLine = true,
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

  const path = polyIndices.length >= 2
    ? polylinePath(polyIndices.map((i) => xOf(Date.parse(data[i].recorded_at))),
                   polyIndices.map((i) => yOf(data[i].value)))
    : '';

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      aria-label="Weight trend chart"
      style={{ pointerEvents: 'none' }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={PAD_L} y={PAD_T} width={innerW} height={innerH} />
        </clipPath>
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

      {/* Polyline + dots both clipped to the chart frame so the
          adjacent-reading segments don't paint over the y-axis labels
          or outside the chart. */}
      <g clipPath={`url(#${clipId})`}>
        {showLine && path && (
          <path
            d={path}
            fill="none"
            stroke="#5A6B5C"
            strokeWidth="1.0"
            strokeLinecap="butt"
            strokeLinejoin="miter"
          />
        )}
        {visible.map((r) => (
          <circle
            key={r.id}
            cx={xOf(Date.parse(r.recorded_at))}
            cy={yOf(r.value)}
            r="2.5"
            fill="#5A6B5C"
          />
        ))}
      </g>
    </svg>
  );
}

function polylinePath(xs: number[], ys: number[]): string {
  if (xs.length === 0) return '';
  let d = `M ${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 1; i < xs.length; i++) {
    d += ` L ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`;
  }
  return d;
}
