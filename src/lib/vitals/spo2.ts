// SpO2 trend data helpers.
//
// Bins by `log_date` (caregiver-local-correct via the voice-log RPC), not
// `recorded_at`. A reading at 11:55pm patient-local appears in that day's
// band, not the next day's.
//
// v1: descriptive only — no zone classification, no status word. Zone tints
// and "call cardiologist today / 911" copy land when the alert engine ships,
// alongside the re-measure caveat (cold fingers / nail polish / poor
// perfusion → false lows; research/chf-source-of-truth.md).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

type Client = SupabaseClient<Database>;

export type Spo2Reading = {
  log_date: string;     // YYYY-MM-DD, caregiver-local
  recorded_at: string;  // ISO timestamp
  value: number;        // SpO2 %
};

export type Spo2DayBand = {
  log_date: string;     // YYYY-MM-DD
  readings: number[];   // ordered earliest → latest by recorded_at
};

export type Spo2Trend = {
  // Days array, length = windowDays, oldest → newest, today is the last entry.
  // Days with no readings have an empty `readings` array.
  days: Spo2DayBand[];
  // Most recent reading anywhere in the fetch window (last 30 days),
  // null if nothing in that window.
  latest: Spo2Reading | null;
  // Distinct days with ≥1 reading in the days[] window.
  daysLogged: number;
};

const FETCH_WINDOW_DAYS = 30;

export async function getSpo2Trend(
  supabase: Client,
  patientId: string,
  today: string,
  windowDays: number,
): Promise<Spo2Trend> {
  if (windowDays < 1 || windowDays > FETCH_WINDOW_DAYS) {
    throw new Error(
      `getSpo2Trend: windowDays must be 1..${FETCH_WINDOW_DAYS}, got ${windowDays}`,
    );
  }

  const fetchStart = subtractDaysUTC(today, FETCH_WINDOW_DAYS - 1);

  const { data, error } = await supabase
    .from('daily_log_readings')
    .select('log_date, recorded_at, value')
    .eq('patient_id', patientId)
    .eq('field', 'spo2')
    .gte('log_date', fetchStart)
    .lte('log_date', today)
    .order('log_date', { ascending: true })
    .order('recorded_at', { ascending: true });

  if (error) {
    throw new Error(`getSpo2Trend: ${error.message}`);
  }

  const readings: Spo2Reading[] = (data ?? []).map((r) => ({
    log_date: r.log_date,
    recorded_at: r.recorded_at,
    value: Number(r.value),
  }));

  const windowStart = subtractDaysUTC(today, windowDays - 1);
  const days = buildDayBands(readings, windowStart, today);
  const daysLogged = days.filter((d) => d.readings.length > 0).length;

  // Latest reading across the full fetch window (not just `days`), so the
  // dashboard's "is the latest within the staleness window?" check has the
  // right answer even if the displayed window is shorter.
  const latest =
    readings.length > 0
      ? readings.reduce((a, b) =>
          a.recorded_at >= b.recorded_at ? a : b,
        )
      : null;

  return { days, latest, daysLogged };
}

// Build N day-bands from `start` (inclusive) to `end` (inclusive). Both
// strings are YYYY-MM-DD, treated as calendar dates.
function buildDayBands(
  readings: Spo2Reading[],
  start: string,
  end: string,
): Spo2DayBand[] {
  const grouped = new Map<string, number[]>();
  for (const r of readings) {
    const list = grouped.get(r.log_date) ?? [];
    list.push(r.value);
    grouped.set(r.log_date, list);
  }

  const out: Spo2DayBand[] = [];
  let cursor = start;
  // Loop guard: max 365 to prevent runaway from a malformed input.
  for (let i = 0; i < 365; i++) {
    out.push({ log_date: cursor, readings: grouped.get(cursor) ?? [] });
    if (cursor === end) return out;
    cursor = addDaysUTC(cursor, 1);
  }
  throw new Error(`buildDayBands: window exceeds 365 days (${start} → ${end})`);
}

// UTC arithmetic on YYYY-MM-DD calendar strings. We use UTC to dodge DST
// shifts; the strings are TZ-agnostic calendar dates and only need calendar
// arithmetic, never wall-clock conversion.
function addDaysUTC(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function subtractDaysUTC(dateStr: string, days: number): string {
  return addDaysUTC(dateStr, -days);
}
