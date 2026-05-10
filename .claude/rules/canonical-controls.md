# Canonical interactive controls

Loaded automatically (no path filter). Required reading whenever adding or modifying any interactive control — button, icon-button, input clear-affordance, list-add/remove, delete-entity flow.

## Why this rule exists

The app has shipped multiple incompatible icon registers for similar actions (a Trash2 icon to remove a visit-prep question, an X to clear a medication start date, a green-circle-plus to add a dose time, a red-circle-minus to remove a dose time). That sprawl makes the app feel like four different products stitched together. This file is the canonical register for all six interaction kinds. Diverge only with explicit reason.

## The six kinds — and the canonical control for each

### 1. Clear a single field value

**Pattern:** trailing X *inside* the input (or at the right edge of the field's visual hit area).

- Lucide icon: `X` at size 14, `text-muted-foreground` default, `text-foreground` on hover/focus.
- Hit area: minimum 32×32 (Apple/WCAG); icon centered, padding eats up the rest.
- Visibility: only render when the field has a value to clear (no X on an empty input).
- aria-label: `Clear {field name}` (e.g., `Clear start date`).

**Reference implementation:** the medication-edit start-date X inside `_flow/ScheduleStep.tsx` (the user explicitly likes this one — match it).

**When to use:** any single-value input where the value can be removed without confirmation. Date pickers, dropdown selects with a "no choice" path, text inputs that can be empty, single-select tag pickers.

**Forbidden alternatives for this kind:**
- A separate "Clear" text button next to the field (visual noise).
- A trash icon to clear a field value (trash icons are reserved for list-row removal — see #2).

### 2. Remove an item from a list (multiple-allowed list)

**Pattern:** coral circle button with a `Minus` glyph at the trailing edge of the row.

- Visual: `inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-destructive`. The glyph is white. The 22px geometry is intentional: it sits flush in the row without dominating, and Apple's 32×32 hit-target floor is met by the surrounding row padding.
- Lucide icon: `Minus` at size 14, strokeWidth 3, `className="text-white"`.
- aria-label: `Remove {row identifier}` (e.g., `Remove 8:00 AM dose time`).
- Press scale: `active:scale-[0.94]`. No bounce.

**Reference implementation:** the cadence "at what time" rows (`src/app/me/medications/cadence/cadence-fields.tsx`) — the user explicitly likes this register and wants it everywhere multiples can be removed.

**When to use:** removing one row from a list where multiple rows can exist (visit-prep questions, dose times, family-share recipients in the future, etc.).

**Forbidden alternatives for this kind:**
- `Trash2` icon. Reserved for entity-level destruction (see #4).
- A small `×` icon. That register is the field-clear pattern (#1) and shouldn't shoulder list-row removal.
- A "Remove" text button. Inconsistent with the icon-only pattern in cadence-fields.

### 3. Add an item to a list (multiple-allowed list)

**Pattern:** green circle button with a `Plus` glyph, placed inline at the bottom of the list (not floated). A short text label sits to its right (`Add a Time`, `Add a question`).

- Visual: `inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-status-good`. The glyph is white. Same 22px geometry as Pattern #2 so the two registers read as a matched pair on the same page.
- Lucide icon: `Plus` at size 14, strokeWidth 3, `className="text-white"`.
- Label to the right: `text-sm font-semibold text-primary` (e.g., `Add a Time`). The icon is the canonical signal; the label is mandatory supporting text — the icon-only variant exists only when space is constrained.
- aria-label on the button: `Add {item type}` (e.g., `Add dose time`).
- Press scale: `active:scale-[0.94]`.

**Reference implementation:** the cadence add-dose-time button (`src/app/me/medications/cadence/cadence-fields.tsx`).

**When to use:** adding one row to a list where multiples are allowed.

**Forbidden alternatives for this kind:**
- A coral `+` button. Coral is the destructive register; adding is constructive.
- A `+ Add` text label as the primary affordance. Text labels are OK alongside the icon for first-time use, but the icon button is canonical and the label is the support, not the primary.

### 4. Delete an entity (irreversible destruction)

**Pattern:** typed-confirmation flow per `.claude/rules/destructive-actions.md`.

- Trigger button: text label ("Delete", "Delete account", "Delete medication"), styled as a coral pill (`bg-destructive text-destructive-foreground rounded-full`). NOT an icon-only button — the text matters.
- Confirmation dialog echoes the target's identifying field (email, drug name, visit date) verbatim.
- For class-A irreversible (account, repo, all-data), require typed-confirmation (user types the identity).
- For class-B reversible-with-effort (single voice log, single dose event), `window.confirm()` is acceptable.

**Reference implementation:** `src/app/me/delete-account-button.tsx` (typed-confirmation), `src/app/me/medications/medications-list-client.tsx#DeleteConfirmDialog` (typed for medication delete).

**Forbidden alternatives for this kind:**
- Inline `Trash2` icon-only with no confirmation step.
- An X. The X register is field-clear, not destructive.

### 5. Increment / decrement a numeric value

**Pattern:** white-circle minus / value-chip / white-circle plus, inline horizontal. Optional trailing register #1 X to clear when the value differs from the seed.

- Sub-buttons: `inline-flex h-9 w-9 items-center justify-center rounded-full bg-card border border-border`. Glyph: `Minus` / `Plus` lucide, size 14–16, strokeWidth 2.5, `text-foreground`.
- Hit target: 36×36 (Apple/WCAG floor 32×32 met). Disabled state at min/max: opacity 30%, no press.
- Value chip: `inline-flex items-center justify-center min-w-[96px] h-9 rounded-full bg-card border border-border text-base tabular-nums px-4`. Empty state shows the placeholder ("—" or "— lb") in `text-muted-foreground`.
- Press scale: `active:scale-[0.94]`. No bounce.
- aria-labels: `Decrement {field name}` / `Increment {field name}` (e.g., `Decrement weight`, `Increment pillow count`).
- **Clearing a touched value uses register #1**, not a third white circle. The X is size 14, `text-muted-foreground`, 32×32 hit area, rendered inline-trailing the plus button. Only visible when the value is non-default.

**Reference implementation:** `src/components/heartnote/manual-entry/StepperControl.tsx` (used on `/log/manual` for weight + pillow count).

**When to use:** numeric increment/decrement of a single value (weight, pillow count, dose-edit on med rows in PR 2). Distinct from the four other registers.

**Forbidden alternatives for this kind:**
- A free-text numeric input. Caregivers can fat-finger; ±0.2 lb taps are the discoverable way to land on 182.4.
- A separate white-circle X inside the stepper. Clearing is register #1; don't ship two X registers visually different.
- Coral or sage circles for ±. Coral is destructive (#2); sage is constructive-add (#3); steppers are neither — they edit a value in place.

### 6. Floating utility button (Apple-Weather-style bottom-bar)

**Pattern:** translucent cream circle (46×46), thin ink border, lucide glyph centered, fixed to a corner of the page, with backdrop blur. Used for page-level utility actions that DO NOT fit the four list/value registers — the equivalent of Apple Weather's "add to my locations" button.

- Visual: `inline-flex items-center justify-center rounded-full`. Width / height 46. Background `rgba(251, 247, 240, 0.55)` (translucent cream-card). Border `1px solid color-mix(in oklab, var(--ink) 22%, transparent)`. Color `var(--ink-soft)`. `backdrop-filter: blur(8px)` (and `-webkit-` prefix). Press scale `active:scale-95`.
- Lucide icon: any single-action verb glyph at size 20, strokeWidth 1.6.
- Position: `fixed`, bottom-right of the page (28px right padding, 22px from bottom). The pointer-events trick (parent `pointer-events-none`, button `pointer-events-auto`) lets the button float above scroll content without blocking the page.
- aria-label: descriptive verb (e.g., `Add weight`, `Tap to record`, `Open symptoms`).

**Reference implementations:**
- `src/components/heartnote/weight-trend/WeightTrendView.tsx` — the "+" Add weight button on /trends/weight.
- `docs/design/heartnote-log-redesign-mockup.html` — the mic and ear/symptom buttons on /log (mockup; not yet implemented in src/).

**When to use:** page-level utility actions that don't fit the inline list/value registers — adding a new entity to the page (a weight reading, a voice log), opening a related modal (the symptom sheet), or initiating a recording session. The button affords "do something at the page level" rather than "modify this specific row/value."

**Forbidden alternatives for this kind:**
- A solid sage-circle plus (register #3). That's for adding rows to a visible list. The bottom-bar button initiates a separate flow (a sheet) — different affordance.
- A coral pill button (register #4). The bottom-bar utility is constructive, not destructive.
- Multiple bottom-bar buttons in different visual styles on the same page. If a page needs more than one, both must use this register.

## Decision flow when adding a new interactive

```
What kind of action?

Clearing a single field value (one input, has a value, user wants empty)
  → Pattern #1: trailing X
  → reference: ScheduleStep start-date X

Removing one row from a multi-row list
  → Pattern #2: red-circle-minus
  → reference: cadence "at what time" remove

Adding one row to a multi-row list
  → Pattern #3: sage-circle-plus
  → reference: cadence "at what time" add

Deleting an entire entity (account, medication, visit, voice log)
  → Pattern #4: typed-confirmation per destructive-actions.md
  → reference: delete-account-button

Increment/decrement a numeric value
  → Pattern #5: white-circle stepper (− / value / +) + optional trailing #1 X
  → reference: /log/manual StepperControl

Page-level utility action (open a sheet, add an entity, start a flow)
  → Pattern #6: floating utility button (translucent cream, backdrop blur)
  → reference: /trends/weight Add-weight button
```

If the new action doesn't fit any of these six kinds, name what's different and ask. Don't invent a seventh register.

## Currently-out-of-canon places

All previously-listed offenders (visit-prep questions add/remove, TodaysMedsList event delete) were migrated in PR #57. The four canonical registers are consistent across the app as of 2026-05-08. New deviations should be flagged here as they're discovered.

## When a designer/spec asks for a non-canonical control

Surface the conflict before implementing. The canonical register wins by default; a deviation needs an explicit reason that the canonical pattern can't carry (e.g., space-constrained mobile keyboard accessory). Don't silently ship "the design said to use X."
