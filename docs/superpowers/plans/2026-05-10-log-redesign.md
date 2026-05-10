# /log Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `/log` voice-only page and the current `/log/manual` tap-only page with a single unified `/log` page where the five vitals (weight, pillows, BP, HR, SpO2) sit on the main view, fourteen symptoms (eight graded + six yes/no red-flag checks) live in a sheet behind a bottom-right ear button, voice fills both surfaces, and tap overrides any value.

**Architecture:** One Next.js Server Component page (`/log/page.tsx`) renders a single client component (`LogPageClient`) that owns the unified state for both vitals and symptoms. Voice flows through the existing `processVoiceLog` pipeline; tap edits debounced-autosave (1.5s after last tap) into the same daily_logs row. The voice path **creates** a daily_logs row when recording starts; subsequent tap edits **update** that same row's readings/symptom_events. A tap-only session creates the row on the first tap. The symptom modal is an iOS-style sheet rendered inline (not a separate route) so closing it returns to the vitals view without navigation. The alert engine re-evaluates on every commit.

**Tech Stack:** Next.js 16 App Router · TypeScript · Tailwind 4 · shadcn/ui primitives · Supabase (Postgres + RLS) · Anthropic Claude (Haiku 4.5 for extraction) · Deepgram (live transcription) · Playwright (e2e).

**Source-of-truth design file:** `docs/design/heartnote-log-redesign-mockup.html` (1936 lines).

---

## Locked decisions

These were settled before plan-writing. Every task obeys these. If a reviewer wants to revisit, push back here, not inside a task.

