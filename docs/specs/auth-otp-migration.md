# Spec: email/password → email-OTP migration

**Status**: approved, in implementation
**Author**: Jason + Claude
**Date**: 2026-05-04 (revised post-plan-review)
**Auth-hardening prerequisite**: landed in commit `ffbda3c` (#29). `signOut({ scope: 'local' })` in `oauth.ts`, `Cache-Control` headers in `next.config.ts`, `auth-sessions.md` + `destructive-actions.md` rule files all in place.

## Goal

Replace email + password sign-in with email + 6-digit OTP code (Notion-style). Google OAuth stays. The same email contains both the magic link and the 6-digit code — user picks: tap the link in Mail to sign in directly, or type the code on a verify page.

## Why

- HeartNote is a CHF caregiver app. Caregivers are stressed; password management is friction. Codes/magic links are lower cognitive load.
- Removing stored passwords removes a class of risk: hash leaks, reuse, weak-password rules, reset-flow abuse.
- The session-bleed bug we hit in May exposed how fragile password+OAuth UX is. OTP-only is fewer code paths to keep correct.
- Pre-launch, zero customers — no migration cost.

## Out of scope

- The auth-hardening PR — already landed in #29.
- **Capacitor Universal Links + AASA + iOS app entitlements.** Carved to a follow-up PR. Reason: no `ios/` build exists yet; AASA + Apple provisioning is a fragile, multi-day yak that would block the OTP web flow. In this PR, magic links open in Safari → web verifies → user signed in there. When the iOS app build lands, a follow-up PR adds Universal Links so the link opens the installed app instead.
- Removing or migrating Google OAuth — **stays unchanged**.
- Existing accounts' password hashes — per CLAUDE.md "no backwards compatibility": leave the `encrypted_password` column inert. No UI ever asks for it again. Don't wipe; that's busywork.
- SMS-based OTP. Email only.
- Account recovery for users who lose access to their email. (Standard answer: support ticket → admin-set new email via Supabase admin API. Not in scope here.)
- Cross-device same-tab UX (start sign-in on desktop, tap link on phone, desktop redirects). Requires server-side polling token. Not worth the infra pre-launch.

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
- `src/app/signup/` — entire directory (`page.tsx`, `signup-form.tsx`, `actions.ts`)
- `src/app/auth/forgot-password/` — entire directory
- `src/app/auth/update-password/` — entire directory
- `src/app/auth/check-email/` — entire directory (verify flow takes its place)
- `src/components/heartnote/PasswordInput.tsx` — orphan after deletes (only consumers were login/signup/update-password)
- `src/lib/auth/constants.ts` — `PASSWORD_MIN_LENGTH` only; orphan after deletes
- `src/lib/auth/recovery-cookie.ts` — `RECOVERY_COOKIE` was the gate for the `/auth/update-password` page that's being removed
- Remove `/signup` from `next.config.ts` `headers()` no-store list (the route ceases to exist)
- Password-related keys in `src/lib/auth/friendly-error.ts`: `invalid_credentials`, `weak_password`, `email_not_confirmed`, `reset_session_expired`

## Files to add

- `src/app/login/page.tsx` (rewrite) — single email input + "Continue with email" + "Continue with Google"
- `src/app/login/login-form.tsx` (rewrite) — client component, email input only
- `src/app/login/actions.ts` (rewrite) — `signInWithOtp` action; on success redirects to `/auth/verify?email=<email>`
- `src/app/auth/verify/page.tsx` (NEW) — server component, reads `email` from search params
- `src/app/auth/verify/verify-form.tsx` (NEW) — client component with code input (`autocomplete="one-time-code"`, `inputMode="numeric"`)
- `src/app/auth/verify/actions.ts` (NEW) — `verifyOtp` action + `resendOtp` action (with 60s server-side cooldown via Supabase rate limit)

## Files to modify

- `src/app/auth/callback/route.ts` — branch on params. Magic link arrives as `?token_hash=<hash>&type=magiclink` → `verifyOtp({ token_hash, type })`. Google OAuth still arrives as `?code=<pkce>` → `exchangeCodeForSession`. Confirmed against `@supabase/auth-js` types: `VerifyTokenHashParams { token_hash, type: EmailOtpType }`.
- `src/lib/auth/friendly-error.ts` — add only `otp_send_failed`, `link_expired`. Existing keys `invalid_code`, `code_expired`, `rate_limited` are reused. Remove `invalid_credentials`, `weak_password`, `email_not_confirmed`, `reset_session_expired`.
- `next.config.ts` — drop `/signup` no-store entry (route gone).
- `src/middleware.ts` — no changes expected; `getClaims()` keeps working.
- Removed pages 404 — no `next.config.ts` redirects. Pre-launch, no inbound traffic.

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

## Magic link in Capacitor (DEFERRED)

Carved to a follow-up PR. In this PR, taps in Mail open Safari → web verify → user signed in there. Acceptable interim because the iOS app build doesn't exist yet. When the iOS app ships, the follow-up PR adds:

- `capacitor.config.ts` `appUrlOpen` plugin
- AASA at `https://heartnote.app/.well-known/apple-app-site-association`
- `applinks:heartnote.app` associated-domains entitlement
- Real-device test pass

Reference: https://capacitorjs.com/docs/guides/deep-links

## Same-tab sign-in (onAuthStateChange)

When the user submits email on `/login` then opens the email and taps the magic link in the same browser, the verify tab they were on auto-redirects to `/dashboard` (or `/onboarding`) without further input. Implementation: `/auth/verify` mounts a `supabase.auth.onAuthStateChange()` listener (browser client). When the link tab hits `/auth/callback` and sets the session cookie, the listener fires `SIGNED_IN` in the original tab via Supabase's BroadcastChannel + cookie storage events. Client-side `router.replace()` to the destination.

Cross-device flow (typed email on desktop, tapped link on phone) is out of scope — different cookie jars, no signal across.

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
- Submit a new or existing email → server action lower-cases + trims, calls `signInWithOtp({ email, options: { shouldCreateUser: true } })` → redirects to `/auth/verify?email=<lowercased-email>` within 500ms
- During submit pending, the "Continue with email" button is disabled and labels "Sending…" via `useFormStatus`
- Within 60s, an email arrives at the address containing a 6-digit code AND a magic link
- Path A (code): on the 6th digit typed, the form auto-submits (no extra Submit click). Server action lower-cases + trims, calls `verifyOtp({ email, token, type: 'email' })` → redirects to `/onboarding` (new) or `/dashboard` (returning) within 1s
- Path B (link, same browser): user taps link in Mail → callback tab signs them in → original `/auth/verify` tab's `onAuthStateChange` listener fires `SIGNED_IN` → original tab `router.replace`s to `/dashboard` or `/onboarding`
- Path B (link, different browser/incognito): callback tab signs them in directly → `/dashboard` or `/onboarding`. Original tab does not auto-redirect.
- iOS 17+ keyboard surfaces the code from the recent email when the user focuses the code input

### Edge cases

- Existing user enters email → email sent → after auth, lands on `/dashboard`
- New user enters email → email sent → after auth, lands on `/onboarding`
- User submits empty email → HTML `required` blocks
- User submits malformed email → `signInWithOtp` returns error → `friendlyError('otp_send_failed')` shown on `/login`
- User submits `Foo@Example.com` (mixed case + whitespace) → both action boundaries (`signInWithOtp` send and `verifyOtp` verify) lower-case + trim. The verify URL also carries the lower-cased version.
- Authenticated user (already signed in) visits `/login` directly → server-side check redirects to `/dashboard` or `/onboarding` based on `profiles.onboarding_completed_at`. No flash of the login form.
- Double-click "Continue with email" → second click is a no-op: `useFormStatus` disables the button while the action is pending. Server action is idempotent on input (same email → same OTP request → Supabase 429 if too fast, surfaces as friendly "we just sent one" copy via `rate_limited`).
- User reaches `/auth/verify` and clicks Resend within 60s → button is disabled + shows live countdown (`Resend in Ns`). If somehow bypassed, Supabase 429 → `friendlyError('rate_limited')`.
- User reaches `/auth/verify` and clicks Resend after 60s → new email arrives, prior code invalidated. Countdown resets.
- User pastes code with leading/trailing whitespace → trimmed before `verifyOtp` call. Pasted 6-digit code triggers auto-submit immediately.
- User types 5 wrong codes in a row → `friendlyError('invalid_code')` shows, account locked for the rest of the code's window (Supabase default behavior)
- User clicks magic link more than once → first click signs them in; second click → `link_expired` (already-used links are dead)
- User clicks magic link after 10 minutes → `link_expired`
- User has Google session active and submits an email for OTP → on `verifyOtp` success, Supabase overwrites `sb-*` session cookies with the OTP-user session. Verify in DevTools: cookies for the prior Google user are gone, new cookies present.
- User refreshes `/auth/verify` mid-flow → page reloads with email param intact; session listener re-mounts; resend countdown resets (in-memory state).

### Error states

- Supabase email transport fails → `friendlyError('otp_send_failed')` on `/login`
- Network failure during send → same key
- Network failure during verify → server action throws (Next.js framework boundary); user reloads to retry
- Code wrong → `invalid_code`
- Code expired → `code_expired`
- Magic link expired/used → `link_expired`, redirect to `/login` with that key
- `verifyOtp` returns user not found (race: user deleted mid-verify) → `friendlyError('session_failed')`, redirect to `/login`

### Performance

- `/login` email submit → redirect to `/auth/verify`: <500ms
- `verifyOtp` call: <1s
- Email delivery: typically arrives within 30s during manual verification (Supabase SLA, no in-app instrumentation)

### Persistence

- Session cookie set via Supabase SSR cookie store after successful `verifyOtp` or callback exchange
- Same access token (1h) + refresh token (7d) lifetime as current
- BFCache disabled on `/login`, `/auth/verify`, `/auth/callback`. Verify response headers on each include `Cache-Control: no-store, must-revalidate` via DevTools → Network. (Covered by `next.config.ts` headers; `/auth/:path*` matcher already includes `/auth/verify` and `/auth/callback`.)

### Permissions / RLS

- n/a — no schema changes, no new tables, no new policies

### Side effects

- Removed pages (`/signup`, `/auth/forgot-password`, `/auth/update-password`, `/auth/check-email`) return 404 (no redirects). Pre-launch, no inbound traffic.
- Existing `auth.users` rows with `encrypted_password` set: column becomes inert. Never read. ~32 bytes per row of dead data. Acceptable per no-backwards-compat rule.
- `friendly-error.ts` shrinks (password keys removed) and grows (OTP keys added). Net: similar size.
- Orphaned helpers (`PasswordInput.tsx`, `auth/constants.ts`, `auth/recovery-cookie.ts`) deleted in same PR; no zombie code left.
- OAuth-start helper `oauth.ts` already calls `signOut({ scope: 'local' })` before redirect (auth-hardening). Verify in DevTools: clicking "Continue with Google" emits a response with `Set-Cookie` clearing `sb-*` before the provider redirect.

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
- **Resend cooldown**: 60 seconds, enforced client-side via disabled button + visible countdown; Supabase 429 is the backstop
- **Max attempts per code**: 5
- **Existing accounts**: stored passwords go inert; no migration step; no UI ever asks again
- **Single entry page**: `/login` handles new + existing emails; `/signup` removed
- **Email contains both**: code + magic link in the same email; user picks
- **Email normalization**: lower-case + trim at both action boundaries (`signInWithOtp` send and `verifyOtp` verify) and in the URL param. Same string everywhere.
- **iOS autofill**: `autocomplete="one-time-code"` on the code input; no extra plumbing needed
- **Auto-submit on 6th digit**: yes. Eliminates the extra Submit tap. Pasted codes also auto-submit.
- **Same-tab sign-in**: `onAuthStateChange` listener on `/auth/verify` redirects when a different tab in the same browser completes the callback. Cross-device same-tab is out of scope.
- **Magic link in Capacitor**: deferred to a follow-up PR (see Out of scope).
- **Authenticated user visiting `/login`**: redirect to `/dashboard` (or `/onboarding`) server-side. No flash.
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

## Open questions resolved (post-plan-review, 2026-05-04)

1. ~~Universal Links domain~~ — Universal Links carved to follow-up. N/A in this PR.
2. ~~Auto-submit on 6th digit~~ — **yes, auto-submit**. Locked.
3. ~~"Or" divider on `/login`~~ — keep (Lyft-style chrome already in place from #25).
4. **Magic-link callback param shape** — confirmed `?token_hash=&type=magiclink` → `verifyOtp({ token_hash, type })`. Per `@supabase/auth-js` `VerifyTokenHashParams`.
