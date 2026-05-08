// Print-safe palette for the visit-handoff PDF.
//
// The screen uses oklch values (sage, coral, gold). Those drift unpredictably
// in CMYK and disappear under photocopy contrast loss. The PDF is the
// artifact a cardiologist sees on paper — it has to render the same way
// after going through a hospital photocopier as it does on screen.
//
// Black/white/three grays only. No exceptions.

export const PDF_COLORS = {
  ink: '#000000',
  paper: '#ffffff',
  rule: '#404040',
  muted: '#808080',
  faint: '#c0c0c0',
} as const;

export type PdfColor = (typeof PDF_COLORS)[keyof typeof PDF_COLORS];
