# Spec: email/password → email-OTP migration

**Status**: approved, awaiting implementation in a fresh session
**Author**: Jason + Claude (this session)
**Date**: 2026-05-04
**Depends on**: auth-hardening PR (separate, ships first or in parallel — covers `signOut()` before OAuth, Cache-Control on auth pages, lazy admin client, sign-out on `/onboarding`, two new `.claude/rules/*.md` files). This spec assumes those landed; implementer should verify before starting.

## Goal

Replace email + password sign-in with email + 6-digit OTP code (Notion-style). Google OAuth stays. The same email contains both the magic link and the 6-digit code — user picks: tap the link in Mail to sign in directly, or type the code on a verify page.

## Why

- HeartNote is a CHF caregiver app. Caregivers are stressed; password management is friction. Codes/magic links are lower cognitive load.
- Removing stored passwords removes a class of risk: hash leaks, reuse, weak-password rules, reset-flow abuse.
- The session-bleed bug we hit in May exposed how fragile password+OAuth UX is. OTP-only is fewer code paths to keep correct.
- Pre-launch, zero customers — no migration cost.

## Out of scope

- The auth-hardening PR (signOut-before-OAuth, Cache-Control headers, sign-out affordance on `/onboarding`, lazy `createAdminClient()`, `.claude/rules/destructive-actions.md`, `.claude/rules/auth-sessions.md`). Ships separately.
- Removing or migrating Google OAuth — **stays unchanged**.
- Existing accounts' password hashes — per CLAUDE.md "no backwards compatibility": leave the `encrypted_password` column inert. No UI ever asks for it again. Don't wipe; that's busywork.
- SMS-based OTP. Email only.
- Account recovery for users who lose access to their email. (Standard answer: support ticket → admin-set new email via Supabase admin API. Not in scope here.)

## High-level flow

```
/login (single email input + Continue with Google)
   │
   │ user enters email, submits
   ▼
signInWithOtp({ email, options: { shouldCreateUser: true } })
   │
   │ Supabase sends an email containing both:
   │   • magic link  → /auth/callback?token=...&type=magiclink
   │   • 6-digit code
   ▼
/auth/verify?email=<email>      (code-entry page)
   │
   │ user picks ONE of:
   │   (a) types the 6-digit code → verifyOtp({ email, token, type: 'email' })
   │   (b) taps magic link in Mail → /auth/callback exchanges → session set
   ▼
session set, redirect to /onboarding (new) or /dashboard (returning)
```

Existing user vs new user: same flow. `signInWithOtp` with `shouldCreateUser: true` covers both. Routing post-auth uses `profiles.onboarding_completed_at` (already in place).

## Files to delete

- `src/app/login/login-form.tsx` — current password+OAuth form (rewrite at the same path)
- `src/app/login/actions.ts` — `signInWithPassword` action (rewrite as OTP-send action)
- `src/app/signup/page.tsx` and any `signup-form.tsx` / `actions.ts` in that dir — replaced by single `/login` entry
- `src/app/auth/forgot-password/` — entire directory
- `src/app/auth/update-password/` — entire directory
- `src/app/auth/check-email/` — entire directory (verify flow takes its place)
- Password-related keys in `src/lib/auth/friendly-error.ts`: `invalid_credentials`, `weak_password`, `email_not_confirmed`, `reset_session_expired`

## Files to add

- `src/app/login/page.tsx` (rewrite) — single email input + "Continue with email" + "Continue with Google"
- `src/app/login/login-form.tsx` (rewrite) — client component, email input only
- `src/app/login/actions.ts` (rewrite) — `signInWithOtp` action; on success redirects to `/auth/verify?email=<email>`
- `src/app/auth/verify/page.tsx` (NEW) — server component, reads `email` from search params
- `src/app/auth/verify/verify-form.tsx` (NEW) — client component with code input (`autocomplete="one-time-code"`, `inputMode="numeric"`)
- `src/app/auth/verify/actions.ts` (NEW) — `verifyOtp` action + `resendOtp` action (with 60s server-side cooldown via Supabase rate limit)

