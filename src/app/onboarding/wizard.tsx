'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { completeOnboarding } from './actions';
import type { OnboardingPayload } from './actions';

type Props = {
  email: string;
  initialDisplayName: string;
  initialTimezone: string;
};

const NYHA_OPTIONS = [
  { value: 'unknown', label: "I'm not sure" },
  { value: 'I', label: 'Class I — no limits' },
  { value: 'II', label: 'Class II — slight limits' },
  { value: 'III', label: 'Class III — marked limits' },
  { value: 'IV', label: 'Class IV — symptoms at rest' },
] as const;

export function OnboardingWizard({ email, initialDisplayName, initialTimezone }: Props) {
  const [step, setStep] = useState(0);
  const [payload, setPayload] = useState<OnboardingPayload>({
    displayName: initialDisplayName || email.split('@')[0],
    timezone: initialTimezone,
    patient: {
      displayName: '',
      relationship: 'mother',
      dryWeightLb: null,
      nyhaClass: 'unknown',
      cardiologistName: '',
      cardiologistPhone: '',
      normalPillowCount: 1,
      hfHospitalizationCount: 0,
    },
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function next() {
    setError(null);
    setStep((s) => Math.min(s + 1, 3));
  }
  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function submit() {
    startTransition(async () => {
      const result = await completeOnboarding(payload);
      if (!result.ok) setError(result.error);
      // On success the server action redirects to /dashboard.
    });
  }

  return (
    <div className="space-y-6">
      <ProgressDots step={step} total={4} />

      {step === 0 && (
        <Step title="About you" subtitle="So HeartNote knows what to call you.">
          <Field label="Your name">
            <input
              autoFocus
              value={payload.displayName}
              onChange={(e) => setPayload({ ...payload, displayName: e.target.value })}
              className="input"
              placeholder="Jane"
            />
          </Field>
          <Field label="Time zone">
            <select
              value={payload.timezone}
              onChange={(e) => setPayload({ ...payload, timezone: e.target.value })}
              className="input"
            >
              <option value="America/New_York">Eastern (New York)</option>
              <option value="America/Chicago">Central (Chicago)</option>
              <option value="America/Denver">Mountain (Denver)</option>
              <option value="America/Los_Angeles">Pacific (Los Angeles)</option>
              <option value="America/Phoenix">Arizona</option>
              <option value="America/Anchorage">Alaska</option>
              <option value="Pacific/Honolulu">Hawaii</option>
            </select>
          </Field>
          <Actions onNext={next} canNext={!!payload.displayName.trim()} />
        </Step>
      )}

      {step === 1 && (
        <Step title="Who you're caring for" subtitle="The parent (or family member) you're tracking.">
          <Field label="Their name">
            <input
              autoFocus
              value={payload.patient.displayName}
              onChange={(e) => setPayload({ ...payload, patient: { ...payload.patient, displayName: e.target.value } })}
              className="input"
              placeholder="Mom"
            />
          </Field>
          <Field label="Relationship">
            <select
              value={payload.patient.relationship}
              onChange={(e) => setPayload({ ...payload, patient: { ...payload.patient, relationship: e.target.value } })}
              className="input"
            >
              <option value="mother">Mother</option>
              <option value="father">Father</option>
              <option value="grandmother">Grandmother</option>
              <option value="grandfather">Grandfather</option>
              <option value="spouse">Spouse / partner</option>
              <option value="sibling">Sibling</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Actions onBack={back} onNext={next} canNext={!!payload.patient.displayName.trim()} />
        </Step>
      )}

      {step === 2 && (
        <Step
          title="Heart-failure context"
          subtitle="What the cardiologist has told you. Skip anything you don't know."
        >
          <Field label="Dry weight (pounds)" hint='The "target" weight the cardiologist set. Skip if unsure.'>
            <input
              type="number"
              step="0.1"
              value={payload.patient.dryWeightLb ?? ''}
              onChange={(e) =>
                setPayload({
                  ...payload,
                  patient: { ...payload.patient, dryWeightLb: e.target.value ? Number(e.target.value) : null },
                })
              }
              className="input"
              placeholder="158.0"
            />
          </Field>
          <Field label="NYHA class">
            <select
              value={payload.patient.nyhaClass}
              onChange={(e) =>
                setPayload({
                  ...payload,
                  patient: { ...payload.patient, nyhaClass: e.target.value as OnboardingPayload['patient']['nyhaClass'] },
                })
              }
              className="input"
            >
              {NYHA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Cardiologist name">
            <input
              value={payload.patient.cardiologistName}
              onChange={(e) =>
                setPayload({ ...payload, patient: { ...payload.patient, cardiologistName: e.target.value } })
              }
              className="input"
              placeholder="Dr. Patel"
            />
          </Field>
          <Field label="Cardiologist phone">
            <input
              type="tel"
              value={payload.patient.cardiologistPhone}
              onChange={(e) =>
                setPayload({ ...payload, patient: { ...payload.patient, cardiologistPhone: e.target.value } })
              }
              className="input"
              placeholder="555-555-5555"
            />
          </Field>
          <Actions onBack={back} onNext={next} canNext={true} />
        </Step>
      )}

      {step === 3 && (
        <Step title="Baseline" subtitle='So HeartNote knows what "normal" is for them, not the population.'>
          <Field label="Pillows they normally sleep with">
            <input
              type="number"
              min={0}
              max={6}
              value={payload.patient.normalPillowCount}
              onChange={(e) =>
                setPayload({
                  ...payload,
                  patient: { ...payload.patient, normalPillowCount: Number(e.target.value) },
                })
              }
              className="input"
            />
          </Field>
          <Field label="Past heart-failure hospitalizations">
            <input
              type="number"
              min={0}
              value={payload.patient.hfHospitalizationCount}
              onChange={(e) =>
                setPayload({
                  ...payload,
                  patient: { ...payload.patient, hfHospitalizationCount: Number(e.target.value) },
                })
              }
              className="input"
            />
          </Field>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Actions
            onBack={back}
            onNext={submit}
            nextLabel={isPending ? 'Setting up…' : 'Finish setup'}
            canNext={!isPending}
          />
        </Step>
      )}
    </div>
  );
}

function Step({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </header>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Actions({
  onBack,
  onNext,
  nextLabel = 'Continue',
  canNext = true,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  canNext?: boolean;
}) {
  return (
    <div className="flex gap-3 pt-2">
      {onBack && (
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
      )}
      <Button type="button" onClick={onNext} disabled={!canNext} className="flex-1">
        {nextLabel}
      </Button>
    </div>
  );
}

function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i === step ? 'w-8 bg-foreground' : i < step ? 'w-1.5 bg-foreground' : 'w-1.5 bg-muted'
          }`}
        />
      ))}
    </div>
  );
}
