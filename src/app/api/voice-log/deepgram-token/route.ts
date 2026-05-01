// Mints a short-lived Deepgram JWT for the browser to open a streaming
// WebSocket directly. The long-lived DEEPGRAM_API_KEY never leaves the
// server.
//
// Auth: requires an authenticated Supabase session. No body needed; reject
// any extra payload to keep the surface minimal.
//
// Token TTL: 30s — only needs to be valid at WebSocket-handshake time;
// the WS connection then stays open until closed by either side.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DEEPGRAM_GRANT_URL = 'https://api.deepgram.com/v1/auth/grant';
const TOKEN_TTL_SECONDS = 30;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    // Fail closed per CLAUDE.md "Environment variables fail closed".
    // Caller renders a friendly "voice log temporarily unavailable" state.
    return NextResponse.json(
      { error: 'transcription not configured' },
      { status: 503 }
    );
  }

  let res: Response;
  try {
    res = await fetch(DEEPGRAM_GRANT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: TOKEN_TTL_SECONDS }),
    });
  } catch {
    return NextResponse.json(
      { error: 'transcription provider unreachable' },
      { status: 502 }
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return NextResponse.json(
      { error: `transcription token mint failed (${res.status}): ${detail.slice(0, 120)}` },
      { status: 502 }
    );
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    return NextResponse.json(
      { error: 'transcription token mint returned no token' },
      { status: 502 }
    );
  }

  return NextResponse.json(
    {
      token: json.access_token,
      expiresIn: json.expires_in ?? TOKEN_TTL_SECONDS,
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}
