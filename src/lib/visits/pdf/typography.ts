// Typography for the visit-handoff PDF.
//
// Fraunces — display headings (wordmark, visit-context title, numbered questions).
// Inter — everything else (body, captions, eyebrows, runners).
//
// @fontsource v5 ships .woff/.woff2 only; @react-pdf/renderer v4 accepts both.
// Font.register is wrapped in a function and called from the render path so
// module-load doesn't try to resolve binary assets at build time.

import 'server-only';
import { createRequire } from 'node:module';
import { Font } from '@react-pdf/renderer';

const require = createRequire(import.meta.url);

let fontsRegistered = false;

export function registerPdfFonts(): void {
  if (fontsRegistered) return;

  Font.register({
    family: 'Inter',
    fonts: [
      {
        src: require.resolve('@fontsource/inter/files/inter-latin-400-normal.woff'),
        fontWeight: 400,
      },
      {
        src: require.resolve('@fontsource/inter/files/inter-latin-500-normal.woff'),
        fontWeight: 500,
      },
      {
        src: require.resolve('@fontsource/inter/files/inter-latin-700-normal.woff'),
        fontWeight: 700,
      },
      {
        src: require.resolve('@fontsource/inter/files/inter-latin-400-italic.woff'),
        fontWeight: 400,
        fontStyle: 'italic',
      },
    ],
  });

  Font.register({
    family: 'Fraunces',
    fonts: [
      {
        src: require.resolve('@fontsource/fraunces/files/fraunces-latin-400-normal.woff'),
        fontWeight: 400,
      },
      {
        src: require.resolve('@fontsource/fraunces/files/fraunces-latin-500-normal.woff'),
        fontWeight: 500,
      },
      {
        src: require.resolve('@fontsource/fraunces/files/fraunces-latin-600-normal.woff'),
        fontWeight: 600,
      },
    ],
  });

  fontsRegistered = true;
}

// Style constants — each maps to a labeled use in the plan's layout spec.
// Sizes are in pt (the @react-pdf default).
export const PDF_TEXT = {
  wordmark: { fontFamily: 'Fraunces', fontSize: 14, fontWeight: 500 },
  patientName: { fontFamily: 'Inter', fontSize: 11, fontWeight: 700 },
  patientLine: { fontFamily: 'Inter', fontSize: 9, fontWeight: 400 },
  generationStamp: { fontFamily: 'Inter', fontSize: 8, fontWeight: 400 },
  pageNumber: { fontFamily: 'Inter', fontSize: 8, fontWeight: 400 },
  disclaimer: { fontFamily: 'Inter', fontSize: 7, fontWeight: 400, fontStyle: 'italic' as const },
  runner: { fontFamily: 'Inter', fontSize: 8, fontWeight: 400 },
  visitTitle: { fontFamily: 'Fraunces', fontSize: 18, fontWeight: 500 },
  visitSubtitle: { fontFamily: 'Inter', fontSize: 10, fontWeight: 400 },
  sectionEyebrow: {
    fontFamily: 'Inter',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.6,
  },
  body: { fontFamily: 'Inter', fontSize: 10, fontWeight: 400 },
  bodyEmphasis: { fontFamily: 'Inter', fontSize: 11, fontWeight: 400 },
  question: { fontFamily: 'Fraunces', fontSize: 11, fontWeight: 400, lineHeight: 1.4 },
  watermark: {
    fontFamily: 'Inter',
    fontSize: 36,
    fontWeight: 700,
    letterSpacing: 2,
  },
} as const;
