<!-- Budget: warning at 100 lines, soft cap at 150. Add a rule, remove or move one first. -->
<!-- DO NOT re-read this file once loaded. Same for research/chf-source-of-truth.md. -->
@AGENTS.md

# HeartNote — CHF caregiver companion (PRE-LAUNCH, ZERO CUSTOMERS)

Voice-first daily logging, AI trend detection, and red-alert warnings for adult-child caregivers of parents with congestive heart failure.

## IMPORTANT

### Cite the research file
**Cite `research/chf-source-of-truth.md` for every clinical claim, threshold, or alert copy. Never invent a number.**

That file holds the thresholds, dose rules, copy register, and alert tier definitions this app is allowed to produce. Uncited clinical content is a bug.

### Coding discipline (Karpathy guidelines)

These rules are the failure point for a lot of LLM-generated code. Follow them on every code change.

**Tradeoff:** these guidelines bias toward caution over speed. For trivial tasks, use judgment.

#### 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

#### 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Test: would a senior engineer say this is overcomplicated? If yes, simplify.

#### 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

Test: every changed line should trace directly to the user's request.

#### 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state the plan:
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria require constant clarification.

### No backwards-compatibility
**No backwards-compatibility, no migration paths, no fallbacks for "existing customers." Pre-launch — change what needs changing.**

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind 4 · shadcn/ui · Supabase (Postgres + Auth + RLS) · Capacitor (iOS + Android) · Anthropic Claude API · Whisper · Stripe · Vercel

## Commands
```bash
npm run dev                 # Dev server
npm run build               # Production build (timeout 300000, NEVER background)
npm run lint                # Lint
supabase db push            # Apply migrations BEFORE merging migration changes
```

## Git / PR
**Always use worktrees for feature work. Never edit on `main`. Never `git checkout` to switch branches.** Create `.claude/worktrees/<feature>` as the first action of any non-trivial task — before reading code, before editing — so changes never accumulate on `main`.

Flow: worktree → edit → commit → `git push` → `gh pr create` → `gh pr checks --watch` → on pass, **`cd` back to the main worktree first**, then `gh pr merge --squash` → `git worktree remove .claude/worktrees/<feature>` → `git branch -D <feature>` → `git pull --ff-only origin main`. Order matters: running `gh pr merge` from inside the feature worktree fails on the local-sync step (`main is already used by worktree`), and `git branch -D` fails while the worktree still has the branch checked out. The remote head branch deletes automatically (repo setting `delete_branch_on_merge=true`).

## Migrations
If you created or modified anything in `supabase/migrations/`, run `supabase db push` before merging.

## Build conventions
*(These move to `.claude/rules/*.md` with path triggers in Pass 2.)*

1. **RLS-first.** Every new Supabase table gets RLS enabled and policies written before any code reads/writes it.
2. **Use `@/lib/supabase/{client,server,middleware}` only.** Never instantiate Supabase clients directly in components.
3. **Anthropic calls: prompt caching enabled from day 1.** Sonnet 4.6 for trend synthesis, Opus 4.7 for visit-report drafting.
4. **AI alerts must show their reasoning** in the UI ("weight up 4 lb over 5 days AND extra pillows logged AND nocturnal cough — pattern often precedes decompensation").
5. **Pass the grelief test on every caregiver-facing line.** No chirpy "you're doing great"; no funeral-serious. Sit with the oscillation.
6. **Never recommend dose changes** in any AI output. Direct to the prescriber.
7. **Life-safety features are free forever.** Voice log, red alerts, "call the cardiologist" script. No paywall checks on those routes.
8. **Voice log is the non-negotiable core.** Prefer voice over forms.
9. **No half-finished implementations.** Hide unfinished features behind a flag — never ship a dead button.
10. **Validate inputs at boundaries.** Zod at form fields and API routes.
11. **Environment variables fail closed.** Missing secret → throw, never substitute a default.
12. **Design system is spec.** `docs/design/heartnote-home-mockup.html` is the source-of-truth for visual register, component anatomy, and screen composition. **Read the relevant section before creating or modifying any UI component, page, or visual element.** When the design and `.claude/rules/canonical-controls.md` disagree, the design wins by default and the rule file gets updated to match.

## References
- Product strategy → `docs/product.md`
- Build status → `docs/status.md`
- **Design system → `docs/design/heartnote-home-mockup.html` (read before any UI work)**
- Clinical research master → `research/chf-source-of-truth.md`
- Topic deep-dives → `research/01-clinical-thresholds.md`, `02-medications.md`, `03-caregiver-education.md`, `04-caregiver-language.md`, `05-competitor-apps.md`
- Removed content (history) → `docs/archive/claude-md-history.md` (not loaded; for reference)
