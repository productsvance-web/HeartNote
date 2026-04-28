// Server-only orchestration for processing a daily_log:
//   1. Download audio from Supabase Storage
//   2. Send to Whisper (OpenAI) for transcription
//   3. Send transcript + patient context to Claude for structured CHF extraction
//   4. Write transcript + structured fields back to the daily_log row
//
// For v1 the function runs synchronously inside an API route. When latency
// or scale demand it, swap to a queue (Vercel Queues, Inngest, etc.) — the
// shape of this function is queue-friendly: it takes (logId, callerUserId)
// and is idempotent on retry.

import { createClient } from '@/lib/supabase/server';

export async function processVoiceLog(logId: string, callerUserId: string): Promise<void> {
  const supabase = await createClient();

  // 1. Load the log + patient context. RLS ensures we only see logs owned by
  //    this caregiver via patients.caregiver_id.
  const { data: log, error: loadError } = await supabase
    .from('daily_logs')
    .select('id, patient_id, audio_storage_path, processing_status, log_date, patients(caregiver_id, display_name, dry_weight_lb, nyha_class, normal_pillow_count)')
    .eq('id', logId)
    .single();

  if (loadError || !log) throw new Error(loadError?.message ?? 'log not found');
  if (Array.isArray(log.patients) || !log.patients) throw new Error('patient join failed');
  if (log.patients.caregiver_id !== callerUserId) throw new Error('forbidden');
  if (!log.audio_storage_path) throw new Error('audio file missing');

  await supabase
    .from('daily_logs')
    .update({ processing_status: 'transcribing', processing_error: null })
    .eq('id', logId);

  // 2. Download the audio file from Supabase Storage.
  const { data: audioBlob, error: downloadError } = await supabase.storage
    .from('audio_logs')
    .download(log.audio_storage_path);
  if (downloadError || !audioBlob) {
    await markFailed(logId, downloadError?.message ?? 'audio download failed');
    return;
  }

  // 3. Whisper transcription.
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    // Whisper not yet wired — leave a friendly placeholder so the UI can show
    // that the audio is saved while we wait on the API key.
    await supabase
      .from('daily_logs')
      .update({
        processing_status: 'complete',
        transcribed_text: '(Audio saved. Add OPENAI_API_KEY to .env.local to enable transcription.)',
      })
      .eq('id', logId);
    return;
  }

  let transcript: string;
  try {
    transcript = await transcribeWithWhisper(audioBlob, openaiKey);
  } catch (err) {
    await markFailed(logId, err instanceof Error ? err.message : 'transcription failed');
    return;
  }

  await supabase
    .from('daily_logs')
    .update({
      processing_status: 'analyzing',
      transcribed_text: transcript,
    })
    .eq('id', logId);

  // 4. Claude structured extraction (stub for now — will be wired to Anthropic SDK
  //    with prompt caching against research/chf-source-of-truth.md in the next pass).
  await supabase
    .from('daily_logs')
    .update({
      processing_status: 'complete',
      ai_processed_at: new Date().toISOString(),
    })
    .eq('id', logId);
}

async function transcribeWithWhisper(audio: Blob, apiKey: string): Promise<string> {
  const form = new FormData();
  form.append('file', audio, 'audio.webm');
  form.append('model', 'whisper-1');
  // Caregivers often use clinical terms; biasing improves accuracy.
  form.append(
    'prompt',
    'CHF caregiver daily log: weight, swelling, edema, dyspnea, orthopnea, pillows, fatigue, Lasix, furosemide, cardiologist, blood pressure, heart rate.'
  );

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Whisper API error ${res.status}: ${errBody.slice(0, 200)}`);
  }
  const json = (await res.json()) as { text: string };
  return json.text;
}

async function markFailed(logId: string, error: string) {
  const supabase = await createClient();
  await supabase
    .from('daily_logs')
    .update({ processing_status: 'failed', processing_error: error })
    .eq('id', logId);
}
