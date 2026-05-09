// Typography for the visit-handoff PDF.
//
// Uses @react-pdf's built-in standard fonts (Helvetica, Times-Roman) so we
// don't have to bundle binary font files into the serverless function output.
// The plan named Inter + Fraunces; that swap is a follow-up that needs the
// actual font binaries staged in /public/fonts/pdf/ (the @fontsource packages
// ship .woff/.woff2 only, and Turbopack can't trace require.resolve(woff)
// through to a bundled asset). Helvetica/Times-Roman render universally and
// print correctly, which is the only hard requirement of this artifact.

// `registerPdfFonts` exists so the render path has a single, idempotent place
// to call before rendering — when the font swap to Inter/Fraunces lands, only
// this function changes.
export function registerPdfFonts(): void {
  // No-op while we're on the standard 14 PDF fonts.
}

// Style constants — each maps to a labeled use in the plan's layout spec.
// Sizes are in pt (the @react-pdf default).
export const PDF_TEXT = {
  wordmark: { fontFamily: 'Times-Roman', fontSize: 14, fontWeight: 700 },
  patientName: { fontFamily: 'Helvetica', fontSize: 11, fontWeight: 700 },
  patientLine: { fontFamily: 'Helvetica', fontSize: 9, fontWeight: 400 },
  generationStamp: { fontFamily: 'Helvetica', fontSize: 8, fontWeight: 400 },
  pageNumber: { fontFamily: 'Helvetica', fontSize: 8, fontWeight: 400 },
  disclaimer: { fontFamily: 'Helvetica', fontSize: 7, fontWeight: 400, fontStyle: 'italic' as const },
  runner: { fontFamily: 'Helvetica', fontSize: 8, fontWeight: 400 },
  visitTitle: { fontFamily: 'Times-Roman', fontSize: 18, fontWeight: 700 },
  visitSubtitle: { fontFamily: 'Helvetica', fontSize: 10, fontWeight: 400 },
  sectionEyebrow: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.6,
  },
  body: { fontFamily: 'Helvetica', fontSize: 10, fontWeight: 400 },
  bodyEmphasis: { fontFamily: 'Helvetica', fontSize: 11, fontWeight: 400 },
  question: { fontFamily: 'Times-Roman', fontSize: 11, fontWeight: 400, lineHeight: 1.4 },
  watermark: {
    fontFamily: 'Helvetica',
    fontSize: 36,
    fontWeight: 700,
    letterSpacing: 2,
  },
} as const;
