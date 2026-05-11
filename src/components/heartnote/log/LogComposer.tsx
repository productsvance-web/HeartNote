// Bottom-pinned composer for /log. Single floating dock that owns:
//   - The ear button (opens/closes symptoms sheet)
//   - The live/captured transcript text (italic Fraunces)
//   - The mic button (start/stop voice recording)
//
// Visual reference: the Anthropic Claude mobile-app composer — rounded
// cream card pinned above the keyboard with affordances inline. User
// directive 2026-05-10 ("follow Anthropic"). Coral is reserved in
// HeartNote for clinical alerts, so the primary CTA mic uses
// `--sage-deep` instead of Anthropic's coral.
//
// Replaces the previous sticky <BottomBar> + inline <TranscriptCard>
// pair. The previous mic disappeared after the symptoms modal closed,
// most likely because <BottomBar> used CSS `sticky` and SymptomsModal
// locks `body { overflow: hidden }`. Sticky's parent-overflow contract
// can break on iOS Safari in that state. `position: fixed` has no such
// dependency. (If a deeper compositing cause exists, fixed positioning
// still evades it — strictly safer.)
//
// Canonical-controls register #7 — see .claude/rules/canonical-controls.md.

'use client';

import { useEffect, useRef } from 'react';
import { Mic, Square, Ear } from 'lucide-react';

interface Props {
  recording: boolean;
  disabled?: boolean;
  transcript: string | null;
  placeholder?: string;
  symptomHeard: boolean;
  modalOpen: boolean;
  onMicClick: () => void;
  onEarClick: () => void;
}

export function LogComposer({
  recording,
  disabled = false,
  transcript,
  placeholder = 'Tap mic and tell the day',
  symptomHeard,
  modalOpen,
  onMicClick,
  onEarClick,
}: Props) {
  const hasTranscript = transcript !== null && transcript.trim().length > 0;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the transcript region to the bottom as new words stream in
  // so the most-recent text stays visible without the caregiver scrolling.
  useEffect(() => {
    if (!recording || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcript, recording]);

  return (
    <div
      data-log-composer
      className="fixed bottom-0 inset-x-0 z-50 pointer-events-none"
    >
      <div
        className="mx-auto max-w-md px-3"
        style={{
          paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))',
          paddingTop: 8,
        }}
      >
        <div
          className="pointer-events-auto flex items-center gap-3 rounded-[24px] pr-2 pl-3 py-2"
          style={{
            background: 'color-mix(in oklab, var(--cream-card) 92%, transparent)',
            border:
              '0.5px solid color-mix(in oklab, var(--foreground) 12%, transparent)',
            boxShadow:
              '0 -10px 32px rgba(0,0,0,0.10), 0 -2px 6px rgba(0,0,0,0.05)',
            backdropFilter: 'blur(18px) saturate(160%)',
            WebkitBackdropFilter: 'blur(18px) saturate(160%)',
            minHeight: 60,
          }}
        >
          {/* Ear button — symptoms sheet trigger */}
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
            className="inline-flex shrink-0 items-center justify-center rounded-full active:scale-[0.94] transition"
            style={{
              width: 38,
              height: 38,
              background: symptomHeard ? 'var(--sage-deep)' : 'var(--card)',
              border: symptomHeard
                ? '1px solid var(--sage-deep)'
                : '0.5px solid var(--border)',
              color: symptomHeard ? 'var(--card)' : 'var(--foreground)',
              boxShadow: symptomHeard
                ? '0 2px 8px color-mix(in oklab, var(--sage-deep) 30%, transparent)'
                : 'none',
            }}
          >
            <Ear
              size={16}
              strokeWidth={1.8}
              fill={symptomHeard ? 'currentColor' : 'none'}
            />
          </button>

          {/* Transcript / placeholder area */}
          <div
            ref={scrollRef}
            role="region"
            aria-label="Voice log transcript"
            aria-live={recording ? 'polite' : 'off'}
            className="flex-1 min-w-0 overflow-y-auto"
            style={{
              maxHeight: 96,
              maskImage:
                'linear-gradient(180deg, transparent 0%, black 16%, black 84%, transparent 100%)',
              WebkitMaskImage:
                'linear-gradient(180deg, transparent 0%, black 16%, black 84%, transparent 100%)',
            }}
          >
            <p
              className="font-display italic leading-relaxed"
              style={{
                fontSize: 15,
                color: hasTranscript ? 'var(--foreground)' : 'var(--ink-faint)',
                margin: 0,
                paddingTop: 6,
                paddingBottom: 6,
              }}
            >
              {hasTranscript ? transcript : placeholder}
            </p>
          </div>

          {/* Mic button — primary CTA, sage-deep filled */}
          <button
            type="button"
            aria-label={recording ? 'Stop recording and save' : 'Start recording'}
            onClick={onMicClick}
            disabled={disabled}
            className="inline-flex shrink-0 items-center justify-center rounded-full active:scale-[0.94] transition disabled:cursor-not-allowed"
            style={{
              width: 44,
              height: 44,
              background: 'var(--sage-deep)',
              border: '1px solid var(--sage-deep)',
              color: 'var(--card)',
              opacity: disabled ? 0.45 : 1,
              boxShadow:
                '0 4px 14px color-mix(in oklab, var(--sage-deep) 35%, transparent)',
            }}
          >
            {recording ? (
              <Square size={16} fill="currentColor" />
            ) : (
              <Mic size={18} strokeWidth={1.9} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
