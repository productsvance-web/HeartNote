// Inline SVG sparkline. Optional dashed threshold band (used to draw the
// AHA "call your provider" weight line on the Hero alert) and an optional
// dotted baseline line. Renders nothing for fewer than 2 points so the
// caller doesn't have to gate.

type Pt = { d: string; v: number };

interface Props {
  data: Pt[];
  color?: string;
  thresholdValue?: number;
  baselineValue?: number;
  height?: number;
  showEndpoint?: boolean;
}

export function MiniTrendSpark({
  data,
  color = 'var(--status-alert)',
  thresholdValue,
  baselineValue,
  height = 56,
  showEndpoint = true,
}: Props) {
  if (data.length < 2) return null;
  const w = 200;
  const values = data.map((p) => p.v);
  const tBand = thresholdValue ?? null;
  const bBand = baselineValue ?? null;
  const allRefs = [
    ...values,
    ...(tBand !== null ? [tBand] : []),
    ...(bBand !== null ? [bBand] : []),
  ];
  const min = Math.min(...allRefs);
  const max = Math.max(...allRefs);
  const range = max - min || 1;
  const yOf = (v: number) => height - ((v - min) / range) * (height - 14) - 7;
  const xOf = (i: number) => (i / (data.length - 1)) * w;
  const d = data
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(p.v).toFixed(1)}`)
    .join(' ');
  const last = data[data.length - 1];
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-hidden
    >
      {tBand !== null && (
        <>
          <rect x="0" y="0" width={w} height={yOf(tBand)} fill={color} fillOpacity="0.08" />
          <line
            x1="0"
            x2={w}
            y1={yOf(tBand)}
            y2={yOf(tBand)}
            stroke={color}
            strokeOpacity="0.55"
            strokeDasharray="3 3"
            strokeWidth="0.9"
          />
        </>
      )}
      {bBand !== null && (
        <line
          x1="0"
          x2={w}
          y1={yOf(bBand)}
          y2={yOf(bBand)}
          stroke="var(--foreground)"
          strokeOpacity="0.22"
          strokeDasharray="2 3"
          strokeWidth="0.8"
        />
      )}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showEndpoint && (
        <>
          <circle cx={xOf(data.length - 1)} cy={yOf(last.v)} r="3.4" fill={color} />
          <circle
            cx={xOf(data.length - 1)}
            cy={yOf(last.v)}
            r="6"
            fill={color}
            fillOpacity="0.18"
          />
        </>
      )}
    </svg>
  );
}
