# Auth + session hygiene

Loaded automatically (no path filter). Required reading when planning, implementing, or reviewing any feature that depends on `auth.getUser()`, modifies session state, lives at an auth-sensitive route (`/login`, `/signup`, `/auth/*`, `/onboarding`, `/me`), or initiates an OAuth flow.

## Rules

### 1. Auth-sensitive routes carry `Cache-Control: no-store`

The following routes emit `Cache-Control: no-store, must-revalidate` in their response headers:
- `/login`
- `/signup`
- `/onboarding`
- `/me`, `/me/*`
- `/auth/*`

Configured in `next.config.ts` via `async headers()`. Disables browser BFCache so back-navigation never serves a stale auth-state page — closes the class of session-bleed UX bugs we hit in May 2026.

**iOS Safari caveat**: BFCache eviction on iOS Safari is historically less strict than Chrome/Edge with `no-store` alone. If iOS testing later reveals BFCache leakage on auth pages, augment with a client-side `pageshow` listener that reloads when `event.persisted === true`.

### 2. OAuth start helpers call `signOut({ scope: 'local' })` first

Any server action that initiates an OAuth round-trip (e.g. `signInWithGoogle`) must call `await supabase.auth.signOut({ scope: 'local' })` before redirecting to the provider.

Why: prevents the cookie-bleed where account A's cookies persist after the user picks account B on the provider's chooser. `scope: 'local'` only deletes cookies — it does NOT revoke the prior session's refresh token server-side. The old refresh token remains valid until natural expiry; that's an acceptable tradeoff pre-launch (zero customers, no shared devices) because the alternative (`scope: 'global'`) adds a network round-trip and a failure mode on a path that should be near-instant. Revisit if launching to shared-device scenarios.

If `signOut` throws: log and continue. Failure to clear local cookies is benign:
- If no session existed, signOut is a no-op
- If a session existed, the new OAuth round-trip overwrites cookies on success
- Blocking OAuth start on signOut failure would lock users out of sign-in entirely

### 3. Authenticated pages surface a sign-out affordance

No dead-end states. Every page that requires an authenticated session (`/me`, `/onboarding`, `/dashboard`, `/log`, etc.) must expose a sign-out path within the page itself — not buried in a settings menu only reachable after navigating somewhere else.

Why: a user who lands on the wrong account (typo, wrong Google chooser pick, stale session) needs an immediate path out. The May 2026 bug compounded partly because `/onboarding` had no sign-out — the only escape was Delete-and-start-over, which deleted the wrong account.

### 4. Account switching never relies on the browser back button

Any flow that supports "use a different account" must provide an explicit affordance (button, link, sign-out flow). Browser back is unreliable across OAuth flows because of BFCache + cached provider chooser pages.

Specifically: never tell a user "if this isn't you, click back" or build a UX that depends on history navigation.

## In acceptance criteria

When proposing ACs for any auth-touching feature, include:

> Manual verification: response headers on `<route>` include `Cache-Control: no-store, must-revalidate` (verify via DevTools → Network).

For OAuth-touching features:

> OAuth start clears local cookies before redirecting to the provider. Verifiable: Network panel shows `Set-Cookie` clearing `sb-*` on the response that precedes the provider redirect.

For authenticated pages:

> Page exposes a sign-out affordance reachable in <2 taps from the current view.
