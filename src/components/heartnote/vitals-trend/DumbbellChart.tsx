// Dumbbell chart for /trends/bp. One vertical sage stick per reading
// from the sys dot (top) down to the dia dot (bottom). The most recent
// pair gets a halo + thicker stick. Inline legend in the top-left.
//
// Axis frame (gridlines + clipPath + tick labels) is copied from
// TraceChart — rule-of-three doesn't justify a shared frame helper yet
// (only two chart files share it; lollipop is the third but its
// baseline-line variant makes the frame logic diverge anyway). Revisit
// if a fourth chart shape arrives.

import type { BpPair } from '@/lib/trends/bp-pair';

type AxisLabel = { x: number; label: string };

interface Props {
  pairs: BpPair[]; // all pairs (sorted asc by recorded_at)
  startMs: number;
  endMs: number;
  xAxisLabels: AxisLabel[];
  yMin: number;
  yMax: number;
  yTicks: number[];
  height?: number;
  alertFloor?: { y: number; color: string };
  // Selected pair's sourceLogId — when set, that pair gets the
  // accented (full sage stick + halo) treatment that defaults to the
  // most-recent pair.
  selectedId?: string | null;
  ariaLabel?: string;
}

const W = 280;
const PAD_L = 6;
const PAD_R = 32;
const PAD_T = 12;
const PAD_B = 16;

const SYS_COLOR = '#5A6B5C'; // sage-deep
const DIA_COLOR = '#B8C4B0'; // sage-mist tinted

export function DumbbellChart({
  pairs,
  startMs,
  endMs,
  xAxisLabels,
  yMin,
  yMax,
  yTicks,
  height = 132,
  alertFloor,
  selectedId,
  ariaLabel = 'Blood pressure trend chart',
}: Props) {
  const innerW = W - PAD_L - PAD_R;
  const innerH = height - PAD_T - PAD_B;
  const span = Math.max(1, endMs - startMs);
  const clipId = `bp-clip-${startMs}`;

  const xOf = (ms: number) => PAD_L + ((ms - startMs) / span) * innerW;
  const yOf = (v: number) =>
    PAD_T + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const visible = pairs.filter((p) => {
    const t = Date.parse(p.recorded_at);
    return t >= startMs && t <= endMs;
  });

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

      <g clipPath={`url(#${clipId})`}>
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
        {visible.map((p, i) => {
          const isLast = i === visible.length - 1;
          // Selected pair takes the same accent (full sage stick +
          // halo) as the most-recent default.
          const isAccent = selectedId
            ? selectedId === p.sourceLogId
            : isLast;
          const x = xOf(Date.parse(p.recorded_at));
          const ySys = yOf(p.sys);
          const yDia = yOf(p.dia);
          return (
            <g key={p.sourceLogId}>
              {isAccent && (
                <>
                  <circle
                    cx={x}
                    cy={ySys}
                    r={6}
                    fill="rgba(126,144,128,0.30)"
                  />
                  <circle
                    cx={x}
                    cy={yDia}
                    r={6}
                    fill="rgba(126,144,128,0.30)"
                  />
                </>
              )}
              <line
                x1={x}
                x2={x}
                y1={ySys}
                y2={yDia}
                stroke="#7E9080"
                strokeWidth={isAccent ? 2.4 : 1.8}
                opacity={isAccent ? 1 : 0.5}
                strokeLinecap="round"
              />
              <circle
                cx={x}
                cy={ySys}
                r={isAccent ? 3.6 : 2.6}
                fill={SYS_COLOR}
                stroke="#FBF7F0"
                strokeWidth={1}
              />
              <circle
                cx={x}
                cy={yDia}
                r={isAccent ? 3.6 : 2.6}
                fill={DIA_COLOR}
                stroke="#FBF7F0"
                strokeWidth={1}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// Inline legend rendered as an HTML row by BpTrendView above the chart
// — kept out of the SVG so it can't overlap with data points near the
// top of the chart frame.
export const DUMBBELL_LEGEND = {
  sysColor: SYS_COLOR,
  diaColor: DIA_COLOR,
};
