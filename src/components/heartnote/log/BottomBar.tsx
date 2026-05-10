// Two ghost-circle utility buttons (mic + ear) at the bottom of /log.
// Apple-Weather utility style, 46×46. Per L7 + the design mockup.
//
// Mic icon + recording state: receives `recording` and toggles to a
// "listening" filled glyph during dictation.
//
// Ear icon: swaps to a sage-deep filled variant when ≥1 symptom has been
// heard from voice today (regardless of modal-open state). Modal-open
// state is independent of the glow.

'use client';

import { Mic, Square, Ear } from 'lucide-react';

interface Props {
  recording: boolean;
  symptomHeard: boolean;
  modalOpen: boolean;
  onMicClick: () => void;
  onEarClick: () => void;
}

export function BottomBar({
  recording,
  symptomHeard,
  modalOpen,
  onMicClick,
  onEarClick,
}: Props) {
  return (
    <div
      className="sticky bottom-0 left-0 right-0 px-4 pb-4 pt-2 flex items-center justify-between"
      style={{
        background:
          'linear-gradient(180deg, transparent 0%, var(--background) 30%)',
        zIndex: 30,
      }}
    >
      <button
        type="button"
        aria-label={recording ? 'Stop recording and save' : 'Start recording'}
        onClick={onMicClick}
        className="inline-flex items-center justify-center rounded-full active:scale-[0.94] transition"
        style={{
          width: 46,
          height: 46,
          background: recording
            ? 'var(--sage-deep)'
            : 'var(--card)',
          border: recording
            ? '1px solid var(--sage-deep)'
            : '0.5px solid var(--border)',
          color: recording ? 'var(--card)' : 'var(--foreground)',
          boxShadow: recording
            ? '0 4px 14px color-mix(in oklab, var(--sage-deep) 35%, transparent)'
            : '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        {recording ? (
          <Square size={16} fill="currentColor" />
        ) : (
          <Mic size={18} strokeWidth={1.8} />
        )}
      </button>

      <button
        type="button"
        aria-label={
          modalOpen
            ? 'Close symptoms'
            : symptomHeard
              ? 'Open symptoms — symptom heard from voice'
              : 'Open symptoms'
        }
        aria-pressed={modalOpen}
        onClick={onEarClick}
        className="inline-flex items-center justify-center rounded-full active:scale-[0.94] transition"
        style={{
          width: 46,
          height: 46,
          background: symptomHeard
            ? 'var(--sage-deep)'
            : 'var(--card)',
          border: symptomHeard
            ? '1px solid var(--sage-deep)'
            : '0.5px solid var(--border)',
          color: symptomHeard ? 'var(--card)' : 'var(--foreground)',
          boxShadow: symptomHeard
            ? '0 4px 14px color-mix(in oklab, var(--sage-deep) 35%, transparent)'
            : '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <Ear
          size={18}
          strokeWidth={1.8}
          fill={symptomHeard ? 'currentColor' : 'none'}
        />
      </button>
    </div>
  );
}
