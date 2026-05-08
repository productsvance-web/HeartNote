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

// Minutes between `nowMs` and "today HH:MM" in caregiver TZ.
// Negative when the time has already passed today. Used by the meds
// "Due in {N}m" / "Past due {time}" ticker.
//
// DST-safe: when the wall-clock straddles a spring-forward / fall-back,
// the iterative converger walks the candidate UTC instant until the
// formatted output matches the requested wall-clock.
export function minutesUntilWallClock(
  hhmm: string,
  todayIso: string,
  tz: string,
  nowMs: number,
): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Number.POSITIVE_INFINITY;
  const targetMs = wallClockToUtcMs(todayIso, h, m, tz);
  return Math.round((targetMs - nowMs) / 60_000);
}

function wallClockToUtcMs(isoDate: string, hour: number, minute: number, tz: string): number {
  let candidateMs = new Date(
    `${isoDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
  ).getTime();
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz,
    }).formatToParts(new Date(candidateMs));
    const observedH = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const observedM = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    const driftMin = (hour - observedH) * 60 + (minute - observedM);
    if (driftMin === 0) break;
    candidateMs += driftMin * 60_000;
  }
  return candidateMs;
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
