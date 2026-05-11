// Shared limits for the voice-log lifecycle. Server and client must agree
// on these or the sweep can race the recording.

// Max length of a single recording, enforced client-side by the auto-stop
// timer in src/app/log/log-page-client.tsx.
export const MAX_RECORD_SECONDS = 120;

// Lease window for the 'pending' placeholder. The sweep in
// src/lib/voice-log/inflight-gate.ts treats any pending row older than
// this with no transcript and no observations as abandoned and deletes
// it. The lease MUST exceed MAX_RECORD_SECONDS (a recording sitting at
// the cap is still legitimately pending) plus the round-trip time for
// the user's stop-tap and processVoiceLog's first UPDATE that flips
// status to 'analyzing'. 5 minutes is comfortably > 2 × MAX_RECORD_SECONDS
// so a max-length recording, even with a slow upload + Claude warmup,
// can't be reaped mid-flight.
export const VOICE_LOG_LEASE_MS = 5 * 60 * 1000;
