# Login v1 — email + password + Google

## Goal

Replace the existing magic-link-only sign-in with **email + password** as the canonical identity, **Continue with Google** as a one-tap alternative, and a data model that's Apple-ready (button added later, no migration). Supabase's automatic Identity Linking merges accounts when the same verified email signs in via a different method.

## Scope

In:
- Sign in / sign up with email + password
- Sign in / sign up with Google (OAuth via Supabase)
- Email-verification gate before first sign-in
- Forgot-password / reset-password flow (email-based)
- Sign out (already exists at `src/app/me/actions.ts` — keep)
- Replace existing magic-link code path entirely (no zombie code, no fallback)

Out:
- Apple Sign in button (data model is ready; UI deferred to iOS launch when App Store requires it)
- Phone / SMS auth
- Account deletion / GDPR export
- Splash/onboarding-photo screen (separate visual iteration)
- Profile fields beyond what `profiles` already has

## Architectural decisions (locked from prior conversation + plan-review verification)

1. **Email is the canonical identifier.** All other sign-in methods (Google now, Apple later) link to the same `auth.users` row by verified email. Supabase enforces that linking only happens to verified emails — protects against pre-account takeover.
2. **Smart account merging is automatic in Supabase.** Per the docs: "Supabase Auth automatically links identities with the same email address to a single user… linking to unverified email addresses is prevented." No `linkIdentity()` call needed; no dashboard toggle for the auto path. Manual linking (different email after sign-in) is out of scope.
3. **No magic links.** Passwords + OAuth only. The current `sendMagicLink` action and its `?code=` branch in `src/app/page.tsx` are removed.
4. **Two callback routes, per Supabase canonical Next.js pattern (verified against current docs):**
   - `/auth/callback` — OAuth flows. Param: `?code=`. Uses `exchangeCodeForSession`. (Already exists; gets a friendly-error refactor since it now serves OAuth, not magic links.)
   - `/auth/confirm` — email-link flows (signup confirmation + password recovery). Params: `?token_hash=&type=`. Uses `verifyOtp({ type, token_hash })`. **NEW route.**
5. **Reuse existing visual chrome.** Cream/sage gradient, Heart icon, rounded card on `src/app/login/page.tsx`. Form contents change; page shell does not. Hero-photo treatment is a separate visual iteration.
6. **Apple-ready means: do nothing now.** Supabase models identities as `auth.identities` rows linked to a single `auth.users` row. Adding Apple later = OAuth provider config in dashboard + a button. No schema migration.
7. **Capacitor bundle ID:** when iOS scaffolding is later set up, use a single bundle ID (e.g. `com.heartnote.app`) reusable as Apple Service ID. Not done in this PR; flagged for the future iOS PR.
8. **Apple "Hide My Email" private-relay limitation (acknowledged, not solved in v1):** Apple lets users hide their real email and substitute a `@privaterelay.appleid.com` address. Auto-linking by email therefore *will not* link an Apple-relay user to their existing Gmail-based account. Acceptable for v1; revisit when Apple ships.
9. **Decided: password minimum is 8 chars, no other rules.** No required uppercase / symbol / digit — those rules cause password-manager friction without measurable security gain. Constant `PASSWORD_MIN_LENGTH = 8` lives in `src/lib/auth/constants.ts`.
10. **Decided: Google button on top, divider, then email + password form below.** One-tap is faster than typing on mobile; matches the modern convention (Linear, Notion, current Vercel).
11. **Decided: hard cutover from magic links.** Per CLAUDE.md "no backwards-compatibility, no migration paths." Existing sessions persist via Supabase cookies (no impact). Anyone hitting an old magic-link URL after deploy gets the standard `?error=expired` flow; expected behavior, no special handling.
12. **Decided: separate `/login` and `/signup` routes** (not a combined toggle). Industry-standard for password-based auth (Linear, Stripe, GitHub). Returning users — the dominant traffic — bookmark `/login` and never see the signup decision again.
13. **Decided: signup is honestly enumeration-leaky.** When a user tries to sign up with an existing email, the form shows "This email already has an account. [Sign in] or [reset password]." This reveals account existence to anyone with an email list — accepted trade-off for v1. Login and password-reset paths remain generic (no leak from those). When Resend (or equivalent ESP) is added later for family-share alert emails, that PR also flips signup to the strict enumeration-safe pattern (generic UI + "we noticed" notification email). Tracked via TODO in `src/app/signup/actions.ts`.

