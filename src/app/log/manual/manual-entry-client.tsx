'use client';

// Client form for /log/manual. Local state for 5 cards; Save calls the
// server action and routes to /dashboard on success. Save is disabled
// until at least one control is touched (per plan §11).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { VitalsRow } from '@/components/heartnote/manual-entry/VitalsRow';
import { SegmentedControl } from '@/components/heartnote/manual-entry/SegmentedControl';
import { StepperControl } from '@/components/heartnote/manual-entry/StepperControl';
import {
  saveManualVitalsEntry,
  type SaveManualVitalsInput,
} from './actions';

type SwellingState = {
  severity: 0 | 1 | 2 | 3 | 4;
  region: 'ankles' | 'calves' | 'thighs' | 'abdomen' | null;
  clearsOvernight: boolean;
};

type BreathingState = 0 | 1 | 2 | 3 | 4;
type CoughState = 'none' | 'daytime' | 'nocturnal';

interface Props {
  latestWeightLb: number | null;
  normalPillowCount: number;
  today: string;
}

export function ManualEntryClient({
  latestWeightLb,
  normalPillowCount,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [weight, setWeight] = useState<number | null>(null);
  const [swelling, setSwelling] = useState<SwellingState | null>(null);
  const [breathing, setBreathing] = useState<BreathingState | null>(null);
  const [pillows, setPillows] = useState<number | null>(null);
  const [cough, setCough] = useState<CoughState | null>(null);

  const anyTouched =
    weight !== null ||
    swelling !== null ||
    breathing !== null ||
    pillows !== null ||
    cough !== null;

  const onSave = () => {
    setError(null);
    const payload: SaveManualVitalsInput = {
      weightLb: weight,
      swelling: swelling,
      breathingSeverity: breathing,
      pillowCount: pillows,
      cough,
    };
    startTransition(async () => {
      const result = await saveManualVitalsEntry(payload);
      if (result.ok) {
        router.push('/dashboard');
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <div className="px-4 mt-3 pb-32 space-y-3">
      {/* Weight */}
      <VitalsRow
        label="Weight"
        secondary={
          latestWeightLb !== null
            ? `last ${latestWeightLb.toFixed(1)} lb`
            : undefined
        }
      >
        <StepperControl
          value={weight}
          defaultValue={latestWeightLb}
          min={50}
          max={700}
          step={0.2}
          fieldLabel="weight"
          formatValue={(v) => `${v.toFixed(1)} lb`}
          placeholder="— lb"
          onChange={setWeight}
          onClear={() => setWeight(null)}
        />
      </VitalsRow>

      {/* Swelling */}
      <VitalsRow label="Swelling">
        <SegmentedControl<0 | 1 | 2 | 3 | 4>
          ariaLabel="Swelling severity"
          options={[
            { value: 0, label: 'None' },
            { value: 1, label: 'Mild' },
            { value: 2, label: 'Mod' },
            { value: 3, label: 'Severe' },
            { value: 4, label: 'Whole body' },
          ]}
          value={swelling?.severity ?? null}
          onChange={(severity) => {
            setSwelling((prev) => ({
              severity,
              region: severity === 0 ? null : prev?.region ?? null,
              clearsOvernight: severity === 0 ? false : prev?.clearsOvernight ?? false,
            }));
          }}
        />
        {swelling !== null && swelling.severity > 0 && (
          <div className="mt-3 space-y-3">
            <SegmentedControl<'ankles' | 'calves' | 'thighs' | 'abdomen'>
              ariaLabel="Swelling location"
              options={[
                { value: 'ankles', label: 'Ankles' },
                { value: 'calves', label: 'Calves' },
                { value: 'thighs', label: 'Thighs' },
                { value: 'abdomen', label: 'Abdomen' },
              ]}
              value={swelling.region}
              onChange={(region) =>
                setSwelling((prev) => (prev ? { ...prev, region } : prev))
              }
            />
            <label className="flex items-center gap-2 text-[13px] text-foreground select-none cursor-pointer">
              <input
                type="checkbox"
                checked={swelling.clearsOvernight}
                onChange={(e) =>
                  setSwelling((prev) =>
                    prev ? { ...prev, clearsOvernight: e.target.checked } : prev,
                  )
                }
                className="h-4 w-4 rounded"
                style={{ accentColor: 'var(--sage-deep)' }}
              />
              Clears overnight
            </label>
          </div>
        )}
      </VitalsRow>

      {/* Breathing */}
      <VitalsRow label="Breathing">
        <SegmentedControl<0 | 1 | 2 | 3 | 4>
          ariaLabel="Breathing"
          options={[
            { value: 0, label: 'Normal' },
            { value: 1, label: 'Stairs' },
            { value: 2, label: 'Flat walk' },
            { value: 3, label: 'ADLs' },
            { value: 4, label: 'At rest' },
          ]}
          value={breathing}
          onChange={setBreathing}
        />
        {breathing === 4 && (
          <p className="mt-2 text-[12px]" style={{ color: 'var(--status-alert-foreground)' }}>
            Saving will fire a 911 alert on the home screen.
          </p>
        )}
      </VitalsRow>

      {/* Pillows */}
      <VitalsRow
        label="Pillows"
        secondary={`usual ${normalPillowCount}`}
      >
        <StepperControl
          value={pillows}
          defaultValue={normalPillowCount}
          min={0}
          max={10}
          step={1}
          fieldLabel="pillow count"
          unit="tonight"
          placeholder="—"
          onChange={setPillows}
          onClear={() => setPillows(null)}
        />
      </VitalsRow>

      {/* Cough */}
      <VitalsRow label="Cough">
        <SegmentedControl<'none' | 'daytime' | 'nocturnal'>
          ariaLabel="Cough"
          options={[
            { value: 'none', label: 'No cough' },
            { value: 'daytime', label: 'Daytime' },
            { value: 'nocturnal', label: 'Nocturnal' },
          ]}
          value={cough}
          onChange={setCough}
        />
      </VitalsRow>

      {/* Save bar */}
      <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-4 bg-gradient-to-t from-background via-background to-transparent">
        {error && (
          <p
            className="mb-2 text-[13px] text-center"
            style={{ color: 'var(--status-alert-foreground)' }}
          >
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!anyTouched || pending}
          aria-disabled={!anyTouched || pending}
          className="w-full rounded-full font-semibold transition active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: 'var(--sage-deep)',
            color: 'var(--card)',
            height: 52,
            fontSize: 16,
            boxShadow:
              '0 4px 14px color-mix(in oklab, var(--sage-deep) 25%, transparent)',
          }}
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
