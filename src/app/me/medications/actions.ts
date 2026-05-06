'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getTodayForCaregiver } from '@/lib/dates/today';
import {
  classifyDrugByName,
  classifyByRxcui,
  type AllowedStrengths,
} from '@/lib/medications/classify';
import { CADENCE_KINDS, HH_MM_REGEX, type CadenceKind } from '@/lib/medications/cadence';

// Form-side strength lookup for inline unit constraints AND the
// "did you mean" spell-correction chip. Both fields ride the same
// classifyDrugByName round-trip — no additional network calls. Skips
// entirely for short strings so the form doesn't fire on every keystroke.
export async function lookupDrugStrengths(
  drugName: string
): Promise<{
  allowedStrengths: AllowedStrengths | null;
  suggestedName: string | null;
}> {
  const trimmed = drugName.trim();
  if (trimmed.length < 3) {
    return { allowedStrengths: null, suggestedName: null };
  }
  const result = await classifyDrugByName(trimmed);
  return {
    allowedStrengths: result.allowedStrengths ?? null,
    suggestedName: result.suggestedName ?? null,
  };
}

// `<number> <unit>` with the unit drawn from a closed list of forms a
// caregiver might reasonably enter. Catches "lots", "10x", "small dose"
// at the format layer; semantic checks (is the unit class right for this
// drug?) happen against allowed_strengths below.
const DOSE_FORMAT =
  /^\s*(\d+(?:\.\d+)?)\s*(mcg\/ml|mg\/ml|meq\/ml|g\/ml|%|mg|mcg|g|kg|ng|ml|l|units?|tablets?|capsules?|caps?|puffs?|drops?|tsp|tbsp|sprays?|patches?|meq)\s*$/i;

function normalizeUnit(u: string): string {
  return u.toLowerCase().replace(/[.\s]/g, '').replace(/s$/, '');
}

function validateDoseAgainstStrengths(
  dose: string,
  drugName: string,
  allowed: AllowedStrengths | null | undefined
): string | null {
  if (!allowed) return null;
  const m = DOSE_FORMAT.exec(dose);
  if (!m) return null;
  const userUnit = normalizeUnit(m[2]);
  const allowedUnit = normalizeUnit(allowed.unit);
  if (userUnit === allowedUnit) return null;
  const sample = allowed.values.slice(0, 3).map((v) => `${v} ${allowed.unit.toLowerCase()}`).join(', ');
  return `${drugName} is typically given in ${allowed.unit.toLowerCase()} (e.g. ${sample}), not ${m[2]}. Edit the dose and save again.`;
}

const DoseTimeSchema = z.object({
  timeOfDay: z.string().regex(HH_MM_REGEX, 'Times must be HH:MM'),
  quantity: z.number().positive().finite(),
  ordinal: z.number().int().min(0),
  appliesToDow: z.number().int().min(1).max(127).nullable(),
});

export const MedicationPayloadSchema = z
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
    cadenceKind: z.enum(CADENCE_KINDS),
    cycleOnDays: z.number().int().min(1).max(365).nullable(),
    cycleOffDays: z.number().int().min(1).max(365).nullable(),
    intervalDays: z.number().int().min(2).max(30).nullable(),
    doseTimes: z.array(DoseTimeSchema).max(24),
    startedAt: z.string().optional(),
    notes: z.string().trim().max(1000).optional().or(z.literal('')),
    ndc: z.string().nullable().optional(),
    rxcui: z.string().nullable().optional(),
    ingredient: z.string().nullable().optional(),
    form: z.string().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.cadenceKind === 'as_needed') {
      if (v.doseTimes.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['doseTimes'],
          message: 'As-needed schedules cannot have dose times.',
        });
      }
      return;
    }
    if (v.doseTimes.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['doseTimes'],
        message: 'Add at least one dose time.',
      });
    }
    if (v.cadenceKind === 'cyclical') {
      if (v.cycleOnDays == null || v.cycleOffDays == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['cycleOnDays'],
          message: 'Set the on-period and off-period for cyclical schedules.',
        });
      }
      if (!v.startedAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['startedAt'],
          message: 'Set a start date for cyclical schedules.',
        });
      }
    }
    if (v.cadenceKind === 'every_few_days') {
      if (v.intervalDays == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['intervalDays'],
          message: 'Set the interval for every-few-days schedules.',
        });
      }
      if (!v.startedAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['startedAt'],
          message: 'Set a start date for interval schedules.',
        });
      }
    }
    if (v.cadenceKind === 'specific_days') {
      const allHaveBitmaps = v.doseTimes.every((d) => d.appliesToDow !== null);
      if (!allHaveBitmaps) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['doseTimes'],
          message: 'Pick at least one day for each schedule group.',
        });
      } else {
        let union = 0;
        for (const d of v.doseTimes) {
          const bm = d.appliesToDow ?? 0;
          if ((union & bm) !== 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['doseTimes'],
              message: 'Schedule groups must not share days.',
            });
            return;
          }
          union |= bm;
        }
      }
    } else {
      const anyHasBitmap = v.doseTimes.some((d) => d.appliesToDow !== null);
      if (anyHasBitmap) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['doseTimes'],
          message: 'Day-of-week is only used for Specific Days schedules.',
        });
      }
    }
  });

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

