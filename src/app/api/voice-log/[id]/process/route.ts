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

  // Run-in-background semantics: respond fast, finish processing async.
  // Next.js route handlers complete when the function returns, so we await the
  // top-level call but skip blocking the client on the full processing chain
  // by chunking it inside processVoiceLog itself.
  try {
    await processVoiceLog(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
