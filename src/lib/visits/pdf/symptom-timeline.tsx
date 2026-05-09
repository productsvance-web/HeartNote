// 30-day symptom timeline — 4 rows × 30 columns of cells.
//
// Three rows are derived from `daily_log_symptom_events` (dyspnea, swelling,
// cough). The fourth row "Sleep (pillows)" is NOT a symptom event — it
// derives per-day from `daily_logs.pillow_count` vs `patient.normal_pillow_count`.
// Cell colors per the plan: filled black = symptom reported present that day,
// half-tone gray = reported absent, blank = no log that day.

import { Text, View, Svg, Rect, G } from '@react-pdf/renderer';
import type { VisitHandoffData, TimelineSymptom } from './index';
import { PDF_COLORS } from './colors';
import { PDF_TEXT } from './typography';

const TIMELINE_WIDTH = 540;
const TIMELINE_HEIGHT = 144;
const ROW_LABEL_WIDTH = 80;
const COL_LABEL_HEIGHT = 14;
const PLOT_WIDTH = TIMELINE_WIDTH - ROW_LABEL_WIDTH;
const PLOT_HEIGHT = TIMELINE_HEIGHT - COL_LABEL_HEIGHT;

const WINDOW_DAYS = 30;
const ROWS = [
  { key: 'dyspnea' as const, label: 'Shortness of breath' },
  { key: 'swelling' as const, label: 'Swelling' },
  { key: 'pillows' as const, label: 'Sleep (pillows)' },
  { key: 'cough' as const, label: 'Cough' },
];
type RowKey = (typeof ROWS)[number]['key'];

type CellState = 'present' | 'absent' | 'blank';

interface Props {
  symptomEvents: VisitHandoffData['symptomEvents'];
  pillowReadings: VisitHandoffData['pillowReadings'];
  normalPillowCount: number | null;
  windowStart: string;
  windowEnd: string;
  patientFirstName: string;
}

export function SymptomTimeline({
  symptomEvents,
  pillowReadings,
  normalPillowCount,
  windowStart,
  windowEnd,
  patientFirstName,
}: Props) {
  const colWidth = PLOT_WIDTH / WINDOW_DAYS;
  const rowHeight = PLOT_HEIGHT / ROWS.length;

  // Build a dayKey → CellState map per row.
  const cellMap = buildCellMap(
    symptomEvents,
    pillowReadings,
    normalPillowCount,
  );

  // Day index (0 .. WINDOW_DAYS-1) → ISO date in window
  const dayIsoForIndex = (i: number): string => isoDateOffset(windowStart, i);

  return (
    <View style={{ marginVertical: 8 }}>
      <Svg width={TIMELINE_WIDTH} height={TIMELINE_HEIGHT}>
        <G>
          {/* Column labels every 5 days */}
          {Array.from({ length: WINDOW_DAYS / 5 + 1 }, (_, k) => {
            const i = k * 5;
            const x = ROW_LABEL_WIDTH + i * colWidth + colWidth / 2;
            const iso = dayIsoForIndex(i);
            const isLast = i === WINDOW_DAYS;
            return (
              <Text
                key={`col-${i}`}
                x={x}
                y={COL_LABEL_HEIGHT - 4}
                fill={PDF_COLORS.muted}
                textAnchor="middle"
                style={{ fontFamily: 'Inter', fontSize: 7 }}
              >
                {isLast ? `today (${formatMonthDay(iso)})` : formatMonthDay(iso)}
              </Text>
            );
          })}

          {/* Row labels + grid lines */}
          {ROWS.map((row, ri) => {
            const yTop = COL_LABEL_HEIGHT + ri * rowHeight;
            const yMid = yTop + rowHeight / 2;
            return (
              <G key={`row-${row.key}`}>
                <Text
                  x={ROW_LABEL_WIDTH - 4}
                  y={yMid + 2.5}
                  fill={PDF_COLORS.ink}
                  textAnchor="end"
                  style={{ fontFamily: 'Inter', fontSize: 8 }}
                >
                  {row.label}
                </Text>
                {/* Row baseline */}
                <Rect
                  x={ROW_LABEL_WIDTH}
                  y={yTop}
                  width={PLOT_WIDTH}
                  height={rowHeight}
                  stroke={PDF_COLORS.faint}
                  strokeWidth={0.3}
                  fill="none"
                />
              </G>
            );
          })}

          {/* Cells */}
          {ROWS.map((row, ri) => {
            const yTop = COL_LABEL_HEIGHT + ri * rowHeight;
            return Array.from({ length: WINDOW_DAYS }, (_, i) => {
              const iso = dayIsoForIndex(i);
              const state = cellMap.get(`${row.key}|${iso}`) ?? 'blank';
              if (state === 'blank') return null;
              const x = ROW_LABEL_WIDTH + i * colWidth + 1;
              const y = yTop + 4;
              const w = colWidth - 2;
              const h = rowHeight - 8;
              return (
                <Rect
                  key={`cell-${row.key}-${i}`}
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={state === 'present' ? PDF_COLORS.ink : PDF_COLORS.faint}
                />
              );
            });
          })}
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
        Days when {patientFirstName || 'the patient'} reported each symptom. Empty cells = no log that day.
        Window: {formatMonthDay(windowStart)} – {formatMonthDay(windowEnd)}.
      </Text>
    </View>
  );
}

function buildCellMap(
  symptomEvents: VisitHandoffData['symptomEvents'],
  pillowReadings: VisitHandoffData['pillowReadings'],
  normalPillowCount: number | null,
): Map<string, CellState> {
  const map = new Map<string, CellState>();

  // Symptom rows: any present-true on the day → present; otherwise if any
  // present-false → absent; else blank.
  const bySymptomDay = new Map<string, { hasPresent: boolean; hasAbsent: boolean }>();
  for (const ev of symptomEvents) {
    const k = `${ev.symptom}|${ev.logDate}`;
    const cur = bySymptomDay.get(k) ?? { hasPresent: false, hasAbsent: false };
    if (ev.present) cur.hasPresent = true;
    else cur.hasAbsent = true;
    bySymptomDay.set(k, cur);
  }
  for (const [k, v] of bySymptomDay) {
    const [sym] = k.split('|');
    if (sym === 'dyspnea' || sym === 'swelling' || sym === 'cough') {
      map.set(`${rowKeyFor(sym as TimelineSymptom)}|${k.split('|')[1]}`,
        v.hasPresent ? 'present' : v.hasAbsent ? 'absent' : 'blank');
    }
  }

  // Pillow row: any reading > baseline that day → present; any reading
  // == baseline (and no above-baseline) → absent; else blank. NULL baseline
  // → never present, so we leave the row blank for that patient.
  if (normalPillowCount !== null) {
    const byDay = new Map<string, { above: boolean; equal: boolean }>();
    for (const r of pillowReadings) {
      const cur = byDay.get(r.logDate) ?? { above: false, equal: false };
      if (r.pillowCount > normalPillowCount) cur.above = true;
      else if (r.pillowCount === normalPillowCount) cur.equal = true;
      byDay.set(r.logDate, cur);
    }
    for (const [logDate, v] of byDay) {
      const state: CellState = v.above ? 'present' : v.equal ? 'absent' : 'blank';
      if (state !== 'blank') map.set(`pillows|${logDate}`, state);
    }
  }

  return map;
}

function rowKeyFor(sym: TimelineSymptom): RowKey {
  // dyspnea | swelling | cough — direct mapping; pillows row is built separately.
  return sym;
}

function isoDateOffset(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
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
