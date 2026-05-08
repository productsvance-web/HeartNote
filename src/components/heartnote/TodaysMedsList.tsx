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
//      No 'missed' status exists — absence of a logged event is the
//      implicit signal everywhere in the app.
//
// Slot-mute rule: when slotsResolved >= dosesPerDay (non-PRN only), Taken
// and Refused are disabled. Extra remains tappable. Trash on any logged
// event reopens its slot. Server enforces the same rule on confirmDose.

import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Clock, Pill, Plus, Trash2 } from 'lucide-react';
import { confirmDose, deleteDoseEvent } from '@/app/dashboard/actions';
import { minutesUntilWallClock } from '@/lib/dates/format';
import {
  SLOT_CONSUMER_STATUSES,
  TAKEN_DOSE_STATUSES,
  type MedAdherenceEvent,
  type MedAdherenceRow,
  type MedEventStatus,
} from '@/lib/medications/evaluate';

interface Props {
  scheduled: MedAdherenceRow[];
  prn: MedAdherenceRow[];
  tz: string;
  today: string; // caregiver-TZ ISO YYYY-MM-DD
}

// "Due in {N}m" minute-granularity threshold. Within 60 min of the next
// scheduled dose, the row swaps to the Clock + butter pill register.
const DUE_SOON_THRESHOLD_MIN = 60;

type PillState = 'done' | 'due-soon' | 'past-due' | 'idle';

interface DueState {
  pill: PillState;
  minutesUntil: number | null;
}

function deriveDueState(
  row: MedAdherenceRow,
  nextSlotTime: string | null,
  today: string,
  tz: string,
  nowMs: number,
): DueState {
  if (row.dosesPerDay !== null && row.slotsResolved >= row.dosesPerDay) {
    return { pill: 'done', minutesUntil: null };
  }
  if (!nextSlotTime) return { pill: 'idle', minutesUntil: null };
  const minutesUntil = minutesUntilWallClock(nextSlotTime, today, tz, nowMs);
  if (!Number.isFinite(minutesUntil)) return { pill: 'idle', minutesUntil: null };
  if (minutesUntil < 0) return { pill: 'past-due', minutesUntil };
  if (minutesUntil <= DUE_SOON_THRESHOLD_MIN) return { pill: 'due-soon', minutesUntil };
  return { pill: 'idle', minutesUntil };
}

const STATUS_LABEL: Record<MedEventStatus, string> = {
  taken: 'Taken',
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
      const fillsSlot = SLOT_CONSUMER_STATUSES.has(action.event.status);
      const isDose = TAKEN_DOSE_STATUSES.has(action.event.status);
      const slots = fillsSlot ? r.slotsResolved + 1 : r.slotsResolved;
      const taken = isDose ? r.takenCount + 1 : r.takenCount;
      return {
        ...r,
        events: [action.event, ...r.events],
        slotsResolved: slots,
        takenCount: taken,
        isComplete: r.dosesPerDay !== null && slots >= r.dosesPerDay,
      };
    }
    const ev = r.events.find((e) => e.id === action.eventId);
    if (!ev) return r;
    const wasFillingSlot = SLOT_CONSUMER_STATUSES.has(ev.status);
    const wasDose = TAKEN_DOSE_STATUSES.has(ev.status);
    const slots = wasFillingSlot ? Math.max(0, r.slotsResolved - 1) : r.slotsResolved;
    const taken = wasDose ? Math.max(0, r.takenCount - 1) : r.takenCount;
    return {
      ...r,
      events: r.events.filter((e) => e.id !== action.eventId),
      slotsResolved: slots,
      takenCount: taken,
      isComplete: r.dosesPerDay !== null && slots >= r.dosesPerDay,
    };
  });
}

