// Issues a short-lived Deepgram API key the browser can use to open a
// streaming WebSocket directly. The long-lived DEEPGRAM_API_KEY never
// leaves the server.
//
// Auth: requires an authenticated Supabase session.
//
// Why temporary keys (not /v1/auth/grant JWTs): Deepgram's WebSocket
// subprotocol auth (`Sec-WebSocket-Protocol: token, <key>`) — the only
// auth path browsers can use, since they can't set custom headers on
// WebSocket opens — only accepts API keys, not JWT access tokens. Temp
// keys with TTL=30s give us the same "short-lived credential issued by
// server" security property without the JWT/subprotocol mismatch.
//
// Reference: https://deepgram.com/learn/protecting-api-key

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DEEPGRAM_API_BASE = 'https://api.deepgram.com';
const TEMP_KEY_TTL_SECONDS = 30;

// Cache the project ID across requests so we don't pay the GET on every
// recording. The project ID never changes for a given API key.
let cachedProjectId: string | null = null;

async function getProjectId(apiKey: string): Promise<string> {
  if (cachedProjectId) return cachedProjectId;
  const res = await fetch(`${DEEPGRAM_API_BASE}/v1/projects`, {
    headers: { Authorization: `Token ${apiKey}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`projects list failed (${res.status}): ${detail.slice(0, 120)}`);
  }
  const json = (await res.json()) as { projects?: Array<{ project_id: string }> };
  const id = json.projects?.[0]?.project_id;
  if (!id) throw new Error('no Deepgram project found for this API key');
  cachedProjectId = id;
  return id;
}

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
    return NextResponse.json(
      { error: 'transcription not configured' },
      { status: 503 }
    );
  }

  let projectId: string;
  try {
    projectId = await getProjectId(apiKey);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'transcription provider unreachable' },
      { status: 502 }
    );
  }

  let res: Response;
  try {
    res = await fetch(`${DEEPGRAM_API_BASE}/v1/projects/${projectId}/keys`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        comment: `heartnote-voice-log-${user.id.slice(0, 8)}`,
        scopes: ['usage:write'],
        time_to_live_in_seconds: TEMP_KEY_TTL_SECONDS,
      }),
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
      {
        error: `transcription temp-key mint failed (${res.status}): ${detail.slice(0, 200)}`,
      },
      { status: 502 }
    );
  }

  const json = (await res.json()) as { key?: string; expiration_date?: string };
  if (!json.key) {
    return NextResponse.json(
      { error: 'transcription temp-key mint returned no key' },
      { status: 502 }
    );
  }

  return NextResponse.json(
    {
      token: json.key,
      expiresIn: TEMP_KEY_TTL_SECONDS,
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}
