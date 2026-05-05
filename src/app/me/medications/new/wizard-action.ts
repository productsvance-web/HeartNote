'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  classifyByRxcui,
  classifyDrugByName,
  type AllowedStrengths,
} from '@/lib/medications/classify';
import type { MedClass } from '@/lib/medications/atc-map';

// Wizard insert path. Distinguished from the legacy addMedication by the
// rxcui-known short-circuit: when the wizard supplies an rxcui (the user
// picked a real RxNorm concept in step 1), we skip the name → rxcui
// resolution that classifyDrugByName has to do and call RxClass directly.
// Custom path (no rxcui) falls through to classifyDrugByName so
// drug_class still gets a best guess from the typed string.
//
// Single INSERT only — no auxiliary writes. Save failure cannot leave a
// partial DB state.

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

const WizardPayloadSchema = z.object({
  // Required across both paths.
  drugName: z.string().trim().min(1).max(200),
  pillsPerDose: z.number().int().min(1).max(20).default(1),
  dosesPerDay: z.number().int().min(1).max(12).nullable(),
  scheduleTimes: z.array(z.string().regex(HH_MM, 'Times must be HH:MM')).nullable(),
  startedAt: z.string().optional(),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  // Combined dose string already formatted by the wizard ("40 mg",
  // "0.5 g", "1 %", or "" when the caregiver skipped strength on a
  // form that didn't carry numeric strength).
  dose: z.string().trim().max(100).optional().or(z.literal('')),
  // RxNorm-derived. All four are null on the custom path.
  rxcui: z.string().min(1).max(64).nullable(),
  form: z.string().min(1).max(120).nullable(),
  ingredient: z.string().min(1).max(200).nullable(),
  // True when ?from=scan was set — return user to /me/medications/scan
  // instead of the medication list.
  returnToScan: z.boolean().optional(),
});

export type WizardPayload = z.infer<typeof WizardPayloadSchema>;

export async function addMedicationFromWizard(
  payload: WizardPayload
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = WizardPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;
  if (
    v.scheduleTimes !== null &&
    (v.dosesPerDay === null || v.scheduleTimes.length !== v.dosesPerDay)
  ) {
    return { ok: false, error: 'Schedule times must match doses per day' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Session expired. Please sign in again.' };

  const { data: patient } = await supabase
    .from('patients')
    .select('id')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!patient) return { ok: false, error: 'No patient on file.' };

  // Wizard-known rxcui: classify directly. No name resolution, no
  // allowed_strengths — the wizard's chips already constrained input.
  // Custom path: full classifyDrugByName with allowed_strengths feed-
  // through (column drop is a separate follow-up).
  let medClass: MedClass;
  let allowedStrengthsForRow: AllowedStrengths | null = null;
  if (v.rxcui) {
    medClass = await classifyByRxcui(v.rxcui);
  } else {
    const result = await classifyDrugByName(v.drugName);
    medClass = result.medClass;
    allowedStrengthsForRow = result.allowedStrengths ?? null;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('medications')
    .insert({
      patient_id: patient.id,
      drug_name: v.drugName,
      drug_class: medClass,
      dose: v.dose || null,
      pills_per_dose: v.pillsPerDose,
      doses_per_day: v.dosesPerDay,
      schedule_times: v.scheduleTimes,
      started_at: v.startedAt || null,
      notes: v.notes || null,
      rxcui: v.rxcui,
      form: v.form,
      ingredient: v.ingredient,
      allowed_strengths: allowedStrengthsForRow
        ? (allowedStrengthsForRow as unknown as never)
        : null,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message ?? 'Insert failed' };
  }

  revalidatePath('/me/medications');
  revalidatePath('/dashboard');
  redirect(
    v.returnToScan
      ? '/me/medications/scan'
      : `/me/medications?added=${inserted.id}`
  );
}
