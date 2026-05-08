# Today's meds — "Due in {N}m" client-side ticker (fully fleshed)

> The prior session shipped a static "Next at 8 a.m." subline + count pill on each scheduled meds row. This plan adds the "Due in {N}m" duration pill the design specifies, using a single-tick deterministic approach per memory `feedback_no_bad_polling.md` — never naïve repeated polling, never running on backgrounded tabs.

## Plain-English: what the caregiver sees

Right now each scheduled meds row reads:
- Pill icon (left) · Drug name + "Next at 8 a.m." (middle) · "0/2" pill (right)

After this:
- Pill icon (default) **OR Clock icon (when next dose is within 60 min)** OR sage check (when day complete) (left)
- Drug name + "Next at 8 a.m." (middle, unchanged)
- "0/2" muted pill OR **butter-soft "Due in 22m" pill (when within 60 min)** OR sage "Done" pill (right)

The duration pill counts down as the caregiver sits on the screen — recomputed every 60 seconds. When the tab is backgrounded the ticker pauses. When the dose time passes without being logged, the pill flips to muted "Past due 8 a.m." until the caregiver confirms or skips.

## Reference

- `/tmp/heartnote-design-system/ui_kits/app/screens.jsx#MedRow` — the design's `med--due` row treatment with `<Clock>` icon and butter "Due in 20m" pill.
- Memory `feedback_no_bad_polling.md` — required reading on the deterministic single-tick pattern.

## The deterministic single-tick pattern (required reading)

The whole `<TodaysMedsList>` component already runs on the client (it's `'use client'` for the optimistic dose-confirm flow). Add ONE state value at the top of the component:

```tsx
const [nowMs, setNowMs] = useState<number>(() => Date.now());

useEffect(() => {
  function tick() {
    setNowMs(Date.now());
  }
  function startTicker() {
    if (document.visibilityState !== 'visible') return;
    intervalRef.current = window.setInterval(tick, 60_000);
  }
  function stopTicker() {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }
  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      tick(); // catch up immediately on resume
      startTicker();
    } else {
      stopTicker();
    }
  }

  const intervalRef = { current: null as number | null };
  startTicker();
  document.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    stopTicker();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}, []);
```

Pass `nowMs` down to `<MedRow>` and derive the "Due in {N}m" label from it. **One timer for the whole list.** Every row updates from one tick. No per-row interval. No fetch. No revalidate. No router.refresh.

Why minute granularity (60_000): the duration label only changes once a minute. Ticking faster wastes work. Ticking slower (5 min) lets caregivers see stale "Due in 5m" labels for too long.

Why a `useRef`-stored interval id and not state: the id is only read by cleanup; storing in state would re-render needlessly. (Per memory `feedback_react_closure_in_timers.md` — refs over state for timer ids.)

## Computing "Due in N min" in caregiver TZ

The next-slot time stored in `medication_dose_times.time_of_day` is a `"HH:MM"` string with no date or TZ. To compute minutes-until, we need the caregiver-TZ "today's wall-clock for HH:MM" as a UTC instant, then subtract from `nowMs`.

Add helper to `src/lib/dates/format.ts`:

```ts
export function minutesUntilWallClock(
  hhmm: string,
  todayIso: string,
  tz: string,
  nowMs: number,
): number {
  // Construct the date "today HH:MM" in `tz`. Use Intl + a UTC anchor.
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Infinity;

  const targetMs = wallClockToUtcMs(todayIso, h, m, tz);
  return Math.round((targetMs - nowMs) / 60_000);
}

function wallClockToUtcMs(isoDate: string, hour: number, minute: number, tz: string): number {
  // Standard "construct in target TZ" trick: format the candidate UTC
  // instant in `tz`, read back the hour/minute, adjust until they match.
  // For a single same-day target this converges in at most 2 iterations.
  const candidate = new Date(`${isoDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
  let candidateMs = candidate.getTime();

  for (let i = 0; i < 3; i++) {
    const fmt = new Intl.DateTimeFormat('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz,
    });
    const parts = fmt.formatToParts(new Date(candidateMs));
    const observedH = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const observedM = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    const driftMin = (hour - observedH) * 60 + (minute - observedM);
    if (driftMin === 0) break;
    candidateMs += driftMin * 60_000;
  }
  return candidateMs;
}
```

Tested implicitly via Case 9 of the baseline edge-cases plan (TZ-shift midnight): a `today = "2026-03-09"` (DST start) plus an `8:00` schedule should resolve to a real 8 AM in the caregiver's wall clock, not 7 AM or 9 AM.

## Pill state machine per row

For each scheduled row (`MedAdherenceRow` with `dosesPerDay !== null`):

```ts
const minutesUntil = nextSlotTime
  ? minutesUntilWallClock(nextSlotTime, today, tz, nowMs)
  : null;

const pillState =
  slotsFull            ? 'done'      :
  minutesUntil === null ? 'idle'      :  // no schedule times
  minutesUntil < 0     ? 'past-due'  :
  minutesUntil <= 60   ? 'due-soon'  :
                          'idle';
