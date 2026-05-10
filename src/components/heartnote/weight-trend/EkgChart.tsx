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
  // Patient timezone — required so D-period x-positioning uses the
  // patient's wall-clock hour, not the caregiver's browser-local hour.
  // Caregiver and patient can be in different tz (caregiver traveling).
  timezone: string;
  xAxisLabels: AxisLabel[];
  yMin: number;
  yMax: number;
  yTicks: number[];
  height?: number;
}

const W = 280;
const PAD_L = 6;
const PAD_R = 32; // wider on the right to give the y-axis labels breathing room
const PAD_T = 12;
const PAD_B = 16;

export function EkgChart({
  data,
  period,
  timezone,
  xAxisLabels,
  yMin,
  yMax,
  yTicks,
  height = 132,
}: Props) {
  const innerW = W - PAD_L - PAD_R;
  const innerH = height - PAD_T - PAD_B;

  const xs = data.map((r) => xPositionFor(r, data, period, innerW, timezone));
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
      height="100%"
      preserveAspectRatio="xMidYMid meet"
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

function xPositionFor(
  r: WeightReading,
  all: WeightReading[],
  period: WindowPeriod,
  innerW: number,
  timezone: string,
): number {
  if (period === 'D') {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(r.recorded_at));
    let h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    if (h === 24) h = 0;
    const mi = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    const hours = h + mi / 60;
    return PAD_L + (hours / 24) * innerW;
  }
  const i = all.indexOf(r);
  return PAD_L + (i / Math.max(1, all.length - 1)) * innerW;
}
