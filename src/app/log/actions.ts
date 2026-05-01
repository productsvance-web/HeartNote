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

  // Upsert today's daily_log row. UNIQUE(patient_id, log_date) enforces one
  // per day. `today` must be computed in the caregiver's local timezone — a
  // UTC date would let two same-local-day recordings clobber each other.
  const today = await getTodayForCaregiver(supabase, user.id);
  const { data: log, error: logError } = await supabase
    .from('daily_logs')
    .upsert(
      {
        patient_id: patientId,
        log_date: today,
        processing_status: 'pending',
        processing_error: null,
        transcribed_text: null,
        structured_observations: null,
      },
      { onConflict: 'patient_id,log_date' }
    )
    .select('id')
    .single();
  if (logError || !log) {
    return { ok: false, error: logError?.message ?? 'Could not create today’s log.' };
  }

  return { ok: true, logId: log.id };
}
