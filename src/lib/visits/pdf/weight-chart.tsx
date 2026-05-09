// 30-day weight chart — the chart that earns its space on page 1.
//
// SVG-only (react-pdf primitives) so the print-safe palette (black + 3 grays)
// holds end-to-end. The AHA threshold band starts at dry_weight + 3 because
// research/chf-source-of-truth.md cites the 3 lb / 24 hr (or 5 lb / 7 d)
// trip line; we never re-derive that number here, just render the band.

import { Text, View, Svg, Line, Polyline, Circle, Rect, G } from '@react-pdf/renderer';
import type { VisitHandoffData } from './index';
import { PDF_COLORS } from './colors';
import { PDF_TEXT } from './typography';

const CHART_WIDTH = 540;
const CHART_HEIGHT = 216;
const PLOT_LEFT = 40;
const PLOT_RIGHT_PAD = 80;
const PLOT_TOP = 10;
const PLOT_BOTTOM_PAD = 22;
const PLOT_WIDTH = CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT_PAD;
const PLOT_HEIGHT = CHART_HEIGHT - PLOT_TOP - PLOT_BOTTOM_PAD;

const WINDOW_DAYS = 30;
// AHA threshold offsets cited in research/chf-source-of-truth.md: 3 lb in 24h
// or 5 lb in 7d above dry weight. The band visualizes "3 above" as the floor.
const AHA_BAND_OFFSET_LB = 3;
const AHA_BAND_THICKNESS_LB = 2;

interface Props {
  weightSeries: VisitHandoffData['weightSeries'];
  dryWeightLb: number | null;
  windowStart: string;
  windowEnd: string;
}

