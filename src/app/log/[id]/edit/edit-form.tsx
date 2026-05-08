'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus } from 'lucide-react';
import { saveLogEdit, type SaveLogEditPayload } from './actions';

type AppetiteChange = 'decreased' | 'unchanged' | 'increased';
type UrineChange = 'decreased' | 'unchanged' | 'increased';
type ActivityChange = 'none' | 'mild_slowdown' | 'severe_change';
type ReadingField = 'weight_lb' | 'resting_hr' | 'spo2' | 'systolic_bp' | 'diastolic_bp';
type SymptomKey =
  | 'dyspnea'
  | 'cough'
  | 'chest_pain'
  | 'swelling'
  | 'fatigue'
  | 'pnd'
  | 'syncope'
  | 'cognition_change'
  | 'extremities_cold_clammy'
  | 'cyanosis'
  | 'early_satiety'
  | 'pulse_irregular'
  | 'dizziness'
  | 'nausea';

// Per-field range matches src/lib/voice-log/process.ts ReadingRange
// and the DB CHECK constraints. Client-side guard so the Confirm button
// surfaces a clear error before the server round-trip.
const READING_RANGE: Record<ReadingField, [number, number]> = {
  weight_lb: [50, 700],
  resting_hr: [30, 220],
  spo2: [50, 100],
  systolic_bp: [60, 250],
  diastolic_bp: [30, 150],
};

interface ReadingRow {
  id: string;
  field: string;
  value: number;
  recordedAt: string;
}

interface SymptomRow {
  id: string;
  symptom: string;
  present: boolean;
  severity: number | null;
  bodyRegion: string | null;
  nocturnal: boolean | null;
  sputumColor: string | null;
  chestPainCharacter: string | null;
  resolvesOvernight: boolean | null;
  postural: boolean | null;
}

interface Props {
  logId: string;
  logDate: string;
  initialNotes: string;
  initialPillowCount: number | null;
  initialAppetiteChange: AppetiteChange | null;
  initialUrineOutputChange: UrineChange | null;
  initialActivityStepChange: ActivityChange | null;
  initialTranscript: string;
  initialReadings: ReadingRow[];
  initialSymptomEvents: SymptomRow[];
}

const READING_LABEL: Record<string, { name: string; unit: string }> = {
  weight_lb: { name: 'Weight', unit: 'lb' },
  resting_hr: { name: 'Resting heart rate', unit: 'bpm' },
  spo2: { name: 'Oxygen', unit: '%' },
  systolic_bp: { name: 'Systolic BP', unit: 'mmHg' },
  diastolic_bp: { name: 'Diastolic BP', unit: 'mmHg' },
};

const SYMPTOM_LABEL: Record<string, string> = {
  dyspnea: 'Shortness of breath',
  cough: 'Cough',
  swelling: 'Swelling',
  chest_pain: 'Chest pain',
  syncope: 'Fainting',
  cyanosis: 'Blue lips or fingers',
  cognition_change: 'Mental fog or confusion',
  pulse_irregular: 'Irregular pulse',
  dizziness: 'Dizziness',
  fatigue: 'Fatigue',
  extremities_cold_clammy: 'Cold or clammy hands',
  nausea: 'Nausea',
  pnd: 'Woke up gasping',
  early_satiety: 'Early fullness',
};

// Deterministic, alphabetized-by-label dropdown order. Object key order
// from a Record literal isn't a guarantee. Source list mirrors the
// SymptomKey union and the daily_log_symptom_events.symptom CHECK.
const SYMPTOM_OPTIONS: { key: SymptomKey; label: string }[] = (
  [
    'dyspnea',
    'cough',
    'chest_pain',
    'swelling',
    'fatigue',
    'pnd',
    'syncope',
    'cognition_change',
    'extremities_cold_clammy',
    'cyanosis',
    'early_satiety',
    'pulse_irregular',
    'dizziness',
    'nausea',
  ] as SymptomKey[]
)
  .map((key) => ({ key, label: SYMPTOM_LABEL[key] }))
  .sort((a, b) => a.label.localeCompare(b.label));

