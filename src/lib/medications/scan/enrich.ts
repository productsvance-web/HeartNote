// Post-Vertex enrichment: takes the validated `ExtractedMed[]` from the
// model and merges in NDC-resolved RxNorm fields (rxcui, ingredient,
// form, strength, canonicalName) when the printed NDC is present and
// format-valid. Lives in its own file (rather than inside extract.ts)
// so the enrichment logic is unit-testable under `node:test` without
// having to load Vertex AI's SDK at module-init time.
//
// Relative imports use explicit `.ts` extensions because the unit test
// loads this module directly via `--experimental-strip-types`, which
// requires explicit file paths. Production builds (Next.js) resolve
// either form.

import type { ExtractedMed, ResolvedMed } from './schema.ts';
import type { NdcResolution } from '../rxnorm-ndc.ts';
import { mapWithConcurrency } from '../rxnorm.ts';

const NDC_FAN_OUT_LIMIT = 8;

// FDA-valid NDC segment patterns: 5-4-2, 5-3-2, 4-4-2 (hyphenated, 10
// digits) plus unhyphenated 10/11-digit forms (manufacturer stock /
// HIPAA-canonical). Validation is the primary safety net for hallucinated
// NDCs that the structured-output schema can't prevent — e.g., the model
// might emit a phone number, Rx number, or lot code into the `ndc` field
// when uncertain. Reject these before they cost a NLM round-trip.
function isValidNdcFormat(ndc: string): boolean {
  return /^(?:\d{5}-\d{4}-\d{2}|\d{5}-\d{3}-\d{2}|\d{4}-\d{4}-\d{2}|\d{10,11})$/.test(ndc);
}

// The resolver is injected rather than imported because node:test doesn't
// have module-mocking; production callers (extract.ts) pass `resolveByNdc`
// directly.
export async function enrichMedications(
  meds: readonly ExtractedMed[],
  resolver: (ndc: string) => Promise<NdcResolution | null>,
): Promise<ResolvedMed[]> {
  return mapWithConcurrency(meds, NDC_FAN_OUT_LIMIT, async (med): Promise<ResolvedMed> => {
    // Three guards stack here:
    //   1. is_dose_change=true → never enrich. Build convention #6 —
    //      defense in depth so canonical fields can never be persisted
    //      against a dose-change row even if a future code path exposed
    //      that branch.
    //   2. ndc is null or empty → no enrichment possible.
    //   3. ndc fails format validation → don't waste a RxNav call.
    if (med.is_dose_change || !med.ndc || !isValidNdcFormat(med.ndc)) {
      return { ...med, rxcui: null, ingredient: null, form: null, strength: null, canonicalName: null };
    }
    const r = await resolver(med.ndc);
    if (!r) {
      return { ...med, rxcui: null, ingredient: null, form: null, strength: null, canonicalName: null };
    }
    return { ...med, ...r };
  });
}
