import type { CadenceKind } from '@/lib/medications/cadence';

// Narrow allowlist of (ingredient, form) combinations that default to PRN
// rather than the standard "Every Day" cadence.
//
// Form-only matching is too loose — "Sublingual Tablet" alone false-
// positives on asenapine, etc. The predicate requires an ingredient match
// against a curated list AND a form match. Cited form-class context:
// research/02-medications.md (Nitroglycerin sublingual is the canonical
// CHF/CAD PRN drug; tablets/sprays/powders are taken at angina onset, not
// on a schedule).
//
// Keep this list minimal — only drugs where PRN is so dominant that a
// scheduled default would mislead the caregiver. Anything else stays on
// the every_day default; the user picks `as_needed` from the kind sheet
// if needed.

const PRN_INGREDIENTS = new Set<string>(['nitroglycerin']);

const PRN_FORMS = new Set<string>([
  'Sublingual Tablet',
  'Sublingual Spray',
  'Sublingual Powder',
  'Translingual Spray',
]);

export function defaultCadenceKind(args: {
  ingredient: string | null | undefined;
  form: string | null | undefined;
}): CadenceKind {
  const ing = (args.ingredient ?? '').trim().toLowerCase();
  const form = (args.form ?? '').trim();
  if (PRN_INGREDIENTS.has(ing) && PRN_FORMS.has(form)) return 'as_needed';
  return 'every_day';
}
