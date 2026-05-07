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
- **Phase 1 alert engine — rules-only v0** (PR #54, 2026-05-06):
  - `src/lib/clinical/thresholds.ts` — every clinical number cited to research §2/§3
  - `src/lib/alerts/evaluate.ts` — `evaluateAlertTier()` runs after each dictation, picks the worst-tier rule that fires, returns triggers + cold_start flag
  - `daily_assessments` table — one verdict row per (patient, log_date), upserted on every dictation
  - `daily_log_symptom_events.postural` (dizziness-only via CHECK) — closes the orthostatic-vs-persistent dizziness gap
  - Home screen reads the assessment row and renders one of five paths: tier 1 / tier 2 / tier 3 alert blocks with tap-to-call CTAs (cardiologist tel: link, fallback to Settings if no phone on file), tier 4 + cold-start "Building baseline · N of 7 days," tier 4 + steady StatusRing
  - Knowingly deferred (documented in `evaluate.ts` header): NYHA-creep dyspnea trend, nausea / early-satiety persistence, lethargy, fatigue frequency-vs-baseline. LLM reasoning layer + writes to `alerts` table = v0.5.

## Next (in dependency order)
1. **Push notifications.** Requires Capacitor native shell + APNs/FCM keys. Reads `daily_assessments` for the trigger.
2. **LLM reasoning layer (v0.5).** Hands the rules-only triggers to Claude for cardiologist-script generation; populates the `alerts` table for the action lifecycle (acknowledged_at, action_taken). Add the deferred §2 rules (NYHA-creep, persistence, lethargy, fatigue baseline) as part of this pass.
3. **Auto-generated visit-report draft.** Depends on alerts and trends being populated.
4. **Read-only family share link.** Independent of the others; can be parallelized.
5. **Stripe paywall on paid features.** After the architecture work in Pass 2.

## Follow-ups (post-launch)
- **Vertex AI auth → OIDC + Workload Identity Federation.** Medication-scan v1 uses long-lived service-account JSON (`GOOGLE_VERTEX_AI_CREDENTIALS_JSON`) on Vercel. Acceptable pre-launch / zero-customers; rotate to keyless OIDC before any real PHI volume.

## Recent commits
Run `git log --oneline -25` for recent work.
