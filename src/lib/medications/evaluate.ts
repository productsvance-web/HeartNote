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

export interface MedAdherenceRow {
  medicationId: string;
  drugName: string;
  drugClass: MedClass;
  dosesPerDay: number | null;     // null = PRN; isComplete is meaningless
  scheduleTimes: string[] | null; // when set, length === dosesPerDay
  takenToday: number;
  isComplete: boolean;            // false for PRN
}

interface AdherenceRpcRow {
  medication_id: string;
  drug_name: string;
  drug_class: MedClass;
  doses_per_day: number | null;
  schedule_times: string[] | null;
  taken_today: number;
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
    takenToday: row.taken_today,
    isComplete:
      row.doses_per_day !== null && row.taken_today >= row.doses_per_day,
  }));
}
