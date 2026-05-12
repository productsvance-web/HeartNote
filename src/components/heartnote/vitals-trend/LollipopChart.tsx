// Lollipop chart for /trends/pillows. One thin stick + dot per night,
// with a faint dashed sage baseline line at the patient's
// normal_pillow_count. No alert floor — pillows is a "trend up from
// baseline" signal, not a 911-level threshold.
//
// Above-baseline sticks render in warn-amber; at-or-below render in
// sage; the most recent night is solid warn-ink (darker amber) with
// a halo.

import type { VitalReading } from '@/lib/trends/vital-reading';

type AxisLabel = { x: number; label: string };

interface Props {
  data: VitalReading[]; // sorted asc by recorded_at
  baseline: number | null;
  startMs: number;
  endMs: number;
  xAxisLabels: AxisLabel[];
  yMin: number;
  yMax: number;
  yTicks: number[];
  height?: number;
  // Selected reading's id — takes the same warn-ink + halo accent as
  // the most-recent default lollipop.
  selectedId?: string | null;
  ariaLabel?: string;
}

const W = 280;
const PAD_L = 6;
const PAD_R = 32;
const PAD_T = 12;
const PAD_B = 16;

export function LollipopChart({
  data,
  baseline,
  startMs,
  endMs,
  xAxisLabels,
  yMin,
  yMax,
  yTicks,
  height = 132,
  selectedId,
  ariaLabel = 'Pillows trend chart',
}: Props) {
  const innerW = W - PAD_L - PAD_R;
  const innerH = height - PAD_T - PAD_B;
  const span = Math.max(1, endMs - startMs);
  const yBase = PAD_T + innerH;
  const clipId = `pillows-clip-${startMs}`;

  const xOf = (ms: number) => PAD_L + ((ms - startMs) / span) * innerW;
  const yOf = (v: number) =>
    PAD_T + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  const visible = data.filter((r) => {
    const t = Date.parse(r.recorded_at);
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
        {baseline !== null && (
          <line
            x1={PAD_L}
            x2={W - PAD_R}
            y1={yOf(baseline)}
            y2={yOf(baseline)}
            stroke="var(--sage)"
            strokeWidth={1}
            strokeDasharray="4 3"
            opacity={0.55}
          />
        )}
        {visible.map((r, i) => {
          const isLast = i === visible.length - 1;
          // Selected lollipop gets the warn-ink + halo accent that
          // defaults to the most-recent night.
          const isAccent = selectedId ? selectedId === r.id : isLast;
          const x = xOf(Date.parse(r.recorded_at));
          const yTop = yOf(r.value);
          const above = r.value > (baseline ?? 0);
          const color = isAccent
            ? 'var(--warn-ink)'
            : above
              ? 'var(--warn-line)'
              : 'var(--sage)';
          const stickOpacity = isAccent ? 1 : above ? 0.85 : 0.55;
          return (
            <g key={r.id}>
              <line
                x1={x}
                x2={x}
                y1={yBase}
                y2={yTop}
                stroke={color}
                strokeWidth={1.6}
                opacity={stickOpacity}
                strokeLinecap="round"
              />
              {isAccent && (
                <circle
                  cx={x}
                  cy={yTop}
                  r={7}
                  fill="color-mix(in oklab, var(--warn-line) 32%, transparent)"
                />
              )}
              <circle
                cx={x}
                cy={yTop}
                r={isAccent ? 4 : 3.2}
                fill={color}
                stroke="var(--cream-card)"
                strokeWidth={1.2}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}
