# Login v1 — Co-work setup checklist

**Paste the entire block below into Claude Co-work (or any browser-using Claude) verbatim.** It's self-contained and walks every dashboard step in one pass — no back-and-forth needed afterwards.

---

````
You're configuring a Next.js app called HeartNote for production-grade auth. This is the COMPLETE setup pass — Google OAuth, Supabase Auth settings, email deliverability via Resend, and all the production toggles. Run every step in order. Report ✅ or ❌ after each part.

The user is non-technical and is signed into Google, Vercel, Supabase, and (if needed) Resend in the browser. If a tool needs a login the user isn't already in, ask them to log in before continuing.

---

## Constants

- Supabase project ref: `jjuvsswrkibowvexbvro`
- Supabase dashboard: https://supabase.com/dashboard/project/jjuvsswrkibowvexbvro
- Production app URL: https://heart-note-five.vercel.app
- Local dev URL: http://localhost:3000

---

## PART 1 — Resend (custom SMTP transport)

Supabase's built-in SMTP is rate-limited at 2 emails/hour project-wide and uses a shared sender that Hotmail/Outlook drop. Resend (free tier 3000 emails/month) replaces it cleanly.

1. Open https://resend.com — sign in with Google. Create the account if it's the first visit.
2. Navigate to **API Keys** → **Create API Key**.
   - Name: "Supabase HeartNote"
   - Permission: "Sending access" (NOT "Full access" — narrower is safer)
   - Copy the key (starts with `re_`). DO NOT print it in chat output. Keep it in clipboard / secure note for Part 3.
3. Confirm you can use Resend's sandbox sender `onboarding@resend.dev` without DNS setup. (Custom domain setup with SPF/DKIM/DMARC records is a separate task and can wait until production launch.)

Report: ✅ Resend account ready, API key in clipboard.

---

## PART 2 — Google Cloud Console (OAuth)

Open https://console.cloud.google.com/

