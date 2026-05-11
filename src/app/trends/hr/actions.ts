'use server';

// Server actions for /trends/hr. Mirror addSpo2Reading + the delete
// pair, with field='resting_hr'. Engine T2.11a/b/c already handle HR
// thresholds — no engine change needed.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { evaluateAlertTier } from '@/lib/alerts/evaluate';
import { generateAlertReasoning } from '@/lib/alerts/reason';
import { READING_RANGE } from '@/lib/clinical/reading-ranges';
import { getTodayInTimezone } from '@/lib/dates/today';
import { isoFromWallClock } from '@/lib/dates/from-wall-clock';
import { isoOffset } from '@/lib/dates/iso-offset';

import { MAX_BACKDATE_DAYS } from '@/lib/dates/backdate-window';

const InputSchema = z.object({
  // Resting HR is integer-only across the stack (DB CHECK, voice
  // extractor FIELD_RANGE.resting_hr, /log stepper, this trend).
  value: z
    .number()
    .int()
    .min(READING_RANGE.resting_hr[0])
    .max(READING_RANGE.resting_hr[1]),
  recordedAtIsoLocal: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Bad date/time'),
});

export type AddHrInput = z.infer<typeof InputSchema>;
export type AddHrResult = { ok: true } | { ok: false; error: string };

export async function addHrReading(
  raw: AddHrInput,
): Promise<AddHrResult> {
  const parsed = InputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const data = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single();
  if (!profile) return { ok: false, error: 'Profile not found.' };

  // Patient SELECT includes the reasoning columns. The HR insert may
  // co-fire other engine rules (e.g. spo2 already-sub-88 today) — the
  // reasoning function reads dry_weight_lb / normal_pillow_count /
  // nyha_class for those.
  const { data: patient } = await supabase
    .from('patients')
    .select(
      'id, caregiver_id, display_name, dry_weight_lb, normal_pillow_count, nyha_class',
    )
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!patient || patient.caregiver_id !== user.id) {
    return { ok: false, error: 'Patient not found.' };
  }

  const today = getTodayInTimezone(profile.timezone);

  const recordedAt = isoFromWallClock(data.recordedAtIsoLocal, profile.timezone);
  if (!recordedAt) return { ok: false, error: 'Invalid date or time.' };
  if (Date.parse(recordedAt) > Date.now()) {
    return { ok: false, error: 'Reading time is in the future.' };
  }

  const logDate = data.recordedAtIsoLocal.slice(0, 10);
  const earliest = isoOffset(today, -MAX_BACKDATE_DAYS);
  if (logDate < earliest) {
    return { ok: false, error: 'Reading date is too far in the past.' };
  }

  if (logDate === today) {
    const { data: pending } = await supabase
      .from('daily_logs')
      .select('id')
      .eq('patient_id', patient.id)
      .eq('log_date', today)
      .in('processing_status', ['pending', 'analyzing']);
    if (pending && pending.length > 0) {
      return {
        ok: false,
        error: 'Voice log still processing — try again in a moment.',
      };
    }
  }

  // 1. Parent daily_logs row.
  const { data: newLog, error: insertLogErr } = await supabase
    .from('daily_logs')
    .insert({
      patient_id: patient.id,
      log_date: logDate,
      processing_status: 'complete',
    })
    .select('id')
    .single();
  if (insertLogErr || !newLog) {
    return {
      ok: false,
      error: insertLogErr?.message ?? 'Could not create log.',
    };
  }
  const newLogId = newLog.id;

  // 2. Insert the reading.
  const { error: insertReadingErr } = await supabase
    .from('daily_log_readings')
    .insert({
      patient_id: patient.id,
      log_date: logDate,
      recorded_at: recordedAt,
      field: 'resting_hr',
      value: data.value,
      source_log_id: newLogId,
    });
  if (insertReadingErr) {
    return { ok: false, error: insertReadingErr.message };
  }

  // 3. Re-evaluate today's alert tier. T2.11a/b/c read the freshest
  //    resting_hr within the 24h freshness window.
  try {
    const assessment = await evaluateAlertTier(supabase, patient.id, today);
    const { error: upsertErr } = await supabase
      .from('daily_assessments')
      .upsert(
        [
          {
            patient_id: patient.id,
            log_date: today,
            tier: assessment.tier,
            triggers: JSON.parse(JSON.stringify(assessment.triggers)),
            cold_start: assessment.coldStart,
            source_log_id: newLogId,
            evaluated_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'patient_id,log_date' },
      );
    if (upsertErr) return { ok: false, error: upsertErr.message };

    if (
      assessment.tier !== 'tier_4_log' &&
      assessment.triggers.length > 0
    ) {
      // Reasoning is enrichment, NOT blocking. If Claude is down, the
      // alert row must still appear (with ai_reasoning=null). Carve-out
      // per learnings.md 2026-05-10 #2.
      let reasoning: string | null = null;
      try {
        reasoning = await generateAlertReasoning({
          assessment,
          patientFirstName: firstWord(patient.display_name),
          dryWeightLb:
            patient.dry_weight_lb !== null
              ? Number(patient.dry_weight_lb)
              : null,
          normalPillowCount: patient.normal_pillow_count,
          nyhaClass: patient.nyha_class ?? null,
        });
      } catch {
        // Swallow — the alert row is the safety-critical write.
      }
      await supabase.from('alerts').insert({
        patient_id: patient.id,
        daily_log_id: newLogId,
        tier: assessment.tier,
        trigger_reason: assessment.triggers[0]?.label ?? 'pattern',
        trigger_data: JSON.parse(JSON.stringify(assessment.triggers)),
        ai_reasoning: reasoning,
      });
    }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : 'Failed to re-evaluate alert.',
    };
  }

  revalidatePath('/trends/hr');
  revalidatePath('/trends');
  revalidatePath('/dashboard');
  return { ok: true };
}

