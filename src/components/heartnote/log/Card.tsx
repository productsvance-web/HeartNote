// Shared chassis for the /log cards: VitalCard, SymptomGradedCard, SymptomYesNoCard.
// Owns the visual register that used to be triplicated across all three:
//   - outline ring per `state` ('muted'|'heard'|'tapped'|'alert')
//   - corner pip per state (Heard / Tapped / Alert)
//   - status dot color per `tone` ('calm'|'watch'|'urgent')
//   - helper-text color per tone
//   - padding / border / radius per `variant` ('standard' | 'compact')
//
// Each consumer just composes the right header (label+contextLine OR question)
// and slots the control into `children`. No more switch-statement triplets.
//
// Visual register matches docs/design/heartnote-log-redesign-mockup.html
// (.vc / .vc-head / .vc-label / .vc-context / .vc-question / .vc-row /
//  .vc-helper / .corner-pip / .vc--yn).

'use client';

import type { ReactNode } from 'react';
import type { Tone } from '@/lib/log/helper-text';

export type VitalCardState = 'muted' | 'heard' | 'tapped' | 'alert';

interface CardProps {
  state: VitalCardState;
  tone: Tone;
  helper?: string;
  fieldKey: string;
  variant?: 'standard' | 'compact';
  // Header — exactly one of these. `label` is for VitalCard / SymptomGradedCard;
  // `question` is for SymptomYesNoCard (Fraunces 13.5px).
  label?: { text: string; contextLine?: string };
  question?: string;
  // Slot for the control body (stepper / segmented / yes-no pills, etc.).
  children: ReactNode;
  // Optional follow-up rendered below the control (e.g. dizziness "On
  // standing or persistent?", chest pain character text input).
  followUp?: ReactNode;
  // Layout slot for the YN card so the Yes/No buttons can live on the same
  // row as the helper text (mockup's .vc--yn .vc-row pattern). When present,
  // `children` is treated as the trailing control beside the helper.
  ynRow?: boolean;
}

export function Card({
  state,
  tone,
  helper,
  fieldKey,
  variant = 'standard',
  label,
  question,
  children,
  followUp,
  ynRow,
}: CardProps) {
  const borderColor = stateBorderColor(state);
  const ringShadow = stateRingShadow(state);
  const pipLabel = statePipLabel(state);
  const pipBg = statePipBg(state);
  const pipColor = statePipColor(state);
  const helperColor = toneHelperColor(tone);
  const helperWeight = tone === 'urgent' ? 500 : 400;
  const dotColor = toneDotColor(tone);

  return (
    <section
      data-state={state}
      data-tone={tone}
      data-field={fieldKey}
      className="relative transition-all"
      style={{
        background: 'var(--cream-card)',
        border: `1px solid ${borderColor}`,
        borderRadius: 18,
        padding:
          variant === 'compact' ? '10px 14px 10px' : '11px 14px 11px',
        boxShadow: ringShadow,
      }}
    >
      {pipLabel && (
        <span
          // Pip sits inside the card's top-right corner so it lands on the
          // outline ring instead of levitating above the cream backdrop.
          // Mockup placed it at top:-6px which can read as detached when
          // the box-shadow ring is present; pulling it inside fixes the
          // optical "floating" without losing the pip register.
          className="absolute inline-flex items-center"
          style={{
            top: 8,
            right: 12,
            zIndex: 1,
            fontSize: 8.5,
            fontWeight: 600,
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
            padding: '3px 8px',
            borderRadius: 999,
            lineHeight: 1,
            background: pipBg,
            color: pipColor,
          }}
        >
          {pipLabel}
        </span>
      )}

      {label && (
        <div className="flex items-baseline justify-between gap-2">
          <div className="inline-flex items-center" style={{ gap: 7 }}>
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: dotColor,
                flexShrink: 0,
              }}
            />
            <span
              className="font-display"
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--foreground)',
                letterSpacing: '-0.2px',
              }}
            >
              {label.text}
            </span>
          </div>
          {label.contextLine && (
            <span
              className="tabular-nums flex-shrink-0 text-right"
              style={{
                fontSize: 10.5,
                color: 'var(--ink-faint)',
                lineHeight: 1.3,
              }}
            >
              {label.contextLine}
            </span>
          )}
        </div>
      )}

      {question && (
        <p
          className="font-display"
          style={{
            fontSize: 13.5,
            fontWeight: 500,
            color: 'var(--foreground)',
            letterSpacing: '-0.1px',
            lineHeight: 1.3,
          }}
        >
          {question}
        </p>
      )}

      {ynRow ? (
        // Helper text and the Yes/No control share a row (mockup .vc--yn .vc-row).
        <div
          className="flex items-center justify-between"
          style={{ marginTop: 8, gap: 10 }}
        >
          {helper ? (
            <p
              className="flex-1"
              style={{
                fontSize: 10.5,
                color: helperColor,
                fontWeight: helperWeight,
                lineHeight: 1.4,
              }}
            >
              {helper}
            </p>
          ) : (
            <span aria-hidden className="flex-1" />
          )}
          {children}
        </div>
      ) : (
        <>
          <div style={{ margin: '9px 0 8px' }}>{children}</div>
          {helper && (
            <p
              style={{
                fontSize: 10.5,
                color: helperColor,
                fontWeight: helperWeight,
                lineHeight: 1.4,
              }}
            >
              {helper}
            </p>
          )}
        </>
      )}

      {followUp && <div style={{ marginTop: 8 }}>{followUp}</div>}
    </section>
  );
}

