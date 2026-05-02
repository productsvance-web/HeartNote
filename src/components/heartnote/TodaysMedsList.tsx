'use client';

// React 19 useOptimistic for the dose-confirm + delete flows. The optimistic
// state lives ONLY for the duration of the in-flight server action; once
// revalidatePath fires (or router.refresh on rejection) and fresh server
// data arrives via props, useOptimistic resets automatically.
//
// Row tap → expansion with two sections:
//   1. "Today's doses" — list of events with per-event delete (the
//      caregiver-asked undo flow; replaces the absent undo button).
//   2. "Log a dose" — three status buttons (Taken / Refused / Extra).
//      Missed is no longer a manual surface; absence of a logged event is
//      the implicit signal. `'missed'` enum still exists for voice-log.
//
// Slot-mute rule: when slotsResolved >= dosesPerDay (non-PRN only), Taken
// and Refused are disabled. Extra remains tappable. Trash on any logged
// event reopens its slot. Server enforces the same rule on confirmDose.

import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { confirmDose, deleteDoseEvent } from '@/app/dashboard/actions';
import {
  SLOT_CONSUMER_STATUSES,
  type MedAdherenceEvent,
  type MedAdherenceRow,
  type MedEventStatus,
} from '@/lib/medications/evaluate';

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

function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

type OptimisticAction =
  | { type: 'add'; medicationId: string; event: MedAdherenceEvent }
  | { type: 'delete'; medicationId: string; eventId: string };

function applyOptimistic(
  rows: MedAdherenceRow[],
  action: OptimisticAction
): MedAdherenceRow[] {
  return rows.map((r) => {
    if (r.medicationId !== action.medicationId) return r;
    if (action.type === 'add') {
      const counts = SLOT_CONSUMER_STATUSES.has(action.event.status);
      const next = counts ? r.slotsResolved + 1 : r.slotsResolved;
      return {
        ...r,
        events: [action.event, ...r.events],
        slotsResolved: next,
        isComplete: r.dosesPerDay !== null && next >= r.dosesPerDay,
      };
    }
    const ev = r.events.find((e) => e.id === action.eventId);
    if (!ev) return r;
    const wasCounting = SLOT_CONSUMER_STATUSES.has(ev.status);
    const next = wasCounting ? Math.max(0, r.slotsResolved - 1) : r.slotsResolved;
    return {
      ...r,
      events: r.events.filter((e) => e.id !== action.eventId),
      slotsResolved: next,
      isComplete: r.dosesPerDay !== null && next >= r.dosesPerDay,
    };
  });
}

