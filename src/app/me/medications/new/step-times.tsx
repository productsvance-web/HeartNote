'use client';

interface Props {
  dosesPerDay: number | null;
  scheduleTimes: string[] | null;
  onChange: (scheduleTimes: string[] | null) => void;
  onContinue: () => void;
}

export function StepTimes({
  dosesPerDay,
  scheduleTimes,
  onChange,
  onContinue,
}: Props) {
  // Defensive: parent skips this step on PRN, but if we land here without
  // a count, render nothing rather than crash on Array.from.
  if (dosesPerDay === null) return null;

  // Render N pickers; null state means "not tracking times" — the
  // database column stays null, alerts/habit math treat the med as
  // schedule-less. The Skip link writes null and continues.
  const times = scheduleTimes ?? Array(dosesPerDay).fill('');

  function setTimeAt(index: number, value: string) {
    const next = times.slice();
    next[index] = value;
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-foreground">When during the day?</h1>
      <p className="text-sm text-muted-foreground">
        Optional — set the times you remember.
      </p>

      <div className="space-y-2">
        {Array.from({ length: dosesPerDay }, (_, i) => (
          <input
            key={i}
            type="time"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            value={times[i]}
            onChange={(e) => setTimeAt(i, e.target.value)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          onChange(null);
          onContinue();
        }}
        className="text-sm text-foreground underline underline-offset-2"
      >
        Skip — I don&rsquo;t track exact times
      </button>

      <div className="pt-4">
        <button
          type="button"
          onClick={() => {
            // Empty/partial values are treated as "no times" so the row
            // doesn't fail the schedule_times-length CHECK constraint.
            const filled = times.every((t) => t.trim().length > 0);
            onChange(filled ? times : null);
            onContinue();
          }}
          className="w-full rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
