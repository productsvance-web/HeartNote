// Convert a wall-clock "YYYY-MM-DDTHH:MM" string + IANA tz into a UTC ISO
// timestamp. Two-pass correction handles DST transitions: anchor on the
// naive UTC, read what that wall-clock would render in the target tz,
// adjust, repeat once more for safety. Used by /trends/weight when the
// caregiver picks a date+time to backdate a reading.

export function isoFromWallClock(local: string, tz: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);

  let utc = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(utc));
    const part = (t: string) =>
      Number(parts.find((p) => p.type === t)?.value ?? '0');
    const wy = part('year');
    const wm = part('month');
    const wd = part('day');
    let wh = part('hour');
    if (wh === 24) wh = 0; // some Intl outputs encode midnight as 24
    const wmin = part('minute');
    const desired = Date.UTC(y, mo - 1, d, h, mi);
    const got = Date.UTC(wy, wm - 1, wd, wh, wmin);
    utc += desired - got;
  }
  return new Date(utc).toISOString();
}
