// Medication schedule + cadence — constants and pure helpers.
//
// Single source of truth for the five Apple-Health-style cadence kinds,
// the day-of-week bitmap convention, the notification ID hash, and the
// cadence-summary formatter. Imported by Zod (actions.ts), the cadence
// picker UI, the notifications module, and the medications-list display.

export const CADENCE_KINDS = [
  'every_day',
  'cyclical',
  'specific_days',
  'every_few_days',
  'as_needed',
] as const;

export type CadenceKind = (typeof CADENCE_KINDS)[number];

// Day-of-week bitmap. Sun=1<<0, Mon=1<<1, ..., Sat=1<<6. Range 1..127.
// Mirrors the SQL CHECK on medication_dose_times.applies_to_dow and the
// dow_bit derivation in medication_adherence_for_day's CTE.
export const DOW_SUN = 1 << 0;
export const DOW_MON = 1 << 1;
export const DOW_TUE = 1 << 2;
export const DOW_WED = 1 << 3;
export const DOW_THU = 1 << 4;
export const DOW_FRI = 1 << 5;
export const DOW_SAT = 1 << 6;
export const DOW_ALL = 127;

export const DOW_BY_INDEX = [
  { bit: DOW_SUN, short: 'S', long: 'Sun' },
  { bit: DOW_MON, short: 'M', long: 'Mon' },
  { bit: DOW_TUE, short: 'T', long: 'Tue' },
  { bit: DOW_WED, short: 'W', long: 'Wed' },
  { bit: DOW_THU, short: 'T', long: 'Thu' },
  { bit: DOW_FRI, short: 'F', long: 'Fri' },
  { bit: DOW_SAT, short: 'S', long: 'Sat' },
] as const;

export const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface DoseTime {
  timeOfDay: string;
  quantity: number;
  ordinal: number;
  appliesToDow: number | null;
}

// Cyclical / every_few_days "is this date a fire day" predicate. Used by
// the notifications module to compute the next 30 days of fires.
export function isCadenceActiveOnDate(args: {
  cadenceKind: CadenceKind;
  startedAt: string | null;
  cycleOnDays: number | null;
  cycleOffDays: number | null;
  intervalDays: number | null;
  date: Date;
}): boolean {
  const { cadenceKind, startedAt, cycleOnDays, cycleOffDays, intervalDays, date } = args;

  if (cadenceKind === 'as_needed') return false;
  if (cadenceKind === 'every_day' || cadenceKind === 'specific_days') return true;

  if (!startedAt) return false;
  const start = new Date(startedAt + 'T00:00:00');
  const days = Math.floor((date.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return false;

  if (cadenceKind === 'cyclical') {
    if (cycleOnDays == null || cycleOffDays == null) return false;
    const period = cycleOnDays + cycleOffDays;
    return days % period < cycleOnDays;
  }
  if (cadenceKind === 'every_few_days') {
    if (intervalDays == null) return false;
    return days % intervalDays === 0;
  }
  return false;
}

// 31-bit FNV-1a hash. Capacitor LocalNotifications.schedule requires a
// positive 32-bit int id; we mask to 31 bits to stay safely positive on
// platforms that interpret the high bit as sign.
export function notificationIdFor(medicationId: string, occurrenceUnixSeconds: number): number {
  const input = `med:${medicationId}:${occurrenceUnixSeconds}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash & 0x7fffffff;
}

// One-line cadence summary for the medications list / edit-page row.
export function formatCadenceSummary(args: {
  cadenceKind: CadenceKind;
  cycleOnDays: number | null;
  cycleOffDays: number | null;
  intervalDays: number | null;
  doseTimes: ReadonlyArray<{ timeOfDay: string; appliesToDow: number | null }>;
}): string {
  const { cadenceKind, cycleOnDays, cycleOffDays, intervalDays, doseTimes } = args;

  if (cadenceKind === 'as_needed') return 'As needed';

  const allTimes = Array.from(new Set(doseTimes.map((d) => d.timeOfDay))).sort();
  const timesPart = allTimes.length > 0 ? allTimes.map(formatTime12h).join(' · ') : 'no times set';

  if (cadenceKind === 'every_day') {
    return `Every day, ${timesPart}`;
  }
  if (cadenceKind === 'specific_days') {
    const dowUnion = doseTimes.reduce((acc, d) => acc | (d.appliesToDow ?? 0), 0);
    return `${formatDowList(dowUnion)}, ${timesPart}`;
  }
  if (cadenceKind === 'cyclical' && cycleOnDays != null && cycleOffDays != null) {
    return `${cycleOnDays} on / ${cycleOffDays} off, ${timesPart}`;
  }
  if (cadenceKind === 'every_few_days' && intervalDays != null) {
    return `Every ${intervalDays} days, ${timesPart}`;
  }
  return timesPart;
}

function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${period}` : `${h12}:${mStr}${period}`;
}

function formatDowList(bitmap: number): string {
  if (bitmap === DOW_ALL) return 'Every day';
  if (bitmap === (DOW_MON | DOW_TUE | DOW_WED | DOW_THU | DOW_FRI)) return 'Weekdays';
  if (bitmap === (DOW_SAT | DOW_SUN)) return 'Weekends';
  const days = DOW_BY_INDEX.filter((d) => (bitmap & d.bit) !== 0).map((d) => d.long);
  return days.join(', ');
}
