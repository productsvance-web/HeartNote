type Status = 'good' | 'watch' | 'alert' | 'unknown';

const map: Record<Status, { ring: string; soft: string; label: string; sub: string }> = {
  good: {
    ring: 'var(--status-good)',
    soft: 'var(--status-good-soft)',
    label: 'Doing well',
    sub: 'All signs steady today',
  },
  watch: {
    ring: 'var(--status-watch)',
    soft: 'var(--status-watch-soft)',
    label: 'Watch for changes',
    sub: 'A few small things to keep an eye on',
  },
  alert: {
    ring: 'var(--status-alert)',
    soft: 'var(--status-alert-soft)',
    label: 'Call the cardiologist today',
    sub: 'Pattern worth a phone call',
  },
  unknown: {
    ring: 'var(--bluegray)',
    soft: 'var(--secondary)',
    label: 'No log yet',
    sub: 'Tap below for a 30-second check-in',
  },
};

export function StatusRing({ status, size = 200 }: { status: Status; size?: number }) {
  const cfg = map[status];
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <div
          className="absolute inset-0 rounded-full animate-pulse-ring"
          style={{ background: cfg.soft }}
        />
        <div
          className="absolute inset-3 rounded-full animate-breathe flex items-center justify-center"
          style={{
            background: `radial-gradient(circle at 30% 30%, color-mix(in oklab, ${cfg.ring} 45%, white), ${cfg.ring})`,
            boxShadow: `0 12px 40px -8px color-mix(in oklab, ${cfg.ring} 50%, transparent)`,
          }}
        >
          <div className="text-center text-white px-4">
            <div className="text-xs uppercase tracking-widest opacity-80">Today</div>
            <div className="font-display text-2xl leading-tight mt-1">{cfg.label}</div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{cfg.sub}</p>
    </div>
  );
}
