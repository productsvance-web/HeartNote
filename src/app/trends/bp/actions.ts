'use server';

// Server actions for /trends/bp. One BP save = TWO daily_log_readings
// rows (sys + dia) sharing a source_log_id. Engine T2.10 (SBP <90 with
// dizziness / confusion / cool-clammy) already handles BP — no engine
// change.
//
// Race-safety: ordering is mandatory. (1) parent log, (2) sys, (3) dia,
// then (4) engine re-eval. On step 3 failure: DELETE sys row + parent
// log; no alerts row yet because the engine never ran. Supabase JS has
// no transaction wrapper, so this manual cleanup is the safe path.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { evaluateAlertTier } from '@/lib/alerts/evaluate';
import { generateAlertReasoning } from '@/lib/alerts/reason';
import { READING_RANGE } from '@/lib/clinical/reading-ranges';
import { getTodayInTimezone } from '@/lib/dates/today';
import { isoFromWallClock } from '@/lib/dates/from-wall-clock';
import { isoOffset } from '@/lib/dates/iso-offset';

const MIN_BACKDATE_DAYS = 400;

const InputSchema = z.object({
  systolic: z
    .number()
    .int()
    .min(READING_RANGE.systolic_bp[0])
    .max(READING_RANGE.systolic_bp[1]),
  diastolic: z
    .number()
    .int()
    .min(READING_RANGE.diastolic_bp[0])
    .max(READING_RANGE.diastolic_bp[1]),
  recordedAtIsoLocal: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Bad date/time'),
});

export type AddBpInput = z.infer<typeof InputSchema>;
export type AddBpResult = { ok: true } | { ok: false; error: string };

export async function addBpReading(raw: AddBpInput): Promise<AddBpResult> {
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
  const earliest = isoOffset(today, -MIN_BACKDATE_DAYS);
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

  // 2. Systolic reading.
  const { data: sysRow, error: sysErr } = await supabase
    .from('daily_log_readings')
    .insert({
      patient_id: patient.id,
      log_date: logDate,
      recorded_at: recordedAt,
      field: 'systolic_bp',
      value: data.systolic,
      source_log_id: newLogId,
    })
    .select('id')
    .single();
  if (sysErr || !sysRow) {
    await supabase.from('daily_logs').delete().eq('id', newLogId);
    return { ok: false, error: sysErr?.message ?? 'Could not save sys.' };
  }

  // 3. Diastolic reading. Rollback path on failure: DELETE the sys row
  //    we just inserted AND the parent log. No alerts row exists yet
  //    because the engine re-eval lives in step 4 — never interleaved.
  const { error: diaErr } = await supabase
    .from('daily_log_readings')
    .insert({
      patient_id: patient.id,
      log_date: logDate,
      recorded_at: recordedAt,
      field: 'diastolic_bp',
      value: data.diastolic,
      source_log_id: newLogId,
    });
  if (diaErr) {
    await supabase.from('daily_log_readings').delete().eq('id', sysRow.id);
    await supabase.from('daily_logs').delete().eq('id', newLogId);
    return { ok: false, error: diaErr.message };
  }

  // 4. Engine re-eval — LAST write in the success path.
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
      // Reasoning carve-out per learnings.md 2026-05-10 #2 — Claude
      // failure must NOT drop the alerts row.
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
        // Swallow — alerts row is the safety-critical write.
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

  revalidatePath('/trends/bp');
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

const DeleteByPairsSchema = z.object({
  sourceLogIds: z.array(z.string().uuid()).min(1).max(500),
});

export type DeleteBpResult =
  | { ok: true; deleted: number }
  | { ok: false; error: string };

// Deletes both sys + dia rows for each named source_log_id. The
// caller's UI selects "BP pairs," so the API takes pair identifiers,
// not row ids — keeps a partial-pair delete from being possible.
export async function deleteBpReadings(
  raw: { sourceLogIds: string[] },
): Promise<DeleteBpResult> {
  const parsed = DeleteByPairsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const { sourceLogIds } = parsed.data;

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
    .in('field', ['systolic_bp', 'diastolic_bp'])
    .in('source_log_id', sourceLogIds)
    .select('id');
  if (error) return { ok: false, error: error.message };

  await reEvaluateToday(supabase, patient.id, profile.timezone);

  revalidatePath('/trends/bp');
  revalidatePath('/trends');
  revalidatePath('/dashboard');
  // deleted.length counts rows (2 per pair); return paired count.
  return { ok: true, deleted: Math.floor((deleted?.length ?? 0) / 2) };
}

export async function deleteAllBpReadings(): Promise<DeleteBpResult> {
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
    .in('field', ['systolic_bp', 'diastolic_bp'])
    .select('id');
  if (error) return { ok: false, error: error.message };

  await reEvaluateToday(supabase, patient.id, profile.timezone);

  revalidatePath('/trends/bp');
  revalidatePath('/trends');
  revalidatePath('/dashboard');
  return { ok: true, deleted: Math.floor((deleted?.length ?? 0) / 2) };
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
    // Non-blocking.
  }
}
