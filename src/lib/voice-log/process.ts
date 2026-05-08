// Server-only orchestration for processing a daily_log:
//   1. Take the transcript that Deepgram already streamed to the browser.
//   2. Send transcript + patient context to Claude for structured CHF extraction.
//   3. Validate the extracted readings/events against Zod (drop bad fields,
//      log a warning, persist the rest — one hallucinated value should not
//      lose the legitimate readings from the same dictation).
//   4. Atomically insert readings + symptom events + day-level updates via
//      the apply_voice_log_extraction RPC (Postgres function — Supabase JS
//      can't do client-side multi-statement transactions).
//
// State machine on daily_logs.processing_status: pending → analyzing →
// complete | failed.

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { extractWithClaude } from '@/lib/voice-log/extract';
import { matchMedByDrugName } from '@/lib/medications/match';
import type { UnmatchedChip } from '@/lib/voice-log/chip';
import { evaluateAlertTier } from '@/lib/alerts/evaluate';
import { READING_RANGE } from '@/lib/clinical/reading-ranges';

const ReadingSchema = z.object({
  field: z.enum(['weight_lb', 'resting_hr', 'spo2', 'systolic_bp', 'diastolic_bp']),
  value: z.number().finite(),
});

const SymptomEventSchema = z.object({
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
  present: z.boolean(),
  severity: z.number().int().min(0).max(4).optional(),
  body_region: z.string().min(1).max(120).optional(),
  nocturnal: z.boolean().optional(),
  sputum_color: z.enum(['clear', 'white', 'pink_frothy', 'white_frothy']).optional(),
  chest_pain_character: z.string().min(1).max(240).optional(),
  resolves_overnight: z.boolean().optional(),
  postural: z.boolean().optional(),
});

const DayLevelSchema = z.object({
  pillow_count: z.number().int().min(0).max(20).optional(),
  appetite_change: z.enum(['decreased', 'unchanged', 'increased']).optional(),
  urine_output_change: z.enum(['decreased', 'unchanged', 'increased']).optional(),
  activity_tolerance_change: z.string().min(1).max(500).optional(),
  activity_step_change: z.enum(['none', 'mild_slowdown', 'severe_change']).optional(),
});

const MedEventSchema = z.object({
  drug_name_stated: z.string().trim().min(1).max(200),
  status: z.enum(['taken', 'double_dosed', 'refused']),
  note: z.string().max(500).optional(),
});

