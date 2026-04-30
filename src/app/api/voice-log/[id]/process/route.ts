import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processVoiceLog } from '@/lib/voice-log/process';

// Triggers AI processing of a daily_log: download audio → Whisper → Claude → write structured
// observations back to the row. Runs synchronously inside the request for v1 simplicity;
// migrate to a queue (Vercel Queues or similar) when latency or scale demands.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Idempotency guard: if this log already finished processing, return the
  // existing result instead of re-running Whisper + Claude. Without this, a
  // double-tap or a retry would re-charge API credits and overwrite a good
  // result with a possibly different one.
  const { data: existing } = await supabase
    .from('daily_logs')
    .select('processing_status, transcribed_text, structured_observations')
    .eq('id', id)
    .single();
  if (existing?.processing_status === 'complete') {
    return NextResponse.json({
      ok: true,
      alreadyComplete: true,
      processing_status: existing.processing_status,
      transcribed_text: existing.transcribed_text,
      structured_observations: existing.structured_observations,
    });
  }

  // Blocking call — this route awaits the full Whisper + Claude pipeline
  // (typically 10–30s) and only responds when the row is updated to
  // `complete` or `failed`. The client (`voice-log-client.tsx`) issues this
  // POST after a successful upload, then polls `/api/voice-log/[id]/status`
  // for state changes. Migrate to a queue when latency or scale demands.
  try {
    await processVoiceLog(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