```

Visual treatment per state:

| State | Icon (left) | Right pill background | Right pill text |
|---|---|---|---|
| `done` | sage `Check` | `var(--status-good-soft)` | "Done" |
| `due-soon` | sage `Clock` | `var(--status-watch-soft)` | "Due in {N}m" |
| `past-due` | sage `Clock` | `var(--muted)` | "Past due {time}" |
| `idle` | sage `Pill` | `var(--muted)` | "{taken}/{expected}" |

Where `{N}` is `minutesUntil` (1–60) and `{time}` is `formatScheduleTime(nextSlotTime)`.

The icon-left and right-pill must agree — the row reads as one unit.

## Files to MODIFY

- `src/components/heartnote/TodaysMedsList.tsx`
  - Add `useNowTick`-like effect at the top of `TodaysMedsList`.
  - Pass `nowMs`, `today` (caregiver TZ ISO date), and `tz` from props (currently only `tz` is passed).
  - Update `MedRow`'s render to use the `pillState` machine above.
  - Add the `Clock` icon import from `lucide-react`.
- `src/components/heartnote/TodaysMedsCard.tsx`
  - Pass `today` (caregiver-TZ ISO YYYY-MM-DD) into `<TodaysMedsList today={...} />`. Currently the prop is `date` from the parent — rename or pass through.
- `src/app/dashboard/page.tsx`
  - The `<TodaysMedsCard date={today} ... />` call already passes `today`. No change.
- `src/lib/dates/format.ts`
  - Add `minutesUntilWallClock` and the internal `wallClockToUtcMs` helper.

## Acceptance criteria

### Engineering
- [ ] One ticker for the whole list. No per-row `setInterval`.
- [ ] Ticker pauses when `document.visibilityState !== 'visible'`. Ticker resumes (and immediately recomputes) on visibility resume.
- [ ] Cleanup tears down both the interval and the visibility listener.
- [ ] No new dependencies.

### Functional
- [ ] Med scheduled at 8:00 AM, current time 7:38 AM caregiver-local: row renders `<Clock>` icon (left), "Next at 8 a.m." subline, butter-soft "Due in 22m" pill (right).
- [ ] At 7:39 AM (one minute later, tab visible): pill reads "Due in 21m" within ~60s.
- [ ] At 8:01 AM (one minute past): pill reads "Past due 8 a.m." muted gray.
- [ ] At 8:00:30 AM: pill reads "Due in 0m" briefly (or "Past due 8 a.m." if rounding favors past). Either is acceptable; document which the implementation chose.
- [ ] Caregiver confirms the dose: `slotsFull` becomes true (next render after optimistic update); pill flips to "Done" with sage check icon left.
- [ ] Tab backgrounded for 5 minutes, then refocused: pill recomputes immediately on focus and reflects the correct minutes-until.

### Edge cases
- [ ] PRN row: never enters `due-soon`/`past-due`. Stays in the existing `+ icon` treatment.
- [ ] Med with `scheduleTimes === null` (data weirdness): falls back to `idle` state. Doesn't crash.
- [ ] Med with `scheduleTimes.length < dosesPerDay` (invariant violation): same fallback to `idle`.
- [ ] Two separate scheduled doses today, neither within 60 min: both rows show `idle` with their respective "Next at" sublines.
- [ ] DST start day (March 9, 2026): a med scheduled at 8:00 AM in caregiver-TZ — the `wallClockToUtcMs` helper converges to the right UTC instant despite the spring-forward. Verify by setting clock to March 9 7:38 AM caregiver-local and confirming "Due in 22m."
- [ ] Caregiver opens the page at 11:55 PM with a med scheduled at 8:00 AM tomorrow: `nextSlotTime` is **today's** unresolved 8 AM (in the past, ~16h ago). State = `past-due`, pill reads "Past due 8 a.m." That's correct — they should log today's missed dose, not tomorrow's. **The "next slot" computation must NOT roll into tomorrow's schedule.**

### Performance
- [ ] One `setInterval` per list (not one per row). Confirm via Performance tab: only one timer task per minute.
- [ ] Ticker pauses on hidden tabs — confirm via Chrome DevTools Performance recording with the tab backgrounded.
- [ ] Re-render cost: 5 meds × one `nowMs` change per minute = trivial. No memo work needed.

### Persistence
- [ ] None. Visual-only.

### Permissions / RLS
- [ ] n/a.

### Side effects
- [ ] None — no fetch, no revalidate, no router.refresh in the ticker effect.

### Manual verification
1. Schedule a real med at the next round 5-minute mark (e.g., schedule_time = next 5-min boundary). Open `/dashboard`.
2. Watch the duration pill count down by 1 each minute.
3. Cmd-tab away for 3 minutes, return. Confirm the pill snaps to the correct value (and didn't sit stale at the pre-blur value).
4. Wait until the schedule time passes. Confirm the pill flips to "Past due {time}."
5. Confirm the dose. Pill flips to sage "Done."
6. Lint clean. Build clean.
7. Open Chrome DevTools → Performance → record 65 seconds while the page is open. Confirm exactly one timer fires (not five).

## What this plan does NOT do

- Does not change the optimistic dose-confirm flow inside the row's expansion panel.
- Does not change PRN row treatment (those don't have schedules).
- Does not introduce push notifications. The "due soon" signal is in-app only here.
- Does not introduce a global `<NowProvider>` context. One ticker scoped to `<TodaysMedsList>` is enough — no other surface needs minute-granularity nowMs today.
- Does not pre-emptively widen `nowMs` to second-granularity. Minute is enough for "Due in 20m"; if a future feature needs second granularity (e.g., voice-log countdown — already implemented separately), it gets its own scoped tick.

## Estimated effort

One session. ~1 hour from cold start: read the existing TodaysMedsList, add the ticker effect, add the helper, update MedRow's render, walk the AC list manually.