1. **Project picker** (top-left): create or select a project named "HeartNote".
2. **APIs & Services → OAuth consent screen**:
   - User Type: **External**
   - App name: **HeartNote**
   - User support email: ask the user (their primary email is fine)
   - Authorized domains: add `supabase.co` and `vercel.app`
   - Developer contact email: same as support email
   - Scopes: add **`openid`**, **`.../auth/userinfo.email`**, **`.../auth/userinfo.profile`**. All three are NON-SENSITIVE (no Google verification process needed).
   - Test users: skip (we're publishing, not testing)
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: **HeartNote Web (Supabase)**
   - Authorized JavaScript origins: leave empty
   - **Authorized redirect URIs** — add this single value EXACTLY:
     ```
     https://jjuvsswrkibowvexbvro.supabase.co/auth/v1/callback
     ```
     (This is the Supabase auth callback, NOT the app URL.)
   - Click Create. Copy the **Client ID** and **Client Secret**. Keep both for Part 3.
4. **CRITICAL — OAuth consent screen → Publishing status → "Publish App"** button. Click it.
   - For non-sensitive scopes (`openid email profile`), publishing is INSTANT and does NOT trigger Google's app-verification process.
   - If still in "Testing" mode, only explicitly listed test users can sign in. We need anyone to be able to sign in.
   - Verify: Publishing status now reads "**In production**".

Report: ✅ Google OAuth client created (ID + Secret in clipboard), consent screen published.

---

## PART 3 — Supabase Auth configuration

Open https://supabase.com/dashboard/project/jjuvsswrkibowvexbvro

### 3A. Google provider

Authentication → Providers → **Google**:
- Toggle **Enabled** = ON
- Paste **Client ID** (from Part 2)
- Paste **Client Secret** (from Part 2)
- Skip "Authorized Client IDs"
- Save

### 3B. Email auth + leaked-password protection

Authentication → Settings → Email Auth:
- **Enable email signup** = ON
- **Enable email confirmations** = ON  ← critical security toggle
- **Secure email change** = ON
- Save

Authentication → Policies → Password Policy:
- **Leaked Password Protection** (HaveIBeenPwned check) = **ON**
- Minimum password length: **8** (matches app-side validation; do not reduce)
- Required character classes: leave all OFF (NIST 2017 guidance — length + breach check, not complexity rules)
- Save

### 3C. Notification emails

Authentication → Settings → scroll to "Email Notifications" (or similar section):
- **Notify user on password change** = ON
- **Notify user on identity link** (when a new sign-in method is added to their account) = ON
- Save

### 3D. SMTP — Resend

Authentication → Settings → SMTP Settings → toggle "Enable Custom SMTP" = ON.

Fill in:
- **Sender email**: `onboarding@resend.dev`
- **Sender name**: `HeartNote`
- **Host**: `smtp.resend.com`
- **Port**: `465`
- **Username**: `resend`
- **Password**: paste the Resend API key from Part 1 (the `re_...` value)
- **Minimum interval between emails**: leave at default
- Save

### 3E. URL configuration (CRITICAL — covers Vercel previews)

Authentication → URL Configuration:
- **Site URL**: `https://heart-note-five.vercel.app`
- **Redirect URLs** — add EACH of these as a separate row, exact strings (you'll need 6 rows):
  ```
  https://heart-note-five.vercel.app/auth/callback
  https://heart-note-five.vercel.app/auth/confirm
  https://heart-note-*.vercel.app/auth/callback
  https://heart-note-*.vercel.app/auth/confirm
  http://localhost:3000/auth/callback
  http://localhost:3000/auth/confirm
  ```
- The two `*` (wildcard) entries cover Vercel preview URLs — without them, signup confirmation and password-reset emails sent FROM a preview deployment would silently redirect to production instead.
- Save

### 3F. Email templates

Authentication → Email Templates. For each below, replace the body. Keep `{{ .SiteURL }}`, `{{ .TokenHash }}`, `{{ .Email }}` as literal text — Supabase substitutes at send time.

**Template: Confirm signup**
- Subject: `Confirm your email for HeartNote`
- Body (HTML — switch to "Source" or HTML mode in the editor):
  ```html
  <p>Welcome to HeartNote.</p>
  <p>Tap the button below to confirm your email and finish signing in. The link works once and expires in 24 hours.</p>
  <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm email</a></p>
  <p>If you didn't create a HeartNote account, you can safely ignore this message.</p>
  ```
  Note: this uses `?type=email` (current canonical for verifyOtp) instead of the default `{{ .ConfirmationURL }}` which uses the deprecated `?type=signup`.

**Template: Reset password**
- Subject: `Reset your HeartNote password`
- Body:
  ```html
  <p>Someone — hopefully you — asked to reset the password for {{ .Email }}.</p>
  <p>Tap the button below to set a new password. The link works once and expires in 1 hour.</p>
  <p><a href="{{ .ConfirmationURL }}">Set new password</a></p>
  <p>If you didn't request a reset, you can ignore this message. Your current password still works.</p>
  ```
  (Reset uses default `{{ .ConfirmationURL }}` because `?type=recovery` is the correct, non-deprecated value.)

Leave Magic Link, Invite User, and Email Change templates at default — HeartNote doesn't use those flows in v1.

Report: ✅ All Supabase configs saved.

---

## PART 4 — Verification

### 4A. SMTP delivery test
Authentication → Email Templates → Confirm signup → click "Send test email" → enter a real Hotmail or Outlook address (e.g. `jaypp35@hotmail.com`).
- Expected: arrives within 60 seconds (inbox preferred; spam acceptable but flag it).
- If undelivered after 5 min: SMTP misconfigured. Check Part 3D.

### 4B. End-to-end smoke test on the preview deployment

Preview URL: https://heart-note-git-login-v1-productsvance-8547s-projects.vercel.app

The preview is gated behind Vercel Deployment Protection — make sure you're signed into Vercel before visiting.

Run all 7 checks:

1. **Sign-up flow.** `/login` → tap "Sign up" → fresh email + password (≥8 chars) + same in confirm field → submit. Expected: lands on `/auth/check-email`. Open the email, click the link → lands on `/onboarding`.
2. **Sign-in (password).** Sign out via `/me` → on `/login` enter the same credentials → lands on `/onboarding`.
3. **Sign-in (Google).** Sign out → tap "Continue with Google" → consent screen → lands on `/onboarding` or `/dashboard`. ⚠️ Test this on **production** (`https://heart-note-five.vercel.app`) AFTER merge — Vercel preview URLs are NOT in Google's redirect-URI list (Google doesn't accept wildcards) so Google sign-in on the preview will fail.
4. **Forgot password.** Sign out → "Forgot password?" → enter email → reset link arrives → set new password (twice) → lands on `/login?notice=password_updated`.
5. **Leaked-password rejection.** On `/signup`, try password `password123` (in HIBP) → expected error: "That password has appeared in a known data breach. Pick a different one."
6. **Confirm-password mismatch.** On `/signup`, enter different values in password and confirm → expected error: "Passwords don't match."
7. **Recovery-cookie guard.** While signed in, navigate browser directly to `/auth/update-password` → expected: bounces to `/login?error=reset_session_expired`.

### 4C. Identity Linking sanity check (after #1 + #3)
After completing both sign-up flows for the same email address, open Supabase → Authentication → Users → find that user. Expected: ONE row with TWO identities attached (`email` + `google`).

Report: ✅ all 7 checks pass, identity linking verified.

---

## What to report back

Format:
```
PART 1 (Resend): ✅
PART 2 (Google Cloud): ✅
PART 3A Google provider: ✅
PART 3B Email auth + HIBP: ✅
PART 3C Notifications: ✅
PART 3D SMTP: ✅
PART 3E URL config: ✅
PART 3F Templates: ✅
PART 4A SMTP test email: ✅ (arrived in inbox / spam)
PART 4B Smoke test: 1✅ 2✅ 3✅ 4✅ 5✅ 6✅ 7✅
PART 4C Identity linking: ✅
```

Or paste any ❌ with the specific URL bar text + error message you saw. Don't improvise — if something doesn't match the instructions, stop and ask the user.
````

---

## Notes for Jason (the user)

- This single prompt replaces all the prior piecemeal Co-work prompts. Use this one only.
- Co-work needs you signed into Google, Vercel, Supabase, and (it'll create) Resend in your browser before it starts.
- The Resend free tier (3000 emails/month) covers HeartNote for years at expected scale.
- After Co-work reports all green, I merge the PR and we ship.
- If anything fails in Part 4, paste the failure to me — don't ask Co-work to fix; it doesn't have the implementation context.
