'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { evaluateAlertTier } from '@/lib/alerts/evaluate';
import { generateAlertReasoning } from '@/lib/alerts/reason';
import { READING_RANGE, type ReadingField } from '@/lib/clinical/reading-ranges';

// Server action for the manual-edit form. Updates day-level fields on the
// daily_logs row, applies per-row deletes / value-edits to readings and
// symptom events, inserts caregiver-added readings + symptom events, then
// re-runs the alert engine for the log_date and upserts daily_assessments.
// Caregiver-facing edits MUST re-run the engine — otherwise the dashboard
// tier would lie about the just-fixed data.

const ReadingPatchSchema = z.object({
  id: z.string().uuid(),
  remove: z.boolean().optional(),
  value: z.number().finite().optional(),
});

const SymptomPatchSchema = z.object({
  id: z.string().uuid(),
  remove: z.boolean().optional(),
  present: z.boolean().optional(),
  severity: z.number().int().min(0).max(4).nullable().optional(),
  nocturnal: z.boolean().nullable().optional(),
  postural: z.boolean().nullable().optional(),
  resolvesOvernight: z.boolean().nullable().optional(),
});

// Server-side backstop for caregiver-added readings. Per-field range
// matches the DB CHECK constraints and the AI-extraction validator in
// process.ts (single source of truth via ReadingRange).
const NewReadingSchema = z
  .object({
    field: z.enum(['weight_lb', 'resting_hr', 'spo2', 'systolic_bp', 'diastolic_bp']),
    value: z.number().finite(),
  })
  .refine(
    ({ field, value }) => {
      const [min, max] = READING_RANGE[field as ReadingField];
      return value >= min && value <= max;
    },
    { message: 'Value out of range for this field.' },
  );

// Caregiver-added symptom events default to present=true. Adding a
// "resolved" symptom is out of scope — caregivers remove the existing
// row instead.
const NewSymptomSchema = z.object({
  symptom: z.enum([
    'dyspnea',
    'cough',
    'chest_pain',
    'swelling',
    'fatigue',
    'pnd',
    'syncope',
    'cognition_change',
    'extremities_cold_clammy',
    'cyanosis',
    'early_satiety',
    'pulse_irregular',
    'dizziness',
    'nausea',
  ]),
  severity: z.number().int().min(0).max(4).nullable().optional(),
  nocturnal: z.boolean().nullable().optional(),
  postural: z.boolean().nullable().optional(),
  resolvesOvernight: z.boolean().nullable().optional(),
});

const PayloadSchema = z.object({
  logId: z.string().uuid(),
  notes: z.string().max(2000),
  pillowCount: z.number().int().min(0).max(10).nullable(),
  appetiteChange: z.enum(['decreased', 'unchanged', 'increased']).nullable(),
  urineOutputChange: z.enum(['decreased', 'unchanged', 'increased']).nullable(),
  activityStepChange: z.enum(['none', 'mild_slowdown', 'severe_change']).nullable(),
  readings: z.array(ReadingPatchSchema),
  symptomEvents: z.array(SymptomPatchSchema),
  newReadings: z.array(NewReadingSchema),
  newSymptoms: z.array(NewSymptomSchema),
});

export type SaveLogEditPayload = z.infer<typeof PayloadSchema>;

