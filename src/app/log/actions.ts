'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getTodayForCaregiver } from '@/lib/dates/today';
import { extForMime } from '@/lib/voice-log/audio-mime';

const PatientIdSchema = z.string().uuid();

export async function uploadVoiceLog(
  formData: FormData
): Promise<{ ok: true; logId: string } | { ok: false; error: string }> {
  const patientIdRaw = formData.get('patientId');
  const audio = formData.get('audio');
  const durationRaw = formData.get('durationSeconds');

  const patientIdParse = PatientIdSchema.safeParse(patientIdRaw);
  if (!patientIdParse.success) {
    return { ok: false, error: 'Invalid patient.' };
  }
  if (!audio || typeof audio === 'string' || !(audio instanceof File)) {
    return { ok: false, error: 'No audio file received.' };
  }
  // Belt-and-suspenders: reject 0-byte uploads before they create a daily_log
  // row or burn a storage write. The client already filters these out, but a
  // misbehaving browser or a direct API call shouldn't be able to slip past.
  if (audio.size === 0) {
    return { ok: false, error: 'No audio recorded — try again.' };
  }
  const duration = Number(durationRaw);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 600) {
    return { ok: false, error: 'Recording length is invalid.' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in expired. Please sign in again.' };

  const patientId = patientIdParse.data;

  // Confirm the patient belongs to the caregiver. RLS would enforce this on insert,
  // but checking here gives a clean error message instead of a cryptic RLS denial.
  const { data: patient } = await supabase
    .from('patients')
    .select('id')
    .eq('id', patientId)
    .eq('caregiver_id', user.id)
    .maybeSingle();
  if (!patient) {
    return { ok: false, error: 'Patient not found.' };
  }

  // Upsert today's daily_log row. UNIQUE(patient_id, log_date) enforces one per day.
  // `today` must be computed in the caregiver's local timezone — a UTC date
  // would let two same-local-day recordings clobber each other on upsert.
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

  // Path: {caregiver_id}/{patient_id}/{daily_log_id}.{ext}
  // Derive extension from the actual blob MIME (Safari iOS = m4a, others = webm)
  // rather than the multipart filename, which the helper sets but is still
  // a derived value — `audio.type` is the source of truth from MediaRecorder.
  const audioType = (audio as File).type;
  const ext = extForMime(audioType);
  const objectPath = `${user.id}/${patientId}/${log.id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('audio_logs')
    .upload(objectPath, audio, {
      contentType: audioType || 'audio/webm',
      upsert: true,
    });
  if (uploadError) {
    return { ok: false, error: `Upload failed: ${uploadError.message}` };
  }

  // Record the storage path on the log row.
  await supabase
    .from('daily_logs')
    .update({ audio_storage_path: objectPath })
    .eq('id', log.id);

  return { ok: true, logId: log.id };
}
