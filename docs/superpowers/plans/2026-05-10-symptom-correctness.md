# Symptom modal correctness — audit + fixes

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix correctness drift between the just-shipped /log symptom modal and (a) the extraction schema in `src/lib/voice-log/extract.ts`, (b) the alert engine in `src/lib/alerts/evaluate.ts`, and (c) `research/chf-source-of-truth.md`. Visual + chassis are correct as shipped — do not touch the Card / NumberChip / SegmentedControl / StepperControl / DualStepperControl primitives or the Fraunces / cream-card / sage-mist visual register.

**Architecture:** Surgical edits only. Eight files touched. No new components, no new abstractions, no schema changes. One existing constant gets imported from `src/lib/clinical/thresholds.ts` instead of being hardcoded; eight copy/label/variant tweaks; one missing column added to a Supabase select; one count helper rewritten.

**Tech Stack:** Next.js 16 App Router · TypeScript · Tailwind 4 · Supabase. Existing tests in `src/lib/alerts/evaluate.test.ts` (48 tests; baseline passes).

---

## Audit findings

### What's correct (do NOT touch)

- Card chassis, NumberChip, SegmentedControl, StepperControl, DualStepperControl, the modal scroll/grip/footer, the Fraunces type register, color tokens, padding/radius. All shipped right.
- Symptom inventory present in modal: all 14 schema symptoms (`extract.ts` enum) plus the two day-level fields `appetite_change` and `urine_output_change`. Coverage is complete.
- Per-symptom follow-ups (swelling region/resolves, cough nocturnal/sputum, dizziness postural, chest_pain character) all wired through modal → save patch → RPC → DB.
- `mostRecentPerSymptom` in `evaluate.ts` correctly lets a tap supersede a prior voice extraction. Test "Tap correction supersedes earlier voice extraction" passes (line 100-ish in `evaluate.test.ts`).
- The save-action helpers (`pushDyspnea`, `pushCough`, `pushSwelling`, `pushDizziness`, `pushChestPain`, `pushBoolean`, `pushFatigue`, `pushCognition`) match the schema column names and the engine's expectations. No bugs found there.

### What's wrong (in scope to fix)

**F1. SpO2 threshold hardcoded in `log-page-client.tsx`.** Lines 324 + 327 use literal `88` to drive the `'alert'` touch state and to bypass autosave debounce. Violates `.claude/rules/code-quality.md` rule #1 (scattered constants). Same number lives in `src/lib/clinical/thresholds.ts` as `SPO2_TIER_1_911`. Cited: research/chf-source-of-truth.md §2 Tier 1 — "SpO2 <88%".

**F2. `isSymptomTier1` mis-classifies `pnd` as tier-1.** `evaluate.ts` T2.5 fires PND at tier-2-today, not tier-1. The symptom card lighting up with the coral "Alert" pip when the engine's banner shows the warm "Watch today" register is incoherent. Plain English: tapping "Yes — woke up gasping" should show the watch-tone register on the card, not the call-911 register. Cited: research/chf-source-of-truth.md §2 Tier 2 — "Any PND episode in last 48 hr".

**F3. `isSymptomTier1` mis-classifies `pulseIrregular` as tier-1.** Standalone `pulse_irregular: true` is NOT tier-1 in `evaluate.ts`. T1.8 only fires when `pulse_irregular` AND `resting_hr > 100` AND (`chest_pain` OR `dizziness`). The card's `yesVariant="warn"` already correctly registers warn on the YN button — but the card outline + corner pip flip to alert via the touch state. Visual incoherence (warn button + alert outline). Cited: research/chf-source-of-truth.md §2 Tier 1 — "New fast irregular pulse with chest pain or dizziness" (compound only).

**F4. `page-context.ts` symptom select missing `chest_pain_character`.** Line 132 selects `'symptom,present,severity,body_region,nocturnal,sputum_color,resolves_overnight,postural,recorded_at,source_log_id'` — no `chest_pain_character`. Voice extraction can populate the column (`extract.ts` schema includes it; `pushChestPain` writes it; the RPC inserts it), but on page reload the modal hydrates `chestPainCharacter` from `(chestPain as { chest_pain_character?: string | null } | null)?.chest_pain_character ?? null` — which is always `null` because the column wasn't selected. Plain English: caregiver speaks "her chest pain is in her left arm and feels like pressure," refreshes the page, the free-text follow-up is empty.