export async function saveLogEdit(
  payload: SaveLogEditPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input.' };
  }
  const data = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Verify ownership: load the log + its patient row, confirm caregiver owns
  // the patient. RLS would also block writes from other caregivers but the
  // explicit check lets us return a friendly error instead of a 500.
  const { data: log } = await supabase
    .from('daily_logs')
    .select('id, patient_id, log_date, created_at')
    .eq('id', data.logId)
    .maybeSingle();
  if (!log) return { ok: false, error: 'Log not found.' };

  const { data: patient } = await supabase
    .from('patients')
    .select('caregiver_id, display_name, dry_weight_lb, normal_pillow_count, nyha_class')
    .eq('id', log.patient_id)
    .single();
  if (!patient || patient.caregiver_id !== user.id) {
    return { ok: false, error: 'Not your log.' };
  }

  // 1. Update day-level fields on daily_logs.
  const { error: logErr } = await supabase
    .from('daily_logs')
    .update({
      notes: data.notes.trim().length > 0 ? data.notes.trim() : null,
      pillow_count: data.pillowCount,
      appetite_change: data.appetiteChange,
      urine_output_change: data.urineOutputChange,
      activity_step_change: data.activityStepChange,
    })
    .eq('id', data.logId);
  if (logErr) return { ok: false, error: logErr.message };

  // 2. Apply reading patches.
  for (const r of data.readings) {
    if (r.remove) {
      const { error } = await supabase.from('daily_log_readings').delete().eq('id', r.id);
      if (error) return { ok: false, error: error.message };
    } else if (typeof r.value === 'number') {
      const { error } = await supabase
        .from('daily_log_readings')
        .update({ value: r.value })
        .eq('id', r.id);
      if (error) return { ok: false, error: error.message };
    }
  }

  // 3. Apply symptom-event patches.
  for (const e of data.symptomEvents) {
    if (e.remove) {
      const { error } = await supabase
        .from('daily_log_symptom_events')
        .delete()
        .eq('id', e.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const update: {
        present?: boolean;
        severity?: number | null;
        nocturnal?: boolean | null;
        postural?: boolean | null;
        resolves_overnight?: boolean | null;
      } = {};
      if (typeof e.present === 'boolean') update.present = e.present;
      if (e.severity !== undefined) update.severity = e.severity;
      if (e.nocturnal !== undefined) update.nocturnal = e.nocturnal;
      if (e.postural !== undefined) update.postural = e.postural;
      if (e.resolvesOvernight !== undefined) update.resolves_overnight = e.resolvesOvernight;
      if (Object.keys(update).length > 0) {
        const { error } = await supabase
          .from('daily_log_symptom_events')
          .update(update)
          .eq('id', e.id);
        if (error) return { ok: false, error: error.message };
      }
    }
  }

  // 3b. Insert caregiver-added readings. recorded_at = log.created_at so
  // "latest weight" queries (which order by recorded_at desc) treat the
  // manual entry as part of the original dictation's time frame, not as
  // a brand-new "today" reading on a yesterday log.
  if (data.newReadings.length > 0) {
    const { error } = await supabase.from('daily_log_readings').insert(
      data.newReadings.map((r) => ({
        patient_id: log.patient_id,
        log_date: log.log_date,
        recorded_at: log.created_at,
        field: r.field,
        value: r.value,
        source_log_id: data.logId,
      })),
    );
    if (error) return { ok: false, error: error.message };
  }

  // 3c. Insert caregiver-added symptom events. Same recorded_at convention.
  // present=true is implicit; symptoms-resolved is an out-of-scope add.
  if (data.newSymptoms.length > 0) {
    const { error } = await supabase.from('daily_log_symptom_events').insert(
      data.newSymptoms.map((s) => ({
        patient_id: log.patient_id,
        log_date: log.log_date,
        recorded_at: log.created_at,
        symptom: s.symptom,
        present: true,
        severity: s.severity ?? null,
        nocturnal: s.nocturnal ?? null,
        postural: s.postural ?? null,
        resolves_overnight: s.resolvesOvernight ?? null,
        source_log_id: data.logId,
      })),
    );
    if (error) return { ok: false, error: error.message };
  }

  // 4. Re-run the alert engine for the log_date and upsert daily_assessments.
  // The dashboard reads daily_assessments — without this the tier would
  // still reflect the pre-edit data.
  try {
    const assessment = await evaluateAlertTier(supabase, log.patient_id, log.log_date);
    const { error: upsertErr } = await supabase.from('daily_assessments').upsert(
      [
        {
          patient_id: log.patient_id,
          log_date: log.log_date,
          tier: assessment.tier,
          triggers: assessment.triggers as unknown as import('@/lib/supabase/types').Json,
          cold_start: assessment.coldStart,
          source_log_id: data.logId,
          evaluated_at: new Date().toISOString(),
        },
      ],
      { onConflict: 'patient_id,log_date' },
    );
    if (upsertErr) return { ok: false, error: upsertErr.message };

    // v0.5 LLM reasoning. Mirrors the voice-log path: actionable tier +
    // non-empty triggers → generate, insert into alerts. A failed reasoning
    // call must not block the save; the caregiver already saw their edits
    // persist on the daily_assessments row.
    if (
      assessment.tier !== 'tier_4_log' &&
      assessment.triggers.length > 0
    ) {
      try {
        const reasoning = await generateAlertReasoning({
          assessment,
          patientFirstName: firstWord(patient.display_name),
          dryWeightLb:
            patient.dry_weight_lb !== null ? Number(patient.dry_weight_lb) : null,
          normalPillowCount: patient.normal_pillow_count,
          nyhaClass: patient.nyha_class ?? null,
        });
        await supabase.from('alerts').insert({
          patient_id: log.patient_id,
          daily_log_id: data.logId,
          tier: assessment.tier,
          trigger_reason: assessment.triggers[0]?.label ?? 'pattern',
          trigger_data: JSON.parse(JSON.stringify(assessment.triggers)),
          ai_reasoning: reasoning,
        });
      } catch {
        // Reasoning is enrichment, not blocking. Engine headline is still on
        // the dashboard via daily_assessments.triggers.
      }
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to re-evaluate alert.',
    };
  }

  revalidatePath('/log');
  revalidatePath('/dashboard');
  revalidatePath(`/log/${data.logId}/edit`);
  return { ok: true };
}

function firstWord(s: string | null | undefined): string | null {
  if (!s) return null;
  const w = s.trim().split(/\s+/)[0];
  return w && w.length > 0 ? w : null;
}
