// CoughHeatmap — 4 rows × 14 columns. Each cell answers: did mom cough
// during this window of this day, and how much?
//
// Per docs/specs/cough-heatmap.md:
// - 0 events render almost-invisible (cream-tinted), so empty looks empty
// - 1 event jumps out in amber
// - 2 events coral, 3+ events darker coral
// - Nocturnal row label is permanently coral — that's the row that matters
// - Today column gets a thin outline (no full-height vertical line)
//
// Data semantics: this component takes pre-aggregated `(date, bucket) →
// count` cells. The aggregation lives in src/lib/trends/cough-buckets.ts so
// the page server-side can run a single query and pass the result down.
//
// Citations: research/chf-source-of-truth.md §5 — nocturnal cough sits late
// in the decompensation cascade; per docs/specs/cough-heatmap.md.

const BUCKETS = ['morning', 'afternoon', 'evening', 'nocturnal'] as const;
export type CoughBucket = (typeof BUCKETS)[number];

export type CoughCell = {
  date: string; // ISO YYYY-MM-DD, oldest left → newest right
  logged: boolean; // false when the patient had no daily_logs row on this date
  morning: number;
  afternoon: number;
  evening: number;
  nocturnal: number;
};

interface Props {
  cells: CoughCell[]; // length 14, oldest first
  today: string; // ISO YYYY-MM-DD — the rightmost column
}

export function CoughHeatmap({ cells, today }: Props) {
  if (cells.length === 0) return null;

  const totals = totalsFor(cells);
  const headline = headlineFor(totals);

  return (
    <section
      className="mx-4 mt-5 rounded-3xl bg-card border border-border shadow-card p-4 sm:p-5 overflow-hidden"
      aria-label="Cough heatmap, last 14 days"
    >
      {/* Eyebrow row */}
      <div className="flex items-baseline justify-between mb-2">
        <p
          className="text-[10.5px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--muted-foreground)' }}
        >
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
            style={{ background: 'var(--status-good)' }}
          />
          Cough · 14d heatmap
        </p>
        <p
          className="hidden sm:block text-[10.5px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--muted-foreground)' }}
        >
          Day × time-of-day · darker = more
        </p>
      </div>

      {/* Headline */}
      <div className="mt-1 mb-4">
        <p
          className="font-display text-[22px] text-foreground leading-tight"
          style={{ letterSpacing: '-0.02em' }}
        >
          {headline.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
          {headline.support}
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-[60px_1fr] gap-x-2.5">
        {/* Row labels */}
        <div className="flex flex-col justify-center gap-1">
          {BUCKETS.map((b) => (
            <p
              key={b}
              className="text-[10px] uppercase tracking-wider h-[22px] flex items-center"
              style={{
                color:
                  b === 'nocturnal' ? 'var(--status-alert-foreground)' : 'var(--muted-foreground)',
                fontWeight: b === 'nocturnal' ? 600 : 500,
                letterSpacing: '0.08em',
              }}
            >
              {b}
            </p>
          ))}
        </div>

        {/* Cells: 4 rows × 14 cols */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
            gridTemplateRows: 'repeat(4, 22px)',
            columnGap: 4,
            rowGap: 4,
          }}
        >
          {BUCKETS.flatMap((bucket) =>
            cells.map((cell) => {
              const count = cell[bucket];
              const isToday = cell.date === today;
              const unlogged = !cell.logged;
              return (
                <span
                  key={`${bucket}-${cell.date}`}
                  className="rounded-[3px]"
                  style={{
                    background: unlogged ? 'transparent' : cellBackground(count),
                    border: unlogged
                      ? '1px dashed color-mix(in oklab, var(--muted-foreground) 30%, transparent)'
                      : 'none',
                    outline: isToday
                      ? '1.5px solid color-mix(in oklab, var(--foreground) 32%, transparent)'
                      : 'none',
                    outlineOffset: isToday ? -1 : 0,
                  }}
                  aria-label={
                    unlogged
                      ? `no log on ${cell.date}`
                      : `${bucket} on ${cell.date}: ${
                          count > 0
                            ? `${count}${count >= 3 ? '+' : ''} cough event${count === 1 ? '' : 's'}`
                            : 'no cough'
                        }`
                  }
                />
              );
            }),
          )}
        </div>
      </div>

      {/* X-axis labels */}
      <div className="grid grid-cols-[60px_1fr] gap-x-2.5 mt-2">
        <span />
        <div className="flex justify-between text-[10px] tabular-nums uppercase tracking-wider"
          style={{ color: 'var(--muted-foreground)', letterSpacing: '0.08em' }}>
          <span>{prettyDate(cells[0].date)}</span>
          {cells.length >= 8 && <span>{prettyDate(cells[Math.floor(cells.length / 2)].date)}</span>}
          <span>
            {prettyDate(cells[cells.length - 1].date)} · today
          </span>
        </div>
      </div>
    </section>
  );
}

function cellBackground(count: number): string {
  if (count <= 0) return 'color-mix(in oklab, var(--status-good) 6%, var(--cream))';
  if (count === 1) return 'color-mix(in oklab, var(--status-watch) 60%, transparent)';
  if (count === 2) return 'color-mix(in oklab, var(--status-alert) 55%, transparent)';
  return 'color-mix(in oklab, var(--status-alert) 85%, transparent)';
}

// Tallies are over LOGGED cells only. An unlogged day isn't "quiet" — we
// don't know what happened that day. Counting it as quiet was the
// phantom-quiet bug.
function totalsFor(cells: CoughCell[]) {
  let daytime = 0;
  let nocturnal = 0;
  let quietDays = 0;
  let loggedDays = 0;
  for (const c of cells) {
    if (!c.logged) continue;
    loggedDays += 1;
    const dayCount = c.morning + c.afternoon + c.evening;
    daytime += dayCount;
    nocturnal += c.nocturnal;
    if (dayCount === 0 && c.nocturnal === 0) quietDays += 1;
  }
  return { daytime, nocturnal, quietDays, loggedDays };
}

function headlineFor(t: { daytime: number; nocturnal: number; quietDays: number }) {
  // Per the spec: never alarmist on daytime-only. Headline upgrades only when
  // nocturnal cough is present.
  if (t.nocturnal > 0) {
    return {
      title: t.nocturnal === 1 ? 'Nocturnal cough this week.' : 'Nocturnal cough — pattern.',
      support: `${t.nocturnal} nocturnal · ${t.daytime} daytime · ${t.quietDays} quiet`,
    };
  }
  return {
    title: 'No cough.',
    support: `${t.quietDays} quiet · ${t.daytime} daytime · 0 nocturnal`,
  };
}

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function prettyDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
