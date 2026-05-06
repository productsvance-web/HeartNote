'use client';

import { useEffect, useRef, useState } from 'react';
import { MinusCircle, PlusCircle, Check } from 'lucide-react';
import {
  CADENCE_KINDS,
  DOW_ALL,
  type CadenceKind,
} from '@/lib/medications/cadence';
import { FORM_COUNT_NOUN } from '@/lib/medications/rxnorm';
import { checkPermissionState } from '@/lib/medications/notifications';
import { DayPills } from './day-pills';

export interface DraftDoseTime {
  timeOfDay: string;
  quantity: number;
  appliesToDow: number | null;
}

export interface CadenceDraft {
  kind: CadenceKind;
  cycleOnDays: number | null;
  cycleOffDays: number | null;
  cycleUnit: 'day' | 'week';
  intervalDays: number | null;
  startedAt: string; // YYYY-MM-DD or ''
  doseTimes: DraftDoseTime[];
  // For specific_days, dose-times are partitioned into "groups" by their
  // bitmap. Group identity = the bitmap of the group's dose-times. We keep
  // a stable group ordering so adding a new group doesn't reshuffle.
  groups: number[];
}

interface QtyNoun {
  single: string;
  plural: string;
}

const KIND_TITLES: Record<CadenceKind, string> = {
  every_day: 'Every Day',
  cyclical: 'On a Cyclical Schedule',
  specific_days: 'On Specific Days of the Week',
  every_few_days: 'Every Few Days',
  as_needed: 'As Needed',
};

const KIND_TAGLINES: Record<CadenceKind, string> = {
  every_day: 'Take dose at the same time.',
  cyclical: 'Take every day for 21 days and pause for 7 days.',
  specific_days: 'On Mondays, On Weekdays.',
  every_few_days: 'Every other day, Every 3 days.',
  as_needed: 'No fixed schedule.',
};

interface Props {
  draft: CadenceDraft;
  onChange: (next: CadenceDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  // Optional "Skip — save without a schedule" affordance used by the scan
  // flow per-card review. When set, renders below Save and triggers a
  // save with kind='as_needed'.
  onSkip?: () => void;
  saving?: boolean;
  error?: string | null;
  drugLabel: string;
  // Verbatim RxNorm form (e.g., "Oral Tablet"). Used to render quantity
  // links as "1 tablet" instead of "1 dose". Null when unknown (custom
  // med, scan with no NDC match) or when form isn't in FORM_COUNT_NOUN.
  form: string | null;
}

export function CadenceFields({
  draft,
  onChange,
  onSave,
  onCancel,
  onSkip,
  saving,
  error,
  drugLabel,
  form,
}: Props) {
  const noun: QtyNoun | null = form ? (FORM_COUNT_NOUN[form] ?? null) : null;
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reminderDenied, setReminderDenied] = useState(false);

  useEffect(() => {
    if (draft.kind === 'as_needed') return;
    let cancelled = false;
    void checkPermissionState().then((state) => {
      if (!cancelled) setReminderDenied(state === 'denied');
    });
    return () => {
      cancelled = true;
    };
  }, [draft.kind]);
  const showReminderDenied = reminderDenied && draft.kind !== 'as_needed';