## Routes / files

**New:**
- `src/app/signup/page.tsx` + `signup-form.tsx` + `actions.ts` — email + password sign-up, "Continue with Google" button, "Already have an account? Sign in"
- `src/app/auth/confirm/route.ts` — handles email-link callbacks (signup confirmation, password recovery) via `verifyOtp({ type, token_hash })`
- `src/app/auth/forgot-password/page.tsx` + `forgot-password-form.tsx` + `actions.ts` — request a password-reset email
- `src/app/auth/update-password/page.tsx` + `update-password-form.tsx` + `actions.ts` — set a new password after clicking reset link (lands here from `/auth/confirm` after a `recovery`-type verifyOtp succeeds)
- `src/app/auth/check-email/page.tsx` — terminal "we sent a verification email to {email}" screen for new sign-ups; no form, just instructions and a rate-limited "Resend email" action
- `src/lib/auth/constants.ts` — single source for `PASSWORD_MIN_LENGTH = 8`
- `src/lib/auth/friendly-error.ts` — extracted from current `login/page.tsx` so `/login`, `/signup`, and `/auth/update-password` can share the error mapping (this is the second use site, but extraction is justified because OAuth errors must render identically across pages — drift would be a real bug, not a style issue)

**Changed:**
- `src/app/login/login-form.tsx` — replace OTP form with email + password + "Continue with Google" + "Forgot password?" + "Don't have an account? Sign up". Remove `Mail` import and the `if (status === 'sent')` block (lines 4 and 35–51 of current file). Preserve the FormData-read submit pattern.
- `src/app/login/actions.ts` — replace `sendMagicLink` with `signInWithPassword` (Zod-validated email + password) and `signInWithGoogle` (server action that returns the OAuth URL, called from a button onClick via `startTransition`)
- `src/app/login/page.tsx` — import `friendlyError` from `lib/auth/friendly-error.ts` instead of defining it inline. Update the footer copy (lines 60–62) to remove "We'll email you a sign-in link. No password to remember."
- `src/app/auth/callback/route.ts` — keep PKCE `?code=` handling for OAuth. Update friendly-error references that no longer apply to OAuth (`PKCE code verifier not found` is OAuth-irrelevant; replace mappings via `friendly-error.ts`).
- `src/app/page.tsx` — remove the `?code=` branch and its associated comment block (lines 4–10, 23–29). Root just routes by session: signed in + onboarded → `/dashboard`, signed in + not onboarded → `/onboarding`, not signed in → `/login`.
- `src/app/me/actions.ts` — no code change. Verified to call `supabase.auth.signOut()` which clears session cookies and OAuth refresh tokens via the SSR client. Manual-verification AC asserts post-signout state.

**Deleted:**
- The `sendMagicLink` action (replaced)
- The "Check your inbox" success state in the form (replaced by `/auth/check-email` page)
- Magic-link-specific friendly-error branches: `PKCE code verifier not found`, `expired`, `already used`, `once` (kept only the ones still relevant to OAuth, e.g. `missing_code`, `session_failed` — repurposed for OAuth context)

