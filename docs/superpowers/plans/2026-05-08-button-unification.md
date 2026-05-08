# Button + interaction unification (fully fleshed)

> The canonical patterns live in `.claude/rules/canonical-controls.md` (auto-loaded). This plan is the audit + apply pass that brings every existing surface in line with that rule. Read the rule file before starting; don't re-litigate the four canonical patterns here.

## Mandate

The app currently ships four incompatible icon registers for similar actions: a Trash2 icon to remove a visit-prep question, an X to clear a medication start date, a green-circle-plus to add a dose time, a red-circle-minus to remove a dose time. The user's directive: pick canonical patterns and apply them everywhere, so the app feels like one product.

Canonical patterns (per `canonical-controls.md`):
- **Clear a single field value** → trailing `X` inside the input.
- **Remove one row from a multi-row list** → red-tinted circle with `Minus` glyph.
- **Add one row to a multi-row list** → sage-tinted circle with `Plus` glyph.
- **Delete an entity (irreversible)** → typed-confirmation per `destructive-actions.md`.

## Audit pass — required before ANY edits

The executing session must walk every interactive icon-button across the app and write down the current treatment vs. the canonical treatment, before changing anything. Output: `docs/superpowers/audits/2026-MM-DD-button-audit.md` with one row per finding.

### How to walk

```bash
# Find every Lucide icon usage in the app (these are the candidates)
grep -rn "from 'lucide-react'\|from \"lucide-react\"" src/app src/components | sort

# Then for each component file, find the icon names imported
grep -hPo "(?<=import \{)[^}]+(?=\} from ['\"]lucide-react)" src/app/**/*.tsx src/components/**/*.tsx | tr ',' '\n' | sort -u
```

Then for each icon import, locate the JSX usages:
```bash
# Example for Trash2
grep -rn "Trash2 " src/app src/components
grep -rn "<Trash2" src/app src/components
```

### Audit row format

Each audit finding writes one row in this shape:

```
- **{file_path}:{line}** — current: `<Trash2 size=14>` for "remove a question from a list" → canonical: Pattern #2 (red-circle-minus, see canonical-controls.md). Action: replace.
```

If a row's intent is ambiguous, mark it `INTENT-UNCLEAR` and ask the user before deciding.

### Known starting set (incomplete; the audit pass extends this)

