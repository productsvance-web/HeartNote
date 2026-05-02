# HeartNote — Build Status

> Current state of the codebase. Read this before starting new feature work.

## Live
- Scaffold (Next.js 16 App Router, TypeScript, Tailwind 4, shadcn/ui)
- Schema (Supabase Postgres with RLS on every user-data table)
- Auth (magic-link sign-in)
- Onboarding (4-step caregiver wizard)
- Dashboard (status ring, sparklines, bottom nav)
- Voice log (record → upload → `daily_logs` row → Claude Sonnet 4.6 extraction with cached research-file system prompt)
- Visual identity (cream + sage palette, Fraunces font, ported from Lovable mockup)
- HTTPS dev server (so getUserMedia works on phone over LAN)

## Next (in dependency order)
1. **Alert tier-detection logic.** Three other features (push notifications, trend cards, visit reports) read from it, so build it first.
2. **Push notifications.** Requires Capacitor native shell + APNs/FCM keys.
3. **Auto-generated visit-report draft.** Depends on alerts and trends being populated.
4. **Read-only family share link.** Independent of the others; can be parallelized.
5. **Stripe paywall on paid features.** After the architecture work in Pass 2.

## Follow-ups (post-launch)
- **Vertex AI auth → OIDC + Workload Identity Federation.** Medication-scan v1 uses long-lived service-account JSON (`GOOGLE_VERTEX_AI_CREDENTIALS_JSON`) on Vercel. Acceptable pre-launch / zero-customers; rotate to keyless OIDC before any real PHI volume.

## Recent commits
Run `git log --oneline -25` for recent work.
