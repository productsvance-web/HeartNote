// Segmented pill row — 3/4/5 options. Selected pill bg switches by
// activeVariant: sage (default — no concern), warn (tier-2 grade),
// alert (tier-1 grade). Per-option `variantOverride` lets a single
// option (e.g. white_frothy / pink_frothy sputum, dyspnea-at-rest)
// render in alert tone even when the row default is sage.
//
// Visual register matches docs/design/heartnote-log-redesign-mockup.html
// (.segmented / .seg-btn / .seg-btn.active{,.warn,.alert}).

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
      className="flex w-full rounded-full"
      // .segmented — cream bg, sage-mist border, 3px outer padding, 2px
      // gap between pills.
      style={{
        background: 'var(--cream)',
        border: '1px solid var(--sage-mist)',
        padding: 3,
        gap: 2,
      }}
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        const variant = opt.variantOverride ?? activeVariant;
        // Active styles per variant (mockup .seg-btn.active{,.warn,.alert}).
        // Sage: deep sage bg + cream-card text. Warn: warm-butter bg + warm
        // ink text. Alert: dusty-coral bg + deep-coral text.
        const activeBg =
          variant === 'alert'
            ? 'var(--alert-bg)'
            : variant === 'warn'
              ? 'var(--warn-bg)'
              : 'var(--sage-deep)';
        const activeColor =
          variant === 'alert'
            ? 'var(--alert-ink)'
            : variant === 'warn'
              ? 'var(--warn-ink)'
              : 'var(--cream-card)';
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className="flex-1 rounded-full transition active:scale-[0.97] whitespace-nowrap"
            style={{
              border: 0,
              background: selected ? activeBg : 'transparent',
              color: selected ? activeColor : 'var(--muted-foreground)',
              padding: '7px 4px',
              fontFamily: 'var(--font-sans)',
              fontSize: 11,
              fontWeight: selected ? 600 : 500,
              letterSpacing: '0.1px',
              boxShadow: selected
                ? '0 1px 3px rgba(60, 50, 40, 0.10)'
                : 'none',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
