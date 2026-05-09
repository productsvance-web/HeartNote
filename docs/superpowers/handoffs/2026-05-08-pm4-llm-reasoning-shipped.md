# Handoff — visit-prep PDF + v0.5 LLM reasoning all shipped (2026-05-08, PM4)

> Four PRs landed today: PRs #60, #61, #62 (visit-prep PDF complete) and PR #63 (v0.5 LLM alert reasoning). Stopping before priority #7 because it has a real product/ops gate that needs the user, not more engineering.

## What landed this session

### PR #60 — visit-prep PDF session 1
Migration `cardiology_visits.last_visit_id` + backfill trigger; DOB on `/me/patient/edit`; `@react-pdf/renderer` + foundation modules. Migration is **already pushed to the linked Supabase project**.

### PR #61 — visit-prep PDF session 2
Page-1 visualizations: weight chart with AHA threshold band, 30×4 symptom timeline, "WHAT CHANGED" callout. All print-shaped (540pt × 8.5×11in), black + 3 grays only, no oklch.

### PR #62 — visit-prep PDF session 3
Meds table, 14-day adherence strip, questions, notes, document composition, `/api/visits/[id]/pdf` route, "Download cardiology PDF" button. Replaces the in-app browser-print. **One pragmatic deviation:** typography on Helvetica + Times-Roman (built-in PDF fonts) instead of Inter + Fraunces. `@fontsource` v5 ships only `.woff/.woff2` and Turbopack can't bundle those via `require.resolve`. `registerPdfFonts()` is a no-op stub — bundling Inter/Fraunces TTFs into `/public/fonts/pdf/` is a clean follow-up.

### PR #63 — v0.5 LLM alert reasoning
Closes CLAUDE.md rule #4 ("AI alerts must show their reasoning"). After the rules engine fires a non-tier-4 assessment, Claude Opus 4.7 with prompt caching generates a 1–2 sentence explanation of the trigger pattern. Renders under the headline on the dashboard's HeroAlertCard.

**Architecture:** writes to the `alerts` table per the phase-1 migration's contract. One alerts row per assessment evaluation; dashboard reads the latest by `created_at` within today's window (filtered via `daily_log_id IN (today's logs)` to avoid the timezone bug the code-review subagent caught — `${today}T00:00:00` literals interpret in server UTC for non-UTC caregivers).

**Guardrails for CLAUDE.md rule #6 ("never recommend dose changes"):**
1. System prompt explicitly forbids any medication change, diagnosis claim, or action prescription.
2. Forbidden-phrase regex post-validates the response. Patterns cover: raise/lower/adjust/tweak/modify dose, halve/hold/withhold/skip pill, "give her another," "more/extra/less" + med-noun OR "X mg," generic milligram dosing, "dose adjustment," start/stop/switch taking, rule-ID leak.
3. Med-noun set includes 12 common CHF drug names (lasix, furosemide, metoprolol, carvedilol, spironolactone, entresto, sacubitril, valsartan, lisinopril, losartan, warfarin, coumadin, eliquis, apixaban) so phrases like "more lasix" trip the gate even when the model uses a class-specific noun.
4. On any forbidden-phrase match: return `null`. UI gracefully omits the reasoning paragraph; the rule-derived headline still shows.

