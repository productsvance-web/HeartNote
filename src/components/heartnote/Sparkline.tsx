type Pt = { d: string; w: number };

export function Sparkline({
  data,
  color = 'var(--sage)',
  height = 40,
  width = 120,
}: {
  data: Pt[];
  color?: string;
  height?: number;
  width?: number;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data.map((p) => p.w));
  const max = Math.max(...data.map((p) => p.w));
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((p, i) => `${i * step},${height - ((p.w - min) / range) * (height - 6) - 3}`)
    .join(' ');
  const last = data[data.length - 1];
  const lastX = (data.length - 1) * step;
  const lastY = height - ((last.w - min) / range) * (height - 6) - 3;
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      <circle cx={lastX} cy={lastY} r="3.5" fill={color} />
    </svg>
  );
}
