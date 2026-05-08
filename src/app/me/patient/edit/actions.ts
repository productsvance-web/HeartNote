'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

// Phone is stored verbatim — Supabase doesn't validate format. We strip
// non-digits/+/() characters at write time so tel: links work
// regardless of how the caregiver typed it ("1 (800) 555-1234" → "+18005551234").
function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Keep digits and a single leading +. Strip everything else.
  const digitsOnly = trimmed.replace(/[^\d+]/g, '').replace(/\+(?=.*\+)/g, '');
  return digitsOnly.length > 0 ? digitsOnly : null;
}

const PayloadSchema = z.object({
  patientId: z.string().uuid(),
  displayName: z.string().trim().min(1, 'Patient name is required.').max(120),
  relationship: z.string().trim().max(60),
  dryWeightLb: z
    .number()
    .finite()
    .min(50, 'Below 50 lb seems too low — double-check.')
    .max(800, 'Above 800 lb seems too high — double-check.')
    .nullable(),
  nyhaClass: z.enum(['I', 'II', 'III', 'IV', 'unknown']).nullable(),
  cardiologistName: z.string().trim().max(120),
  cardiologistPhone: z.string().trim().max(40),
  normalPillowCount: z.number().int().min(0).max(10).nullable(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker for date of birth.')
    .nullable(),
});

export type SavePatientPayload = z.infer<typeof PayloadSchema>;

export async function savePatient(
  payload: SavePatientPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Verify ownership (RLS would block writes from other caregivers but
  // surfacing a friendly error beats a 500).
  const { data: patient } = await supabase
    .from('patients')
    .select('caregiver_id')
    .eq('id', data.patientId)
    .single();
  if (!patient || patient.caregiver_id !== user.id) {
    return { ok: false, error: 'Not your patient.' };
  }

  const { error } = await supabase
    .from('patients')
    .update({
      display_name: data.displayName,
      relationship: data.relationship.length > 0 ? data.relationship : null,
      dry_weight_lb: data.dryWeightLb,
      nyha_class: data.nyhaClass,
      cardiologist_name: data.cardiologistName.length > 0 ? data.cardiologistName : null,
      cardiologist_phone: normalizePhone(data.cardiologistPhone),
      normal_pillow_count: data.normalPillowCount,
      date_of_birth: data.dateOfBirth,
    })
    .eq('id', data.patientId);
  if (error) return { ok: false, error: error.message };

  // Patient baselines feed the dashboard tier, the meds card patient name,
  // and the alert CTA. Revalidate the surfaces that read patient fields.
  revalidatePath('/me');
  revalidatePath('/dashboard');
  revalidatePath('/log');
  revalidatePath('/trends');
  return { ok: true };
}
