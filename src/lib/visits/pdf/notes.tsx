// Post-visit notes section. Plan: omitted entirely when notes_after is null.
// Caller is responsible for not rendering this when notes is null.

import { Text, View } from '@react-pdf/renderer';
import { PDF_COLORS } from './colors';
import { PDF_TEXT } from './typography';

interface Props {
  notes: string;
  visitDateLabel: string;
}

export function NotesSection({ notes, visitDateLabel }: Props) {
  return (
    <View style={{ marginTop: 14 }} wrap>
      <Text style={{ ...PDF_TEXT.sectionEyebrow, color: PDF_COLORS.ink, marginBottom: 6 }}>
        NOTES — {visitDateLabel.toUpperCase()}
      </Text>
      <Text style={{ ...PDF_TEXT.body, color: PDF_COLORS.ink, lineHeight: 1.4 }}>
        {notes}
      </Text>
    </View>
  );
}