  function pickKind(k: CadenceKind) {
    // Tapping the currently active kind is a no-op so the user's
    // in-progress entries aren't reset by an accidental re-tap.
    if (k === draft.kind) return;
    onChange(newDraft(k, draft));
  }

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onCancel}
        className="text-xs text-muted-foreground underline underline-offset-2"
      >
        ← Cancel
      </button>

      <div className="text-center">
        <p className="text-base font-semibold text-foreground">{drugLabel}</p>
        <h2 className="font-display text-3xl text-foreground mt-3">Set a Schedule</h2>
      </div>

      <div>
        <p className="text-sm font-medium text-foreground mb-2">When will you take this?</p>
        <div className="rounded-2xl bg-card shadow-card px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-base text-foreground flex-1 min-w-0">
            {KIND_TITLES[draft.kind]}
          </p>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="text-sm font-semibold text-foreground underline underline-offset-2 shrink-0"
          >
            Change
          </button>
        </div>
      </div>

      {draft.kind === 'cyclical' && <CyclicalFields draft={draft} onChange={onChange} />}
      {draft.kind === 'every_few_days' && <IntervalFields draft={draft} onChange={onChange} />}

      {draft.kind !== 'as_needed' && (
        <DoseTimesField kind={draft.kind} draft={draft} onChange={onChange} noun={noun} />
      )}

      {draft.kind !== 'as_needed' && !showReminderDenied && (
        <p className="text-xs text-muted-foreground text-center px-4">
          Reminders fire at the scheduled times.
        </p>
      )}

      {(draft.kind === 'cyclical' || draft.kind === 'every_few_days') && (
        <Field label="Start date">
          <input
            type="date"
            className={inputClass}
            value={draft.startedAt}
            onChange={(e) => onChange({ ...draft, startedAt: e.target.value })}
          />
        </Field>
      )}

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
      )}

      {showReminderDenied && (
        <p className="text-xs text-muted-foreground bg-muted/60 rounded-lg px-3 py-2">
          Reminders blocked. Enable in Settings → Notifications → HeartNote.
        </p>
      )}

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="w-full rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save schedule'}
      </button>

      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="w-full text-center text-xs text-muted-foreground underline"
        >
          Skip — save without a schedule
        </button>
      )}

      <KindSheet
        open={sheetOpen}
        value={draft.kind}
        onPick={pickKind}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}

