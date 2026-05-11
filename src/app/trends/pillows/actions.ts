'use server';

// Server actions for /trends/pillows. Pillows is a day-level summary
// (one number per night), so the page reads from
// `daily_logs.pillow_count` rather than `daily_log_readings` — keeps
// the alert engine, voice log pipeline, and trend page all aligned on
// one canonical column. See plan §Decisions captured #2 for the
// reasoning.
//
// addPillowReading inserts a new daily_logs row with pillow_count set.
// clear* actions UPDATE pillow_count = NULL on selected rows (the row
// survives; only the column is cleared) — this preserves other vital
// or symptom data attached to the same daily_logs row by voice log.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { evaluateAlertTier } from '@/lib/alerts/evaluate';
import { generateAlertReasoning } from '@/lib/alerts/reason';
import { READING_RANGE } from '@/lib/clinical/reading-ranges';
import { getTodayInTimezone } from '@/lib/dates/today';
import { isoOffset } from '@/lib/dates/iso-offset';

import { MAX_BACKDATE_DAYS } from '@/lib/dates/backdate-window';

const InputSchema = z.object({
  pillowCount: z
    .number()
    .int()
    .min(READING_RANGE.pillow_count[0])
    .max(READING_RANGE.pillow_count[1]),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Bad date'),
});

export type AddPillowInput = z.infer<typeof InputSchema>;
export type AddPillowResult = { ok: true } | { ok: false; error: string };

export async function addPillowReading(
  raw: AddPillowInput,
): Promise<AddPillowResult> {
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

  // Future-date guard. Engine T2.4 reads only today's pillow_count, so
  // a future-dated row would also be invisible to alerts — but the
  // policy-level rule still applies: caregivers don't log "tomorrow's
  // pillows" today.
  if (data.logDate > today) {
    return { ok: false, error: 'Reading date is in the future.' };
  }

  const earliest = isoOffset(today, -MAX_BACKDATE_DAYS);
  if (data.logDate < earliest) {
    return { ok: false, error: 'Reading date is too far in the past.' };
  }

  // In-flight voice processing gate for today.
  if (data.logDate === today) {
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

  // INSERT a fresh daily_logs row with just pillow_count set. The
  // UNIQUE constraint on (patient_id, log_date) was dropped in
  // migration 20260501041617 — multiple rows per day are allowed.
  const { data: newLog, error: insertErr } = await supabase
    .from('daily_logs')
    .insert({
      patient_id: patient.id,
      log_date: data.logDate,
      pillow_count: data.pillowCount,
      processing_status: 'complete',
    })
    .select('id')
    .single();
  if (insertErr || !newLog) {
    return {
      ok: false,
      error: insertErr?.message ?? 'Could not create log.',
    };
  }
  const newLogId = newLog.id;

  // Re-evaluate today's alert tier. Engine T2.4 reads the latest
  // non-null pillow_count from daily_logs for `today` — a backdated
  // save (logDate !== today) is a no-op for T2.4, intentional per
  // plan.
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

  revalidatePath('/trends/pillows');
  revalidatePath('/trends');
  revalidatePath('/dashboard');
  return { ok: true };
}

function firstWord(s: string | null | undefined): string | null {
  if (!s) return null;
  const w = s.trim().split(/\s+/)[0];
  return w && w.length > 0 ? w : null;
}

// ─── CLEAR actions (set pillow_count = NULL; row survives) ──────────────────

const ClearByIdsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});

export type ClearPillowResult =
  | { ok: true; deleted: number }
  | { ok: false; error: string };

export async function clearPillowReadings(
  raw: { ids: string[] },
): Promise<ClearPillowResult> {
  const parsed = ClearByIdsSchema.safeParse(raw);
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

  // UPDATE payload is exactly { pillow_count: null } — no other
  // columns. Voice-log data (transcribed_text, structured_observations,
  // other vitals) on the same row is preserved. RLS gates this via the
  // existing `caregiver crud own logs` policy on daily_logs.
  //
  // `not('pillow_count', 'is', null)` filter keeps the reported count
  // honest: a caller's id list that happens to include already-cleared
  // rows won't inflate `deleted`.
  const { data: updated, error } = await supabase
    .from('daily_logs')
    .update({ pillow_count: null })
    .eq('patient_id', patient.id)
    .in('id', ids)
    .not('pillow_count', 'is', null)
    .select('id');
  if (error) return { ok: false, error: error.message };

  await reEvaluateToday(supabase, patient.id, profile.timezone);

  revalidatePath('/trends/pillows');
  revalidatePath('/trends');
  revalidatePath('/dashboard');
  return { ok: true, deleted: updated?.length ?? 0 };
}

export async function clearAllPillowReadings(): Promise<ClearPillowResult> {
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

  const { data: updated, error } = await supabase
    .from('daily_logs')
    .update({ pillow_count: null })
    .eq('patient_id', patient.id)
    .not('pillow_count', 'is', null)
    .select('id');
  if (error) return { ok: false, error: error.message };

  await reEvaluateToday(supabase, patient.id, profile.timezone);

  revalidatePath('/trends/pillows');
  revalidatePath('/trends');
  revalidatePath('/dashboard');
  return { ok: true, deleted: updated?.length ?? 0 };
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
