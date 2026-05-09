// 14-day adherence strip per scheduled (non-PRN) medication.
//
// Each row is one medication: drug name on the left, 14 day cells in the
// middle, taken/expected totals on the right. PRN meds are skipped — the
// "did mom take it today?" question doesn't apply to as_needed.

import { Text, View, Svg, Rect, Line, G } from '@react-pdf/renderer';
import type { VisitHandoffData } from './index';
import type { AdherenceWindow, AdherenceCell } from './adherence';
import { PDF_COLORS } from './colors';
import { PDF_TEXT } from './typography';

const STRIP_WIDTH = 540;
const ROW_HEIGHT = 16;
const NAME_WIDTH = 130;
const TOTAL_WIDTH = 80;
const CELLS_AREA_WIDTH = STRIP_WIDTH - NAME_WIDTH - TOTAL_WIDTH;

interface Props {
  meds: VisitHandoffData['activeMedications'];
  adherence: AdherenceWindow;
}

export function AdherenceStrip({ meds, adherence }: Props) {
  const scheduled = meds.filter((m) => m.cadenceKind !== 'as_needed');
  if (scheduled.length === 0) return null;

  const cellWidth = CELLS_AREA_WIDTH / adherence.days.length;

  return (
    <View style={{ marginTop: 12 }} wrap={false}>
      <Text style={{ ...PDF_TEXT.sectionEyebrow, color: PDF_COLORS.ink, marginBottom: 6 }}>
        14-DAY ADHERENCE
      </Text>
      {scheduled.map((m) => {
        const cells = adherence.byMed.get(m.id) ?? [];
        const totals = adherence.totalsByMed.get(m.id) ?? { taken: 0, expected: 0 };
        return (
          <View
            key={m.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              height: ROW_HEIGHT,
              borderBottomWidth: 0.3,
              borderBottomColor: PDF_COLORS.faint,
            }}
            wrap={false}
          >
            <View style={{ width: NAME_WIDTH, paddingRight: 8 }}>
              <Text style={{ ...PDF_TEXT.body, fontSize: 9, color: PDF_COLORS.ink }} wrap={false}>
                {m.drugName}
              </Text>
            </View>
            <View style={{ width: CELLS_AREA_WIDTH, height: ROW_HEIGHT }}>
              <Svg width={CELLS_AREA_WIDTH} height={ROW_HEIGHT}>
                <G>
                  {cells.map((c, i) => (
                    <CellGlyph
                      key={`c-${i}`}
                      cell={c}
                      x={i * cellWidth + 1}
                      y={2}
                      w={cellWidth - 2}
                      h={ROW_HEIGHT - 4}
                    />
                  ))}
                </G>
              </Svg>
            </View>
            <View style={{ width: TOTAL_WIDTH }}>
              <Text
                style={{
                  ...PDF_TEXT.body,
                  fontSize: 9,
                  color: PDF_COLORS.muted,
                  textAlign: 'right',
                }}
              >
                {totals.taken}/{totals.expected} doses
              </Text>
            </View>
          </View>
        );
      })}
      <Text style={{ ...PDF_TEXT.disclaimer, color: PDF_COLORS.muted, marginTop: 4 }}>
        Filled = all doses taken · half-fill = partial · X = refused · empty box = scheduled but unlogged · blank = not scheduled.
      </Text>
    </View>
  );
}

function CellGlyph(props: { cell: AdherenceCell; x: number; y: number; w: number; h: number }) {
  const { cell, x, y, w, h } = props;
  if (cell === 'not_scheduled') return null;

  if (cell === 'all_taken') {
    return <Rect x={x} y={y} width={w} height={h} fill={PDF_COLORS.ink} />;
  }
  if (cell === 'partial') {
    // Half-fill: bottom half black, top half outlined.
    return (
      <G>
        <Rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill={PDF_COLORS.paper}
          stroke={PDF_COLORS.ink}
          strokeWidth={0.6}
        />
        <Rect x={x} y={y + h / 2} width={w} height={h / 2} fill={PDF_COLORS.ink} />
      </G>
    );
  }
  if (cell === 'refused') {
    // X-marked cell: outlined box with diagonal cross.
    return (
      <G>
        <Rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill={PDF_COLORS.paper}
          stroke={PDF_COLORS.ink}
          strokeWidth={0.6}
        />
        <Line x1={x} y1={y} x2={x + w} y2={y + h} stroke={PDF_COLORS.ink} strokeWidth={0.8} />
        <Line x1={x + w} y1={y} x2={x} y2={y + h} stroke={PDF_COLORS.ink} strokeWidth={0.8} />
      </G>
    );
  }
  // no_log
  return (
    <Rect
      x={x}
      y={y}
      width={w}
      height={h}
      fill={PDF_COLORS.paper}
      stroke={PDF_COLORS.faint}
      strokeWidth={0.5}
    />
  );
}
