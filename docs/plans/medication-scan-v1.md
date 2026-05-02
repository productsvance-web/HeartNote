# Medication scan v1 — photo extraction + spell-correction chip

**Status:** PROPOSED. Pre-review. Plan-review subagent to run before any code is written.

## Goal

Caregivers can add medications two new ways without typing the drug name from scratch:

1. **Spell-correction chip** — when typing a drug name into the manual-add form, if RxNorm's approximate match returns a corrected name (e.g., typed "Furosemde" → RxNorm returns "Furosemide"), surface a one-tap chip *"Did you mean Furosemide?"* under the drug-name field.
2. **Photo extraction** — open `/me/medications/scan`, capture or upload an image of a pill bottle, prescription label, or screenshot of a med list, and have a vision model extract `{drug_name, dose, doses_per_day}` per detected medication. Caregiver reviews each extracted med, optionally edits, and confirms — each confirmed med routes through the existing `addMedication` insert path (which already auto-classifies via RxNorm and validates dose units).

Both surfaces feed the same downstream pipeline: extracted/typed name → `classifyDrugByName` → drug_class + allowed_strengths → standard `medications` row insert. No new clinical inference. No alert-engine integration.

## Non-goals (explicit, do not creep)

- **No `schedule_times` extraction from photos.** Pill bottles do not reliably state clock times; "twice daily" sig phrases parse to `doses_per_day=2`, not 8am/8pm. Caregiver fills schedule_times manually after import.
- **No notes/allergy/Rx-number extraction.** Only the four fields above. Pharmacy-issued labels carry far more data; we ignore everything except drug name, dose, doses-per-day.
- **No persistent image storage.** Bytes pass through the API route once, go to Gemini, and are dropped. No Supabase Storage bucket. No debug retention. No signed URLs. (Caregiver's question on this was decided in conversation: simplest path.)
- **No multi-image batch upload.** One image per scan in v1. Caregiver re-runs the flow for additional photos.
- **No editing of an existing medication via photo.** Scan only creates new med rows.
- **No on-device OCR.** The hybrid Apple-Vision-on-device + cloud-cleanup pipeline researched as the v2 wildcard is deferred. Reason: requires Capacitor Vision-framework plugin work that doesn't exist; v1 is a single cloud round-trip.
- **No spell-correction chip in voice-log med-mention chips.** The voice path's strict-match design at `src/app/api/voice-log/[id]/process/route.ts` is intentional. Out of scope.
- **No user-visible confidence scores.** The model returns `confidence` per field; we use it internally as a "needs verification" flag (rendering the row in tap-each-field-to-confirm mode below threshold) but never display the number.
- **No course-tracking ("2× for 7 days" antibiotic flow).** Already deferred from medication-flow-v1; not introduced here.
- **No multi-vendor abstraction.** Direct Vertex AI client, no provider-swap layer.

## Architectural decisions (locked)

1. **Vision model: Gemini 2.5 Flash via Vertex AI** (not consumer Gemini API). Chosen over Claude Sonnet 4.6 vision based on the research recommendation: best real-world OCR on curved/glare pill-bottle photos per OmniAI + Reducto benchmarks, ~10× cheaper at our scale ($0.0013/image vs $0.012/image), native structured-output with `responseSchema`. Vertex AI is the BAA-eligible / no-train-on-input tier.
2. **Camera plugin: `@capacitor/camera`.** Capacitor core (8.3.1) is already in `package.json`. Add `@capacitor/camera` dep. Its web fallback uses the browser file picker automatically when running outside a Capacitor WebView, so this works in dev/Vercel preview today and switches to native camera once the iOS/Android projects are generated. One code path.
3. **Image compression: client-side Canvas API.** Resize to max 1280px on the long edge, encode as JPEG at quality 0.8, target ≤800KB. No external service. Falls within Gemini's per-image token sweet spot.
4. **No image storage.** Image bytes flow request body → API route → Gemini → discarded. Not written to disk, Supabase Storage, or DB. PHI minimization (pill bottles often show patient name).
5. **No prefill drafts table.** The entire scan→review→confirm flow lives in client state on a single client component. No DB intermediate. No URL params with encoded JSON. State drops on navigation away — expected and acceptable.
6. **Confidence threshold: 0.7.** Below threshold, the review row renders in "tap each field to confirm" mode (drug name, dose, doses_per_day each get an explicit confirm tap before the row is eligible for save). Above threshold, single "Add to my list" CTA. Threshold value lives in `src/lib/medications/scan/extract.ts` as `CONFIDENCE_FLOOR`.
7. **Multi-med ceiling: 20.** If Gemini returns >20 extracted meds, we truncate to the first 20 and show "Showing the first 20 medications. Re-scan with a tighter crop if needed." Prevents pathological screenshots from blowing up the UI.
8. **Single-med vs multi-med UX is one component.** The review screen is a list-of-cards. With one extracted med it shows one card; with five it shows five. No conditional routing. Each card supports inline edit-then-save via the existing `MedicationForm` component (passed `prefill` props).
9. **Re-classification through existing `classifyDrugByName`.** Extracted drug names go through the same RxNorm pipeline as manual entry. Same `drug_class` taxonomy. Same `allowed_strengths`. Same dose-unit validation. If the extracted dose conflicts with RxNorm-known strengths (e.g., model misreads "10 mL Jardiance"), the existing server-side validation in `addMedication` rejects it and the caregiver edits inline before resubmit.
10. **Outbound payload to Gemini is image bytes + system prompt + JSON schema only.** No `patient_id`, no `caregiver_id`, no Supabase user JWT. PHI risk surface is the bottle itself (label data) — that's intentional input; we add no additional identifier.
11. **Env vars fail closed.** Missing `GOOGLE_VERTEX_AI_PROJECT_ID`, `GOOGLE_VERTEX_AI_LOCATION`, or `GOOGLE_VERTEX_AI_CREDENTIALS_JSON` → `/api/medications/scan` route throws on first call. No fallback to consumer Gemini API. (Build convention #11.)
12. **Spell-correction is a UI surface for existing data.** `classifyDrugByName` already returns `suggestedName` (`src/lib/medications/classify.ts:93-95`). The existing 500ms-debounced `lookupDrugStrengths` action throws this away (`src/app/me/medications/actions.ts:14-21`). We thread it through, no new RxNorm call.
13. **Spell-correction never auto-corrects.** Chip is one-tap-to-accept. If caregiver dismisses or ignores, their literal text submits and `classifyDrugByName` server-side still computes `drug_class` correctly (RxNorm uses the corrected RxCUI internally even when the user keeps the typo).
14. **Cache_control on the extraction system prompt.** The Gemini system instruction + JSON schema are set up as the cacheable portion of the request. Vertex AI's caching is request-scoped; we structure the request to maximize cache reuse across consecutive scans within the same caregiver session.

## Schema changes

**None.** No new tables, no new columns, no new RLS policies. Both features write into the existing `medications` table via the existing `addMedication` server action. No migration in this PR.

## Surfaces

### Modified: `src/app/me/medications/medications-form.tsx`
Add the spell-correction chip rendered directly under the drug-name input.

- New piece of state: `suggestedName: string | null`. Set by the existing debounced lookup (which we extend below).
- Render condition: `suggestedName && suggestedName.toLowerCase() !== form.drugName.trim().toLowerCase()`.
- UI: a single chip below the field reading *"Did you mean **{suggestedName}**?"* with one tap target.
- On tap: `setForm({ ...form, drugName: suggestedName })` → existing debounced lookup re-fires with the corrected name → chip naturally clears once `suggestedName === form.drugName`.

### Modified: `src/app/me/medications/actions.ts`
Extend `lookupDrugStrengths` return type from `{ allowedStrengths }` to `{ allowedStrengths, suggestedName }`. Pull `suggestedName` from the existing `classifyDrugByName` result. No additional network calls.

### New: `src/app/me/medications/scan/page.tsx`
Server component. Auth-gated, redirects to `/login` if no session, redirects to `/onboarding` if no patient on file. Renders `<ScanClient />`.

### New: `src/app/me/medications/scan/scan-client.tsx`
Client component owning the entire flow. Three sub-states:

- **Capture state.** Two CTAs: *"Take photo"* and *"Upload image."* Both call `Camera.getPhoto()` from `@capacitor/camera` with `source: CameraSource.Camera` or `CameraSource.Photos` respectively. Returns `dataUrl`.
- **Processing state.** Captured image rendered as preview thumbnail. Inline spinner. Client-side compression via Canvas API (max 1280px, JPEG 0.8). POST to `/api/medications/scan` with the compressed base64. Loading state should clear within ~5s p50.
- **Review state.** List of extracted med cards. Each card = `<ScanReviewCard />` (see below). Two top-of-list CTAs: *"Add all"* (only when no card is in confirm-each-field mode, i.e. all confidences ≥ 0.7) and *"Skip all."* Bottom CTA: *"Take another photo"* — returns to capture state.

### New: `src/app/me/medications/scan/scan-review-card.tsx`
Client component. Receives one extracted med plus its confidence. Two render modes:

- **Confident mode** (`confidence >= CONFIDENCE_FLOOR`). Shows drug name + dose + doses-per-day in compact form. Two buttons: *"Add to my list"* and *"Skip."* "Add" expands the existing `<MedicationForm mode="new" initial={...} />` inline (already a client component, takes `initial` props). Caregiver can edit before final save. "Skip" removes the card from the list.
- **Needs-verification mode** (`confidence < CONFIDENCE_FLOOR`). Shows the same fields but each is a tappable confirm cell — caregiver taps drug name to confirm/edit, taps dose to confirm/edit, taps doses-per-day to confirm/edit. Once all three are confirmed, the card promotes to confident mode and the *"Add to my list"* button enables.

### New: `src/app/api/medications/scan/route.ts`
POST endpoint. Body: `{ imageDataUrl: string }` validated with Zod (max 1.2MB after base64 decode, MIME prefix `image/jpeg` or `image/png` required). On success, returns `{ medications: ExtractedMed[] }`.

Server-side flow:
1. Auth-gate (caregiver session required).
2. Decode base64 → bytes.
3. Pass to `extractMedicationsFromImage(bytes)` (see new module).
4. Discard bytes.
5. Return JSON.

No DB writes from this route. No image persistence.

### New: `src/lib/medications/scan/extract.ts`
Single function: `extractMedicationsFromImage(bytes: Uint8Array): Promise<{ medications: ExtractedMed[] }>`.

- Constructs Vertex AI client from env vars (fail-closed if missing).
- Calls Gemini 2.5 Flash with:
  - System instruction (loaded from `prompt.ts`, see below).
  - JSON response schema (loaded from `schema.ts`, see below) bound via `responseSchema` parameter — Gemini returns guaranteed-valid JSON.
  - Image part: `{inlineData: {mimeType, data: base64}}`.
- Parses response, validates with Zod against `ExtractedMedSchema`.
- Truncates to first 20 entries.
- Returns.
- 15s hard timeout via AbortController. On timeout/error: throws — API route catches, returns 504.
- On any error, server-side `console.warn` for ops visibility (no PHI in the warning, just `[scan-extract] timeout` etc.).

### New: `src/lib/medications/scan/prompt.ts`
Single export: `EXTRACTION_SYSTEM_PROMPT`. Specifies:
- Extract only medications visible in the image. Do not invent.
- Each medication has: `drug_name` (string), `dose_value` (number or null), `dose_unit` (string or null), `doses_per_day` (1–12 or null for PRN/unknown), `confidence` (0–1).
- If the image contains no medications, return `{medications: []}`.
- Return at most 20 medications (truncate visually-distant entries first).
- Do NOT extract: schedule times, notes, prescriber names, Rx numbers, refill counts, patient names.
- Hard rule: never invent values for fields you cannot see clearly. Prefer omitting (null) over guessing.

### New: `src/lib/medications/scan/schema.ts`
Two exports:
- `ExtractedMedSchema` — Zod schema for one extracted med (matches the four fields above plus confidence).
- `extractedMedsResponseSchema` — Gemini structured-output JSON schema (the one bound to `responseSchema`).

Both must declare the same shape; Zod validates Gemini's output, and the JSON schema constrains it.

### Modified: `src/app/me/medications/page.tsx`
One new button: *"Scan a label"* → links to `/me/medications/scan`. Placed adjacent to the existing "Add medication" button. Per the scoping decision, this button only renders on `/me/medications` — does not appear on `/dashboard`, `/log`, `/me`, or anywhere else.

### Modified: `package.json`
Add deps:
- `@capacitor/camera` (matched to existing `@capacitor/core@^8.3.1` major)
- `@google-cloud/vertexai`

### Modified: `.env.example`
Add three entries (no values):
- `GOOGLE_VERTEX_AI_PROJECT_ID=`
- `GOOGLE_VERTEX_AI_LOCATION=` (e.g., `us-central1`)
- `GOOGLE_VERTEX_AI_CREDENTIALS_JSON=` (base64-encoded service-account JSON)

## Acceptance criteria

### Engineering
- [ ] Plan reviewed by fresh-context subagent before any code (per `.claude/rules/feature-workflow.md` step 3).
- [ ] No new abstractions beyond `src/lib/medications/scan/{extract.ts, prompt.ts, schema.ts}`.
- [ ] `cache_control` / structured-output caching pattern used on Vertex calls (build conv #3).
- [ ] Server-side classification reuses `classifyDrugByName` — no duplicate logic (`code-quality.md` rule 2).
- [ ] No clinical numbers hardcoded (this PR has none — extraction reads what's printed).
- [ ] Diff scoped to: `src/app/me/medications/`, `src/lib/medications/scan/`, `src/app/api/medications/scan/route.ts`, `package.json`, `.env.example`. No edits to unrelated files. No edits to voice-log code.
- [ ] No edits to `src/app/me/medications/actions.ts` beyond extending `lookupDrugStrengths` return shape.
- [ ] Spell-correction and scan land in one PR (caregiver decision).

### Functional — happy path: spell-correction chip
- [ ] Caregiver types `Furosemde` (typo) into the drug-name field on `/me/medications/new`. Within ~600ms (existing 500ms debounce + ≤2s RxNorm budget already implemented), a chip renders below the field reading *"Did you mean Furosemide?"*.
- [ ] Tapping the chip replaces the input value with `Furosemide`. The chip disappears once the corrected lookup matches exactly. The "Comes in 20 mg, 40 mg, …" hint then renders below the dose pill.
- [ ] When the typed name matches RxNorm exactly (`Lasix`, `Furosemide`), no chip ever renders.
- [ ] When RxNorm has no candidate (`asdfgh`), no chip renders.
- [ ] Case-only differences (`furosemide` vs `Furosemide`) do NOT trigger a chip — already filtered at `classify.ts:93`.
- [ ] If caregiver dismisses chip and submits `Furosemde`, the insert proceeds; `classifyDrugByName` server-side computes the correct `drug_class` from the corrected RxCUI.

### Functional — happy path: photo extraction
- [ ] Caregiver opens `/me/medications/scan`, taps *"Take photo"* → `Camera.getPhoto` opens native camera (Capacitor) or browser file picker (web fallback). On capture, image renders in preview within 1s.
- [ ] Tapping *"Use this photo"* fires client-side compression → POST to `/api/medications/scan` → review state appears with extracted med cards within p50 ≤6s, p95 ≤10s.
- [ ] Single-med happy path: photo of a Lasix bottle → review screen shows one card *"Lasix · 40 mg · 1× per day"* in confident mode → tap *"Add to my list"* → inline `MedicationForm` opens pre-filled → tap *Save* → med appears on `/me/medications` and `<TodaysMedsCard>` on `/dashboard`.
- [ ] Multi-med happy path: screenshot of a 5-drug list from a portal → review screen shows 5 cards → tap *"Add all"* (when all 5 are confident) → all 5 land in DB via the existing `addMedication` insert path with correct `drug_class` via RxNorm.
- [ ] *"Take another photo"* CTA returns the user to the capture state, clearing prior extracted cards.

### Edge cases
- [ ] **Empty image** (white/black frame, cat photo, unrelated screenshot): Gemini returns 0 meds → review screen shows *"No medications detected. Try a clearer photo."* Single CTA: *"Take another."*
- [ ] **Handwritten prescription**: Gemini's confidence drops below 0.7 → cards render in needs-verification mode; caregiver taps each field to confirm/edit before save eligible.
- [ ] **>20 meds detected**: review screen shows first 20 cards plus a banner *"Showing the first 20 medications. Re-scan with a tighter crop if needed."*
- [ ] **Drug name that fails RxNorm classification**: insert still proceeds with `drug_class='other'` (matches manual-entry behavior).
- [ ] **Dose-unit mismatch on extracted med** (e.g., model returns "10 L Jardiance"): existing `validateDoseAgainstStrengths` in `addMedication` rejects with the standard error message → caregiver lands back on the form with the error inline → caregiver edits unit → resubmits.
- [ ] **Spell-correction chip + scan interaction**: caregiver scans an image where Gemini returns a typo'd name (e.g., "Furosemde"); the inline `MedicationForm` that opens after *"Add to my list"* shows the spell-correction chip with *"Did you mean Furosemide?"* — same code path.
- [ ] **Image larger than 1.2MB after compression**: API route returns 400 with *"Image too large. Try a closer photo."* (Compression should make this rare; this is the server-side guard.)
- [ ] **Camera permission denied** (mobile Safari or Capacitor native): explainer shown — *"HeartNote needs camera access to scan labels. Use Upload instead."* Only the Upload CTA visible.
- [ ] **Caregiver navigates away mid-flow**: review state is dropped from React state. No persistence. Caregiver re-runs scan.

### Error states
- [ ] **Network failure mid-upload**: client retries once automatically; on second failure, shows *"Couldn't reach the server — try again."* with retry CTA. No partial server state (no DB writes occurred).
- [ ] **Vertex AI timeout (>15s)**: `/api/medications/scan` returns 504. UI shows *"Couldn't read this one — try a clearer photo or add manually."* No retry loop.
- [ ] **Vertex AI returns invalid JSON despite responseSchema**: API route catches, returns 504, logs `[scan-extract] schema-fail` server-side. Same UI message.
- [ ] **Vertex AI rate limit**: 429 from upstream → API route returns 429 → UI shows *"Try again in a moment."* Friendly, no crash.
- [ ] **Auth missing**: API route returns 401, UI redirects to `/login`.
- [ ] **Vertex env vars missing**: API route throws at module-init — first request returns 500 with *"Server misconfigured."* No fallback to consumer Gemini.
- [ ] **`addMedication` server-side rejects (RLS, unit mismatch, etc.)**: review card stays in the list with the specific error message inline; caregiver can edit and retry without losing other extracted cards.

### Performance
- [ ] Camera-to-preview ≤1s on mid-tier mobile (iPhone 13).
- [ ] Compression-to-preview-render ≤300ms for a 4MB source image.
- [ ] `/api/medications/scan` round-trip p50 ≤6s, p95 ≤10s.
- [ ] Review-state render after API response: ≤200ms.
- [ ] Compressed image payload ≤800KB target (1.2MB hard ceiling).
- [ ] Spell-correction chip renders within ~600ms of caregiver stopping typing (existing debounce + RxNorm).

### Persistence
- [ ] Image bytes are never written to disk, Storage, or DB.
- [ ] No drafts table; no `localStorage` of extraction results.
- [ ] Confirmed meds persist via the existing `medications` table insert path. Refresh shows them in `/me/medications`.
- [ ] Skipped or unconfirmed cards leave no trace.

### Permissions / RLS
- [ ] No new tables → no new RLS policies needed.
- [ ] `/api/medications/scan` requires authenticated session via `createClient()` — service-role key is never used.
- [ ] Outbound to Vertex AI carries image bytes only — no `patient_id`, no `caregiver_id`, no Supabase JWT. Verified by inspecting the outgoing request payload in dev.
- [ ] Inserts go through the existing `addMedication` server action which already filters by `patient_id` from the caregiver's session.

### Side effects
- [ ] Successful "Add" on a scanned med = identical side effects to manual `addMedication`: `revalidatePath('/me/medications')` + `revalidatePath('/dashboard')`.
- [ ] No alert engine signals (build conv #4 — alerts are a separate engine; this is data entry).
- [ ] No `medication_events` rows created (scan is med setup, not dose tracking).
- [ ] No router push to other routes from inside `/me/medications/scan` except: (a) auth redirect, (b) caregiver-initiated tap on *"Done"* / *"Back"* link to `/me/medications`.

### Manual verification (~3-min reproduction)
1. Sign in as a test caregiver. Confirm the scan button only appears on `/me/medications` (not on `/dashboard`, `/log`, `/me`).
2. Type `Furosemde` in the drug-name field on `/me/medications/new`. Wait ~600ms. Verify chip *"Did you mean Furosemide?"* appears. Tap. Verify input becomes `Furosemide`, chip disappears, "Comes in 20 mg, 40 mg, …" hint renders.
3. Type `asdfgh`. Verify no chip ever appears.
4. Type `Lasix`. Verify no chip appears (exact match, no correction).
5. Navigate to `/me/medications`, tap *"Scan a label."* On a phone, tap *"Take photo"*; in browser, tap *"Upload image"* and pick a Lasix bottle photo. Verify preview renders <1s.
6. Confirm the photo. Verify processing state shows for ≤8s, then review screen renders with one card *"Lasix · 40 mg · 1× per day"* in confident mode.
7. Tap *"Add to my list."* Inline `MedicationForm` opens, pre-filled. Tap *Save*. Verify Lasix is on `/me/medications` with `drug_class=loop_diuretic` and on `/dashboard`'s `<TodaysMedsCard>`.
8. Run scan again with a screenshot of a 5-drug list. Verify 5 cards render. Tap *"Add all."* Verify all 5 land in `/me/medications`.
9. Run scan with a cat photo. Verify *"No medications detected"* state.
10. Run scan with a deliberately blurry/handwritten image. Verify cards render in needs-verification mode (per-field tap-to-confirm); verify *"Add"* is disabled until all three fields confirmed.
11. Run scan offline (airplane mode). Verify error state with retry CTA. Verify no orphaned UI state on retry success.
12. Inspect outbound request to Vertex AI in dev tools network panel. Verify body contains image base64 + system prompt + schema only — no `patient_id`, no JWT, no `caregiver_id`.

## Open questions for the plan-review subagent

1. **Vertex AI auth in Vercel deployments.** `GOOGLE_VERTEX_AI_CREDENTIALS_JSON` as a base64-encoded service-account JSON env var is one pattern. Does Vercel have a more idiomatic way (Workload Identity Federation? OIDC?) that avoids long-lived service-account keys? Flag if so; this PR adopts the simplest path unless there's a better one.
2. **Confidence threshold = 0.7.** Pulled from heuristic, not a benchmark. Reviewer: should this be lower (more cards in confident mode, more risk of bad data) or higher (more cards in needs-verification mode, more friction)? No strong prior.
3. **`@capacitor/camera` web-fallback file-picker UX.** Spec-confirmed it auto-falls-back, but in practice mobile-Safari behavior varies. Reviewer: should we ship an explicit `<input type="file" accept="image/*" capture="environment">` fallback if the Capacitor plugin's web shim has known quirks?
4. **Should the "Add all" CTA gate on each med having passed RxNorm classification?** Currently it gates only on confidence ≥ 0.7. If the model is confident but the drug name fails RxNorm (returns `medClass='other'`), insert still proceeds with class='other'. Reviewer: is that acceptable, or should we surface a class-confirm step?
