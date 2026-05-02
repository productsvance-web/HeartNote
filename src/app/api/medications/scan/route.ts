import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  extractMedicationsFromImage,
  SafetyFilterError,
  ExtractionError,
  RateLimitError,
} from '@/lib/medications/scan/extract';

// Photo extraction endpoint. Accepts a base64 data URL, runs it through
// Vertex AI / Gemini 2.5 Flash, returns extracted medications. No DB
// writes from this route — the caregiver confirms each card client-side
// and saves through the existing addMedication server action.
//
// Hard cap on decoded image size — keeps the worst-case inflight payload
// bounded even though we compress client-side.

const MAX_DECODED_BYTES = 1_200_000;

const BodySchema = z.object({
  imageDataUrl: z
    .string()
    .startsWith('data:image/')
    .max(2_500_000, 'image too large'),
});

function parseDataUrl(
  dataUrl: string
): { bytes: Uint8Array; mimeType: 'image/jpeg' | 'image/png' } | null {
  const match = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const mimeType = match[1] as 'image/jpeg' | 'image/png';
  const base64 = match[2];
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    return null;
  }
  return { bytes: new Uint8Array(buf), mimeType };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'invalid body' },
      { status: 400 }
    );
  }

  const decoded = parseDataUrl(parsed.data.imageDataUrl);
  if (!decoded) {
    return NextResponse.json(
      { error: 'image must be JPEG or PNG' },
      { status: 400 }
    );
  }
  if (decoded.bytes.byteLength > MAX_DECODED_BYTES) {
    return NextResponse.json(
      { error: 'Image too large. Try a closer photo.' },
      { status: 400 }
    );
  }

  try {
    const result = await extractMedicationsFromImage(decoded.bytes, decoded.mimeType);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Try again in a moment.' },
        { status: 429 }
      );
    }
    if (err instanceof SafetyFilterError) {
      return NextResponse.json(
        { error: "We couldn't process this image. Try another." },
        { status: 422 }
      );
    }
    if (err instanceof ExtractionError) {
      return NextResponse.json(
        { error: "Couldn't read this one — try a clearer photo or add manually." },
        { status: 504 }
      );
    }
    // Env-missing or other unexpected — log message + name only. The raw
    // error object can contain the request payload (image bytes are PHI),
    // so never pass `err` itself to console.error.
    const name = err instanceof Error ? err.name : 'unknown';
    const message = err instanceof Error ? err.message : 'unknown';
    console.error(`[POST /api/medications/scan] ${name}: ${message}`);
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 });
  }
}
