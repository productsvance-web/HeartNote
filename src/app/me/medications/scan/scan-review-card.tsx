'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Plus, Trash2 } from 'lucide-react';
import type { ResolvedMed } from '@/lib/medications/scan/schema';
import { normalizeForm } from '@/lib/medications/rxnorm';
import { addExtractedMedications, type MedicationPayload } from '../actions';
import { extractedMedToPayload, toTitleCase, type ChosenSchedule } from './extracted-to-payload';

// Two-step Apple-Health-style flow:
//   Step 1 (review)  — read-only product summary; "This looks right" advances
//   Step 2 (schedule)— caregiver picks frequency and times; saves
//
// is_dose_change short-circuits before either step renders. Build
// convention #6: dose-change labels never ingest, only direct to the
// prescriber.

interface Props {
  med: ResolvedMed;
  onSkip: () => void;
  onAdded: () => void;
  // Disabled while the parent's "Add all" batch is in flight, to prevent
  // races with the per-card insert.
  disabled?: boolean;
  // 1-indexed position within the multi-med scan, total fixed at scan
  // time. Null when only one med was detected (no progress indicator).
  position: number | null;
  totalCount: number;
  // Reports whether the caregiver has entered Step 2 inputs that would
  // be lost on Take-another / unmount. Parent uses this to gate a
  // discard-confirm prompt — destructive-actions rule: name the target.
  onDirtyChange?: (dirty: boolean, primaryName: string) => void;
}

export function ScanReviewCard({
  med,
  onSkip,
  onAdded,
  disabled,
  position,
  totalCount,
  onDirtyChange,
}: Props) {
  if (med.is_dose_change) {
    return (
      <DoseChangeNotice
        drugName={med.drug_name}
        onSkip={onSkip}
        position={position}
        totalCount={totalCount}
      />
    );
  }
  return (
    <TwoStepCard
      med={med}
      onSkip={onSkip}
      onAdded={onAdded}
      disabled={disabled}
      position={position}
      totalCount={totalCount}
      onDirtyChange={onDirtyChange}
    />
  );
}

function ProgressBadge({ position, totalCount }: { position: number | null; totalCount: number }) {
  if (position === null || totalCount <= 1) return null;
  return (
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-2">
      Med {position} of {totalCount}
    </p>
  );
}

