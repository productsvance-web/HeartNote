// Segmented pill row — 3/4/5 options. Selected pill bg switches by
// activeVariant: sage (default — no concern), warn (tier-2 grade),
// alert (tier-1 grade). Per-option `variantOverride` lets a single
// option (e.g. white_frothy / pink_frothy sputum, dyspnea-at-rest)
// render in alert tone even when the row default is sage.

'use client';

interface Option<V extends string | number> {
  value: V;
  label: string;
  // Per-option variant override. When set, this option's selected
  // background uses the override instead of the row-level activeVariant.
  // Used for sputum (frothy options light up alert), dyspnea (level 4
  // lights up alert), and similar.
  variantOverride?: 'sage' | 'warn' | 'alert';
}

interface Props<V extends string | number> {
  options: Option<V>[];
  value: V | null;
  onChange: (v: V) => void;
  ariaLabel: string;
  activeVariant?: 'sage' | 'warn' | 'alert';
}

export function SegmentedControl<V extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  activeVariant = 'sage',
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
        const variant = opt.variantOverride ?? activeVariant;
        const selectedBg =
          variant === 'alert'
            ? 'var(--status-alert)'
            : variant === 'warn'
              ? 'var(--status-watch)'
              : 'var(--sage-deep)';
        const selectedShadow =
          variant === 'alert'
            ? '0 1px 6px color-mix(in oklab, var(--status-alert) 30%, transparent)'
            : variant === 'warn'
              ? '0 1px 6px color-mix(in oklab, var(--status-watch) 30%, transparent)'
              : '0 1px 6px color-mix(in oklab, var(--sage-deep) 30%, transparent)';
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className="flex-1 rounded-full px-2 py-2 text-[13px] font-medium transition active:scale-[0.97]"
            style={{
              background: selected ? selectedBg : 'transparent',
              color: selected ? 'var(--card)' : 'var(--ink-soft, var(--muted-foreground))',
              boxShadow: selected ? selectedShadow : 'none',
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
