// VitalCard — thin wrapper around Card chassis for the five vitals on /log
// (weight, pillows, BP, HR, SpO2). Header is label + optional contextLine
// + status dot. The control (stepper / dual-stepper) slots in via children.
//
// All visual register lives in Card.tsx; this file just composes the props.

'use client';

import { Card, type VitalCardState } from './Card';
import type { Tone } from '@/lib/log/helper-text';

export type { VitalCardState };

interface Props {
  label: string;
  contextLine?: string;
  state: VitalCardState;
  tone: Tone;
  helper: string;
  children: React.ReactNode;
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
  return (
    <Card
      state={state}
      tone={tone}
      helper={helper}
      fieldKey={fieldKey}
      label={{ text: label, contextLine }}
    >
      {children}
    </Card>
  );
}
