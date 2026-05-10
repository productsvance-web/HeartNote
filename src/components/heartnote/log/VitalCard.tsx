// Card chassis for the five vitals on /log: status dot · Fraunces label ·
// context-line · control · helper · corner pip per state.
//
// state vs tone: state ('muted'|'heard'|'tapped'|'alert') drives the
// border-color + box-shadow ring + corner pip variant; tone
// ('calm'|'watch'|'urgent') drives helper-text color. They're independent —
// a tapped card can have a calm helper, a heard card can have a watch
// helper, etc.
//
// Visual register matches docs/design/heartnote-log-redesign-mockup.html
// (.vc / .vc-head / .vc-label / .vc-context / .vc-helper / .corner-pip).

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
  // Border + ring per state. Mockup uses border-color + box-shadow rather
  // than outline. Muted = sage-mist (default border, no shadow).
  const borderColor = (() => {
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
  })();

  const ringShadow = (() => {
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

  // Corner-pip styling per mockup. heard = sage-deep + cream-card text;
  // tapped = warn-line + ink text; alert = alert-line + white text.
  const pipBg = (() => {
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
  })();
  const pipColor = (() => {
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
  })();

  // Helper text color per tone (mockup .vc-helper{,.calm,.watch,.alert}).
  // calm uses sage-deep; watch uses warn-ink; alert uses alert-ink+500.
  const helperColor = (() => {
    switch (tone) {
      case 'watch':
        return 'var(--warn-ink)';
      case 'urgent':
        return 'var(--alert-ink)';
      default:
        return 'var(--sage-deep)';
    }
  })();
  const helperWeight = tone === 'urgent' ? 500 : 400;

  // Status dot color in the label row, per tone.
  const dotColor = (() => {
    switch (tone) {
      case 'watch':
        return 'var(--warn-line)';
      case 'urgent':
        return 'var(--alert-line)';
      default:
        return 'var(--sage)';
    }
  })();

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
        padding: '11px 14px 11px',
        boxShadow: ringShadow,
      }}
    >
      {pipLabel && (
        <span
          // .corner-pip — 8.5px font, 0.6px tracking, 3×8 padding.
          className="absolute inline-flex items-center"
          style={{
            top: -6,
            right: 14,
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
            // .vc-label — Fraunces 14px medium, ink color, slight tighten.
            className="font-display"
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--foreground)',
              letterSpacing: '-0.2px',
            }}
          >
            {label}
          </span>
        </div>
        {contextLine && (
          <span
            className="tabular-nums flex-shrink-0 text-right"
            style={{
              fontSize: 10.5,
              color: 'var(--ink-faint)',
              lineHeight: 1.3,
            }}
          >
            {contextLine}
          </span>
        )}
      </div>
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
    </section>
  );
}
