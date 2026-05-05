'use client';

interface Props {
  startedAt: string;
  notes: string;
  saveError: string | null;
  saving: boolean;
  onChange: (patch: { startedAt?: string; notes?: string }) => void;
  onSave: () => void;
}

export function StepDetails({
  startedAt,
  notes,
  saveError,
  saving,
  onChange,
  onSave,
}: Props) {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-foreground">Anything else?</h1>
      <p className="text-sm text-muted-foreground">Optional. Save when ready.</p>

      <label className="block">
        <span className="block text-sm font-medium text-foreground mb-1.5">Started</span>
        <input
          type="date"
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          value={startedAt}
          onChange={(e) => onChange({ startedAt: e.target.value })}
        />
      </label>

      <label className="block">
        <span className="block text-sm font-medium text-foreground mb-1.5">Notes</span>
        <textarea
          rows={3}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          value={notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Anything the prescriber said worth remembering."
        />
      </label>

      {saveError && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          {saveError}
        </p>
      )}

      <div className="pt-4">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="w-full rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving…' : saveError ? 'Try again' : 'Save medication'}
        </button>
      </div>
    </div>
  );
}
