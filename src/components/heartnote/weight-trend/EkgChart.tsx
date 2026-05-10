// EKG-style trace chart for the /trends/weight page. Hard-angled
// polyline (no Bezier smoothing), thin sage stroke, faint horizontal
// gridlines, single dot + halo on the latest reading only — the
// per-point dots from the mockup are intentionally dropped to keep the
// trace reading like a heart-monitor line.

import type { WeightReading, WindowPeriod } from '@/lib/trends/weight-window';

type AxisLabel = { x: number; label: string };

interface Props {
  data: WeightReading[];
  period: WindowPeriod;
  xAxisLabels: AxisLabel[];
  yMin: number;
  yMax: number;
  yTicks: number[];
  height?: number;
}

const W = 280;
const PAD_L = 6;
const PAD_R = 26;
const PAD_T = 12;
const PAD_B = 16;

export function EkgChart({
  data,
  period,
  xAxisLabels,
  yMin,
  yMax,
  yTicks,
  height = 132,
}: Props) {
  const innerW = W - PAD_L - PAD_R;
  const innerH = height - PAD_T - PAD_B;

  const xs = data.map((r) => xPositionFor(r, data, period, innerW));
  const ys = data.map(
    (r) => PAD_T + (1 - (r.value - yMin) / (yMax - yMin)) * innerH,
  );

  const path = polylinePath(xs, ys);
  const lastX = xs[xs.length - 1];
  const lastY = ys[ys.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-label="Weight trend chart"
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
              x={W - 3}
              y={y + 3.2}
              textAnchor="end"
              fontFamily="Inter, sans-serif"
              fontSize="8.5"
              fontWeight="500"
              fill="#A89A8B"
              style={{ letterSpacing: '0.2px' }}
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

      {data.length >= 2 && (
        <path
          d={path}
          fill="none"
          stroke="#5A6B5C"
          strokeWidth="1.0"
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
      )}

      {data.length > 0 && (
        <>
          <circle cx={lastX} cy={lastY} r="7" fill="#7E9080" fillOpacity="0.30" />
          <circle
            cx={lastX}
            cy={lastY}
            r="4"
            fill="#5A6B5C"
            stroke="#FBF7F0"
            strokeWidth="1.5"
          />
        </>
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

function xPositionFor(
  r: WeightReading,
  all: WeightReading[],
  period: WindowPeriod,
  innerW: number,
): number {
  if (period === 'D') {
    const dt = new Date(r.recorded_at);
    const hours = dt.getHours() + dt.getMinutes() / 60;
    return PAD_L + (hours / 24) * innerW;
  }
  const i = all.indexOf(r);
  return PAD_L + (i / Math.max(1, all.length - 1)) * innerW;
}