**F5. Cognition `severity 4` doesn't surface as `state='alert'` on the card.** `page-context.ts` maps severity 4 → `cognitionChange = 'severe'`. The modal renders the SegmentedControl `value` as `null` for 'severe' (so the segmented buttons stay un-selected), and the card's touch state hydrates as `'heard'` (sage outline + "Heard" pip). The expected register for tier-1 is `state='alert'` (coral outline + "Alert" pip). The banner above the page does fire correctly (T1.4) — but the in-modal card register is wrong, breaking the "card cycles to alert" contract.

  **Page-load fix only.** Implemented in the `useState` initializer block. The mid-session voice-extraction case looked patchable via `useEffect`, but discovery during implementation: the LogPageClient `symptoms` state is initialized from `context.symptoms` once and never re-synced across `router.refresh()` — so mid-session voice extraction already doesn't update the modal's segmented values for ANY symptom. A corner-pip-only effect would have left the visual half-correct (alert pip + stale segmented value). The mid-session symptom-state sync is a broader pre-existing gap outside this PR's surgical scope. Reverted in commit `d1034ee`.

**F6. Yes/No copy fails research-anchored language tests.**
  - "Chest pain or pressure?" — research §2 Tier 1 specifies **NEW** chest pain (chronic angina is not tier-1). Code drops "new today." Mockup line 1566 has "New chest pain or pressure today?" Match the mockup.
  - "Fainted?" — research and mockup include near-syncope ("nearly faint"). Mockup line 1574: "Did she faint or nearly faint?" Match the mockup.
  - "Woke up gasping for air (PND)?" — leads with the symptom but tail-loads the medical jargon "(PND)." Plain-English rule says no leading-with or trailing-with jargon when the question already covers what mom did. Mockup line 1590: "Did she wake up gasping for breath?" Drop the jargon.

**F7. "Anasarca" label fails caregiver-language test.** Swelling severity 4 segmented option label is `Anasarca` (`SymptomsModal.tsx` line 332). That's a clinical term. `.claude/rules/plain-english-explanations.md` says: don't lead with jargon. Plain English: severity 4 is "all over the body, including the belly." Recommend label `Belly+body` (5 chars short enough for the segmented control). Cited: research/chf-source-of-truth.md §5 — decompensation progression "ankles → calves → abdomen."

**F8. Swelling severity 4 `variantOverride: 'alert'` is a tier-misrepresentation.** No tier-1 rule fires on swelling alone in `evaluate.ts`. T2.6 ("New or worsened swelling — call cardiologist today") is the strongest swelling-only rule, and that's tier-2. Severity 4 should highlight as `'warn'`, not `'alert'`. Cited: research/chf-source-of-truth.md §2 — peripheral/abdominal swelling lives in Tier 2.

**F9. Fatigue severity 4 `variantOverride: 'alert'` is a tier-misrepresentation.** No tier-1 rule fires on fatigue. T2.14 is the only fatigue-related tier-2 (compound with cold/clammy extremities). Severity 4 ("Can't move") should be `'warn'`, not `'alert'`. The functional analog T2.7 fires on `activity_step_change='severe_change'`, but that's set via voice extraction's `activity_step_change` field — not via the modal's fatigue tap. Cited: research/chf-source-of-truth.md §2 — fatigue is not in Tier 1.

**F10. `symptomsCapturedCount` over-counts and silently caps at 14.** Counts 17 fields (each of 14 symptoms + sputum_color + appetite_change + urine_output_change) then `Math.min(n, 14)`. The cap hides the bug: if a caregiver has 14 of 17 things filled, the footer reads "14 of 14 captured today" — false signal of completeness. Plain English: the footer pretends the caregiver's done when they're not. Three options:
  - Count distinct symptoms (the 14 in `extract.ts` enum, where `cough` covers sputum and `swellingSeverity` covers region/resolves), denominator = 14. Sputum/appetite/urine excluded. Mockup-aligned (mockup denominator is 14).
  - Count rendered rows including day-level fields, denominator = 16 or 17.
  - Drop the count entirely and replace the footer string with a different cue.
  
  **Plan picks (a):** numerator counts the 14 symptoms; denominator stays 14; `appetite_change` and `urine_output_change` (day-level fields, not in the symptom enum) are not counted. `sputumColor` is not counted independently — it's a follow-up to `cough`. This matches both the schema and the mockup's denominator. Plain English: "captured today" should mean "I have a value for that symptom," and we have 14 symptoms.

### Out of scope (surfaced but not fixed)

- **`extract.ts` line 96-97 says fatigue is "BINARY ONLY — DB enforces severity-must-be-null".** `save-actions.ts:494` says "L2: severity is allowed on fatigue (the CHECK was dropped in Task 1)." The schema drift is real but the comment in `extract.ts` is stale. Updating that comment is a doc hygiene change separate from this PR; flagging here so the next pass through extract.ts catches it.
- **Engine deferrals listed at the top of `evaluate.ts` lines 57-74.** "Step-change worsening of dyspnea on exertion (NYHA creep)," "early_satiety has no rule," "lethargy not modeled." All known deferrals. Not in scope here.
- **Cognition modal can't tap-set severity 4.** Caregiver can voice "she didn't recognize me" → severity 4 → banner. But there's no in-modal escalator to confusion → severe. Design intent per the comment "severe is rendered via banner; modal omits it." Leave as-is.
- **Yes/No `early_satiety`, `pulseIrregular`, `extremitiesColdClammy`, `dizziness` (without postural/SBP context), `nausea` all show `yesVariant="warn"` even though the engine fires no banner on them alone (`early_satiety` no rule; the others compound only).** The card promises "Watch today" but the banner stays quiet. Not strictly a bug — the watch-tone register also signals "logged for visit-report" — but a future polish pass might soften the visual to a calmer register. Not in scope here.

