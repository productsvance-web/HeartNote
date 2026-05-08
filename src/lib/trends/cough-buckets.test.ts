// Unit tests for the cough-heatmap aggregation.
//
// Drives the pure `coughCellsFromRows(inputs)` function with synthetic
// rows. Pin today=2026-05-08 and tz=America/New_York so bucket boundaries
// are deterministic regardless of the host machine's clock.
//
// Run:
//   npm run test:trends

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  coughCellsFromRows,
  type CoughEventRow,
  type LoggedDayRow,
} from './cough-buckets.ts';

const TODAY = '2026-05-08';
const TZ = 'America/New_York';

function dateMinus(days: number): string {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Build an ISO timestamp at a given local hour in TZ (US Eastern).
// May 2026 is in EDT = UTC-4, so localHour + 4 = UTC hour.
function eastTime(date: string, localHour: number): string {
  const utcHour = (localHour + 4) % 24;
  const hh = String(utcHour).padStart(2, '0');
  return `${date}T${hh}:00:00Z`;
}

function emptyInputs() {
  return {
    events: [] as CoughEventRow[],
    loggedDays: [] as LoggedDayRow[],
    today: TODAY,
    tz: TZ,
  };
}

// ─── Shape ──────────────────────────────────────────────────────────────────

describe('coughCellsFromRows shape', () => {
  it('returns exactly 14 cells, oldest first', () => {
    const cells = coughCellsFromRows(emptyInputs());
    assert.equal(cells.length, 14);
    assert.equal(cells[0].date, dateMinus(13));
    assert.equal(cells[13].date, TODAY);
  });

  it('marks each cell logged=true only when daily_logs has a row for that date', () => {
    const inputs = {
      ...emptyInputs(),
      loggedDays: [{ log_date: dateMinus(2) }, { log_date: dateMinus(0) }],
    };
    const cells = coughCellsFromRows(inputs);
    assert.equal(cells.find((c) => c.date === dateMinus(2))?.logged, true);
    assert.equal(cells.find((c) => c.date === dateMinus(0))?.logged, true);
    assert.equal(cells.find((c) => c.date === dateMinus(1))?.logged, false);
  });

  it('cells start with all four bucket counts at 0', () => {
    const cells = coughCellsFromRows(emptyInputs());
    for (const c of cells) {
      assert.equal(c.morning, 0);
      assert.equal(c.afternoon, 0);
      assert.equal(c.evening, 0);
      assert.equal(c.nocturnal, 0);
    }
  });
});

// ─── Time-of-day bucketing ─────────────────────────────────────────────────

describe('time-of-day buckets (local time in tz)', () => {
  it('local hour < 12 → morning', () => {
    const day = dateMinus(1);
    const cells = coughCellsFromRows({
      ...emptyInputs(),
      events: [
        { log_date: day, recorded_at: eastTime(day, 6), nocturnal: false },
        { log_date: day, recorded_at: eastTime(day, 11), nocturnal: false },
      ],
    });
    const cell = cells.find((c) => c.date === day)!;
    assert.equal(cell.morning, 2);
    assert.equal(cell.afternoon, 0);
    assert.equal(cell.evening, 0);
  });

  it('local hour 12–16 → afternoon (boundary at 12 inclusive, 17 exclusive)', () => {
    const day = dateMinus(1);
    const cells = coughCellsFromRows({
      ...emptyInputs(),
      events: [
        { log_date: day, recorded_at: eastTime(day, 12), nocturnal: false },
        { log_date: day, recorded_at: eastTime(day, 16), nocturnal: false },
      ],
    });
    const cell = cells.find((c) => c.date === day)!;
    assert.equal(cell.afternoon, 2);
    assert.equal(cell.morning, 0);
  });

  it('local hour ≥ 17 → evening', () => {
    const day = dateMinus(1);
    const cells = coughCellsFromRows({
      ...emptyInputs(),
      events: [
        { log_date: day, recorded_at: eastTime(day, 17), nocturnal: false },
        { log_date: day, recorded_at: eastTime(day, 23), nocturnal: false },
      ],
    });
    const cell = cells.find((c) => c.date === day)!;
    assert.equal(cell.evening, 2);
    assert.equal(cell.afternoon, 0);
  });

  it('nocturnal=true takes precedence over time-of-day', () => {
    // Even if recorded_at lands at 9am local, an explicit nocturnal flag
    // means the caregiver said "this happened during the night."
    const day = dateMinus(1);
    const cells = coughCellsFromRows({
      ...emptyInputs(),
      events: [{ log_date: day, recorded_at: eastTime(day, 9), nocturnal: true }],
    });
    const cell = cells.find((c) => c.date === day)!;
    assert.equal(cell.nocturnal, 1);
    assert.equal(cell.morning, 0);
  });

  it('null recorded_at falls back to afternoon', () => {
    const day = dateMinus(1);
    const cells = coughCellsFromRows({
      ...emptyInputs(),
      events: [{ log_date: day, recorded_at: null, nocturnal: false }],
    });
    const cell = cells.find((c) => c.date === day)!;
    assert.equal(cell.afternoon, 1);
  });
});

// ─── Clamping ───────────────────────────────────────────────────────────────

describe('count clamping', () => {
  it('caps any single bucket at 3 ("3+" in the chart)', () => {
    const day = dateMinus(1);
    const events: CoughEventRow[] = Array.from({ length: 7 }, () => ({
      log_date: day,
      recorded_at: eastTime(day, 8),
      nocturnal: false,
    }));
    const cells = coughCellsFromRows({ ...emptyInputs(), events });
    const cell = cells.find((c) => c.date === day)!;
    assert.equal(cell.morning, 3);
  });

  it('caps the nocturnal bucket independently at 3', () => {
    const day = dateMinus(1);
    const events: CoughEventRow[] = Array.from({ length: 6 }, () => ({
      log_date: day,
      recorded_at: null,
      nocturnal: true,
    }));
    const cells = coughCellsFromRows({ ...emptyInputs(), events });
    const cell = cells.find((c) => c.date === day)!;
    assert.equal(cell.nocturnal, 3);
  });
});

// ─── Out-of-window events ──────────────────────────────────────────────────

describe('out-of-window events', () => {
  it('drops events whose log_date does not match any cell', () => {
    const cells = coughCellsFromRows({
      ...emptyInputs(),
      events: [
        { log_date: dateMinus(30), recorded_at: eastTime(dateMinus(30), 8), nocturnal: false },
      ],
    });
    for (const c of cells) {
      assert.equal(c.morning + c.afternoon + c.evening + c.nocturnal, 0);
    }
  });
});

// ─── Empty patient ──────────────────────────────────────────────────────────

describe('empty patient', () => {
  it('returns 14 unlogged, all-zero cells', () => {
    const cells = coughCellsFromRows(emptyInputs());
    for (const c of cells) {
      assert.equal(c.logged, false);
      assert.equal(c.morning + c.afternoon + c.evening + c.nocturnal, 0);
    }
  });
});
