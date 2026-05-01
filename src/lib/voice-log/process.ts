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

const ReadingSchema = z.object({
  field: z.enum(['weight_lb', 'resting_hr', 'spo2', 'systolic_bp', 'diastolic_bp']),
  value: z.number().finite(),
});
// Per-field range mirrors the DB CHECK constraints. Defense in depth: Zod
// drops bad values at the boundary so one hallucination doesn't fail the
// whole RPC.
const ReadingRange: Record<z.infer<typeof ReadingSchema>['field'], [number, number]> = {
  weight_lb: [50, 700],
  resting_hr: [30, 220],
  spo2: [50, 100],
  systolic_bp: [60, 250],
  diastolic_bp: [30, 150],
};

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
  ]),
  present: z.boolean(),
  severity: z.number().int().min(0).max(4).optional(),
  body_region: z.string().min(1).max(120).optional(),
  sputum_color: z.enum(['clear', 'white', 'pink_frothy']).optional(),
  chest_pain_character: z.string().min(1).max(240).optional(),
});

const DayLevelSchema = z.object({
  pillow_count: z.number().int().min(0).max(20).optional(),
  appetite_change: z.enum(['decreased', 'unchanged', 'increased']).optional(),
  urine_output_change: z.enum(['decreased', 'unchanged', 'increased']).optional(),
  activity_tolerance_change: z.string().min(1).max(500).optional(),
});

export async function processVoiceLog(
  logId: string,
  callerUserId: string,
  transcript: string
): Promise<void> {
  // Outer try/catch ensures any uncaught throw lands the row in `failed`
  // with a populated processing_error.
  try {
    const supabase = await createClient();

    // 1. Load the log + patient context. RLS ensures we only see logs owned
    //    by this caregiver via patients.caregiver_id.
    const { data: log, error: loadError } = await supabase
      .from('daily_logs')
      .select(
        'id, patient_id, processing_status, log_date, patients(caregiver_id, display_name, relationship, dry_weight_lb, nyha_class, normal_pillow_count)'
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
        const [min, max] = ReadingRange[parsed.data.field];
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
        return [parsed.data];
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