function firstWord(s: string | null | undefined): string | null {
  if (!s) return null;
  const w = s.trim().split(/\s+/)[0];
  return w && w.length > 0 ? w : null;
}

// ─── DELETE actions ─────────────────────────────────────────────────────────

const DeleteByIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

export type DeleteHrResult =
  | { ok: true; deleted: number }
  | { ok: false; error: string };

export async function deleteHrReadings(
  raw: { ids: string[] },
): Promise<DeleteHrResult> {
  const parsed = DeleteByIdsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const { ids } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single();
  if (!profile) return { ok: false, error: 'Profile not found.' };

  const { data: patient } = await supabase
    .from('patients')
    .select('id, caregiver_id')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!patient || patient.caregiver_id !== user.id) {
    return { ok: false, error: 'Patient not found.' };
  }

  const { data: deleted, error } = await supabase
    .from('daily_log_readings')
    .delete()
    .eq('patient_id', patient.id)
    .eq('field', 'resting_hr')
    .in('id', ids)
    .select('id');
  if (error) return { ok: false, error: error.message };

  await reEvaluateToday(supabase, patient.id, profile.timezone);

  revalidatePath('/trends/hr');
  revalidatePath('/trends');
  revalidatePath('/dashboard');
  return { ok: true, deleted: deleted?.length ?? 0 };
}

export async function deleteAllHrReadings(): Promise<DeleteHrResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single();
  if (!profile) return { ok: false, error: 'Profile not found.' };

  const { data: patient } = await supabase
    .from('patients')
    .select('id, caregiver_id')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!patient || patient.caregiver_id !== user.id) {
    return { ok: false, error: 'Patient not found.' };
  }

  const { data: deleted, error } = await supabase
    .from('daily_log_readings')
    .delete()
    .eq('patient_id', patient.id)
    .eq('field', 'resting_hr')
    .select('id');
  if (error) return { ok: false, error: error.message };

  await reEvaluateToday(supabase, patient.id, profile.timezone);

  revalidatePath('/trends/hr');
  revalidatePath('/trends');
  revalidatePath('/dashboard');
  return { ok: true, deleted: deleted?.length ?? 0 };
}

async function reEvaluateToday(
  supabase: Awaited<ReturnType<typeof createClient>>,
  patientId: string,
  tz: string,
): Promise<void> {
  const today = getTodayInTimezone(tz);
  try {
    const assessment = await evaluateAlertTier(supabase, patientId, today);
    await supabase.from('daily_assessments').upsert(
      [
        {
          patient_id: patientId,
          log_date: today,
          tier: assessment.tier,
          triggers: JSON.parse(JSON.stringify(assessment.triggers)),
          cold_start: assessment.coldStart,
          source_log_id: null,
          evaluated_at: new Date().toISOString(),
        },
      ],
      { onConflict: 'patient_id,log_date' },
    );
  } catch {
    // Non-blocking. Next evaluation will pick up the new state.
  }
}