export async function processVoiceLog(
  logId: string,
  callerUserId: string,
  transcript: string
): Promise<{ unmatched_chips: UnmatchedChip[] }> {
  // Outer try/catch ensures any uncaught throw lands the row in `failed`
  // with a populated processing_error.
  try {
    const supabase = await createClient();

    // 1. Load the log + patient context. RLS ensures we only see logs owned
    //    by this caregiver via patients.caregiver_id.
    const { data: log, error: loadError } = await supabase
      .from('daily_logs')
      .select(
        'id, patient_id, processing_status, log_date, created_at, patients(caregiver_id, display_name, relationship, dry_weight_lb, nyha_class, normal_pillow_count)'
      )
      .eq('id', logId)
      .single();

    if (loadError || !log) throw new Error(loadError?.message ?? 'log not found');
    if (Array.isArray(log.patients) || !log.patients) throw new Error('patient join failed');
    if (log.patients.caregiver_id !== callerUserId) throw new Error('forbidden');

    await supabase
      .from('daily_logs')
      .update({
        processing_status: 'analyzing',
        processing_error: null,
        transcribed_text: transcript,
      })
      .eq('id', logId);

    // 2. Claude extraction.
    try {
      const extraction = await extractWithClaude(transcript, {
        displayName: log.patients.display_name,
        relationship: log.patients.relationship,
        dryWeightLb: log.patients.dry_weight_lb,
        nyhaClass: log.patients.nyha_class,
        normalPillowCount: log.patients.normal_pillow_count,
      });

      // 3. Validate at the boundary. Anything that fails range or shape is
      //    dropped with a warning preserved on the log row; the rest persists.
      const validationWarnings: string[] = [];

      const validReadings = extraction.readings.flatMap((r) => {
        const parsed = ReadingSchema.safeParse(r);
        if (!parsed.success) {
          validationWarnings.push(`reading rejected (shape): ${JSON.stringify(r)}`);
          return [];
        }
        const [min, max] = READING_RANGE[parsed.data.field];
        if (parsed.data.value < min || parsed.data.value > max) {
          validationWarnings.push(
            `reading rejected (range): ${parsed.data.field}=${parsed.data.value}`
          );
          return [];
        }
        return [parsed.data];
      });

      const validSymptomEvents = extraction.symptomEvents.flatMap((e) => {
        const parsed = SymptomEventSchema.safeParse(e);
        if (!parsed.success) {
          validationWarnings.push(`symptom_event rejected: ${JSON.stringify(e)}`);
          return [];
        }
        // Schema invariants the DB enforces. Strip locally so the insert
        // succeeds even if the LLM violates them; warn so we notice drift.
        const data = parsed.data;
        if (data.symptom === 'fatigue' && data.severity !== undefined) {
          delete data.severity;
          validationWarnings.push('stripped severity from fatigue event (fatigue is binary)');
        }
        if (data.symptom !== 'swelling' && data.resolves_overnight !== undefined) {
          delete data.resolves_overnight;
          validationWarnings.push(
            `stripped resolves_overnight from non-swelling event (symptom=${data.symptom})`
          );
        }
        if (data.symptom !== 'dizziness' && data.postural !== undefined) {
          delete data.postural;
          validationWarnings.push(
            `stripped postural from non-dizziness event (symptom=${data.symptom})`
          );
        }
        return [data];
      });

      const dayLevelParsed = DayLevelSchema.safeParse(extraction.dayLevel);
      const validDayLevel = dayLevelParsed.success ? dayLevelParsed.data : {};
      if (!dayLevelParsed.success) {
        validationWarnings.push(`day_level rejected: ${JSON.stringify(extraction.dayLevel)}`);
      }

      // 4. Atomic insert via RPC. Single Postgres function call — partial
      //    writes are impossible.
      const { error: rpcError } = await supabase.rpc('apply_voice_log_extraction', {
        p_log_id: logId,
        p_readings: validReadings,
        p_symptom_events: validSymptomEvents,
        p_day_level: validDayLevel,
      });
      if (rpcError) throw new Error(rpcError.message);

      // 4b. Medication-event dispatch. Strict drug-name match per plan
      //     decision #3: matched active → insert event; matched stopped →
      //     restart_med chip; no match → add_med chip. Failures are
      //     non-atomic with the readings/symptoms RPC — a single bad event
      //     should not unwind a successful vitals extraction.
      const validMedEvents = extraction.medicationEvents.flatMap((e) => {
        const parsed = MedEventSchema.safeParse(e);
        if (!parsed.success) {
          validationWarnings.push(`med_event rejected: ${JSON.stringify(e)}`);
          return [];
        }
        return [parsed.data];
      });

      const unmatchedChips: UnmatchedChip[] = [];
      const eventsToInsert: Array<{
        patient_id: string;
        medication_id: string;
        status: 'taken' | 'double_dosed' | 'refused';
        actual_taken_at: string;
        notes: string | null;
      }> = [];

      for (const medEvent of validMedEvents) {
        const matched = await matchMedByDrugName(
          supabase,
          log.patient_id,
          medEvent.drug_name_stated
        );
        if (!matched) {
          unmatchedChips.push({ type: 'add_med', phrase: medEvent.drug_name_stated });
        } else if (matched.isStopped) {
          unmatchedChips.push({
            type: 'restart_med',
            phrase: medEvent.drug_name_stated,
            medication_id: matched.medicationId,
          });
        } else {
          eventsToInsert.push({
            patient_id: log.patient_id,
            medication_id: matched.medicationId,
            status: medEvent.status,
            // log.created_at is the recording moment — anchors the event to
            // the calendar day the caregiver actually meant, not the
            // (potentially-rolled-over) processing moment.
            actual_taken_at: log.created_at,
            notes: medEvent.note ?? null,
          });
        }
      }

      if (eventsToInsert.length > 0) {
        const { error: medInsertError } = await supabase
          .from('medication_events')
          .insert(eventsToInsert);
        if (medInsertError) {
          validationWarnings.push(`med_events insert failed: ${medInsertError.message}`);
        }
      }

      // Class-only / nickname mentions surface as pick_med chips. Empty
      // strings are dropped silently.
      for (const phrase of extraction.medMatchFailures) {
        const trimmed = phrase.trim();
        if (trimmed) unmatchedChips.push({ type: 'pick_med', phrase: trimmed });
      }

      // 5. Phase 1 alert engine — re-evaluate this patient/day with the
      //    new dictation's data folded in. Wrapped in its own try/catch:
      //    an evaluation failure must never block the dictation from
      //    completing, since the transcript and structured rows are
      //    already persisted.
      try {
        const startMs = Date.now();
        const assessment = await evaluateAlertTier(supabase, log.patient_id, log.log_date);
        const durationMs = Date.now() - startMs;
        if (durationMs > 5000) {
          validationWarnings.push(`alert evaluation took ${durationMs}ms (>5s budget)`);
        }
        const { error: assessmentError } = await supabase
          .from('daily_assessments')
          .upsert(
            {
              patient_id: log.patient_id,
              log_date: log.log_date,
              tier: assessment.tier,
              // Triggers are JSON-serializable {rule_id, label, evidence}.
              // Cast through unknown — the Trigger type's `evidence:
              // Record<string, unknown>` is structurally compatible but too
              // loose for Supabase's Json constraint.
              triggers: JSON.parse(JSON.stringify(assessment.triggers)),
              cold_start: assessment.coldStart,
              source_log_id: logId,
              evaluated_at: new Date().toISOString(),
            },
            { onConflict: 'patient_id,log_date' }
          );
        if (assessmentError) {
          validationWarnings.push(`assessment upsert failed: ${assessmentError.message}`);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'alert evaluation failed';
        validationWarnings.push(`alert evaluation threw: ${message}`);
      }

      await supabase
        .from('daily_logs')
        .update({
          structured_observations: {
            caregiver_summary: extraction.caregiverSummary,
            ai_reasoning: extraction.aiReasoning,
            follow_up_question: extraction.followUpQuestion || null,
            ...(validationWarnings.length > 0
              ? { validation_warnings: validationWarnings }
              : {}),
          },
          processing_status: 'complete',
          ai_processed_at: new Date().toISOString(),
        })
        .eq('id', logId);

      return { unmatched_chips: unmatchedChips };
    } catch (err) {
      // Transcript is preserved on the row; only the AI extraction or RPC
      // failed. Mark complete with an error note so the caregiver still sees
      // their words.
      const message = err instanceof Error ? err.message : 'AI extraction failed';
      await supabase
        .from('daily_logs')
        .update({
          processing_status: 'complete',
          ai_processed_at: new Date().toISOString(),
          structured_observations: { ai_extraction_error: message },
        })
        .eq('id', logId);
      return { unmatched_chips: [] };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'voice-log processing failed';
    await markFailed(logId, message);
    throw err;
  }
}

async function markFailed(logId: string, error: string) {
  const supabase = await createClient();
  await supabase
    .from('daily_logs')
    .update({ processing_status: 'failed', processing_error: error })
    .eq('id', logId);
}
