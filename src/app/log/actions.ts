'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getTodayForCaregiver } from '@/lib/dates/today';

const StartSchema = z.object({
  patientId: z.string().uuid(),
});

// Creates (or reuses) today's daily_log row in `pending` state. Streaming
// transcription runs in the browser via Deepgram; when the user stops, the
// client posts the transcript to /api/voice-log/[id]/process for Claude
// extraction.
export async function startVoiceLog(
  input: { patientId: string }
): Promise<{ ok: true; logId: string } | { ok: false; error: string }> {
  const parsed = StartSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid patient.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in expired. Please sign in again.' };

  const { patientId } = parsed.data;

  // Confirm the patient belongs to the caregiver. RLS would enforce this on
  // insert, but checking here gives a clean error message instead of a
  // cryptic RLS denial.
  const { data: patient } = await supabase
    .from('patients')
    .select('id')
    .eq('id', patientId)
    .eq('caregiver_id', user.id)
    .maybeSingle();
  if (!patient) {
    return { ok: false, error: 'Patient not found.' };
  }

  // Insert a NEW daily_logs row for this dictation. Each tap of Record =
  // one row; a day can have many. `today` must be computed in the
  // caregiver's local timezone so the row's log_date matches the caregiver's
  // day, not UTC.
  const today = await getTodayForCaregiver(supabase, user.id);
  const { data: log, error: logError } = await supabase
    .from('daily_logs')
    .insert({
      patient_id: patientId,
      log_date: today,
      processing_status: 'pending',
      processing_error: null,
      transcribed_text: null,
      structured_observations: null,
    })
    .select('id')
    .single();
  if (logError || !log) {
    return { ok: false, error: logError?.message ?? 'Could not start a new log.' };
  }

  return { ok: true, logId: log.id };
}

// Discard an empty pending row when the caregiver cancels before saving
// (e.g. taps Record then bails without speaking). Caller must own the
// patient via RLS; we additionally guard against deleting rows that already
// have a transcript or structured data.
const DiscardSchema = z.object({ logId: z.string().uuid() });

export async function discardEmptyVoiceLog(
  input: { logId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = DiscardSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid log id.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in expired.' };

  // Only delete if pending + empty. RLS already restricts to caregiver's
  // own patients; the explicit guards below stop us from nuking a row that
  // somehow already has content.
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
