# Follow-ups for medications schedule + cadence (post-PR #41)

PR #41 ("Apple-style schedule + cadence + local notifications") merged as commit `91a9e98` on `main`. Three follow-ups surfaced from product testing.

## Issue 1: Flatten the cadence picker into one screen

The current cadence flow is two screens: a 5-row kind picker → tap → a sub-fields screen. Apple Health's actual pattern is one screen with the cadence-kind row inline + a bottom sheet that opens on tap.

Reference screenshots in `docs/plans/medications-schedule-cadence/screenshots/`:

- **`apple-set-a-schedule-with-interval-overlay.png`** — Apple Health "Set a Schedule" for Bumetanide. The cadence row ("Every Few Days") is inline at the top alongside Interval, At what time, Duration, Start date, Edit. A dropdown overlay shows the interval list — `Every Other Day, Every 3 Days, ... Every 13 Days` — opened from tapping the Interval row. Note: there's NO separate cadence-kind picker screen.
- **`apple-specific-days-with-groups.png`** — Apple Health "Set a Schedule" for the Specific Days cadence. Two day-pill groups ("On these days" with S+T pills selected at 12:55/1:55 AM, "And these days" with M+T+S pills at 1:05/2:05 AM), times nested under each group, "Schedule Other Days" button, "Next" CTA. The day pills are filled circles when selected, light circles when claimed-by-others, and the inactive set is rendered transparent (not greyed-out-text).
- **`heartnote-current-broken-state.png`** — HeartNote's current Specific Days UI. Shows the bug pattern (see Issue 3 below): user has group 2 claiming all 7 days, leaving group 1's pills disabled, but group 1 still has dose-times entered.

The user wants:
- One unified screen — cadence-kind row at top, kind-specific sub-fields below it (interval / cycle counts / day pills), then dose-time rows, then duration, then Save
- Tapping the kind row opens a bottom sheet with the 5 options + checkmark + Done
- Sub-pickers like the interval list also open a sheet on tap (matching the Apple overlay)
- No more full-screen picker; Save advances to whatever the parent context expects (in scan flow: next med card; in edit flow: back to summary; in wizard: step 5)

### Specific-Days day-pill rule (verified against Apple Health)

Apple Health enforces a **minimum of one day per group** at the input layer — the user cannot deselect the last selected day in a group; the tap is a silent no-op. This is stricter than HeartNote's current behavior (auto-remove the group when its bitmap drops to 0) and is the better UX:

- HeartNote today: tap last selected day → bitmap goes to 0 → group disappears (and via my `setGroupBitmap` patch, its dose-times disappear too). Jarring.
- Apple's rule: tap last selected day → no-op. Bitmap=0 is unreachable from interaction.

The flatten refactor should adopt Apple's rule. Concretely, in `day-pills.tsx`'s `onChange`, before computing `bitmap & ~dow.bit` (deselect), check whether the resulting bitmap would be 0 *and* the group has dose-times — if so, skip. Adding an explicit "Remove group" button (visible in `apple-specific-days-with-groups.png` as `Remove group` link adjacent to the day-pills row) is the user's path to delete a group entirely, not deselecting its last day.

This rule makes the broken state in `heartnote-current-broken-state.png` unreachable — a group with 0 days + dose-times can no longer exist, which removes the Issue 3 root cause structurally.

## Issue 2: Form-aware quantity rendering

`formatQuantity()` in `cadence-fields.tsx` currently renders generic "1 dose" / "1.5 doses". We already have `medications.form` populated from RxNorm and `normalizeForm()` mapping it to short names ("tablet", "capsule", "drop", etc.). Plumb `form` from the parent (medication row / scanned-med / wizard state) through `CadenceFlow` → `CadenceFields` → `DoseTimeRow` and render "1 tablet" / "1.5 tablets" / "0.5 capsule".

Pluralization edge: `0.5` and `1.5` should both pluralize to "tablets" / "capsules" (per English convention — only `1` is singular).

## Issue 3: "Save schedule" doesn't advance on Vercel preview

**Root cause is a UX state-machine bug, not a server bug.** The screenshot `heartnote-current-broken-state.png` shows it: in Specific Days cadence, group 2 claims all 7 days (pills dark), leaving group 1's pills disabled (claimed-by-others). But group 1 still has two dose-times entered (6:25 AM, 9:25 AM). Per the Zod refinement in `actions.ts` for `cadence_kind = 'specific_days'`, every dose-time must have a non-null `applies_to_dow` ≥ 1. The dose-times in group 1 hit `appliesToDow = 0` (placeholder) when the group has no days picked — Zod rejects on save, the scan-client's `saveHeadWithCadence` swallows the error, and the UI stays on the same screen.

