'use client';

import { useEffect, useRef, useState } from 'react';
import { MIN_QUERY_LEN, type DrugSearchResult } from '@/lib/medications/rxnorm';
import { searchMedications } from './search-action';
import { MedFlowChrome } from './MedFlowChrome';
import type { DrugSelection } from './flow-types';

const DEBOUNCE_MS = 300;

interface Props {
  selection: DrugSelection | null;
  onSelect: (selection: DrugSelection) => void;
  onContinue: () => void;
  onClose: () => void;
}

export function SearchStep({ selection, onSelect, onContinue, onClose }: Props) {
  const [query, setQuery] = useState(
    selection?.kind === 'rxnorm' || selection?.kind === 'custom'
      ? selection.name
      : ''
  );
  const [results, setResults] = useState<DrugSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);
  // Monotonic counter to discard out-of-order responses. Ref rather than
  // state: the .then closure captures stale values across renders.
  const requestIdRef = useRef(0);

  function handleQueryChange(value: string) {
    setQuery(value);
    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      setResults([]);
      setErrored(false);
      setLoading(false);
    } else {
      setLoading(true);
      setErrored(false);
    }
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LEN) return;
    const id = ++requestIdRef.current;
    const handle = setTimeout(() => {
      searchMedications(trimmed)
        .then((r) => {
          if (id !== requestIdRef.current) return;
          setResults(r);
          setErrored(r.length === 0);
          setLoading(false);
        })
        .catch(() => {
          if (id !== requestIdRef.current) return;
          setResults([]);
          setErrored(true);
          setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [query]);

  const trimmed = query.trim();
  const showCustom =
    trimmed.length >= MIN_QUERY_LEN && (errored || results.length === 0) && !loading;

  return (
    <MedFlowChrome
      title="Add a medication"
      subtitle={null}
      onBack={null}
      onClose={onClose}
      primaryLabel="Continue"
      primaryDisabled={!selection}
      onPrimary={onContinue}
    >
      <div className="space-y-4">
        <h1 className="font-display text-2xl text-foreground">What medication?</h1>
        <p className="text-sm text-muted-foreground">
          Type the name on the bottle. We&rsquo;ll match it to a drug list.
        </p>

        <input
          autoFocus
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Lasix, Carvedilol, …"
        />

        {loading && <p className="text-xs text-muted-foreground">Looking up…</p>}

        {errored && trimmed.length >= MIN_QUERY_LEN && !loading && (
          <p className="text-xs text-muted-foreground">
            Couldn&rsquo;t load suggestions — type to add as custom.
          </p>
        )}

        <ul className="space-y-2">
          {results.map((r) => {
            const isSelected =
              selection?.kind === 'rxnorm' && selection.rxcui === r.rxcui;
            return (
              <li key={r.rxcui}>
                <button
                  type="button"
                  onClick={() =>
                    onSelect({
                      kind: 'rxnorm',
                      rxcui: r.rxcui,
                      name: r.name,
                      type: r.type,
                      ingredient: r.ingredient ?? null,
                      ingredientRxcui: r.ingredientRxcui ?? null,
                    })
                  }
                  className={`w-full text-left rounded-xl border px-4 py-3 ${
                    isSelected
                      ? 'border-foreground bg-foreground/5'
                      : 'border-border bg-card'
                  }`}
                >
                  <span className="block text-base text-foreground">{r.name}</span>
                  {r.type === 'brand' && r.ingredient && (
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {r.ingredient}
                    </span>
                  )}
                </button>
              </li>
            );
          })}

          {showCustom && (
            <li>
              <button
                type="button"
                onClick={() => onSelect({ kind: 'custom', name: trimmed })}
                className={`w-full text-left rounded-xl border px-4 py-3 ${
                  selection?.kind === 'custom' && selection.name === trimmed
                    ? 'border-foreground bg-foreground/5'
                    : 'border-border bg-card'
                }`}
              >
                <span className="block text-base text-foreground">
                  Add &lsquo;{trimmed}&rsquo; as custom medication
                </span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  We won&rsquo;t auto-detect the form or strength.
                </span>
              </button>
            </li>
          )}
        </ul>
      </div>
    </MedFlowChrome>
  );
}