export function WeightChart({
  weightSeries,
  dryWeightLb,
  windowStart,
  windowEnd,
}: Props) {
  if (weightSeries.length < 2) {
    return (
      <View
        style={{
          marginVertical: 10,
          height: CHART_HEIGHT,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 0.5,
          borderColor: PDF_COLORS.faint,
        }}
      >
        <Text style={{ ...PDF_TEXT.bodyEmphasis, color: PDF_COLORS.muted }}>
          Not enough weight readings in the window.
        </Text>
      </View>
    );
  }

  const values = weightSeries.map((r) => r.valueLb);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  // Always include the dry-weight band region in the plot range, even when
  // patient weights are far from threshold — keeps the threshold visible.
  const plotMin = roundDown(
    Math.min(minV - 2, (dryWeightLb ?? minV) - 2),
    2,
  );
  const plotMax = roundUp(
    Math.max(
      maxV + 2,
      (dryWeightLb ?? maxV) + AHA_BAND_OFFSET_LB + AHA_BAND_THICKNESS_LB + 1,
    ),
    2,
  );

  const xForDate = (logDate: string): number => {
    const days = daysBetween(windowStart, logDate);
    const t = Math.max(0, Math.min(1, days / WINDOW_DAYS));
    return PLOT_LEFT + t * PLOT_WIDTH;
  };
  const yForValue = (v: number): number =>
    PLOT_TOP + ((plotMax - v) / (plotMax - plotMin)) * PLOT_HEIGHT;

  // Y gridlines every 2 lb.
  const gridLines: number[] = [];
  for (let v = plotMin; v <= plotMax; v += 2) gridLines.push(v);

  // X tick labels every 5 days (-30, -25, ..., -5, 0).
  const xTicks: Array<{ x: number; label: string }> = [];
  for (let d = 0; d <= WINDOW_DAYS; d += 5) {
    const isoDate = isoDateOffset(windowStart, d);
    const x = PLOT_LEFT + (d / WINDOW_DAYS) * PLOT_WIDTH;
    xTicks.push({ x, label: d === WINDOW_DAYS ? 'today' : formatMonthDay(isoDate) });
  }

  const points = weightSeries
    .map((r) => `${xForDate(r.logDate).toFixed(1)},${yForValue(r.valueLb).toFixed(1)}`)
    .join(' ');

  const lastIdx = weightSeries.length - 1;
  const dryWeightY = dryWeightLb !== null ? yForValue(dryWeightLb) : null;
  const bandTopY =
    dryWeightLb !== null
      ? yForValue(dryWeightLb + AHA_BAND_OFFSET_LB + AHA_BAND_THICKNESS_LB)
      : null;
  const bandBottomY =
    dryWeightLb !== null ? yForValue(dryWeightLb + AHA_BAND_OFFSET_LB) : null;
  // Position labels on the right pad (past the plot's right edge).
  const labelX = PLOT_LEFT + PLOT_WIDTH + 4;

  return (
    <View style={{ marginVertical: 10 }}>
      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        <G>
          {/* Y gridlines + labels */}
          {gridLines.map((v) => {
            const y = yForValue(v);
            return (
              <G key={`grid-${v}`}>
                <Line
                  x1={PLOT_LEFT}
                  y1={y}
                  x2={PLOT_LEFT + PLOT_WIDTH}
                  y2={y}
                  stroke={PDF_COLORS.faint}
                  strokeWidth={0.4}
                />
                <SvgLabel
                  x={PLOT_LEFT - 4}
                  y={y + 2.5}
                  text={String(v)}
                  align="end"
                  fill={PDF_COLORS.muted}
                  size={7}
                />
              </G>
            );
          })}

          {/* AHA threshold band */}
          {bandTopY !== null && bandBottomY !== null && (
            <>
              <Rect
                x={PLOT_LEFT}
                y={bandTopY}
                width={PLOT_WIDTH}
                height={bandBottomY - bandTopY}
                fill={PDF_COLORS.faint}
                fillOpacity={0.7}
              />
              <SvgLabel
                x={labelX}
                y={(bandTopY + bandBottomY) / 2 + 2}
                text="AHA threshold"
                align="start"
                fill={PDF_COLORS.muted}
                size={7}
              />
            </>
          )}

          {/* Dry-weight reference line */}
          {dryWeightY !== null && dryWeightLb !== null && (
            <>
              <Line
                x1={PLOT_LEFT}
                y1={dryWeightY}
                x2={PLOT_LEFT + PLOT_WIDTH}
                y2={dryWeightY}
                stroke={PDF_COLORS.rule}
                strokeWidth={0.6}
                strokeDasharray="3 2"
              />
              <SvgLabel
                x={labelX}
                y={dryWeightY + 2.5}
                text={`Dry weight (${dryWeightLb} lb)`}
                align="start"
                fill={PDF_COLORS.rule}
                size={7}
              />
            </>
          )}

          {/* Series line */}
          <Polyline
            points={points}
            stroke={PDF_COLORS.ink}
            strokeWidth={1.5}
            fill="none"
          />

          {/* Dots — open for prior, filled for the most recent reading */}
          {weightSeries.map((r, i) => {
            const cx = xForDate(r.logDate);
            const cy = yForValue(r.valueLb);
            const filled = i === lastIdx;
            return (
              <Circle
                key={`pt-${i}`}
                cx={cx}
                cy={cy}
                r={1.6}
                stroke={PDF_COLORS.ink}
                strokeWidth={0.8}
                fill={filled ? PDF_COLORS.ink : PDF_COLORS.paper}
              />
            );
          })}

          {/* X tick labels */}
          {xTicks.map((t, i) => (
            <SvgLabel
              key={`xt-${i}`}
              x={t.x}
              y={CHART_HEIGHT - 6}
              text={t.label}
              align="middle"
              fill={PDF_COLORS.muted}
              size={7}
            />
          ))}

          {/* Plot bounding rect */}
          <Rect
            x={PLOT_LEFT}
            y={PLOT_TOP}
            width={PLOT_WIDTH}
            height={PLOT_HEIGHT}
            stroke={PDF_COLORS.muted}
            strokeWidth={0.4}
            fill="none"
          />
        </G>
      </Svg>

      <Text
        style={{
          ...PDF_TEXT.disclaimer,
          color: PDF_COLORS.muted,
          textAlign: 'left',
          marginTop: 2,
        }}
      >
        Threshold per AHA Heart Failure Guidelines · cited research/chf-source-of-truth.md.
        Window: {formatMonthDay(windowStart)} – {formatMonthDay(windowEnd)}.
      </Text>
    </View>
  );
}

// SVG <Text> in react-pdf accepts x/y/fill/textAnchor at the element level
// and font props via style. Wrapping keeps the call sites compact.
function SvgLabel(props: {
  x: number;
  y: number;
  text: string;
  align: 'start' | 'middle' | 'end';
  fill: string;
  size: number;
}) {
  return (
    <Text
      x={props.x}
      y={props.y}
      fill={props.fill}
      textAnchor={props.align}
      style={{ fontFamily: 'Inter', fontSize: props.size }}
    >
      {props.text}
    </Text>
  );
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = parseIsoUTC(fromIso);
  const b = parseIsoUTC(toIso);
  return Math.round((b - a) / 86400000);
}

function parseIsoUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoDateOffset(iso: string, days: number): string {
  const t = parseIsoUTC(iso) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

function formatMonthDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
}

function roundDown(v: number, step: number): number {
  return Math.floor(v / step) * step;
}
function roundUp(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}