interface RpcPayload {
  medication_id: string | null;
  patient_id: string;
  drug_name: string;
  drug_class: string;
  dose: string | null;
  started_at: string | null;
  stopped_at: string | null;
  notes: string | null;
  ndc: string | null;
  rxcui: string | null;
  ingredient: string | null;
  form: string | null;
  allowed_strengths: AllowedStrengths | null;
  cadence_kind: CadenceKind;
  cycle_on_days: number | null;
  cycle_off_days: number | null;
  interval_days: number | null;
  dose_times: Array<{
    time_of_day: string;
    quantity: number;
    ordinal: number;
    applies_to_dow: number | null;
  }>;
}

function buildRpcPayload(args: {
  medicationId: string | null;
  patientId: string;
  drugClass: string;
  allowedStrengths: AllowedStrengths | null;
  v: MedicationPayload;
}): RpcPayload {
  const { medicationId, patientId, drugClass, allowedStrengths, v } = args;
  return {
    medication_id: medicationId,
    patient_id: patientId,
    drug_name: v.drugName,
    drug_class: drugClass,
    dose: v.dose ? v.dose.trim() : null,
    started_at: v.startedAt || null,
    stopped_at: null,
    notes: v.notes ? v.notes.trim() : null,
    ndc: v.ndc ?? null,
    rxcui: v.rxcui ?? null,
    ingredient: v.ingredient ?? null,
    form: v.form ?? null,
    allowed_strengths: allowedStrengths,
    cadence_kind: v.cadenceKind,
    cycle_on_days: v.cycleOnDays,
    cycle_off_days: v.cycleOffDays,
    interval_days: v.intervalDays,
    dose_times: v.doseTimes.map((d) => ({
      time_of_day: d.timeOfDay,
      quantity: d.quantity,
      ordinal: d.ordinal,
      applies_to_dow: d.appliesToDow,
    })),
  };
}

async function saveMedication(
  supabase: Awaited<ReturnType<typeof createClient>>,
  patientId: string,
  medicationId: string | null,
  payload: MedicationPayload
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = MedicationPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const v = parsed.data;
  // Wizard path supplies rxcui directly from the user's RxNorm pick at
  // step 1 — skip the name → rxcui lookup classifyDrugByName has to do.
  // Form / scan paths fall through to name-based classification.
  let drugClass: string;
  let allowedStrengths: AllowedStrengths | null = null;
  if (v.rxcui) {
    drugClass = await classifyByRxcui(v.rxcui);
  } else {
    const classification = await classifyDrugByName(v.drugName);
    drugClass = classification.medClass;
    allowedStrengths = classification.allowedStrengths ?? null;
  }

  if (v.dose) {
    const unitError = validateDoseAgainstStrengths(v.dose, v.drugName, allowedStrengths);
    if (unitError) return { ok: false, error: unitError };
  }

  const rpcPayload = buildRpcPayload({
    medicationId,
    patientId,
    drugClass,
    allowedStrengths,
    v,
  });

  const { data, error } = await supabase.rpc('save_medication_with_dose_times', {
    payload: rpcPayload as unknown as never,
  });
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Save failed' };
  }
  return { ok: true, id: data as unknown as string };
}

export async function addMedication(payload: MedicationPayload): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Session expired. Please sign in again.' };

  const patient = await resolvePatient(supabase, user.id);
  if (!patient) return { ok: false, error: 'No patient on file.' };

  const result = await saveMedication(supabase, patient.id, null, payload);
  if (!result.ok) return result;

  revalidatePath('/me/medications');
  revalidatePath('/dashboard');
  redirect(`/me/medications?added=${result.id}`);
}

