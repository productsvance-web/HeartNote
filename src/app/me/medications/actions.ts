'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getTodayForCaregiver } from '@/lib/dates/today';
import { classifyDrugByName } from '@/lib/medications/classify';
import type { Database } from '@/lib/supabase/types';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MED_CLASS_VALUES: ReadonlyArray<Database['public']['Enums']['med_class']> = [
  'loop_diuretic',
  'ace_inhibitor',
  'arb',
  'arni',
  'beta_blocker',
  'mra',
  'sglt2_inhibitor',
  'digoxin',
  'antiarrhythmic',
  'anticoagulant_warfarin',
  'anticoagulant_doac',
  'potassium_supplement',
  'other',
];

const MedicationPayloadSchema = z
  .object({
    drugName: z.string().trim().min(1, 'Name is required').max(200),
    dose: z.string().trim().max(100).optional().or(z.literal('')),
    frequency: z.string().trim().max(200).optional().or(z.literal('')),
    // null = PRN (as-needed); otherwise 1-12 doses per day.
    dosesPerDay: z.number().int().min(1).max(12).nullable(),
    // null when caregiver doesn't know clock times; otherwise length must equal dosesPerDay
    scheduleTimes: z.array(z.string().regex(HH_MM, 'Times must be HH:MM')).nullable(),
    startedAt: z.string().optional(), // YYYY-MM-DD or empty
    notes: z.string().trim().max(1000).optional().or(z.literal('')),
    // Optional manual override of drug_class. When unset on add, server
    // classifies via RxNorm.
    drugClass: z.enum(MED_CLASS_VALUES).optional(),
  })
  .refine(
    (v) =>
      v.scheduleTimes === null || (v.dosesPerDay !== null && v.scheduleTimes.length === v.dosesPerDay),
    { message: 'Schedule times must match doses per day', path: ['scheduleTimes'] }
  );

export type MedicationPayload = z.infer<typeof MedicationPayloadSchema>;

type ActionResult =
  | { ok: false; error: string }
  | { ok: true };

async function resolvePatient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  caregiverId: string
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('patients')
    .select('id')
    .eq('caregiver_id', caregiverId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  return data;
}

export async function addMedication(payload: MedicationPayload): Promise<ActionResult> {
  const parsed = MedicationPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Session expired. Please sign in again.' };

  const patient = await resolvePatient(supabase, user.id);
  if (!patient) return { ok: false, error: 'No patient on file.' };

  const v = parsed.data;
  const drugClass = v.drugClass ?? (await classifyDrugByName(v.drugName)).medClass;

  const { data: inserted, error: insertError } = await supabase
    .from('medications')
    .insert({
      patient_id: patient.id,
      drug_name: v.drugName,
      drug_class: drugClass,
      dose: v.dose || null,
      frequency: v.frequency || null,
      doses_per_day: v.dosesPerDay,
      schedule_times: v.scheduleTimes,
      started_at: v.startedAt || null,
      notes: v.notes || null,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message ?? 'Insert failed' };
  }

  revalidatePath('/me/medications');
  revalidatePath('/dashboard');
  redirect(`/me/medications?added=${inserted.id}`);
}

export async function updateMedication(
  medicationId: string,
  payload: MedicationPayload,
  // True when the caregiver changed dosesPerDay during this edit; in that
  // case schedule_times is forced to null per architectural decision #12.
  dosesPerDayChanged: boolean
): Promise<ActionResult> {
  const parsed = MedicationPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Session expired. Please sign in again.' };

  const patient = await resolvePatient(supabase, user.id);
  if (!patient) return { ok: false, error: 'No patient on file.' };

  const v = parsed.data;
  const scheduleTimes = dosesPerDayChanged ? null : v.scheduleTimes;

  const { error: updateError } = await supabase
    .from('medications')
    .update({
      drug_name: v.drugName,
      drug_class: v.drugClass ?? 'other',
      dose: v.dose || null,
      frequency: v.frequency || null,
      doses_per_day: v.dosesPerDay,
      schedule_times: scheduleTimes,
      started_at: v.startedAt || null,
      notes: v.notes || null,
    })
    .eq('id', medicationId)
    .eq('patient_id', patient.id);

  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath('/me/medications');
  revalidatePath('/dashboard');
  redirect('/me/medications');
}

export async function stopMedication(medicationId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Session expired. Please sign in again.' };

  const today = await getTodayForCaregiver(supabase, user.id);
  const { error } = await supabase
    .from('medications')
    .update({ stopped_at: today })
    .eq('id', medicationId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/me/medications');
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function restartMedication(medicationId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Session expired. Please sign in again.' };

  const { error } = await supabase
    .from('medications')
    .update({ stopped_at: null })
    .eq('id', medicationId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/me/medications');
  revalidatePath('/dashboard');
  redirect(`/me/medications/${medicationId}`);
}
