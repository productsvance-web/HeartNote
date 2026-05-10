// Yes/No symptom row inside the SymptomsModal. Used for tier-1 red-flag
// checks (chest pain, syncope, cyanosis) and tier-2 watchpoints (PND,
// early satiety, cold/clammy extremities, irregular pulse, dizziness,
// nausea). When "Yes" is the answer, the card lights up via state='alert'
// (tier-1) or state='tapped' with warn tone (tier-2).
//
// Compact .vc--yn variant: Fraunces 13.5px question, Yes/No control on
// the same row as the helper text. Optional `followUp` slot below for
// per-symptom drill-downs (dizziness postural, chest-pain character).
//
// All visual register lives in Card.tsx.

'use client';

import { Card, type VitalCardState } from './Card';
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
  // Optional follow-up control (e.g. dizziness "On standing or persistent",
  // chest-pain free-text character).
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
  return (
    <Card
      state={state}
      tone={tone}
      helper={helper}
      fieldKey={fieldKey}
      variant="compact"
      question={question}
      followUp={followUp}
      ynRow
    >
      <YesNo
        value={value}
        onChange={onChange}
        ariaLabel={question}
        yesVariant={yesVariant}
      />
    </Card>
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
