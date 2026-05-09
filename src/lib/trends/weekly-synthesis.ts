// Weekly synthesis — the 4-tile recap on the home screen. Per
// docs/design/heartnote-home-mockup.html § week-card.
//
// Pure function: callers fetch the rows server-side and pass them in;
// this file does no I/O. Keeps the clinical tile rules unit-testable
// without a database round-trip.
//
// The four tiles in order: Weight / Swelling / Sleep / Lead diuretic.
// Each tile is "warn" (something to notice) or "calm" (nothing flagged).
// Tone follows the mockup's caregiver register, not the alert engine —
// a 1.4 lb gain doesn't fire any tier 1/2/3 trigger but still belongs
// in the warn band as "worth noticing this week."

const WEEKDAY_FROM_INDEX = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type WeeklyTileTone = 'warn' | 'calm';
export type WeeklyTileIcon = 'weight' | 'swelling' | 'sleep' | 'med';

export interface WeeklyTile {
  icon: WeeklyTileIcon;
  tone: WeeklyTileTone;
  label: string;
  value: string;
  sub: string | null;
}

export interface WeeklySynthesis {
  tiles: WeeklyTile[]; // 3 or 4 — diuretic tile omitted when no loop diuretic on file
  narrative: string;
}

export interface WeeklySymptomEvent {
  log_date: string;
  symptom: string;
  present: boolean;
  nocturnal: boolean | null;
}

export interface WeeklyPillowRow {
  log_date: string;
  pillow_count: number;
}

export interface WeeklyDiuretic {
  drugName: string;
  dosesPerDay: number | null; // null = PRN; tile omitted
  // Per-day count of doses with TAKEN status (taken / early / late /
  // double_dosed) over the 7-day window. Days the patient didn't log get
  // taken=0; the tile decides whether that means "missed" by checking
  // activeDays.
  takenByDay: { log_date: string; taken: number }[];
  // Dates in the 7-day window where the med was supposed to be taken
  // (>= start_date, <= end_date or today). When the med started 3 days
  // ago, only those 3 days count toward the denominator.
  activeDays: string[]; // ISO dates
}

export interface SynthesisInput {
  patientName: string | null; // verbatim display_name; null = "their" fallback
  today: string; // YYYY-MM-DD in patient tz
  weeklyDates: string[]; // 7 ISO dates ending at `today`, oldest first
  // One weight per day (latest recorded_at collapsed). Sorted asc by log_date.
  weights: { log_date: string; value: number }[];
  symptomEvents: WeeklySymptomEvent[];
  pillowsByDay: WeeklyPillowRow[];
  normalPillowCount: number | null;
  diuretic: WeeklyDiuretic | null;
}

// Below this absolute delta, a week's weight movement reads as steady to
// caregivers — the scale's daily noise + clothing/timing variance can swing
// a pound either way. 0.5 lb keeps the warn-tone reserved for moves that
// look like a real trend.
const WEIGHT_STEADY_THRESHOLD_LB = 0.5;

function weightTile(weights: { log_date: string; value: number }[]): WeeklyTile {
  if (weights.length < 2) {
    return {
      icon: 'weight',
      tone: 'calm',
      label: 'Weight',
      value: 'Not enough data',
      sub: weights.length === 1 ? '1 reading' : 'no readings',
    };
  }
  const earliest = weights[0].value;
  const latest = weights[weights.length - 1].value;
  const delta = latest - earliest;
  if (Math.abs(delta) < WEIGHT_STEADY_THRESHOLD_LB) {
    return {
      icon: 'weight',
      tone: 'calm',
      label: 'Weight',
      value: 'Steady',
      sub: '7-day trend',
    };
  }
  const arrow = delta > 0 ? '↑' : '↓'; // ↑ ↓
  return {
    icon: 'weight',
    tone: delta > 0 ? 'warn' : 'calm',
    label: 'Weight',
    value: `${arrow} ${Math.abs(delta).toFixed(1)} lb`,
    sub: '7-day trend',
  };
}

function swellingTile(events: WeeklySymptomEvent[]): WeeklyTile {
  const swellingEvents = events.filter((e) => e.symptom === 'swelling');
  if (swellingEvents.length === 0) {
    return {
      icon: 'swelling',
      tone: 'calm',
      label: 'Swelling',
      value: 'Not reported',
      sub: 'this week',
    };
  }
  const presentDays = new Set(
    swellingEvents.filter((e) => e.present).map((e) => e.log_date),
  );
  const reportedDays = new Set(events.map((e) => e.log_date));
  if (presentDays.size === 0) {
    return {
      icon: 'swelling',
      tone: 'calm',
      label: 'Swelling',
      value: 'No swelling',
      sub: `${reportedDays.size} day${reportedDays.size === 1 ? '' : 's'} reported`,
    };
  }
  return {
    icon: 'swelling',
    tone: 'warn',
    label: 'Swelling',
    value: `${presentDays.size} of ${reportedDays.size} day${reportedDays.size === 1 ? '' : 's'}`,
    sub: 'reported this week',
  };
}

