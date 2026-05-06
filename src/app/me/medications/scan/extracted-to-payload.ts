// Adapter at the boundary between the API output schema (Gemini's shape:
// dose_value + dose_unit as separate fields) and the form payload schema
// (a single `dose: string` matching DOSE_FORMAT). Architectural decision
// #17 in the plan.
//
// Frequency, schedule times, and start date are no longer collected at
// scan time. Every saved med starts as PRN with no clock times — the
// caregiver edits these later from /me/medications, and the reminders
// PR will replace this with a proper schedule UI.

import type { ResolvedMed } from '@/lib/medications/scan/schema';
import type { MedicationPayload } from '../actions';

// Drug-name composition for the payload's drugName field.
// Persists the OCR'd label text as the primary record — the bottle's
// printed name takes precedence over RxNorm's canonical conceptName so
// brand-vs-generic display choices match what the caregiver sees on
// the bottle. Title Case applied at write time because pharmacy labels
// commonly print in all-caps and the existing /me/medications list
// renders drug_name verbatim — saving "MIDODRINE HCL 2.5MG TABS" raw
// would surface all-caps text on the list and detail pages.
// Capitalization carries no semantic info on a label.
function chooseDrugName(med: ResolvedMed): string {
  const ocr = med.drug_name.trim();
  const source = ocr.length > 0 ? ocr : (med.canonicalName ?? '').trim();
  return toTitleCase(source);
}

export function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Strength fallback chain. Single-ingredient cases get parsed from
// canonicalName when med.strength is null/missing — that's the B1 fix
// (Midodrine bottle scanned with Verified badge but empty dose field).
// Combination products (canonicalName containing " / ") are skipped at
// the canonicalName step because RxNav returns combo strengths the
// existing parser already declines (rxnorm-ndc.parseStrength).
function resolveDose(med: ResolvedMed): string {
  // Fallback 1: RxNorm strength field, if present.
  if (med.strength) return med.strength.toLowerCase().trim();

  // Fallback 2: parse from canonicalName tail. Skip for combo products.
  if (med.canonicalName && !med.canonicalName.includes(' / ')) {
    const parsed = parseStrengthFromCanonicalTail(med.canonicalName);
    if (parsed) return parsed;
  }

  // Fallback 3: OCR'd dose_value + dose_unit.
  if (med.dose_value !== null && med.dose_unit !== null && med.dose_unit.trim().length > 0) {
    return `${med.dose_value} ${med.dose_unit.toLowerCase().trim()}`;
  }

  return '';
}

// canonicalName looks like "midodrine hydrochloride 2.5 MG Oral Tablet".
// The strength is "<num> <unit>" — same pattern as RxNorm's STRENGTH
// attribute, just embedded in a longer string. Match the first
// "<num>(.<num>)? <unit>" pair where unit is alphabetic; lowercase the
// unit for parity with the strength-field fallback.
function parseStrengthFromCanonicalTail(name: string): string | null {
  const m = /(\d+(?:\.\d+)?)\s+([A-Za-z]+(?:\/[A-Za-z]+)?)/.exec(name);
  if (!m) return null;
  return `${m[1]} ${m[2].toLowerCase()}`;
}

export function extractedMedToPayload(med: ResolvedMed): MedicationPayload {
  return {
    drugName: chooseDrugName(med),
    dose: resolveDose(med),
    // Photo-scan does not parse pills-per-dose from the bottle.
    // Default 1; caregiver can adjust later from /me/medications.
    pillsPerDose: 1,
    // PRN with no clock times — schedule UI deferred to the reminders PR.
    dosesPerDay: null,
    scheduleTimes: null,
    startedAt: '',
    notes: '',
    ndc: med.ndc,
    rxcui: med.rxcui,
    ingredient: med.ingredient,
    form: med.form,
  };
}
