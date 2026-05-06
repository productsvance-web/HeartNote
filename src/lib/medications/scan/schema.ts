// Schema for medications extracted from a photo by Gemini 2.5 Flash.
//
// Two exports — the Zod schema we validate the model's response against,
// and the JSON-schema we hand to Vertex AI's `responseSchema` so the
// model is guaranteed to return matching shape.
//
// NOTE: this is intentionally NOT the same as MedicationPayloadSchema in
// src/app/me/medications/actions.ts. That schema models the FORM payload
// (`dose: string` matching DOSE_FORMAT, e.g. "40 mg"), this one models
// what the MODEL produces (separate dose_value + dose_unit, since
// structured-output models combine them less reliably than emitting them
// as discrete fields). The boundary between them is the scan-review-card
// — when the caregiver confirms a card, we combine `${dose_value} ${dose_unit}`
// into the form payload string. Architectural decision #17.

import { z } from 'zod';
import { SchemaType, type ResponseSchema } from '@google-cloud/vertexai';

export const ExtractedMedSchema = z.object({
  drug_name: z.string().min(1).max(200),
  dose_value: z.number().nullable(),
  dose_unit: z.string().nullable(),
  // NDC — National Drug Code, printed on US prescription labels. The
  // model returns the printed string verbatim (10 or 11 digits, with
  // or without hyphens). RxNav accepts both forms; the format-validation
  // in extract.ts decides whether to call out, so this Zod constraint
  // stays loose. Null when no label is visible (handwritten lists, EHR
  // screenshots) or when the NDC is illegible.
  ndc: z.string().nullable(),
  // True when the label states a dose change / taper / future-dated
  // instruction. The UI renders a non-interactive notice card for these
  // and never inserts a row; build convention #6 (never recommend dose
  // changes — and never let an ambient image become one). Stays in the
  // schema even after we stopped extracting frequency: this is the
  // safety classifier, independent of schedule.
  is_dose_change: z.boolean(),
});
export type ExtractedMed = z.infer<typeof ExtractedMedSchema>;

// Wider shape returned to the API client. ExtractedMed = what Gemini
// produced; ResolvedMed = ExtractedMed with the optional NDC-resolved
// canonical fields merged in. The scan-review card and payload adapter
// consume this shape.
export interface ResolvedMed extends ExtractedMed {
  rxcui: string | null;
  ingredient: string | null;
  form: string | null;
  strength: string | null;
  canonicalName: string | null;
}

// Schema allows headroom over the displayed cap so we can truncate-and-
// flag gracefully if the model returns more than 30 (e.g., on a portal
// screenshot of high-polypharmacy patients). The prompt asks for ≤30.
export const ExtractionResponseSchema = z.object({
  medications: z.array(ExtractedMedSchema).max(60),
});
export type ExtractionResponse = z.infer<typeof ExtractionResponseSchema>;

// Vertex AI `responseSchema` shape — OpenAPI 3.0-style. Vertex rejects
// `null` as a type, so nullable fields use `nullable: true` instead.
// Must stay in sync with ExtractedMedSchema above; mismatch produces
// guaranteed ExtractionError('schema-fail') at parse time.
export const extractedMedsResponseSchema: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    medications: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          drug_name: { type: SchemaType.STRING },
          dose_value: { type: SchemaType.NUMBER, nullable: true },
          dose_unit: { type: SchemaType.STRING, nullable: true },
          ndc: { type: SchemaType.STRING, nullable: true },
          is_dose_change: { type: SchemaType.BOOLEAN },
        },
        required: ['drug_name', 'dose_value', 'dose_unit', 'ndc', 'is_dose_change'],
      },
    },
  },
  required: ['medications'],
};
