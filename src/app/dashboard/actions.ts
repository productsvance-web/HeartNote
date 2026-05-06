'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import {
  SLOT_CONSUMER_STATUSES,
  TAKEN_DOSE_STATUSES,
  type MedEventStatus,
} from '@/lib/medications/evaluate';

const UuidSchema = z.string().uuid();

// Manual dose confirmation always anchors `actual_taken_at` to "now". A
// timestamp picker (for backdating a dose given earlier in the day) is
// deferred — when added, expose it in the confirm sheet and accept the
// value here. Voice-log path (process.ts) anchors to log.created_at; this
// path anchors to the tap moment. Both honor the spirit of architectural
// decision #6 (the calendar-day anchor reflects when the dose actually
// happened relative to the caregiver's intent).
//
// `'missed'` is not part of the schema. Absence of a logged event is the
// implicit signal — neither manual taps nor voice-log emit a 'missed'
// status. The Postgres enum `med_event_status` does not include the value.
const ConfirmDoseSchema = z.object({
  medicationId: z.string().uuid(),
  status: z.enum(['taken', 'double_dosed', 'refused']),
  note: z.string().trim().max(500).optional(),
});

export type ConfirmDoseInput = z.infer<typeof ConfirmDoseSchema>;

export async function confirmDose(
  input: ConfirmDoseInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ConfirmDoseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Session expired. Please sign in again.' };

  // RLS on medications restricts this to the caregiver's own patient.
  const { data: med } = await supabase
    .from('medications')
    .select('patient_id, stopped_at')
    .eq('id', parsed.data.medicationId)
    .single();
  if (!med) return { ok: false, error: 'Medication not found.' };
  if (med.stopped_at) return { ok: false, error: 'This medication has been stopped.' };

  // Manual-tap server gates. Two rules:
  //   1. Slot capacity: Taken/Refused rejected once `slotsResolved >=
  //      dosesPerDay`. Forces caregiver to delete an event to change.
  //   2. Extra requires baseline doses: `'double_dosed'` rejected if any
  //      refused/missed entry exists today (Extra is supernumerary on top
  //      of regular doses; without baseline doses, "extra" is incoherent).
  //
  // Both gates read `doses_per_day` from the adherence RPC, which computes
  // it per-day cadence-aware (NULL for as_needed, count of dose-times due
  // today otherwise). Bypassed when the RPC returns null (PRN).
  //
  // Both gates are advisory (read-then-insert, not transactional). Voice-
  // log path bypasses both by design — voice records what was said
  // happened. The dashboard surfaces over-capacity via the `isOver` badge.
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single();
  if (!profile?.timezone) {
    return { ok: false, error: 'Timezone not configured. Please refresh.' };
  }
  const today = getTodayInTimezone(profile.timezone);

  const { data: rows, error: rpcError } = await supabase.rpc(
    'medication_adherence_for_day',
    {
      p_patient_id: med.patient_id,
      p_date: today,
      p_tz: profile.timezone,
    }
  );
  if (rpcError) return { ok: false, error: rpcError.message };

  const target = (rows ?? []).find(
    (r) => r.medication_id === parsed.data.medicationId
  );

  if (target && target.doses_per_day !== null) {
    if (parsed.data.status === 'double_dosed') {
      const events = (target.events ?? []) as Array<{ status: MedEventStatus }>;
      const hasSkipped = events.some(
        (e) =>
          SLOT_CONSUMER_STATUSES.has(e.status) &&
          !TAKEN_DOSE_STATUSES.has(e.status)
      );
      if (hasSkipped) {
        return {
          ok: false,
          error: 'Extra needs at least one taken dose first. Delete a refused entry to log Extra.',
        };
      }
    } else if (target.slots_resolved >= target.doses_per_day) {
      return {
        ok: false,
        error: 'This dose is already logged for today. Undo a logged event to change.',
      };
    }
  }

  const { error: insertError } = await supabase.from('medication_events').insert({
    patient_id: med.patient_id,
    medication_id: parsed.data.medicationId,
    status: parsed.data.status,
    actual_taken_at: new Date().toISOString(),
    notes: parsed.data.note || null,
  });
  if (insertError) return { ok: false, error: insertError.message };

  revalidatePath('/dashboard');
  return { ok: true };
}

export async function deleteDoseEvent(
  eventId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UuidSchema.safeParse(eventId).success) {
    return { ok: false, error: 'Invalid event id' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Session expired. Please sign in again.' };

  // RLS on medication_events filters to the caregiver's own patient.
  const { error } = await supabase.from('medication_events').delete().eq('id', eventId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard');
  return { ok: true };
}