Pre-identified deviations (from earlier session's review):

| File | Line | Current | Canonical | Notes |
|---|---|---|---|---|
| `src/app/visits/[id]/visit-questions-editor.tsx` | TBD | `Trash2` icon to remove a question | Pattern #2 (red-circle-minus) | Multi-row list; entity-level destruction would need typed confirm. |
| `src/app/visits/[id]/visit-questions-editor.tsx` | TBD | `+ Add a question` text-only button | Pattern #3 (sage-circle-plus, label allowed alongside) | |
| `src/components/heartnote/TodaysMedsList.tsx` | ~340 | `Trash2` icon for individual dose-event delete | Pattern #4 (`window.confirm()` because reversible-with-effort) OR Pattern #2 (treat as list-row removal) | Decide in the audit. |
| `src/app/me/medications/medications-list-client.tsx` | TBD | Multi-select bulk Stop/Delete via toolbar buttons | Stays — entity-level destruction with typed confirm | This is correct already. |
| `src/app/family/share-row.tsx` | TBD | "Revoke" button on each share row | Pattern #4 — class B (reversible-with-effort: token can be re-issued)? OR Pattern #2 if shares are list rows? | Decide in audit. |

## Apply pass — one file at a time

After the audit, the executing session applies changes. **Each file is its own commit.** Don't batch. Reasons:
1. If the user redirects partway, only one file's worth of work needs revisiting.
2. Each canonical change is small and reviewable in isolation.
3. The PR (or merge) history reads as a clean per-surface unification.

### Per-file apply checklist

For each file with a canonical-deviation finding:
- [ ] Read the entire file. Understand the data flow around the control.
- [ ] Read `.claude/rules/canonical-controls.md` for the target pattern's exact spec.
- [ ] Make the edit. Match the spec — don't approximate.
- [ ] Verify aria-label is set per the pattern.
- [ ] Verify hit area ≥ 32×32.
- [ ] Verify press-state is `active:scale-[0.94]` (not `0.98` — the user-tested cadence pattern uses 0.94 for these small icon buttons).
- [ ] Lint clean.
- [ ] Build clean.
- [ ] Commit with message `style(canonical): {file} — {control kind} now uses Pattern #N`.

### Acceptance criteria — apply phase

#### Engineering
- [ ] Each file's change is its own commit. Squash only if the user explicitly asks.
- [ ] No new utility components added unless the pattern requires it (unlikely — the canonical controls are all inline button JSX).
- [ ] All ACs verifiable by reading the diff against the rule file.

#### Functional
- [ ] Visit-prep questions: tap red-minus on a question → question removed; question count decrements; the `questions_to_ask` jsonb column updates.
- [ ] Visit-prep questions: tap sage-plus → new empty question row appears at the bottom; auto-focus the new row's textarea; column updates on save.
- [ ] Today's meds, expansion panel: dose-event delete uses the canonical pattern decided in the audit (red-minus OR confirm()-then-delete).
- [ ] Family share row: revoke action uses the canonical pattern decided in the audit.

#### Edge cases
- [ ] Removing the last item in a list: list collapses to "No questions yet" empty state, not a broken row.
- [ ] Adding when the list is empty: empty state replaced by a list with one row.
- [ ] Add button shouldn't be enabled while a save is in flight (avoid double-add). Disabled state during `useTransition`'s `isPending`.

#### Persistence
- [ ] Add/remove from a list writes through the existing server actions (don't introduce new ones).
- [ ] Optimistic UI update: row appears/disappears immediately; rollback on server error.

#### Permissions / RLS
- [ ] Existing RLS unchanged — these are visual changes to existing actions.

#### Side effects
- [ ] Press-feedback animation: `active:scale-[0.94]`. No bounce.
- [ ] No new analytics events added.

#### Manual verification
1. Open `/visits/[id]` on a real visit with 3 questions. Verify each row has a sage-soft-plus next to a 9pt eyebrow "QUESTIONS" and a red-circle-minus on the right of each row.
2. Tap red-minus on question 2 → row removed within one render frame; reload preserves.
3. Tap sage-plus → new empty row appears, auto-focus the textarea.
4. Repeat manual verification for each other surface in the audit (family revoke, dose-event delete, etc.).

## Cross-cutting

- Stay on whatever feature branch the executing session creates. Don't push to main.
- After the audit doc is written and approved, each apply commit follows the per-file checklist above.
- Lint + build clean per commit (or at the end if commits are tightly grouped).
- `npm run dev` and visual verification on the preview before committing the final apply commit.

## Open questions for the user before the audit pass

- **Dose-event delete on /dashboard:** keep the existing `Trash2` + no-confirm flow (current), OR move to red-circle-minus, OR add a `window.confirm("Delete the dose at 8 AM?")` per Pattern #4 class B? Recommend Pattern #4 class B — the action is reversible-with-effort (caregiver can re-log), but a misclick is annoying.
- **Family share revoke:** revocation is reversible (the caregiver can create a new share at any time). Recommend Pattern #4 class B with a confirm() that echoes the recipient label.
- **Onboarding wizard "Back" button:** current text-label "Back" — leave alone? Yes — Back navigation isn't in any of the four canonical kinds; it's a flow-control, not a list/field/entity action.

## What this plan does NOT do

- Does not introduce a `<CanonicalAddButton>` / `<CanonicalRemoveButton>` component. Per Karpathy: rule of three. Three places use the patterns currently; that's the threshold. After this unification pass we'll be at 5–7 places — *that's* when the abstraction earns its keep. Until then, inline JSX with the canonical specs.
- Does not change the underlying server actions. Each file's add/remove flow keeps its existing action — only the visual control changes.
- Does not redesign the Onboarding wizard's progress dots, the medications-list-client edit-mode toolbar, or the BottomNav FAB. Those are flow controls, not the four canonical kinds.

## Estimated effort

- **Audit doc:** 1 session, no code, full sweep through every Lucide icon usage in `src/app` + `src/components`.
- **Apply pass:** 1–2 sessions depending on how many surfaces the audit surfaces. The user already named two (visit questions, dose-event delete). Audit may surface 4–8 more.

Total: ~2–3 sessions, with the audit doc landing first as a checkpoint.
