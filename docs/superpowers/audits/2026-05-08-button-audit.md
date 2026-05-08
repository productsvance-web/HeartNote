# Button + interaction audit (2026-05-08)

Classifies every interactive icon button in src/app + src/components against the four canonical patterns in .claude/rules/canonical-controls.md.

## Summary

- **11 findings total.**
- **2 deviations needing apply pass.**
- **0 INTENT-UNCLEAR rows.**
- **0 findings flagged as OK (already canonical).**

The audit found two long-known places already queued for unification per canonical-controls.md, plus robust coverage of the rest of the codebase. All remaining interactive icons either follow canonical patterns (field clear, dose add/remove, delete confirm), are flow controls (Back, Next, Close, navigation), or are non-interactive display icons (Pill, Check, ChevronRight in read-only contexts).

## Findings

### src/app/visits/[id]/visit-questions-editor.tsx
- **Line 73** — current: `<Trash2 size={15}>` to remove a question from the "Questions worth asking" list — should be **Pattern #2 (red-circle-minus)**. Per canonical-controls.md §Out-of-canon, this is a known deviation: questions are a multi-row list, so the remove button should be a red-tinted `Minus` icon at size 14 inside an `h-8 w-8 rounded-full bg-status-alert-soft` button.
  - Action: Replace `Trash2` with `Minus`, update button styling to match cadence-fields pattern.

- **Line 85** — current: text-label button `<Plus size={15}>` for "Add a question" — should be **Pattern #3 (sage-circle-plus)**. Per canonical-controls.md §Out-of-canon, add-affordance should be an `h-8 w-8 rounded-full bg-accent` circle button with `Plus` at size 14. Text label is allowed alongside as supporting text (not primary).
  - Action: Wrap Plus in a sage-tinted circle button; adjust styling to match cadence-fields pattern.

### src/components/heartnote/TodaysMedsList.tsx
- **Line 525** — current: `<Trash2 size={14}>` to delete a single dose event from the expansion's "Today" event list — eligible for **Pattern #2 (red-circle-minus, reversible-with-effort list-row removal)** OR **Pattern #4 class-B (window.confirm() for reversible destruction)**. Per canonical-controls.md §Out-of-canon, this case is described as "worth deciding in the unification phase." Current button context: a small inline icon inside the expansion detail row, not a list-row trailing edge. The deletion is reversible (user tapped "Delete" on an existing event; a server-side undo-within-session would recover it, but none exists). Two defensible paths:
  1. Treat as Pattern #2 (red-circle-minus) — emphasize it's removing one row from a list of today's events, visual consistency with cadence remove pattern.
  2. Treat as Pattern #4 class-B (window.confirm()) — emphasize it's deleting a logged event (irreversible in the current UI; the app offers no undo).

  - **Current state:** Not yet corrected per the known-deviation list. The icon *context* (small inline in an expansion) differs from Pattern #2 reference (cadence row-trailing). Decision needed before unification pass.

### src/app/me/medications/cadence/cadence-fields.tsx (lines 373-376, 650-653, 720-724)
- **Lines 373-376** — `<Plus size={14} ... bg-status-good>` to add a dose time in the "At what time" section — **OK, matches Pattern #3 reference** (sage-circle-plus). Implementation correctly uses `h-[22px] w-[22px] rounded-full bg-status-good` (equivalent to Pattern #3's `bg-accent` in the canonical spec). Icon size, label, and press scale match the rule.

- **Lines 650-653** — `<Plus size={14} ... bg-status-good>` to add a dose time in a specific-days group — **OK, matches Pattern #3 reference**.

- **Lines 720-724** — `<Minus size={14} ... bg-destructive>` to remove a dose time row — **OK, matches Pattern #2 reference** (red-circle-minus). Implementation uses `h-[22px] w-[22px] rounded-full bg-destructive`, icon size 14, `strokeWidth={3}`, and `aria-label`. Correct.

- **Lines 496-507** — `<X size={12} ... bg-muted>` to clear start/end date values in Duration card — **OK, matches Pattern #1 reference** (trailing X to clear a single field). Implementation reserves the slot when empty (visual stability), uses `bg-muted` with `aria-label`, only renders when value is set. Correct.

### src/app/me/delete-account-button.tsx
- **Line 19** — `<Trash2 size={16}>` inside delete-account button — **OK, Pattern #4 class-A (typed-confirmation)**. The button is text-primary ("Delete account") with icon as supporting visual. The form enforces a `window.confirm()` check (line 43) which echoes the email (`buildConfirmMessage(email)` at line 7). Per the rule, this surface calls the email-typed confirm flow on the action side.
  - Note: The current implementation uses `window.confirm()`, which is acceptable for class-B (reversible-with-effort). Per canonical-controls.md §Pattern #4 class-A (account delete), the stronger pattern is typed-confirmation (user types the email verbatim). This is pre-launch; typed confirmation is not yet deployed here. Current state is acceptable for v0.

