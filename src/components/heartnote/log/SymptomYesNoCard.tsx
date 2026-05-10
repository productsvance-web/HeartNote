// Yes/No symptom row inside the SymptomsModal. Used for tier-1 red-flag
// checks (chest pain, syncope, cyanosis) and tier-2 watchpoints (PND,
// early satiety, cold/clammy extremities, irregular pulse, dizziness,
// nausea). When "Yes" is the answer, the card lights up via state='alert'
// (tier-1) or state='tapped' with warn tone (tier-2).
//
// dizziness has an optional follow-up segmented control "On standing,
// or persistent?" — rendered when present=true. Same shape as the
// cough → sputum follow-up.

'use client';

import { SegmentedControl } from './SegmentedControl';
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
  // Banner severity if "Yes" is tapped. Drives the segmented active
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

  return (
    <section
      data-state={state}
      data-tone={tone}
      data-field={fieldKey}
      className="relative rounded-3xl px-5 py-5"
      style={{
        background: 'var(--card)',
        border: '0.5px solid var(--border)',
        outline: state === 'muted' ? 'none' : `1.5px solid ${ringColor}`,
        outlineOffset: state === 'muted' ? 0 : -1,
      }}
    >
      {pipLabel && (
        <span
          className="absolute -top-2 right-4 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider text-white"
          style={{ background: pipBg, letterSpacing: '0.08em' }}
        >
          {pipLabel}
        </span>
      )}
      <p className="text-[14px] font-medium text-foreground mb-3">{question}</p>
      <SegmentedControl
        options={[
          { value: 'no', label: 'No' },
          // The "Yes" pill carries the active variant (warn for tier-2,
          // alert for tier-1) so a tap immediately reads as elevated.
          { value: 'yes', label: 'Yes', variantOverride: yesVariant },
        ]}
        value={value === null ? null : value ? 'yes' : 'no'}
        onChange={(v) => onChange(v === 'yes')}
        ariaLabel={question}
        activeVariant="sage"
      />
      {followUp && <div className="mt-3">{followUp}</div>}
      {helper && (
        <p className="mt-3 text-[12.5px] leading-snug" style={{ color: helperColor }}>
          {helper}
        </p>
      )}
    </section>
  );
}