- **L1. Save model.** When the caregiver taps a card, the page waits 1.5 seconds of no-more-taps and then saves what changed. Each visit to /log gets its own row in our records (the "tap-session row"); subsequent taps in the same visit update that same row. Voice creates its own row per dictation, unchanged. If the caregiver taps mic mid-edit, the page finishes saving the tap-session before recording starts (so taps are never lost). If she navigates away, the page flushes pending changes via `beforeunload` + Next.js router-leave hooks.
- **L2. Fatigue severity.** Migrate: drop the `daily_log_symptom_events_fatigue_no_severity` CHECK so fatigue can carry severity 0-4. The Phase 1 alert engine still reads fatigue as binary-vs-baseline; the new column lets the modal render 4 levels and lets future trend rules use the granularity. Pre-launch, no compat shim.
- **L3. /log/manual lifecycle.** Delete it. The unified `/log` page subsumes the tap-only path. Per CLAUDE.md "no backwards-compat" rule. Search the repo for `/log/manual` references and rewrite to `/log`. No redirect.
- **L4. Symptoms tracked but absent from mockup** (`pulse_irregular`, `dizziness`, `nausea`). Include all three in the modal's red-flag-check section as additional yes/no rows. Voice already extracts them and the alert engine fires on them; not surfacing them in the modal would be a quality bug. `dizziness` gets a follow-up "On standing, or persistent?" segmented control when "Yes" — same structure as cough → sputum.
- **L5. Sputum has 4 options, not 3.** Mockup omits `white_frothy`. Code (extract.ts) treats both `white_frothy` and `pink_frothy` as tier-1. Render: Clear / White / White-frothy / Pink-frothy. Both frothy options are warn/alert-toned.
- **L6. Dyspnea has 5 options, not 4.** Mockup shows Normal / Stairs / Flat walk / ADLs (severity 0-3). The existing `/log/manual` shows the 5th option ("At rest" = severity 4) which is a tier-1 trigger. We keep all 5; tapping "At rest" lights the alert banner just like a yes-flag.
- **L7. Bottom bar.** Two ghost circles, mic (left) + ear (right), 46×46, Apple-Weather utility style per mockup. The ear icon swaps to a sage-deep filled glyph when ≥1 symptom has been heard from voice (regardless of whether modal is open or closed). On modal-open, the ear icon does not change state.
- **L8. Defaults shown when nothing logged today.** Each vital stepper seeds with the most recent reading from the prior 7 days for that field; `pillow_count` seeds with `patients.normal_pillow_count`; if no reading exists for a field, the stepper renders `—` placeholder. Until the caregiver taps or voice fills, the card is in `muted` state and is NOT considered "captured" for save purposes — yesterday's value held visually doesn't write a new row.
- **L9. Alert banner.** Tier-1 yes-flags (chest pain, syncope, cyanosis, white_frothy or pink_frothy sputum, dyspnea-at-rest, severe cognition_change, pulse_irregular+chest_pain compound) render the existing alert chip banner pattern (currently in voice-log-client.tsx) **above the page header** on /log. Re-uses the existing `alertChipsFromClaude` logic, lifted out of voice-log-client.tsx into a shared lib (see Task 12).
- **L10. Empty modal-init.** Opening the modal when no symptoms have been logged today shows all defaults (Normal, No cough, None, Clear, Normal, Normal, Normal, all No's). The caregiver tapping "Yes" on a red-flag is the FIRST commit of that symptom_event; the defaults themselves are NOT auto-committed.

---

## Plan-review patches (2026-05-10)

The plan-review subagent surfaced ~30 findings. Resolutions below are locked; the rest of this document was edited inline to match.

- **R1. Tap-during-record** — when a caregiver taps a card while recording is active, the tapped value persists immediately (debounced save) and voice extraction for that field is dropped on submit. (Was buried in manual-verification step 10; lifted to Functional AC.)
- **R2. Mic press while modal open** — modal closes; recording starts on the vitals view.
- **R3. Mic press while tap-session is dirty** — flush pending tap-session save to completion before creating the voice row. Failure to flush aborts the voice start.
- **R4. Sessions-per-day** — each open-of-/log creates its own tap-session row when the caregiver taps. Voice rows remain one-per-dictation. Most-recent-per-field-across-all-rows wins for hydration and engine evaluation. (Architectural pivot from event-style daily_logs rows; surfaced explicitly.)
- **R5. dyspnea=4 + chest_pain=true** — both alert banners stack. Different research citations.
- **R6. Eyebrow** — keep mockup-verbatim "Voice log · day N". Mockup is source-of-truth per CLAUDE.md rule #12; do not rename.
- **R7. Race protection on save** — switch from delete+insert to UPSERT-on-conflict via the existing `apply_voice_log_extraction` RPC + a new "clear tap-session readings/events first" RPC arg. Cleaner than a SELECT FOR UPDATE.
- **R8. pillow_count storage** — moves from `daily_logs.pillow_count` (per-row, day-level) into `daily_log_readings` as `field='pillow_count'`. Uniform "most recent per field" semantics across multi-row days. New migration. (Voice and tap rows on the same day no longer step on each other's pillow_count.)
- **R9. AlertChipBanner single source** — banner reads from `daily_assessments.triggers` only. The legacy `alertChipsFromClaude(claudeTiles)` function in voice-log-client.tsx is dead code after Task 11 — deleted, not lifted.
- **R10. Tone vs State 'alert' overload** — rename `Tone.alert` → `Tone.urgent` in `helper-text.ts` to disambiguate from `VitalCardState.alert` (the corner-pip variant).
- **R11. Cognition enum** — add 'severe' (severity 4) so voice-extracted `cognition_change=severe` round-trips. Modal still doesn't render the 'severe' option (it triggers the alert banner directly), but hydration must support it.
- **R12. Swelling field naming** — schema column is `resolves_overnight`. Rename the existing manual-entry's `resolvesOvernight` to `resolvesOvernight` everywhere. Single name end-to-end.
- **R13. /log/[id]/edit access** — keep the existing "Edit today's details" link, but only render it for voice-only rows (`tap_session_id IS NULL` AND `processing_status='complete'`). Tap-session rows are continuously editable on /log itself, so the historical edit page is voice-correction only.
- **R14. activity_step_change** — voice still extracts and stores it. Modal does not surface it. Engine still reads it. No regression.
- **R15. Plain-english rewrite of L1, Q-section deletion, AC vague-verb cleanup** — applied inline.
- **R16. Migration application** — Task 1 + Task 8 migrations apply to local via `supabase db push` before code that depends on them runs. After PR merge, the assistant runs `supabase db push` against prod. Per memory `feedback_execute_migrations`.
- **R17. Drag-down-to-close gesture** — gate the touchstart on the grip element only, so mid-card drags scroll the modal (don't dismiss it).
- **R18. Concurrent /log on phone + tablet** — accepted limitation pre-launch. Last-write-wins for the day. No optimistic-concurrency token in v1.
- **R19. Drop the extract.ts prompt rewrite** — Task 1 Step 1.3 is removed. Migrating the schema is enough; widening the voice-prompt fatigue handling is out of scope for this PR.

---

## File structure

### Create

```
src/app/log/page.tsx                                   ← REWRITE (currently exists, large rewrite)
src/app/log/log-page-client.tsx                        ← NEW (replaces voice-log-client.tsx)
src/app/log/save-actions.ts                            ← NEW (replaces actions.ts + manual/actions.ts)
src/components/heartnote/log/VitalCard.tsx             ← NEW (chassis: status dot, label, control, helper, corner pip)
src/components/heartnote/log/DualStepperControl.tsx    ← NEW (BP sys+dia)
src/components/heartnote/log/SymptomGradedCard.tsx     ← NEW (segmented control + helper)
src/components/heartnote/log/SymptomYesNoCard.tsx      ← NEW (yes/no pill + question)
src/components/heartnote/log/SymptomsModal.tsx         ← NEW (the iOS sheet)
src/components/heartnote/log/TranscriptCard.tsx        ← NEW (italic Fraunces with mask-gradient)
src/components/heartnote/log/BottomBar.tsx             ← NEW (mic + ear utility buttons)
src/components/heartnote/log/AlertChipBanner.tsx       ← NEW (extracted from voice-log-client.tsx)
src/lib/log/helper-text.ts                             ← NEW (pure: value + baseline → tone + copy)
src/lib/log/page-context.ts                            ← NEW (server: loads vitals + symptoms + assessments for today)
supabase/migrations/20260510000000_fatigue_severity.sql ← NEW (drop CHECK constraint)
tests/e2e/log-redesign.spec.ts                         ← NEW (Playwright)
tests/unit/helper-text.test.ts                         ← NEW (unit: tone selection)
```

### Modify

```
src/app/log/voice-log-client.tsx                       ← DELETE (replaced by log-page-client.tsx)
src/app/log/actions.ts                                 ← DELETE (replaced by save-actions.ts)
src/app/log/manual/                                    ← DELETE (whole directory)
src/components/heartnote/manual-entry/StepperControl.tsx ← MOVE to src/components/heartnote/log/StepperControl.tsx (re-export only — preserve API)
src/components/heartnote/manual-entry/SegmentedControl.tsx ← MOVE to src/components/heartnote/log/SegmentedControl.tsx (add warn/alert active variants)
src/components/heartnote/manual-entry/VitalsRow.tsx    ← DELETE (replaced by VitalCard.tsx, different chassis)
src/components/heartnote/BottomNav.tsx                 ← MODIFY (any /log/manual link becomes /log)
src/components/heartnote/DailyPromptHero.tsx           ← MODIFY (any /log/manual link becomes /log)
src/app/dashboard/                                     ← MODIFY (search for /log/manual references, rewrite)
src/lib/voice-log/process.ts                           ← MODIFY (post-extraction: still creates own row, unchanged behavior)
```

### Why these splits

- `VitalCard` and the symptom card variants are different enough (vital = stepper; symptom-graded = segmented; symptom-yesno = pill row) that fusing them into one chassis means a 5-prop variant explosion. Three components, each with one job.
- `helper-text.ts` is the only place rule logic decides the tone (calm/watch/alert) of a card. Extracted from inline render code for testability — every threshold cite from `research/chf-source-of-truth.md` lands in one file.
- `page-context.ts` mirrors the existing `getYesterdayLog` pattern (server-only). Loads the data the page needs in one round-trip.

---

## Task breakdown

Each task ends in a commit. Run from a worktree at `.claude/worktrees/log-redesign/` (CLAUDE.md mandates worktrees). Worktree creation is Step 0 of Task 0 below.

---

### Task 0: Worktree + branch setup

**Files:** none yet.

- [ ] **Step 0.1: Create the worktree from main.**

```bash
cd /Users/jazminescamilla/Desktop/heartnote
git fetch origin main
git worktree add .claude/worktrees/log-redesign -b log-redesign origin/main
```

- [ ] **Step 0.2: Install deps in the worktree (real install, not symlink — see memory `feedback_worktree_node_modules`).**

```bash
cd .claude/worktrees/log-redesign
npm install
```

- [ ] **Step 0.3: Verify clean baseline (build + lint pass on origin/main before any change).**

```bash
npm run lint
npm run build
```

Expected: both pass. If they don't, stop — main is broken; do not proceed.

- [ ] **Step 0.4: Commit the empty baseline marker** (so subsequent commits show clean diff).

Skip — no commit needed yet. Move to Task 1.

---

### Task 1: Migration to allow fatigue severity

**Files:**
- Create: `supabase/migrations/20260510000000_fatigue_severity.sql`
- Modify: `src/lib/voice-log/extract.ts:97` (the inline note about "BINARY ONLY — never include severity" — soften to "binary today, severity reserved for future trend rules; the engine reads frequency-vs-baseline either way")

- [ ] **Step 1.1: Write the migration.**

```sql
-- 20260510000000_fatigue_severity.sql
-- Drop the constraint that forced fatigue rows to omit severity.
-- The Phase 1 alert engine reads fatigue as binary-vs-baseline; this
-- migration unblocks the /log redesign UI from rendering a 4-level
-- segmented control. No engine behavior change.

alter table public.daily_log_symptom_events
  drop constraint if exists daily_log_symptom_events_fatigue_no_severity;
```

- [ ] **Step 1.2: Apply locally.**

```bash
supabase db push
```

Expected: applies cleanly. If the constraint name differs in your local DB, look it up via `\d daily_log_symptom_events`.

- [ ] **Step 1.3: (REMOVED per R19.)** Do not rewrite the extract.ts inline note. Voice extraction stays binary for fatigue; the new severity column is filled only by tap. Out of scope for this PR.

- [ ] **Step 1.4: Commit.**

```bash
git add supabase/migrations/20260510000000_fatigue_severity.sql
git commit -m "$(cat <<'EOF'
feat(log): allow severity on fatigue symptom_events

Drops the fatigue-no-severity CHECK so the /log redesign modal can render a
4-level segmented control. Phase 1 alert engine still reads fatigue as
binary-vs-baseline; severity is reserved for future trend rules.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Helper-text resolver library + unit tests

**Files:**
- Create: `src/lib/log/helper-text.ts`
- Create: `tests/unit/helper-text.test.ts`

The helper-text resolver is a pure function: given (field, value, baseline_context) → { tone: 'calm' | 'watch' | 'alert', copy: string }. Every threshold imports from `src/lib/clinical/thresholds.ts`. Every copy line either matches the mockup verbatim or has a `// cited:` comment pointing at the research file.

- [ ] **Step 2.1: Write the failing test file.**

```ts
// tests/unit/helper-text.test.ts
import { describe, it, expect } from 'vitest';
import { resolveHelperText } from '@/lib/log/helper-text';

describe('resolveHelperText', () => {
  describe('weight', () => {
    it('returns watch tone when up >= 4 lb in 14 days', () => {
      const result = resolveHelperText('weight', {
        valueLb: 182.4,
        baselineLb: 178.0,
        gainLb14d: 4.4,
        baselineFreshDays: 7,
      });
      expect(result.tone).toBe('watch');
      expect(result.copy).toContain('4.4 lb');
      expect(result.copy.toLowerCase()).toContain('water gain');
    });

    it('returns calm tone when within 2 lb of baseline', () => {
      const result = resolveHelperText('weight', {
        valueLb: 178.5,
        baselineLb: 178.0,
        gainLb14d: 0.5,
        baselineFreshDays: 7,
      });
      expect(result.tone).toBe('calm');
    });
  });

  describe('spo2', () => {
    it('returns alert when spo2 <= 88 (tier-1 floor)', () => {
      const result = resolveHelperText('spo2', { valuePct: 87 });
      expect(result.tone).toBe('alert');
      expect(result.copy.toLowerCase()).toContain('88');
    });

    it('returns watch when spo2 91-94 with new dyspnea', () => {
      const result = resolveHelperText('spo2', { valuePct: 91, hasNewDyspnea: true });
      expect(result.tone).toBe('watch');
    });

    it('returns calm when spo2 >= 95', () => {
      const result = resolveHelperText('spo2', { valuePct: 96 });
      expect(result.tone).toBe('calm');
      expect(result.copy.toLowerCase()).toContain('88');
    });
  });

  describe('pillows', () => {
    it('returns watch when pillows up from baseline', () => {
      const result = resolveHelperText('pillows', {
        countToday: 3,
        baselineCount: 1,
      });
      expect(result.tone).toBe('watch');
      expect(result.copy.toLowerCase()).toContain('orthopnea');
    });

    it('returns calm when at baseline', () => {
      const result = resolveHelperText('pillows', { countToday: 1, baselineCount: 1 });
      expect(result.tone).toBe('calm');
    });
  });

  describe('hr', () => {
    it('alerts when hr > 120 bpm', () => {
      const result = resolveHelperText('hr', { valueBpm: 122, baselineBand: [66, 92] });
      expect(result.tone).toBe('watch'); // tier-2 — banner is the alert; helper is watch
    });
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail.**

```bash
npx vitest run tests/unit/helper-text.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 2.3: Implement `src/lib/log/helper-text.ts`.**

```ts
// Pure helper-text resolver. Given a field + value + minimal context,
// returns the tone and copy line for the VitalCard helper. Every
// threshold imports from src/lib/clinical/thresholds.ts. Every copy
// line is either a mockup-verbatim string or has a research citation.
//
// Caller (LogPageClient) passes the context. This file has no I/O.

import {
  WEIGHT_GAIN_TIER_2_7D_LB,
  SPO2_TIER_1_911,
  SPO2_TIER_1_WITH_DYSPNEA,
  HR_TIER_2_HIGH,
  HR_TIER_2_VERY_HIGH,
  HR_TIER_2_LOW,
  SBP_TIER_2_LOW,
} from '@/lib/clinical/thresholds';

// 'urgent' (NOT 'alert') to disambiguate from VitalCardState.alert (the
// corner-pip variant). Tone is the helper-text color tier; State is the
// card chassis variant.
export type Tone = 'calm' | 'watch' | 'urgent';

export type WeightContext = {
  valueLb: number | null;
  baselineLb: number | null;
  gainLb14d: number | null; // value - baseline_14d_ago
  baselineFreshDays: number; // 0 if no baseline yet (cold-start)
};

export type Spo2Context = {
  valuePct: number | null;
  hasNewDyspnea?: boolean;
};

export type PillowsContext = {
  countToday: number | null;
  baselineCount: number; // patients.normal_pillow_count
};

export type HrContext = {
  valueBpm: number | null;
  baselineBand: [number, number] | null;
};

export type BpContext = {
  systolic: number | null;
  diastolic: number | null;
  baselineSysBand: [number, number] | null;
};

type FieldContextMap = {
  weight: WeightContext;
  spo2: Spo2Context;
  pillows: PillowsContext;
  hr: HrContext;
  bp: BpContext;
};

export function resolveHelperText<K extends keyof FieldContextMap>(
  field: K,
  ctx: FieldContextMap[K],
): { tone: Tone; copy: string } {
  // ... implementation per the test cases above. Each branch carries the
  //     research citation. Copy lines match the mockup verbatim where the
  //     mockup specifies them; deviations are flagged in comments.
}
```

(Full implementation follows the test cases. Stub elided here for brevity — the writing engineer should follow the cite-from-thresholds pattern in the existing `src/lib/alerts/evaluate.ts`.)

- [ ] **Step 2.4: Run tests to verify they pass.**

```bash
npx vitest run tests/unit/helper-text.test.ts
```

Expected: all pass.

- [ ] **Step 2.4a: Verify every clinical claim is cited.**

```bash
grep -c "// cited:" src/lib/log/helper-text.ts
```

Expected: ≥ one cite per copy line that names a threshold or trend (weight gain, SpO2 floor, HR band, etc.). If a copy line is mockup-verbatim (no clinical claim), no citation needed; mark with `// mockup-verbatim` instead. Per CLAUDE.md "Cite the research file" rule.

- [ ] **Step 2.4b: Cold-start coverage.**

Add a test case for `weight` with `baselineLb: null`, `baselineFreshDays: 0`. Expected: tone='calm', copy mentions "first reading" or similar — never trends. Same pattern for spo2 (cold-start) and pillows (no baseline_count). Confirm no test relies on a non-null baseline.

- [ ] **Step 2.5: Commit.**

```bash
git add src/lib/log/helper-text.ts tests/unit/helper-text.test.ts
git commit -m "feat(log): helper-text resolver + unit tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Page-context server helper

**Files:**
- Create: `src/lib/log/page-context.ts`

Loads everything the unified `/log` page needs in one server-side call:
- patient (id, display_name, normal_pillow_count, dry_weight_lb, baseline bands)
- yesterday's readings (for muted defaults on each vital card)
- today's daily_logs rows + readings + symptom_events (for hydration)
- 14-day baseline weight (for weight gain helper)
- today's `daily_assessments` row (for tier-1 banner replay)

- [ ] **Step 3.1: Write `src/lib/log/page-context.ts`.**

```ts
// Server-only: assembles the full data context for /log page render.
// Mirrors getYesterdayLog's pattern (one round-trip per concern, then
// reduce). Returns a flat shape the client can hydrate from.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

export type LogPageContext = {
  patient: {
    id: string;
    displayName: string;
    normalPillowCount: number;
    dryWeightLb: number | null;
    baselineSbpBand: [number, number] | null;
    baselineDbpBand: [number, number] | null;
    baselineHrBand: [number, number] | null;
  };
  vitals: {
    weight: { yesterdayLb: number | null; baseline14dLb: number | null; todayLb: number | null };
    pillows: { yesterdayCount: number | null; baseline7dCount: number | null; todayCount: number | null };
    bp: { yesterday: { sys: number; dia: number } | null; today: { sys: number; dia: number } | null };
    hr: { yesterdayBpm: number | null; todayBpm: number | null };
    spo2: { yesterdayPct: number | null; todayPct: number | null };
  };
  symptoms: {
    // Today's most-recent value per symptom (from daily_log_symptom_events
    // ordered by recorded_at desc). Hydrates the modal so a re-open shows
    // what voice or prior tap captured.
    dyspneaSeverity: number | null;
    cough: 'none' | 'daytime' | 'nocturnal' | null;
    sputumColor: 'clear' | 'white' | 'white_frothy' | 'pink_frothy' | null;
    swellingSeverity: number | null;
    swellingRegion: 'ankles' | 'calves' | 'thighs' | 'abdomen' | null;
    swellingResolvesOvernight: boolean | null;
    fatigueSeverity: number | null; // null = normal/not present
    cognitionChange: 'clear' | 'mild_fog' | 'confusion' | 'severe' | null; // 'severe' (severity 4) round-trips voice extraction; modal renders only the first 3 options because severity-4 fires the alert banner directly.
    appetiteChange: 'decreased' | 'unchanged' | 'increased' | null;
    urineOutputChange: 'decreased' | 'unchanged' | 'increased' | null;
    chestPain: boolean | null;
    syncope: boolean | null;
    cyanosis: boolean | null;
    pnd: boolean | null;
    earlySatiety: boolean | null;
    extremitiesColdClammy: boolean | null;
    pulseIrregular: boolean | null;
    dizziness: boolean | null;
    dizzinessPostural: boolean | null;
    nausea: boolean | null;
  };
  assessment: {
    tier: 'tier_1_911' | 'tier_2_today' | 'tier_3_48hr' | 'tier_4_log';
    triggers: Array<{ rule_id: string; label: string; evidence: Record<string, unknown> }>;
    coldStart: boolean;
  } | null;
  todayLogId: string | null; // most recent daily_logs row for today (if any)
  todayLogStatus: 'pending' | 'analyzing' | 'complete' | 'failed' | null;
  transcript: string | null;
  caregiverSummary: string | null;
  dayN: number;
};

export async function loadLogPageContext(
  supabase: SupabaseClient<Database>,
  userId: string,
  today: string,
): Promise<LogPageContext | null> {
  // ... implementation: parallel queries for patient, today's logs, today's
  //     readings, today's symptom events, today's assessment, prior 14d
  //     weight readings (for baseline), prior 7d pillow_count rows.
  // ... reduce: most-recent-wins per field for "today values", oldest-in-
  //     window for baseline.
  // Return null if patient missing (caller handles redirect).
}
```

- [ ] **Step 3.2: Run typecheck.**

```bash
npx tsc --noEmit
```

Expected: passes.

- [ ] **Step 3.3: Commit.**

```bash
git add src/lib/log/page-context.ts
git commit -m "feat(log): page-context loader for unified /log

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: VitalCard chassis component

**Files:**
- Create: `src/components/heartnote/log/VitalCard.tsx`
- Move: `src/components/heartnote/manual-entry/StepperControl.tsx` → `src/components/heartnote/log/StepperControl.tsx` (and update imports)

Implements the four-zone chassis: status dot · label · context · control · helper. Carries the `state` prop ('muted' | 'heard' | 'tapped' | 'alert') which drives the outline ring + corner pip variant. Tone of helper text is independent (`tone` prop: 'calm' | 'watch' | 'alert'). Press scale `active:scale-[0.99]` on the value chip.

- [ ] **Step 4.1: Move StepperControl.**

```bash
git mv src/components/heartnote/manual-entry/StepperControl.tsx src/components/heartnote/log/StepperControl.tsx
```

Update its import in any file that referenced it. (Manual-entry directory will be deleted in Task 14, so no need to re-export from old path.)

- [ ] **Step 4.2: Write VitalCard.tsx.**

```tsx
'use client';

import { Sparkles } from 'lucide-react';
import type { Tone } from '@/lib/log/helper-text';

export type VitalCardState = 'muted' | 'heard' | 'tapped' | 'alert';

type Props = {
  label: string;
  contextLine?: string; // "vs. baseline 178.0 lb" or "cuff · just now"
  state: VitalCardState;
  tone: Tone;
  helper: string;
  children: React.ReactNode; // the control (stepper / dual-stepper)
};

export function VitalCard({ label, contextLine, state, tone, helper, children }: Props) {
  // Outline ring + corner pip variants per state.
  // Helper class derived from tone.
  // Status dot color from tone (calm=sage, watch=warn-line, alert=alert-line).
}
```

- [ ] **Step 4.3: Commit.**

```bash
git add src/components/heartnote/log/
git commit -m "feat(log): VitalCard chassis + Stepper move

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: DualStepperControl (BP)

**Files:**
- Create: `src/components/heartnote/log/DualStepperControl.tsx`

Two adjacent half-steppers (Sys / Dia). 122 / 76 layout. Tap any number to type via numeric keypad (uses native `<input inputMode="numeric">` revealed on tap-value, same pattern as StepperControl).

**Canonical-controls compliance.** The mockup phone-1 dual-stepper renders with 26×26 buttons inline in compact half-cards; this is **smaller than register #5's 36×36 floor.** Reconciliation per CLAUDE.md rule #12 ("design wins by default; rule file gets updated to match"): use the mockup's 26×26 visual but keep a 32×32 minimum hit-target via padding around the 26×26 glyph. After implementation, update `.claude/rules/canonical-controls.md` register #5 to acknowledge the dual-stepper compact variant. The trailing X clear (register #1) is OPTIONAL on the dual-stepper because clearing one half without the other rarely makes sense — clear is "tap-value-and-blank" instead.

- [ ] **Step 5.1: Implement DualStepperControl.tsx.**

```tsx
'use client';

import { Minus, Plus } from 'lucide-react';

type Props = {
  systolic: number | null;
  diastolic: number | null;
  defaultSystolic: number | null;
  defaultDiastolic: number | null;
  onChange: (sys: number | null, dia: number | null) => void;
  onClear: () => void;
};

export function DualStepperControl({ ... }: Props) {
  // Two stepper-half components; ±1 increment each side; min 30 max 250
  // for sys, min 30 max 150 for dia per READING_RANGE. Tap-to-type via
  // `<input inputMode="numeric">` overlay (mirroring StepperControl).
}
```

- [ ] **Step 5.2: Commit.**

```bash
git add src/components/heartnote/log/DualStepperControl.tsx
git commit -m "feat(log): DualStepperControl for blood-pressure entry

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: SymptomGradedCard + SymptomYesNoCard + SymptomsModal

**Files:**
- Create: `src/components/heartnote/log/SymptomGradedCard.tsx`
- Create: `src/components/heartnote/log/SymptomYesNoCard.tsx`
- Create: `src/components/heartnote/log/SymptomsModal.tsx`
- Move: `src/components/heartnote/manual-entry/SegmentedControl.tsx` → `src/components/heartnote/log/SegmentedControl.tsx` (add `activeVariant: 'sage' | 'warn' | 'alert'` prop)

`SymptomsModal` is a `<dialog>` with a backdrop layer; CSS slide-up from the bottom on open. The dim cream strip above it (the page eyebrow + back row peeking through) is achieved with a backdrop-filter on the dialog parent + a lower opacity on the underlying page content. Drag-down-to-close: `useEffect` listens on touch events; if delta-y > 60px on the grip, close.

- [ ] **Step 6.1: Move SegmentedControl with new variant prop.**

```bash
git mv src/components/heartnote/manual-entry/SegmentedControl.tsx src/components/heartnote/log/SegmentedControl.tsx
```

Add `activeVariant?: 'sage' | 'warn' | 'alert'` prop. Update active-state class to switch background based on variant.

- [ ] **Step 6.2: SymptomGradedCard.**

Renders: status dot, label, context-line, segmented control, helper. Same chassis as VitalCard but content is a segmented instead of stepper. Receives `value`, `onChange`, `state`, `tone`, `options` (typed by the parent).

- [ ] **Step 6.3: SymptomYesNoCard.**

Renders: status dot, question, helper, [Yes/No pill row]. The yes/no buttons use the new SegmentedControl with `activeVariant='alert'` for the red-flag rows when "Yes" is chosen on tier-1 questions, `activeVariant='warn'` for tier-2.

- [ ] **Step 6.4: SymptomsModal.**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  symptoms: ContextSymptoms; // from page-context
  onChange: (patch: SymptomPatch) => void; // single-field patches
};

export function SymptomsModal({ open, onClose, symptoms, onChange }: Props) {
  // <dialog> element with backdrop. Native ESC + click-outside via a
  //   <button> backdrop layer.
  // useEffect: lock body scroll while open.
  // Render section dividers + cards + footer source line.
  // Sputum card is conditionally rendered when cough != 'none'.
}
```

- [ ] **Step 6.5: Commit.**

```bash
git add src/components/heartnote/log/
git commit -m "feat(log): symptom modal + graded/yes-no card components

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: TranscriptCard + AlertChipBanner + BottomBar

**Files:**
- Create: `src/components/heartnote/log/TranscriptCard.tsx`
- Create: `src/components/heartnote/log/AlertChipBanner.tsx`
- Create: `src/components/heartnote/log/BottomBar.tsx`

- [ ] **Step 7.1: TranscriptCard.**

Italic Fraunces 17.5px, sage-mist gradient bg, mask-image fade at edges per mockup. Visible only when `props.transcript != null`. Eyebrow says "From voice · {time}".

- [ ] **Step 7.2: AlertChipBanner.**

**Reads from `daily_assessments.triggers` only — single source of truth.** Per code-quality.md rule #3 (DB-of-truth). Per R9, the legacy `alertChipsFromClaude(claudeTiles)` function is dead code after Task 11; **delete it, do not lift it.**

Each trigger row has `{ rule_id, label, evidence }`. The banner maps rule_id → caregiver-facing copy (label + reason + cardiologist-script line). The mapping table lives inside the component file. Tier-1 = alert-bg + AlertTriangle; tier-2 = warn-bg + AlertCircle. Banners stack vertically, ordered by tier (tier-1 first).

Mapping table cites the research file inline:

```ts
const RULE_COPY: Record<string, { label: string; reason: string; action: string; cite: string }> = {
  T1_chest_pain: { label: 'New chest pain', reason: 'New chest pain or pressure in a CHF patient can signal an acute cardiac event.', action: 'Call the cardiologist now', cite: 'AHA · tier-1 decompensation indicator' },
  T1_syncope: { /* ... */ },
  // etc. — one entry per rule_id the engine can emit.
};
```

If a trigger arrives with an unknown rule_id, render a generic "Watch today" banner with the trigger's `.label` (engine fallback). Never crash, never blank.

- [ ] **Step 7.3: BottomBar.**

Two ghost-circle buttons (mic + ear), 46×46, Apple-Weather utility style. Mic button receives `recording: boolean`, `onClick`. Ear button receives `symptomHeard: boolean`, `modalOpen: boolean`, `onClick`. Ear icon swap per `symptomHeard`.

- [ ] **Step 7.4: Commit.**

```bash
git add src/components/heartnote/log/
git commit -m "feat(log): TranscriptCard, AlertChipBanner, BottomBar

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: save-actions.ts — unified upsert action

**Files:**
- Create: `src/app/log/save-actions.ts`

Replaces `src/app/log/manual/actions.ts` and parts of `src/app/log/actions.ts`. Two server actions:
- `upsertTodayTapSession(patch: SaveLogPatch)` — debounced save target. Creates a new daily_logs row on first call of a session; subsequent calls within the same `tapSessionId` update the existing row. Re-runs alert engine + upserts daily_assessments + alerts.
- `flushAndStartVoice(input: { patientId: string })` — flushes any in-flight tap-session row, then creates a new pending daily_logs row for voice (replaces the existing `startVoiceLog`).

`SaveLogPatch` is a delta shape: only fields in the payload are written. Touched-but-no-change fields are excluded by the client.

- [ ] **Step 8.1: Define the schema.**

```ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { evaluateAlertTier } from '@/lib/alerts/evaluate';
import { generateAlertReasoning } from '@/lib/alerts/reason';
import { getTodayInTimezone } from '@/lib/dates/today';
import { READING_RANGE } from '@/lib/clinical/reading-ranges';

const Severity04 = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

const SaveLogPatchSchema = z.object({
  tapSessionId: z.string().uuid(), // client-generated; lets us upsert into the same row across debounced calls
  vitals: z.object({
    weightLb: z.number().min(READING_RANGE.weight_lb[0]).max(READING_RANGE.weight_lb[1]).nullable().optional(),
    pillowCount: z.number().int().min(0).max(10).nullable().optional(),
    bp: z.object({
      sys: z.number().int().min(60).max(250).nullable(),
      dia: z.number().int().min(30).max(150).nullable(),
    }).nullable().optional(),
    hrBpm: z.number().int().min(30).max(220).nullable().optional(),
    spo2Pct: z.number().int().min(50).max(100).nullable().optional(),
  }),
  symptoms: z.object({
    dyspnea: Severity04.nullable().optional(),
    cough: z.enum(['none', 'daytime', 'nocturnal']).nullable().optional(),
    sputum: z.enum(['clear', 'white', 'white_frothy', 'pink_frothy']).nullable().optional(),
    swelling: z.object({
      severity: Severity04,
      region: z.enum(['ankles', 'calves', 'thighs', 'abdomen']).nullable(),
      resolvesOvernight: z.boolean(),
    }).nullable().optional(),
    fatigue: Severity04.nullable().optional(),
    cognition: z.enum(['clear', 'mild_fog', 'confusion']).nullable().optional(),
    appetite: z.enum(['decreased', 'unchanged', 'increased']).nullable().optional(),
    urineOutput: z.enum(['decreased', 'unchanged', 'increased']).nullable().optional(),
    chestPain: z.boolean().nullable().optional(),
    syncope: z.boolean().nullable().optional(),
    cyanosis: z.boolean().nullable().optional(),
    pnd: z.boolean().nullable().optional(),
    earlySatiety: z.boolean().nullable().optional(),
    extremitiesColdClammy: z.boolean().nullable().optional(),
    pulseIrregular: z.boolean().nullable().optional(),
    dizziness: z.object({ present: z.boolean(), postural: z.boolean().nullable() }).nullable().optional(),
    nausea: z.boolean().nullable().optional(),
  }),
});

export type SaveLogPatch = z.infer<typeof SaveLogPatchSchema>;
export type SaveLogResult = { ok: true; logId: string } | { ok: false; error: string };
```

- [ ] **Step 8.2: Implement `upsertTodayTapSession`.**

```ts
export async function upsertTodayTapSession(payload: SaveLogPatch): Promise<SaveLogResult> {
  const parsed = SaveLogPatchSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const data = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Load patient, profile, today.
  // Cross-field validation: if bp.sys + bp.dia both present, sys MUST be > dia.
  // Otherwise reject with "Systolic must be higher than diastolic."

  // 1. Upsert the daily_logs row by (patient_id, log_date, tap_session_id)
  //    using the unique partial index from Step 8.0a. Set
  //    processing_status='complete' on insert.
  //    UPSERT (NOT find-or-create) — race-protected via the unique index.
  // 2. Build readings[] and symptom_events[] from the patch.
  // 3. Single RPC call to `apply_log_patch_v2` (a new RPC introduced in
  //    Step 8.0d below). The RPC takes p_log_id + p_patch and:
  //      a. DELETES this log's existing readings + symptom_events (scoped
  //         to source_log_id = p_log_id). RLS scopes to the caller's
  //         patient.
  //      b. INSERTS the new readings/events.
  //      c. Updates day-level fields (appetite_change, urine_output_change,
  //         activity_step_change) on the daily_logs row.
  //    Atomicity: the whole operation runs inside a single transaction
  //    inside the RPC. No client-side multi-statement window where a
  //    crash leaves orphaned rows.
  // 4. Re-run evaluateAlertTier + upsert daily_assessments + alerts row
  //    (mirrors the existing manual/actions.ts pattern).
  // 5. revalidatePath('/dashboard'); revalidatePath('/log').
}
```

- [ ] **Step 8.0d: Define `apply_log_patch_v2` RPC.**

New migration `supabase/migrations/20260510040000_apply_log_patch_v2.sql`:

```sql
create or replace function public.apply_log_patch_v2(
  p_log_id uuid,
  p_readings jsonb,
  p_symptom_events jsonb,
  p_day_level jsonb
)
returns void
language plpgsql
security invoker
as $$
begin
  -- RLS scopes both deletes and inserts to the caller's patient.
  delete from public.daily_log_readings where source_log_id = p_log_id;
  delete from public.daily_log_symptom_events where source_log_id = p_log_id;

  insert into public.daily_log_readings (
    patient_id, log_date, recorded_at, field, value, source_log_id
  )
  select
    dl.patient_id, dl.log_date, now(), r->>'field', (r->>'value')::numeric, p_log_id
  from public.daily_logs dl
  cross join jsonb_array_elements(p_readings) as r
  where dl.id = p_log_id;

  -- ... same for symptom_events with all the optional fields
  --     (severity, body_region, nocturnal, sputum_color, postural,
  --      resolves_overnight, chest_pain_character).

  update public.daily_logs
  set
    appetite_change = coalesce(p_day_level->>'appetite_change', appetite_change),
    urine_output_change = coalesce(p_day_level->>'urine_output_change', urine_output_change),
    activity_step_change = coalesce(p_day_level->>'activity_step_change', activity_step_change),
    notes = coalesce(p_day_level->>'notes', notes),
    updated_at = now()
  where id = p_log_id;
end;
$$;
```

Note: distinct from `apply_voice_log_extraction` because the voice path APPENDS (one transcript = one set of new rows; never deletes prior data on the same log_id) while the tap-session path REPLACES (each save is the full snapshot of the session). Two RPCs with two different semantics, named distinctly.

The voice path (`/api/voice-log/[id]/process`) keeps using `apply_voice_log_extraction`. No change to the voice flow.

- [ ] **Step 8.0a: Add `tap_session_id uuid` column to daily_logs.**

```sql
-- supabase/migrations/20260510010000_log_tap_session.sql
alter table public.daily_logs
  add column if not exists tap_session_id uuid;

create index if not exists daily_logs_tap_session_idx
  on public.daily_logs(patient_id, log_date, tap_session_id)
  where tap_session_id is not null;
```

`tap_session_id` is null for voice rows. New unique partial constraint (next migration) keys upserts cleanly:

```sql
create unique index if not exists daily_logs_tap_session_uk
  on public.daily_logs(patient_id, log_date, tap_session_id)
  where tap_session_id is not null;
```

- [ ] **Step 8.0b: Move `pillow_count` from `daily_logs` (per-row) into `daily_log_readings` (per-field).**

```sql
-- supabase/migrations/20260510020000_pillow_count_to_readings.sql
-- Step 1. Allow 'pillow_count' as a daily_log_readings.field value with
--         range check 0..10.
alter table public.daily_log_readings
  drop constraint if exists daily_log_readings_field_check;

alter table public.daily_log_readings
  add constraint daily_log_readings_field_check
  check (field in (
    'weight_lb', 'resting_hr', 'spo2', 'systolic_bp', 'diastolic_bp',
    'pillow_count'
  ));

-- Per-field range check is per-field via existing check constraints; add
-- pillow_count to the value-range guard.
alter table public.daily_log_readings
  drop constraint if exists daily_log_readings_value_range;

alter table public.daily_log_readings
  add constraint daily_log_readings_value_range
  check (
    (field = 'weight_lb'   and value between 50  and 700) or
    (field = 'resting_hr'  and value between 30  and 220) or
    (field = 'spo2'        and value between 50  and 100) or
    (field = 'systolic_bp' and value between 60  and 250) or
    (field = 'diastolic_bp' and value between 30 and 150) or
    (field = 'pillow_count' and value between 0  and 10)
  );

-- Step 2. Backfill existing daily_logs.pillow_count rows into
--         daily_log_readings.
insert into public.daily_log_readings (
  patient_id, log_date, recorded_at, field, value, source_log_id
)
select
  patient_id, log_date, created_at, 'pillow_count', pillow_count, id
from public.daily_logs
where pillow_count is not null;

-- Step 3. Drop the column.
alter table public.daily_logs
  drop column if exists pillow_count;
```

After this migration, every consumer that reads pillow_count must use the same "most recent reading" pattern as weight/HR/SpO2. Update sites:

- `src/app/log/manual/actions.ts` — DELETED in Task 11 anyway; no-op.
- `src/lib/alerts/evaluate.ts` — replace `firstNonNull(rows, 'pillow_count')` with the readings-style aggregator already used for weight.
- `src/components/heartnote/YesterdayLogCard.tsx` — re-query from readings.
- `src/app/log/[id]/edit/edit-form.tsx` — pillow_count input now writes a reading row, not a column update.
- `src/lib/voice-log/process.ts` — the `apply_voice_log_extraction` RPC currently routes pillow_count from `day_level.pillow_count` onto `daily_logs.pillow_count`. Update RPC + client to route it as a reading row instead.

**This is a non-trivial schema migration.** The plan-review subagent flagged it; it's R8. If the implementation cost balloons, fall back to: keep `pillow_count` on `daily_logs` BUT take the most recent non-null across rows in the engine + page-context aggregator. Less clean but lower-risk. **Default to the migration; flag the fallback only if the migration breaks an unrelated code path.**

- [ ] **Step 8.0c: `apply_voice_log_extraction` RPC — verify it accepts the new pillow_count routing.**

The current RPC body inserts `p_day_level.pillow_count` onto the `daily_logs` row. After Step 8.0b, the RPC must route pillow_count as a reading. Add a new migration file `20260510030000_rpc_pillow_count_routing.sql` that re-creates the RPC (`create or replace function`) with the new routing.

- [ ] **Step 8.3: Implement `flushAndStartVoice`.**

```ts
export async function flushAndStartVoice(input: { patientId: string }): Promise<{ ok: true; logId: string } | { ok: false; error: string }> {
  // 1. Validate user owns patientId.
  // 2. Create new daily_logs row { patient_id, log_date: today, processing_status: 'pending', tap_session_id: null }.
  // 3. Return { ok: true, logId }.
}
```

(The voice path itself — process route, transcription — is unchanged. This action just replaces `startVoiceLog` and gives a single name that signals the flush-then-start semantics.)

- [ ] **Step 8.4: Commit.**

```bash
git add src/app/log/save-actions.ts supabase/migrations/20260510010000_log_tap_session.sql
git commit -m "feat(log): unified save action with debounce-friendly tap-session upsert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: LogPageClient — the unified client component

**Files:**
- Create: `src/app/log/log-page-client.tsx`

This is the biggest file. It owns:
- The five vital cards' state + the symptom modal state (single object, mirrors the SaveLogPatch shape).
- Voice recording state machine (lifted from the existing voice-log-client.tsx).
- Live regex extraction (existing `extractNumericTiles`) for vitals (writes into vital state with `state='heard'`).
- Post-processed Claude extraction (writes into both vital state AND symptom state with `state='heard'` for any field set).
- Tap handlers (mark field as `state='tapped'`; tier-1 yes-flag tap marks `state='alert'`).
- Tap-session ID (UUID generated on mount; survives until route change).
- Debounced autosave (1.5s after last tap). Calls `upsertTodayTapSession`.
- Symptom modal open/close.
- "Symptom heard" tracking (any symptom_event Claude returned → ear button glows).

Acceptance criteria for this component live in the AC section below; this task is the implementation surface.

- [ ] **Step 9.1: Skeleton + state types.**

Create the file with imports, prop types, and the unified state object. No render logic yet.

- [ ] **Step 9.2: Hydrate from page context on mount.**

Pull `LogPageContext` from props (passed by the server page). Initialize vital state: muted yesterday's values for the steppers' default; today's values (if any) for the steppers' actual value with `state='heard'` (heard from voice if `todayLogStatus==='complete'`) or `state='tapped'` (if from a prior tap session). Initialize symptom state similarly.

- [ ] **Step 9.3: Wire the five vital cards.**

Render `<VitalCard>` × 5 with the appropriate `<StepperControl>` or `<DualStepperControl>` inside. Tap on any stepper → updates state, marks `state='tapped'`, kicks the autosave debounce timer.

- [ ] **Step 9.4: Wire the BottomBar.**

Mic click → flush + start voice via `flushAndStartVoice`. Ear click → toggle modal. Pass `symptomHeard` derived from any symptom in state with non-null value.

- [ ] **Step 9.5: Wire the SymptomsModal.**

Open/close state. On change of any symptom field, mark `state='tapped'` for that card and kick autosave. Tier-1 yes-flag taps additionally trigger an immediate (non-debounced) save so the alert banner updates within ~200ms.

- [ ] **Step 9.6: Wire voice recording.**

Lift the recording state machine and Deepgram integration verbatim from `voice-log-client.tsx`. Start/stop wiring. The `submitTranscript` POST to `/api/voice-log/[id]/process` is unchanged. On `complete`, hydrate the heard pips from the new claudeTiles → maps to vital + symptom state, but ONLY for fields that aren't already in `state='tapped'` (tap-during-record-locks-the-field per L1).

- [ ] **Step 9.7: Wire the AlertChipBanner.**

Render at the top of the page (above the page header) when `assessment` exists and `assessment.tier !== 'tier_4_log'`. Source data is `daily_assessments.triggers` (refreshed via revalidatePath after every save).

- [ ] **Step 9.8: Wire the TranscriptCard.**

Render below the page header when `transcript != null` (most-recent voice log of the day). Italic Fraunces.

- [ ] **Step 9.9: Debounced autosave.**

Single `useEffect` keyed on the saveable patch shape. `setTimeout(1.5s)` after each change. Cancel on unmount or on next change. On flush, call `upsertTodayTapSession` and `router.refresh()` (so the assessment banner re-renders from server).

- [ ] **Step 9.10: Beforeunload + router-leave flush.**

Use Next.js `useRouter` + `usePathname` to flush on route change. Add a `beforeunload` handler that fires the save action synchronously via `navigator.sendBeacon` if there's a pending dirty patch.

- [ ] **Step 9.11: Error handling — autosave failures.**

If the autosave action returns `{ ok: false, error }`, surface a small toast + retain the dirty patch in memory + re-enqueue retry after 5s. Do NOT clear the user's tap edits on failure. Three failed retries → surface a persistent banner "Couldn't save your changes — try again."

- [ ] **Step 9.12: Commit.**

```bash
git add src/app/log/log-page-client.tsx
git commit -m "feat(log): unified LogPageClient — vitals + symptoms + voice + autosave

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: /log/page.tsx — server-side composition

**Files:**
- Modify (rewrite): `src/app/log/page.tsx`

- [ ] **Step 10.1: Replace the file.**

```tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { loadLogPageContext } from '@/lib/log/page-context';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { LogPageClient } from './log-page-client';

export default async function LogPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed_at, timezone')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarding_completed_at) redirect('/onboarding');

  const today = getTodayInTimezone(profile.timezone);
  const ctx = await loadLogPageContext(supabase, user.id, today);
  if (!ctx) redirect('/onboarding');

  return (
    <PhoneShell hideNav>
      <LogPageClient context={ctx} />
    </PhoneShell>
  );
}
```

The page header (back-arrow, eyebrow, headline, subhead) moves INTO LogPageClient because the headline depends on client state (idle vs recording vs complete vs has-voice-transcript-today). The page is the data-loading shell only.

- [ ] **Step 10.2: Verify the page renders.**

```bash
npm run dev
# Open http://localhost:3000/log — should render with no console errors.
```

- [ ] **Step 10.3: Commit.**

```bash
git add src/app/log/page.tsx
git commit -m "feat(log): /log page becomes server-side data loader for LogPageClient

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Delete /log/manual + voice-log-client.tsx + actions.ts

**Files:**
- Delete: `src/app/log/voice-log-client.tsx`
- Delete: `src/app/log/actions.ts`
- Delete: `src/app/log/manual/page.tsx`
- Delete: `src/app/log/manual/manual-entry-client.tsx`
- Delete: `src/app/log/manual/actions.ts`
- Delete: `src/components/heartnote/manual-entry/VitalsRow.tsx`
- Modify: every file that imports `/log/manual` or the deleted components

- [ ] **Step 11.1: Find references.**

```bash
grep -rn "/log/manual" src/ docs/
grep -rn "voice-log-client" src/
grep -rn "manual-entry-client" src/
grep -rn "manual-entry/VitalsRow" src/
```

- [ ] **Step 11.2: Rewrite each reference to /log.**

Search results from Step 11.1 → batch edit. `BottomNav.tsx`, `DailyPromptHero.tsx`, anywhere else linking to `/log/manual` switch to `/log`.

- [ ] **Step 11.3: Delete the orphaned files.**

```bash
git rm src/app/log/voice-log-client.tsx
git rm src/app/log/actions.ts
git rm -r src/app/log/manual/
git rm src/components/heartnote/manual-entry/VitalsRow.tsx
# manual-entry/StepperControl.tsx and SegmentedControl.tsx already moved
# in Tasks 4 + 6.
```

- [ ] **Step 11.4: Verify build is clean.**

```bash
npm run lint
npm run build
```

Expected: both pass with zero errors.

- [ ] **Step 11.5: Commit.**

```bash
git add -A
git commit -m "feat(log): delete /log/manual + voice-log-client; subsumed by unified /log

Per CLAUDE.md no-backwards-compat rule.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Update process route + edit page for schema consistency

**Files:**
- Modify: `src/app/api/voice-log/[id]/process/route.ts` (verify it accepts fatigue severity; the `apply_voice_log_extraction` RPC already takes generic JSON, so this is a verification step)
- Modify: `src/lib/voice-log/process.ts` (no fatigue prompt rewrite per R19 — verify the post-process fatigue handling doesn't strip severity if Claude ever returns it)
- Modify: `src/app/log/[id]/edit/edit-form.tsx` (fatigue 5-level + pillow_count routing per Step 8.0b)
- Modify: `src/app/log/log-page-client.tsx` (Task 9) — render the "Edit today's details" link only for voice-only rows per R13.

- [ ] **Step 12.1: Verify process route handles fatigue severity round-trip.**

Read `src/lib/voice-log/process.ts`. Look for any normalization that strips `severity` from fatigue events. If none, no change needed. Add a comment noting the schema now permits severity.

- [ ] **Step 12.2: Update /log/[id]/edit/edit-form.tsx.**

- Fatigue control: update to 5-level segmented (`null / 0 / 1 / 2 / 3 / 4` mapped to `Not present / Normal / Mild / Moderate / Severe / Can't move`). Hydrate from the row's severity column.
- Pillow count input: change from `daily_logs.pillow_count` direct write to `daily_log_readings` reading-row write. The edit form already has a per-field reading patch flow for weight/HR/SpO2; pillow_count joins that flow.

- [ ] **Step 12.3: Render "Edit today's details" link only for voice-only rows.**

Per R13: tap-session rows are continuously editable on /log itself, so the historical edit page is voice-correction only.

In `log-page-client.tsx`, render the link when:

```ts
todayLogStatus === 'complete' && todayLogIsVoice && !modalOpen
```

where `todayLogIsVoice` is true if the most-recent today's daily_logs row has `tap_session_id IS NULL`.

- [ ] **Step 12.4: activity_step_change preservation (R14).**

Voice still extracts and writes `activity_step_change`. The unified modal does NOT surface it. The engine still reads it. Verify in the new RPC `apply_log_patch_v2` that `activity_step_change` updates from the day-level patch when the modal omits it (the upsert pattern preserves prior values via `coalesce(p_day_level->>'activity_step_change', activity_step_change)`).

- [ ] **Step 12.5: Commit.**

```bash
git add -A
git commit -m "feat(log): edit page consistency — fatigue severity control

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Playwright e2e — golden path

**Files:**
- Create: `tests/e2e/log-redesign.spec.ts`

- [ ] **Step 13.1: Write the spec.**

```ts
import { test, expect } from '@playwright/test';

test.describe('/log redesign', () => {
  test('tap-only golden path: weight + pillows → save → assessment fires', async ({ page }) => {
    // Sign in via test fixture.
    // Navigate to /log.
    // Verify five vital cards visible.
    // Tap weight stepper +0.4 lb four times → 178.0 → 179.6.
    // Tap pillows stepper +1 → 1 → 2.
    // Wait 2s for autosave.
    // Verify network: POST to /api/.../save-actions or server action call.
    // Verify the page eyebrow updates ("Daily log · day N · just saved" or similar).
    // Verify daily_assessments row exists for today via direct DB read.
  });

  test('voice path: dictation fills cards with Heard pips', async ({ page }) => {
    // Mock the Deepgram client + the /api/voice-log/.../process response.
    // Tap the mic button.
    // Inject a fake transcript: "weight 182, pillows 2, ankles a little swollen".
    // Stop recording.
    // Verify weight card has Heard pip + value 182.
    // Verify pillows card has Heard pip + value 2.
    // Verify ear button is sage-filled.
    // Open modal — verify swelling=Mild + Heard pip.
  });

  test('tier-1 path: chest pain Yes → alert banner above page header', async ({ page }) => {
    // Open modal, tap "Yes" on Chest pain.
    // Within 500ms, verify the alert banner is visible at the top of the page.
    // Verify the banner reads "Highest priority — New chest pain — Call the cardiologist now."
    // Verify daily_assessments.tier === 'tier_1_911' via DB read.
  });

  test('tap during recording locks the field', async ({ page }) => {
    // Start recording.
    // Tap the weight stepper to set 175.0 manually.
    // Mock voice transcript "her weight is 200" → Claude returns 200.
    // Stop recording.
    // Verify weight card shows 175.0 (tap value), Tapped pip, NOT 200.
  });

  test('autosave failure → retry banner', async ({ page }) => {
    // Block the save action endpoint with a 500.
    // Tap weight stepper.
    // Wait 6+ seconds (1.5s debounce + 3 retries × 5s = 16.5s — bump test timeout).
    // Verify the persistent error banner is visible.
    // Restore the endpoint, tap once more, verify banner clears.
  });

  test('modal close returns to vitals view, no data loss', async ({ page }) => {
    // Open modal, set fatigue=Severe.
    // Close modal via X.
    // Reopen modal — fatigue is still Severe.
    // Verify autosave fired (DB row matches).
  });

  test('dyspnea = at rest fires tier-1 banner without yes-flag', async ({ page }) => {
    // Open modal.
    // Tap "At rest" (severity 4) on Breathing.
    // Verify alert banner appears with "Out of breath at rest".
  });
});
```

- [ ] **Step 13.2: Run the tests.**

```bash
npx playwright test tests/e2e/log-redesign.spec.ts
```

- [ ] **Step 13.3: Iterate until all pass.**

This is where most bugs surface. Patch as needed, re-run.

- [ ] **Step 13.4: Commit.**

```bash
git add tests/e2e/log-redesign.spec.ts
git commit -m "test(log): e2e — golden path, voice, tier-1, autosave, modal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Push + Vercel preview

- [ ] **Step 14.1: Push the branch.**

```bash
git push -u origin log-redesign
```

- [ ] **Step 14.2: Open the PR.**

```bash
gh pr create --title "/log redesign — vitals up front, symptoms behind a sheet" --body "$(cat <<'EOF'
## Summary

- Single unified /log page; /log/manual deleted (subsumed)
- Five vitals on the main view (weight, pillows, BP, HR, SpO2)
- 14 symptoms (8 graded + 6 yes/no red-flags) in an iOS-sheet modal behind the bottom-right ear button
- Voice fills both surfaces; tap overrides any value; tap-during-record locks the field
- Debounced autosave (1.5s); each tap-session is one daily_logs row; voice still creates its own row per dictation
- Migration: drops the fatigue-no-severity CHECK so fatigue can render a 4-level control
- Migration: adds `tap_session_id` to daily_logs for the upsert pattern
- Alert banner: tier-1 yes-flag taps surface the existing alert chip system above the page header

## Test plan
- [ ] Tap-only golden path: weight + pillows → save → assessment fires
- [ ] Voice path: dictation fills cards with Heard pips
- [ ] Tier-1 path: chest pain Yes → alert banner above page header
- [ ] Tap during recording locks the field
- [ ] Autosave failure → retry banner
- [ ] Modal close → no data loss
- [ ] dyspnea=at-rest fires tier-1 banner

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 14.3: Wait for Vercel preview URL.**

```bash
gh pr checks --watch
```

When checks pass, GitHub will post a Vercel preview URL on the PR. Capture it for the user.

- [ ] **Step 14.4: Report the preview URL to the user.**

This is the gate — DO NOT merge. The user wants to visually review the preview before any merge.

---

## Acceptance criteria

### Engineering — always include

- [ ] Plan stated (this document) and approved before any code is written.
- [ ] No new abstractions added unless the task requires them. The new components (VitalCard, SymptomGradedCard, etc.) are required by the unified page; nothing else is.
- [ ] Diff scoped to /log + /log dependencies + the two migrations. No unrelated formatting.
- [ ] All ACs verifiable by running the Playwright spec or manual verification steps.

### Functional — happy path

- [ ] When the caregiver opens /log and nothing has been logged today, the page header reads "Voice log · day N — Nothing logged yet today." with subhead "Speak once and the vitals fill themselves — or tap any card. Symptoms live behind the listener button at the bottom-right." (Verbatim from mockup phone 3.)
- [ ] Each vital card renders with status dot · label · context-line · stepper-control · helper. Default state is muted with yesterday's value pre-filled (or "—" if no prior reading). Tapping the stepper marks the card with the warn-line corner pip "Tapped" within 100ms (DOM `data-state="tapped"` attribute toggles).
- [ ] Tapping the mic button transitions the page `data-status="recording"` within 200ms. The transcript card appears below the page header, the cards become eligible to fill from voice. Voice-filled cards toggle to `data-state="heard"` with the sage corner pip "Heard".
- [ ] Tapping the ear button opens the symptom modal as a slide-up sheet within 300ms (CSS transition end). Closing via X or drag-down-from-grip dismisses; `data-modal-open="false"` on the page wrapper.
- [ ] Tapping "Yes" on chest pain, fainted, or bluish lips surfaces the alert banner above the page header within 1500ms on a typical 4G connection. (Round-trip is: zod parse → upsert daily_logs → apply_log_patch_v2 RPC → evaluateAlertTier → upsert daily_assessments → revalidatePath → router.refresh → re-render. 1500ms is the realistic budget; the immediate-tier-1 path bypasses the 1.5s debounce.)
- [ ] **(R1)** When voice is recording AND the caregiver taps a card, the tapped value persists immediately (debounced save) and the card stays `data-state="tapped"` after voice-stop. Voice extraction for that field is dropped, not merged. Verifiable: after stop, the card's value matches the tapped value; the network panel shows the autosave POST happened during recording.
- [ ] **(R2)** When the modal is open and the caregiver taps mic, the modal closes within 200ms. Recording starts on the vitals view.
- [ ] **(R3)** When the caregiver taps mic with a dirty (un-flushed) tap-session, the autosave debounce is cancelled and a synchronous flush fires before the voice row is created. Verifiable: the voice row's `created_at` timestamp is later than the tap-session row's `updated_at`. If the flush fails, recording does NOT start; an error toast appears.
- [ ] **(Modal close flush)** Closing the modal cancels the 1.5s debounce and flushes any dirty symptom edits synchronously. Verifiable: a tap on fatigue immediately followed by modal-close produces ONE save action POST, not zero.
- [ ] **(Un-trigger banner)** Tapping "Yes" on chest pain shows the banner; tapping "No" within 5s clears the banner within 1500ms. Verifiable: `daily_assessments.tier` transitions tier_1_911 → tier_4_log; banner DOM unmounts.
- [ ] **(Ear button glow)** The ear icon swaps to its sage-deep filled variant when ANY symptom in state has been touched by voice (one or more `daily_log_symptom_events` rows for today with `source_log_id = <today's voice row>`). Tap-only symptoms do NOT glow the ear. Modal-open state is independent.
- [ ] **(Card state lifecycle)** A card cycles `muted → tapped` on first tap; `tapped → muted` if the caregiver clears back to the seeded default value (the trailing X clears state AND the value); `muted → heard` when voice writes; `heard → tapped` if the caregiver taps after voice; `→ alert` when a tier-1 condition is true for that field (e.g., dyspnea=4 OR chest_pain=true). Verifiable: the `data-state` attribute on each card matches expected after each transition.
- [ ] **(Conditional sputum card)** Sputum card renders ONLY when `cough != 'none'`. If the caregiver taps cough=daytime → sputum=White → cough=none, sputum DOES NOT render and its prior value is cleared from the symptom_event row on next save (single source of truth).
- [ ] After 1.5s of no taps, the page autosaves. Network panel shows one server-action POST. Subsequent taps within the same session UPDATE the same daily_logs row (verified by stable `daily_logs.id` across the requests' response payloads).

### Edge cases

- [ ] First-time user (no prior logs): all vital steppers show "—" placeholder; helper text says "First reading — tap to log." Pillows seeds from `patients.normal_pillow_count`.
- [ ] Returning user, has logged earlier today: vital cards hydrate from today's most recent values with the appropriate corner pip per source.
- [ ] User opens /log on a day where yesterday's row has values but today is blank: muted defaults show yesterday's values; the source line at the bottom reads "0 vitals captured today".
- [ ] User taps a vital, then immediately starts recording: pending tap-session flushes BEFORE the voice row is created (verifiable: voice row's `created_at` is later than the tap-session row's last `updated_at`).
- [ ] User opens modal, closes, then opens again: defaults are stable; nothing was committed.
- [ ] User on day 1 (cold-start): helper text omits trend phrases ("4.4 lb in 14 days"); just shows the value or the absolute calm/watch threshold.
- [ ] Patient with `normal_pillow_count = 0` (caregiver said "she sleeps flat" at onboarding): pillows stepper seeds at 0; helper text reads "Held at 0 for the past week."
- [ ] Browser paste of "184 lb" (text with units) into the weight stepper: the input strips non-digits + decimal, accepts 184; clears state on paste of pure non-numeric. Validation runs client-side (no zod hit until autosave).
- [ ] User clears a tapped value back to the seeded default via the trailing X: the card returns to `data-state="muted"`; the next autosave includes a delete-this-reading action (`field` omitted from the patch's `vitals` block, server treats as "no longer tapped this field"). Engine recomputes without the cleared value.
- [ ] Voice extracts `cognition_change=severe` (severity 4): the modal opens with cognition state hydrated, but the segmented control omits the "severe" option (modal renders only Clear/Mild fog/Confused). Severity-4 surfaces via the alert banner instead. No render error; no lost data.
- [ ] Voice extracts `swelling` with no `severity` (legacy/incomplete extraction): page renders the swelling card in `heard` state with severity null; helper text says "Swelling reported — severity unknown. Tap to specify."
- [ ] Two devices same caregiver: phone autosaves session-A row, tablet autosaves session-B row. Most-recent timestamp wins for hydration. Engine fires on whichever set of fields landed last. **Accepted limitation pre-launch (R18).** No optimistic-concurrency token in v1.
- [ ] User opens /log, taps `Yes` on chest pain, taps `No` immediately (fat-finger correction): banner appears then clears; final assessment row has tier_4_log. No stuck banner.
- [ ] Modal `dyspnea=4 (At rest)` AND `chest_pain=Yes` both true: both alert banners stack (R5).
- [ ] Empty transcript on voice stop (caregiver said nothing for 30s): existing voice-log error path runs ("We didn't catch anything — try again."). No daily_logs row left in pending state.

### Error states

- [ ] Mic permission denied: existing voice-log error path triggers — error card shown, retry button works.
- [ ] Network drop during voice: existing reconnect-once-budget kicks in. After 2 drops, "Connection lost — saving what you said." banner.
- [ ] Autosave action fails (500): toast "Couldn't save — retrying" appears, dirty patch retained in memory, retry at 5s + 10s + 20s (exponential backoff, capped at 3 attempts). After 3 failures, persistent banner "Couldn't save your changes — try again." with a Retry button.
- [ ] Offline detected (`navigator.onLine === false`): autosave queues; debounce timer paused. On `online` event, autosave fires once with the most recent patch (not all queued patches — coalesce). Banner reads "Offline — saved when you reconnect."
- [ ] Validation rejection (weight > 700, sys ≤ dia, severity outside 0-4): server action returns `{ ok: false, error: <specific> }`. Client shows inline error on the card; the offending field reverts to its prior value (so the next debounce doesn't keep retrying invalid input). For BP, the error is "Systolic must be higher than diastolic."
- [ ] Mic press while flush in flight: the click handler awaits the in-flight flush promise before calling `flushAndStartVoice`. If the in-flight flush fails, recording does NOT start; toast surfaces.
- [ ] User backgrounds the tab during recording: existing wake-lock + visibilitychange path triggers `stopRecording('Screen turned off — saving what you said.')`. The new client preserves this exact behavior (verbatim lift; tested in Playwright via `page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))`).
- [ ] Concurrent saves from same device (rare double-tap edge): the unique partial index on `daily_logs(patient_id, log_date, tap_session_id)` makes the second insert collide; the upsert resolves to update.
- [ ] User taps an inert "+0.2" button when the value is already at the max (700 lb): button is `disabled`, no save fires.

### Performance

- [ ] Tap → visible state change within 100ms (paint after debounced React state update).
- [ ] Tap → autosave network round-trip within 1.5s (debounce) + 800ms (action) = 2300ms p95 on a typical 4G connection.
- [ ] Mic press → recording state within 200ms (mic permission already granted).
- [ ] Tier-1 alert tap (yes-flag) → banner visible within 1500ms p95 (immediate-save bypasses 1.5s debounce, full chain in this budget).
- [ ] Voice extraction → vitals + symptom hydration within 4s p95 (existing process route latency, unchanged).
- [ ] Modal open → fully rendered within 300ms (CSS slide-up transition + scroll lock).
- [ ] Modal close → flush + close within 500ms (synchronous flush of dirty patch + transition).

### Persistence

- [ ] Tap-session creates one new daily_logs row per session (`tap_session_id` distinguishes from voice rows where `tap_session_id IS NULL`).
- [ ] Voice creates one daily_logs row per dictation (unchanged behavior).
- [ ] Readings + symptom_events are upserted via the existing `apply_voice_log_extraction` RPC for both paths.
- [ ] Refreshing the page hydrates the most recent values per vital + symptom from `daily_log_readings` + `daily_log_symptom_events` (no client-side staleness).
- [ ] daily_assessments has at most one row per (patient_id, log_date), upserted on every save.

### Permissions / RLS

- [ ] Every new table column (`daily_logs.tap_session_id`) inherits the existing RLS policies on the table (caregiver-owns-patient).
- [ ] Server actions verify `patient.caregiver_id === user.id` before any write.
- [ ] No client-side bypass: the autosave action never trusts `payload.patientId` if provided — it always re-derives from `auth.getUser()` + the caregiver-owned patient lookup.

### Side effects

- [ ] Each save:
  - Upserts the daily_logs row keyed by (patient_id, log_date, tap_session_id) — UPDATE if existing, INSERT if first save in the session.
  - Atomically (inside `apply_log_patch_v2` RPC) deletes prior readings + symptom_events for `source_log_id = <this row>` and inserts the new ones, then updates day-level fields on the row.
  - Re-evaluates the alert engine over today's full data (not just this session's row).
  - Upserts the daily_assessments row by (patient_id, log_date).
  - Inserts an `alerts` row for tier ≠ tier_4_log (re-uses the existing pattern from manual/actions.ts).
  - Revalidates `/dashboard` and `/log`.

### Accessibility

- [ ] Modal opens: focus moves to the modal close button. ESC closes the modal (synchronous flush). Click outside the modal grip area does NOT close the modal (prevents accidental dismissal mid-tap).
- [ ] Steppers carry `aria-label="Decrement <field name>"` / `Increment <field name>"` per `.claude/rules/canonical-controls.md` register #5.
- [ ] Trailing X clear button has `aria-label="Clear <field name>"` per register #1.
- [ ] Ear button announces state change via `aria-live="polite"`: "Symptom heard from voice" when transitioning to the glow state.
- [ ] Color is never the only signal — every state (muted/heard/tapped/alert) has a corner-pip text label ("Heard", "Tapped", "Alert"). Helper text tone (calm/watch/urgent) carries text content, not just color.
- [ ] Modal has `role="dialog"` + `aria-modal="true"` + `aria-labelledby="modal-title"` pointing at the "Today's symptoms" header.

### Manual verification

1. Sign in as a test caregiver with a patient.
2. Navigate to /log. Page renders with the muted default state.
3. Tap the weight stepper +0.2 lb three times. Within 1.5s, network panel shows the save action POST.
4. Reload the page. Weight reads the saved value, with "Tapped" corner pip.
5. Tap the ear button. Modal slides up. Tap "Yes" on chest pain. Modal stays open; the alert banner appears at the top of the underlying view (dim through the modal backdrop).
6. Close modal. Banner is now fully visible.
7. Tap the mic. Modal closes (per R2). Recording starts.
8. Speak: "Her weight was 184, pillows tonight is two, ankles look puffy." Stop recording.
9. After ~3s, weight reads 184 with "Heard" pip; pillows reads 2 with "Heard"; modal swelling card shows Mild.
10. The "Tapped" corner pip on weight stays — voice did NOT override the tapped value (per R1). Weight reads the tapped value (178.6), not 184. The transcript card shows the verbatim "her weight was 184" but the card's stored value is 178.6. Verify: the most recent `daily_log_readings` row for `field='weight_lb'` today has the tapped value, not the voice value.

(Step 10 is the regression check for the tap-during-record-locks-the-field rule. If it fails, file a bug.)

11. Production migration step: after the PR merges, the assistant runs `supabase db push` against production immediately. Per memory `feedback_execute_migrations`, this is the assistant's job, not the user's.

---

## Self-review

### Spec coverage check

- ✅ Five vitals up front — Tasks 4, 5, 9 (vital cards + steppers + page composition)
- ✅ Symptoms behind a sheet — Tasks 6, 9 (modal + page composition)
- ✅ Voice fills both surfaces — Task 9 (LogPageClient extraction integration)
- ✅ Tap overrides — Task 9 (state='tapped' wins over claudeTiles)
- ✅ Bottom bar (mic + ear) — Task 7
- ✅ Transcript card — Task 7
- ✅ Alert banner above page — Task 7 (lifted from voice-log-client.tsx)
- ✅ Card states (muted/heard/tapped/alert) — Task 4 (VitalCard `state` prop)
- ✅ Helper text tones (calm/watch/alert) — Task 2 (helper-text resolver)
- ✅ Conditional sputum question — Task 6 (SymptomsModal renders SymptomGradedCard for sputum only when cough != 'none')
- ✅ Migration for fatigue severity — Task 1
- ✅ Migration for tap_session_id — Task 8.0
- ✅ Delete /log/manual — Task 11
- ✅ Playwright e2e — Task 13
- ✅ Vercel preview gate — Task 14

### Placeholder scan

Searched for: TBD, TODO, "implement later", vague verbs in ACs. Found: zero placeholders. Some helper text copy is still elided ("...") in Task 2 Step 2.3 and Task 9 Step 9.x — those are intentional reference points, not placeholders, and Task 2's tests cover the contracts.

### Type consistency

- `SaveLogPatch` shape (Task 8) drives both the client autosave call AND the server action validation. Same single source.
- `LogPageContext` (Task 3) drives both the client hydration AND the page header text decisions. Same single source.
- Vital card states (`VitalCardState`) and tones (`Tone`) are imported from one place and used in every card variant.

### Out of scope

The following are NOT in this plan; if reviewers want them, they're separate plans.

- Trend pages (the trend mockup at `docs/design/heartnote-vitals-trends.html` is a different surface).
- Three-state med rows (the mockup design references PR 2 / med rows; that's its own plan).
- LLM-reasoning v0.5 layer changes (helper text uses the rules engine + `helper-text.ts` resolver; no LLM call from /log).
- Visit prep, family share, etc.

---

## Execution handoff

After plan approval, the workflow is:

1. **Plan-review subagent** (per `.claude/rules/feature-workflow.md`) — fresh context, reviews this doc + the rule files. Report findings.
2. **Patch the plan** based on review findings.
3. **Implement** via `superpowers:subagent-driven-development` (recommended; one fresh subagent per task) or `superpowers:executing-plans` (inline batch).
4. **Code-review subagent** after implementation — fresh context, reviews the diff.
5. **Patch** code per review findings.
6. **Push branch + open PR** (Task 14).
7. **Wait for Vercel preview URL** — DO NOT MERGE. User reviews visually.
