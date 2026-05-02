# login-v1 — current state (handoff doc, 2026-05-02)

## Where things stand

**PR:** #23 (https://github.com/productsvance-web/HeartNote/pull/23) — open, CI green on Vercel preview deployment.
**Branch:** `login-v1` (this worktree).
**Commits (3):**
- `4059531` feat(auth): replace magic-link with email+password and Google OAuth
- `9c0b2c7` fix(auth): patch review findings — recovery cookie, error sanitization, dedupe
- `ff95391` fix(auth): Phase 2 — gap analysis fixes, doc-driven

Code is sound. Lint + build pass. Two thorough subagent reviews completed (plan-review + code-review). All findings addressed.

## What's blocking merge

**SMTP email delivery is unreliable for some test signups, even though the plumbing is fully configured.**

Verified working in current state:
- Resend SMTP integration with Supabase: ✅
- Sender domain `noreply@claire.legal`: ✅ verified in Resend
- Delivery to Hotmail (jaypp35@hotmail.com → "Your Magic Link"): ✅ delivered per Resend log
- Delivery to Gmail (faveladude@gmail.com → SMTP test): ✅ delivered per Resend log
- A signup confirmation email DID flow through Resend (probe-1777698941@gmail.com → bounced because address didn't exist, but the send happened)

NOT working:
- The actual signup confirmation email to `faveladude@gmail.com` from the user's app-side signup attempt was never sent. Strong candidates:
  - Original signup happened when sender was still `onboarding@resend.dev` (Resend's sandbox) — Resend silently rejects sandbox sends to addresses other than the account owner
  - User did NOT clearly retry signup after sender was switched to `noreply@claire.legal` — needs verification
  - Possible per-email-address rate limit kicked in after multiple attempts on the same email

## Next-session investigation plan

1. **Smoke test with a fresh email** (the simplest validation):
   - Use Gmail `+suffix` aliasing: `products.vance+login-v1-test@gmail.com` → goes to user's real inbox, Supabase treats as fresh address (bypasses rate limit on prior addresses)
   - Sign up via preview URL: https://heart-note-git-login-v1-productsvance-8547s-projects.vercel.app/signup
   - Check Resend log at https://resend.com/emails — should appear within 5s
   - Check inbox + spam — should arrive within 60s
   - If both happen, **the system works**. The faveladude failure was a one-time consequence of the sender swap mid-flow.

2. **If that fresh email also fails to arrive:**
   - Check Supabase Auth Logs in dashboard (https://supabase.com/dashboard/project/jjuvsswrkibowvexbvro/auth/logs) for that signup attempt's row → look for any SMTP error
   - Check Resend log — was the send attempted? If yes, what status?
   - If Resend never received the call from Supabase: Vault vs Management API password storage discrepancy is still the suspect. User already pasted password via dashboard UI which should have written to Vault.

3. **If still broken after #2, pivot:**
   - **Option A: Roll back to magic link + Google.** Strip out password code, restore the original Vercel-style flow. ~2-3 hrs. Magic-link emails were demonstrably arriving at Hotmail (in Resend log).
   - **Option B: Upgrade Supabase to Pro ($25/mo).** Gets proper SMTP + Vault tooling + log API access + HIBP. May fix the silent SMTP issue. Can downgrade after.
   - **Option C: Different SMTP provider** (Postmark, AWS SES). Last resort.

## Configured state (don't redo)

**Supabase (project `jjuvsswrkibowvexbvro`):**
- Custom SMTP: ON, host `smtp.resend.com:465`, user `resend`, sender `HeartNote <noreply@claire.legal>`
- Email templates: confirmation + recovery + password-changed + identity-linked all populated with caregiver-register copy
- Email confirmations: ON
- Secure email change: ON
- Identity-linked + password-changed notifications: ON
- HIBP leaked-password protection: OFF (Pro-only)
- Password min: 8 chars, no complexity rules
- Google provider: enabled with Client ID + Secret
- Site URL + redirect allow-list (incl. Vercel wildcard) configured

**Google Cloud (project `heartnote-495101`):**
- OAuth 2.0 Web client "HeartNote Web (Supabase)" created
- Redirect URI: `https://jjuvsswrkibowvexbvro.supabase.co/auth/v1/callback`
- Consent screen published (in production), scopes `openid email profile`

**Resend:**
- API key has Sending access only (can't read logs from CLI; check dashboard for delivery status)
- Domain `claire.legal` verified

**App-side code (this worktree):**
- All ACs in `docs/plans/login-v1.md` met
- `weak_password` error code wired but dormant (HIBP not enabled)
- `TODO(post-resend)` in `src/app/signup/actions.ts` for enumeration-safe signup flip when app-level Resend lands later

## Files to read first when resuming

1. `docs/plans/login-v1.md` — full plan + ACs + Phase 2 addendum
2. `docs/plans/login-v1-cowork-setup.md` — what was already configured (some sections obsoleted by Phase 2 addendum — read both)
3. This file (`docs/plans/login-v1-current-state.md`) — what's known/unknown right now

## Useful endpoints + IDs

- Preview URL: https://heart-note-git-login-v1-productsvance-8547s-projects.vercel.app
- Production URL: https://heart-note-five.vercel.app (after merge)
- PR: https://github.com/productsvance-web/HeartNote/pull/23
- Supabase project ref: `jjuvsswrkibowvexbvro`
- Supabase dashboard: https://supabase.com/dashboard/project/jjuvsswrkibowvexbvro
- Supabase Management PAT: a token named "HeartNote Auth" was generated and used during initial setup. **Generate a fresh one if needed at https://supabase.com/dashboard/account/tokens** — never paste tokens into committed files. The original may still be valid; ask the user, or revoke + regenerate.
- Google Cloud project: `heartnote-495101`
- Resend domain: `claire.legal` (verified)
