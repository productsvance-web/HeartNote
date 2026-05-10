// Card for graded symptoms inside the SymptomsModal. Header is label +
// optional contextLine + status dot; control is a SegmentedControl.
//
// All visual register lives in Card.tsx — this file just composes the props.

'use client';

import { Card, type VitalCardState } from './Card';
import { SegmentedControl } from './SegmentedControl';
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
  return (
    <Card
      state={state}
      tone={tone}
      helper={helper}
      fieldKey={fieldKey}
      label={{ text: label, contextLine }}
    >
      <SegmentedControl
        options={options}
        value={value}
        onChange={onChange}
        ariaLabel={label}
        activeVariant={activeVariant}
      />
    </Card>
  );
}