function sleepTile(
  events: WeeklySymptomEvent[],
  pillows: WeeklyPillowRow[],
  normalPillowCount: number | null,
): WeeklyTile {
  // Sleep "changes" = nocturnal cough events OR nights when pillow_count
  // exceeded the patient's baseline. Both are research §2 Tier 2 / Tier 3
  // signals; here we count them as the week's sleep-disruption tally.
  const nocturnalCoughDays = new Set(
    events
      .filter((e) => e.symptom === 'cough' && e.present && e.nocturnal === true)
      .map((e) => e.log_date),
  );
  const elevatedPillowDays =
    normalPillowCount !== null
      ? new Set(
          pillows
            .filter((p) => p.pillow_count > normalPillowCount)
            .map((p) => p.log_date),
        )
      : new Set<string>();
  const disruptedDays = new Set<string>([
    ...nocturnalCoughDays,
    ...elevatedPillowDays,
  ]);
  if (disruptedDays.size === 0) {
    return {
      icon: 'sleep',
      tone: 'calm',
      label: 'Sleep',
      value: 'No changes noted',
      sub: "from this week's logs",
    };
  }
  return {
    icon: 'sleep',
    tone: 'warn',
    label: 'Sleep',
    value: `${disruptedDays.size} disrupted night${disruptedDays.size === 1 ? '' : 's'}`,
    sub: 'cough or extra pillows',
  };
}

function diureticTile(d: WeeklyDiuretic | null): WeeklyTile | null {
  if (d === null) return null;
  if (d.dosesPerDay === null || d.activeDays.length === 0) return null;
  const activeSet = new Set(d.activeDays);
  const takenLookup = new Map(d.takenByDay.map((r) => [r.log_date, r.taken]));
  const missedDates: string[] = [];
  for (const date of d.activeDays) {
    const taken = takenLookup.get(date) ?? 0;
    if (taken === 0) missedDates.push(date);
  }
  const takenDays = activeSet.size - missedDates.length;
  const active = activeSet.size;

  if (missedDates.length === 0) {
    return {
      icon: 'med',
      tone: 'calm',
      label: d.drugName,
      value: 'Taken every day',
      sub: `${active} of ${active} day${active === 1 ? '' : 's'}`,
    };
  }
  if (missedDates.length === 1) {
    const day = WEEKDAY_FROM_INDEX[utcDow(missedDates[0])];
    return {
      icon: 'med',
      tone: 'warn',
      label: d.drugName,
      value: `Skipped ${day}`,
      sub: `${takenDays} of ${active} days taken`,
    };
  }
  return {
    icon: 'med',
    tone: 'warn',
    label: d.drugName,
    value: `${missedDates.length} days missed`,
    sub: `${takenDays} of ${active} days taken`,
  };
}

function utcDow(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

function possessive(name: string | null): string {
  if (name === null) return 'Their';
  if (name.endsWith('s') || name.endsWith('S')) return `${name}'`;
  return `${name}'s`;
}

function buildNarrative(
  patientName: string | null,
  weight: WeeklyTile,
  swelling: WeeklyTile,
  sleep: WeeklyTile,
  med: WeeklyTile | null,
  diureticDrugName: string | null,
): string {
  const sentences: string[] = [];

  // Weight
  if (weight.value === 'Not enough data') {
    // Skip — silence is silence per CLAUDE.md grelief test
  } else if (weight.value === 'Steady') {
    sentences.push(`${possessive(patientName)} weight has been steady this week.`);
  } else {
    const direction = weight.value.startsWith('↑') ? 'up' : 'down';
    const magnitude = weight.value.replace(/[↑↓] /, '');
    sentences.push(
      `${possessive(patientName)} weight has trended ${direction} ${magnitude} over the past week.`,
    );
  }

  // Swelling
  if (swelling.value === 'Not reported') {
    // Silence
  } else if (swelling.value === 'No swelling') {
    sentences.push('No swelling was logged this week.');
  } else {
    sentences.push(`Swelling came up on ${swelling.value} this week.`);
  }

  // Sleep
  if (sleep.value === 'No changes noted') {
    sentences.push('No sleep changes were noted.');
  } else {
    sentences.push(
      `Sleep was disrupted on ${sleep.value.replace(' disrupted', '').replace(' nights', ' nights').replace(' night', ' night')} this week.`,
    );
  }

  // Med
  if (med !== null && diureticDrugName !== null) {
    if (med.value === 'Taken every day') {
      sentences.push(`${diureticDrugName} was logged every day.`);
    } else if (med.value.startsWith('Skipped ')) {
      const day = med.value.slice('Skipped '.length);
      const dayLong = longWeekday(day);
      sentences.push(`${diureticDrugName} was logged every day except ${dayLong}.`);
    } else {
      sentences.push(`${diureticDrugName} was missed on ${med.value.replace(' missed', '')} days this week.`);
    }
  }

  return sentences.join(' ');
}

function longWeekday(short: string): string {
  switch (short) {
    case 'Sun': return 'Sunday';
    case 'Mon': return 'Monday';
    case 'Tue': return 'Tuesday';
    case 'Wed': return 'Wednesday';
    case 'Thu': return 'Thursday';
    case 'Fri': return 'Friday';
    case 'Sat': return 'Saturday';
    default: return short;
  }
}

export function buildWeeklySynthesis(input: SynthesisInput): WeeklySynthesis {
  const weight = weightTile(input.weights);
  const swelling = swellingTile(input.symptomEvents);
  const sleep = sleepTile(input.symptomEvents, input.pillowsByDay, input.normalPillowCount);
  const med = diureticTile(input.diuretic);

  const tiles: WeeklyTile[] = [weight, swelling, sleep];
  if (med !== null) tiles.push(med);

  return {
    tiles,
    narrative: buildNarrative(
      input.patientName,
      weight,
      swelling,
      sleep,
      med,
      input.diuretic?.drugName ?? null,
    ),
  };
}
