// 14-day adherence loader for the visit-handoff PDF.
//
// Calls `medication_adherence_for_day` once per day in the window and folds
// the per-day rows into per-med cell arrays. The RPC's per-day payload is
// already cadence-aware (returns `doses_per_day` for the day and a
// `slots_resolved` count) so we don't re-implement schedule logic here —
// only the visual mapping (all-taken / partial / refused / no-log / off-day).

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

type Client = SupabaseClient<Database>;

export const ADHERENCE_WINDOW_DAYS = 14;

export type AdherenceCell =
  | 'all_taken'
  | 'partial'
  | 'refused'
  | 'no_log'
  | 'not_scheduled';

export interface AdherenceWindow {
  // Oldest-first list of ISO dates in the window (length = 14).
  days: string[];
  // medication_id → 14 cell states aligned to `days`.
  byMed: Map<string, AdherenceCell[]>;
  // medication_id → window totals (sum across the 14 days).
  totalsByMed: Map<string, { taken: number; expected: number }>;
}

export async function loadAdherenceForWindow(
  supabase: Client,
  patientId: string,
  windowEndIso: string,
  tz: string,
): Promise<AdherenceWindow> {
  const days: string[] = [];
  for (let i = ADHERENCE_WINDOW_DAYS - 1; i >= 0; i--) {
    days.push(isoDateOffset(windowEndIso, -i));
  }

  const perDay = await Promise.all(
    days.map((d) =>
      supabase.rpc('medication_adherence_for_day', {
        p_patient_id: patientId,
        p_date: d,
        p_tz: tz,
      }),
    ),
  );

  const byMed = new Map<string, AdherenceCell[]>();
  const totalsByMed = new Map<string, { taken: number; expected: number }>();

  perDay.forEach(({ data: rows }, dayIndex) => {
    for (const row of rows ?? []) {
      const cells = byMed.get(row.medication_id) ?? new Array<AdherenceCell>(
        ADHERENCE_WINDOW_DAYS,
      ).fill('not_scheduled');
      cells[dayIndex] = cellStateFor(row);
      byMed.set(row.medication_id, cells);

      const totals = totalsByMed.get(row.medication_id) ?? { taken: 0, expected: 0 };
      totals.taken += row.slots_resolved ?? 0;
      totals.expected += row.doses_per_day ?? 0;
      totalsByMed.set(row.medication_id, totals);
    }
  });

  return { days, byMed, totalsByMed };
}

function cellStateFor(row: {
  doses_per_day: number | null;
  slots_resolved: number | null;
  events: unknown;
}): AdherenceCell {
  const expected = row.doses_per_day ?? 0;
  const taken = row.slots_resolved ?? 0;
  if (expected === 0) return 'not_scheduled';
  if (hasRefusedEvent(row.events)) return 'refused';
  if (taken === 0) return 'no_log';
  if (taken >= expected) return 'all_taken';
  return 'partial';
}

function hasRefusedEvent(events: unknown): boolean {
  if (!Array.isArray(events)) return false;
  return events.some((e) => {
    if (e === null || typeof e !== 'object') return false;
    const status = (e as { status?: unknown }).status;
    return status === 'refused';
  });
}

function isoDateOffset(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
