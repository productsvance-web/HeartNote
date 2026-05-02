'use client';

// Client list with optimistic dose-confirm and inline event delete.
//
// Row tap → expansion with two sections:
//   1. "Today's doses" — list of events with per-event delete (the
//      caregiver-asked undo flow; replaces the absent undo button).
//   2. "Log a dose" — four status buttons (Taken / Missed / Extra / Refused).
//
// "2/1" or other unequal counts get a neutral "Nx" pill — descriptive only,
// no risk color, no clinical interpretation. (Plan §architectural-decisions
// #7.) Schedule-time per-slot status is intentionally NOT shown — clock-time
// matching is fragile (DST, late doses, out-of-order logging). schedule_times
// remains in the DB for PR 3 (notifications) and PR 2 (slot-aware adherence
// in the habit tile).

import { useState, useTransition } from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { confirmDose, deleteDoseEvent } from '@/app/dashboard/actions';
import type { MedAdherenceEvent, MedAdherenceRow, MedEventStatus } from '@/lib/medications/evaluate';

interface Props {
  scheduled: MedAdherenceRow[];
  prn: MedAdherenceRow[];
  tz: string;
}

const STATUS_LABEL: Record<MedEventStatus, string> = {
  taken: 'Taken',
  missed: 'Missed',
  double_dosed: 'Extra',
  refused: 'Refused',
  early: 'Taken (early)',
  late: 'Taken (late)',
};

const TAKEN_COUNTING: ReadonlySet<MedEventStatus> = new Set([
  'taken',
  'early',
  'late',
  'double_dosed',
]);

function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