## Files to modify

- `src/app/auth/callback/route.ts` — extend to handle both `?code=` (Google OAuth) AND `?token=&type=magiclink` (Supabase magic link). Single endpoint, branches on params.
- `src/lib/auth/friendly-error.ts` — add new keys: `otp_send_failed`, `invalid_code`, `code_expired`, `link_expired`, `network_failure`, `rate_limited` (already exists, may need new copy). Remove the password-specific keys listed above.
- `capacitor.config.ts` — configure Universal Links / custom URL scheme for `heartnote.app/auth/callback` so magic links open the app on iOS instead of the browser. Specifics: `appUrlOpen` plugin + `iOS.scheme` + `appLinks` (Android equivalent later).
- `src/middleware.ts` — no changes expected; `getClaims()` keeps working.
- Any Next.js redirects from removed pages: handle in `next.config.ts` `redirects()` — `/signup` → `/login`, `/auth/forgot-password` → `/login`, etc. Or just let them 404; pre-launch, no inbound traffic to those URLs. **Recommend: 404, simpler.**

## Configuration changes (Supabase dashboard, not code)

1. **Auth Providers**: disable Email + Password. Keep Google enabled. (Email/Password disabled does NOT prevent OTP; OTP uses the email channel without password.)
2. **Email template — "Magic Link"**: customize body to include both the link and the code. Supabase has variables for both. Suggested copy (passes CLAUDE.md rule 5 grelief test):

   ```
   Subject: Your HeartNote sign-in code

   Body:
   Your HeartNote sign-in code: {{ .Token }}

   Or tap this link to sign in:
   {{ .ConfirmationURL }}

   This code and link expire in 10 minutes.
   If you didn't request this, you can ignore this email.
   ```

3. **OTP settings**: 6 digits, 10-minute expiry, 60s resend cooldown, 5 attempts per code (Supabase defaults; verify in dashboard).

## iOS autofill

The code input MUST have `autocomplete="one-time-code"` and `inputMode="numeric"`. iOS 17+ surfaces codes from recent emails *and* SMS into the keyboard suggestion bar when this attribute is present. Verified by Apple docs.

```tsx
<input
  type="text"
  inputMode="numeric"
  autoComplete="one-time-code"
  pattern="[0-9]{6}"
  maxLength={6}
  required
  aria-label="6-digit code"
  // ...
/>
```

## Magic link in Capacitor

When the user taps the magic link in iOS Mail:

- **Without Universal Links configured**: link opens Safari → callback runs in browser → user is signed in *in the browser*, not in the app. Bad UX.
- **With Universal Links configured**: tap opens the app directly → callback runs inside the app's web view → session set in the app. Correct UX.

Setup steps:

1. `capacitor.config.ts`: add `appUrlOpen` config + iOS bundle ID + URL scheme.
2. Apple App Site Association file at `https://heartnote.app/.well-known/apple-app-site-association` (served as static JSON, no extension).
3. iOS app entitlement: `com.apple.developer.associated-domains` includes `applinks:heartnote.app`.
4. Test on a real device — simulator behavior differs.

Reference: https://capacitorjs.com/docs/guides/deep-links

## Acceptance criteria (full template per `.claude/rules/acceptance-criteria.md`)

### Engineering

- [ ] Plan stated and approved before any code written (this spec serves as the plan)
- [ ] No new abstractions beyond what's listed
- [ ] Diff scoped to listed files; no unrelated touches
- [ ] All ACs verifiable by reading specific behavior or running specific commands
- [ ] Plan-review subagent dispatched on this spec before implementation begins
- [ ] Code-review subagent dispatched after implementation, before merge

### Functional happy path