---

## File map

- Modify: `src/components/heartnote/log/SymptomsModal.tsx` — copy fixes (F6), label fix (F7), variant fixes (F8, F9).
- Modify: `src/app/log/log-page-client.tsx` — F1 (import SPO2_TIER_1_911), F2+F3 (`isSymptomTier1` corrections), F5 (cognition severity 4 → `state='alert'` hydration on load + new `useEffect` for mid-session voice extraction), F10 (`symptomsCapturedCount` rewrite).
- Modify: `src/lib/log/page-context.ts` — F4 (add `chest_pain_character` to symptom select).
- No DB migrations. No new schema. No engine changes. No test deletions. No chassis touches (`Card.tsx`, `NumberChip.tsx`, `SegmentedControl.tsx`, `StepperControl.tsx`, `DualStepperControl.tsx` unchanged).

---

## Tasks

### Task 1 — F1: SpO2 threshold imports from thresholds.ts

**Files:**
- Modify: `src/app/log/log-page-client.tsx:323-328`

- [ ] **Step 1: Add the import**

In the import block at the top of `log-page-client.tsx`, add an import for `SPO2_TIER_1_911`:

```ts
import { SPO2_TIER_1_911 } from '@/lib/clinical/thresholds';
```

- [ ] **Step 2: Replace the hardcoded `88`**

Find lines 323-328 (inside `onSpo2Change`):

```ts
    setVitalsTouch((s) => ({
      ...s,
      // H2: SpO2 ≤ 88 is tier-1 (T1.7a). Any non-null below threshold lights
      // the alert outline directly.
      spo2:
        v === null ? 'muted' : v <= 88 ? 'alert' : 'tapped',
    }));
    // Crossing the 88% line moves tier — bypass the debounce.
    scheduleSave(v !== null && v <= 88);
```

Replace both `88` literals with `SPO2_TIER_1_911`:

```ts
    setVitalsTouch((s) => ({
      ...s,
      // H2: SpO2 < SPO2_TIER_1_911 is tier-1 (T1.7a). Any non-null below
      // threshold lights the alert outline directly.
      spo2:
        v === null ? 'muted' : v < SPO2_TIER_1_911 ? 'alert' : 'tapped',
    }));
    // Crossing the threshold moves tier — bypass the debounce.
    scheduleSave(v !== null && v < SPO2_TIER_1_911);
```

Note: changes the comparator from `<=` to `<` — `T1.7a` fires on strict `<` per `evaluate.ts:258` (`freshestSpo2.value < SPO2_TIER_1_911`) and per `evaluate.test.ts:208` (`spo2 at SPO2_TIER_1_911 does NOT fire T1.7a`). The card now matches the engine.

- [ ] **Step 3: Lint + build**