// ─── Visual register helpers (single source for state→style mapping) ────────

function stateBorderColor(state: VitalCardState): string {
  switch (state) {
    case 'heard':
      return 'color-mix(in oklab, var(--sage) 50%, transparent)';
    case 'tapped':
      return 'color-mix(in oklab, var(--warn-line) 60%, transparent)';
    case 'alert':
      return 'color-mix(in oklab, var(--alert-line) 70%, transparent)';
    default:
      return 'var(--sage-mist)';
  }
}

function stateRingShadow(state: VitalCardState): string {
  switch (state) {
    case 'heard':
      return '0 0 0 3px color-mix(in oklab, var(--sage) 16%, transparent)';
    case 'tapped':
      return '0 0 0 3px color-mix(in oklab, var(--warn-line) 18%, transparent)';
    case 'alert':
      return '0 0 0 3px color-mix(in oklab, var(--alert-line) 18%, transparent)';
    default:
      return 'none';
  }
}

function statePipLabel(state: VitalCardState): string | null {
  switch (state) {
    case 'heard':
      return 'Heard';
    case 'tapped':
      return 'Tapped';
    case 'alert':
      return 'Alert';
    default:
      return null;
  }
}

function statePipBg(state: VitalCardState): string {
  switch (state) {
    case 'heard':
      return 'var(--sage-deep)';
    case 'tapped':
      return 'var(--warn-line)';
    case 'alert':
      return 'var(--alert-line)';
    default:
      return 'transparent';
  }
}

function statePipColor(state: VitalCardState): string {
  switch (state) {
    case 'heard':
      return 'var(--cream-card)';
    case 'tapped':
      return 'var(--foreground)';
    case 'alert':
      return '#ffffff';
    default:
      return 'transparent';
  }
}

function toneHelperColor(tone: Tone): string {
  switch (tone) {
    case 'watch':
      return 'var(--warn-ink)';
    case 'urgent':
      return 'var(--alert-ink)';
    default:
      return 'var(--sage-deep)';
  }
}

function toneDotColor(tone: Tone): string {
  switch (tone) {
    case 'watch':
      return 'var(--warn-line)';
    case 'urgent':
      return 'var(--alert-line)';
    default:
      return 'var(--sage)';
  }
}
