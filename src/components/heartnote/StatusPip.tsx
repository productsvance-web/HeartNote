type Tier = 'good' | 'watch' | 'alert' | 'unknown';

const FILL: Record<Tier, string> = {
  good: 'var(--status-good)',
  watch: 'var(--status-watch)',
  alert: 'var(--status-alert)',
  unknown: 'var(--muted-foreground)',
};

export function StatusPip({ tier, size = 8 }: { tier: Tier; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 9999,
        background: FILL[tier],
        flexShrink: 0,
        boxShadow:
          tier === 'alert'
            ? '0 0 0 3px color-mix(in oklab, var(--status-alert) 18%, transparent)'
            : 'none',
      }}
    />
  );
}