- `/login` shows: single email input + "Continue with email" submit + "Continue with Google" button. No password input anywhere on the page.
- Submit a new or existing email → action calls `signInWithOtp({ email, options: { shouldCreateUser: true } })` → redirects to `/auth/verify?email=<email>` within 1s
- Within 60s, an email arrives at the address containing a 6-digit code AND a magic link
- Path A (code): user types 6 digits on `/auth/verify`, submits → signed in → `/onboarding` (new) or `/dashboard` (returning) within 2s
- Path B (link): user taps link in Mail → opens app (Capacitor on iOS) or browser (web) → signed in → same destinations
- iOS 17+ keyboard surfaces the code from the recent email when the user focuses the code input

### Edge cases

- Existing user enters email → email sent → after auth, lands on `/dashboard`
- New user enters email → email sent → after auth, lands on `/onboarding`
- User submits empty email → HTML `required` blocks
- User submits malformed email → `signInWithOtp` returns error → `friendlyError('otp_send_failed')` shown on `/login`
- User reaches `/auth/verify` and clicks Resend within 60s of the prior send → 429 from Supabase → `friendlyError('rate_limited')` shown
- User reaches `/auth/verify` and clicks Resend after 60s → new email arrives, prior code invalidated
- User pastes code with leading/trailing whitespace → trimmed before `verifyOtp` call
- User types 5 wrong codes in a row → `friendlyError('invalid_code')` shows, account locked for the rest of the code's window (Supabase default behavior)
- User clicks magic link more than once → first click signs them in; second click → `link_expired` (already-used links are dead)
- User clicks magic link after 10 minutes → `link_expired`
- User has Google session active and submits an email for OTP → flow proceeds normally; the Google session gets overwritten by the new OTP session on verify

### Error states

- Supabase email transport fails → `friendlyError('otp_send_failed')` on `/login`
- Network failure during send → same key
- Network failure during verify → `friendlyError('network_failure')` on `/auth/verify`, retry available
- Code wrong → `invalid_code`
- Code expired → `code_expired`
- Magic link expired/used → `link_expired`, redirect to `/login` with that key
- `verifyOtp` returns user not found (race: user deleted mid-verify) → `friendlyError('session_failed')`, redirect to `/login`

### Performance

- `/login` email submit → redirect to `/auth/verify`: <500ms
- `verifyOtp` call: <1s
- Magic link click → app open + signed in: <2s on a warm app
- Email delivery: <30s typical (Supabase SLA), <60s p99

### Persistence

