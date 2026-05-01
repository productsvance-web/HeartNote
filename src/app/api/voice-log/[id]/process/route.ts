import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { processVoiceLog } from '@/lib/voice-log/process';

// Triggers AI extraction of a daily_log given the transcript Deepgram
// streamed to the browser. Runs synchronously; migrate to a queue when
// latency or scale demands.

const ProcessBodySchema = z.object({
  // 10–4000 chars: floor rejects empty/near-empty submissions; ceiling caps
  // any single log at ~10–15 minutes of speech and prevents token-bonfire
  // attacks where a malicious client posts megabytes of text.
  transcript: z.string().trim().min(10, 'transcript too short').max(4000, 'transcript too long'),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  const parsed = ProcessBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'invalid body' },
      { status: 400 }
    );
  }

  // Idempotency guard: if this log already finished processing, return the
  // existing result instead of re-running Claude. Without this, a double-tap
  // or a retry would burn API credits and could overwrite a good result with
  // a possibly different one.
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

  try {
    await processVoiceLog(id, user.id, parsed.data.transcript);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
