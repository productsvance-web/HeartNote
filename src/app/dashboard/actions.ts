'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';

const UuidSchema = z.string().uuid();

// Manual dose confirmation always anchors `actual_taken_at` to "now". A
// timestamp picker (for backdating a dose given earlier in the day) is
// deferred — when added, expose it in the confirm sheet and accept the
// value here. Voice-log path (process.ts) anchors to log.created_at; this
// path anchors to the tap moment. Both honor the spirit of architectural
// decision #6 (the calendar-day anchor reflects when the dose actually
// happened relative to the caregiver's intent).
//
// `'missed'` is intentionally absent from the manual-tap surface: the
// implicit signal of "no event logged today" is acceptable for trend
// analysis. Voice-log path can still emit `'missed'` from transcript
// phrases like "I forgot her meds."
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
    .select('patient_id, stopped_at, doses_per_day')
    .eq('id', parsed.data.medicationId)
    .single();
  if (!med) return { ok: false, error: 'Medication not found.' };
  if (med.stopped_at) return { ok: false, error: 'This medication has been stopped.' };

  // Slot capacity gate. Only enforced for non-PRN meds (`doses_per_day`
  // non-null) AND non-Extra inserts (`double_dosed` is supernumerary).
  // Voice-log path inserts directly into medication_events and bypasses
  // this gate by design — voice records what was said happened, even when
  // that exceeds the schedule. The dashboard's `isOver` badge surfaces
  // any over-capacity state regardless of source.
  //
  // Advisory, not transactional: this is a read-then-insert pair, not a
  // single statement. Two near-simultaneous taps could both pass and both
  // insert. Practical risk is low — single caregiver per patient, the
  // client also mutes the buttons after the first tap — and the over-
  // capacity case surfaces in the UI via the existing `isOver` badge.
  // Stronger guarantees would require a unique partial index keyed on
  // (medication_id, day_in_tz) which we're not adding pre-launch.
  if (med.doses_per_day !== null && parsed.data.status !== 'double_dosed') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', user.id)
      .single();
    if (!profile?.timezone) {
      return { ok: false, error: 'Timezone not configured. Please refresh.' };
    }
    const today = getTodayInTimezone(profile.timezone);

    // Reuse the dashboard's adherence RPC so the displayed mute and the
    // server gate share one source of truth (the SQL `slots_resolved`
    // filter — see migration 20260502070034_medication_slots_resolved.sql).
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
    if (target && target.slots_resolved >= med.doses_per_day) {
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
