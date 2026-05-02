'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getTodayForCaregiver } from '@/lib/dates/today';
import { classifyDrugByName, type AllowedStrengths } from '@/lib/medications/classify';
import { MED_CLASS_VALUES } from '@/lib/medications/classes';

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

// `<number> <unit>` with the unit drawn from a closed list of forms a
// caregiver might reasonably enter. Catches "lots", "10x", "small dose"
// at the format layer; semantic checks (is the unit class right for this
// drug?) happen against allowed_strengths below.
const DOSE_FORMAT =
  /^\s*(\d+(?:\.\d+)?)\s*(mg|mcg|g|kg|ng|ml|l|units?|tablets?|capsules?|caps?|puffs?|drops?|tsp|tbsp|sprays?|patches?|meq)\s*$/i;

function normalizeUnit(u: string): string {
  return u.toLowerCase().replace(/[.\s]/g, '').replace(/s$/, '');
}

// Returns null when the user's dose is acceptable, an error string otherwise.
// Soft-skip when allowedStrengths is null (drug uncategorized — no validation).
function validateDoseAgainstStrengths(
  dose: string,
  drugName: string,
  allowed: AllowedStrengths | null | undefined
): string | null {
  if (!allowed) return null;
  const m = DOSE_FORMAT.exec(dose);
  if (!m) return null; // format error already caught by Zod
  const userUnit = normalizeUnit(m[2]);
  const allowedUnit = normalizeUnit(allowed.unit);
  if (userUnit === allowedUnit) return null;
  const sample = allowed.values.slice(0, 3).map((v) => `${v} ${allowed.unit.toLowerCase()}`).join(', ');
  return `${drugName} is typically given in ${allowed.unit.toLowerCase()} (e.g. ${sample}), not ${m[2]}. Edit the dose and save again.`;
}

const MedicationPayloadSchema = z
  .object({
    drugName: z.string().trim().min(1, 'Name is required').max(200),
    dose: z
      .string()
      .trim()
      .max(100)
      .optional()
      .or(z.literal(''))
      .refine((v) => !v || DOSE_FORMAT.test(v), {
        message: 'Dose must be a number and unit, e.g. "40 mg" or "1 tablet"',
      }),
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
  // Always classify on add — caregiver-supplied drugClass overrides only
  // the class field, never the strengths (which are RxNorm-sourced fact).
  const classification = await classifyDrugByName(v.drugName);
  const drugClass = v.drugClass ?? classification.medClass;

  if (v.dose) {
    const unitError = validateDoseAgainstStrengths(
      v.dose,
      v.drugName,
      classification.allowedStrengths
    );
    if (unitError) return { ok: false, error: unitError };
  }

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
      allowed_strengths: classification.allowedStrengths
        ? (classification.allowedStrengths as unknown as never)
        : null,
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

  // Validate dose against existing allowed_strengths. If caregiver renamed
  // the drug, re-classify so strengths reflect the new name.
  const { data: existing } = await supabase
    .from('medications')
    .select('drug_name, allowed_strengths')
    .eq('id', medicationId)
    .eq('patient_id', patient.id)
    .single();

  let allowedStrengths = existing?.allowed_strengths as AllowedStrengths | null | undefined;
  let classRefresh: { medClass?: never } | null = null;
  if (existing && existing.drug_name.trim().toLowerCase() !== v.drugName.trim().toLowerCase()) {
    const reclass = await classifyDrugByName(v.drugName);
    allowedStrengths = reclass.allowedStrengths ?? null;
    classRefresh = {};
  }

  if (v.dose) {
    const unitError = validateDoseAgainstStrengths(v.dose, v.drugName, allowedStrengths);
    if (unitError) return { ok: false, error: unitError };
  }

  // Omit drug_class from the update when the caller didn't provide it — never
  // silently downgrade a previously-classified med to 'other'.
  const { error: updateError } = await supabase
    .from('medications')
    .update({
      drug_name: v.drugName,
      ...(v.drugClass !== undefined ? { drug_class: v.drugClass } : {}),
      dose: v.dose || null,
      frequency: v.frequency || null,
      doses_per_day: v.dosesPerDay,
      schedule_times: scheduleTimes,
      started_at: v.startedAt || null,
      notes: v.notes || null,
      ...(classRefresh
        ? { allowed_strengths: allowedStrengths ? (allowedStrengths as unknown as never) : null }
        : {}),
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
