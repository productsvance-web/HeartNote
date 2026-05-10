'use server';

// Unified save action for the redesigned /log. Replaces /log/manual/actions.ts
// (delete in Task 11) and parts of /log/actions.ts.
//
// Two server actions:
//   - upsertTodayTapSession: debounced save target. Creates a new daily_logs
//     row on first call of a session; subsequent calls within the same
//     tapSessionId UPSERT into the existing row.
//   - flushAndStartVoice: replaces startVoiceLog. Creates a fresh pending
//     voice row. The "flush" is the client's responsibility (it awaits
//     any pending tap-session save before calling); the server just creates
//     the voice row. Naming signals the flush-then-start contract.
//
// The tap path REPLACES (apply_log_patch_v2): each save is the full snapshot
// of the session. The voice path APPENDS (apply_voice_log_extraction).
// Two RPCs, two semantics.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { evaluateAlertTier } from '@/lib/alerts/evaluate';
import { generateAlertReasoning } from '@/lib/alerts/reason';
import { READING_RANGE } from '@/lib/clinical/reading-ranges';
import { getTodayInTimezone } from '@/lib/dates/today';

const Severity04 = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

const SaveLogPatchSchema = z.object({
  tapSessionId: z.string().uuid(),
  vitals: z.object({
    weightLb: z
      .number()
      .min(READING_RANGE.weight_lb[0])
      .max(READING_RANGE.weight_lb[1])
      .nullable()
      .optional(),
    pillowCount: z.number().int().min(0).max(10).nullable().optional(),
    bp: z
      .object({
        sys: z
          .number()
          .int()
          .min(READING_RANGE.systolic_bp[0])
          .max(READING_RANGE.systolic_bp[1])
          .nullable(),
        dia: z
          .number()
          .int()
          .min(READING_RANGE.diastolic_bp[0])
          .max(READING_RANGE.diastolic_bp[1])
          .nullable(),
      })
      .nullable()
      .optional(),
    hrBpm: z
      .number()
      .int()
      .min(READING_RANGE.resting_hr[0])
      .max(READING_RANGE.resting_hr[1])
      .nullable()
      .optional(),
    spo2Pct: z
      .number()
      .int()
      .min(READING_RANGE.spo2[0])
      .max(READING_RANGE.spo2[1])
      .nullable()
      .optional(),
  }),
  symptoms: z.object({
    dyspnea: Severity04.nullable().optional(),
    cough: z.enum(['none', 'daytime', 'nocturnal']).nullable().optional(),
    sputum: z
      .enum(['clear', 'white', 'white_frothy', 'pink_frothy'])
      .nullable()
      .optional(),
    swelling: z
      .object({
        severity: Severity04,
        region: z.enum(['ankles', 'calves', 'thighs', 'abdomen']).nullable(),
        resolvesOvernight: z.boolean(),
      })
      .nullable()
      .optional(),
    fatigue: Severity04.nullable().optional(),
    cognition: z.enum(['clear', 'mild_fog', 'confusion']).nullable().optional(),
    appetite: z.enum(['decreased', 'unchanged', 'increased']).nullable().optional(),
    urineOutput: z.enum(['decreased', 'unchanged', 'increased']).nullable().optional(),
    chestPain: z.boolean().nullable().optional(),
    syncope: z.boolean().nullable().optional(),
    cyanosis: z.boolean().nullable().optional(),
    pnd: z.boolean().nullable().optional(),
    earlySatiety: z.boolean().nullable().optional(),
    extremitiesColdClammy: z.boolean().nullable().optional(),
    pulseIrregular: z.boolean().nullable().optional(),
    dizziness: z
      .object({ present: z.boolean(), postural: z.boolean().nullable() })
      .nullable()
      .optional(),
    nausea: z.boolean().nullable().optional(),
  }),
});

export type SaveLogPatch = z.infer<typeof SaveLogPatchSchema>;
export type SaveLogResult =
  | { ok: true; logId: string }
  | { ok: false; error: string };

