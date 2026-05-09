// Brand band — wordmark + heart glyph + subject line at the top of the
// home screen. Per docs/design/heartnote-home-mockup.html § header.

interface Props {
  patientName: string | null;
  dateText: string;
}

export function BrandHeader({ patientName, dateText }: Props) {
  return (
    <header className="px-6 pt-5 pb-1">
      <div
        className="font-display"
        style={{
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: '-0.5px',
          color: 'var(--sage-deep)',
          lineHeight: 1.1,
        }}
      >
        HeartNote
        <svg
          aria-hidden
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="var(--sage)"
          style={{
            marginLeft: 5,
            verticalAlign: '-1px',
            display: 'inline-block',
            filter:
              'drop-shadow(0 1px 2px color-mix(in oklab, var(--sage) 28%, transparent))',
          }}
        >
          <path d="M12 21s-7-4.5-9-9.5C1.5 7 4 4 7.5 4c1.7 0 3.3.7 4.5 2 1.2-1.3 2.8-2 4.5-2C20 4 22.5 7 21 11.5c-2 5-9 9.5-9 9.5z" />
        </svg>
      </div>
      <p
        style={{
          fontSize: 13,
          color: 'var(--muted-foreground)',
          marginTop: 2,
          letterSpacing: '0.1px',
        }}
      >
        {patientName ? `${patientName} · ${dateText}` : dateText}
      </p>
    </header>
  );
}
