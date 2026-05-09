// Active medications table — two columns (Drug + dose | Schedule).
// Rows arrive pre-sorted by canonical med-class display order (loop_diuretic
// first, "other" last); we don't re-sort here.

import { Text, View } from '@react-pdf/renderer';
import type { VisitHandoffData } from './index';
import {
  formatCadenceSummary,
  type CadenceKind,
  CADENCE_KINDS,
} from '@/lib/medications/cadence';
import { PDF_COLORS } from './colors';
import { PDF_TEXT } from './typography';

interface Props {
  meds: VisitHandoffData['activeMedications'];
}

export function MedsTable({ meds }: Props) {
  return (
    <View style={{ marginTop: 14 }} wrap={false}>
      <Text style={{ ...PDF_TEXT.sectionEyebrow, color: PDF_COLORS.ink, marginBottom: 6 }}>
        ACTIVE MEDICATIONS
      </Text>
      {meds.length === 0 ? (
        <Text style={{ ...PDF_TEXT.body, color: PDF_COLORS.muted, fontStyle: 'italic' }}>
          No medications on file.
        </Text>
      ) : (
        <View style={{ borderTopWidth: 0.5, borderTopColor: PDF_COLORS.muted }}>
          {meds.map((m) => (
            <View
              key={m.id}
              style={{
                flexDirection: 'row',
                paddingVertical: 5,
                borderBottomWidth: 0.5,
                borderBottomColor: PDF_COLORS.faint,
              }}
              wrap={false}
            >
              <View style={{ flex: 3, paddingRight: 8 }}>
                <Text style={{ ...PDF_TEXT.body, color: PDF_COLORS.ink, fontWeight: 700 }}>
                  {m.drugName}
                  {m.dose ? ` ${m.dose}` : ''}
                  {m.form ? ` (${m.form})` : ''}
                </Text>
              </View>
              <View style={{ flex: 4 }}>
                <Text style={{ ...PDF_TEXT.body, color: PDF_COLORS.ink }}>
                  {scheduleString(m)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function scheduleString(m: VisitHandoffData['activeMedications'][number]): string {
  if (!isCadenceKind(m.cadenceKind)) return m.cadenceKind;
  return formatCadenceSummary({
    cadenceKind: m.cadenceKind,
    cycleOnDays: m.cycleOnDays,
    cycleOffDays: m.cycleOffDays,
    intervalDays: m.intervalDays,
    doseTimes: m.doseTimes,
  });
}

function isCadenceKind(s: string): s is CadenceKind {
  return (CADENCE_KINDS as readonly string[]).includes(s);
}
