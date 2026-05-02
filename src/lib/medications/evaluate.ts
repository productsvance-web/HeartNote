// Per-medication adherence detail for one calendar day in the patient's
// timezone. Used by the dashboard's TodaysMedsCard. Future PR 2 (habit tile)
// will derive its aggregate "is the medication row complete today?" from the
// same data.
//
// Single round-trip: calls the medication_adherence_for_day RPC which does
// the AT-TIME-ZONE date math server-side (avoids JS DST/offset bugs).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

type Client = SupabaseClient<Database>;
type MedClass = Database['public']['Enums']['med_class'];

export type MedEventStatus = 'taken' | 'missed' | 'double_dosed' | 'refused' | 'early' | 'late';

// Slot consumers — the statuses that resolve a dose slot for the day. `double_dosed`
// (Extra) is intentionally excluded: it's an additional dose on top of the schedule,
// not a slot resolution. Single source of truth for the slot-fill predicate.
//
// Two TS consumers: `applyOptimistic` in TodaysMedsList (client count math) and
// `confirmDose` in dashboard/actions.ts (server slot-capacity gate).
//
// SQL mirror: `medication_adherence_for_day` filters with
// `e.status <> 'double_dosed'`. If the enum gains a new terminal status, update
// both the set below and the migration filter.
export const SLOT_CONSUMER_STATUSES: ReadonlySet<MedEventStatus> = new Set([
  'taken',
  'missed',
  'refused',
  'early',
  'late',
]);

export interface MedAdherenceEvent {
  id: string;
  status: MedEventStatus;
  actual_taken_at: string;
  notes: string | null;
}

export interface MedAdherenceRow {
  medicationId: string;
  drugName: string;
  drugClass: MedClass;
  dosesPerDay: number | null;     // null = PRN; isComplete is meaningless
  scheduleTimes: string[] | null; // when set, length === dosesPerDay (still
                                  // stored in DB even though the dashboard
                                  // card no longer renders per-slot status)
  // Count of today's events whose status resolves a slot (any terminal status
  // except `double_dosed`). Drives the dashboard numerator and the slot-mute
  // UI on Taken/Refused. NOT adherence math — see migration comment.
  slotsResolved: number;
  isComplete: boolean;            // false for PRN
  // Today's events ordered desc by actual_taken_at. Used by the dashboard
  // expansion's "Today's doses" list with per-event delete.
  events: MedAdherenceEvent[];
}

interface AdherenceRpcRow {
  medication_id: string;
  drug_name: string;
  drug_class: MedClass;
  doses_per_day: number | null;
  schedule_times: string[] | null;
  slots_resolved: number;
  events: MedAdherenceEvent[];
}

export async function evaluateMedAdherenceForDay(
  supabase: Client,
  patientId: string,
  dateInTz: { date: string; tz: string }
): Promise<MedAdherenceRow[]> {
  const { data, error } = await supabase.rpc('medication_adherence_for_day', {
    p_patient_id: patientId,
    p_date: dateInTz.date,
    p_tz: dateInTz.tz,
  });
  if (error) throw new Error(`evaluateMedAdherenceForDay: ${error.message}`);

  const rows = (data ?? []) as unknown as AdherenceRpcRow[];
  return rows.map((row) => ({
    medicationId: row.medication_id,
    drugName: row.drug_name,
    drugClass: row.drug_class,
    dosesPerDay: row.doses_per_day,
    scheduleTimes: row.schedule_times,
    slotsResolved: row.slots_resolved,
    isComplete:
      row.doses_per_day !== null && row.slots_resolved >= row.doses_per_day,
    events: row.events ?? [],
  }));
}
