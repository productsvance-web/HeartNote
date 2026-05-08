# Home header redesign — match `designs/home-screen.jsx` (fully fleshed)

> Small but visible. Replaces the existing dashboard header (small greeting + Fraunces "How is mom today?" headline) with the design-system structure: date eyebrow + Fraunces caregiver-greeting headline + subhead. Keeps the avatar bubble that landed in the prior session.

## Plain-English: what the caregiver sees

Today the home screen reads:
- "Good morning, Jazmin." (small)
- "How is *mom* today?" (Fraunces large)
- "Mom's check-in came in at 6:42 AM. Two things changed today."

After this redesign:
- "THURSDAY · MAY 7" (eyebrow uppercase)
- "Good morning, Jazmin." (Fraunces large)
- "Mom's check-in came in at 6:42 AM. Two things changed today."

The "How is mom today?" question framing moves out of the header. The cards below answer it (HeroAlertCard on alert, HomeAffirmationCard on green, BaselineProgressCard on cold-start). The header just greets the caregiver, time-stamps the day, and surfaces the count of things that changed.

## Reference

`/tmp/heartnote-design-system/designs/home-screen.jsx#HomeHeader` is the canonical mock. Read it before editing.

## Files to MODIFY

- `src/app/dashboard/page.tsx`

The header JSX is rendered twice in the file (once in the cold-start branch around line 113, once in the post-baseline branch around line 196). Both branches change. The avatar bubble component already exists in this file as `PatientInitialAvatar` — keep it; it stays in the top-right corner.

## Per-state copy

The headline is always `Good morning|afternoon|evening, {caregiver_name}.` derived from `greet()` (already exists in the file) and `profile.display_name`. The italic is gone — the patient name is no longer in the headline.

The eyebrow is always `{DAY-OF-WEEK} · {MONTH} {DAY}` in caregiver TZ, uppercase, 0.06em letter-spacing. E.g., `THURSDAY · MAY 7`. Caregiver TZ is `profile.timezone`.

The subhead varies by state:

| State | Headline | Subhead |
|---|---|---|
| Cold-start, no log today | "Good morning, {caregiver}." | "Days 1–7 are just data. After seven mornings, we can flag the day something feels different." |
| Cold-start, log complete today | "Good morning, {caregiver}." | "{patient}'s check-in came in at {time}. Day {N} of 7." |
| Post-baseline, no log yet | "Good morning, {caregiver}." | "{patient} hasn't checked in yet. Tap the mic to log today." (existing copy lives in the "no check-in yet today" card; subhead can be omitted in this state and the card carries the message) |
| Post-baseline, log processing | "Good morning, {caregiver}." | (omitted — the processing card carries the message) |
| Post-baseline, log complete, 0 triggers | "Good morning, {caregiver}." | "{patient}'s check-in came in at {time}." |
| Post-baseline, log complete, 1 trigger | "Good morning, {caregiver}." | "{patient}'s check-in came in at {time}. **One thing changed today.**" |
| Post-baseline, log complete, N triggers | "Good morning, {caregiver}." | "{patient}'s check-in came in at {time}. **{countWord(N)} things changed today.**" |

The "X thing(s) changed today" beat already exists in the current implementation — preserve it verbatim.

## Edge cases

- **`profile.display_name` is null:** fall back to "Good morning, there." (preserves existing fallback in the current code).
- **Patient `display_name` is null:** subhead reads "Today's check-in came in at {time}." (the existing `patientName === 'them'` branch handles this — preserve).
- **Caregiver TZ shifts the calendar day:** `getTodayInTimezone(profile.timezone)` already drives `today`. Use it to derive the eyebrow date too, not server UTC.
- **Locale isn't en-US:** the eyebrow uses `Intl.DateTimeFormat('en-US', {...})` (matches the rest of the app's en-US-only assumption — pre-launch).
- **`triggers.length === 0` post-baseline:** drop the count clause (existing behavior — preserve).
- **Avatar overlap:** keep `pr-16` on the headline + subhead lines (already in place).

## Date-formatting helper

