// Server-only orchestration for processing a daily_log:
//   1. Take the transcript that Deepgram already streamed to the browser.
//   2. Send transcript + patient context to Claude for structured CHF extraction.
//   3. Write transcript + structured fields back to the daily_log row.
//
// Deepgram streamed the audio + transcript live, so the server does no audio
// handling and no Whisper call. State machine: pending → analyzing → complete | failed.

import { createClient } from '@/lib/supabase/server';
import { extractWithClaude } from '@/lib/voice-log/extract';

export async function processVoiceLog(
  logId: string,
  callerUserId: string,
  transcript: string
): Promise<void> {
  // Outer try/catch ensures any uncaught throw lands the row in `failed`
  // with a populated processing_error. Without this, an early throw before
  // the first status update would leave the row stuck at `pending` forever
  // and the client poller would spin indefinitely.
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

    // 2. Claude extraction — structured fields + caregiver summary + reasoning.
    try {
      const extraction = await extractWithClaude(transcript, {
        displayName: log.patients.display_name,
        relationship: log.patients.relationship,
        dryWeightLb: log.patients.dry_weight_lb,
        nyhaClass: log.patients.nyha_class,
        normalPillowCount: log.patients.normal_pillow_count,
      });

      // Sanitize structured fields: only allow known columns; coerce empty strings → null.
      const structuredUpdate = sanitizeStructuredFields(extraction.structuredFields);

      await supabase
        .from('daily_logs')
        .update({
          ...structuredUpdate,
          structured_observations: {
            caregiver_summary: extraction.caregiverSummary,
            ai_reasoning: extraction.aiReasoning,
            follow_up_question: extraction.followUpQuestion || null,
          },
          processing_status: 'complete',
          ai_processed_at: new Date().toISOString(),
        })
        .eq('id', logId);
    } catch (err) {
      // Transcript is preserved on the row; only the AI extraction failed.
      // Mark complete with an error note so the user still sees their words.
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

// Allowlist of daily_logs columns the AI is permitted to populate. Anything
// the model returns outside this set is dropped — defends against schema drift,
// hallucinated fields, and accidental overwrites of metadata columns.
const ALLOWED_AI_COLUMNS = new Set([
  'weight_lb',
  'systolic_bp',
  'diastolic_bp',
  'resting_hr',
  'spo2',
  'feeling_score',
  'dyspnea_level',
  'pillow_count',
  'pnd_episode',
  'cough_present',
  'cough_nocturnal',
  'sputum_color',
  'swelling_severity',
  'extremities_cold_clammy',
  'cyanosis',
  'chest_pain',
  'chest_pain_character',
  'syncope',
  'appetite_change',
  'early_satiety',
  'fatigue_level',
  'urine_output_change',
  'cognition_change',
  'activity_tolerance_change',
]);

function sanitizeStructuredFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_AI_COLUMNS.has(key)) continue;
    if (value === '' || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

async function markFailed(logId: string, error: string) {
  const supabase = await createClient();
  await supabase
    .from('daily_logs')
    .update({ processing_status: 'failed', processing_error: error })
    .eq('id', logId);
}