export function TodaysMedsList({ scheduled, prn, tz, today }: Props) {
  // Single optimistic store across both scheduled and PRN. Splits back into
  // scheduled / PRN on render so existing layout is preserved.
  const allRows = [...scheduled, ...prn];
  const [optimisticRows, addOptimistic] = useOptimistic(allRows, applyOptimistic);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // One ticker for the whole list — drives the "Due in {N}m" pill on every
  // scheduled row from a single `nowMs`. Pauses when the tab is hidden so
  // backgrounded screens don't burn cycles. Per memory feedback_no_bad_polling
  // and feedback_react_closure_in_timers (refs over state for timer ids).
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const intervalRef = useRef<number | null>(null);
  useEffect(() => {
    function tick() {
      setNowMs(Date.now());
    }
    function start() {
      if (intervalRef.current !== null) return;
      if (document.visibilityState !== 'visible') return;
      intervalRef.current = window.setInterval(tick, 60_000);
    }
    function stop() {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        tick();
        start();
      } else {
        stop();
      }
    }
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

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
            today={today}
            nowMs={nowMs}
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

function MedRow({
  row,
  tz,
  today,
  nowMs,
  isPending,
  onConfirm,
  onDelete,
}: RowProps & { today: string; nowMs: number }) {
  const [open, setOpen] = useState(false);
  const expected = row.dosesPerDay ?? 0;
  // Numerator = doses actually administered (taken/early/late/double_dosed).
  // `isOver` fires when the patient has been given more than the schedule.
  const isOver = row.takenCount > expected;
  // Slot mute uses `slotsResolved` so a Refused/Missed entry still completes
  // the day's logging. Decoupled from the displayed numerator on purpose.
  const slotsFull = row.dosesPerDay !== null && row.slotsResolved >= row.dosesPerDay;
  // Marker for "schedule logged but not all doses were taken" — at least one
  // refused/missed today. The expansion lists the specific events.
  const hasSkipped = row.slotsResolved > row.takenCount;
  // Next un-resolved slot's clock time (HH:MM as stored in scheduleTimes).
  // Slots fill in chronological order in practice, so scheduleTimes[i] for
  // i = slotsResolved is the next time the caregiver should expect a dose
  // prompt. Null when the day is complete or PRN.
  const nextSlotTime =
    !slotsFull && row.scheduleTimes ? row.scheduleTimes[row.slotsResolved] ?? null : null;
  const due = deriveDueState(row, nextSlotTime, today, tz, nowMs);
  const showClockIcon = due.pill === 'due-soon' || due.pill === 'past-due';

  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left active:bg-muted/40 transition"
      >
        <span
          aria-hidden
          className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: slotsFull ? 'var(--status-good-soft)' : 'var(--accent)',
            color: slotsFull ? 'var(--status-good-foreground)' : 'var(--accent-foreground)',
          }}
        >
          {slotsFull ? (
            <Check size={16} strokeWidth={2.4} />
          ) : showClockIcon ? (
            <Clock size={16} />
          ) : (
            <Pill size={16} />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{row.drugName}</p>
          {nextSlotTime && (
            <p className="text-xs text-muted-foreground tabular-nums mt-0.5 truncate">
              Next at {formatScheduleTime(nextSlotTime)}
            </p>
          )}
          {!nextSlotTime && hasSkipped && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {row.slotsResolved - row.takenCount} not taken today
            </p>
          )}
        </div>
        <DuePill
          due={due}
          slotsFull={slotsFull}
          taken={row.takenCount}
          expected={expected}
          nextSlotTime={nextSlotTime}
        />
        {isOver && (
          <span
            className="text-[10px] font-semibold rounded-full px-2 py-0.5 bg-muted text-muted-foreground tabular-nums shrink-0"
            title={`${row.takenCount} doses given for a ${expected}-dose schedule`}
          >
            {row.takenCount}×
          </span>
        )}
      </button>

      {open && (
        <Expansion
          drugName={row.drugName}
          tz={tz}
          events={row.events}
          isPending={isPending}
          slotsFull={slotsFull}
          extraDisabled={hasSkipped}
          onConfirm={onConfirm}
          onDelete={onDelete}
        />
      )}
    </li>
  );
}

function DuePill({
  due,
  slotsFull,
  taken,
  expected,
  nextSlotTime,
}: {
  due: DueState;
  slotsFull: boolean;
  taken: number;
  expected: number;
  nextSlotTime: string | null;
}) {
  if (slotsFull) {
    return (
      <span
        className="text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0 tabular-nums"
        style={{
          background: 'var(--status-good-soft)',
          color: 'var(--status-good-foreground)',
        }}
      >
        Done
      </span>
    );
  }
  if (due.pill === 'due-soon' && due.minutesUntil !== null) {
    return (
      <span
        className="text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0 tabular-nums"
        style={{
          background: 'var(--status-watch-soft)',
          color: 'var(--status-watch-foreground)',
        }}
      >
        Due in {due.minutesUntil}m
      </span>
    );
  }
  if (due.pill === 'past-due' && nextSlotTime) {
    return (
      <span
        className="text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0 tabular-nums"
        style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
      >
        Past due {formatScheduleTime(nextSlotTime)}
      </span>
    );
  }
  return (
    <span
      className="text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0 tabular-nums"
      style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
    >
      {taken}/{expected}
    </span>
  );
}

// Local register: "8 a.m." / "6:30 p.m." per the design system (TodaysMeds
// row). The compact "8am" register lives in cadence.ts for management
// summaries; different surfaces, different copy.
function formatScheduleTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const hour12 = ((h + 11) % 12) + 1;
  const ampm = h < 12 ? 'a.m.' : 'p.m.';
  return m === 0 ? `${hour12} ${ampm}` : `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
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
        <span
          aria-hidden
          className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
        >
          <Pill size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{row.drugName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {row.takenCount === 0 ? 'none today' : `${row.takenCount} today`}
          </p>
        </div>
        <Plus size={18} className="text-muted-foreground shrink-0" />
      </button>

      {open && (
        <Expansion
          drugName={row.drugName}
          tz={tz}
          events={row.events}
          isPending={isPending}
          slotsFull={false}
          extraDisabled={false}
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
  extraDisabled,
  onConfirm,
  onDelete,
}: {
  drugName: string;
  tz: string;
  events: MedAdherenceEvent[];
  isPending: boolean;
  slotsFull: boolean;
  // True when at least one refused event exists today. Extra is
  // supernumerary on top of regular doses; if regular doses haven't been
  // given (refused instead), Extra is incoherent — caregiver should
  // delete the refused entry first to log a Taken.
  extraDisabled: boolean;
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
            const extraMuted = s.value === 'double_dosed' && extraDisabled;
            const disabled = isPending || slotMuted || extraMuted;
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
        {!slotsFull && extraDisabled && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Extra needs at least one taken dose. Delete a refused entry to log Extra.
          </p>
        )}
      </div>
    </div>
  );
}
