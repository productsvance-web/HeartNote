# HeartNote — Build Status

> Current state of the codebase. Read this before starting new feature work.

## Live
- Scaffold (Next.js 16 App Router, TypeScript, Tailwind 4, shadcn/ui)
- Schema (Supabase Postgres with RLS on every user-data table)
- Auth (magic-link sign-in)
- Onboarding (4-step caregiver wizard)
- Dashboard (status ring, sparklines, bottom nav)
- Voice log (record → upload → `daily_logs` row → Claude Sonnet 4.6 extraction with cached research-file system prompt)
  - Phase 0 schema fields for the alert engine (PR #48, 2026-05-06): `pulse_irregular`, `dizziness`, `nausea`, `white_frothy`, `resolves_overnight` (swelling-only via CHECK), `activity_step_change` (cause-agnostic functional change), fatigue-no-severity CHECK
- Visual identity (cream + sage palette, Fraunces font, ported from Lovable mockup)
- HTTPS dev server (so getUserMedia works on phone over LAN)

## Next (in dependency order)
1. **Alert tier-detection logic (Phase 1).** Schema gaps closed in Phase 0; this is the engine itself: `src/lib/clinical/thresholds.ts` constants module + `daily_assessments` table + `evaluateAlertTier(log, patient)` function in `src/lib/alerts/evaluate.ts` + cold-start handling + wire to home screen's three states. Rules-only v0 first (no LLM), personal-baseline + LLM reasoning layered on after. Three other features (push notifications, trend cards, visit reports) read from it. One known prerequisite: dizziness symptom needs a postural qualifier to distinguish tier-3 orthostatic from tier-2 persistent — see memory `project_phase_1_orthostatic_gap`.
2. **Push notifications.** Requires Capacitor native shell + APNs/FCM keys.
3. **Auto-generated visit-report draft.** Depends on alerts and trends being populated.
4. **Read-only family share link.** Independent of the others; can be parallelized.
5. **Stripe paywall on paid features.** After the architecture work in Pass 2.

## Follow-ups (post-launch)
- **Vertex AI auth → OIDC + Workload Identity Federation.** Medication-scan v1 uses long-lived service-account JSON (`GOOGLE_VERTEX_AI_CREDENTIALS_JSON`) on Vercel. Acceptable pre-launch / zero-customers; rotate to keyless OIDC before any real PHI volume.

## Recent commits
Run `git log --oneline -25` for recent work.