function DoseChangeNotice({
  drugName,
  onSkip,
  position,
  totalCount,
}: {
  drugName: string;
  onSkip: () => void;
  position: number | null;
  totalCount: number;
}) {
  return (
    <div className="rounded-2xl bg-card shadow-card p-4 border border-border">
      <ProgressBadge position={position} totalCount={totalCount} />
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="text-foreground mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-foreground">{toTitleCase(drugName)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            This label has dose-change instructions. Confirm with the prescriber and add manually.
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground underline"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function TwoStepCard({
  med,
  onSkip,
  onAdded,
  disabled,
  position,
  totalCount,
  onDirtyChange,
}: {
  med: ResolvedMed;
  onSkip: () => void;
  onAdded: () => void;
  disabled?: boolean;
  position: number | null;
  totalCount: number;
  onDirtyChange?: (dirty: boolean, primaryName: string) => void;
}) {
  const [step, setStep] = useState<'review' | 'schedule'>('review');
  const [times, setTimes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drug-name composition. OCR'd bottle text is the primary record (B5);
  // RxNorm ingredient becomes a secondary line ONLY when it differs from
  // the bottle. Title Case for display; the saved row uses raw OCR text.
  const ocrName = med.drug_name.trim();
  const ingredientName = (med.ingredient ?? '').trim();
  const primary = toTitleCase(ocrName.length > 0 ? ocrName : (med.canonicalName ?? '').trim());
  const secondary =
    ingredientName.length > 0 &&
    ocrName.length > 0 &&
    ingredientName.toLowerCase() !== ocrName.toLowerCase()
      ? toTitleCase(ingredientName)
      : null;

  // Tell the parent when the caregiver has entered a schedule that would
  // be discarded by Take-another. "Dirty" = on Step 2 with at least one
  // time entered. Cleared when stepping back to review or saving.
  const dirty = step === 'schedule' && times.length > 0;
  useEffect(() => {
    onDirtyChange?.(dirty, primary);
    return () => onDirtyChange?.(false, primary);
  }, [dirty, primary, onDirtyChange]);

  // Strength / form display. The strength fallback chain matches
  // resolveDose() in extracted-to-payload.ts so what's shown on Step 1
  // equals what gets saved.
  const displayDose = displayStrength(med);
  const displayForm = normalizeForm(med.form);
  const verified = !!med.canonicalName;

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const schedule: ChosenSchedule = {
      dosesPerDay: times.length === 0 ? null : times.length,
      scheduleTimes: times.length === 0 ? null : times.slice(),
      startedAt: todayISO(),
    };
    const payload: MedicationPayload = extractedMedToPayload(med, schedule);
    const result = await addExtractedMedications([payload]);
    setSaving(false);
    if (result.failedIndexes.length === 0) {
      onAdded();
      return;
    }
    setError(result.errors[0] ?? 'Could not save.');
  }

  function addTime() {
    setTimes((t) => [...t, currentLocalHHMM()]);
  }
  function removeTime(i: number) {
    setTimes((t) => t.filter((_, j) => j !== i));
  }
  function setTime(i: number, value: string) {
    setTimes((t) => t.map((v, j) => (j === i ? value : v)));
  }

  if (step === 'review') {
    return (
      <div className="rounded-2xl bg-card shadow-card p-4">
        <ProgressBadge position={position} totalCount={totalCount} />

        {verified ? (
          <div className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-0.5 mb-2">
            <Check size={12} className="text-foreground" />
            <span className="text-[10px] uppercase tracking-wide text-foreground/70">Verified</span>
          </div>
        ) : (
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-2">
            Read from label
          </p>
        )}

        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground leading-tight">{primary}</p>
          {secondary && (
            <p className="text-xs text-muted-foreground leading-tight">{secondary}</p>
          )}
        </div>

        <dl className="mt-4 space-y-2 text-sm">
          <Row
            label="Strength"
            value={displayDose || <span className="text-muted-foreground">Not on label</span>}
          />
          <Row
            label="Form"
            value={displayForm ?? <span className="text-muted-foreground">Not on label</span>}
          />
        </dl>

        <button
          type="button"
          onClick={() => setStep('schedule')}
          disabled={disabled}
          className="mt-5 w-full rounded-full bg-foreground text-background px-4 py-3 text-sm font-semibold disabled:opacity-50"
        >
          This looks right
        </button>
        <button
          type="button"
          onClick={onSkip}
          disabled={disabled}
          className="mt-2 w-full text-center text-xs text-muted-foreground underline"
        >
          Skip
        </button>
      </div>
    );
  }

  // step === 'schedule'
  return (
    <div className="rounded-2xl bg-card shadow-card p-4">
      <ProgressBadge position={position} totalCount={totalCount} />

      <div className="space-y-1 mb-4">
        <p className="text-base font-semibold text-foreground leading-tight">{primary}</p>
        {displayDose && (
          <p className="text-xs text-muted-foreground leading-tight">{displayDose}</p>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}

      <Section label="When">
        <p className="text-sm text-foreground">Every Day</p>
      </Section>

      <Section label="Times">
        {times.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No times set — saves as &ldquo;as needed&rdquo; (PRN).
          </p>
        ) : (
          <ul className="space-y-2">
            {times.map((t, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  type="time"
                  value={t}
                  onChange={(e) => setTime(i, e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
                <span className="text-xs text-muted-foreground">1 tablet</span>
                <button
                  type="button"
                  onClick={() => removeTime(i)}
                  aria-label="Remove time"
                  className="ml-auto text-muted-foreground"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={addTime}
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-foreground underline"
        >
          <Plus size={14} />
          Add a time
        </button>
      </Section>

      <Section label="Duration">
        <p className="text-sm text-foreground">Start: today &nbsp;·&nbsp; End: none</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          Adjust dates later from Medications.
        </p>
      </Section>

      <button
        type="button"
        onClick={save}
        disabled={saving || disabled || !timesAreValid(times)}
        className="mt-5 w-full rounded-full bg-foreground text-background px-4 py-3 text-sm font-semibold disabled:opacity-50"
      >
        {saving ? 'Adding…' : 'Add to my list'}
      </button>
      <button
        type="button"
        onClick={() => setStep('review')}
        disabled={saving}
        className="mt-2 w-full text-center text-xs text-muted-foreground underline"
      >
        Back to product details
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground/70">{label}</dt>
      <dd className="text-sm text-foreground text-right">{value}</dd>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border/50 pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
      <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
      {children}
    </div>
  );
}

// Strength display string for Step 1 / Step 2 header. Mirrors the chain
// in resolveDose() so the screen can't drift from the saved value.
function displayStrength(med: ResolvedMed): string {
  if (med.strength) return med.strength.toLowerCase().trim();
  if (med.canonicalName && !med.canonicalName.includes(' / ')) {
    const m = /(\d+(?:\.\d+)?)\s+([A-Za-z]+(?:\/[A-Za-z]+)?)/.exec(med.canonicalName);
    if (m) return `${m[1]} ${m[2].toLowerCase()}`;
  }
  if (med.dose_value !== null && med.dose_unit && med.dose_unit.trim().length > 0) {
    return `${med.dose_value} ${med.dose_unit.toLowerCase().trim()}`;
  }
  return '';
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentLocalHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function timesAreValid(times: string[]): boolean {
  if (times.length === 0) return true; // PRN — empty is allowed
  return times.every((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
}