Add `formatHeaderEyebrow(today: string, tz: string): string` to `src/lib/dates/format.ts`. Returns e.g. `"THURSDAY · MAY 7"`.

```ts
// src/lib/dates/format.ts (extend existing file)
export function formatHeaderEyebrow(isoDate: string, tz: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`); // noon UTC anchor — won't drift across DST
  const fmt = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: tz,
  });
  const parts = fmt.formatToParts(d);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${weekday} · ${month} ${day}`.toUpperCase();
}
```

Why noon UTC anchor: `today` is an ISO YYYY-MM-DD string in caregiver TZ. Constructing `new Date("2026-05-07T00:00:00Z")` then formatting in `America/New_York` would output `Wed May 6` — yesterday — because of the UTC-to-Eastern offset. Anchoring at noon UTC keeps the displayed date matching the input ISO string regardless of TZ. Standard trick.

## Acceptance criteria

### Engineering
- [ ] No new components created. Header JSX changes inline.
- [ ] `formatHeaderEyebrow` added to `src/lib/dates/format.ts` (existing file).
- [ ] Diff scoped to: `dashboard/page.tsx` + `src/lib/dates/format.ts`.

### Functional
- [ ] Cold-start, account just created, today not logged: header renders `THURSDAY · MAY 7` eyebrow + `Good morning, {caregiver}.` Fraunces headline + "Days 1–7 are just data..." subhead. Avatar top-right with patient initial.
- [ ] Cold-start, day 3 of 7, today logged: same eyebrow + headline. Subhead reads "{patient}'s check-in came in at 6:42 AM. Day 3 of 7."
- [ ] Post-baseline, today logged, 0 triggers: eyebrow + headline + subhead "{patient}'s check-in came in at {time}." (no count clause). HomeAffirmationCard renders below header.
- [ ] Post-baseline, today logged, 2 triggers: subhead reads "{patient}'s check-in came in at {time}. **Two things changed today.**" HeroAlertCard renders below.
- [ ] Avatar bubble stays top-right at `right-6 top-8`, doesn't overlap eyebrow or headline at any patient-name length.

### Edge cases
- [ ] `profile.display_name === null`: headline reads "Good morning, there."
- [ ] `patient.display_name === null`: subhead uses "Today's" instead of "{patient}'s".
- [ ] Caregiver TZ = `Pacific/Honolulu` while server is UTC at 11 PM HST: eyebrow shows the HST day, not the UTC day. Confirm by mocking `today` and `profile.timezone` and reading `formatHeaderEyebrow` output.
- [ ] DST boundary day (e.g., March 9, 2026): eyebrow shows `SUNDAY · MARCH 9`, not `SATURDAY · MARCH 8`.

### Performance
- [ ] No new queries. `today` is already computed; `tz` is already loaded.
- [ ] `Intl.DateTimeFormat` is constructed once per render — fine at server-component scale.

### Persistence
- [ ] None. Visual-only.

### Permissions / RLS
- [ ] n/a — no new data path.

### Side effects
- [ ] None.

### Manual verification
1. Open `/dashboard` on a test caregiver (any state).
2. Verify the new header structure renders top-to-bottom: eyebrow, headline, subhead.
3. Walk to a cold-start state (or seed via the baseline edge-cases harness from `2026-05-08-baseline-edge-cases.md`). Verify eyebrow stays correct.
4. Walk to an alert state. Verify the subhead's "things changed" clause matches the current trigger count.
5. Lint clean. Build clean.

## What this plan does NOT do

- Does not redesign the cold-start branch's `BaselineProgressCard` or the post-baseline `VitalsListCard`. Those stay.
- Does not change the avatar bubble visual treatment or position. The avatar stays as the prior session shipped it.
- Does not touch `src/app/log/page.tsx`'s shell. The /log page header stays as the prior session shipped it (eyebrow `Voice log · day N` + Fraunces state-aware headline).
- Does not introduce a `<HomeHeader>` component despite the structural similarity across branches. Two callers, two inline JSX blocks — rule of three not yet hit.

## Estimated effort

One short session. ~30 minutes from cold start: read the dashboard file, write `formatHeaderEyebrow`, edit two header blocks, lint, build, push.