export async function upsertTodayTapSession(
  payload: SaveLogPatch,
): Promise<SaveLogResult> {
  const parsed = SaveLogPatchSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const data = parsed.data;

  // Cross-field validation: BP sys must be > dia when both are set.
  if (data.vitals.bp && data.vitals.bp.sys !== null && data.vitals.bp.dia !== null) {
    if (data.vitals.bp.sys <= data.vitals.bp.dia) {
      return { ok: false, error: 'Systolic must be higher than diastolic.' };
    }
  }

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
    .select('id,caregiver_id,display_name,dry_weight_lb,normal_pillow_count,nyha_class')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!patient || patient.caregiver_id !== user.id) {
    return { ok: false, error: 'Patient not found.' };
  }

  const today = getTodayInTimezone(profile.timezone);

  // Fail-closed against in-flight voice processing. The voice path moves
  // a row from pending → analyzing immediately on processVoiceLog start,
  // so checking only `pending` would race the analyzing window. (Lifted
  // from the deleted /log/manual/actions.ts.)
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

  // 1. Upsert the daily_logs row by (patient_id, log_date, tap_session_id).
  //    The unique partial index daily_logs_tap_session_uk (Task 8.0a) makes
  //    this idempotent — second debounced save → UPDATE the same row.
  //    tap_session_id isn't in generated types yet (Task 8 migration); the
  //    column is real in the DB.
  const upsertRow = {
    patient_id: patient.id,
    log_date: today,
    processing_status: 'complete' as const,
    tap_session_id: data.tapSessionId,
    pillow_count: data.vitals.pillowCount ?? null,
    appetite_change: data.symptoms.appetite ?? null,
    urine_output_change: data.symptoms.urineOutput ?? null,
  };
  const { data: upsertedLog, error: upsertErr } = await supabase
    .from('daily_logs')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(upsertRow as any, { onConflict: 'patient_id,log_date,tap_session_id' })
    .select('id')
    .single();
  if (upsertErr || !upsertedLog) {
    return { ok: false, error: upsertErr?.message ?? 'Could not save.' };
  }
  const logId = upsertedLog.id;

  // 2. Build readings + symptom events from the patch. Only TAPPED fields
  //    show up here; untouched fields are omitted.
  const readings: Array<{ field: string; value: number }> = [];
  if (data.vitals.weightLb !== null && data.vitals.weightLb !== undefined) {
    readings.push({ field: 'weight_lb', value: data.vitals.weightLb });
  }
  if (data.vitals.bp && data.vitals.bp.sys !== null) {
    readings.push({ field: 'systolic_bp', value: data.vitals.bp.sys });
  }
  if (data.vitals.bp && data.vitals.bp.dia !== null) {
    readings.push({ field: 'diastolic_bp', value: data.vitals.bp.dia });
  }
  if (data.vitals.hrBpm !== null && data.vitals.hrBpm !== undefined) {
    readings.push({ field: 'resting_hr', value: data.vitals.hrBpm });
  }
  if (data.vitals.spo2Pct !== null && data.vitals.spo2Pct !== undefined) {
    readings.push({ field: 'spo2', value: data.vitals.spo2Pct });
  }

  const symptomEvents: Array<Record<string, unknown>> = [];
  pushDyspnea(symptomEvents, data.symptoms.dyspnea ?? null);
  pushCough(symptomEvents, data.symptoms.cough ?? null, data.symptoms.sputum ?? null);
  pushSwelling(symptomEvents, data.symptoms.swelling ?? null);
  pushFatigue(symptomEvents, data.symptoms.fatigue ?? null);
  pushCognition(symptomEvents, data.symptoms.cognition ?? null);
  pushBoolean(symptomEvents, 'chest_pain', data.symptoms.chestPain ?? null);
  pushBoolean(symptomEvents, 'syncope', data.symptoms.syncope ?? null);
  pushBoolean(symptomEvents, 'cyanosis', data.symptoms.cyanosis ?? null);
  pushBoolean(symptomEvents, 'pnd', data.symptoms.pnd ?? null);
  pushBoolean(symptomEvents, 'early_satiety', data.symptoms.earlySatiety ?? null);
  pushBoolean(
    symptomEvents,
    'extremities_cold_clammy',
    data.symptoms.extremitiesColdClammy ?? null,
  );
  pushBoolean(symptomEvents, 'pulse_irregular', data.symptoms.pulseIrregular ?? null);
  pushDizziness(symptomEvents, data.symptoms.dizziness ?? null);
  pushBoolean(symptomEvents, 'nausea', data.symptoms.nausea ?? null);

  // 3. Apply via apply_log_patch_v2 — REPLACE semantics for tap-session.
  //    JSON.parse(JSON.stringify(...)) flattens the structural-union types
  //    into the recursive Json type Supabase expects.
  const { error: rpcError } = await supabase.rpc(
    // @ts-expect-error apply_log_patch_v2 is added by Task 8 migration; not yet in types
    'apply_log_patch_v2',
    {
      p_log_id: logId,
      p_readings: JSON.parse(JSON.stringify(readings)),
      p_symptom_events: JSON.parse(JSON.stringify(symptomEvents)),
      p_day_level: {},
    },
  );
  if (rpcError) return { ok: false, error: rpcError.message };

  // 4. Re-evaluate engine + upsert assessment + insert alerts row.
  try {
    const assessment = await evaluateAlertTier(supabase, patient.id, today);
    const { error: assessErr } = await supabase.from('daily_assessments').upsert(
      [
        {
          patient_id: patient.id,
          log_date: today,
          tier: assessment.tier,
          triggers: JSON.parse(JSON.stringify(assessment.triggers)),
          cold_start: assessment.coldStart,
          source_log_id: logId,
          evaluated_at: new Date().toISOString(),
        },
      ],
      { onConflict: 'patient_id,log_date' },
    );
    if (assessErr) return { ok: false, error: assessErr.message };

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
          daily_log_id: logId,
          tier: assessment.tier,
          trigger_reason: assessment.triggers[0]?.label ?? 'pattern',
          trigger_data: JSON.parse(JSON.stringify(assessment.triggers)),
          ai_reasoning: reasoning,
        });
      } catch {
        // Reasoning is enrichment, not blocking.
      }
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to re-evaluate alert.',
    };
  }

  revalidatePath('/dashboard');
  revalidatePath('/log');

  return { ok: true, logId };
}

