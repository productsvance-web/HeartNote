'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { savePatient, type SavePatientPayload } from './actions';

type NyhaClass = 'I' | 'II' | 'III' | 'IV' | 'unknown';

interface Props {
  patientId: string;
  initialDisplayName: string;
  initialRelationship: string;
  initialDryWeightLb: number | null;
  initialNyhaClass: NyhaClass | null;
  initialCardiologistName: string;
  initialCardiologistPhone: string;
  initialNormalPillowCount: number | null;
  initialDateOfBirth: string | null;
}

export function PatientEditForm({
  patientId,
  initialDisplayName,
  initialRelationship,
  initialDryWeightLb,
  initialNyhaClass,
  initialCardiologistName,
  initialCardiologistPhone,
  initialNormalPillowCount,
  initialDateOfBirth,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [relationship, setRelationship] = useState(initialRelationship);
  const [dryWeight, setDryWeight] = useState<string>(
    initialDryWeightLb === null ? '' : String(initialDryWeightLb),
  );
  const [nyhaClass, setNyhaClass] = useState<NyhaClass | null>(initialNyhaClass);
  const [cardiologistName, setCardiologistName] = useState(initialCardiologistName);
  const [cardiologistPhone, setCardiologistPhone] = useState(initialCardiologistPhone);
  const [pillows, setPillows] = useState<string>(
    initialNormalPillowCount === null ? '' : String(initialNormalPillowCount),
  );
  const [dateOfBirth, setDateOfBirth] = useState<string>(initialDateOfBirth ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const dryWeightNum = dryWeight.trim() === '' ? null : Number(dryWeight);
    const pillowsNum = pillows.trim() === '' ? null : Number(pillows);
    if (dryWeightNum !== null && !Number.isFinite(dryWeightNum)) {
      setError('Dry weight needs to be a number.');
      return;
    }
    if (pillowsNum !== null && !Number.isFinite(pillowsNum)) {
      setError('Pillow count needs to be a whole number.');
      return;
    }

    const payload: SavePatientPayload = {
      patientId,
      displayName: displayName.trim(),
      relationship: relationship.trim(),
      dryWeightLb: dryWeightNum,
      nyhaClass,
      cardiologistName: cardiologistName.trim(),
      cardiologistPhone: cardiologistPhone.trim(),
      normalPillowCount: pillowsNum,
      dateOfBirth: dateOfBirth.trim() === '' ? null : dateOfBirth,
    };

    startTransition(async () => {
      const result = await savePatient(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/me');
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="px-6 pt-4 pb-24 space-y-6">
      <Field
        label="Name"
        hint="What you call them — first name, Mom, Dad, etc."
      >
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className="input"
        />
      </Field>

      <Field label="Relationship" hint="mother / father / spouse / etc.">
        <input
          type="text"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
          className="input"
          placeholder="mother"
        />
      </Field>

      <Field
        label="Date of birth"
        hint="Used on the visit-handoff PDF header so the cardiologist sees age at a glance."
      >
        <input
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          className="input tabular-nums"
        />
      </Field>

      <Field
        label="Dry weight (lb)"
        hint="The cardiologist's target weight. Drives every weight-trend alert."
      >
        <input
          type="number"
          step="0.1"
          value={dryWeight}
          onChange={(e) => setDryWeight(e.target.value)}
          className="input tabular-nums"
          placeholder="178"
        />
      </Field>

      <Field
        label="NYHA class"
        hint="The cardiologist's heart-failure classification."
      >
        <select
          value={nyhaClass ?? ''}
          onChange={(e) => setNyhaClass((e.target.value || null) as NyhaClass | null)}
          className="input"
        >
          <option value="">Not set</option>
          <option value="I">Class I — no symptoms with normal activity</option>
          <option value="II">Class II — symptoms with normal activity</option>
          <option value="III">Class III — symptoms with mild activity</option>
          <option value="IV">Class IV — symptoms at rest</option>
          <option value="unknown">Don&rsquo;t know</option>
        </select>
      </Field>

      <Field
        label="Normal pillow count"
        hint="Usual pillows for sleep. The orthopnea alert fires when today is above this."
      >
        <select
          value={pillows}
          onChange={(e) => setPillows(e.target.value)}
          className="input"
        >
          <option value="">Not set</option>
          <option value="0">None</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4 or more</option>
        </select>
      </Field>

      <Field label="Cardiologist name">
        <input
          type="text"
          value={cardiologistName}
          onChange={(e) => setCardiologistName(e.target.value)}
          className="input"
          placeholder="Dr. Patel"
        />
      </Field>

      <Field
        label="Cardiologist phone"
        hint="The Call CTA on alerts dials this number. Get this right."
      >
        <input
          type="tel"
          value={cardiologistPhone}
          onChange={(e) => setCardiologistPhone(e.target.value)}
          className="input tabular-nums"
          placeholder="(415) 555-1234"
          inputMode="tel"
        />
      </Field>

      {error && (
        <p
          className="text-sm rounded-2xl px-3 py-2"
          style={{
            background: 'var(--status-alert-soft)',
            color: 'var(--status-alert-foreground)',
          }}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full px-6 py-3.5 text-sm font-semibold disabled:opacity-60 active:scale-[0.98] transition"
        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
      >
        {pending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
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
    <label className="block">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {hint && <span className="block text-xs text-muted-foreground mt-0.5 mb-2">{hint}</span>}
      {!hint && <span className="block mt-2" />}
      {children}
    </label>
  );
}
