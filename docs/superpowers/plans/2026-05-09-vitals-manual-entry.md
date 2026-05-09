# Plan — Manual vitals entry (`/log/manual`) — 2026-05-09

> Status: PLAN v2 — revised after plan-review subagent. Ready for implementation.
>
> Companion handoff: `docs/superpowers/handoffs/2026-05-09-vitals-manual-entry-pending.md` §3 (locked decisions), §5 (schema mapping), §8 (hard do-nots).

## 1. What the caregiver sees (plain English)

When the caregiver can't dictate (quiet room, mom asleep, baby on the hip, just doesn't feel like talking), they tap a small "fill it in instead" link under the home-screen mic hero. That opens a five-card screen:

- **Weight** — minus / value / plus stepper.
- **Swelling** — five-button row (None / Mild / Moderate / Severe / Whole body). When anything but None is picked, two more controls appear underneath: a four-button "where" row (Ankles / Calves / Thighs / Abdomen) and a "Clears overnight" checkbox.
- **Breathing** — five-button row (Normal / Stairs / Flat walk / ADLs / At rest).
- **Pillows** — minus / value / plus stepper.
- **Cough** — three-button row (No cough / Daytime / Nocturnal).

They fill any subset and tap Save. Untouched cards write nothing. Save runs the same alert engine the voice log triggers, then sends them to the dashboard. If the screen comes up while a voice log is mid-processing, Save fails closed with "Voice log still processing — try again in a moment." Save is disabled until at least one control is touched (no quiet no-op).

If breathing is set to "At rest / can't finish sentences," the dashboard fires a Tier-1 911 alert on next render — same as the voice path. The 911 escape hatch must work whether the caregiver speaks or taps. Plain-English: "When mom is gasping for air and can't finish a sentence, the home screen turns red and tells the caregiver to call 911 — whether they spoke it or tapped it."

## 2. Why this is overdue (research grounding)

The product has shipped voice-log + dashboard but no tap-only path. Caregivers in research §10 (pain taxonomy) #5 and #8 already do paper-and-Post-it tracking; manual entry is the on-ramp for moments voice doesn't fit. Research §13 #4 names "too much manual entry" as the abandonment risk — the screen has to be five cards, no menus, no extra screens.

The body region of swelling is the documented decompensation progression (`research/chf-source-of-truth.md` §5: "Peripheral edema (ankles → calves → abdomen)"). The "clears overnight" flag is the §2 Tier 3 evening-only-swelling discriminator and is read by `evaluate.ts` rule T3.3. Skipping either field in manual entry would cause the manual path to over-fire T2.6 (call cardiologist today) on swelling cases that voice would correctly route to T3.3 (call within 48 hrs) — a clinical-fidelity bug, not a UI shortcut.

## 3. Locked decisions (already approved)

From handoff §3 + 2026-05-09 chat + plan-review v2 resolutions:

