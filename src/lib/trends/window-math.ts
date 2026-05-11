// Window-math helpers for vital trend pages. Hoisted out of
// WeightTrendView + Spo2TrendView at the third invocation (HR / BP /
// pillows), per CLAUDE.md rule-of-three. No React imports — pure module,
// safe in client + server bundles.
//
// One in-flight fix: dayTimeLabel takes `today` (a patient-tz YYYY-MM-DD)
// as an argument instead of computing it from `Date.now()` (the
// caregiver-tz current time). Closes the bug where caregiver and patient
// in different timezones see "Today" / "Yesterday" labels off by ±1 day.

import { isoFromWallClock } from '@/lib/dates/from-wall-clock';
import { isoOffset } from '@/lib/dates/iso-offset';
import type { WindowPeriod } from './vital-reading';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function windowSpanMs(period: WindowPeriod): number {
  switch (period) {
    case 'D':
      return DAY_MS;
    case 'W':
      return 7 * DAY_MS;
    case 'M':
      return 30 * DAY_MS;
    case '6M':
      return 182 * DAY_MS;
    case 'Y':
      return 365 * DAY_MS;
  }
}

// End-of-day midnight in patient tz, given a YYYY-MM-DD calendar date.
export function endOfDayMs(dayIso: string, tz: string): number {
  const next = isoOffset(dayIso, 1);
  const iso = isoFromWallClock(`${next}T00:00`, tz);
  return iso ? Date.parse(iso) : Date.now();
}

// End of the (Sun-Sat) week containing dayIso = next Sunday midnight.
export function endOfWeekMs(dayIso: string, tz: string): number {
  const dow = dowOfDay(dayIso, tz); // 0 = Sun, 6 = Sat
  const daysToNextSun = dow === 0 ? 7 : 7 - dow;
  const nextSun = isoOffset(dayIso, daysToNextSun);
  const iso = isoFromWallClock(`${nextSun}T00:00`, tz);
  return iso ? Date.parse(iso) : Date.now();
}

// End of the calendar month containing dayIso = first of next month.
export function endOfMonthMs(dayIso: string, tz: string): number {
  const [y, m] = dayIso.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const firstOfNext = `${ny}-${String(nm).padStart(2, '0')}-01`;
  const iso = isoFromWallClock(`${firstOfNext}T00:00`, tz);
  return iso ? Date.parse(iso) : Date.now();
}