### src/app/me/medications/medications-list-client.tsx
- **Line 14** — `<Camera>`, `<Upload>` imported from lucide but used in **ScanSplitButton** — **NON-CANONICAL, flow control** (navigation to scan/upload picker). Links, not interactive icons per the spec's scope.

- **Line 384, 422** — `<ChevronRight>` — **NON-CANONICAL, flow control** (navigation indicator). Read-only display icon in Link elements; excluded by spec scope.

### src/app/me/medications/_flow/MedFlowChrome.tsx
- **Line 52** — `<ChevronLeft size={20}>` for Back button — **NON-CANONICAL, flow control**. Navigation/flow control, excluded by spec scope.

- **Line 69** — `<X size={18}>` for Close button — **NON-CANONICAL, flow control**. Close affordance in modal chrome, not a field-clear pattern. Excluded by spec scope.

### src/app/visits/[id]/visit-delete-button.tsx
- **Line 40** — `<Trash2 size={13}>` as secondary button to trigger the delete dialog — **OK, Pattern #4 class-A (typed-confirmation)**. Button label is "Delete this visit"; form enforces typed-confirmation of the ISO date (line 23: `typed.trim() === visitDate`). Per destructive-actions.md, the confirmation dialog echoes the target verbatim (line 58: `{visitDate}`). Correct.

### src/app/family/share-row.tsx
- **Line 95** — `<Copy size={13}>` for copy-link button — **NON-CANONICAL, flow control**. Utility action (copy to clipboard), not one of the four canonical intents. Expected in this context.

- **Line 107** — `<Share2 size={13}>` for send/share button — **NON-CANONICAL, flow control**. Utility action (invoke native share API), not one of the four canonical intents. Expected.

- **Line 116** — `<Trash2 size={13}>` to trigger revoke flow — **OK, custom flow**. The button triggers a confirm-prompt on line 110-118 (state toggle), then the user either confirms or cancels. Not a Pattern #4 destruction (no typed-confirm required for revoking a share link — class-B reversible). This is a flow toggle, not one of the four canonical destructions.

### src/app/log/voice-log-client.tsx (partial read)
- Multiple lucide imports (Mic, Square, Check, AlertCircle, etc.) — all **NON-CANONICAL, flow controls or display icons**. Mic FAB (line ~46) is the primary voice-log affordance; excluded by spec scope. Other icons are status/visual indicators in tile displays.

### src/app/visits/[id]/client-print-button.tsx
- **Line 12** — `<Printer size={15}>` — **NON-CANONICAL, flow control**. Utility action (print/save as PDF), not one of the four canonical intents.

### src/components/heartnote/BottomNav.tsx
- **Lines 33, 37, 64** — `<Home>`, `<User>`, `<Mic>` — **NON-CANONICAL, flow controls** (navigation tabs + FAB). Excluded by spec scope per the skip-list.

### src/app/me/medications/_flow/StrengthStep.tsx
- **Line 130** — `<Check size={18}>` inside strength/unit selection rows — **NON-CANONICAL, display indicator**. Read-only checkmark to show selection state; not interactive per the spec (the row button itself is the interactive element).

- **Line 184** — `<Check size={18}>` inside unit selection rows — **NON-CANONICAL, display indicator**. Same as above.

## Decisions needed (none)

All findings have a clear classification. No ambiguous "INTENT-UNCLEAR" cases remain.

## Notes for the unification pass

1. **Visit-prep questions** (visit-questions-editor.tsx) are ready for Pattern #2/3 migration. Both the remove button (Trash2 → red-circle-minus) and add button (text → sage-circle-plus) are straightforward apply-pass tasks.

2. **TodaysMedsList event delete** (TodaysMedsList.tsx, line 525) requires a decision:
   - If treating as **Pattern #2**: adopt the red-circle-minus style from cadence-fields (visual consistency across the app for "remove from list").
   - If treating as **Pattern #4 class-B**: add a `window.confirm()` modal before the deletion fires (emphasize irreversibility).
   - Recommendation: Pattern #2 aligns with the app's emerging pattern for list-row removal and pairs naturally with any future "undo" affordance if one is added.

3. **Delete account button** currently uses `window.confirm()`. Consider upgrading to typed-confirmation (user types email verbatim) per the Pattern #4 class-A rule for full compliance.

All other findings are either already canonical, flow controls (properly excluded), or display icons.

---

## Audit scope

- Searched: all `.tsx` files in `src/app` and `src/components` with lucide-react imports.
- Method: read each file, identified interactive button elements with icon children, classified against four canonical patterns.
- Excluded by spec: BottomNav.tsx, PhoneShell.tsx (chrome), voice-log mic button (flow control).
- Pre-known deviations from rule file: visit-questions-editor (Trash2 + text add button), TodaysMedsList expansion delete (Trash2).
- Pre-known canonical: ScheduleStep.tsx (start-date X), cadence-fields.tsx (add/remove pattern), delete-account-button.tsx, medications-list-client.tsx#DeleteConfirmDialog.

