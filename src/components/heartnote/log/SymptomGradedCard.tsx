// Card for graded symptoms inside the SymptomsModal: status dot · label ·
// optional context line · segmented control · helper. Shares the chassis
// shape with VitalCard but the control is a SegmentedControl instead of
// a stepper.
//
// The `state` prop is the same VitalCardState ('muted'|'heard'|'tapped'|'alert')
// — drives outline ring + corner pip the same way.

'use client';

import { SegmentedControl } from './SegmentedControl';
import type { VitalCardState } from './VitalCard';
import type { Tone } from '@/lib/log/helper-text';

interface Option<V extends string | number> {
  value: V;
  label: string;
  variantOverride?: 'sage' | 'warn' | 'alert';
}

interface Props<V extends string | number> {
  label: string;
  contextLine?: string;
  state: VitalCardState;
  tone: Tone;
  helper?: string;
  options: Option<V>[];
  value: V | null;
  onChange: (v: V) => void;
  activeVariant?: 'sage' | 'warn' | 'alert';
  fieldKey: string;
}

export function SymptomGradedCard<V extends string | number>({
  label,
  contextLine,
  state,
  tone,
  helper,
  options,
  value,
  onChange,
  activeVariant,
  fieldKey,
}: Props<V>) {
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
          <span className="text-[11.5px] text-muted-foreground">{contextLine}</span>
        )}
      </div>
      <SegmentedControl
        options={options}
        value={value}
        onChange={onChange}
        ariaLabel={label}
        activeVariant={activeVariant}
      />
      {helper && (
        <p className="mt-3 text-[12.5px] leading-snug" style={{ color: helperColor }}>
          {helper}
        </p>
      )}
    </section>
  );
}
