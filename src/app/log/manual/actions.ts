'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { evaluateAlertTier } from '@/lib/alerts/evaluate';
import { generateAlertReasoning } from '@/lib/alerts/reason';
import { READING_RANGE } from '@/lib/clinical/reading-ranges';
import { getTodayInTimezone } from '@/lib/dates/today';

// Server action for /log/manual. Caregiver tap-only input path. Each save
// creates a NEW daily_logs row (multi-row-per-day is supported by the
// schema since 20260501041617). Symptoms + readings flow through the
// shared apply_voice_log_extraction RPC so the alert engine reads the
// same shape from voice and tap.
//
// Plan: docs/superpowers/plans/2026-05-09-vitals-manual-entry.md.

const Severity04 = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

const PayloadSchema = z.object({
  weightLb: z
    .number()
    .min(READING_RANGE.weight_lb[0])
    .max(READING_RANGE.weight_lb[1])
    .nullable(),
  swelling: z
    .object({
      severity: Severity04,
      region: z.enum(['ankles', 'calves', 'thighs', 'abdomen']).nullable(),
      clearsOvernight: z.boolean(),
    })
    .nullable(),
  breathingSeverity: Severity04.nullable(),
  pillowCount: z.number().int().min(0).max(10).nullable(),
  cough: z.enum(['none', 'daytime', 'nocturnal']).nullable(),
});

export type SaveManualVitalsInput = z.infer<typeof PayloadSchema>;
export type SaveManualVitalsResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveManualVitalsEntry(
  payload: SaveManualVitalsInput,
): Promise<SaveManualVitalsResult> {
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const data = parsed.data;

  const anyTouched =
    data.weightLb !== null ||
    data.swelling !== null ||
    data.breathingSeverity !== null ||
    data.pillowCount !== null ||
    data.cough !== null;
  if (!anyTouched) return { ok: false, error: 'Nothing to save.' };

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

  // Fail-closed against in-flight voice processing. Both pending and
  // analyzing states block — the voice path moves pending → analyzing
  // immediately on processVoiceLog start, so checking only `pending`
  // would race the analyzing window.
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

  // 1. Insert a new daily_logs row for this manual save. Pillow_count
  //    lives on the row directly (not via RPC day_level) so the
  //    firstNonNull aggregator in evaluate.ts treats this row as
  //    authoritative.
  const { data: newLog, error: insertErr } = await supabase
    .from('daily_logs')
    .insert({
      patient_id: patient.id,
      log_date: today,
      processing_status: 'complete',
      pillow_count: data.pillowCount,
    })
    .select('id')
    .single();
  if (insertErr || !newLog) {
    return { ok: false, error: insertErr?.message ?? 'Could not create log.' };
  }
  const manualLogId = newLog.id;

  // 2. Build readings + symptom_events from touched fields only.
  const readings: Array<{ field: string; value: number }> = [];
  if (data.weightLb !== null) {
    readings.push({ field: 'weight_lb', value: data.weightLb });
  }

  const symptomEvents: Array<Record<string, unknown>> = [];

  if (data.swelling !== null) {
    // Per plan L8: explicit "None" for graded symptoms stores
    // present=true, severity=0 to mirror extract.ts SWELLING anchor
    // ("0=none"). The caregiver tapped a button — that's an explicit
    // confirmation of absence, not silence. Body_region and
    // resolves_overnight are only meaningful when severity > 0.
    const event: Record<string, unknown> = {
      symptom: 'swelling',
      present: true,
      severity: data.swelling.severity,
    };
    if (data.swelling.severity > 0 && data.swelling.region) {
      event.body_region = data.swelling.region;
    }
    if (data.swelling.severity > 0 && data.swelling.clearsOvernight) {
      event.resolves_overnight = true;
    }
    symptomEvents.push(event);
  }

  if (data.breathingSeverity !== null) {
    symptomEvents.push({
      symptom: 'dyspnea',
      present: true,
      severity: data.breathingSeverity,
    });
  }

  if (data.cough !== null) {
    if (data.cough === 'none') {
      symptomEvents.push({ symptom: 'cough', present: false });
    } else {
      symptomEvents.push({
        symptom: 'cough',
        present: true,
        nocturnal: data.cough === 'nocturnal',
      });
    }
  }

  // 3. Apply via shared RPC (same path as voice). day_level is empty —
  //    pillow_count already lives on the new daily_logs row from step 1,
  //    and no other day-level fields are captured by the manual screen.
  //    JSON.parse(JSON.stringify(...)) flattens the structural-union types
  //    into the recursive Json type Supabase's RPC expects (same pattern
  //    as voice-log/process.ts:266 for assessment.triggers).
  const { error: rpcError } = await supabase.rpc('apply_voice_log_extraction', {
    p_log_id: manualLogId,
    p_readings: JSON.parse(JSON.stringify(readings)),
    p_symptom_events: JSON.parse(JSON.stringify(symptomEvents)),
    p_day_level: {},
  });
  if (rpcError) return { ok: false, error: rpcError.message };

  // 4. Re-evaluate engine + upsert assessment. Mirrors saveLogEdit.
  try {
    const assessment = await evaluateAlertTier(supabase, patient.id, today);
    const { error: upsertErr } = await supabase.from('daily_assessments').upsert(
      [
        {
          patient_id: patient.id,
          log_date: today,
          tier: assessment.tier,
          triggers: JSON.parse(JSON.stringify(assessment.triggers)),
          cold_start: assessment.coldStart,
          source_log_id: manualLogId,
          evaluated_at: new Date().toISOString(),
        },
      ],
      { onConflict: 'patient_id,log_date' },
    );
    if (upsertErr) return { ok: false, error: upsertErr.message };

    if (assessment.tier !== 'tier_4_log' && assessment.triggers.length > 0) {
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
          patient_id: patient.id,
          daily_log_id: manualLogId,
          tier: assessment.tier,
          trigger_reason: assessment.triggers[0]?.label ?? 'pattern',
          trigger_data: JSON.parse(JSON.stringify(assessment.triggers)),
          ai_reasoning: reasoning,
        });
      } catch {
        // Reasoning is enrichment, not blocking. Engine headline is on
        // the dashboard via daily_assessments.triggers regardless.
      }
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to re-evaluate alert.',
    };
  }

  revalidatePath('/dashboard');
  return { ok: true };
}

function firstWord(s: string | null | undefined): string | null {
  if (!s) return null;
  const w = s.trim().split(/\s+/)[0];
  return w && w.length > 0 ? w : null;
}