Run: `npm run lint` → expect 0 errors (existing 5 warnings unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/app/log/log-page-client.tsx
git commit -m "fix(log): SpO2 alert state imports SPO2_TIER_1_911 + matches engine's strict <"
```

---

### Task 2 — F2 + F3: `isSymptomTier1` no longer mis-classifies pnd / pulseIrregular

**Files:**
- Modify: `src/app/log/log-page-client.tsx:1047-1068` (`isSymptomTier1`)

- [ ] **Step 1: Edit the function**

Find the current function (lines 1047-1068):

```ts
function isSymptomTier1(
  key: keyof SymptomState,
  value: SymptomState[keyof SymptomState] | undefined,
): boolean {
  if (value === null || value === undefined) return false;
  switch (key) {
    case 'dyspneaSeverity':
      return value === 4;
    case 'chestPain':
    case 'syncope':
    case 'cyanosis':
    case 'pulseIrregular':
    case 'pnd':
      return value === true;
    case 'sputumColor':
      return value === 'pink_frothy' || value === 'white_frothy';
    case 'cognitionChange':
      return value === 'severe';
    default:
      return false;
  }
}
```

Replace with the corrected version (PND → tier-2, pulseIrregular → compound-only):

```ts
// Mirrors the standalone tier-1 conditions in src/lib/alerts/evaluate.ts
// (T1.1, T1.2, T1.3, T1.4, T1.5, T1.6). Compound rules (T1.7, T1.8) are NOT
// modeled here because the modal can't see the SpO2/HR/multi-symptom context
// at tap time — those still light the banner via the engine, but the in-card
// 'alert' register stays off for the standalone-symptom case.
function isSymptomTier1(
  key: keyof SymptomState,
  value: SymptomState[keyof SymptomState] | undefined,
): boolean {
  if (value === null || value === undefined) return false;
  switch (key) {
    case 'dyspneaSeverity':
      // cited: research §2 Tier 1 — severe dyspnea at rest (severity 4).
      return value === 4;
    case 'chestPain':
      // cited: research §2 Tier 1 — new chest pain.
      return value === true;
    case 'syncope':
      // cited: research §2 Tier 1 — syncope.
      return value === true;
    case 'cyanosis':
      // cited: research §2 Tier 1 — cyanotic lips/fingers.
      return value === true;
    case 'sputumColor':
      // cited: research §2 Tier 1 — pink OR white frothy sputum.
      return value === 'pink_frothy' || value === 'white_frothy';
    case 'cognitionChange':
      // cited: research §2 Tier 1 — severe confusion.
      return value === 'severe';
    default:
      // pnd → tier-2 (T2.5). pulseIrregular alone → no banner; the
      // T1.8 compound (irregular + HR>100 + chest_pain/dizziness) fires
      // tier-1 via the engine, not via the standalone tap state.
      return false;
  }
}
```

- [ ] **Step 2: Edit `isTierMovingPatch` to keep matching tier-mover semantics**

The function below `isSymptomTier1` (lines 1074-1084) bypasses the autosave debounce when a patch could move the alert tier. PND and pulseIrregular CAN still move the tier (PND → tier-2 banner, pulseIrregular → tier-1 via T1.8 compound when other today-events fit). Keep them in `isTierMovingPatch` — the debounce skip stays the same; only the in-card 'alert' visual changes.

No edit to `isTierMovingPatch`. Document this in the function header comment:

Find:

```ts
// True when the patch could move the alert tier — i.e., any change to a
// tier-1 yes-flag (true ↔ false), enum transitions in/out of tier-1
// values (sputum, cognition, dyspnea severity 4). Used to bypass the
// 1.5s autosave debounce so the banner appears or clears promptly.
function isTierMovingPatch(patch: Partial<SymptomState>): boolean {
```

Replace the comment block with:

```ts
// True when the patch could move the alert tier (banner) — broader than
// `isSymptomTier1` because it includes tier-2 movers (PND) and compound
// tier-1 contributors (pulseIrregular). The card-state 'alert' visual is
// strictly tier-1; the autosave debounce skip is for any tier-changing
// edit, including tier-2 banners. Keep these in sync with the rules in
// src/lib/alerts/evaluate.ts.
function isTierMovingPatch(patch: Partial<SymptomState>): boolean {
```

- [ ] **Step 3: Lint + build**

Run: `npm run lint` → expect 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/log/log-page-client.tsx
git commit -m "fix(log): isSymptomTier1 drops pnd (tier-2) and pulseIrregular (compound-only)"
```

---

### Task 3 — F4: page-context selects `chest_pain_character`

**Files:**
- Modify: `src/lib/log/page-context.ts:131-135` (`todaySymptomsRes` select)

- [ ] **Step 1: Add `chest_pain_character` to the select**

Find:

```ts
    supabase
      .from('daily_log_symptom_events')
      .select('symptom,present,severity,body_region,nocturnal,sputum_color,resolves_overnight,postural,recorded_at,source_log_id')
      .eq('patient_id', patient.id)
      .eq('log_date', today)
      .order('recorded_at', { ascending: false }),
```

Replace the select string to include `chest_pain_character`:

```ts
    supabase
      .from('daily_log_symptom_events')
      .select('symptom,present,severity,body_region,nocturnal,sputum_color,chest_pain_character,resolves_overnight,postural,recorded_at,source_log_id')
      .eq('patient_id', patient.id)
      .eq('log_date', today)
      .order('recorded_at', { ascending: false }),
```

- [ ] **Step 2: Verify the existing hydration line works**

Look at lines 344-347 in `page-context.ts`:

```ts
chestPainCharacter:
  (chestPain as { chest_pain_character?: string | null } | null)
    ?.chest_pain_character ?? null,
```

This already reads `chest_pain_character`. With the column now in the select, it hydrates correctly. No further edits in `page-context.ts` for F4. (Steps in Task 4 cover F5 cognition hydration.)

- [ ] **Step 3: Manual verification**

Note for verification phase (after all tasks land): seed a daily_log_symptom_events row with `symptom='chest_pain', present=true, chest_pain_character='left arm, pressure'` for today, refresh `/log`, open the symptom modal, expand the Chest pain card → confirm the "Where? (e.g., left arm, pressure)" input prefills with "left arm, pressure".

- [ ] **Step 4: Commit**

```bash
git add src/lib/log/page-context.ts
git commit -m "fix(log): page-context selects chest_pain_character so modal hydrates voice-extracted text"
```

---

### Task 4 — F5: cognition severity 4 hydrates as state='alert' (page-load AND mid-session)

**Files:**
- Modify: `src/app/log/log-page-client.tsx:188` (touch state hydration block) + new `useEffect` after the existing touch-state initializer.

- [ ] **Step 1: Patch the page-load hydration line**

Find this block in the `useState<SymptomTouchState>` initializer (around lines 137-188):

```ts
    out.cognitionChange = stateFor(s.cognitionChange !== null, src.cognitionChange);
```

Replace with:

```ts
    // Cognition severity 4 ('severe') is the tier-1 banner trigger (T1.4)
    // even though the modal renders the SegmentedControl with value=null
    // for severe (mockup choice — modal omits the severity-4 button).
    // Hydrate the card to state='alert' so the corner pip + outline match
    // the banner the engine fires above the page.
    out.cognitionChange =
      s.cognitionChange === 'severe'
        ? 'alert'
        : stateFor(s.cognitionChange !== null, src.cognitionChange);
```

- [ ] **Step 2: Add a mid-session re-hydration effect**

`useState` initializers only run once on mount. A voice extraction mid-session that surfaces `cognitionChange='severe'` (via `router.refresh()` inside `stopRecording`) re-renders the client with new `context` props but does NOT remount it — so the alert pip would stay 'heard' until reload. Add a `useEffect` that re-pins the touch state when `context.symptoms.cognitionChange` transitions to 'severe'.

After the existing `useState<SymptomTouchState>(...)` block (the one that ends around line 188), add:

```ts
  // Mid-session re-hydration for tier-1 cognition. router.refresh() updates
  // `context.symptoms.cognitionChange` without remounting; the useState
  // initializer above only runs at mount. When voice extraction surfaces
  // severity 4 ('severe') after the page is already open, light the in-modal
  // alert pip without waiting for a reload.
  useEffect(() => {
    if (context.symptoms.cognitionChange !== 'severe') return;
    setSymptomsTouch((s) =>
      s.cognitionChange === 'alert' ? s : { ...s, cognitionChange: 'alert' },
    );
  }, [context.symptoms.cognitionChange]);
```

(`useEffect` is already imported at the top of the file via `import { useCallback, useEffect, useMemo, useRef, useState } from 'react';` — no import edit needed.)

- [ ] **Step 3: Manual verification**

Two paths to verify:

1. **Page load**: seed a `daily_log_symptom_events` row with `symptom='cognition_change', present=true, severity=4` for today, refresh `/log`, open the symptom modal, confirm the "Mental clarity" card shows coral outline + "Alert" corner pip AND the banner above shows T1.4.

2. **Mid-session voice**: with the modal open and no cognition signal, dictate a voice log that contains "she didn't recognize me" (extracts to `cognition_change.severity=4`). After the analyzing → complete transition, confirm the "Mental clarity" card flips to coral outline + "Alert" pip without reloading the page.

- [ ] **Step 4: Lint + build**

Run: `npm run lint` → expect 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/log/log-page-client.tsx
git commit -m "fix(log): cognition severity 4 hydrates as state='alert' on load AND mid-session"
```

---

### Task 5 — F6 + F7 + F8 + F9: copy and variant fixes in SymptomsModal

**Files:**
- Modify: `src/components/heartnote/log/SymptomsModal.tsx`

- [ ] **Step 1: F6a — chest pain question copy**

Find (around line 459):

```ts
            <SymptomYesNoCard
              question="Chest pain or pressure?"
```

Replace with:

```ts
            <SymptomYesNoCard
              // cited: research/chf-source-of-truth.md §2 Tier 1 — NEW chest
              // pain. Chronic angina is not tier-1; the "new today" qualifier
              // keeps the caregiver from over-flagging known stable pain.
              question="New chest pain or pressure today?"
```

- [ ] **Step 2: F6b — syncope question copy**

Find (around line 487):

```ts
            <SymptomYesNoCard
              question="Fainted?"
```

Replace with the mockup-verbatim phrasing (matches the "Did she…?" register the new PND copy uses):

```ts
            <SymptomYesNoCard
              // cited: research/chf-source-of-truth.md §2 Tier 1 — syncope.
              // Mockup line 1574: "Did she faint or nearly faint?" — clinical
              // convention includes near-syncope ("blacked out for a moment").
              question="Did she faint or nearly faint?"
```

- [ ] **Step 3: F6c — PND question copy (drop "(PND)" jargon)**

Find (around line 517):

```ts
            <SymptomYesNoCard
              question="Woke up gasping for air (PND)?"
```

Replace with:

```ts
            <SymptomYesNoCard
              // cited: research/chf-source-of-truth.md §2 Tier 2 — PND. Plain
              // English: don't trail-load the medical term when the question
              // already names what the caregiver observed.
              question="Did she wake up gasping for breath?"
```

- [ ] **Step 4: F7 — swelling severity 4 label "Anasarca" → "Belly+body"**

Find (around line 332):

```ts
                { value: 4, label: 'Anasarca', variantOverride: 'alert' },
```

Replace with:

```ts
                // cited: research/chf-source-of-truth.md §5 — decompensation
                // progression "ankles → calves → abdomen." Plain English for
                // anasarca: "all over the body, including the belly."
                { value: 4, label: 'Belly+body', variantOverride: 'warn' },
```

(Note: this also applies F8 by changing the `variantOverride` from `'alert'` to `'warn'`.)

- [ ] **Step 5: F9 — fatigue severity 4 variant**

Find (around line 377):

```ts
                { value: 4, label: "Can't move", variantOverride: 'alert' },
```

Replace with:

```ts
                // cited: research/chf-source-of-truth.md §2 — fatigue is not
                // in Tier 1 (no engine rule fires tier-1 on fatigue alone).
                // Severity 4 reads as warn-tone, matching T2.14 (compound
                // with cold/clammy) and T2.7 (severe activity-step-change).
                { value: 4, label: "Can't move", variantOverride: 'warn' },
```

- [ ] **Step 6: Lint + build**

Run: `npm run lint` → expect 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/heartnote/log/SymptomsModal.tsx
git commit -m "fix(log/symptoms): caregiver-language copy + correct variant tiers (F6-F9)"
```

---

### Task 6 — F10: symptomsCapturedCount counts schema symptoms, not rendered fields

**Files:**
- Modify: `src/app/log/log-page-client.tsx:719-739` (`symptomsCapturedCount` useMemo)

- [ ] **Step 1: Replace the count helper**

Find the current memo:

```ts
  const symptomsCapturedCount = useMemo(() => {
    let n = 0;
    if (symptoms.dyspneaSeverity !== null) n++;
    if (symptoms.cough !== null) n++;
    if (symptoms.sputumColor !== null) n++;
    if (symptoms.swellingSeverity !== null) n++;
    if (symptoms.fatigueSeverity !== null) n++;
    if (symptoms.cognitionChange !== null) n++;
    if (symptoms.appetiteChange !== null) n++;
    if (symptoms.urineOutputChange !== null) n++;
    if (symptoms.chestPain !== null) n++;
    if (symptoms.syncope !== null) n++;
    if (symptoms.cyanosis !== null) n++;
    if (symptoms.pnd !== null) n++;
    if (symptoms.earlySatiety !== null) n++;
    if (symptoms.extremitiesColdClammy !== null) n++;
    if (symptoms.pulseIrregular !== null) n++;
    if (symptoms.dizziness !== null) n++;
    if (symptoms.nausea !== null) n++;
    return Math.min(n, 14);
  }, [symptoms]);
```

Replace with the schema-aligned 14-symptom counter (sputum is a follow-up of cough; appetite + urine are day-level, not symptoms):

```ts
  // Counts the 14 distinct symptoms in the extract.ts schema enum:
  // dyspnea, cough, chest_pain, swelling, fatigue, pnd, syncope,
  // cognition_change, extremities_cold_clammy, cyanosis, early_satiety,
  // pulse_irregular, dizziness, nausea. Sputum is a follow-up of cough,
  // not a separate symptom. Appetite and urine are day-level fields, not
  // entries in the symptom_events enum, so they don't count toward the
  // "14 symptoms" denominator the modal footer shows.
  const symptomsCapturedCount = useMemo(() => {
    let n = 0;
    if (symptoms.dyspneaSeverity !== null) n++;
    if (symptoms.cough !== null) n++;
    if (symptoms.swellingSeverity !== null) n++;
    if (symptoms.fatigueSeverity !== null) n++;
    if (symptoms.cognitionChange !== null) n++;
    if (symptoms.chestPain !== null) n++;
    if (symptoms.syncope !== null) n++;
    if (symptoms.cyanosis !== null) n++;
    if (symptoms.pnd !== null) n++;
    if (symptoms.earlySatiety !== null) n++;
    if (symptoms.extremitiesColdClammy !== null) n++;
    if (symptoms.pulseIrregular !== null) n++;
    if (symptoms.dizziness !== null) n++;
    if (symptoms.nausea !== null) n++;
    return n;
  }, [symptoms]);
```

(The cap is removed — the new ceiling is exactly 14, matching the 14 increments. The denominator string in `SymptomsModal.tsx:624` ("{capturedCount} of 14 symptoms captured today") stays as-is and now reads honestly.)

- [ ] **Step 2: Lint + build**

Run: `npm run lint` → expect 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/log/log-page-client.tsx
git commit -m "fix(log): symptomsCapturedCount counts the 14 schema symptoms, not 17 rendered fields"
```

---

### Task 7 — Run the alert test suite (regression gate)

**Files:** none modified — this is a verification step.

- [ ] **Step 1: Run alert tests**

Run: `npm run test:alerts`
Expected: `48 pass, 0 fail`. (None of the audit fixes touch the engine; this gate confirms.)

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: 0 errors, 5 warnings (the pre-existing baseline). No new warnings.

- [ ] **Step 3: Run a full build (smoke)**

Run: `npm run build`
Expected: build success.

- [ ] **Step 4: Commit nothing here**

Verification step only. If any of the above fails, return to the relevant task.

---

### Task 8 — Code review (fresh subagent)

**Files:** none modified.

- [ ] **Step 1: Dispatch a fresh-context Agent**

Per `.claude/rules/feature-workflow.md` step 6, dispatch a `general-purpose` subagent with the diff (`git diff main...HEAD`), the approved AC list (this plan), and the rule files: `.claude/rules/code-quality.md`, `.claude/rules/canonical-controls.md`, `.claude/rules/plain-english-explanations.md`, `.claude/rules/destructive-actions.md`, `CLAUDE.md`.

The subagent must verify:
- Each fix matches its plan task verbatim.
- Visual/chassis untouched (`Card.tsx`, `NumberChip.tsx`, `SegmentedControl.tsx`, `StepperControl.tsx`, `DualStepperControl.tsx` unchanged in the diff).
- No new clinical constants outside `src/lib/clinical/thresholds.ts`.
- No personification of the app per `feedback_dont_personify_app`.
- Every clinical claim in changed code carries a `// cited:` comment.
- Mockup `docs/design/heartnote-log-redesign-mockup.html` register (Fraunces, cream-card, sage-mist, padding) is matched structurally where the diff touches symptom modal copy.

- [ ] **Step 2: Patch findings**

Resolve actionable findings; push back on non-actionable ones with reasoning visible in the conversation.

- [ ] **Step 3: Commit**

Per-finding commits with `fix(review):` prefix if any fixes land.

---

### Task 9 — Push, watch CI, capture preview URL

**Files:** none modified.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin symptom-correctness
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "fix(/log): symptom modal correctness pass" --body "$(cat <<'EOF'
## Summary
- F1: SpO2 alert state imports SPO2_TIER_1_911 (matches engine's strict <)
- F2 + F3: isSymptomTier1 drops pnd (tier-2) and pulseIrregular (compound-only)
- F4: page-context selects chest_pain_character so the modal hydrates voice-extracted text
- F5: cognition severity 4 hydrates as state='alert' to match T1.4 banner
- F6: caregiver-language copy on chest pain / syncope / PND yes-no questions
- F7 + F8: swelling severity 4 label and variant — Anasarca → Belly+body, alert → warn
- F9: fatigue severity 4 variant — alert → warn
- F10: symptomsCapturedCount counts 14 schema symptoms, not 17 rendered fields

## Test plan
- [ ] `npm run test:alerts` passes (48/48 baseline)
- [ ] `npm run lint` clean (0 errors, 5 pre-existing warnings)
- [ ] `npm run build` succeeds
- [ ] Vercel preview: chest_pain_character voice-extracted text round-trips through page reload
- [ ] Vercel preview: cognition severity 4 shows alert outline + Alert pip on the in-modal card
- [ ] Vercel preview: tap PND=Yes shows watch register (not alert) on the card; banner shows Watch today
- [ ] Vercel preview: tap pulse_irregular=Yes shows warn YN button + warn outline (not alert)
- [ ] Vercel preview: swelling severity 4 button reads "Belly+body" with warn variant
- [ ] Vercel preview: fatigue severity 4 button reads "Can't move" with warn variant
- [ ] Vercel preview: symptom modal footer shows "X of 14 symptoms captured today" honestly
EOF
)"
```

- [ ] **Step 3: Watch CI**

Run: `gh pr checks --watch`

- [ ] **Step 4: Capture the preview URL**

Run: `gh pr view --json comments,statusCheckRollup,url --jq '.url, [.statusCheckRollup[] | select(.name | test("Vercel|preview")) | .targetUrl] | flatten | join("\n")'`

Report the preview URL to Jason. **Do NOT merge** — Jason reviews the preview first.

---

## Acceptance criteria

### Engineering
- [ ] Plan stated and approved before code (this doc; reviewed by plan-review subagent before Task 1).
- [ ] No new abstractions; eight existing files touched surgically.
- [ ] Diff scoped to symptom-correctness; no chassis or visual-register edits.
- [ ] All ACs verifiable via `npm run lint`, `npm run test:alerts`, `npm run build`, and the Vercel preview.

### Functional — happy path
- [ ] When SpO2 is set to 87% via the stepper, the SpO2 vital card immediately shows `state='alert'` (coral outline + "Alert" pip) and the autosave fires without waiting 1.5s.
- [ ] When SpO2 is set to 88% via the stepper, the SpO2 vital card shows `state='tapped'` (warn outline + "Tapped" pip) — strict `<` matches T1.7a in the engine.
- [ ] When the caregiver taps "Yes" on the new chest pain question, the card lights `state='alert'` AND the banner above the page shows the T1.3 trigger.
- [ ] When the caregiver taps "Yes" on PND, the card lights `state='tapped'` (warn outline + "Tapped" pip) — NOT alert. The banner above shows "Watch today" (T2.5).
- [ ] When the caregiver taps "Yes" on pulse_irregular WITHOUT chest_pain/dizziness/HR>100 in scope, the card lights `state='tapped'`, NOT alert. No tier-1 banner fires.
- [ ] When the caregiver taps "Yes" on pulse_irregular AND chest_pain AND HR=110 (compound), the engine fires T1.8 and the banner above shows tier-1.
- [ ] Voice extraction with `chest_pain_character='left arm, pressure'` round-trips through page reload: the free-text input under the chest pain card shows "left arm, pressure" after refresh.
- [ ] Voice extraction with `cognition_change.severity=4` shows the in-modal Mental clarity card with `state='alert'` (coral outline + "Alert" pip) AND the banner above shows T1.4.

### Edge cases
- [ ] Caregiver opens the modal on a fresh day (no events): footer shows "0 of 14 symptoms captured today."
- [ ] Caregiver fills 1 symptom: footer shows "1 of 14 symptoms captured today" (no over-count from sputum/appetite/urine).
- [ ] Caregiver fills ONLY sputum, appetite, and urine (no other symptoms): footer shows "0 of 14 symptoms captured today" — these three fields are tracked but live outside the 14-symptom enum (sputum is a follow-up of cough; appetite + urine are day-level). Deliberate; documented in the F10 audit finding.
- [ ] Caregiver taps "Confused" on Mental clarity: card lights warn outline + "Tapped" pip (NOT coral); banner above shows T2.13 watch-tone.
- [ ] Caregiver taps every symptom: footer shows "14 of 14 symptoms captured today" — no cap-induced over-display.
- [ ] Caregiver taps "Yes" on chest pain, then taps "No" — card returns to `state='tapped'` (warn), banner clears within the autosave-bypass window.
- [ ] Caregiver taps "Yes" on early_satiety / cold-clammy / nausea / dizziness / pulse_irregular: card shows warn-tone register; for early_satiety / cold-clammy / dizziness / pulse_irregular ALONE, no engine banner fires (compound-only or not-yet-modeled rules per `evaluate.ts:57-74`). Logged for the visit report. Deliberately deferred per the audit's "Out of scope" section.

### Error states
- [ ] Network failure on autosave: existing 3-strike banner appears (no regression).
- [ ] Invalid SpO2 input (e.g., 50%): existing min/max clamp kicks in (no regression).

### Performance
- [ ] No new database queries. The page-context.ts select adds a single column to an existing select — same row count, same indexes.
- [ ] No new render passes. The modal already re-renders on every onChange.

### Persistence
- [ ] `chest_pain_character` reads as the existing column from `daily_log_symptom_events`.
- [ ] `apply_log_patch_v2` already writes `chest_pain_character` from voice → `pushChestPain`. No DB schema or RPC change.

### Permissions / RLS
- [ ] All changed reads still go through `auth.getUser()` + the existing `daily_log_symptom_events` RLS policy. No new tables.

### Side effects
- [ ] None. All 14 symptoms still log to the same table; the engine still reads the same columns; the assessment / banner logic is unchanged.

### Manual verification (under 2 minutes)
1. Open the PR's Vercel preview at `/log` as a test caregiver with a seeded patient that has 7+ days of history.
2. Tap "Yes" on each red-flag symptom in turn; confirm:
   - chest pain → coral card + tier-1 banner
   - syncope → coral card + tier-1 banner
   - cyanosis → coral card + tier-1 banner
   - PND → warn card + tier-2 banner
   - early satiety → warn card + no banner (logged for visit-report only)
   - cold/clammy → warn card + no banner (compound-only)
   - pulse_irregular → warn card + no banner (compound-only)
   - dizziness → warn card + no banner (compound-only without postural/SBP)
   - nausea → warn card + tier-2 banner (T2.12)
3. Set the swelling severity to "Belly+body" — confirm warn variant (NOT coral).
4. Set the fatigue severity to "Can't move" — confirm warn variant (NOT coral).
5. Set SpO2 to 87% — confirm coral card + tier-1 banner.
6. Set SpO2 to 88% — confirm warn card + no tier-1 banner.
7. Refresh the page — confirm symptom modal hydrates the chest_pain_character free-text from a previously-voice-extracted log.
