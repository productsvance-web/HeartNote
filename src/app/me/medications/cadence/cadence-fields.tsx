'use client';

import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, Check } from 'lucide-react';
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
  endedAt: string;   // YYYY-MM-DD or ''
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
        <div className="rounded-2xl bg-card shadow-card divide-y divide-border overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
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
          {draft.kind === 'cyclical' && (
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-base text-foreground">Every</p>
              <select
                value={draft.cycleUnit}
                onChange={(e) =>
                  onChange({ ...draft, cycleUnit: e.target.value as 'day' | 'week' })
                }
                className="bg-transparent text-base font-semibold text-foreground text-right focus:outline-none"
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
              </select>
            </div>
          )}
          {draft.kind === 'every_few_days' && (
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-base text-foreground">Interval</p>
              <select
                value={draft.intervalDays ?? ''}
                onChange={(e) =>
                  onChange({
                    ...draft,
                    intervalDays: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                className="bg-transparent text-base font-semibold text-foreground text-right focus:outline-none"
              >
                <option value="">Pick…</option>
                {Array.from({ length: 29 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    Every {n === 2 ? 'other day' : `${n} days`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {draft.kind === 'specific_days' && (
        <SpecificDaysGroups draft={draft} onChange={onChange} noun={noun} />
      )}

      {draft.kind !== 'as_needed' && draft.kind !== 'specific_days' && (
        <AtWhatTimeCard draft={draft} onChange={onChange} noun={noun} />
      )}

      {draft.kind === 'cyclical' && <CycleCard draft={draft} onChange={onChange} />}

      {draft.kind !== 'as_needed' && !showReminderDenied && (
        <p className="text-xs text-muted-foreground text-center px-4">
          Reminders fire at the scheduled times.
        </p>
      )}

      {draft.kind !== 'as_needed' && (
        <DurationCard draft={draft} onChange={onChange} />
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

function AtWhatTimeCard({
  draft,
  onChange,
  noun,
}: {
  draft: CadenceDraft;
  onChange: (d: CadenceDraft) => void;
  noun: QtyNoun | null;
}) {
  // Flat list of (time, quantity) rows for every_day / cyclical /
  // every_few_days. specific_days gets its own per-group cards via
  // SpecificDaysGroups. appliesToDow is null for these kinds.
  return (
    <div>
      <p className="text-sm font-medium text-foreground mb-2">At what time?</p>
      <div className="rounded-2xl bg-card shadow-card p-4 space-y-3">
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
            onRemove={() =>
              onChange({ ...draft, doseTimes: draft.doseTimes.filter((_, j) => j !== i) })
            }
          />
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ...draft,
              doseTimes: [
                ...draft.doseTimes,
                { timeOfDay: currentHhMm(), quantity: 1, appliesToDow: null },
              ],
            })
          }
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-status-good">
            <Plus size={14} strokeWidth={3} className="text-white" />
          </span>
          Add a Time
        </button>
      </div>
    </div>
  );
}

function CycleCard({ draft, onChange }: { draft: CadenceDraft; onChange: (d: CadenceDraft) => void }) {
  const factor = draft.cycleUnit === 'week' ? 7 : 1;
  // 60-day max covers the longest common ambulatory cyclical regimens
  // (typical CHF/hormonal cycles fit comfortably under this). Weeks cap
  // at 12 (~3 months) for the same practical ceiling.
  const max = draft.cycleUnit === 'week' ? 12 : 60;
  const singularUnit = draft.cycleUnit === 'week' ? 'week' : 'day';
  const pluralUnit = draft.cycleUnit === 'week' ? 'weeks' : 'days';
  const onValue = draft.cycleOnDays != null ? Math.round(draft.cycleOnDays / factor) : null;
  const offValue = draft.cycleOffDays != null ? Math.round(draft.cycleOffDays / factor) : null;

  return (
    <div>
      <p className="text-sm font-medium text-foreground mb-2">What is the cycle?</p>
      <div className="rounded-2xl bg-card shadow-card divide-y divide-border overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-base text-foreground">Use for</p>
          <select
            value={onValue ?? ''}
            onChange={(e) => {
              const n = e.target.value === '' ? null : Number(e.target.value);
              onChange({ ...draft, cycleOnDays: n == null ? null : n * factor });
            }}
            className="bg-transparent text-base font-semibold text-primary text-right focus:outline-none"
          >
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? singularUnit : pluralUnit}
              </option>
            ))}
          </select>
        </div>
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-base text-foreground">Pause for</p>
          <select
            value={offValue ?? ''}
            onChange={(e) => {
              const n = e.target.value === '' ? null : Number(e.target.value);
              onChange({ ...draft, cycleOffDays: n == null ? null : n * factor });
            }}
            className="bg-transparent text-base font-semibold text-primary text-right focus:outline-none"
          >
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? singularUnit : pluralUnit}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function DurationCard({
  draft,
  onChange,
}: {
  draft: CadenceDraft;
  onChange: (d: CadenceDraft) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground mb-2">Duration</p>
      <div className="rounded-2xl bg-card shadow-card p-4">
        <div className="grid grid-cols-2 gap-3">
          <DateField
            label="Start date"
            value={draft.startedAt}
            onChange={(v) => onChange({ ...draft, startedAt: v })}
          />
          <DateField
            label="End date"
            value={draft.endedAt}
            onChange={(v) => onChange({ ...draft, endedAt: v })}
          />
        </div>
      </div>
    </div>
  );
}

// Date pill with a "—" overlay when empty, since `<input type="date">`
// has no portable placeholder. The overlay sits on top with
// `pointer-events-none` so taps fall through to the input and trigger
// the native iOS picker. Once a date is picked, the overlay is no
// longer rendered.
function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[10px] uppercase tracking-wide text-muted-foreground/70">
        {label}
      </span>
      <span className="relative inline-block">
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-full bg-muted/50 px-3 py-1.5 text-base font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {!value && (
          <span className="absolute inset-0 flex items-center justify-start pl-3 pointer-events-none rounded-full bg-muted/50 text-base font-medium text-muted-foreground">
            —
          </span>
        )}
      </span>
    </label>
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
        { timeOfDay: currentHhMm(), quantity: 1, appliesToDow: bm },
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
                    onRemove={() => removeRow(originalIndex)}
                  />
                ))
              )}
              {canAddTime && (
                <button
                  type="button"
                  onClick={() => addRowToGroup(g.bitmap)}
                  className="flex items-center gap-2 text-sm font-semibold text-foreground"
                >
                  <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-status-good">
                    <Plus size={14} strokeWidth={3} className="text-white" />
                  </span>
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
// Decimal-only quantity. Allows "1", "0.5", "0.75", and ".5" (leading-dot
// shorthand caregivers commonly type). Number() would accept "1e2" → 100,
// contradicting the rule that rejects scientific notation; the regex gate
// catches it upstream of the Number() parse. Trailing dot ("1.") rejected.
const QTY_DECIMAL = /^\d*\.?\d+$/;

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
  const inputRef = useRef<HTMLInputElement | null>(null);

  function commitQty() {
    // Silent form validation: revert on anything other than a positive
    // decimal. Negatives, scientific notation, NaN, empty all just snap
    // back to the previous quantity. The decimal-regex gate also catches
    // "1e2" (which Number() would parse to 100) — same reasoning as
    // before, just no toast about it.
    const trimmed = qtyDraft.trim();
    const n = Number(trimmed);
    if (QTY_DECIMAL.test(trimmed) && Number.isFinite(n) && n > 0) {
      onChange({ ...value, quantity: n });
    }
    setEditingQty(false);
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-destructive"
            aria-label="Remove time"
          >
            <Minus size={14} strokeWidth={3} className="text-white" />
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
          className="rounded-full bg-muted/50 px-3 py-1.5 text-base font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {editingQty ? (
          <span className="ml-auto inline-flex items-baseline gap-1 text-sm font-semibold text-primary whitespace-nowrap">
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={qtyDraft}
              onChange={(e) => setQtyDraft(e.target.value)}
              onBlur={commitQty}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitQty();
                if (e.key === 'Escape') {
                  setQtyDraft(String(value.quantity));
                  setEditingQty(false);
                }
              }}
              className="w-12 bg-transparent text-right focus:outline-none"
            />
            <span>{liveNounForDraft(qtyDraft, value.quantity, noun)}</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setQtyDraft(String(value.quantity));
              setEditingQty(true);
            }}
            className="ml-auto text-sm font-semibold text-primary whitespace-nowrap"
          >
            {formatQuantity(value.quantity, noun)}
          </button>
        )}
      </div>
    </div>
  );
}

