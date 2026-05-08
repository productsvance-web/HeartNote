// Caregiver-facing short date format used across home / trends / visits /
// shared snapshot. "May 14" — month abbreviation + day. UTC-grounded so
// the same ISO date renders identically regardless of viewer timezone.

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function formatShortDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function isoDateOffset(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

// Home-screen eyebrow date: "THURSDAY · MAY 7" in caregiver TZ.
// Anchored at noon UTC so the displayed date matches the input ISO string
// regardless of the caregiver's TZ offset (otherwise an Eastern caregiver
// reading "2026-05-07T00:00:00Z" would see "Wednesday May 6").
export function formatHeaderEyebrow(isoDate: string, tz: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: tz,
  }).formatToParts(d);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${weekday} · ${month} ${day}`.toUpperCase();
}
