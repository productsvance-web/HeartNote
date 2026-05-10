// EKG-style trace chart for the /trends/weight page. Hard-angled
// polyline (no Bezier smoothing), thin sage stroke, faint horizontal
// gridlines, single dot on the latest reading. The chart is purely
// presentational — it receives a fully-resolved [startMs, endMs] window
// and plots whatever readings the parent passed in.

import type { WeightReading } from '@/lib/trends/weight-window';

type AxisLabel = { x: number; label: string };

interface Props {
  data: WeightReading[];
  // Visible window in milliseconds since epoch. Readings outside this
  // range are clamped to the chart edges by their fraction.
  startMs: number;
  endMs: number;
  xAxisLabels: AxisLabel[];
  yMin: number;
  yMax: number;
  yTicks: number[];
  height?: number;
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
}: Props) {
  const innerW = W - PAD_L - PAD_R;
  const innerH = height - PAD_T - PAD_B;
  const span = Math.max(1, endMs - startMs);

  const visible = data.filter((r) => {
    const t = Date.parse(r.recorded_at);
    return t >= startMs && t <= endMs;
  });

  const xs = visible.map((r) => {
    const t = Date.parse(r.recorded_at);
    return PAD_L + ((t - startMs) / span) * innerW;
  });
  const ys = visible.map(
    (r) => PAD_T + (1 - (r.value - yMin) / (yMax - yMin)) * innerH,
  );

  const path = polylinePath(xs, ys);
  const lastX = xs[xs.length - 1];
  const lastY = ys[ys.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      aria-label="Weight trend chart"
      style={{ pointerEvents: 'none' }}
    >
      {yTicks.map((tick) => {
        const y = PAD_T + (1 - (tick - yMin) / (yMax - yMin)) * innerH;
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

      {xAxisLabels.slice(1, -1).map((lbl, i) => {
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

      {visible.length >= 2 && (
        <path
          d={path}
          fill="none"
          stroke="#5A6B5C"
          strokeWidth="1.0"
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
      )}

      {visible.length > 0 && (
        <circle cx={lastX} cy={lastY} r="2.5" fill="#5A6B5C" />
      )}
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