**Configuration (Supabase dashboard, in PR description):**
- Authentication → Providers → **Enable Google** (paste Google OAuth Client ID + Secret)
- Authentication → Settings → **Confirm email = ON** (block sign-in until verified)
- (Identity Linking automatic path requires no dashboard toggle. **Manual linking stays OFF** — out of scope.)
- Authentication → URL Configuration → Site URL is the production domain. Redirect allow-list includes `http://localhost:3000/auth/callback`, `http://localhost:3000/auth/confirm`, and the production equivalents.
- Email templates → Confirm signup + Reset password — replace default copy with the drafts in [Email template copy](#email-template-copy) below. Confirm template uses `{{ .ConfirmationURL }}` which expands to `{site_url}/auth/confirm?token_hash=...&type=signup`.

**Configuration (Google Cloud Console, in PR description):**
- Create OAuth 2.0 Client ID (Web application)
- Authorized redirect URI: `https://<supabase-project>.supabase.co/auth/v1/callback` (Supabase project URL, not the HeartNote app URL — Supabase is the OAuth client; it then forwards to our `/auth/callback`)
- OAuth consent screen: app name "HeartNote", scopes `openid email profile` (all non-sensitive — no Google verification process required)
- **Vercel preview deployments cannot use Google OAuth** unless the specific preview URL is added to the redirect-URI list. Google does not support wildcards. Default expectation: Google sign-in is tested on production only; previews show an OAuth error if attempted. Documented in PR description.

## Email template copy

Drafted against the grelief register (no chirp, no funeral). Copy lives in the Supabase dashboard, not in code. Both templates reference the user's email and a single CTA button.

**Confirm signup (subject: "Confirm your email for HeartNote")**

> Welcome to HeartNote.
>
> Tap the button below to confirm your email and finish signing in. The link works once and expires in 24 hours.
>
> [Confirm email]
>
> If you didn't create a HeartNote account, you can safely ignore this message.

**Reset password (subject: "Reset your HeartNote password")**

> Someone — hopefully you — asked to reset the password for {{ .Email }}.
>
> Tap the button below to set a new password. The link works once and expires in 1 hour.
>
> [Set new password]
>
> If you didn't request a reset, you can ignore this message. Your current password still works.

## Acceptance criteria

### Engineering — always include

- [ ] Plan stated and approved by the user before any code is written
- [ ] No new abstractions beyond `friendly-error.ts` and `constants.ts` (both have ≥2 consumers from day 1; both replace inline duplication that would otherwise drift)
- [ ] No shared "Google button" component — each page inlines its own button calling the same `signInWithGoogle` server action. Deferred to rule-of-three.
- [ ] Diff scoped to the auth feature; no unrelated formatting or refactoring
- [ ] All ACs verifiable by reading specific behavior or running specific commands
- [ ] No backwards-compat shims for magic-link users (per CLAUDE.md "no backwards-compatibility")
- [ ] Before implementation, read the relevant Next.js 16 docs in `node_modules/next/dist/docs/` for current Server Actions, redirect, and form behavior — per AGENTS.md

### Functional — happy path

**Sign up (email + password):**
- [ ] On `/signup`, entering a valid email + password (≥8 chars) and submitting calls `supabase.auth.signUp()` server-side, which creates an `auth.users` row in unconfirmed state, fires the existing `handle_new_user` trigger to insert a `profiles` row, sends the Supabase confirm-signup email, and redirects to `/auth/check-email?email={email}` within 2s.
- [ ] On `/auth/check-email`, the page displays the email address from the query param, instructions to open the link on the same device, and a "Resend email" button. Tapping Resend calls `supabase.auth.resend({ type: 'signup', email })` and shows "Sent" for 30s. Resend is disabled (button greyed) for 30s after each send to prevent spam.
- [ ] Clicking the link in the email lands on `/auth/confirm?token_hash=...&type=signup`. The route calls `supabase.auth.verifyOtp({ type: 'signup', token_hash })`, establishes a session, and redirects to `/onboarding` (since `onboarding_completed_at` is null for the new profile).

**Sign in (email + password):**
- [ ] On `/login`, entering correct email + password and submitting calls `supabase.auth.signInWithPassword()`, establishes a session, and redirects to `/onboarding` (if not onboarded) or `/dashboard` (if onboarded) within 1s.
- [ ] Form reads from `FormData` in the submit handler (not just React `useState`) so that, after Safari fills email + password via iOS Password Autofill, tapping submit submits the autofilled values even if React `onChange` did not fire. Same pattern is applied to `/signup`, `/auth/forgot-password`, `/auth/update-password`.
- [ ] Email field has `autoComplete="email"`, login password field has `autoComplete="current-password"`, signup and update-password fields have `autoComplete="new-password"`.

**Sign in (Google):**
- [ ] On `/login`, tapping "Continue with Google" calls a server action that invokes `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '${origin}/auth/callback' } })` and returns the OAuth URL; the client redirects via `window.location.href = data.url`.
- [ ] Google's consent screen appears within 500ms of the tap (Google handles the rest).
- [ ] On consent, Google → Supabase project URL → our `/auth/callback?code=...` → `exchangeCodeForSession` → redirect to `/onboarding` or `/dashboard`.
- [ ] Sign-up via Google for a brand-new email creates the `auth.users` row, fires `handle_new_user`, and lands the user on `/onboarding` (Google emails are pre-verified, so no `/auth/check-email` step).

**Smart account linking (Supabase automatic):**
- [ ] If a user signed up with email + password using `jane@gmail.com` and confirmed her email, then later taps "Continue with Google" with the same Google account, Supabase auto-links the Google identity to the existing `auth.users` row. No duplicate profile, no data loss. User lands on `/onboarding` or `/dashboard` for the existing account.
- [ ] If a user signed up with Google first, then later visits `/signup` and tries email + password with the same address: signup is rejected (the account exists). Per [enumeration policy](#account-enumeration-policy) below, the user-facing message is generic ("If you don't have a HeartNote account yet, check your email to confirm. If you do, sign in instead."), but a discreet "someone tried to sign up" notice is sent to the existing email. The user can then sign in with Google or use "Forgot password?" to set a password on the existing account.
- [ ] **Pre-account-takeover protection (Supabase guarantee, asserted by AC):** If a user signs up with email + password but never confirms, and then someone signs in with Google for the same email, Supabase does NOT auto-link to the unconfirmed account. Instead the Google sign-in attaches to a fresh user (or, depending on Supabase version, fails the link with a recoverable error). Documented as expected behavior; not a bug.

**Forgot password:**
- [ ] On `/login`, tapping "Forgot password?" navigates to `/auth/forgot-password`.
- [ ] Submitting an email calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: '${origin}/auth/confirm' })` and **always** shows "If you have a HeartNote account, a reset link is on the way to that email" — never confirms account existence (enumeration policy).
- [ ] The email link points to `/auth/confirm?token_hash=...&type=recovery`. The route calls `verifyOtp({ type: 'recovery', token_hash })`, which returns a session, then redirects to `/auth/update-password`.
- [ ] On `/auth/update-password`, entering a new password (≥8 chars) twice and submitting calls `supabase.auth.updateUser({ password })`, then signs the user out (force re-login with new password — protects against stolen-link reuse), then redirects to `/login?notice=password_updated`.
- [ ] Direct navigation to `/auth/update-password` without a recovery session redirects to `/login?error=reset_session_expired`. **Implementation: a short-lived (5-min) httpOnly cookie `hn_recovery=1` is set by `/auth/confirm` only when `type === 'recovery'` succeeds. Both `/auth/update-password` page and the `updatePassword` action gate on the cookie's presence, so a normally-signed-in user can't trigger a password change by navigating to the URL.** Cookie is cleared after a successful password update.

**Sign out:**
- [ ] Tapping Sign out at `/me` calls existing `signOut` action → `supabase.auth.signOut()`. After the action returns, navigating to `/dashboard` redirects to `/login`. Verifies the session cookie is cleared.

### Edge cases

- [ ] Sign-in attempt with a valid email but unconfirmed account → friendly error: "Check your email to confirm your account before signing in" + a "Resend email" link to `/auth/check-email?email={email}`.
- [ ] Sign-up attempt with an email that already has a *confirmed* account → form shows inline error: "This email already has an account. **Sign in** or **reset your password**." Both phrases are links to `/login` and `/auth/forgot-password?email={email}` respectively. No email is sent.
- [ ] Sign-up attempt with an email that has an *unconfirmed* account → call `supabase.auth.resend({ type: 'signup', email })` and route to `/auth/check-email?email={email}` so the user gets a fresh confirmation link. (This case naturally doesn't leak — the user can re-trigger their own confirmation regardless.)
- [ ] Google OAuth user denies consent → land on `/login?error=oauth_cancelled`. Friendly text: "You cancelled signing in with Google. Try again or sign in with your email."
- [ ] Reset-password link expired → `/auth/confirm` returns an error → redirect to `/auth/forgot-password?error=link_expired`. Friendly text: "That reset link expired. Request a new one — they're valid for 1 hour."
- [ ] Reset-password link already used → same flow as expired.
- [ ] Empty email or password fields → browser-native `required` attribute fires before submit (no JS validation). User sees the OS-default tooltip.
- [ ] Sign-up password <8 chars → server action returns Zod validation error; form shows "Password must be at least 8 characters."
- [ ] Update-password "new password" <8 chars → same Zod path, same error text.
- [ ] User submits sign-in or sign-up form twice rapidly (double-submit) → `useTransition` `isPending` disables the button; second submit is a no-op.

### Account enumeration policy

Asymmetric on purpose:

- [ ] **Login** (wrong password OR no account): "Email or password is incorrect." Does not distinguish.
- [ ] **Forgot password**: "If you have a HeartNote account, a reset link is on the way to that email." Does not reveal existence. Supabase's `resetPasswordForEmail` already behaves this way.
- [ ] **Signup with an existing confirmed email**: honestly shows "This email already has an account. [Sign in] or [reset password]." **Reveals account existence.** Accepted v1 trade-off; revisit when Resend is wired for family-share emails (see decision #13).
- [ ] `src/app/signup/actions.ts` includes a `// TODO(post-resend):` comment naming the future change so the next person to touch this file sees it.