const StartVoiceSchema = z.object({ patientId: z.string().uuid() });

export async function flushAndStartVoice(input: {
  patientId: string;
}): Promise<{ ok: true; logId: string } | { ok: false; error: string }> {
  // The flush itself is client-side: the caller awaits any pending
  // upsertTodayTapSession before calling this. Server just creates the
  // pending voice row.
  const parsed = StartVoiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid patient.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in expired.' };

  const { data: patient } = await supabase
    .from('patients')
    .select('id')
    .eq('id', parsed.data.patientId)
    .eq('caregiver_id', user.id)
    .maybeSingle();
  if (!patient) return { ok: false, error: 'Patient not found.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .single();
  if (!profile) return { ok: false, error: 'Profile not found.' };

  const today = getTodayInTimezone(profile.timezone);
  const { data: log, error } = await supabase
    .from('daily_logs')
    .insert({
      patient_id: parsed.data.patientId,
      log_date: today,
      processing_status: 'pending',
      processing_error: null,
      transcribed_text: null,
      structured_observations: null,
      // tap_session_id stays NULL for voice rows.
    })
    .select('id')
    .single();
  if (error || !log) {
    return { ok: false, error: error?.message ?? 'Could not start voice log.' };
  }

  return { ok: true, logId: log.id };
}

// Discard an empty pending voice row when the caregiver cancels before
// saving (e.g. taps Record then bails without speaking). RLS scopes to
// the caller's patient; the explicit guards below stop us from nuking a
// row that already has content.
const DiscardSchema = z.object({ logId: z.string().uuid() });

export async function discardEmptyVoiceLog(input: {
  logId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = DiscardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid log id.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in expired.' };

  const { error } = await supabase
    .from('daily_logs')
    .delete()
    .eq('id', parsed.data.logId)
    .eq('processing_status', 'pending')
    .is('transcribed_text', null)
    .is('structured_observations', null);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pushDyspnea(
  out: Array<Record<string, unknown>>,
  severity: 0 | 1 | 2 | 3 | 4 | null,
) {
  if (severity === null) return;
  out.push({ symptom: 'dyspnea', present: true, severity });
}

function pushCough(
  out: Array<Record<string, unknown>>,
  cough: 'none' | 'daytime' | 'nocturnal' | null,
  sputum: 'clear' | 'white' | 'white_frothy' | 'pink_frothy' | null,
) {
  if (cough === null) return;
  if (cough === 'none') {
    out.push({ symptom: 'cough', present: false });
    return;
  }
  const event: Record<string, unknown> = {
    symptom: 'cough',
    present: true,
    nocturnal: cough === 'nocturnal',
  };
  // Sputum field is conditional on the sputum question being shown
  // (cough != 'none'); the modal only displays it when cough is set, so
  // we forward whatever the caregiver picked.
  if (sputum !== null) event.sputum_color = sputum;
  out.push(event);
}

function pushSwelling(
  out: Array<Record<string, unknown>>,
  swelling: { severity: 0 | 1 | 2 | 3 | 4; region: string | null; resolvesOvernight: boolean } | null,
) {
  if (swelling === null) return;
  const event: Record<string, unknown> = {
    symptom: 'swelling',
    present: true,
    severity: swelling.severity,
  };
  if (swelling.severity > 0 && swelling.region) {
    event.body_region = swelling.region;
  }
  if (swelling.severity > 0) {
    event.resolves_overnight = swelling.resolvesOvernight;
  }
  out.push(event);
}

function pushFatigue(
  out: Array<Record<string, unknown>>,
  severity: 0 | 1 | 2 | 3 | 4 | null,
) {
  if (severity === null) return;
  // L2: severity is allowed on fatigue (the CHECK was dropped in Task 1).
  // Phase 1 engine still reads fatigue as binary present-vs-baseline.
  out.push({ symptom: 'fatigue', present: severity > 0, severity });
}

function pushCognition(
  out: Array<Record<string, unknown>>,
  v: 'clear' | 'mild_fog' | 'confusion' | null,
) {
  if (v === null) return;
  if (v === 'clear') {
    out.push({ symptom: 'cognition_change', present: false, severity: 0 });
    return;
  }
  const severity = v === 'confusion' ? 2 : 1;
  out.push({ symptom: 'cognition_change', present: true, severity });
}

function pushBoolean(
  out: Array<Record<string, unknown>>,
  symptom: string,
  v: boolean | null,
) {
  if (v === null) return;
  out.push({ symptom, present: v });
}

function pushDizziness(
  out: Array<Record<string, unknown>>,
  d: { present: boolean; postural: boolean | null } | null,
) {
  if (d === null) return;
  const event: Record<string, unknown> = { symptom: 'dizziness', present: d.present };
  if (d.present && d.postural !== null) {
    event.postural = d.postural;
  }
  out.push(event);
}

function firstWord(s: string | null | undefined): string | null {
  if (!s) return null;
  const w = s.trim().split(/\s+/)[0];
  return w && w.length > 0 ? w : null;
}