function KindSheet({
  open,
  value,
  onPick,
  onClose,
}: {
  open: boolean;
  value: CadenceKind;
  onPick: (k: CadenceKind) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose cadence"
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full bg-card rounded-t-3xl pb-6 pt-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-muted mb-3" />
        <ul className="divide-y divide-border" role="radiogroup" aria-label="Cadence">
          {CADENCE_KINDS.map((kind) => {
            const isSelected = value === kind;
            return (
              <li key={kind}>
                <button
                  type="button"
                  onClick={() => onPick(kind)}
                  className="w-full text-left px-5 py-3.5 flex items-center gap-3"
                  role="radio"
                  aria-checked={isSelected}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-foreground">
                      {KIND_TITLES[kind]}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {KIND_TAGLINES[kind]}
                    </p>
                  </div>
                  {isSelected && <Check size={18} className="text-foreground shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="px-5 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function CyclicalFields({ draft, onChange }: { draft: CadenceDraft; onChange: (d: CadenceDraft) => void }) {
  const unitLabel = draft.cycleUnit === 'week' ? 'weeks' : 'days';
  const factor = draft.cycleUnit === 'week' ? 7 : 1;
  const onValue = draft.cycleOnDays != null ? Math.round(draft.cycleOnDays / factor) : '';
  const offValue = draft.cycleOffDays != null ? Math.round(draft.cycleOffDays / factor) : '';
  return (
    <div className="space-y-3">
      <Field label="Every">
        <select
          className={inputClass}
          value={draft.cycleUnit}
          onChange={(e) => onChange({ ...draft, cycleUnit: e.target.value as 'day' | 'week' })}
        >
          <option value="day">Day</option>
          <option value="week">Week</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Use for (${unitLabel})`}>
          <input
            type="number"
            min={1}
            max={draft.cycleUnit === 'week' ? 52 : 365}
            className={inputClass}
            value={onValue}
            onChange={(e) => {
              const n = e.target.value === '' ? null : Number(e.target.value);
              onChange({ ...draft, cycleOnDays: n == null ? null : n * factor });
            }}
          />
        </Field>
        <Field label={`Pause for (${unitLabel})`}>
          <input
            type="number"
            min={1}
            max={draft.cycleUnit === 'week' ? 52 : 365}
            className={inputClass}
            value={offValue}
            onChange={(e) => {
              const n = e.target.value === '' ? null : Number(e.target.value);
              onChange({ ...draft, cycleOffDays: n == null ? null : n * factor });
            }}
          />
        </Field>
      </div>
    </div>
  );
}

function IntervalFields({ draft, onChange }: { draft: CadenceDraft; onChange: (d: CadenceDraft) => void }) {
  return (
    <Field label="Interval (days)" hint="Fires every N days from the start date.">
      <select
        className={inputClass}
        value={draft.intervalDays ?? ''}
        onChange={(e) => onChange({ ...draft, intervalDays: e.target.value === '' ? null : Number(e.target.value) })}
      >
        <option value="">Pick an interval…</option>
        {Array.from({ length: 29 }, (_, i) => i + 2).map((n) => (
          <option key={n} value={n}>
            Every {n === 2 ? 'other day' : `${n} days`}
          </option>
        ))}
      </select>
    </Field>
  );
}

function DoseTimesField({
  kind,
  draft,
  onChange,
  noun,
}: {
  kind: CadenceKind;
  draft: CadenceDraft;
  onChange: (d: CadenceDraft) => void;
  noun: QtyNoun | null;
}) {
  if (kind === 'specific_days') {
    return <SpecificDaysGroups draft={draft} onChange={onChange} noun={noun} />;
  }
  // every_day, cyclical, every_few_days — flat list of (time, quantity) rows.
  // appliesToDow is null for these kinds.
  return (
    <div className="space-y-2">
      <p className="block text-sm font-medium text-foreground">Times</p>
      <div className="space-y-2">
        {draft.doseTimes.map((dt, i) => (
          <DoseTimeRow
            key={i}
            value={dt}
            noun={noun}
            onChange={(next) => {
              const copy = [...draft.doseTimes];
              copy[i] = { ...next, appliesToDow: null };
              onChange({ ...draft, doseTimes: copy });
            }}
            onRemove={
              draft.doseTimes.length > 1
                ? () => onChange({ ...draft, doseTimes: draft.doseTimes.filter((_, j) => j !== i) })
                : undefined
            }
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          onChange({
            ...draft,
            doseTimes: [...draft.doseTimes, { timeOfDay: '', quantity: 1, appliesToDow: null }],
          })
        }
        className="flex items-center gap-2 text-sm font-semibold text-foreground"
      >
        <PlusCircle size={20} />
        Add a Time
      </button>
    </div>
  );
}

function SpecificDaysGroups({
  draft,
  onChange,
  noun,
}: {
  draft: CadenceDraft;
  onChange: (d: CadenceDraft) => void;
  noun: QtyNoun | null;
}) {
  // Group dose-times by bitmap. Group order is `draft.groups` (stable).
  // A bitmap of 0 means the group is freshly added with no days picked
  // yet — its "Add time" button is gated so dose-times can't be created
  // before the user picks at least one day.
  const groups = draft.groups.length > 0 ? draft.groups : [0];
  const groupedRows = groups.map((bm) => ({
    bitmap: bm,
    rows: draft.doseTimes
      .map((dt, originalIndex) => ({ dt, originalIndex }))
      .filter(({ dt }) => (dt.appliesToDow ?? 0) === bm),
  }));
  const claimedTotal = groups.reduce((acc, bm) => acc | bm, 0);

  function setGroupBitmap(oldBm: number, newBm: number) {
    // Apple's min-1-day rule (in day-pills.tsx) prevents the user from
    // dropping a non-zero bitmap to 0 via the day-pill UI. The only path
    // to bitmap=0 is the initial state of a freshly-added group, which
    // is handled by addGroup directly. So newBm===0 is unreachable from
    // an interactive deselect; no auto-remove branch needed here.
    const newGroups = groups.map((g) => (g === oldBm ? newBm : g));
    const newDoseTimes = draft.doseTimes.map((dt) =>
      (dt.appliesToDow ?? 0) === oldBm ? { ...dt, appliesToDow: newBm } : dt,
    );
    onChange({ ...draft, groups: newGroups, doseTimes: newDoseTimes });
  }

  // True when ANY group is currently empty. Group identity in this UI is
  // the bitmap itself (setGroupBitmap maps `groups[i] === oldBm`), so two
  // simultaneous bitmap=0 groups would propagate any day pick to all of
  // them and break the disjoint invariant. Gate Schedule Other Days on
  // this so the user finishes the current empty group before adding
  // another. Also prevents claimedTotal=0 in two-empty state from
  // disabling no pills (every day would be tappable in BOTH groups).
  const hasEmptyGroup = groups.some((bm) => bm === 0);

  function addGroup() {
    if (claimedTotal === DOW_ALL) return;
    if (hasEmptyGroup) return;
    // Apple Health: a fresh group starts empty; the user picks its days
    // explicitly.
    onChange({ ...draft, groups: [...groups, 0] });
  }

  function removeGroup(bm: number) {
    onChange({
      ...draft,
      groups: groups.filter((g) => g !== bm),
      doseTimes: draft.doseTimes.filter((dt) => (dt.appliesToDow ?? 0) !== bm),
    });
  }

  function addRowToGroup(bm: number) {
    if (bm === 0) return; // gated; the button is also disabled when bm===0
    onChange({
      ...draft,
      doseTimes: [
        ...draft.doseTimes,
        { timeOfDay: '', quantity: 1, appliesToDow: bm },
      ],
    });
  }

  function updateRow(originalIndex: number, next: DraftDoseTime, groupBm: number) {
    const copy = [...draft.doseTimes];
    copy[originalIndex] = { ...next, appliesToDow: groupBm };
    onChange({ ...draft, doseTimes: copy });
  }

  function removeRow(originalIndex: number) {
    onChange({ ...draft, doseTimes: draft.doseTimes.filter((_, j) => j !== originalIndex) });
  }

  return (
    <div className="space-y-4">
      {groupedRows.map((g, gi) => {
        const canAddTime = g.bitmap !== 0;
        return (
          <div key={gi} className="rounded-2xl bg-card shadow-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground mb-2">Days</p>
                <DayPills
                  bitmap={g.bitmap}
                  claimedByOthers={claimedTotal & ~g.bitmap}
                  onChange={(next) => setGroupBitmap(g.bitmap, next)}
                />
              </div>
              {groups.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeGroup(g.bitmap)}
                  className="text-xs text-muted-foreground underline shrink-0 mt-7"
                >
                  Remove group
                </button>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Times</p>
              {!canAddTime ? (
                <p className="text-xs text-muted-foreground">
                  Pick at least one day to add a time.
                </p>
              ) : g.rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">No times yet.</p>
              ) : (
                g.rows.map(({ dt, originalIndex }) => (
                  <DoseTimeRow
                    key={originalIndex}
                    value={dt}
                    noun={noun}
                    onChange={(next) => updateRow(originalIndex, next, g.bitmap)}
                    onRemove={
                      g.rows.length > 1
                        ? () => removeRow(originalIndex)
                        : undefined
                    }
                  />
                ))
              )}
              {canAddTime && (
                <button
                  type="button"
                  onClick={() => addRowToGroup(g.bitmap)}
                  className="flex items-center gap-2 text-sm font-semibold text-foreground"
                >
                  <PlusCircle size={20} />
                  Add a Time
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex justify-center">
        <button
          type="button"
          onClick={addGroup}
          disabled={claimedTotal === DOW_ALL || hasEmptyGroup}
          className="rounded-full bg-muted/60 px-6 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50"
        >
          Schedule Other Days
        </button>
      </div>
    </div>
  );
}

// Single (time, quantity, optional remove) row. The time input is mounted
// without a default value so iOS Safari opens its native picker on tap;
// once a value is set it stays. Quantity opens an inline numeric editor.
// Decimal-only quantity. Number() would accept "1e2" → 100, contradicting
// the AC that rejects scientific notation. The regex gate catches it
// upstream of the Number() parse.
const QTY_DECIMAL = /^\d+(?:\.\d+)?$/;

function DoseTimeRow({
  value,
  onChange,
  onRemove,
  noun,
}: {
  value: DraftDoseTime;
  onChange: (next: DraftDoseTime) => void;
  onRemove?: () => void;
  noun: QtyNoun | null;
}) {
  const [editingQty, setEditingQty] = useState(false);
  const [qtyDraft, setQtyDraft] = useState(String(value.quantity));
  const [qtyError, setQtyError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function commitQty() {
    const trimmed = qtyDraft.trim();
    if (!QTY_DECIMAL.test(trimmed)) {
      setQtyError('Enter a positive number, e.g. 1 or 0.5.');
      return;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) {
      setQtyError('Enter a positive number, e.g. 1 or 0.5.');
      return;
    }
    onChange({ ...value, quantity: n });
    setQtyError(null);
    setEditingQty(false);
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-destructive shrink-0"
            aria-label="Remove time"
          >
            <MinusCircle size={22} />
          </button>
        ) : (
          // Reserve the leading slot so the time pill stays in the same
          // column as rows that DO have a remove button. Visual stability.
          <span className="w-[22px] shrink-0" aria-hidden="true" />
        )}
        <input
          ref={inputRef}
          type="time"
          {...(value.timeOfDay ? { value: value.timeOfDay } : {})}
          onChange={(e) => onChange({ ...value, timeOfDay: e.target.value })}
          onClick={() => {
            // Capacitor WebView sometimes needs an explicit showPicker call.
            // showPicker() can throw InvalidStateError if the picker is
            // already opening on this click — swallow.
            try {
              inputRef.current?.showPicker?.();
            } catch {
              // ignore
            }
          }}
          className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {editingQty ? (
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            value={qtyDraft}
            onChange={(e) => {
              setQtyDraft(e.target.value);
              if (qtyError) setQtyError(null);
            }}
            onBlur={commitQty}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitQty();
              if (e.key === 'Escape') {
                setQtyDraft(String(value.quantity));
                setQtyError(null);
                setEditingQty(false);
              }
            }}
            className="w-20 rounded-full border border-border bg-background px-3 py-2 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setQtyDraft(String(value.quantity));
              setEditingQty(true);
            }}
            className="text-sm font-semibold text-foreground underline underline-offset-2 whitespace-nowrap"
          >
            {formatQuantity(value.quantity, noun)}
          </button>
        )}
      </div>
      {qtyError && (
        <p className="text-xs text-destructive mt-1 ml-[34px]">{qtyError}</p>
      )}
    </div>
  );
}

function formatQuantity(n: number, noun: QtyNoun | null): string {
  const display = Number.isInteger(n)
    ? String(n)
    : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  if (noun) {
    return n === 1 ? `1 ${noun.single}` : `${display} ${noun.plural}`;
  }
  return n === 1 ? '1 dose' : `${display} doses`;
}

const inputClass =
  'w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

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
      <span className="block text-sm font-medium text-foreground mb-1.5">{label}</span>
      {hint && <span className="block text-xs text-muted-foreground mb-1.5">{hint}</span>}
      {children}
    </label>
  );
}

// Build a fresh draft for a given cadence kind. `startedAt` and
// `cycleUnit` always carry from prior (kind-agnostic). Dose-times carry
// only across like-shaped families:
//   - flat (every_day | cyclical | every_few_days) ↔ flat: carry, drop bitmaps
//   - specific_days ↔ specific_days: carry doseTimes + groups verbatim
//   - flat → specific_days: drop doseTimes (no synthesizable bitmaps)
//   - specific_days → flat: drop doseTimes (bitmap context is gone)
//   - as_needed → anything: empty doseTimes (no times to carry)
// Dropping rather than synthesizing keeps the broken-state class
// (group bitmap=0 with dose-times) unreachable.
export function newDraft(kind: CadenceKind, prior?: CadenceDraft): CadenceDraft {
  const startedAt = prior?.startedAt ?? '';
  const cycleUnit = prior?.cycleUnit ?? 'day';
  const base: CadenceDraft = {
    kind,
    cycleOnDays: null,
    cycleOffDays: null,
    cycleUnit,
    intervalDays: null,
    startedAt,
    doseTimes: [],
    groups: [],
  };
  if (kind === 'as_needed') return base;
  if (kind === 'cyclical') {
    base.cycleOnDays = prior?.cycleOnDays ?? null;
    base.cycleOffDays = prior?.cycleOffDays ?? null;
  } else if (kind === 'every_few_days') {
    base.intervalDays = prior?.intervalDays ?? null;
  }
  if (kind === 'specific_days') {
    if (prior?.kind === 'specific_days' && prior.doseTimes.length > 0) {
      base.doseTimes = prior.doseTimes;
      base.groups = prior.groups.length > 0 ? prior.groups : [0];
    } else {
      base.groups = [0];
      base.doseTimes = [];
    }
    return base;
  }
  // Flat kinds. Carry from another flat kind (every_day ↔ cyclical ↔
  // every_few_days). Coming from specific_days drops dose-times because
  // their bitmaps don't translate to a flat list.
  if (
    prior &&
    prior.kind !== 'as_needed' &&
    prior.kind !== 'specific_days' &&
    prior.doseTimes.length > 0
  ) {
    base.doseTimes = prior.doseTimes.map((dt) => ({ ...dt, appliesToDow: null }));
  } else {
    base.doseTimes = [{ timeOfDay: '', quantity: 1, appliesToDow: null }];
  }
  return base;
}

export const ALL_CADENCE_KINDS = CADENCE_KINDS;
