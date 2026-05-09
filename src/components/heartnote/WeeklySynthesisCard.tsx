// 2×2 weekly recap card per docs/design/heartnote-home-mockup.html § week-card.
// Section label "This week" + date range, four tone-aware tiles, narrative
// paragraph, italic logs-note. The card is read-only — drilling deeper
// happens through the trends teaser below.

import { Pill, Droplet, Moon, Dumbbell } from 'lucide-react';
import type {
  WeeklySynthesis,
  WeeklyTile,
  WeeklyTileIcon,
} from '@/lib/trends/weekly-synthesis';

const ICON_MAP: Record<WeeklyTileIcon, typeof Pill> = {
  weight: Dumbbell,
  swelling: Droplet,
  sleep: Moon,
  med: Pill,
};

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const DOW_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDateRange(startIso: string, endIso: string): string {
  const s = new Date(`${startIso}T12:00:00Z`);
  const e = new Date(`${endIso}T12:00:00Z`);
  const sLabel = `${DOW_ABBR[s.getUTCDay()]} ${MONTH_ABBR[s.getUTCMonth()]} ${s.getUTCDate()}`;
  const eLabel = `${DOW_ABBR[e.getUTCDay()]} ${MONTH_ABBR[e.getUTCMonth()]} ${e.getUTCDate()}`;
  return `${sLabel} – ${eLabel}`;
}

interface Props {
  synthesis: WeeklySynthesis;
  startIso: string; // 7 days ago, ISO date
  endIso: string;   // today, ISO date
}

export function WeeklySynthesisCard({ synthesis, startIso, endIso }: Props) {
  return (
    <section className="mx-4 mt-6">
      <div className="flex items-baseline justify-between px-1.5 pb-2.5">
        <h2
          className="font-display"
          style={{
            fontSize: 18,
            fontWeight: 500,
            letterSpacing: '-0.2px',
            color: 'var(--foreground)',
          }}
        >
          This week
        </h2>
        <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
          {formatDateRange(startIso, endIso)}
        </span>
      </div>
      <div
        className="rounded-[22px] p-4"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--muted)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div
          className="grid grid-cols-2 mb-3.5"
          style={{ gap: 10 }}
        >
          {synthesis.tiles.map((tile, i) => (
            <Tile key={`${tile.icon}-${i}`} tile={tile} />
          ))}
        </div>
        <p
          className="px-1 text-foreground"
          style={{ fontSize: 14, lineHeight: 1.55 }}
        >
          {synthesis.narrative}
        </p>
        <p
          className="mt-3.5 px-1 italic text-muted-foreground"
          style={{ fontSize: 12, lineHeight: 1.45 }}
        >
          From your logs this week. You see things logs can&rsquo;t.
        </p>
      </div>
    </section>
  );
}

function Tile({ tile }: { tile: WeeklyTile }) {
  const Icon = ICON_MAP[tile.icon];
  const isWarn = tile.tone === 'warn';
  const labelColor = isWarn
    ? 'var(--status-watch-foreground)'
    : 'var(--muted-foreground)';
  return (
    <div
      className="rounded-2xl"
      style={{
        background: isWarn ? 'var(--status-watch-soft)' : 'var(--muted)',
        padding: '13px 14px 12px',
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={14} style={{ opacity: 0.85, color: labelColor }} />
        <span
          className="font-semibold uppercase"
          style={{
            fontSize: 11,
            letterSpacing: '0.06em',
            color: labelColor,
          }}
        >
          {tile.label}
        </span>
      </div>
      <p
        className="font-display"
        style={{
          fontSize: 18,
          fontWeight: 500,
          color: 'var(--foreground)',
          lineHeight: 1.15,
        }}
      >
        {tile.value}
      </p>
      {tile.sub && (
        <p
          className="mt-1"
          style={{ fontSize: 12, color: 'var(--muted-foreground)' }}
        >
          {tile.sub}
        </p>
      )}
    </div>
  );
}