// Local-time HH:MM for default dose-time values. The native time input
// expects 24-hour format and renders in the user's locale. Apple's pattern:
// "Add a Time" inserts a row prefilled with the current time, so the user
// sees a meaningful default instead of a blank --:-- placeholder they'd
// have to tap to fix.
function currentHhMm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Local-time YYYY-MM-DD for the Duration card's start-date default.
// `Date.toISOString` would shift to UTC and return yesterday for users west
// of GMT after midnight local time.
function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatQuantityNumber(n: number): string {
  return Number.isInteger(n)
    ? String(n)
    : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function quantityNoun(n: number, noun: QtyNoun | null): string {
  // Singular for anything < 1.5 (so "0.5 tablet", "1 tablet", "1.25 tablet"
  // all read as one thing — half a tablet is still ONE tablet split). Plural
  // for 1.5+ ("1.5 tablets", "2 tablets"). Reflects how caregivers actually
  // count partial doses, not strict English plural rules.
  const isSingular = n < 1.5;
  if (noun) return isSingular ? noun.single : noun.plural;
  return isSingular ? 'dose' : 'doses';
}

function formatQuantity(n: number, noun: QtyNoun | null): string {
  return `${formatQuantityNumber(n)} ${quantityNoun(n, noun)}`;
}

// Live-pluralized unit word for the quantity edit field. As the user
// types, the unit word updates ("0.5 tablets" → "1 tablet" → "2 tablets")
// without losing the word entirely. Invalid drafts (empty, scientific,
// negative) fall back to the last committed quantity so we don't flicker
// between singular/plural while the user is clearing the field.
function liveNounForDraft(draft: string, lastCommitted: number, noun: QtyNoun | null): string {
  const trimmed = draft.trim();
  if (QTY_DECIMAL.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n) && n > 0) return quantityNoun(n, noun);
  }
  return quantityNoun(lastCommitted, noun);
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
  // Default startedAt to today for fresh drafts so the Duration card
  // shows a real date instead of an empty placeholder. Carries forward
  // from prior on kind-switch.
  const startedAt = prior?.startedAt ?? todayYmd();
  const endedAt = prior?.endedAt ?? '';
  const cycleUnit = prior?.cycleUnit ?? 'day';
  const base: CadenceDraft = {
    kind,
    cycleOnDays: null,
    cycleOffDays: null,
    cycleUnit,
    intervalDays: null,
    startedAt,
    endedAt,
    doseTimes: [],
    groups: [],
  };
  if (kind === 'as_needed') return base;
  if (kind === 'cyclical') {
    // Apple Health's defaults for a fresh cyclical schedule. Standard
    // 21-on / 7-off cadence (e.g., hormonal contraceptive cycle). Carries
    // forward when the user is editing an existing draft.
    base.cycleOnDays = prior?.cycleOnDays ?? 21;
    base.cycleOffDays = prior?.cycleOffDays ?? 7;
  } else if (kind === 'every_few_days') {
    // Default to "Every Other Day" (interval=2) so the picker isn't
    // empty on first land.
    base.intervalDays = prior?.intervalDays ?? 2;
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
    base.doseTimes = [{ timeOfDay: currentHhMm(), quantity: 1, appliesToDow: null }];
  }
  return base;
}

export const ALL_CADENCE_KINDS = CADENCE_KINDS;
