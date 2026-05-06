'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  CADENCE_KINDS,
  DOW_ALL,
  type CadenceKind,
} from '@/lib/medications/cadence';
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

interface Props {
  draft: CadenceDraft;
  onChange: (next: CadenceDraft) => void;
  onBack: () => void;
  onSave: () => void;
  saving?: boolean;
  error?: string | null;
  drugLabel: string;
}

const KIND_TITLES: Record<CadenceKind, string> = {
  every_day: 'Every Day',
  cyclical: 'On a Cyclical Schedule',
  specific_days: 'On Specific Days of the Week',
  every_few_days: 'Every Few Days',
  as_needed: 'As Needed',
};

export function CadenceFields({ draft, onChange, onBack, onSave, saving, error, drugLabel }: Props) {
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="text-xs text-muted-foreground underline underline-offset-2"
      >
        ← Change cadence
      </button>

      <div className="rounded-2xl bg-card shadow-card p-4">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{drugLabel}</p>
        <p className="text-base font-semibold text-foreground mt-1">{KIND_TITLES[draft.kind]}</p>
      </div>

      {draft.kind === 'cyclical' && <CyclicalFields draft={draft} onChange={onChange} />}
      {draft.kind === 'every_few_days' && <IntervalFields draft={draft} onChange={onChange} />}

      {draft.kind !== 'as_needed' && (
        <DoseTimesField
          kind={draft.kind}
          draft={draft}
          onChange={onChange}
        />
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

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="w-full rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save schedule'}
      </button>
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
}: {
  kind: CadenceKind;
  draft: CadenceDraft;
  onChange: (d: CadenceDraft) => void;
}) {
  if (kind === 'specific_days') {
    return <SpecificDaysGroups draft={draft} onChange={onChange} />;
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
        className="text-sm text-foreground underline underline-offset-2"
      >
        Add time
      </button>
    </div>
  );
}

function SpecificDaysGroups({
  draft,
  onChange,
}: {
  draft: CadenceDraft;
  onChange: (d: CadenceDraft) => void;
}) {
  // Group dose-times by bitmap. Group order is `draft.groups` (stable).
  // A bitmap of 0 means the group is freshly added with no days picked.
  const groups = draft.groups.length > 0 ? draft.groups : [0];
  const groupedRows = groups.map((bm) => ({
    bitmap: bm,
    rows: draft.doseTimes
      .map((dt, originalIndex) => ({ dt, originalIndex }))
      .filter(({ dt }) => dt.appliesToDow === bm || (dt.appliesToDow ?? 0) === bm),
  }));
  const claimedTotal = groups.reduce((acc, bm) => acc | bm, 0);

  function setGroupBitmap(oldBm: number, newBm: number) {
    const newGroups = groups.map((g) => (g === oldBm ? newBm : g));
    const newDoseTimes = draft.doseTimes.map((dt) =>
      (dt.appliesToDow ?? 0) === oldBm ? { ...dt, appliesToDow: newBm === 0 ? null : newBm } : dt,
    );
    onChange({ ...draft, groups: newGroups, doseTimes: newDoseTimes });
  }

  function addGroup() {
    if (claimedTotal === DOW_ALL) return;
    const remaining = DOW_ALL & ~claimedTotal;
    onChange({ ...draft, groups: [...groups, remaining] });
  }

  function removeGroup(bm: number) {
    onChange({
      ...draft,
      groups: groups.filter((g) => g !== bm),
      doseTimes: draft.doseTimes.filter((dt) => (dt.appliesToDow ?? 0) !== bm),
    });
  }

  function addRowToGroup(bm: number) {
    onChange({
      ...draft,
      doseTimes: [
        ...draft.doseTimes,
        { timeOfDay: '', quantity: 1, appliesToDow: bm === 0 ? null : bm },
      ],
    });
  }

  function updateRow(originalIndex: number, next: DraftDoseTime, groupBm: number) {
    const copy = [...draft.doseTimes];
    copy[originalIndex] = { ...next, appliesToDow: groupBm === 0 ? null : groupBm };
    onChange({ ...draft, doseTimes: copy });
  }

  function removeRow(originalIndex: number) {
    onChange({ ...draft, doseTimes: draft.doseTimes.filter((_, j) => j !== originalIndex) });
  }

  return (
    <div className="space-y-4">
      {groupedRows.map((g, gi) => (
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
            {g.rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">No times yet.</p>
            ) : (
              g.rows.map(({ dt, originalIndex }) => (
                <DoseTimeRow
                  key={originalIndex}
                  value={dt}
                  onChange={(next) => updateRow(originalIndex, next, g.bitmap)}
                  onRemove={
                    g.rows.length > 1
                      ? () => removeRow(originalIndex)
                      : undefined
                  }
                />
              ))
            )}
            <button
              type="button"
              onClick={() => addRowToGroup(g.bitmap)}
              className="text-sm text-foreground underline underline-offset-2"
            >
              Add time
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addGroup}
        disabled={claimedTotal === DOW_ALL}
        className="w-full rounded-full border border-border px-6 py-3 text-sm font-medium disabled:opacity-50"
      >
        Schedule Other Days
      </button>
    </div>
  );
}

// Single (time, quantity, optional remove) row. The time input is mounted
// without a default value so iOS Safari opens its native picker on tap;
// once a value is set it stays. Quantity opens an inline numeric editor.
function DoseTimeRow({
  value,
  onChange,
  onRemove,
}: {
  value: DraftDoseTime;
  onChange: (next: DraftDoseTime) => void;
  onRemove?: () => void;
}) {
  const [editingQty, setEditingQty] = useState(false);
  const [qtyDraft, setQtyDraft] = useState(String(value.quantity));
  const inputRef = useRef<HTMLInputElement | null>(null);

  function commitQty() {
    const n = Number(qtyDraft.trim());
    if (Number.isFinite(n) && n > 0) {
      onChange({ ...value, quantity: n });
    } else {
      setQtyDraft(String(value.quantity));
    }
    setEditingQty(false);
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="time"
        // No default value: iOS Safari blocks the native picker on inputs
        // that already have a value. Tapping the empty input opens the
        // wheel; on change we capture the HH:MM.
        {...(value.timeOfDay ? { value: value.timeOfDay } : {})}
        onChange={(e) => onChange({ ...value, timeOfDay: e.target.value })}
        onClick={() => {
          // Capacitor WebView sometimes needs an explicit showPicker call.
          inputRef.current?.showPicker?.();
        }}
        className={`${inputClass} flex-1`}
      />
      {editingQty ? (
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
          className={`${inputClass} w-20`}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setQtyDraft(String(value.quantity));
            setEditingQty(true);
          }}
          className="text-sm text-foreground underline underline-offset-2 whitespace-nowrap"
        >
          {formatQuantity(value.quantity)}
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-muted-foreground"
          aria-label="Remove time"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

function formatQuantity(n: number): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return n === 1 ? '1 dose' : `${s} doses`;
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

// Build a fresh draft for a given cadence kind, preserving cross-kind data
// (start date, dose times) where it carries meaning.
export function newDraft(kind: CadenceKind, prior?: CadenceDraft): CadenceDraft {
  const carry = prior ?? {
    kind,
    cycleOnDays: null,
    cycleOffDays: null,
    cycleUnit: 'day' as const,
    intervalDays: null,
    startedAt: '',
    doseTimes: [],
    groups: [],
  };
  if (kind === 'as_needed') {
    return { ...carry, kind, doseTimes: [], groups: [] };
  }
  if (kind === 'specific_days') {
    const seedRow = { timeOfDay: '', quantity: 1, appliesToDow: null };
    const doseTimes =
      carry.doseTimes.length > 0
        ? carry.doseTimes.map((dt) => ({ ...dt, appliesToDow: dt.appliesToDow ?? 0 }))
        : [seedRow];
    const groups = carry.groups.length > 0 ? carry.groups : [0];
    return { ...carry, kind, doseTimes, groups };
  }
  // every_day, cyclical, every_few_days
  const doseTimes =
    carry.doseTimes.length > 0
      ? carry.doseTimes.map((dt) => ({ ...dt, appliesToDow: null }))
      : [{ timeOfDay: '', quantity: 1, appliesToDow: null }];
  return { ...carry, kind, doseTimes, groups: [] };
}

export const ALL_CADENCE_KINDS = CADENCE_KINDS;
