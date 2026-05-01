'use client';

// Client list with optimistic dose-confirm. Tap a med → inline expand with
// status buttons + optional note → submit → local count increments
// immediately, server inserts the event, UI rolls back on failure.
//
// "2/1" or other unequal counts get a neutral "Nx" pill (no risk color, no
// clinical interpretation) per plan §architectural-decisions #7.

import { useState, useTransition } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { confirmDose } from '@/app/dashboard/actions';
import type { MedAdherenceRow } from '@/lib/medications/evaluate';

interface Props {
  scheduled: MedAdherenceRow[];
  prn: MedAdherenceRow[];
}

export function TodaysMedsList({ scheduled, prn }: Props) {
  const [optimistic, setOptimistic] = useState<Record<string, number>>({});

  return (
    <div>
      <ul>
        {scheduled.map((row) => (
          <MedRow
            key={row.medicationId}
            row={row}
            extraTaken={optimistic[row.medicationId] ?? 0}
            onLocalIncrement={() =>
              setOptimistic((s) => ({ ...s, [row.medicationId]: (s[row.medicationId] ?? 0) + 1 }))
            }
            onLocalRollback={() =>
              setOptimistic((s) => ({
                ...s,
                [row.medicationId]: Math.max(0, (s[row.medicationId] ?? 0) - 1),
              }))
            }
          />
        ))}
      </ul>

      {prn.length > 0 && (
        <details className="border-t border-border">
          <summary className="px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground cursor-pointer flex items-center justify-between">
            <span>As needed ({prn.length})</span>
            <ChevronDown size={14} />
          </summary>
          <ul>
            {prn.map((row) => (
              <PrnRow
                key={row.medicationId}
                row={row}
                extraTaken={optimistic[row.medicationId] ?? 0}
                onLocalIncrement={() =>
                  setOptimistic((s) => ({
                    ...s,
                    [row.medicationId]: (s[row.medicationId] ?? 0) + 1,
                  }))
                }
                onLocalRollback={() =>
                  setOptimistic((s) => ({
                    ...s,
                    [row.medicationId]: Math.max(0, (s[row.medicationId] ?? 0) - 1),
                  }))
                }
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function MedRow({
  row,
  extraTaken,
  onLocalIncrement,
  onLocalRollback,
}: {
  row: MedAdherenceRow;
  extraTaken: number;
  onLocalIncrement: () => void;
  onLocalRollback: () => void;
}) {
  const [open, setOpen] = useState(false);
  const taken = row.takenToday + extraTaken;
  const expected = row.dosesPerDay ?? 0;
  const isUnequal = taken !== expected;

  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left active:bg-muted/40 transition"
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{row.drugName}</p>
          {row.scheduleTimes && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {row.scheduleTimes.map((t, i) => (
                <span key={i} className="mr-2">
                  {t}
                  <span className="ml-1 text-[10px]">{i < taken ? '✓' : '·'}</span>
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {taken}/{expected}
          </span>
          {isUnequal && taken > expected && (
            <span
              className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-muted text-muted-foreground"
              title={`${taken} doses logged for a ${expected}-dose schedule`}
            >
              {taken}×
            </span>
          )}
        </div>
      </button>

      {open && (
        <ConfirmRow
          medicationId={row.medicationId}
          drugName={row.drugName}
          onSubmitted={() => setOpen(false)}
          onLocalIncrement={onLocalIncrement}
          onLocalRollback={onLocalRollback}
        />
      )}
    </li>
  );
}

function PrnRow({
  row,
  extraTaken,
  onLocalIncrement,
  onLocalRollback,
}: {
  row: MedAdherenceRow;
  extraTaken: number;
  onLocalIncrement: () => void;
  onLocalRollback: () => void;
}) {
  const [open, setOpen] = useState(false);
  const taken = row.takenToday + extraTaken;
  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left active:bg-muted/40 transition"
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{row.drugName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {taken === 0 ? 'none today' : `${taken} today`}
          </p>
        </div>
        <Plus size={18} className="text-muted-foreground" />
      </button>

      {open && (
        <ConfirmRow
          medicationId={row.medicationId}
          drugName={row.drugName}
          onSubmitted={() => setOpen(false)}
          onLocalIncrement={onLocalIncrement}
          onLocalRollback={onLocalRollback}
        />
      )}
    </li>
  );
}

const STATUSES = [
  { value: 'taken', label: 'Taken' },
  { value: 'missed', label: 'Missed' },
  { value: 'double_dosed', label: 'Extra dose' },
  { value: 'refused', label: 'Refused' },
] as const;

function ConfirmRow({
  medicationId,
  drugName,
  onSubmitted,
  onLocalIncrement,
  onLocalRollback,
}: {
  medicationId: string;
  drugName: string;
  onSubmitted: () => void;
  onLocalIncrement: () => void;
  onLocalRollback: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(status: 'taken' | 'missed' | 'double_dosed' | 'refused') {
    setError(null);
    // Only optimistic-increment for statuses that COUNT toward today's taken.
    const incrementsTaken = status === 'taken' || status === 'double_dosed';
    if (incrementsTaken) onLocalIncrement();

    startTransition(async () => {
      const result = await confirmDose({ medicationId, status });
      if (!result.ok) {
        if (incrementsTaken) onLocalRollback();
        setError(result.error);
        return;
      }
      onSubmitted();
    });
  }

  return (
    <div className="px-5 pb-4 -mt-1">
      <p className="text-xs text-muted-foreground mb-2">
        Log a dose for {drugName}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            disabled={isPending}
            onClick={() => submit(s.value)}
            className="rounded-full border border-border bg-background px-3 py-2 text-sm font-medium disabled:opacity-50 active:scale-[0.98] transition"
          >
            {s.label}
          </button>
        ))}
      </div>
      {error && (
        <p className="text-xs text-destructive mt-2 bg-destructive/10 rounded px-2 py-1.5">
          {error}
        </p>
      )}
    </div>
  );
}
