'use client';

import { AlertTriangle, Check } from 'lucide-react';
import type { ResolvedMed } from '@/lib/medications/scan/schema';
import { normalizeForm } from '@/lib/medications/rxnorm';
import { toTitleCase } from './extracted-to-payload';

// Single-step product review. Caregiver confirms what was scanned; the
// scan-client owns the next step (cadence picker) and the actual save.
// is_dose_change short-circuits — build convention #6: dose-change labels
// never ingest, only direct to the prescriber.

interface Props {
  med: ResolvedMed;
  onSkip: () => void;
  onAccept: () => void;
  // Disabled while the parent's "Add all" batch is in flight, to prevent
  // races with the per-card progression.
  disabled?: boolean;
  // 1-indexed position within the multi-med scan, total fixed at scan
  // time. Null when only one med was detected (no progress indicator).
  position: number | null;
  totalCount: number;
}

export function ScanReviewCard({ med, onSkip, onAccept, disabled, position, totalCount }: Props) {
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
    <ProductReviewCard
      med={med}
      onSkip={onSkip}
      onAccept={onAccept}
      disabled={disabled}
      position={position}
      totalCount={totalCount}
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

function ProductReviewCard({
  med,
  onSkip,
  onAccept,
  disabled,
  position,
  totalCount,
}: {
  med: ResolvedMed;
  onSkip: () => void;
  onAccept: () => void;
  disabled?: boolean;
  position: number | null;
  totalCount: number;
}) {
  const ocrName = med.drug_name.trim();
  const ingredientName = (med.ingredient ?? '').trim();
  const primary = toTitleCase(ocrName.length > 0 ? ocrName : (med.canonicalName ?? '').trim());
  const secondary =
    ingredientName.length > 0 &&
    ocrName.length > 0 &&
    ingredientName.toLowerCase() !== ocrName.toLowerCase()
      ? toTitleCase(ingredientName)
      : null;

  const displayDose = displayStrength(med);
  const displayForm = normalizeForm(med.form);
  const verified = !!med.canonicalName;

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
        onClick={onAccept}
        disabled={disabled}
        className="mt-4 w-full rounded-full bg-foreground text-background px-4 py-3 text-sm font-semibold disabled:opacity-50"
      >
        Set schedule
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground/70">{label}</dt>
      <dd className="text-sm text-foreground text-right">{value}</dd>
    </div>
  );
}

// Strength display string. Mirrors the chain in resolveDose() so the
// screen can't drift from the saved value.
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
