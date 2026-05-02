// Post-record clarification chips for the voice-log review screen.
//
// NOT persisted to any DB column. Returned in the /api/voice-log/[id]/process
// response, rendered once on the review screen, then discarded. See
// architectural decision #8 in docs/plans/medication-flow-v1.md for the
// data-loss trade-off.

export type UnmatchedChipType = 'pick_med' | 'restart_med' | 'add_med';

export interface UnmatchedChip {
  type: UnmatchedChipType;
  // The phrase the caregiver actually said (for `pick_med` and `add_med`) or
  // the matched-but-stopped drug name (for `restart_med`).
  phrase: string;
  // Set only on `restart_med` — the existing medication row to deep-link to.
  medication_id?: string;
}
