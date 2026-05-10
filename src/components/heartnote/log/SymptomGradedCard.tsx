// Card for graded symptoms inside the SymptomsModal: status dot · Fraunces
// label · optional context line · segmented control · helper. Shares the
// chassis shape with VitalCard but the control is a SegmentedControl
// instead of a stepper.
//
// The `state` prop is the same VitalCardState ('muted'|'heard'|'tapped'|'alert')
// — drives border-color + box-shadow ring + corner pip the same way.

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
      className="relative"
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
            className="flex-shrink-0 text-right"
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
      <div style={{ margin: '9px 0 8px' }}>
        <SegmentedControl
          options={options}
          value={value}
          onChange={onChange}
          ariaLabel={label}
          activeVariant={activeVariant}
        />
      </div>
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
