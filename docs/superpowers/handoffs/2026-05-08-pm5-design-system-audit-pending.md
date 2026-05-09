# Handoff — design system audit pending (2026-05-08, PM5)

> User flagged that the live app diverges from the design system in `~/Desktop/heartnote-home-mockup.html`. Tasks queued for next session. Stopping before starting the audit because it's a fresh-context-quality task and this session is too deep.

## Today's other wins (already shipped this session)

- **PRs #60 / #61 / #62** — visit-prep PDF end-to-end (foundations + visualizations + composition + `/api/visits/[id]/pdf` route + Download button on `/visits/[id]`).
- **PR #63** — v0.5 LLM alert reasoning (Anthropic Opus 4.7, prompt caching, regex guardrails for CLAUDE.md rule #6, code-review subagent dispatched).
- **PR #64** — fix the visit-handoff PDF 500 caused by four hardcoded `'Inter'` font-family strings I missed when swapping to built-in Helvetica/Times-Roman in PR #62. Added `try/catch` with structured `console.error`, `runtime = 'nodejs'`, `maxDuration = 60`, `serverExternalPackages: ['@react-pdf/renderer']`.

## What needs doing next — design-system audit

**The finding:** The user shared two screenshots from `~/Desktop/heartnote-home-mockup.html` — a 430-line HTML/Tailwind file that's the design source-of-truth — and said: "I don't see any of these components anywhere throughout the app. WTFF???????? What's the point of the design system?"

Confirmed gaps from the screenshots alone (not exhaustive — full mockup unread):

1. **Vitals input cards** — Weight / Swelling / Breathing / Pillows / Cough. Each is a card with a colored dot label, secondary right-aligned context ("vs. baseline 178.0 lb"), a register-appropriate control (stepper for weight + pillows, segmented for swelling + breathing + cough), and helper text underneath ("▲ 4.4 lb in 14d — above AHA threshold"). **Not in the app at all.** Today's UX is voice-log → engine → dashboard verdict + flat form on `/log/[id]/edit`.

2. **Icon buttons — white-circle stepper register.** White circle with `−`, white circle with `+`, white circle with `×`, plus a sage-circle `+` with the word "add" beside it. The white-circle stepper is for *numeric increment/decrement* (pillows, doses, severity). **Not in `.claude/rules/canonical-controls.md` at all** — that file codified only three registers (small X for field clear, coral-minus for list-row remove, sage-plus for list-row add). PR #59 reconciled the rule file to `cadence-fields.tsx`, which was a *subset* of the design system. The stepper is the missing fourth register.

3. **Medication row — three states.** Taken (pill icon + drug + checkmark on a sage tinted row), due (warm tint + "Due in 20m" pill on the right), edit (inline stepper-on-row for dose value + ×). **`TodaysMedsList.tsx` and `medications-list-client.tsx` have *something* in this space** but the visual register and three-state choreography don't match the mockup. Need a real diff.

**Likely there's more.** I only saw two of the mockup pages. The full audit needs every section read.

## Why this happened

Engineering Claude (me + previous sessions) has been building from feature requirements + `.claude/rules/canonical-controls.md`. PR #57 migrated icon-register offenders to match `cadence-fields.tsx`, and PR #59 codified that pattern as the canonical rule. **That cemented a subset as canonical and made the rest invisible.** The design-system HTML on Desktop wasn't being read as spec.

Memory saved at `~/.claude/projects/-Users-jazminescamilla-Desktop-heartnote/memory/feedback_design_system_is_spec.md` enforces the new discipline:
1. Before any new screen or component, read the design-system file for the relevant page.
2. When the design shows a component the app doesn't have, build it.
3. When registers conflict, design system wins by default; surface the conflict and update the rule file, not the design.
4. Code review asks "did this match the design system page?" — not just "did this match `canonical-controls.md`?"

## Where the design system lives

- **Primary:** `~/Desktop/heartnote-home-mockup.html` (430 lines, last verified this session)
- **Reference port-from:** Lovable repo at `github.com/productsvance-web/heart-to-heart-home` (per `reference_lovable_repo` memory)
- **Tertiary:** `.claude/rules/canonical-controls.md` — *codification of what shipped*, not what should ship. Update this file when conflicts surface.

## Where to start the next session

1. Read this handoff.
2. **Read the entire `~/Desktop/heartnote-home-mockup.html`** — every section, every component, every state. This is the spec.
3. For each section, grep the codebase for the component. Three outcomes per section:
   - In the app, register matches → tick.
   - In the app, register doesn't match → audit-fix PR.
   - Not in the app → build PR.
4. Output a written gap-list audit before any code changes — this is the user-approval step.
5. Recommended sequencing once approved:
   - **Update `.claude/rules/canonical-controls.md`** with the white-circle stepper register and any other missing registers.
   - **Build vitals input cards** (highest leverage — they likely change where logging happens, away from voice-only).
   - **Refactor medication row** to the three-state design.
   - **Audit the rest** (header bands, status pip, mini sparks, modals, toasts, empty states, etc.).
6. Use a worktree per change.

## Other queued items (lower priority than the audit)

- **Priority #1** — End-to-end caregiver walk on REAL data (manual, you).
- **Priority #6** — iOS Capacitor build verification on the user's iPhone via the cord (~30 min Xcode session, free).
- **Priority #7** — Push notifications (gated on $99 Apple Developer + Firebase project).
- **HealthKit ingestion** — Tier 1 of the tracking philosophy (gated on $99).
- **Stripe paywall** — not started; needed before charging anyone.
- **Visit-prep PDF polish** — bundle Inter/Fraunces TTFs into `/public/fonts/pdf/`; adherence window RPC.

## Next session entry point

> Read `docs/superpowers/handoffs/2026-05-08-pm5-design-system-audit-pending.md`. Latest commits on `main` are PR #60–#64 (visit-prep PDF + LLM reasoning + PDF 500 fix). The next priority is the design-system audit — read `~/Desktop/heartnote-home-mockup.html` end-to-end, then output a gap list before any code changes. Use a worktree per change once the audit lands.
