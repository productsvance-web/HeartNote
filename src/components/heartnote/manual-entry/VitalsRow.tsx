// Single chassis for each vitals card on /log/manual:
// sage dot + UPPERCASE label · right-aligned secondary · control · helper.

interface Props {
  label: string;
  secondary?: string;
  helper?: string;
  children: React.ReactNode;
}

export function VitalsRow({ label, secondary, helper, children }: Props) {
  return (
    <section
      className="rounded-3xl px-5 py-5"
      style={{
        background: 'var(--card)',
        border: '0.5px solid var(--border)',
        boxShadow: '0 1px 8px color-mix(in oklab, var(--sage) 6%, transparent)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--sage-deep)',
            }}
          />
          <span
            className="text-[11px] font-semibold uppercase text-foreground"
            style={{ letterSpacing: '0.08em' }}
          >
            {label}
          </span>
        </div>
        {secondary && (
          <span className="text-[11.5px] text-muted-foreground tabular-nums">
            {secondary}
          </span>
        )}
      </div>
      <div>{children}</div>
      {helper && (
        <p className="mt-3 text-[12.5px] text-muted-foreground leading-snug">
          {helper}
        </p>
      )}
    </section>
  );
}
