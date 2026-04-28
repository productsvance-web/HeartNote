'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

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
  const today = new Date().toISOString().slice(0, 10);
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

  // Path: {caregiver_id}/{patient_id}/{daily_log_id}.webm
  const ext = (audio as File).name?.split('.').pop() ?? 'webm';
  const objectPath = `${user.id}/${patientId}/${log.id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('audio_logs')
    .upload(objectPath, audio, {
      contentType: (audio as File).type || 'audio/webm',
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