export function TodaysMedsList({ scheduled, prn, tz }: Props) {
  // Optimistic local state. extraTaken increments on confirm-Taken/Extra
  // (rolls back on server error). deletedIds hides events client-side until
  // the server roundtrip + revalidate refreshes the data.
  const [extraTaken, setExtraTaken] = useState<Record<string, number>>({});
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  function visibleEvents(row: MedAdherenceRow): MedAdherenceEvent[] {
    return row.events.filter((e) => !deletedIds.has(e.id));
  }

  function effectiveTaken(row: MedAdherenceRow): number {
    const deletedTakenCount = row.events.filter(
      (e) => deletedIds.has(e.id) && TAKEN_COUNTING.has(e.status)
    ).length;
    return Math.max(0, row.takenToday - deletedTakenCount + (extraTaken[row.medicationId] ?? 0));
  }

  return (
    <div>
      <ul>
        {scheduled.map((row) => (
          <MedRow
            key={row.medicationId}
            row={row}
            tz={tz}
            taken={effectiveTaken(row)}
            events={visibleEvents(row)}
            onLocalIncrement={() =>
              setExtraTaken((s) => ({ ...s, [row.medicationId]: (s[row.medicationId] ?? 0) + 1 }))
            }
            onLocalRollback={() =>
              setExtraTaken((s) => ({
                ...s,
                [row.medicationId]: Math.max(0, (s[row.medicationId] ?? 0) - 1),
              }))
            }
            onLocalDelete={(id) => setDeletedIds((s) => new Set(s).add(id))}
            onLocalDeleteRollback={(id) =>
              setDeletedIds((s) => {
                const next = new Set(s);
                next.delete(id);
                return next;
              })
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
                tz={tz}
                taken={effectiveTaken(row)}
                events={visibleEvents(row)}
                onLocalIncrement={() =>
                  setExtraTaken((s) => ({
                    ...s,
                    [row.medicationId]: (s[row.medicationId] ?? 0) + 1,
                  }))
                }
                onLocalRollback={() =>
                  setExtraTaken((s) => ({
                    ...s,
                    [row.medicationId]: Math.max(0, (s[row.medicationId] ?? 0) - 1),
                  }))
                }
                onLocalDelete={(id) => setDeletedIds((s) => new Set(s).add(id))}
                onLocalDeleteRollback={(id) =>
                  setDeletedIds((s) => {
                    const next = new Set(s);
                    next.delete(id);
                    return next;
                  })
                }
              />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

interface RowProps {
  row: MedAdherenceRow;
  tz: string;
  taken: number;
  events: MedAdherenceEvent[];
  onLocalIncrement: () => void;
  onLocalRollback: () => void;
  onLocalDelete: (id: string) => void;
  onLocalDeleteRollback: (id: string) => void;
}

function MedRow({
  row,
  tz,
  taken,
  events,
  onLocalIncrement,
  onLocalRollback,
  onLocalDelete,
  onLocalDeleteRollback,
}: RowProps) {
  const [open, setOpen] = useState(false);
  const expected = row.dosesPerDay ?? 0;
  const isOver = taken > expected;

  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left active:bg-muted/40 transition"
      >
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{row.drugName}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {taken}/{expected}
          </span>
          {isOver && (
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
        <Expansion
          medicationId={row.medicationId}
          drugName={row.drugName}
          tz={tz}
          events={events}
          onSubmitted={() => setOpen(false)}
          onLocalIncrement={onLocalIncrement}
          onLocalRollback={onLocalRollback}
          onLocalDelete={onLocalDelete}
          onLocalDeleteRollback={onLocalDeleteRollback}
        />
      )}
    </li>
  );
}

function PrnRow({
  row,
  tz,
  taken,
  events,
  onLocalIncrement,
  onLocalRollback,
  onLocalDelete,
  onLocalDeleteRollback,
}: RowProps) {
  const [open, setOpen] = useState(false);
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
        <Expansion
          medicationId={row.medicationId}
          drugName={row.drugName}
          tz={tz}
          events={events}
          onSubmitted={() => setOpen(false)}
          onLocalIncrement={onLocalIncrement}
          onLocalRollback={onLocalRollback}
          onLocalDelete={onLocalDelete}
          onLocalDeleteRollback={onLocalDeleteRollback}
        />
      )}
    </li>
  );
}

const STATUSES: Array<{ value: MedEventStatus; label: string }> = [
  { value: 'taken', label: 'Taken' },
  { value: 'missed', label: 'Missed' },
  { value: 'double_dosed', label: 'Extra' },
  { value: 'refused', label: 'Refused' },
];

function Expansion({
  medicationId,
  drugName,
  tz,
  events,
  onSubmitted,
  onLocalIncrement,
  onLocalRollback,
  onLocalDelete,
  onLocalDeleteRollback,
}: {
  medicationId: string;
  drugName: string;
  tz: string;
  events: MedAdherenceEvent[];
  onSubmitted: () => void;
  onLocalIncrement: () => void;
  onLocalRollback: () => void;
  onLocalDelete: (id: string) => void;
  onLocalDeleteRollback: (id: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitConfirm(status: MedEventStatus) {
    setError(null);
    const incrementsTaken = TAKEN_COUNTING.has(status);
    if (incrementsTaken) onLocalIncrement();

    startTransition(async () => {
      const result = await confirmDose({ medicationId, status: status as 'taken' | 'missed' | 'double_dosed' | 'refused' });
      if (!result.ok) {
        if (incrementsTaken) onLocalRollback();
        setError(result.error);
        return;
      }
      onSubmitted();
    });
  }

  function deleteEvent(eventId: string) {
    setError(null);
    onLocalDelete(eventId);
    startTransition(async () => {
      const result = await deleteDoseEvent(eventId);
      if (!result.ok) {
        onLocalDeleteRollback(eventId);
        setError(result.error);
      }
    });
  }

  return (
    <div className="px-5 pb-4 -mt-1 space-y-3">
      {events.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Today
          </p>
          <ul className="rounded-xl border border-border divide-y divide-border overflow-hidden">
            {events.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 px-3 py-2 text-sm"
              >
                <span className="tabular-nums text-foreground/80 min-w-[60px]">
                  {formatTime(e.actual_taken_at, tz)}
                </span>
                <span className="flex-1 text-foreground">{STATUS_LABEL[e.status]}</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => deleteEvent(e.id)}
                  className="p-1 rounded-md text-muted-foreground active:bg-muted/60 disabled:opacity-50"
                  aria-label={`Delete ${STATUS_LABEL[e.status].toLowerCase()} entry at ${formatTime(e.actual_taken_at, tz)}`}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
          Log a dose for {drugName}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              disabled={isPending}
              onClick={() => submitConfirm(s.value)}
              className="rounded-full border border-border bg-background px-3 py-2 text-sm font-medium disabled:opacity-50 active:scale-[0.98] transition"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5">{error}</p>
      )}
    </div>
  );
}
