// Segmented pill row — 3/4/5 options. Sage-deep selected pill, ink-soft
// unselected. Used for swelling severity (5), breathing severity (5),
// swelling body region (4), cough (3) on /log/manual.

'use client';

interface Option<V extends string | number> {
  value: V;
  label: string;
}

interface Props<V extends string | number> {
  options: Option<V>[];
  value: V | null;
  onChange: (v: V) => void;
  ariaLabel: string;
}

export function SegmentedControl<V extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: Props<V>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex w-full rounded-full p-1"
      style={{
        background: 'color-mix(in oklab, var(--sage-pale) 55%, transparent)',
        border: '0.5px solid color-mix(in oklab, var(--sage-pale) 80%, transparent)',
      }}
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className="flex-1 rounded-full px-2 py-2 text-[13px] font-medium transition active:scale-[0.97]"
            style={{
              background: selected ? 'var(--sage-deep)' : 'transparent',
              color: selected ? 'var(--card)' : 'var(--ink-soft, var(--muted-foreground))',
              boxShadow: selected
                ? '0 1px 6px color-mix(in oklab, var(--sage-deep) 30%, transparent)'
                : 'none',
              minHeight: 36,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
