# Acceptance criteria template

Loaded automatically (no path filter). When proposing acceptance criteria for any new feature, follow this structure. Don't skip categories — if a category is genuinely N/A, write `n/a — <reason>` so the absence is visible.

## Engineering — always include

These match the Karpathy principles in CLAUDE.md `IMPORTANT`. Restate the relevant ones for the feature at hand:

- [ ] Plan stated and approved before any code is written
- [ ] No new abstractions, frameworks, or generic helpers added unless explicitly requested
- [ ] Diff scoped to the feature; no unrelated formatting changes; no refactoring outside scope
- [ ] All ACs verifiable by reading specific behavior or running specific commands

## Functional — happy path

What the user sees when everything works. Each AC names a specific input and a specific observable output. **No vague verbs** like *works*, *saves correctly*, or *looks right*.

Bad: "The button works."
Good: "When the user clicks Record with mic permission granted, recording starts within 200ms and the button label changes to 'Recording — 30s remaining.'"

## Edge cases

Empty state. First-time user. Returning user. Min/max boundaries. Unusual but valid inputs.

## Error states

What happens when X fails — network, permission denied, validation rejected, missing data, expired session. **Each error path gets at least one AC.**

## Performance

Target latencies for user-perceptible operations: *"starts within 200ms," "renders within 2s," "uploads under 5s on a 4G connection."*

## Persistence

What gets saved, where, and what survives a refresh. Database row created? localStorage? URL state? In-memory only?

## Permissions / RLS

Who can do this? Who cannot? Are RLS policies on the relevant Supabase tables verified before any insert/select path is wired?

## Side effects

What else changes when this happens? New row in another table? Notification fired? Cache invalidated? Other UI updates?

## Manual verification

The exact steps a human can follow to confirm the feature works end-to-end. Should reproduce in under 2 minutes.

---

**When to skip the full template:**
- Trivial changes (one-liner fixes, typos): use judgment per Karpathy guideline #2 ("simplicity first").
- Documentation-only changes: AC list of one — "the doc reads correctly."

**When NOT to skip:**
- Anything touching alerts, voice-log, clinical content, AI output, or auth. Always run the full template.

If a category is unusually empty, that's a signal — push back on yourself or the requester before proceeding.
