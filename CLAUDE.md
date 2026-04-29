<!-- Budget: warning at 100 lines, soft cap at 150. Add a rule, remove or move one first. -->
<!-- DO NOT re-read this file once loaded. Same for research/chf-source-of-truth.md. -->
@AGENTS.md

# HeartNote — CHF caregiver companion (PRE-LAUNCH, ZERO CUSTOMERS)

Voice-first daily logging, AI trend detection, and red-alert warnings for adult-child caregivers of parents with congestive heart failure.

## IMPORTANT

**Cite `research/chf-source-of-truth.md` for every clinical claim, threshold, or alert copy. Never invent a number.**

That file holds the thresholds, dose rules, copy register, and alert tier definitions this app is allowed to produce. Uncited clinical content is a bug.

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
`git push` → `gh pr create` → `gh pr checks --watch` → on pass `gh pr merge --squash`. Never leave a PR open for the user. One branch per fix/feature; delete after merge.

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

## References
- Product strategy → `docs/product.md`
- Build status → `docs/status.md`
- Clinical research master → `research/chf-source-of-truth.md`
- Topic deep-dives → `research/01-clinical-thresholds.md`, `02-medications.md`, `03-caregiver-education.md`, `04-caregiver-language.md`, `05-competitor-apps.md`
- Removed content (history) → `docs/archive/claude-md-history.md` (not loaded; for reference)
