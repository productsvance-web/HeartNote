// Bottom-pinned composer for /log. Single floating dock that owns:
//   - The ear button (opens/closes symptoms sheet)
//   - The live/captured transcript text (italic Fraunces)
//   - The mic OR Save control on the right
//
// Recording-state behavior (added 2026-05-11):
//   - Text region becomes an editable <textarea>. Words Deepgram streams
//     in append to the end of the buffer; the caregiver can place their
//     cursor anywhere and type to correct.
//   - The mic round button morphs into a 44px-tall "Save" pill with a
//     Square indicator. Tap Save → stop recording, persist transcript,
//     re-run extraction against the corrected text.
//
// z-70 so this dock sits ABOVE the symptoms modal (z-60) — the ear is
// IN this dock; tapping it should never make the dock vanish.
//
// Canonical-controls register #7 — see .claude/rules/canonical-controls.md.

'use client';

import { useEffect, useRef } from 'react';
import { Mic, Square, Ear } from 'lucide-react';

interface Props {
  recording: boolean;
  disabled?: boolean;
  transcript: string;
  placeholder?: string;
  symptomHeard: boolean;
  modalOpen: boolean;
  onMicClick: () => void;
  onSaveClick: () => void;
  onEarClick: () => void;
  onTranscriptChange: (value: string) => void;
}

export function LogComposer({
  recording,
  disabled = false,
  transcript,
  placeholder = 'Tap mic and tell the day',
  symptomHeard,
  modalOpen,
  onMicClick,
  onSaveClick,
  onEarClick,
  onTranscriptChange,
}: Props) {
  const hasTranscript = transcript.trim().length > 0;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-scroll the transcript region to the bottom as new words stream in
  // so the most-recent text stays visible without the caregiver scrolling.
  // Skip if the textarea has focus (user is mid-edit) so we don't yank the
  // viewport while they're typing.
  useEffect(() => {
    if (!recording) return;
    const focused =
      typeof document !== 'undefined' &&
      document.activeElement === textareaRef.current;
    if (focused) return;
    const node = textareaRef.current ?? scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [transcript, recording]);

  return (
    <div
      data-log-composer
      className="fixed bottom-0 inset-x-0 z-[70] pointer-events-none"
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
            {recording ? (
              <textarea
                ref={textareaRef}
                value={transcript}
                onChange={(e) => onTranscriptChange(e.target.value)}
                aria-label="Voice log transcript — editable"
                placeholder={placeholder}
                className="w-full font-display italic leading-relaxed resize-none bg-transparent border-0 outline-none"
                style={{
                  fontSize: 15,
                  color: 'var(--foreground)',
                  margin: 0,
                  paddingTop: 6,
                  paddingBottom: 6,
                  minHeight: 24,
                }}
                rows={3}
              />
            ) : (
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
            )}
          </div>

          {/* Right control: Save pill while recording, mic round otherwise */}
          {recording ? (
            <button
              type="button"
              aria-label="Save voice log"
              onClick={onSaveClick}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-3 active:scale-[0.97] transition"
              style={{
                height: 44,
                minWidth: 88,
                background: 'var(--sage-deep)',
                border: '1px solid var(--sage-deep)',
                color: 'var(--card)',
                boxShadow:
                  '0 4px 14px color-mix(in oklab, var(--sage-deep) 35%, transparent)',
                fontWeight: 600,
                fontSize: 14,
                letterSpacing: '0.01em',
              }}
            >
              <Square size={12} fill="currentColor" />
              Save
            </button>
          ) : (
            <button
              type="button"
              aria-label="Start recording"
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
              <Mic size={18} strokeWidth={1.9} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
