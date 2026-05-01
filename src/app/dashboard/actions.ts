'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const ConfirmDoseSchema = z.object({
  medicationId: z.string().uuid(),
  status: z.enum(['taken', 'missed', 'double_dosed', 'refused']),
  // ISO datetime string. Defaults to now on the server when omitted.
  takenAt: z.string().min(1).optional(),
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
    actual_taken_at: parsed.data.takenAt ?? new Date().toISOString(),
    notes: parsed.data.note || null,
  });
  if (insertError) return { ok: false, error: insertError.message };

  revalidatePath('/dashboard');
  return { ok: true };
}
