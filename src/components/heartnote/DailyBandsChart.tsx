// Daily-bands chart for sparse self-reported metrics like SpO2.
//
// Per day:
//   - 0 readings → faint dash at the axis floor (visible "we don't know")
//   - 1 reading  → single dot
//   - 2+ readings → vertical band min→max, dot at the latest reading
//
// Past days are muted; today is bold + slightly larger dot. Pure inline
// SVG, no client-side JS. Y range is fixed for SpO2 (80–100%); values
// outside that range are clamped to the chart edge.

export type DailyBandsDay = {
  log_date: string;     // YYYY-MM-DD (caregiver-local)
  readings: number[];   // ordered earliest → latest by recorded_at
};

interface Props {
  days: DailyBandsDay[];   // chronological; today is the last entry
  todayLogDate: string;    // YYYY-MM-DD
  width: number;
  height: number;
  showAxes?: boolean;      // y-axis labels + x weekday initials + gridlines
}

const Y_MIN = 80;
const Y_MAX = 100;
const GRID_VALUES = [80, 90, 100];

export function DailyBandsChart({
  days,
  todayLogDate,
  width,
  height,
  showAxes = false,
}: Props) {
  if (days.length === 0) return null;

  const padTop = 12;
  const padBottom = showAxes ? 22 : 6;
  const padLeft = 4;
  const padRight = showAxes ? 28 : 4;

  const plotWidth = Math.max(0, width - padLeft - padRight);
  const plotHeight = Math.max(0, height - padTop - padBottom);
  const colWidth = plotWidth / days.length;

  const yFor = (v: number) => {
    const clamped = Math.max(Y_MIN, Math.min(Y_MAX, v));
    return padTop + plotHeight * (1 - (clamped - Y_MIN) / (Y_MAX - Y_MIN));
  };
  const cxFor = (i: number) => padLeft + colWidth * (i + 0.5);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`SpO2 readings, last ${days.length} days`}
    >
      {showAxes &&
        GRID_VALUES.map((v) => (
          <line
            key={`grid-${v}`}
            x1={padLeft}
            x2={padLeft + plotWidth}
            y1={yFor(v)}
            y2={yFor(v)}
            style={{ stroke: 'var(--border)' }}
            strokeWidth={1}
          />
        ))}

      {showAxes &&
        GRID_VALUES.map((v) => (
          <text
            key={`ylabel-${v}`}
            x={padLeft + plotWidth + 6}
            y={yFor(v) + 3}
            fontSize={10}
            style={{ fill: 'var(--muted-foreground)' }}
          >
            {v}
          </text>
        ))}

      {days.map((day, i) => {
        const cx = cxFor(i);
        const isToday = day.log_date === todayLogDate;
        const strokeVar = isToday ? 'var(--sage)' : 'var(--muted-foreground)';
        const groupOpacity = isToday ? 1 : 0.5;

        if (day.readings.length === 0) {
          return (
            <line
              key={day.log_date}
              x1={cx - 4}
              x2={cx + 4}
              y1={padTop + plotHeight - 1}
              y2={padTop + plotHeight - 1}
              style={{ stroke: 'var(--muted-foreground)' }}
              strokeWidth={1}
              opacity={0.3}
            />
          );
        }

        const min = Math.min(...day.readings);
        const max = Math.max(...day.readings);
        const latest = day.readings[day.readings.length - 1];
        const dotR = isToday ? 4 : 3;

        return (
          <g key={day.log_date} opacity={groupOpacity}>
            {day.readings.length >= 2 && (
              <line
                x1={cx}
                x2={cx}
                y1={yFor(max)}
                y2={yFor(min)}
                style={{ stroke: strokeVar }}
                strokeWidth={isToday ? 3 : 2.5}
                strokeLinecap="round"
              />
            )}
            <circle
              cx={cx}
              cy={yFor(latest)}
              r={dotR}
              style={{ fill: strokeVar }}
            />
          </g>
        );
      })}

      {showAxes &&
        days.map((day, i) => {
          const cx = cxFor(i);
          const isToday = day.log_date === todayLogDate;
          return (
            <text
              key={`xlabel-${day.log_date}`}
              x={cx}
              y={height - 6}
              fontSize={10}
              textAnchor="middle"
              style={{
                fill: isToday ? 'var(--foreground)' : 'var(--muted-foreground)',
              }}
              fontWeight={isToday ? 600 : 400}
            >
              {weekdayInitial(day.log_date)}
            </text>
          );
        })}
    </svg>
  );
}

// YYYY-MM-DD → S M T W T F S (using UTC so DST / locale never shifts the day)
function weekdayInitial(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][dt.getUTCDay()];
}