- Session cookie set via Supabase SSR cookie store after successful `verifyOtp` or callback exchange
- Same access token (1h) + refresh token (7d) lifetime as current
- BFCache disabled on `/login`, `/auth/verify`, `/auth/callback` (covered by auth-hardening PR's `Cache-Control: no-store`)

### Permissions / RLS

- n/a — no schema changes, no new tables, no new policies

### Side effects

- Removed pages (`/signup`, `/auth/forgot-password`, `/auth/update-password`, `/auth/check-email`) return 404 (no redirects). Pre-launch, no inbound traffic.
- Existing `auth.users` rows with `encrypted_password` set: column becomes inert. Never read. ~32 bytes per row of dead data. Acceptable per no-backwards-compat rule.
- `friendly-error.ts` shrinks (password keys removed) and grows (OTP keys added). Net: similar size.

### Manual verification (3 min, must run on real iOS device for Capacitor steps)

1. Sign out fully (clear cookies if needed). Visit `/login`.
2. Enter a new email → submit → land on `/auth/verify?email=...` with copy "We sent a code to your-email — type it below or tap the link in your email."
3. Open Mail. Email arrives within 60s with code + magic link.
4. **Path A**: type the 6-digit code → submit → land on `/onboarding`. Verify session cookie set (DevTools).
5. Sign out. Visit `/login`. Enter same email → `/auth/verify`.
6. **Path B**: tap the magic link in Mail. On iOS device with Universal Links configured: HeartNote app opens, signed in, on `/dashboard`. On web: browser opens, signed in, on `/dashboard`.
7. Resend within 60s → see rate-limit copy. Wait 60s, resend → new email arrives, prior code dead.
8. Try a wrong code → see "That code didn't match" → retry, success.
9. Wait 11 minutes, try the code → see "Code expired."
10. iOS 17+ device: focus the code input, the keyboard surfaces the code from the recent email.

## Decisions locked in

- **Code length**: 6 digits, numeric
- **Code expiry**: 10 minutes (Supabase default)
- **Resend cooldown**: 60 seconds
- **Max attempts per code**: 5
- **Existing accounts**: stored passwords go inert; no migration step; no UI ever asks again
- **Single entry page**: `/login` handles new + existing emails; `/signup` removed
- **Email contains both**: code + magic link in the same email; user picks
- **iOS autofill**: `autocomplete="one-time-code"` on the code input; no extra plumbing needed
- **Magic link in Capacitor**: Universal Links configured to open the app on tap
- **Display name capture**: keep current behavior — auto-derived from email by `handle_new_user` trigger; user can edit via onboarding wizard or `/me`. No extra "What's your name?" step on first sign-in.
- **Redirects from removed pages**: 404 (no `next.config.ts` redirects). Pre-launch.

## Implementation order (suggested for the new session)

1. Read this spec end-to-end. Read `CLAUDE.md`, `AGENTS.md`, `.claude/rules/feature-workflow.md`, `.claude/rules/acceptance-criteria.md`, and the new `.claude/rules/auth-sessions.md` (assumes auth-hardening PR landed).
2. Verify auth-hardening PR landed: `git log --oneline -20`, look for the auth-hardening merge commit. If not present, stop and ship that first.
3. Create worktree: `git worktree add -b auth-otp-migration .claude/worktrees/auth-otp-migration main` then `npm install --prefix <path>` (per the worktree node_modules rule).
4. Stand up `/auth/verify` page + actions FIRST, with a stub button that calls `signInWithOtp` from the dev console — verify Supabase is sending the email and `verifyOtp` works end-to-end. Don't touch `/login` yet.
5. Customize the Supabase email template via the dashboard (config, not code). Verify the email contains both code and link.
6. Configure Capacitor Universal Links. Verify magic link opens the app on a real iOS device.
7. Rewrite `/login` page + form + action: email-only.
8. Wire deletes: remove password actions, signup pages, forgot-password, update-password, check-email. Confirm nothing imports them — clean removal per `feedback_clean_removal` memory and CLAUDE.md "no backwards compatibility."
9. Update `friendly-error.ts`: remove password keys, add OTP keys.
10. Update `/auth/callback/route.ts` to handle both OAuth code and magic-link token.
11. Manual verification per the 10-step checklist above.
12. Dispatch `superpowers:code-reviewer` subagent. Pass: this spec, the diff, the relevant rule files. Verify each AC.
13. Patch flagged issues. Re-review only if substantial.
14. PR → checks → squash-merge → cleanup worktree.

## References

- Supabase OTP docs: https://supabase.com/docs/reference/javascript/auth-signinwithotp
- Supabase verifyOtp: https://supabase.com/docs/reference/javascript/auth-verifyotp
- Supabase email templates: https://supabase.com/docs/guides/auth/auth-email-templates
- iOS one-time-code autofill: Apple Human Interface Guidelines + `autocomplete="one-time-code"` (caniuse)
- Capacitor Universal Links: https://capacitorjs.com/docs/guides/deep-links
- Notion's auth UX (reference): https://www.notion.so/login

## Open questions for the implementer

If anything below isn't obvious from the spec, surface to Jason before coding:

1. Is `heartnote.app` the production domain for Universal Links, or is there a different one? The capacitor config + AASA file need the exact domain.
2. Do you want the `/auth/verify` page to auto-submit on the 6th digit (smoother UX) or wait for the user to click Submit? Recommend auto-submit; flag if you disagree.
3. Should `/login` show an "or" divider between the email form and the Google button? Current `/login` has it ("or"). Keep.