export function isoDateOf(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

export function dowOfDay(dayIso: string, tz: string): number {
  const d = new Date(`${dayIso}T12:00:00Z`);
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

// Default end-of-window for the given period. Always anchors to today
// (NOT the latest reading's date) — the page should open on the
// caregiver's current window so "is there a reading today?" is
// immediately answerable. Prior behavior dragged the chart to the
// week-of-the-last-reading; if the latest reading was 3 weeks old, the
// page opened on a 3-week-old chart. Scrubbing back still works.
export function defaultEndForPeriod(
  period: WindowPeriod,
  today: string,
  tz: string,
): number {
  switch (period) {
    case 'D':
      return endOfDayMs(today, tz);
    case 'W':
      return endOfWeekMs(today, tz);
    case 'M':
      return endOfMonthMs(today, tz);
    case '6M':
    case 'Y':
      return endOfDayMs(today, tz);
  }
}

// Smallest valid endMs — clamped so the user can't scrub to a window
// that no longer contains any data.
export function backwardBoundForPeriod(
  period: WindowPeriod,
  oldestMs: number | null,
  today: string,
  tz: string,
): number {
  if (oldestMs === null) return endOfDayMs(today, tz);
  const dayIso = isoDateOf(oldestMs, tz);
  switch (period) {
    case 'D':
      return endOfDayMs(dayIso, tz);
    case 'W':
      return endOfWeekMs(dayIso, tz);
    case 'M':
      return endOfMonthMs(dayIso, tz);
    case '6M':
    case 'Y':
      return endOfDayMs(dayIso, tz);
  }
}

// Largest valid endMs — clamped so the user can't scrub past today
// (or, for D/W/M, past the end of today's day/week/month).
export function forwardBoundForPeriod(
  period: WindowPeriod,
  today: string,
  tz: string,
): number {
  switch (period) {
    case 'D':
      return endOfDayMs(today, tz);
    case 'W':
      return endOfWeekMs(today, tz);
    case 'M':
      return endOfMonthMs(today, tz);
    case '6M':
    case 'Y':
      return endOfDayMs(today, tz);
  }
}

// ─── X labels ──────────────────────────────────────────────────────────────

// Generate labels anchored to REAL CALENDAR INSTANTS (real midnight,
// real 6 AM, real Sunday). As the window pans, the labels' x positions
// shift continuously — so the gridlines visually "slide" with the data
// instead of staying at fixed fractions while the dots fly past.
export function xLabelsFor(
  period: WindowPeriod,
  endMs: number,
  tz: string,
): { x: number; label: string }[] {
  const span = windowSpanMs(period);
  const startMs = endMs - span;
  if (period === 'D') {
    return anchorsAtWallClockHours(startMs, endMs, tz, [0, 6, 12, 18], hourLabel);
  }
  if (period === 'W') {
    return anchorsAtMidnights(startMs, endMs, tz, weekdayLabel);
  }
  if (period === 'M') {
    return anchorsOnDayOfWeek(startMs, endMs, tz, 0, shortDateLabel);
  }
  // 6M and Y: anchor to first of each month.
  return anchorsAtMonthStarts(startMs, endMs, tz, monthLabel);
}

function anchorsAtWallClockHours(
  startMs: number,
  endMs: number,
  tz: string,
  hours: number[],
  fmt: (ms: number, tz: string) => string,
): { x: number; label: string }[] {
  const startDayIso = isoDateOf(startMs, tz);
  const span = endMs - startMs;
  const out: { x: number; label: string }[] = [];
  for (let dayOffset = -1; dayOffset <= 2; dayOffset++) {
    const dayIso = isoOffset(startDayIso, dayOffset);
    for (const h of hours) {
      const wallClock = `${dayIso}T${String(h).padStart(2, '0')}:00`;
      const iso = isoFromWallClock(wallClock, tz);
      if (!iso) continue;
      const ms = Date.parse(iso);
      if (ms >= startMs && ms <= endMs) {
        out.push({ x: (ms - startMs) / span, label: fmt(ms, tz) });
      }
    }
  }
  return out;
}

function anchorsAtMidnights(
  startMs: number,
  endMs: number,
  tz: string,
  fmt: (ms: number, tz: string) => string,
): { x: number; label: string }[] {
  const startDayIso = isoDateOf(startMs, tz);
  const span = endMs - startMs;
  const out: { x: number; label: string }[] = [];
  for (let dayOffset = 0; dayOffset <= 9; dayOffset++) {
    const dayIso = isoOffset(startDayIso, dayOffset);
    const iso = isoFromWallClock(`${dayIso}T00:00`, tz);
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (ms >= startMs && ms <= endMs) {
      out.push({ x: (ms - startMs) / span, label: fmt(ms, tz) });
    }
  }
  return out;
}

function anchorsOnDayOfWeek(
  startMs: number,
  endMs: number,
  tz: string,
  targetDow: number, // 0 = Sun, 6 = Sat
  fmt: (ms: number, tz: string) => string,
): { x: number; label: string }[] {
  const startDayIso = isoDateOf(startMs, tz);
  const span = endMs - startMs;
  const out: { x: number; label: string }[] = [];
  for (let dayOffset = 0; dayOffset <= 32; dayOffset++) {
    const dayIso = isoOffset(startDayIso, dayOffset);
    const dow = dowOfDay(dayIso, tz);
    if (dow !== targetDow) continue;
    const iso = isoFromWallClock(`${dayIso}T00:00`, tz);
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (ms >= startMs && ms <= endMs) {
      out.push({ x: (ms - startMs) / span, label: fmt(ms, tz) });
    }
  }
  return out;
}

function anchorsAtMonthStarts(
  startMs: number,
  endMs: number,
  tz: string,
  fmt: (ms: number, tz: string) => string,
): { x: number; label: string }[] {
  const span = endMs - startMs;
  const out: { x: number; label: string }[] = [];
  const startDayIso = isoDateOf(startMs, tz);
  const [y, m] = startDayIso.split('-').map(Number);
  for (let i = 0; i <= 14; i++) {
    const targetMonth0 = m - 1 + i;
    const targetY = y + Math.floor(targetMonth0 / 12);
    const targetM = (targetMonth0 % 12) + 1;
    const dayIso = `${targetY}-${String(targetM).padStart(2, '0')}-01`;
    const iso = isoFromWallClock(`${dayIso}T00:00`, tz);
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (ms >= startMs && ms <= endMs) {
      out.push({ x: (ms - startMs) / span, label: fmt(ms, tz) });
    }
  }
  return out;
}

export function hourLabel(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: true,
  }).format(new Date(ms));
}

export function weekdayLabel(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  }).format(new Date(ms));
}

export function shortDateLabel(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
  }).format(new Date(ms));
}

export function monthLabel(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
  }).format(new Date(ms));
}

// ─── Subhead ─────────────────────────────────────────────────────────────────

export function subheadFor(
  period: WindowPeriod,
  startMs: number,
  endMs: number,
  tz: string,
  today: string,
): string {
  if (period === 'D') {
    // D windows span 24h. Label by the calendar day of the START
    // (midnight of that day to midnight of the next). The old
    // "Today, 12 AM – May 11, 12 AM" copy was technically accurate but
    // visually noisy — every D-window subhead read this way.
    const startDayIso = isoDateOf(startMs, tz);
    const yesterday = isoOffset(today, -1);
    if (startDayIso === today) return 'Today';
    if (startDayIso === yesterday) return 'Yesterday';
    return shortDateLabel(startMs, tz);
  }
  return `${shortDateLabel(startMs, tz)} – ${shortDateLabel(endMs, tz)}`;
}

// "Yesterday, 9 AM" / "Today, 11 PM" / "May 5, 9 AM"
//
// `today` is the patient-tz YYYY-MM-DD passed down from the server
// component, so caregiver-tz vs patient-tz mismatches don't shift the
// labels by ±1 day.
export function dayTimeLabel(ms: number, tz: string, today: string): string {
  const dayKey = isoDateOf(ms, tz);
  const yesterdayKey = isoOffset(today, -1);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: true,
  }).format(new Date(ms));
  if (dayKey === today) return `Today, ${time}`;
  if (dayKey === yesterdayKey) return `Yesterday, ${time}`;
  return `${shortDateLabel(ms, tz)}, ${time}`;
}