**Code-review subagent dispatched** (per `.claude/rules/feature-workflow.md` for alerts + AI output). 6 should-fixes surfaced, 4 patched in the same PR (timezone bug, regex bypasses, rule-ID leak in user message, character cap mismatch). 2 skipped with reasoning: dedupe (multi-row-per-day is intentional for v0.5 history; lifecycle is #7 territory) and prognosis framing (CLAUDE.md rule #4's example "pattern often precedes decompensation" is the same register).

## Test gates — green at session end

- `npm run lint` — 4 pre-existing warnings, 0 errors
- `npm run build` — clean
- `npm run test:alerts` — 47/47
- `npm run test:trends` — 32/32

## Real-data verification not yet done

The reasoning prompt has been built carefully but **never tested against a real patient's data**. Worth walking on the Vercel preview before any user touches it:

1. Create a test patient with dry_weight_lb, normal_pillow_count, NYHA class.
2. Dictate "she gained 4 pounds in 7 days, slept on 3 pillows last night, and was coughing through the night."
3. Confirm the dashboard tier reads tier_2_today.
4. Confirm a reasoning paragraph appears under the headline.
5. Confirm the reasoning never contains: a med name + "more/less/extra," "increase/decrease," "halve/double/skip," "stop/start taking," any "T2.X" rule label.
6. Repeat with a tier-3 firing (mild_slowdown).
7. Repeat with a tier-1 firing (chest pain) — should still generate, in funeral-serious-but-not-doom register.

If the regex flags too aggressively (legitimate phrasings get dropped) or too loosely (a forbidden phrase slips), patch in `src/lib/alerts/reason.ts`.

## What's still open

### Priority #1 — End-to-end caregiver walk on REAL data
**This is the single highest-value unblocked task.** Four substantial PRs landed today; the PDF and reasoning surfaces are unwalked. Manual ACs from `docs/superpowers/plans/2026-05-08-visit-prep-pdf.md` §"Manual verification" + the reasoning gut-check above.

### Priority #6 — iOS Capacitor build verification
Needs a Mac with Xcode. `npx cap sync ios && open ios/App/App.xcworkspace`.

### Priority #7 — Push notifications (BLOCKED on a product/ops decision)

**This is the next session's first task — but the choice is yours, not engineering's.**

The push pipeline needs a provider choice before any code can ship safely:

| Option | Pros | Cons |
|---|---|---|
| **Capacitor PushNotifications + APNs (iOS) + FCM (Android), unified server via Firebase Admin SDK** | Most native UX. Single server lib (firebase-admin). Free for HeartNote's volume. | Apple Developer cert + Firebase project + service-account JSON in Vercel env. Some setup. |
| **OneSignal** | Drop-in. Dashboard for sends. Multiplatform out of the box. | Vendor dependency. Free tier has caps. Privacy: caregiver data flows through them. |
| **Web push (VAPID + Service Worker)** | No native deps. Works on Mac/Windows desktop. | iOS Safari support landed late, still flaky in Capacitor webview. Not a home-screen-app-quality experience. |

**Recommendation:** Capacitor + APNs/FCM via firebase-admin. Most native, lowest vendor lock-in, scales free for the foreseeable future. But the user is the judge.

**Ops checklist for the chosen path (Capacitor + APNs/FCM):**

- [ ] Apple Developer account with Push Notifications capability on the HeartNote app ID. Generate an APNs key (.p8) — store key ID + team ID in Vercel.
- [ ] Firebase project for the Android side. Generate service-account JSON. Store as `FIREBASE_SERVICE_ACCOUNT_JSON` in Vercel.
- [ ] Decide push-token storage: simplest is a `push_tokens` table keyed by `(user_id, platform, token)` with `revoked_at`. RLS so a caregiver can only see their own tokens.
- [ ] Decide which alerts trigger a push: tier_1_911 always; tier_2_today always; tier_3_48hr is a debate (worth a notification but not a noise-fatigue source).
- [ ] Decide push copy template — what does the lock-screen show? Caregivers may have their parent looking over their shoulder; the copy is a privacy decision.

**Engineering, once the ops checklist is green:**

1. Migration: `push_tokens` table.
2. `src/lib/push/register.ts` — server action to register/revoke tokens.
3. `src/lib/push/dispatch.ts` — fires firebase-admin send when an alerts row is inserted with tier ∈ {1,2,3} AND environment has the credentials. Fail-closed: missing env → no-op (no half-finished feature).
4. `src/components/heartnote/PushPermissionPrompt.tsx` — Capacitor `PushNotifications.requestPermissions()` flow on `/me`. Gated behind a feature flag (`NEXT_PUBLIC_PUSH_ENABLED=true`).
5. Wire dispatch into the alerts insert path (voice-log/process.ts + log/edit/actions.ts).

Not shipped this session because (a) the provider choice is yours, (b) untested glue against an unchosen provider's API surface is wasted work.

### Visit-prep PDF follow-ups (low priority polish)

- **Custom font swap.** Bundle Inter + Fraunces TTFs into `/public/fonts/pdf/` and switch `registerPdfFonts()` to read from disk via `path.join(process.cwd(), 'public/fonts/pdf/...')`. Only `typography.ts` changes.
- **Adherence window RPC.** Replace the 14× per-day RPC fan-out with a single `medication_adherence_for_window(p_patient_id, p_date_from, p_date_to, p_tz)`. Drops a round-trip cost; not user-visible.
- **Engine commit `4f9b6af` mislabel** as "feat(log): manual edit UI" (it's the engine 47-test landing). Pre-existing.

## Where to start the next session

1. Read this handoff.
2. `npm run test:alerts` + `npm run test:trends` — confirm gates green.
3. Pick a path:
   - **Highest leverage:** walk priority #1 on the Vercel preview. PDFs and reasoning are real now; nothing has been touched by a human caregiver yet.
   - **If your hands are free for ops:** make the priority #7 provider choice, set up the Apple Developer + Firebase prerequisites, then start the engineering above.
   - **If quick polish:** the font swap or the adherence window RPC.
4. Use a worktree (per `.claude/rules/feature-workflow.md`).

## Next session entry point

> Read `docs/superpowers/handoffs/2026-05-08-pm4-llm-reasoning-shipped.md`. Latest commits on `main` are PRs #60, #61, #62 (visit-prep PDF end-to-end) and #63 (v0.5 LLM alert reasoning). Verify test gates (`npm run test:alerts` + `npm run test:trends`). Then either: (a) walk priority #1 on the Vercel preview, (b) make the priority #7 provider choice and set up ops prerequisites, or (c) start a polish task. Use a worktree.
