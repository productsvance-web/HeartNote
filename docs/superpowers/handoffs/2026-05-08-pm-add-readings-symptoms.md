# Handoff — add readings/symptoms inline + canonical-controls reconciliation (2026-05-08, PM)

> Two PRs shipped on `main`. Stopping per the 50%-context rule.

## What landed

### PR #58 — `4f710a2` — feat(log): add inline readings + symptoms on /log/[id]/edit
Closes priority #2 from the prior session's queue.

- Inline "+ Add a reading" / "+ Add a symptom" Pattern #3 buttons at the bottom of each section. Picker UI: field/symptom dropdown + Confirm/Cancel.
- New rows persist with `recorded_at = log.created_at` (NOT `now()`) so "latest reading" rules don't misread a fix-on-yesterday's-log as today's data. Plan-review caught this — would have been a real clinical bug.
- Per-field validation ranges extracted into `src/lib/clinical/reading-ranges.ts`; both server (`process.ts`, manual-edit action) and client (picker) import. Code-review caught the prior duplicate.
- Page intro copy updated to "edit, remove, or add" (was "dictate another log").
- Playwright spec covers happy path + validation: `tests/edit-add-readings.spec.ts`.

Files added/modified:
- `src/app/log/[id]/edit/edit-form.tsx` — inline pickers, AddButton, ReadingDraftRow, SymptomDraftRow
- `src/app/log/[id]/edit/actions.ts` — `newReadings` + `newSymptoms` payload arrays, server-side range refines, inserts with `recorded_at = log.created_at`
- `src/app/log/[id]/edit/page.tsx` — intro copy
- `src/lib/voice-log/process.ts` — switched to importing the shared range constants
- `src/lib/clinical/reading-ranges.ts` — new shared module
- `tests/edit-add-readings.spec.ts` — new Playwright spec

### PR #59 — `a92ae75` — docs(rules): canonical-controls #2 + #3 spec matches the in-repo reference
- The rule file described aspirational `h-8 w-8` + `bg-accent` / `bg-status-alert-soft` patterns that don't exist anywhere in the codebase. Every shipped Add/Remove uses `h-[22px] w-[22px]` + `bg-status-good` / `bg-destructive`, white glyph, strokeWidth 3.
- Updated the rule to describe the actual register so future reviews don't flag the existing pattern as a violation.
- Retired the "currently-out-of-canon" list (PR #57 migrated all prior offenders).

## Test gates

Both green at session end:
- `npm run test:alerts` — 47 pass
- `npm run test:trends` — 32 pass
- `npm run lint` — 4 pre-existing warnings (in seed scripts + global-setup.ts), 0 errors
- `npm run build` — clean
- Vercel previews: both green

## What was checked off the prior queue

- ✅ #2 (Add readings/symptoms inline) — PR #58
- ✅ #4 (Cough heatmap UI) — already shipped in PR #57 as part of the design-system pass; the design brief was committed *after* the implementation. `src/components/heartnote/CoughHeatmap.tsx` is wired into `TrendsView.tsx:114`. Nothing else to do here.

## What's still open

### Priority #1 — End-to-end caregiver walk on REAL data
Still needs the user. Manual-verification checklist from the prior handoff is unrun. PR #58 added two more steps to walk:
- `/log/[id]/edit` → "Add a reading" → pick Weight → enter 178.4 → Confirm → Save
- After save, `/dashboard` tier should reflect the new reading

### Priority #3 — Visit-prep PDF
Plan at `docs/superpowers/plans/2026-05-08-visit-prep-pdf.md` is a 3-session build:
- Session 1: migration (`patients.dob`, `cardiology_visits.last_visit_id`) + `@react-pdf/renderer` install + `pdf/colors.ts`, `pdf/typography.ts`, `pdf/header.tsx`, data loader
- Session 2: weight chart + symptom timeline + "what changed" callout
- Session 3: meds table + adherence strip + questions + notes + integration + edge-case walkthrough

Open questions before session 1:
- DOB collection — onboarding step or `/me/patient/edit` backfill?
- Watermark on page 1 ("DECISION SUPPORT — NOT A MEDICAL RECORD")? Recommend yes, gray at 8% opacity.

### Priority #5 — LLM-reasoning v0.5 alert narrative
Phase 1 engine produces `Trigger.label` strings. The HeroAlertCard renders the lead trigger's label as the headline. The next layer is an Anthropic Claude Opus 4.7 call (with prompt caching per CLAUDE.md rule 3) that produces a 1–2 sentence reasoning per alert. Closes CLAUDE.md rule #4 ("AI alerts must show their reasoning"). Bounded scope but didn't fit in this session.

### Priority #6 — iOS Capacitor build verification
Needs a Mac with Xcode. Run `npx cap sync ios`, open the workspace, verify the app boots in a real iOS shell.

### Priority #7 — Push notifications
Per `docs/status.md`, deferred to next phase.

## Known follow-ups (not yet queued)

- **Trends 7-day symptom window** — `gte('log_date', today-7)` is 8 calendar days inclusive. Decide strict-vs-inclusive before next trends fix.
- **Visit-prep PDF: DOB collection** — see plan §"Open questions for the user before session 1".
- **Engine commit `4f9b6af` mislabeled** as "feat(log): manual edit UI" (it's the engine 47-test landing). Content is right; force-push to amend would need user OK.

## Where to start the next session

1. Read this handoff.
2. Run `npm run test:alerts` + `npm run test:trends` to confirm gates still green.
3. If you have your hands available: walk PR #58 on the Vercel preview — the manual checks I couldn't do.
4. Pick one of priorities #3 / #5 and execute.

## Next session entry point

> Read `docs/superpowers/handoffs/2026-05-08-pm-add-readings-symptoms.md`. Latest commits on `main` are `4f710a2` (PR #58 — add readings/symptoms inline) and `a92ae75` (PR #59 — canonical-controls reconciliation). Verify test gates (`npm run test:alerts` + `npm run test:trends`), then pick priority #3 or #5 and execute.
