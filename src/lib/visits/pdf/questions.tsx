// Questions-to-ask section. Numbered list in Fraunces 11pt, ~0.3in line
// height. Up to 8 fit on one page; @react-pdf will paginate the rest.

import { Text, View } from '@react-pdf/renderer';
import { PDF_COLORS } from './colors';
import { PDF_TEXT } from './typography';

interface Props {
  questions: unknown;
}

export function QuestionsSection({ questions }: Props) {
  const list = normalize(questions);

  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ ...PDF_TEXT.sectionEyebrow, color: PDF_COLORS.ink, marginBottom: 6 }}>
        QUESTIONS TO ASK
      </Text>
      {list.length === 0 ? (
        <Text style={{ ...PDF_TEXT.body, color: PDF_COLORS.muted, fontStyle: 'italic' }}>
          No questions written yet.
        </Text>
      ) : (
        list.map((q, i) => (
          <View
            key={`q-${i}`}
            style={{ flexDirection: 'row', marginTop: i === 0 ? 0 : 4 }}
            wrap={false}
          >
            <Text
              style={{
                ...PDF_TEXT.question,
                color: PDF_COLORS.muted,
                width: 18,
                textAlign: 'right',
                paddingRight: 6,
              }}
            >
              {i + 1}.
            </Text>
            <Text style={{ ...PDF_TEXT.question, color: PDF_COLORS.ink, flex: 1 }}>
              {q}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function normalize(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}
