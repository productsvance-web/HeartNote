// Aggregate cough events into the 4 (morning/afternoon/evening/nocturnal)
// buckets per day for the last 14 days. The classifier reads the
// `nocturnal` boolean directly; daytime split is by hour-of-day on the
// caregiver's timezone.
//
// Each cell is tagged `logged: boolean` so the heatmap can distinguish
// "this day was logged with no cough" from "no log existed for this
// day at all" — phantom-quiet days for brand-new patients were the
// failure mode that motivated this column.
//
// Cited: research/chf-source-of-truth.md §5 (nocturnal cough late-stage
// decompensation marker) and docs/specs/cough-heatmap.md (encoding).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CoughCell } from '@/components/heartnote/CoughHeatmap';

const TRENDS_LOOKBACK_DAYS = 14;

export async function getCoughHeatmapCells(
  supabase: SupabaseClient,
  patientId: string,
  today: string,
  tz: string,
): Promise<CoughCell[]> {
  const start = isoDateOffset(today, -(TRENDS_LOOKBACK_DAYS - 1));
  const [eventsQ, logsQ] = await Promise.all([
    supabase
      .from('daily_log_symptom_events')
      .select('log_date, recorded_at, nocturnal, present')
      .eq('patient_id', patientId)
      .eq('symptom', 'cough')
      .eq('present', true)
      .gte('log_date', start)
      .lte('log_date', today),
    supabase
      .from('daily_logs')
      .select('log_date')
      .eq('patient_id', patientId)
      .gte('log_date', start)
      .lte('log_date', today),
  ]);

  const loggedDates = new Set(
    (logsQ.data ?? []).map((r) => r.log_date as string),
  );

  // Initialize an empty cell per day in the window. `logged` reflects the
  // actual daily_logs presence so the renderer can paint unlogged days
  // differently from logged-but-quiet days.
  const cells: CoughCell[] = [];
  for (let i = 0; i < TRENDS_LOOKBACK_DAYS; i++) {
    const date = isoDateOffset(start, i);
    cells.push({
      date,
      logged: loggedDates.has(date),
      morning: 0,
      afternoon: 0,
      evening: 0,
      nocturnal: 0,
    });
  }
  const byDate = new Map<string, CoughCell>(cells.map((c) => [c.date, c]));

  for (const ev of (eventsQ.data ?? []) as {
    log_date: string;
    recorded_at: string | null;
    nocturnal: boolean | null;
  }[]) {
    const cell = byDate.get(ev.log_date);
    if (!cell) continue;

    if (ev.nocturnal === true) {
      cell.nocturnal = clamp(cell.nocturnal + 1);
      continue;
    }

    const bucket = bucketForRecordedAt(ev.recorded_at, tz);
    if (bucket === 'morning') cell.morning = clamp(cell.morning + 1);
    else if (bucket === 'afternoon') cell.afternoon = clamp(cell.afternoon + 1);
    else cell.evening = clamp(cell.evening + 1);
  }

  return cells;
}

function bucketForRecordedAt(
  recordedAt: string | null,
  tz: string,
): 'morning' | 'afternoon' | 'evening' {
  if (!recordedAt) return 'afternoon';
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: tz,
      }).format(new Date(recordedAt)),
    );
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  } catch {
    return 'afternoon';
  }
}

// Spec clamps anything ≥3 to "3+" — the chart doesn't distinguish 3 from 7.
function clamp(n: number): number {
  return n > 3 ? 3 : n;
}

function isoDateOffset(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
