# Feature workflow — plan → review → revise → build → review → patch

Loaded automatically (no path filter). When the user requests a non-trivial feature, follow this sequence. Each external review uses Claude Code's built-in `Agent` tool to dispatch a subagent with **fresh context** — no shared memory, no bias from prior reasoning.

## The sequence

### 1. Plan
Propose a plan and acceptance criteria using `.claude/rules/acceptance-criteria.md`. **Do not write code.** State assumptions, name tradeoffs, present alternatives if any exist.

### 2. User approves the plan
Wait for explicit approval. Revise if pushback.

### 3. Plan review (fresh subagent)
Dispatch a subagent that does NOT see this conversation. Pass it: the plan, the relevant rule files to read, the relevant repo files. Prompt it to surface: missing ACs, vague ACs, scope creep, unrealistic assumptions, missing edge cases, conflicts with `.claude/rules/code-quality.md`.

Example:
```
Agent({
  description: "Review feature plan for <feature-name>",
  subagent_type: "general-purpose",
  prompt: "<full plan>\n\nRead these rule files first: .claude/rules/code-quality.md, .claude/rules/acceptance-criteria.md, CLAUDE.md.\n\nSurface: missing ACs, vague language, scope creep, assumption gaps, missing edge cases, conflicts with the rules. Report findings only — do not propose code."
})
```

### 4. Revise based on review
Address what's actionable. Push back on what isn't, with reasoning visible to the user.

### 5. Implement
Write the code. Stay scoped to the approved AC list. Karpathy guidelines from CLAUDE.md apply throughout.

### 6. Code review (fresh subagent)
After implementation, dispatch a code-review subagent (different from the planner — fresh context). Pass: the diff (`git diff main...HEAD`), the approved AC list, the relevant rule files. The subagent verifies each AC and checks for `.claude/rules/code-quality.md` violations.

Use `superpowers:code-reviewer` if available; otherwise `general-purpose`.

### 7. Patch
Fix issues flagged by the reviewer. Re-run code review only if the changes are substantial; otherwise proceed.

### 8. Ship via PR flow
`git push` to feature branch → `gh pr create` → `gh pr checks --watch` → squash-merge. Per CLAUDE.md `Git / PR` rule. The `block-push-to-main` hook enforces no direct push to main.

## When to skip steps

- **Trivial fixes** (one-line typos, obvious bug fixes): plan in a sentence, build, ship. Skip both subagent reviews.
- **Documentation-only changes**: plan in a sentence, build, ship. Skip both subagent reviews.
- **Anything touching alerts, voice-log, clinical content, AI output, or auth**: do not skip. Always run both reviews.

## Why this exists

A Claude session that planned + built has bias toward its own design. A fresh subagent has no such bias. Same insight as the Overstory framework, implemented with Claude Code's built-in `Agent` tool — no separate install, no infrastructure overhead.

## Cost note

Each subagent dispatch is API-billed. For one feature: roughly two extra agent runs (plan-review + code-review) on top of the implementation. A reasonable trade for the quality bump on consequential features. Skip the workflow on trivia.
