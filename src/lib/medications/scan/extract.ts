// Server-only Vertex AI medication extraction.
//
// Single round trip to Gemini 2.5 Flash with a structured-output schema
// binding so the response is guaranteed-valid JSON in our shape. 15s
// hard timeout. Distinguishes safety-filtered responses from genuine
// zero-meds so the API route can surface the right UI message.
//
// PHI safety: outbound payload is image bytes + system prompt + JSON
// schema. No patient identifier, no caregiver identifier — the bottle
// itself carries label PHI, which is the intentional input.
//
// Caching: build convention #3 ("prompt caching enabled from day 1") is
// Anthropic-specific. Vertex AI's createCachedContent is a separate
// provisioned-resource model; not justified at this scale (system
// prompt is ~400 tokens, scan frequency is low). See
// docs/plans/medication-scan-v1.md §architectural-decisions #11.

import { VertexAI, FinishReason } from '@google-cloud/vertexai';
import type { JWTInput } from 'google-auth-library';
import {
  ExtractionResponseSchema,
  extractedMedsResponseSchema,
  type ExtractedMed,
} from './schema';
import { EXTRACTION_SYSTEM_PROMPT } from './prompt';

const TIMEOUT_MS = 15_000;
const MODEL = 'gemini-2.5-flash';
const MAX_MEDS = 30;

export class SafetyFilterError extends Error {
  constructor() {
    super('Vertex AI returned a safety-filtered response');
    this.name = 'SafetyFilterError';
  }
}

export class ExtractionError extends Error {
  constructor(reason: string) {
    super(`extract: ${reason}`);
    this.name = 'ExtractionError';
  }
}

let cachedClient: VertexAI | null = null;
function getVertexClient(): VertexAI {
  if (cachedClient) return cachedClient;
  const project = process.env.GOOGLE_VERTEX_AI_PROJECT_ID;
  const location = process.env.GOOGLE_VERTEX_AI_LOCATION;
  const credentialsB64 = process.env.GOOGLE_VERTEX_AI_CREDENTIALS_JSON;
  if (!project || !location || !credentialsB64) {
    throw new Error(
      'Vertex AI env vars missing: GOOGLE_VERTEX_AI_PROJECT_ID, GOOGLE_VERTEX_AI_LOCATION, GOOGLE_VERTEX_AI_CREDENTIALS_JSON'
    );
  }
  let credentials: JWTInput;
  try {
    credentials = JSON.parse(
      Buffer.from(credentialsB64, 'base64').toString('utf-8')
    );
  } catch {
    throw new Error('GOOGLE_VERTEX_AI_CREDENTIALS_JSON is not valid base64-encoded JSON');
  }
  cachedClient = new VertexAI({
    project,
    location,
    googleAuthOptions: { credentials },
  });
  return cachedClient;
}

export async function extractMedicationsFromImage(
  bytes: Uint8Array,
  mimeType: 'image/jpeg' | 'image/png'
): Promise<{ medications: ExtractedMed[] }> {
  const model = getVertexClient().getGenerativeModel({
    model: MODEL,
    systemInstruction: {
      role: 'system',
      parts: [{ text: EXTRACTION_SYSTEM_PROMPT }],
    },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: extractedMedsResponseSchema,
    },
  });

  const base64 = Buffer.from(bytes).toString('base64');
  const generatePromise = model.generateContent({
    contents: [
      {
        role: 'user',
        parts: [{ inlineData: { mimeType, data: base64 } }],
      },
    ],
  });

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new ExtractionError('timeout'));
    }, TIMEOUT_MS);
  });

  let result;
  try {
    result = await Promise.race([generatePromise, timeoutPromise]);
  } catch (err) {
    console.warn(
      `[extractMedicationsFromImage] ${err instanceof Error ? err.message : 'unknown'}`
    );
    throw err;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }

  const candidate = result.response.candidates?.[0];
  const finishReason = candidate?.finishReason;

  if (
    finishReason === FinishReason.SAFETY ||
    finishReason === FinishReason.BLOCKLIST ||
    finishReason === FinishReason.PROHIBITED_CONTENT ||
    finishReason === FinishReason.SPII
  ) {
    console.warn('[extractMedicationsFromImage] safety-filter');
    throw new SafetyFilterError();
  }

  if (finishReason !== FinishReason.STOP) {
    console.warn(
      `[extractMedicationsFromImage] finishReason=${finishReason ?? 'unknown'}`
    );
    throw new ExtractionError(`finishReason=${finishReason ?? 'unknown'}`);
  }

  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    console.warn('[extractMedicationsFromImage] empty-response');
    throw new ExtractionError('empty-response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.warn('[extractMedicationsFromImage] invalid-json');
    throw new ExtractionError('invalid-json');
  }

  const validation = ExtractionResponseSchema.safeParse(parsed);
  if (!validation.success) {
    console.warn('[extractMedicationsFromImage] schema-fail');
    throw new ExtractionError('schema-fail');
  }

  return { medications: validation.data.medications.slice(0, MAX_MEDS) };
}
