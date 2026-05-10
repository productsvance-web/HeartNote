// Pure helpers for the /trends/weight page. No DB calls. Window slicing
// + stat derivation kept out of the React tree so they can be unit-tested
// without a render. Tz-aware where it matters.

export type WeightReading = {
  id: string; // daily_log_readings.id — needed for delete
  recorded_at: string; // full ISO timestamp
  value: number; // lb
  log_date: string; // YYYY-MM-DD in patient tz (denormalized at insert time)
};

export type WindowPeriod = 'D' | 'W' | 'M' | '6M' | 'Y';

function isoDateInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// Given today (YYYY-MM-DD in patient tz), return the inclusive lower-bound
// log_date for the selected window. Caller filters readings whose
// log_date >= this AND <= today.
export function lowerLogDateFor(period: WindowPeriod, today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  switch (period) {
    case 'D':
      return today;
    case 'W':
      base.setUTCDate(base.getUTCDate() - 6);
      break; // last 7 days inclusive
    case 'M':
      base.setUTCDate(base.getUTCDate() - 30);
      break;
    case '6M':
      base.setUTCMonth(base.getUTCMonth() - 6);
      break;
    case 'Y':
      base.setUTCMonth(base.getUTCMonth() - 12);
      break;
  }
  return base.toISOString().slice(0, 10);
}

export function windowSliceFor(
  period: WindowPeriod,
  today: string,
  all: WeightReading[],
): WeightReading[] {
  const lower = lowerLogDateFor(period, today);
  return all
    .filter((r) => r.log_date >= lower && r.log_date <= today)
    .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
}

export function intraDayRangeFor(
  slice: WeightReading[],
  today: string,
  tz: string,
): number | null {
  const todays = slice.filter(
    (r) => isoDateInTz(new Date(r.recorded_at), tz) === today,
  );
  if (todays.length === 0) return null;
  const values = todays.map((r) => r.value);
  return Math.max(...values) - Math.min(...values);
}
