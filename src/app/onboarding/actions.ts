'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const PayloadSchema = z.object({
  displayName: z.string().min(1).max(80),
  timezone: z.string().min(1).max(64),
  patient: z.object({
    displayName: z.string().min(1).max(80),
    relationship: z.string().min(1).max(40),
    dryWeightLb: z.number().positive().max(800).nullable(),
    nyhaClass: z.enum(['I', 'II', 'III', 'IV', 'unknown']),
    cardiologistName: z.string().max(120),
    cardiologistPhone: z.string().max(40),
    normalPillowCount: z.number().int().min(0).max(6),
    hfHospitalizationCount: z.number().int().min(0).max(50),
  }),
});

export type OnboardingPayload = z.infer<typeof PayloadSchema>;

export async function completeOnboarding(
  payload: OnboardingPayload
): Promise<{ ok: false; error: string }> {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Some fields look invalid. Please check and try again.' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Session expired. Please sign in again.' };
  }

  const data = parsed.data;

  // 1. Update the caregiver profile
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      display_name: data.displayName,
      timezone: data.timezone,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (profileError) {
    return { ok: false, error: profileError.message };
  }

  // 2. Create the patient row
  const { error: patientError } = await supabase.from('patients').insert({
    caregiver_id: user.id,
    display_name: data.patient.displayName,
    relationship: data.patient.relationship,
    dry_weight_lb: data.patient.dryWeightLb,
    nyha_class: data.patient.nyhaClass,
    cardiologist_name: data.patient.cardiologistName || null,
    cardiologist_phone: data.patient.cardiologistPhone || null,
    normal_pillow_count: data.patient.normalPillowCount,
    hf_hospitalization_count: data.patient.hfHospitalizationCount,
  });

  if (patientError) {
    // Roll back profile completion so the user can retry.
    await supabase
      .from('profiles')
      .update({ onboarding_completed_at: null })
      .eq('id', user.id);
    return { ok: false, error: patientError.message };
  }

  redirect('/dashboard');
}