const READING_OPTIONS: { key: ReadingField; label: string }[] = [
  { key: 'weight_lb', label: 'Weight' },
  { key: 'resting_hr', label: 'Resting heart rate' },
  { key: 'spo2', label: 'Oxygen' },
  { key: 'systolic_bp', label: 'Systolic BP' },
  { key: 'diastolic_bp', label: 'Diastolic BP' },
];

// Symptoms whose severity (0–4) is read by the alert engine. For
// symptoms outside this set the severity field is hidden in v0.
const SYMPTOMS_WITH_SEVERITY = new Set([
  'dyspnea',
  'swelling',
  'cognition_change',
  'fatigue',
  'cough',
]);

export function LogEditForm({
  logId,
  logDate,
  initialNotes,
  initialPillowCount,
  initialAppetiteChange,
  initialUrineOutputChange,
  initialActivityStepChange,
  initialTranscript,
  initialReadings,
  initialSymptomEvents,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [notes, setNotes] = useState(initialNotes);
  const [pillowCount, setPillowCount] = useState<number | null>(initialPillowCount);
  const [appetite, setAppetite] = useState<AppetiteChange | null>(initialAppetiteChange);
  const [urine, setUrine] = useState<UrineChange | null>(initialUrineOutputChange);
  const [activity, setActivity] = useState<ActivityChange | null>(initialActivityStepChange);

  // Editable copies. `removed` flag carries through to the action; the
  // server applies the deletion. `created` rows skip the patch path and
  // route to newReadings / newSymptoms in the payload.
  const [readings, setReadings] = useState(
    initialReadings.map((r) => ({ ...r, removed: false, edited: false, created: false })),
  );
  const [symptoms, setSymptoms] = useState(
    initialSymptomEvents.map((e) => ({ ...e, removed: false, edited: false, created: false })),
  );

  // Inline picker drafts. null = picker closed.
  const [readingDraft, setReadingDraft] = useState<{
    field: ReadingField | '';
    value: string;
  } | null>(null);
  const [symptomDraft, setSymptomDraft] = useState<{ symptom: SymptomKey | '' } | null>(null);
  const [readingDraftError, setReadingDraftError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: SaveLogEditPayload = {
      logId,
      notes,
      pillowCount,
      appetiteChange: appetite,
      urineOutputChange: urine,
      activityStepChange: activity,
      readings: readings
        .filter((r) => !r.created && (r.removed || r.edited))
        .map((r) =>
          r.removed
            ? { id: r.id, remove: true }
            : { id: r.id, value: r.value },
        ),
      symptomEvents: symptoms
        .filter((s) => !s.created && (s.removed || s.edited))
        .map((s) =>
          s.removed
            ? { id: s.id, remove: true }
            : {
                id: s.id,
                present: s.present,
                severity: s.severity,
                nocturnal: s.nocturnal,
                postural: s.postural,
                resolvesOvernight: s.resolvesOvernight,
              },
        ),
      newReadings: readings
        .filter((r) => r.created && !r.removed)
        .map((r) => ({ field: r.field as ReadingField, value: r.value })),
      newSymptoms: symptoms
        .filter((s) => s.created && !s.removed)
        .map((s) => ({
          symptom: s.symptom as SymptomKey,
          severity: s.severity,
          nocturnal: s.nocturnal,
          postural: s.postural,
          resolvesOvernight: s.resolvesOvernight,
        })),
    };

    startTransition(async () => {
      const result = await saveLogEdit(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/log');
      router.refresh();
    });
  }

  const visibleReadings = readings.filter((r) => !r.removed);
  const visibleSymptoms = symptoms.filter((s) => !s.removed);

  return (
    <form onSubmit={handleSubmit} className="px-6 pt-4 pb-24 space-y-6">
      {initialTranscript.trim().length > 0 && (
        <details className="rounded-2xl bg-muted/40 px-4 py-3">
          <summary className="text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer">
            Original transcript
          </summary>
          <p className="mt-2 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {initialTranscript}
          </p>
        </details>
      )}

      <Section eyebrow="Notes">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything else worth remembering."
          className="w-full text-sm rounded-2xl border border-border bg-background px-3 py-2 leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </Section>

      <Section eyebrow={`Vitals${visibleReadings.length > 0 ? ` (${visibleReadings.length})` : ''}`}>
        {visibleReadings.length === 0 && readingDraft === null && (
          <EmptyHint>No readings extracted yet. Add one below if the AI missed it.</EmptyHint>
        )}
        {visibleReadings.length > 0 && (
          <ul className="space-y-2">
            {readings.map(
              (r, i) =>
                !r.removed && (
                  <li key={r.id} className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-foreground truncate">
                      {READING_LABEL[r.field]?.name ?? r.field}
                    </span>
                    <input
                      type="number"
                      step="0.1"
                      inputMode="decimal"
                      value={r.value}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setReadings((prev) =>
                          prev.map((row, idx) =>
                            idx === i
                              ? { ...row, value: Number.isFinite(v) ? v : row.value, edited: true }
                              : row,
                          ),
                        );
                      }}
                      className="w-24 rounded-full bg-muted/50 px-3 py-1.5 text-base font-medium text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <span className="text-xs text-muted-foreground tabular-nums w-10">
                      {READING_LABEL[r.field]?.unit ?? ''}
                    </span>
                    <RemoveButton
                      label={`Remove ${READING_LABEL[r.field]?.name ?? r.field}`}
                      onClick={() =>
                        setReadings((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, removed: true } : row,
                          ),
                        )
                      }
                    />
                  </li>
                ),
            )}
          </ul>
        )}
        {readingDraft !== null && (
          <ReadingDraftRow
            draft={readingDraft}
            error={readingDraftError}
            onChange={(d) => {
              setReadingDraft(d);
              setReadingDraftError(null);
            }}
            onCancel={() => {
              setReadingDraft(null);
              setReadingDraftError(null);
            }}
            onConfirm={() => {
              if (readingDraft.field === '') return;
              const value = Number(readingDraft.value);
              if (!Number.isFinite(value)) {
                setReadingDraftError('Enter a number.');
                return;
              }
              const [min, max] = READING_RANGE[readingDraft.field];
              if (value < min || value > max) {
                const unit = READING_LABEL[readingDraft.field]?.unit ?? '';
                setReadingDraftError(`Out of range. ${min}–${max} ${unit}.`);
                return;
              }
              setReadings((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  field: readingDraft.field as ReadingField,
                  value,
                  recordedAt: '',
                  removed: false,
                  edited: false,
                  created: true,
                },
              ]);
              setReadingDraft(null);
              setReadingDraftError(null);
            }}
          />
        )}
        <div className={readingDraft !== null || visibleReadings.length > 0 ? 'mt-3' : 'mt-2'}>
          <AddButton
            label="Add a reading"
            onClick={() => {
              if (readingDraft === null) setReadingDraft({ field: '', value: '' });
            }}
          />
        </div>
      </Section>

      <Section eyebrow="Daily details">
        <div className="rounded-2xl bg-card shadow-card divide-y divide-border overflow-hidden">
          <SelectRow
            label="Pillows tonight"
            value={pillowCount === null ? '' : String(pillowCount)}
            onChange={(v) => setPillowCount(v === '' ? null : Number(v))}
            options={[
              { value: '', label: 'Not reported' },
              { value: '0', label: 'None' },
              { value: '1', label: '1' },
              { value: '2', label: '2' },
              { value: '3', label: '3' },
              { value: '4', label: '4 or more' },
            ]}
          />
          <SelectRow
            label="Appetite"
            value={appetite ?? ''}
            onChange={(v) => setAppetite((v || null) as AppetiteChange | null)}
            options={[
              { value: '', label: 'Not reported' },
              { value: 'decreased', label: 'Less than usual' },
              { value: 'unchanged', label: 'Same as usual' },
              { value: 'increased', label: 'More than usual' },
            ]}
          />
          <SelectRow
            label="Urine output"
            value={urine ?? ''}
            onChange={(v) => setUrine((v || null) as UrineChange | null)}
            options={[
              { value: '', label: 'Not reported' },
              { value: 'decreased', label: 'Less than usual' },
              { value: 'unchanged', label: 'Same as usual' },
              { value: 'increased', label: 'More than usual' },
            ]}
          />
          <SelectRow
            label="Activity today"
            value={activity ?? ''}
            onChange={(v) => setActivity((v || null) as ActivityChange | null)}
            options={[
              { value: '', label: 'Not reported' },
              { value: 'none', label: 'Same as usual' },
              { value: 'mild_slowdown', label: 'Slower than usual' },
              { value: 'severe_change', label: 'Much less than usual' },
            ]}
          />
        </div>
      </Section>

      <Section eyebrow={`Symptoms${visibleSymptoms.length > 0 ? ` (${visibleSymptoms.length})` : ''}`}>
        {visibleSymptoms.length === 0 && symptomDraft === null && (
          <EmptyHint>No symptoms reported yet. Add one below if the AI missed it.</EmptyHint>
        )}
        {visibleSymptoms.length > 0 && (
          <ul className="space-y-2">
            {symptoms.map(
              (s, i) =>
                !s.removed && (
                  <li
                    key={s.id}
                    className="rounded-2xl bg-card shadow-card px-4 py-3 flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm font-medium text-foreground">
                        {SYMPTOM_LABEL[s.symptom] ?? s.symptom}
                      </span>
                      <RemoveButton
                        label={`Remove ${SYMPTOM_LABEL[s.symptom] ?? s.symptom}`}
                        onClick={() =>
                          setSymptoms((prev) =>
                            prev.map((row, idx) =>
                              idx === i ? { ...row, removed: true } : row,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                      {SYMPTOMS_WITH_SEVERITY.has(s.symptom) && (
                        <label className="flex items-center gap-2">
                          Severity
                          <select
                            value={s.severity ?? ''}
                            onChange={(e) => {
                              const v = e.target.value === '' ? null : Number(e.target.value);
                              setSymptoms((prev) =>
                                prev.map((row, idx) =>
                                  idx === i ? { ...row, severity: v, edited: true } : row,
                                ),
                              );
                            }}
                            className="rounded-full bg-muted/50 px-2 py-1 text-xs"
                          >
                            <option value="">—</option>
                            <option value="0">0 — none</option>
                            <option value="1">1 — mild</option>
                            <option value="2">2 — moderate</option>
                            <option value="3">3 — severe</option>
                            <option value="4">4 — emergency</option>
                          </select>
                        </label>
                      )}
                      {s.symptom === 'cough' && (
                        <BoolToggle
                          label="Nighttime"
                          value={s.nocturnal}
                          onChange={(v) =>
                            setSymptoms((prev) =>
                              prev.map((row, idx) =>
                                idx === i ? { ...row, nocturnal: v, edited: true } : row,
                              ),
                            )
                          }
                        />
                      )}
                      {s.symptom === 'dizziness' && (
                        <BoolToggle
                          label="On standing"
                          value={s.postural}
                          onChange={(v) =>
                            setSymptoms((prev) =>
                              prev.map((row, idx) =>
                                idx === i ? { ...row, postural: v, edited: true } : row,
                              ),
                            )
                          }
                        />
                      )}
                      {s.symptom === 'swelling' && (
                        <BoolToggle
                          label="Resolves overnight"
                          value={s.resolvesOvernight}
                          onChange={(v) =>
                            setSymptoms((prev) =>
                              prev.map((row, idx) =>
                                idx === i
                                  ? { ...row, resolvesOvernight: v, edited: true }
                                  : row,
                              ),
                            )
                          }
                        />
                      )}
                    </div>
                  </li>
                ),
            )}
          </ul>
        )}
        {symptomDraft !== null && (
          <SymptomDraftRow
            draft={symptomDraft}
            onChange={setSymptomDraft}
            onCancel={() => setSymptomDraft(null)}
            onConfirm={() => {
              if (symptomDraft.symptom === '') return;
              setSymptoms((prev) => [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  symptom: symptomDraft.symptom as SymptomKey,
                  present: true,
                  severity: null,
                  bodyRegion: null,
                  nocturnal: null,
                  sputumColor: null,
                  chestPainCharacter: null,
                  resolvesOvernight: null,
                  postural: null,
                  removed: false,
                  edited: false,
                  created: true,
                },
              ]);
              setSymptomDraft(null);
            }}
          />
        )}
        <div className={symptomDraft !== null || visibleSymptoms.length > 0 ? 'mt-3' : 'mt-2'}>
          <AddButton
            label="Add a symptom"
            onClick={() => {
              if (symptomDraft === null) setSymptomDraft({ symptom: '' });
            }}
          />
        </div>
      </Section>

      {error && (
        <p
          className="text-sm rounded-2xl px-3 py-2"
          style={{
            background: 'var(--status-alert-soft)',
            color: 'var(--status-alert-foreground)',
          }}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full px-6 py-3.5 text-sm font-semibold disabled:opacity-60 active:scale-[0.98] transition"
        style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
      >
        {pending ? 'Saving and re-checking…' : 'Save changes'}
      </button>

      <p className="text-[11px] text-muted-foreground text-center">
        Saving re-evaluates today&rsquo;s pattern read for {logDate}.
      </p>
    </form>
  );
}

function Section({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        {eyebrow}
      </p>
      {children}
    </div>
  );
}

function SelectRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3">
      <span className="text-sm text-foreground flex-1 min-w-0 truncate">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm font-medium text-foreground text-right focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-muted-foreground rounded-2xl bg-muted/40 px-3 py-2 leading-relaxed">
      {children}
    </p>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="shrink-0 inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-destructive active:scale-[0.94] transition"
    >
      <Minus size={14} strokeWidth={3} className="text-white" />
    </button>
  );
}

function BoolToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      {label}
      <select
        value={value === null ? '' : value ? 'yes' : 'no'}
        onChange={(e) =>
          onChange(e.target.value === '' ? null : e.target.value === 'yes')
        }
        className="rounded-full bg-muted/50 px-2 py-1 text-xs"
      >
        <option value="">—</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}

// Pattern #3 (sage-circle-plus). Geometry mirrors the existing
// RemoveButton (22×22) so the page reads as one consistent register.
// See .claude/rules/canonical-controls.md — written spec calls out 32×32
// + bg-accent, but the cadence-fields reference impl + the in-page
// RemoveButton are both 22×22, so this matches the local convention.
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center gap-2 text-sm font-semibold text-primary active:scale-[0.94] transition"
    >
      <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-status-good">
        <Plus size={14} strokeWidth={3} className="text-white" />
      </span>
      {label}
    </button>
  );
}

function ReadingDraftRow({
  draft,
  error,
  onChange,
  onConfirm,
  onCancel,
}: {
  draft: { field: ReadingField | ''; value: string };
  error: string | null;
  onChange: (d: { field: ReadingField | ''; value: string }) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const unit = draft.field === '' ? '' : READING_LABEL[draft.field]?.unit ?? '';
  const canConfirm = draft.field !== '' && draft.value.trim() !== '';
  return (
    <div className="mt-3 rounded-2xl bg-muted/40 px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={draft.field}
          onChange={(e) =>
            onChange({ ...draft, field: e.target.value as ReadingField | '' })
          }
          aria-label="New reading field"
          className="flex-1 rounded-full bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Pick a reading…</option>
          {READING_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="0.1"
          inputMode="decimal"
          value={draft.value}
          onChange={(e) => onChange({ ...draft, value: e.target.value })}
          placeholder="Value"
          aria-label="New reading value"
          className="w-24 rounded-full bg-background px-3 py-1.5 text-base font-medium text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground tabular-nums w-10">{unit}</span>
      </div>
      {error && (
        <p
          className="text-xs"
          style={{ color: 'var(--status-alert-foreground)' }}
        >
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold text-muted-foreground active:scale-[0.96] transition px-3 py-1.5"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm}
          className="text-xs font-semibold text-primary disabled:opacity-40 active:scale-[0.96] transition px-3 py-1.5"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}

function SymptomDraftRow({
  draft,
  onChange,
  onConfirm,
  onCancel,
}: {
  draft: { symptom: SymptomKey | '' };
  onChange: (d: { symptom: SymptomKey | '' }) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const canConfirm = draft.symptom !== '';
  return (
    <div className="mt-3 rounded-2xl bg-muted/40 px-4 py-3 space-y-2">
      <select
        value={draft.symptom}
        onChange={(e) =>
          onChange({ symptom: e.target.value as SymptomKey | '' })
        }
        aria-label="New symptom"
        className="w-full rounded-full bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <option value="">Pick a symptom…</option>
        {SYMPTOM_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-semibold text-muted-foreground active:scale-[0.96] transition px-3 py-1.5"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm}
          className="text-xs font-semibold text-primary disabled:opacity-40 active:scale-[0.96] transition px-3 py-1.5"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
