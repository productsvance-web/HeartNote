// Lazy cleanup + in-flight check for the voice-log placeholder lock.
//
// The voice path creates a daily_logs row with processing_status='pending'
// the moment the user taps the mic. That row exists to serialize against
// the tap-save and trends-save paths — they refuse to write while a voice
// extraction is in flight, so a Claude-extracted reading and a tap-save
// can't race for the same row. State machine:
//   pending  ─ user stops recording ─→ analyzing ─ Claude returns ─→ complete
//
// Failure mode this addresses: if the user closes the tab, loses network,
// or the browser crashes between mic-tap and stop-tap, the row stays in
// 'pending' forever. Without an expiry, that row would silently block
// every save for the rest of the local day. discardEmptyVoiceLog only
// catches the next-mic-tap case in the same browser session.
//
// Pattern: lease with TTL. The placeholder is a short-lived lock; anything
// past the lease with no content is treated as abandoned and reaped on
// the next write. An 'analyzing' row always blocks (Claude is actively
// extracting); a 'pending' row blocks only within the lease window — the
// sweep below clears anything older first.
//
// No background reaper needed: lazy cleanup on the write path catches
// abandoned rows the next time the same caregiver does anything.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';
import { VOICE_LOG_LEASE_MS } from '@/lib/voice-log/limits';

// Sweeps the patient's empty-pending rows older than the lease, then
// reports whether any genuinely-in-flight row remains for today. Callers
// gate their write on the return value with the
// "Voice log still processing" error.
export async function isVoiceLogInflight(
  supabase: SupabaseClient<Database>,
  patientId: string,
  today: string,
): Promise<boolean> {
  await sweepAbandonedVoiceLogs(supabase, patientId);

  const { data: inflight } = await supabase
    .from('daily_logs')
    .select('id')
    .eq('patient_id', patientId)
    .eq('log_date', today)
    .in('processing_status', ['pending', 'analyzing']);

  return Boolean(inflight && inflight.length > 0);
}

// Standalone sweep without the gate check. Used by flushAndStartVoice so
// starting a new recording doesn't have to be blocked by an old abandoned
// placeholder, but also doesn't accumulate cruft over time.
//
// Scope: cross-day on purpose. An abandoned row from yesterday's evening
// session shouldn't survive into today; the lease + content-NULL filter
// ensure no row holding user content can be touched. Logs sweep failures
// to console so a silent RLS regression would be visible in server logs
// rather than re-blocking writes invisibly.
export async function sweepAbandonedVoiceLogs(
  supabase: SupabaseClient<Database>,
  patientId: string,
): Promise<void> {
  const cutoffIso = new Date(Date.now() - VOICE_LOG_LEASE_MS).toISOString();
  const { error } = await supabase
    .from('daily_logs')
    .delete()
    .eq('patient_id', patientId)
    .eq('processing_status', 'pending')
    .is('transcribed_text', null)
    .is('structured_observations', null)
    .lt('created_at', cutoffIso);
  if (error) {
    console.warn('voice-log sweep failed', { patientId, error: error.message });
  }
}
