'use client';

import { useState } from 'react';
import type { DrugDetails } from '@/lib/medications/rxnorm';
import type { DrugSelection } from './wizard-types';

// Generic fallback shown to two audiences:
//   1. Custom path (no RxNorm match in step 1) — RxNorm doesn't have an
//      authoritative form list to fetch, so we curate one.
//   2. RxNorm path with a failed/empty getDrugDetails — the AC asks for
//      a "universal fallback list" so the user can still proceed.
//
// Top two are the most common ambulatory forms; the rest hide behind
// "Show more" to keep the initial view scannable on a phone.
const FALLBACK_TOP = ['Oral Tablet', 'Oral Capsule'] as const;
const FALLBACK_REST = [
  '24 HR Transdermal Patch',
  'Chewable Tablet',
  'Cream',
  'Delayed Release Oral Capsule',
  'Delayed Release Oral Tablet',
  'Extended Release Oral Capsule',
  'Extended Release Oral Tablet',
  'Gel',
  'Inhalation Aerosol',
  'Inhalation Powder',
  'Injection',
  'Lotion',
  'Nasal Spray',
  'Ointment',
  'Oral Solution',
  'Oral Suspension',
  'Rectal Suppository',
  'Sublingual Spray',
  'Sublingual Tablet',
  'Suppository',
  'Transdermal Patch',
  'Vaginal Suppository',
] as const;

interface Props {
  selection: DrugSelection | null;
  drugDetails: DrugDetails | null;
  loading: boolean;
  error: boolean;
  form: string | null;
  onPick: (form: string) => void;
  onContinue: () => void;
}

export function StepForm({
  selection,
  drugDetails,
  loading,
  error,
  form,
  onPick,
  onContinue,
}: Props) {
  const [showMore, setShowMore] = useState(false);

  if (!selection) return null;

  const isCustom = selection.kind === 'custom';
  const usingFallback =
    isCustom || error || (drugDetails !== null && drugDetails.forms.length === 0);
  const showLoading = !isCustom && loading;

  const drugName = selection.name;
  const ingredient =
    selection.kind === 'rxnorm' && selection.type === 'brand'
      ? selection.ingredient
      : null;

  // Top 2 forms shown by default; rest under "Show more". Brand path
  // pins its preselected form as #1 (Apple's pattern); the second slot
  // and tail come from rxnorm.ts's commonness ranking. Generic path
  // takes the top 2 from that same ranking directly.
  let topForms: readonly string[] = [];
  let restForms: readonly string[] = [];
  if (usingFallback) {
    topForms = FALLBACK_TOP;
    restForms = FALLBACK_REST;
  } else if (drugDetails) {
    const all = drugDetails.forms.map((f) => f.name);
    if (selection.kind === 'rxnorm' && selection.type === 'brand' && drugDetails.preselectedForm) {
      const without = all.filter((n) => n !== drugDetails.preselectedForm);
      topForms = [drugDetails.preselectedForm, ...without.slice(0, 1)];
      restForms = without.slice(1);
    } else {
      topForms = all.slice(0, 2);
      restForms = all.slice(2);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {drugName}
        {ingredient ? ` · ${ingredient}` : ''}
      </p>
      <h1 className="font-display text-2xl text-foreground">Choose the medication type.</h1>
      {ingredient && (
        <p className="text-xs text-muted-foreground">Ingredients: {ingredient}</p>
      )}

      {showLoading && (
        <p className="text-xs text-muted-foreground">Loading forms…</p>
      )}

      {!isCustom && error && (
        <p className="text-xs text-muted-foreground">Couldn&rsquo;t load full list.</p>
      )}

      <ul className="space-y-2">
        {topForms.map((name) => (
          <FormRow key={name} name={name} selected={form === name} onClick={() => onPick(name)} />
        ))}
      </ul>

      {restForms.length > 0 && !showMore && (
        <button
          type="button"
          onClick={() => setShowMore(true)}
          className="text-sm text-foreground underline underline-offset-2"
        >
          Show more
        </button>
      )}

      {restForms.length > 0 && showMore && (
        <ul className="space-y-2">
          {restForms.map((name) => (
            <FormRow key={name} name={name} selected={form === name} onClick={() => onPick(name)} />
          ))}
        </ul>
      )}

      <div className="pt-4">
        <button
          type="button"
          onClick={onContinue}
          disabled={!form || showLoading}
          className="w-full rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function FormRow({
  name,
  selected,
  onClick,
}: {
  name: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`w-full text-left rounded-xl border px-4 py-3 text-base ${
          selected
            ? 'border-foreground bg-foreground/5 text-foreground'
            : 'border-border bg-card text-foreground'
        }`}
      >
        {name}
      </button>
    </li>
  );
}
