'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// Manual dose confirmation always anchors `actual_taken_at` to "now". A
// timestamp picker (for backdating a dose given earlier in the day) is
// deferred — when added, expose it in the confirm sheet and accept the
// value here. Voice-log path (process.ts) anchors to log.created_at; this
// path anchors to the tap moment. Both honor the spirit of architectural
// decision #6 (the calendar-day anchor reflects when the dose actually
// happened relative to the caregiver's intent).
const ConfirmDoseSchema = z.object({
  medicationId: z.string().uuid(),
  status: z.enum(['taken', 'missed', 'double_dosed', 'refused']),
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