| # | Decision |
|---|---|
| L1 | Swelling segmented = 5 buttons. Whole body / abdomen → severity 4. Cited: research §2 Tier 2 "New or markedly worsened peripheral/abdominal swelling" (chf-source-of-truth.md:48). Severity 4 fires T2.6, NOT T1 (anasarca is tier-2). |
| L2 | Breathing segmented = 5 buttons. At rest → severity 4 → fires T1.1 (911). |
| L3 | Cough is single-select. Nocturnal stores `present=true, nocturnal=true`. Daytime stores `present=true, nocturnal=false`. No cough stores `present=false, nocturnal=null`. |
| L4 | Only write rows for fields the caregiver actually touched. |
| L5 | Body region of swelling captured (4-button row: Ankles / Calves / Thighs / Abdomen). Stored on `daily_log_symptom_events.body_region` (free text, lowercase). Region row only renders when severity ≥ 1. |
| L6 | "Clears overnight" checkbox captured for swelling. Stored on `daily_log_symptom_events.resolves_overnight` (bool). Checkbox only renders when severity ≥ 1. DB CHECK constraint already enforces swelling-only. |
| L7 | Entry point = inline "fill it in instead" link under DailyPromptHero. Sage-deep underlined link register. |
| L8 | "Explicit None/Normal" for graded symptoms (dyspnea, swelling) stores `present=true, severity=0` — matches `extract.ts` SWELLING/DYSPNEA anchors. (Plan v1 said `present=false, severity=null`; corrected.) Cough "No cough" stays `present=false` (cough is binary). |
| L9 | Each manual save creates a NEW `daily_logs` row (no source column exists; multiple rows per day are explicitly supported by the schema — `20260501041617` dropped the `(patient_id, log_date)` UNIQUE). The new row carries the manual save's pillow_count if touched. |
| L10 | `recorded_at` for inserted readings/events = RPC default `now()`. Manual entry is a primary observation at the moment the caregiver taps Save, not an edit of a prior dictation. (Distinct from `saveLogEdit`'s `log.created_at` convention, which exists because that path is editing a dictation timestamp.) |
| L11 | Save button is **disabled** until ≥1 control is touched. No quiet no-op. |
| L12 | Fail-closed guard checks `processing_status IN ('pending', 'analyzing')` — both states block. Verified enum values: `('pending', 'analyzing', 'complete', 'failed')`. |

## 4. Schema verification (no migrations needed)

Verified against current migrations:

- `daily_log_symptom_events.body_region` — free-text column. Added in `20260501041617_voice_log_multi_readings.sql`. RPC `apply_voice_log_extraction` already accepts it.
- `daily_log_symptom_events.resolves_overnight` — `boolean`, CHECK constraint `daily_log_symptom_events_resolves_overnight_swelling_only` enforces NULL or `symptom='swelling'`. Added in `20260506100000_phase_0_schema_gaps.sql`.
- `daily_log_symptom_events.symptom` CHECK list — closed. Manual entry uses 3 values: `dyspnea`, `cough`, `swelling`. (Pillows is on `daily_logs`.)
- `daily_log_symptom_events.severity` CHECK — 0–4. Manual entry uses all five values for dyspnea + swelling.
- `daily_log_readings.field` — manual entry only writes `weight_lb` in PR 1. Range bounds (50–700 lb) imported from `src/lib/clinical/reading-ranges.ts` `READING_RANGE` per `code-quality.md` rule 1 (no re-stated bounds in Zod).
- `daily_logs.pillow_count` — `smallint`. Bounds [0, 10] (Zod, matching `saveLogEdit:78`). UI soft-cap at 6 is fine but the Zod boundary uses 10 for parity.
- `daily_logs.processing_status` — enum `(pending, analyzing, complete, failed)`. Verified at `20260430212436:30`.
- `daily_logs` has **no** `source` column. Plan v1 mentioned this; v2 drops the claim.

**No new migration required.** If implementation surfaces a schema gap, that's a stop-and-flag, not a quiet add.

## 5. Storage map (caregiver tap → row)

| Caregiver tap | Storage |
|---|---|
| Weight stepper at 182.4 | INSERT `daily_log_readings (patient_id, log_date, recorded_at=DEFAULT now(), field='weight_lb', value=182.4, source_log_id=<new daily_logs.id>)`. |
| Swelling = Mild + Region = Ankles + Clears = checked | INSERT `daily_log_symptom_events (symptom='swelling', present=true, severity=1, body_region='ankles', resolves_overnight=true, recorded_at=DEFAULT now(), source_log_id=<new daily_logs.id>)`. |
| Swelling = None | INSERT `daily_log_symptom_events (symptom='swelling', present=true, severity=0, body_region=null, resolves_overnight=null, ...)`. (L8: explicit None = present=true, severity=0 to match extract.ts anchor.) |
| Swelling untouched | No row written. |
| Breathing = Stairs | INSERT (`symptom='dyspnea', present=true, severity=1`). |
| Breathing = Normal | INSERT (`symptom='dyspnea', present=true, severity=0`). |
| Breathing = At rest | INSERT (`symptom='dyspnea', present=true, severity=4`) → T1.1 fires. |
| Cough = Nocturnal | INSERT (`symptom='cough', present=true, nocturnal=true`). |
| Cough = Daytime | INSERT (`symptom='cough', present=true, nocturnal=false`). |
| Cough = No cough | INSERT (`symptom='cough', present=false, nocturnal=null`). |
| Pillows stepper at 2 | New `daily_logs` row carries `pillow_count=2`. Engine's `firstNonNull` (evaluate.ts:723) reads the latest non-null pillow_count across rows ordered by `created_at` desc — so the manual save's value wins on next render. |

**Save flow:**

1. Read all current `daily_logs` rows for `(patient_id, log_date=today)`. If ANY row has `processing_status IN ('pending', 'analyzing')`, return `{ ok: false, error: 'Voice log still processing — try again in a moment.' }`. Form preserves selections.
2. INSERT a new `daily_logs` row: `(patient_id, log_date=today, processing_status='complete', pillow_count=<touched-or-null>, appetite_change=null, urine_output_change=null, activity_step_change=null, notes=null, transcript=null)`. Capture the new row's id as `manualLogId`.
3. Build `readings[]`, `symptom_events[]`, `day_level{}` from touched fields only. Note: `day_level.pillow_count` is now redundant with step 2 (already on the row), so day_level is `{}` for all manual saves. The RPC's coalesce on day-level is a no-op when fields are absent.
4. Call `apply_voice_log_extraction(manualLogId, readings, symptom_events, day_level)` RPC. The RPC (`20260506100000:134-192`) inserts readings + symptom_events with `recorded_at=DEFAULT now()`, which is exactly what L10 wants.
5. Run `evaluateAlertTier(supabase, patient_id, log_date)`, upsert `daily_assessments`. If actionable tier (not `tier_4_log`) and triggers non-empty, generate alert reasoning + insert into `alerts` (mirror `src/app/log/[id]/edit/actions.ts:218-268` exactly — no new branching logic).
6. `revalidatePath('/dashboard')`. Redirect to `/dashboard`.

## 6. New canonical control register (5th)

`.claude/rules/canonical-controls.md` currently documents 4 registers. The screenshot's Section A introduces a 5th: white-circle stepper for numeric increment/decrement. Add it as a new top-level section.

**Pattern (5th register — Numeric stepper):**

- Two sub-buttons: minus, plus. Value-chip in the middle.
- Each sub-button: white circle, 36×36 hit target. Glyph: `Minus` / `Plus` lucide, size 16, strokeWidth 2.5, `text-foreground`.
- Value chip: `inline-flex items-center justify-center min-w-[80px] h-9 rounded-full bg-card border border-border text-base tabular-nums`.
- Press scale: `active:scale-[0.94]`. No bounce.
- aria-labels: `Decrement {field}`, `Increment {field}`.
- **Clear is NOT a stepper sub-button.** When the field has a non-default value, render a separate trailing X using **register #1** (size 14, `text-muted-foreground`, 32×32 hit area). This avoids two visually-different X registers across the app. Pre-launch: this resolves the v1 plan-review collision.

**When to use:** numeric increment/decrement of a single value (weight, pillow count). Distinct from the 4 existing registers (clear-X / list-row coral-minus / list-row sage-plus / entity-delete typed-confirm).

## 7. Files

### New

| Path | Role |
|---|---|
| `src/app/log/manual/page.tsx` | Server component. Loads patient + today's snapshot + baseline context. Renders client form. |
| `src/app/log/manual/manual-entry-client.tsx` | Client form. Local state for 5 cards. Save calls server action. |
| `src/app/log/manual/actions.ts` | Server action `saveManualVitalsEntry(input)`. Zod-validated (using `READING_RANGE` import). Insert new daily_logs row → call apply_voice_log_extraction → re-eval engine → revalidate. |
| `src/components/heartnote/manual-entry/SegmentedControl.tsx` | Reusable 3-, 4-, or 5-button segmented register. Sage-deep selected pill, ink-soft unselected. |
| `src/components/heartnote/manual-entry/StepperControl.tsx` | Reusable white-circle minus / value / plus per the new 5th register. Optional trailing register-#1 X for clear. |
| `src/components/heartnote/manual-entry/VitalsRow.tsx` | Single chassis (sage dot + UPPERCASE label · right-aligned secondary · control · helper text). |

### Modified

| Path | Change |
|---|---|
| `.claude/rules/canonical-controls.md` | Add §5 "Numeric stepper" register with the rules in plan §6. Reference implementation: `StepperControl.tsx` once shipped. |
| `src/components/heartnote/DailyPromptHero.tsx` | Add small "fill it in instead" link below the mic hint. Sage-deep underlined link register. Routes to `/log/manual`. |

### Auth-sessions verification

- `/log/manual` is authenticated but not auth-state-changing → no `Cache-Control: no-store` header required (auth-sessions rule 1 doesn't apply).
- Sign-out affordance: bottom nav exposes `/me` (BottomNav.tsx:41), and `/me` exposes Sign out (`me/page.tsx:149`). From `/log/manual`, sign-out is reachable in 2 taps. Satisfies rule 3.

### Out of scope (do not touch)

- `/me/medications/_flow/*`, `/me/medications/scan/*`, `/me/medications/[id]/*` — restricted by `project_medications_wizard_parallel_work` memory.
- `TodaysMedsCard.tsx` / `TodaysMedsList.tsx` — Section B of the screenshot is PR 2, separate plan.
- `daily_log_readings` for HR / SpO2 / BP — out of scope until separate spec.
- Cough `sputum_color` (pink/white frothy → T1.2 911) — voice-only in v1. Caregivers seeing frothy sputum are calling 911 anyway, not opening a tap form. Flagged here so the omission is visible.
- Helper-text data ("vs. baseline N lb", "Up from 1 last week") — handoff §6 mentioned these; v1 ships the controls without computed helpers. Add in a small follow-up after v1 lands.
- Charts / graphs — PR 3, blocked on user-supplied design spec.

## 8. Acceptance criteria (full template per `.claude/rules/acceptance-criteria.md`)

### Engineering

- [ ] Plan stated and approved before any code (this doc).
- [ ] Plan-review subagent run before implementation (done; v2 reflects findings).
- [ ] No new tables, no new severity values, no new symptom enum values, no new migration files.
- [ ] No new clinical constants outside `src/lib/clinical/`. Weight bounds imported from `READING_RANGE` (`src/lib/clinical/reading-ranges.ts`); no inline 50/700 in Zod.
- [ ] Diff scoped to manual-entry surface + 5th canonical register doc. No drive-by refactors elsewhere.
- [ ] Code-review subagent run before push.

### Functional — happy path

- [ ] Opening `/log/manual` on a fresh today renders all 5 cards with no controls pre-selected. Save button is disabled (visually + actually unfocusable / aria-disabled).
- [ ] Tapping `Mild` on Swelling reveals body-region row (4 buttons) and "Clears overnight" checkbox below. Save button enables.
- [ ] Selecting `Ankles` and checking the box, then Save: a new `daily_log_symptom_events` row exists with `symptom='swelling', present=true, severity=1, body_region='ankles', resolves_overnight=true, source_log_id=<new daily_logs.id>`.
- [ ] Setting Swelling back to `None` after picking Mild hides the region row + checkbox. Save writes one swelling row with `present=true, severity=0, body_region=null, resolves_overnight=null` (per L8).
- [ ] Tapping `+` on the Weight stepper to 182.4 then Save inserts a new `daily_log_readings` row with `field='weight_lb', value=182.4, source_log_id=<new daily_logs.id>`.
- [ ] Tapping `+` on Pillows stepper to 2 then Save: the new `daily_logs` row created by the action carries `pillow_count=2`. On next dashboard render, `firstNonNull` picks 2 as today's pillow_count.
- [ ] Tapping `At rest / can't finish sentences` on Breathing then Save inserts a symptom_events row with `severity=4`. Plain-English: the dashboard then shows a red "CALL 911" hero card with a `tel:911` button. Verifiable: `daily_assessments.tier === 'tier_1_911'` and HeroAlertCard renders the 911 register.
- [ ] Tapping `Daytime` on Cough then Save inserts symptom_events row with `present=true, nocturnal=false`.
- [ ] Tapping `Nocturnal` on Cough then Save inserts symptom_events row with `present=true, nocturnal=true`.
- [ ] Tapping `No cough` on Cough then Save inserts symptom_events row with `present=false, nocturnal=null`.
- [ ] After Save, caregiver lands on `/dashboard` with the dashboard reflecting the new data on first render (no stale tier).

### Edge cases

- [ ] Caregiver fills only Pillows → only the new `daily_logs` row is created with `pillow_count` set. No symptom_events rows. No `daily_log_readings` rows.
- [ ] Voice log earlier today inserted swelling=Mild (severity=1) row. Caregiver opens manual at 7pm and picks Swelling=Moderate → a NEW symptom_events row is appended with severity=2. Morning's row is untouched. Engine sees both events.
- [ ] No `daily_logs` row exists for today → manual save creates the first one.
- [ ] Today already has a manual `daily_logs` row → manual save creates a SECOND one. Engine reads first-non-null pillow_count across both, ordered by `created_at` desc, so the latest manual save wins on display.
- [ ] Today's `daily_logs.processing_status IN ('pending', 'analyzing')` for any row → server action returns `{ ok: false, error: 'Voice log still processing — try again in a moment.' }`. Form preserves caregiver's selections. No rows written.
- [ ] Network failure on Save → form preserves all selections, displays "Couldn't save — try again."
- [ ] Caregiver navigates away from `/log/manual` without saving → no rows written.

### Error states

- [ ] Out-of-range Weight (<50 or >700 lb per `READING_RANGE.weight_lb`) → Zod rejects at server-action boundary, returns field-level error. UI shows "Weight must be between 50 and 700 lb."
- [ ] Out-of-range Pillows (<0 or >10) → Zod rejects.
- [ ] Auth expired mid-session → server action returns `{ ok: false, error: 'Not signed in.' }`, client redirects to `/login` (existing pattern in `saveLogEdit`).
- [ ] RLS rejects insert (e.g., forged patient_id) → 500 with structured log; user sees generic "Couldn't save" error.
- [ ] Engine re-eval throws after rows are written → action returns error but rows are persisted (consistent with `saveLogEdit:269-274`). Caregiver sees error; dashboard catches up on next render.

### Performance

- [ ] Page renders in ≤2s on 4G. Server fetches snapshot+baseline using existing cached helpers (`getTodaySnapshot`, `getBaselineContext` in `src/lib/vitals/`).
- [ ] Save action returns in ≤1s for typical 1–5 row write.

### Persistence

- [ ] All writes go through `@/lib/supabase/server` per CLAUDE.md build convention #2.
- [ ] All caregiver-touched fields persist; refreshing `/dashboard` after save shows the new data.

### Permissions / RLS

- [ ] RLS policies on `daily_log_readings`, `daily_log_symptom_events`, `daily_logs` already cover `caregiver_id = auth.uid()` writes via patient ownership. Verified by reading the most recent migration that touches each table before wiring inserts.
- [ ] Server action verifies `patient.caregiver_id === user.id` before any write — same belt-and-suspenders pattern as `saveLogEdit:114-120`.

### Side effects

- [ ] Engine re-evaluation runs on Save. `daily_assessments` row upserted for today (mirror `saveLogEdit:222-237`).
- [ ] If actionable tier + non-empty triggers: alert reasoning generated and `alerts` row inserted (mirror `saveLogEdit:243-268`).
- [ ] `revalidatePath('/dashboard')` so home re-renders with new tier on next visit.
- [ ] No other code paths affected (no test changes, no migration changes, no other route changes beyond the DailyPromptHero link).

### Manual verification (under 2 minutes)

1. Open production at `/log/manual` for a test patient with no logs today.
2. Pick Swelling=Mild, Region=Ankles, Clears-overnight=checked. Pick Weight=182.4. Save.
3. Land on `/dashboard`. Expect VitalsListCard's swelling row at "watch"-tier and weight row showing 182.4. Expect tier on hero to be `tier_3_48hr` (T3.3 fired because resolves_overnight=true + severity=1).
4. Re-open `/log/manual`. Pick Breathing=At rest. Save.
5. Land on `/dashboard`. Expect HeroAlertCard at tier_1_911 with "CALL 911" eyebrow and `tel:911` Phone CTA.
6. Re-open `/log/manual`. Verify Save button is disabled. Tap Mild then back to None on Swelling (one touch counts as touched). Verify Save button enables. Save. Verify dashboard updates.

## 9. Decisions made by plan-review (was: open questions)

All four open questions from plan v1 are resolved in the locked decisions table (§3 L8–L11). Summary:

| Question | Resolution | See |
|---|---|---|
| "Explicit None" shape | `present=true, severity=0` for graded; `present=false` for binary cough | L8 |
| `recorded_at` strategy | RPC default `now()` (manual is primary, not edit) | L10 |
| Find-or-create predicate | Always create a NEW `daily_logs` row per manual save | L9 |
| Save with no changes | Disabled button, no quiet no-op | L11 |

## 10. Out-of-scope (next plans)

- PR 2 — Three-state medication row (separate plan, references handoff §6 Section B).
- PR 3+ — Charts/graphs and additional pages — blocked on user-supplied design spec (user is creating mockups).
- Sputum_color manual capture — voice-only in v1; flagged for revisit if caregivers report missing it.
- Helper-text computations (delta-from-baseline, "Up from N last week") — small follow-up after v1.