// Batch insert path used by the scan flow — both single-card "Add to my
// list" (array of one) and "Add all" (array of many). No redirect: the
// caller stays on /me/medications/scan and updates client state per row.
// Returns indexes into the input array so the UI can keep failed rows
// on screen with inline error messages.
export async function addExtractedMedications(
  payloads: MedicationPayload[]
): Promise<{ added: number; failedIndexes: number[]; errors: string[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      added: 0,
      failedIndexes: payloads.map((_, i) => i),
      errors: payloads.map(() => 'Session expired. Please sign in again.'),
    };
  }
  const patient = await resolvePatient(supabase, user.id);
  if (!patient) {
    return {
      added: 0,
      failedIndexes: payloads.map((_, i) => i),
      errors: payloads.map(() => 'No patient on file.'),
    };
  }

  const failedIndexes: number[] = [];
  const errors: string[] = payloads.map(() => '');
  let added = 0;
  for (let i = 0; i < payloads.length; i++) {
    const result = await saveMedication(supabase, patient.id, null, payloads[i]);
    if (result.ok) {
      added++;
    } else {
      failedIndexes.push(i);
      errors[i] = result.error;
    }
  }

  if (added > 0) {
    revalidatePath('/me/medications');
    revalidatePath('/dashboard');
  }

  return { added, failedIndexes, errors };
}

export async function updateMedication(
  medicationId: string,
  payload: MedicationPayload
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Session expired. Please sign in again.' };

  const patient = await resolvePatient(supabase, user.id);
  if (!patient) return { ok: false, error: 'No patient on file.' };

  const result = await saveMedication(supabase, patient.id, medicationId, payload);
  if (!result.ok) return result;

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

const IdsSchema = z.array(z.string().uuid()).min(1).max(50);

export async function stopMedications(
  ids: string[]
): Promise<ActionResult & { stopped?: number }> {
  const parsed = IdsSchema.safeParse(ids);
  if (!parsed.success) return { ok: false, error: 'Invalid medication ids' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Session expired. Please sign in again.' };

  const today = await getTodayForCaregiver(supabase, user.id);

  const { data, error } = await supabase
    .from('medications')
    .update({ stopped_at: today })
    .in('id', parsed.data)
    .is('stopped_at', null)
    .select('id');

  if (error) return { ok: false, error: error.message };

  revalidatePath('/me/medications');
  revalidatePath('/dashboard');
  return { ok: true, stopped: (data ?? []).length };
}

export interface DeleteMedicationsImpact {
  medications: Array<{ id: string; name: string; eventCount: number }>;
  totalEvents: number;
}

type DeleteMedicationsResult =
  | { ok: true; performed: false; impact: DeleteMedicationsImpact }
  | { ok: true; performed: true; deleted: number }
  | { ok: false; error: string };

export async function deleteMedications(input: {
  ids: string[];
  confirm: boolean;
}): Promise<DeleteMedicationsResult> {
  const parsed = IdsSchema.safeParse(input.ids);
  if (!parsed.success) return { ok: false, error: 'Invalid medication ids' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Session expired. Please sign in again.' };

  if (!input.confirm) {
    const [medsResult, eventsResult] = await Promise.all([
      supabase.from('medications').select('id, drug_name').in('id', parsed.data),
      supabase
        .from('medication_events')
        .select('medication_id')
        .in('medication_id', parsed.data),
    ]);
    if (medsResult.error) return { ok: false, error: medsResult.error.message };
    if (eventsResult.error) return { ok: false, error: eventsResult.error.message };

    const counts = new Map<string, number>();
    for (const e of eventsResult.data ?? []) {
      counts.set(e.medication_id, (counts.get(e.medication_id) ?? 0) + 1);
    }
    const medications = (medsResult.data ?? []).map((m) => ({
      id: m.id,
      name: m.drug_name,
      eventCount: counts.get(m.id) ?? 0,
    }));
    const totalEvents = medications.reduce((s, m) => s + m.eventCount, 0);
    return { ok: true, performed: false, impact: { medications, totalEvents } };
  }

  const { data, error } = await supabase
    .from('medications')
    .delete()
    .in('id', parsed.data)
    .select('id');

  if (error) return { ok: false, error: error.message };

  revalidatePath('/me/medications');
  revalidatePath('/dashboard');
  return { ok: true, performed: true, deleted: (data ?? []).length };
}