export function TodaysMedsList({ scheduled, prn, tz }: Props) {
  // Single optimistic store across both scheduled and PRN. Splits back into
  // scheduled / PRN on render so existing layout is preserved.
  const allRows = [...scheduled, ...prn];
  const [optimisticRows, addOptimistic] = useOptimistic(allRows, applyOptimistic);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const optimisticScheduled = optimisticRows.filter((r) => r.dosesPerDay !== null);
  const optimisticPrn = optimisticRows.filter((r) => r.dosesPerDay === null);

  function handleConfirm(medicationId: string, status: MedEventStatus) {
    setError(null);
    startTransition(async () => {
      const tempEvent: MedAdherenceEvent = {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        status,
        actual_taken_at: new Date().toISOString(),
        notes: null,
      };
      addOptimistic({ type: 'add', medicationId, event: tempEvent });
      const result = await confirmDose({
        medicationId,
        status: status as 'taken' | 'double_dosed' | 'refused',
      });
      if (!result.ok) {
        setError(result.error);
        // Drop the stale optimistic event by forcing a server-component
        // re-render. confirmDose does not revalidatePath on rejection,
        // so without this the temp event would linger until the next
        // unrelated re-render.
        router.refresh();
      }
    });
  }

  function handleDelete(medicationId: string, eventId: string) {
    setError(null);
    startTransition(async () => {
      addOptimistic({ type: 'delete', medicationId, eventId });
      const result = await deleteDoseEvent(eventId);
      if (!result.ok) {
        setError(result.error);
        router.refresh();
      }
    });
  }

  return (
    <div>
      {error && (
        <p className="mx-5 mb-2 text-xs text-destructive bg-destructive/10 rounded px-2 py-1.5">
          {error}
        </p>
      )}
      <ul>
        {optimisticScheduled.map((row) => (
          <MedRow
            key={row.medicationId}
            row={row}
            tz={tz}
            isPending={isPending}
            onConfirm={(status) => handleConfirm(row.medicationId, status)}
            onDelete={(eventId) => handleDelete(row.medicationId, eventId)}
          />
        ))}
      </ul>

      {optimisticPrn.length > 0 && (
        <details className="border-t border-border">
          <summary className="px-5 py-3 text-xs uppercase tracking-wider text-muted-foreground cursor-pointer flex items-center justify-between">
            <span>As needed ({optimisticPrn.length})</span>
            <ChevronDown size={14} />
          </summary>
          <ul>
            {optimisticPrn.map((row) => (
              <PrnRow
                key={row.medicationId}
                row={row}
                tz={tz}
                isPending={isPending}
                onConfirm={(status) => handleConfirm(row.medicationId, status)}
                onDelete={(eventId) => handleDelete(row.medicationId, eventId)}
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
  isPending: boolean;
  onConfirm: (status: MedEventStatus) => void;
  onDelete: (eventId: string) => void;
}

function MedRow({ row, tz, isPending, onConfirm, onDelete }: RowProps) {
  const [open, setOpen] = useState(false);
  const expected = row.dosesPerDay ?? 0;
  const isOver = row.slotsResolved > expected;
  const slotsFull = row.dosesPerDay !== null && row.slotsResolved >= row.dosesPerDay;

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
            {row.slotsResolved}/{expected}
          </span>
          {isOver && (
            <span
              className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-muted text-muted-foreground"
              title={`${row.slotsResolved} doses logged for a ${expected}-dose schedule`}
            >
              {row.slotsResolved}×
            </span>
          )}
        </div>
      </button>

      {open && (
        <Expansion
          drugName={row.drugName}
          tz={tz}
          events={row.events}
          isPending={isPending}
          slotsFull={slotsFull}
          onConfirm={onConfirm}
          onDelete={onDelete}
        />
      )}
    </li>
  );
}

function PrnRow({ row, tz, isPending, onConfirm, onDelete }: RowProps) {
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
            {row.slotsResolved === 0 ? 'none today' : `${row.slotsResolved} today`}
          </p>
        </div>
        <Plus size={18} className="text-muted-foreground" />
      </button>

      {open && (
        <Expansion
          drugName={row.drugName}
          tz={tz}
          events={row.events}
          isPending={isPending}
          slotsFull={false}
          onConfirm={onConfirm}
          onDelete={onDelete}
        />
      )}
    </li>
  );
}

const STATUSES: Array<{ value: MedEventStatus; label: string }> = [
  { value: 'taken', label: 'Taken' },
  { value: 'refused', label: 'Refused' },
  { value: 'double_dosed', label: 'Extra' },
];

function Expansion({
  drugName,
  tz,
  events,
  isPending,
  slotsFull,
  onConfirm,
  onDelete,
}: {
  drugName: string;
  tz: string;
  events: MedAdherenceEvent[];
  isPending: boolean;
  slotsFull: boolean;
  onConfirm: (status: MedEventStatus) => void;
  onDelete: (eventId: string) => void;
}) {
  return (
    <div className="px-5 pb-4 -mt-1 space-y-3">
      {events.length > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
            Today
          </p>
          <ul className="rounded-xl border border-border divide-y divide-border overflow-hidden">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="tabular-nums text-foreground/80 min-w-[60px]">
                  {formatTime(e.actual_taken_at, tz)}
                </span>
                <span className="flex-1 text-foreground">{STATUS_LABEL[e.status]}</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => onDelete(e.id)}
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
        <div className="grid grid-cols-3 gap-2">
          {STATUSES.map((s) => {
            const slotMuted = s.value !== 'double_dosed' && slotsFull;
            const disabled = isPending || slotMuted;
            return (
              <button
                key={s.value}
                type="button"
                disabled={disabled}
                aria-disabled={disabled || undefined}
                onClick={() => onConfirm(s.value)}
                className="rounded-full border border-border bg-background px-3 py-2 text-sm font-medium disabled:opacity-50 active:scale-[0.98] transition"
              >
                {s.label}
              </button>
            );
          })}
        </div>
        {slotsFull && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            All doses logged for today.
          </p>
        )}
      </div>
    </div>
  );
}
