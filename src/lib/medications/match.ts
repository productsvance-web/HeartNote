// Case-insensitive exact match on a patient's medication list. Used by the
// voice-log route after Claude extracts a medication_event with a stated drug
// name — the caller decides what to do based on isStopped.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

type Client = SupabaseClient<Database>;

export interface MatchedMed {
  medicationId: string;
  isStopped: boolean;
}

export async function matchMedByDrugName(
  supabase: Client,
  patientId: string,
  drugName: string
): Promise<MatchedMed | null> {
  const trimmed = drugName.trim();
  if (!trimmed) return null;

  // ilike without wildcards = case-insensitive exact equality.
  // Order so active matches return before stopped matches when a name has been
  // re-used (rare, but possible if a med was stopped and re-added).
  const { data } = await supabase
    .from('medications')
    .select('id, stopped_at')
    .eq('patient_id', patientId)
    .ilike('drug_name', trimmed)
    .order('stopped_at', { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    medicationId: data.id,
    isStopped: data.stopped_at !== null,
  };
}
