// Single source for the dose-unit list and display labels. Keep in sync
// with the DOSE_FORMAT regex in src/app/me/medications/actions.ts —
// any unit added here that isn't in the regex will be rejected at the
// API boundary, and any unit accepted by the regex but not listed here
// won't render in the form picker.
//
// SI / medical abbreviations are cased correctly (mg, mL, L, tsp);
// English words get title case (Tablet, Units). Lookup is
// case-insensitive so RxNorm-normalized lowercase values still display.

export const UNIT_OPTIONS = [
  'mg',
  'mcg',
  'g',
  'mL',
  'L',
  'units',
  'tablet',
  'capsule',
  'puff',
  'drop',
  'tsp',
  'tbsp',
] as const;

export type UnitOption = (typeof UNIT_OPTIONS)[number];

const UNIT_LABELS: Record<string, string> = {
  mg: 'mg',
  mcg: 'mcg',
  g: 'g',
  ml: 'mL',
  l: 'L',
  units: 'Units',
  tablet: 'Tablet',
  capsule: 'Capsule',
  puff: 'Puff',
  drop: 'Drop',
  tsp: 'tsp',
  tbsp: 'tbsp',
};

export function unitLabel(u: string): string {
  return UNIT_LABELS[u.toLowerCase()] ?? u;
}