The structural fix is the Apple-Health rule documented under Issue 1 above: prevent bitmap=0 from being reachable in the first place. Once the day-pills component refuses to deselect the last day in a group, this entire bug class is impossible.

Belt-and-suspenders sub-fixes worth doing alongside the structural one:
- Surface the save error in `scan-client.tsx`'s catch path — render `result.errors[0]` the same way the per-card error renders elsewhere in the scan flow. Today the failure is silent.
- Block the "Add time" affordance for any group with bitmap=0 — a group needs days before it can have times.
- Audit `setGroupBitmap` for any path that can leave dose-times with `appliesToDow = 0` (the auto-remove patch only fires when an *existing* group's bitmap drops to 0; a fresh-from-newDraft group already starts at 0).

Repro on Vercel preview: sign in, scan a med, pick Specific Days, claim all 7 days in group 2 BEFORE adding times to group 1, then add times to group 1, tap Save schedule. Network panel should show the RPC return with a Zod message; the UI shows nothing.

## Required reading (in order)

```
CLAUDE.md
AGENTS.md
.claude/rules/feature-workflow.md
.claude/rules/code-quality.md
.claude/rules/auth-sessions.md
.claude/rules/destructive-actions.md
.claude/rules/acceptance-criteria.md
docs/plans/medications-schedule-cadence-v1.md
```

The spec doc reflects what shipped in PR #41 — start there for a baseline before diffing what these follow-ups change.

## Files for issue 1 (cadence flatten)

```
src/app/me/medications/cadence/cadence-flow.tsx        — two-step orchestrator; collapse into one
src/app/me/medications/cadence/cadence-picker.tsx      — currently full-screen; convert to bottom-sheet
src/app/me/medications/cadence/cadence-fields.tsx      — sub-fields; merge with the kind row into one screen
src/app/me/medications/cadence/day-pills.tsx           — keep as-is; already a row component
src/app/me/medications/medications-form.tsx            — calls CadenceFlow from edit context
src/app/me/medications/scan/scan-client.tsx            — calls CadenceFlow from scan context (saveHeadWithCadence)
src/app/me/medications/new/medication-wizard.tsx       — calls CadenceFlow as wizard step 4
src/lib/medications/cadence.ts                         — constants + formatCadenceSummary (no change expected)
src/components/ui/                                     — verify whether shadcn Sheet/Dialog exists; otherwise build a small bottom-sheet
```

## Files for issue 2 (form-aware quantity)

```
src/lib/medications/rxnorm.ts                          — normalizeForm() + FORM_DISPLAY map (source of truth)
src/app/me/medications/cadence/cadence-fields.tsx      — formatQuantity() lives here; takes a `form` param
src/app/me/medications/medications-form.tsx            — pass `form` prop through to CadenceFlow
src/app/me/medications/new/medication-wizard.tsx       — pass `state.form` through
src/app/me/medications/scan/scan-client.tsx            — pass headMed.form through to CadenceFlow
src/lib/medications/scan/schema.ts                     — ResolvedMed.form definition (read-only reference)
```

## Files for issue 3 (save-not-advancing investigation)

```
src/app/me/medications/scan/scan-client.tsx                            — saveHeadWithCadence; trace error path
src/app/me/medications/scan/extracted-to-payload.ts                    — payload shape sent to addExtractedMedications
src/app/me/medications/actions.ts                                      — addExtractedMedications + saveMedication; check error returns
src/lib/supabase/server.ts                                             — server-side auth client; verify cookie propagation
src/lib/supabase/client.ts                                             — client-side; check session validity
src/app/onboarding/page.tsx                                            — patient row creation flow (if user skipped, RLS blocks)
src/app/onboarding/actions.ts                                          — patient insert action
supabase/migrations/20260428153829_initial_schema.sql                  — patients + medications RLS policies
supabase/migrations/20260506000000_medication_cadence.sql              — save_medication_with_dose_times function
supabase/migrations/20260506010000_medication_cadence_rpc_symmetry.sql — RPC patch
```

## Process

Per `.claude/rules/feature-workflow.md`:

1. Worktree: `git worktree add -b medications-cadence-flatten .claude/worktrees/medications-cadence-flatten main` then `cd` in and `npm install` (real install, not symlink)
2. Spec the three follow-ups with ACs (per `acceptance-criteria.md`)
3. Fresh-context plan-review subagent
4. Revise → implement → fresh-context code-review subagent → patch
5. PR + CI watch + squash-merge

The user prefers terse direct collaboration; no "let me brainstorm" preambles. They are the director, not the operator — run commands yourself, don't dictate them.

## Out of scope (still deferred from PR #41)

- Behavior #2 (the user couldn't recall it during the original handoff; explicitly do NOT backfill from imagination)
- Per-med notification copy (current is aggregate "You have medications scheduled now")
- Real iOS device verification of notifications + DST (Capacitor plugin is no-op on web)
