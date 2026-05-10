// Card chassis for the five vitals on /log: status dot · label ·
// context-line · control · helper · corner pip per state.
//
// state vs tone: state ('muted'|'heard'|'tapped'|'alert') drives the
// outline ring + corner pip variant; tone ('calm'|'watch'|'urgent')
// drives helper-text color. They're independent — a tapped card can
// have a calm helper, a heard card can have a watch helper, etc.
//
// Card visual register matches docs/design/heartnote-log-redesign-mockup.html
// (vital cards on phone-1).

'use client';

import type { Tone } from '@/lib/log/helper-text';

export type VitalCardState = 'muted' | 'heard' | 'tapped' | 'alert';

interface Props {
  label: string;
  contextLine?: string; // "vs. baseline 178.0 lb" / "cuff · just now"
  state: VitalCardState;
  tone: Tone;
  helper: string;
  children: React.ReactNode; // the control (stepper / dual-stepper)
  // Data attributes for tests + the autosave debounce timing assertion.
  fieldKey: string;
}

export function VitalCard({
  label,
  contextLine,
  state,
  tone,
  helper,
  children,
  fieldKey,
}: Props) {
  // Outline ring per state. Muted = no ring; heard = sage; tapped = warn-line;
  // alert = alert-line. Color is reinforced by the corner pip's text label.
  const ringColor = (() => {
    switch (state) {
      case 'heard':
        return 'var(--sage)';
      case 'tapped':
        return 'var(--status-watch)';
      case 'alert':
        return 'var(--status-alert)';
      default:
        return 'transparent';
    }
  })();

  const pipLabel = (() => {
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
  })();

  const pipBg = (() => {
    switch (state) {
      case 'heard':
        return 'var(--sage)';
      case 'tapped':
        return 'var(--status-watch)';
      case 'alert':
        return 'var(--status-alert)';
      default:
        return 'transparent';
    }
  })();

  const helperColor = (() => {
    switch (tone) {
      case 'watch':
        return 'var(--status-watch-foreground)';
      case 'urgent':
        return 'var(--status-alert-foreground)';
      default:
        return 'var(--muted-foreground)';
    }
  })();

  const dotColor = (() => {
    switch (tone) {
      case 'watch':
        return 'var(--status-watch)';
      case 'urgent':
        return 'var(--status-alert)';
      default:
        return 'var(--sage-deep)';
    }
  })();

  return (
    <section
      data-state={state}
      data-tone={tone}
      data-field={fieldKey}
      className="relative rounded-3xl px-5 py-5 transition-all"
      style={{
        background: 'var(--card)',
        border: '0.5px solid var(--border)',
        outline: state === 'muted' ? 'none' : `1.5px solid ${ringColor}`,
        outlineOffset: state === 'muted' ? 0 : -1,
        boxShadow: '0 1px 8px color-mix(in oklab, var(--sage) 6%, transparent)',
      }}
    >
      {pipLabel && (
        <span
          className="absolute -top-2 right-4 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider text-white"
          style={{
            background: pipBg,
            letterSpacing: '0.08em',
          }}
        >
          {pipLabel}
        </span>
      )}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: dotColor,
            }}
          />
          <span
            className="text-[11px] font-semibold uppercase text-foreground"
            style={{ letterSpacing: '0.08em' }}
          >
            {label}
          </span>
        </div>
        {contextLine && (
          <span className="text-[11.5px] text-muted-foreground tabular-nums">
            {contextLine}
          </span>
        )}
      </div>
      <div>{children}</div>
      {helper && (
        <p
          className="mt-3 text-[12.5px] leading-snug"
          style={{ color: helperColor }}
        >
          {helper}
        </p>
      )}
    </section>
  );
}