### Error states

- [ ] Network error during sign-in → "Couldn't reach our servers. Try again in a moment."
- [ ] Supabase rate-limit (429) → "Too many attempts. Wait a minute and try again."
- [ ] Unknown OAuth error returned in `error_description` → friendly mapping in `friendly-error.ts` for known cases (`oauth_cancelled`, `oauth_account_not_linked`, `email_taken`); unknown errors render a generic message: "Something went wrong on our end. Try again, or use a different sign-in method." Raw Supabase error strings are never shown to users.
- [ ] Verification email never delivered → "Resend" button on `/auth/check-email` is rate-limited client-side (1 send per 30s). The escalated "still no email?" support copy was struck during implementation — too speculative for v1, no support email exists yet.

### Performance

- [ ] `/login` first contentful paint < 1.5s on simulated Slow 4G in Chrome DevTools (it's a server component with minimal client JS — verify by Lighthouse run, not eyeballing)
- [ ] `signInWithPassword` round-trip < 800ms p50 from button tap to redirect issued (measured locally against local Supabase; production may differ)
- [ ] Google OAuth tap → consent-screen appearance < 500ms (just an HTTP redirect once the URL returns)

### Persistence

- [ ] On successful sign-in, Supabase session cookies are set (httpOnly, secure on prod, sameSite=lax) via `@supabase/ssr` middleware. Verified by inspecting browser DevTools cookies.
- [ ] Refreshing `/dashboard` keeps the user signed in.
- [ ] Closing and reopening the browser keeps the user signed in for the Supabase default refresh-token window.
- [ ] No new tables, no new columns. Existing `profiles.handle_new_user` trigger covers both sign-up paths.
- [ ] **Known limitation (documented, not fixed):** `handle_new_user` reads `raw_user_meta_data->>'display_name'`. Google sends `full_name` and `name`, not `display_name`. Profile rows for Google-signup users will fall through to the email-prefix branch (`split_part(new.email, '@', 1)`). Acceptable for v1; user can edit display name in `/me` later. Schema change deferred to a future profile-polish PR.

### Permissions / RLS

- [ ] No new tables → no new RLS policies needed.
- [ ] Existing `profiles` policies (`users read own profile`, `users insert own profile`, `users update own profile`) work for both email and Google sign-up paths because the `handle_new_user` trigger runs as `security definer` and bypasses RLS to insert. Verified by reading the migration file; no test added.
- [ ] OAuth-linked identities live in `auth.identities` (Supabase-managed). No app-level RLS needed.

### Side effects

- [ ] Sign-up triggers existing `handle_new_user` → inserts a `profiles` row with `display_name` from `raw_user_meta_data->>'display_name'` if present (currently never set by signup form), else email prefix.
- [ ] Identity linking on second sign-in via Google does NOT fire `handle_new_user` (no new `auth.users` row); the existing profile is reused.
- [ ] No analytics events added in this PR.
- [ ] No emails sent beyond what Supabase auto-sends (signup confirmation, password reset, signup-attempt notification per enumeration policy).

### Manual verification (≤4 min repro, two paths)

**Path A — local (Inbucket for emails, no Google):**
1. `supabase db reset` to clear local state, then `npm run dev`.
2. Open `/signup`, enter `test+v1@example.com` / `password123`, submit → land on `/auth/check-email?email=...`.
3. Open Inbucket (`localhost:54324`), find the confirmation email, click the link → `/auth/confirm?...&type=signup` → `/onboarding`.
4. Sign out via `/me` → land on `/login`.
5. On `/login`, enter same email + password → land on `/onboarding`.
6. Sign out, click "Forgot password?", enter email → check Inbucket for reset link, click → `/auth/confirm?...&type=recovery` → `/auth/update-password` → set new password → land on `/login?notice=password_updated` → sign in with new password works.
7. On a fresh email, try `/signup`, then while still on the check-email page, try `/signup` again with the same email → confirmation email is resent automatically (the unconfirmed-resend branch).
8. Confirm the freshly-signed-up account, then try `/signup` with the same confirmed email → form shows inline error "This email already has an account. [Sign in] or [reset password]" with both phrases as working links.

**Path B — deployed preview (Google OAuth + Supabase cloud):**

Requires the preview URL added to Google Cloud Console redirect URIs in advance.
1. Open the preview URL `/login`, tap "Continue with Google" → land on Google consent screen → confirm → land on `/onboarding`.
2. Sign out, then on the preview `/signup`, enter the same email used for Google + a password → enumeration-safe response shown.
3. On `/login`, click "Forgot password?", enter the Google email → reset link arrives in inbox → set a password → can now sign in either via password OR Google. (Supabase auto-link: Google identity already exists; password is added as a credential on the same `auth.users` row.)
4. Verify in Supabase dashboard → Authentication → Users that the row has both an `email` identity and a `google` identity attached (single user, two identities).

### Pre-merge configuration checklist (in PR description)

- [ ] Supabase: Authentication → Providers → Google enabled with Client ID + Secret
- [ ] Supabase: Authentication → Settings → "Confirm email" = ON
- [ ] Supabase: Authentication → URL Configuration → Site URL set; redirect list includes `/auth/callback` and `/auth/confirm` for prod + localhost
- [ ] Supabase: Email templates updated with the drafts from this plan
- [ ] Google Cloud Console: OAuth Client ID created, redirect URI = `https://<supabase>.supabase.co/auth/v1/callback`
- [ ] Google Cloud Console: OAuth consent screen configured with `openid email profile` scopes
- [ ] (Optional) Specific preview URL added to Google redirect URIs if Google testing on previews is needed

## What this plan does NOT do

- No Apple button (deferred to iOS launch PR; data model is ready)
- No phone / SMS (cut from v1)
- No Apple "Hide My Email" private-relay support (acknowledged limitation; revisit when Apple ships)
- No Resend / custom transactional email (deferred to the family-share alerts PR; flips signup to enumeration-safe at the same time)
- No splash photo screen
- No new database tables or columns
- No changes to RLS, onboarding flow, dashboard, or any post-login route
- No analytics, no rate-limit infrastructure beyond Supabase's built-in + the 30s client-side resend gate
- No `display_name` polish for Google users (known: falls back to email prefix; deferred)
- No manual identity linking (different-email link-after-signin)
- No support for Vercel preview Google OAuth out-of-the-box (requires per-preview redirect URI registration; default is production-only Google testing)
