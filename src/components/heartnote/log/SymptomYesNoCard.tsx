// Yes/No symptom row inside the SymptomsModal. Used for tier-1 red-flag
// checks (chest pain, syncope, cyanosis) and tier-2 watchpoints (PND,
// early satiety, cold/clammy extremities, irregular pulse, dizziness,
// nausea). When "Yes" is the answer, the card lights up via state='alert'
// (tier-1) or state='tapped' with warn tone (tier-2).
//
// Compact .vc--yn variant: Fraunces 13.5px question, Yes/No control on
// the same row as the helper text via justify-between (mockup-verbatim).
// dizziness has an optional follow-up segmented control "On standing,
// or persistent?" — rendered when present=true.
//
// Visual register matches docs/design/heartnote-log-redesign-mockup.html
// (.vc.vc--yn / .vc-question / .vc-row / .yesno / .yesno-btn).

'use client';

import type { VitalCardState } from './VitalCard';
import type { Tone } from '@/lib/log/helper-text';

interface Props {
  question: string;
  helper?: string;
  state: VitalCardState;
  tone: Tone;
  value: boolean | null;
  onChange: (v: boolean) => void;
  fieldKey: string;
  // Banner severity if "Yes" is tapped. Drives the active "Yes" pill
  // variant (tier-1 = alert, tier-2 = warn).
  yesVariant?: 'warn' | 'alert';
  // Optional follow-up control (e.g. dizziness "On standing, or persistent?")
  followUp?: React.ReactNode;
}

export function SymptomYesNoCard({
  question,
  helper,
  state,
  tone,
  value,
  onChange,
  fieldKey,
  yesVariant = 'warn',
  followUp,
}: Props) {
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

  return (
    <section
      data-state={state}
      data-tone={tone}
      data-field={fieldKey}
      className="relative"
      style={{
        background: 'var(--cream-card)',
        border: `1px solid ${borderColor}`,
        borderRadius: 18,
        padding: '10px 14px 10px',
        boxShadow: ringShadow,
      }}
    >
      {pipLabel && (
        <span
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
      {/* .vc-question — Fraunces 13.5px medium. */}
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
      {/* .vc-row — Yes/No on the same row as the helper text. */}
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
        <YesNo
          value={value}
          onChange={onChange}
          ariaLabel={question}
          yesVariant={yesVariant}
        />
      </div>
      {followUp && <div style={{ marginTop: 8 }}>{followUp}</div>}
    </section>
  );
}

// .yesno — separate Yes/No pills with their own borders, max-width 200px.
// Active "Yes" carries the tier-1/tier-2 variant; active "No" stays sage.
function YesNo({
  value,
  onChange,
  ariaLabel,
  yesVariant,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  ariaLabel: string;
  yesVariant: 'warn' | 'alert';
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex"
      style={{ gap: 6, flex: 1, maxWidth: 200 }}
    >
      <YesNoBtn
        active={value === false}
        // "No" always lights up sage when active.
        variant="sage"
        onClick={() => onChange(false)}
      >
        No
      </YesNoBtn>
      <YesNoBtn
        active={value === true}
        variant={yesVariant}
        onClick={() => onChange(true)}
      >
        Yes
      </YesNoBtn>
    </div>
  );
}

function YesNoBtn({
  active,
  variant,
  onClick,
  children,
}: {
  active: boolean;
  variant: 'sage' | 'warn' | 'alert';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const activeBg =
    variant === 'alert'
      ? 'var(--alert-bg)'
      : variant === 'warn'
        ? 'var(--warn-bg)'
        : 'var(--sage-deep)';
  const activeColor =
    variant === 'alert'
      ? 'var(--alert-ink)'
      : variant === 'warn'
        ? 'var(--warn-ink)'
        : 'var(--cream-card)';
  const activeBorder =
    variant === 'alert'
      ? 'var(--alert-line)'
      : variant === 'warn'
        ? 'var(--warn-line)'
        : 'var(--sage-deep)';
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className="flex-1 transition active:scale-[0.97]"
      style={{
        border: `1px solid ${active ? activeBorder : 'var(--sage-mist)'}`,
        background: active ? activeBg : 'transparent',
        color: active ? activeColor : 'var(--muted-foreground)',
        padding: '8px 14px',
        borderRadius: 999,
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        letterSpacing: '0.2px',
      }}
    >
      {children}
    </button>
  );
}
