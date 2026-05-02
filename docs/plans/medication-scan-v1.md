# Medication scan v1 — photo extraction + spell-correction chip

**Status:** REVISED. Plan-review subagent ran; this revision incorporates all 3 blockers + 10 should-fix + 5 nits, with caregiver decisions on dual-mode UX and "Add all" shortcut.

## Goal

Caregivers can add medications two new ways without typing the drug name from scratch:

1. **Spell-correction chip** — when typing a drug name into the manual-add form, if RxNorm's approximate match returns a corrected name (e.g., typed "Furosemde" → RxNorm returns "Furosemide"), surface a one-tap chip *"Did you mean Furosemide?"* under the drug-name field.
2. **Photo extraction** — open `/me/medications/scan`, capture or upload an image of a pill bottle, prescription label, or screenshot of a med list, and have a vision model extract `{drug_name, dose, doses_per_day}` per detected medication. Caregiver reviews each extracted med (per-field confirmation by default; *Add all* shortcut available when the list looks correct at a glance) and saves — confirmed meds route through the existing `addMedication` insert path (which already auto-classifies via RxNorm and validates dose units).

Both surfaces feed the same downstream pipeline: extracted/typed name → `classifyDrugByName` → drug_class + allowed_strengths → standard `medications` row insert. No new clinical inference. No alert-engine integration.

## Non-goals (explicit, do not creep)

- **No `schedule_times` extraction from photos.** Pill bottles do not reliably state clock times; "twice daily" sig phrases parse to `doses_per_day=2`, not 8am/8pm. Caregiver fills schedule_times manually after import.
- **No notes/allergy/Rx-number extraction.** Only the four fields above. Pharmacy-issued labels carry far more data; we ignore everything except drug name, dose, doses-per-day.
- **No persistent image storage.** Bytes pass through the API route once, go to Gemini, and are dropped. No Supabase Storage bucket. No debug retention. No signed URLs.
- **No multi-image batch upload.** One image per scan in v1. Caregiver re-runs the flow for additional photos.
- **No editing of an existing medication via photo.** Scan only creates new med rows.
- **No on-device OCR.** The hybrid Apple-Vision-on-device + cloud-cleanup pipeline researched as the v2 wildcard is deferred. v1 is a single cloud round-trip.
- **No spell-correction chip in voice-log med-mention chips.** The voice path's strict-match design at `src/app/api/voice-log/[id]/process/route.ts` is intentional. Out of scope.
- **No model-confidence-based UX gating.** The model's confidence score is *not* requested in the structured output and is not used anywhere — we always render extracted values for caregiver confirmation.
- **No dose-change extraction.** If a label contains taper/future-dose language ("increase to 80 mg starting Monday," "taper to 20 mg over 2 weeks"), the medication is *not* extracted — instead a flag fires that the UI surfaces as *"This label has dose-change instructions — confirm with the prescriber and add manually."* Build convention #6.
- **No course-tracking** ("2× for 7 days" antibiotic flow). Already deferred from medication-flow-v1; not introduced here.
- **No multi-vendor abstraction.** Direct Vertex AI client, no provider-swap layer.

## Architectural decisions (locked)

1. **Vision model: Gemini 2.5 Flash via Vertex AI** (not consumer Gemini API). Chosen over Claude Sonnet 4.6 vision based on the research recommendation: best real-world OCR on curved/glare pill-bottle photos per OmniAI + Reducto benchmarks, ~10× cheaper at our scale, native structured-output with `responseSchema`. Vertex AI is the BAA-eligible / no-train-on-input tier.
2. **Camera plugin: `@capacitor/camera` + `@ionic/pwa-elements`.** Capacitor core (8.3.1) is already in `package.json`. Add `@capacitor/camera` and `@ionic/pwa-elements` deps. PWA Elements is registered once via `defineCustomElements(window)` in a small client-boundary module included by `src/app/layout.tsx`. Without PWA Elements, the plugin's web shim ignores `CameraSource.Camera` — its inclusion is mandatory, not optional. Once iOS/Android Capacitor projects are generated, the same code path uses native camera.
3. **Image compression: client-side Canvas API.** Resize to max 1280px on the long edge, encode as JPEG at quality 0.8, target ≤800KB. No external service. Compression-then-OCR-quality tradeoff at this target is unverified; AC adds an empirical step before merge (read ≥10 representative pill-bottle photos at this setting and confirm extraction quality).
4. **No image storage.** Image bytes flow request body → API route → Gemini → discarded. Not written to disk, Supabase Storage, or DB. PHI minimization (pill bottles often show patient name).
5. **No prefill drafts table.** The entire scan→review→confirm flow lives in client state on a single client component. No DB intermediate. State drops on navigation away — caregiver re-runs scan if they navigate back too soon (UX copy acknowledges this empathetically).
6. **No confidence-based UX gating, no confidence in the schema.** The model is not asked to produce a confidence field. Every extracted med renders the same way: tap-each-field-to-confirm. There is no "confident mode" / "needs-verification mode" split. Removing the dual-mode UX removes the unbenchmarked 0.7 threshold and the structural ambiguity it created.
7. **Per-card confirmation by default; *Add all* as a power-user shortcut.** The default save flow on every card requires the caregiver to tap-confirm `drug_name`, `dose`, and `doses_per_day` (each tap either confirms the extracted value or opens an inline edit) before that card's *"Add to my list"* button enables. A top-of-list *"Add all"* button is always available and bypasses per-field confirmation — saves all currently displayed cards as-extracted. Caregiver takes responsibility for the visual review when they choose this path.
8. **Multi-med ceiling: 30.** If Gemini returns >30 extracted meds, we truncate to the first 30 and show *"Showing the first 30 medications. Re-scan with a tighter crop if needed."* Generous enough for portal screenshots of high-polypharmacy patients.
9. **Single-med vs multi-med UX is one component.** The review screen is a list-of-cards. With one extracted med it shows one card; with five it shows five. No conditional routing. Each card supports inline edit-then-save via the existing `MedicationForm` component (passed as initial values).
10. **Re-classification through existing `classifyDrugByName`.** Extracted drug names go through the same RxNorm pipeline as manual entry. Same `drug_class` taxonomy. Same `allowed_strengths`. Same dose-unit validation. If the extracted dose conflicts with RxNorm-known strengths (e.g., model misreads "10 mL Jardiance"), the existing server-side validation in `addMedication` rejects it and the caregiver edits inline before resubmit.
11. **Vertex caching is *not* enabled in v1.** Build convention #3 ("prompt caching enabled from day 1") is Anthropic-specific. Vertex AI's `createCachedContent` is a separate provisioned-resource model (not request-scoped) with cache lifecycle, naming, and TTL overhead that isn't justified at our scale: the system prompt is ~400 tokens and a caregiver scans a few times per day at most. Documented here so a future reviewer doesn't read silence as oversight.
12. **Outbound payload to Gemini is image bytes + system prompt + JSON schema only.** No `patient_id`, no `caregiver_id`, no Supabase user JWT. PHI risk surface is the bottle itself (label data) — that's intentional input; we add no additional identifier.
13. **Auth: long-lived service-account JSON for v1.** `GOOGLE_VERTEX_AI_CREDENTIALS_JSON` (base64-encoded SA JSON) for the Vertex client. Pre-launch / zero-customers — the rotation cost is acceptable. Post-launch migration to OIDC + Workload Identity Federation is recorded in `docs/status.md` as a follow-up. Pick one, document the deferral; don't leave both as open questions.
14. **Env vars fail closed.** Missing `GOOGLE_VERTEX_AI_PROJECT_ID`, `GOOGLE_VERTEX_AI_LOCATION`, or `GOOGLE_VERTEX_AI_CREDENTIALS_JSON` → `/api/medications/scan` route throws on first call. No fallback to consumer Gemini API. (Build convention #11.)
15. **Spell-correction is a UI surface for existing data.** `classifyDrugByName` already returns `suggestedName` (`src/lib/medications/classify.ts:93-95`). The existing 500ms-debounced `lookupDrugStrengths` action throws this away (`src/app/me/medications/actions.ts:14-21`). We thread it through, no new RxNorm call.
16. **Spell-correction never auto-corrects.** Chip is one-tap-to-accept. If caregiver dismisses or ignores, their literal text submits and `classifyDrugByName` server-side still computes `drug_class` correctly (RxNorm uses the corrected RxCUI internally even when the user keeps the typo).
17. **API output schema vs form payload schema — divergence by design.** `ExtractedMedSchema` (returned by `/api/medications/scan`) carries the *model's* shape: `dose_value: number`, `dose_unit: string` as separate fields, because that's what Gemini's structured output produces cleanly. `MedicationPayloadSchema` (consumed by `addMedication`) carries the *form's* shape: `dose: string` matching `DOSE_FORMAT` (e.g., `"40 mg"`). The boundary between them is the `<ScanReviewCard />` adapter: when the caregiver taps *"Add to my list"*, the card combines `${dose_value} ${dose_unit}` into the payload string and submits. Documented to prevent a future reader from "unifying" the schemas without understanding why they differ.
18. **Primary-CTA hierarchy on `/me/medications`:** *"Add medication"* stays primary (existing prominent rounded-full button). *"Scan a label"* is added as a secondary affordance — smaller, less visually weighted, positioned adjacent or directly below. Manual entry remains the default; scan is an alternative path, not the new primary.

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
- **Review state.** List of extracted med cards. Each card = `<ScanReviewCard />` (see below). Two top-of-list CTAs: *"Add all"* (always available, bypasses per-field confirmation) and *"Skip all"*. Bottom CTA: *"Take another photo"* — returns to capture state.

If `/api/medications/scan` returns the dose-change-instruction flag for any extracted med, that med renders as a non-interactive notice card (*"This label has dose-change instructions — confirm with the prescriber and add manually."*) — no save path, only *Skip*.

### New: `src/app/me/medications/scan/scan-review-card.tsx`
Client component. Receives one extracted med. Single render mode (no confidence-based variants):

- Three field cells: *Drug name*, *Dose*, *Doses per day*. Each cell shows the extracted value with a tap-to-confirm/edit affordance. On first tap, the cell either confirms (if value is correct) or opens an inline edit. Once all three are confirmed, the card's *"Add to my list"* button enables. Tapping *"Add to my list"* expands the existing `<MedicationForm mode="new" initial={...} />` inline (already a client component, takes `initial` props); caregiver can edit additional fields (schedule_times, started_at, notes) before final save.
- *"Skip"* removes the card from the list.

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
- Inspects `candidates[0].finishReason`:
  - `"STOP"` → parse `medications[]` and return.
  - `"SAFETY"` / `"BLOCKLIST"` / `"PROHIBITED_CONTENT"` → throw a typed `SafetyFilterError`; API route returns 422 with a UI message *"We couldn't process this image. Try another."* (distinct from genuine zero-meds).
  - `"MAX_TOKENS"` / other → throw generic; API route returns 504.
- Validates with Zod against `ExtractedMedSchema`. Truncates to first 30 entries.
- 15s hard timeout via AbortController. On timeout: throws — API route catches, returns 504.
- On any error, server-side `console.warn('[extractMedicationsFromImage] ...')` (matches existing convention from `[classifyDrugByName]`). No PHI in the warning, just `timeout`, `safety-filter`, `schema-fail`.

### New: `src/lib/medications/scan/prompt.ts`
Single export: `EXTRACTION_SYSTEM_PROMPT`. Specifies (paraphrased; final wording in code):

- Extract only medications visible in the image. Do not invent.
- Each medication has: `drug_name` (string), `dose_value` (number or null), `dose_unit` (string or null), `doses_per_day` (1–12 or null for PRN/unknown), `is_dose_change` (boolean — see below).
- If the image contains no medications, return `{medications: []}`.
- Return at most 30 medications.
- Do NOT extract: schedule times, notes, prescriber names, Rx numbers, refill counts, patient names.
- **Dose-change rule (load-bearing):** if the label or list states a dose change, taper, or future-dated instruction (e.g., *"increase to 80 mg starting Monday,"* *"taper to 20 mg over 2 weeks,"* *"reduce by half on Thursday"*), set `is_dose_change: true` for that medication, return the medication name only, and leave dose fields null. Do **not** extract the new dose value as if it were the current one. This rule has no exceptions.
- Hard rule: never invent values for fields you cannot see clearly. Prefer omitting (null) over guessing.

### New: `src/lib/medications/scan/schema.ts`
Two exports:
- `ExtractedMedSchema` — Zod schema for one extracted med: `{drug_name: string, dose_value: number | null, dose_unit: string | null, doses_per_day: number | null, is_dose_change: boolean}`. **No confidence field.**
- `extractedMedsResponseSchema` — Gemini structured-output JSON schema (matches the Zod shape).

A header comment in this file documents the divergence vs `MedicationPayloadSchema` per architectural decision #17.

### Modified: `src/app/me/medications/page.tsx`
Add a secondary *"Scan a label"* button below the existing *"Add medication"* primary button → links to `/me/medications/scan`. Per architectural decision #18, the secondary button is visually less weighted (e.g., smaller, ghost/outline style instead of filled). Per the scoping decision, this button only renders on `/me/medications`.

### Modified: `src/app/layout.tsx`
Adds a `<PwaElementsBootstrap />` client-boundary component (one-line `defineCustomElements(window)` call wrapped in a `'use client'` component with a `useEffect`) so PWA Elements register exactly once on app boot. Required for `@capacitor/camera` web fallback per architectural decision #2.

### Modified: `package.json`
Add deps:
- `@capacitor/camera` (matched to existing `@capacitor/core@^8.3.1` major)
- `@ionic/pwa-elements` (matches Capacitor 8.x compatible release)
- `@google-cloud/vertexai`

### Modified: `.env.example`
Add three entries (no values):
- `GOOGLE_VERTEX_AI_PROJECT_ID=`
- `GOOGLE_VERTEX_AI_LOCATION=` (e.g., `us-central1`)
- `GOOGLE_VERTEX_AI_CREDENTIALS_JSON=` (base64-encoded service-account JSON)

## Acceptance criteria

### Engineering
- [ ] Plan reviewed by fresh-context subagent (done — 3 blockers + 10 should-fix + 5 nits applied).
- [ ] No new abstractions beyond `src/lib/medications/scan/{extract.ts, prompt.ts, schema.ts}`.
- [ ] Server-side classification reuses `classifyDrugByName` — no duplicate logic (`code-quality.md` rule 2).
- [ ] No clinical numbers hardcoded.
- [ ] Diff scoped to: `src/app/me/medications/`, `src/lib/medications/scan/`, `src/app/api/medications/scan/route.ts`, `src/app/layout.tsx`, `package.json`, `.env.example`. No edits to unrelated files. No edits to voice-log code.
- [ ] No edits to `src/app/me/medications/actions.ts` beyond extending `lookupDrugStrengths` return shape.
- [ ] Spell-correction and scan land in one PR — same `classify.ts` thread-through plus shared inline `MedicationForm` reuse means review concentration is the right tradeoff over revert clarity.
- [ ] `docs/status.md` follow-up logged: post-launch migration from SA-JSON auth to OIDC + Workload Identity Federation.

### Functional — happy path: spell-correction chip
- [ ] Caregiver types `Furosemde` (typo) into the drug-name field on `/me/medications/new`. Within ~600ms (existing 500ms debounce + ≤2s RxNorm budget already implemented), a chip renders below the field reading *"Did you mean Furosemide?"*.
- [ ] Tapping the chip replaces the input value with `Furosemide`. The chip disappears once the corrected lookup matches exactly. The "Comes in 20 mg, 40 mg, …" hint then renders below the dose pill.
- [ ] When the typed name matches RxNorm exactly (`Lasix`, `Furosemide`), no chip ever renders.
- [ ] When RxNorm has no candidate (`asdfgh`), no chip renders.
- [ ] Case-only differences (`furosemide` vs `Furosemide`) do NOT trigger a chip — already filtered at `classify.ts:93`.
- [ ] If caregiver dismisses chip and submits `Furosemde`, the insert proceeds; `classifyDrugByName` server-side computes the correct `drug_class` from the corrected RxCUI.

### Functional — happy path: photo extraction
- [ ] Caregiver opens `/me/medications/scan`, taps *"Take photo"* → `Camera.getPhoto` opens native camera (Capacitor) or browser file picker (web fallback via PWA Elements). On capture, the captured `dataUrl` is set into an `<img src>` and `onLoad` has fired within 1s on iPhone-13-class hardware.
- [ ] Tapping *"Use this photo"* fires client-side compression → POST to `/api/medications/scan` → review state appears with extracted med cards within p50 ≤6s, p95 ≤10s.
- [ ] **Per-card confirm path:** review screen shows one or more cards. On each card, caregiver taps *Drug name* (confirms or edits), then *Dose* (confirms or edits), then *Doses per day* (confirms or edits). Once all three fields confirmed, the card's *"Add to my list"* button enables. Tapping it expands the inline `MedicationForm` pre-filled — caregiver saves → med appears on `/me/medications` and `<TodaysMedsCard>` on `/dashboard`.
- [ ] **"Add all" path:** review screen shows N cards. Caregiver visually scans the list, sees all values look correct, taps *"Add all"* (top-of-list, always available). All N cards are saved via the existing `addMedication` insert path. Manual verification step covers a 5-med screenshot scenario.
- [ ] Manual verification sample for happy path: a Lasix bottle photo extracts to one card with the printed drug name (brand `Lasix` *or* generic `Furosemide`, whichever is on the bottle), `40 mg` (or whatever's printed), and *1× per day* (or any rendering of `1×`/`once daily`/`q.d.` — we trust the printed name; classification handles brand→generic separately).
- [ ] *"Take another photo"* CTA returns the user to the capture state, clearing prior extracted cards.

### Functional — dose-change rule (build conv #6)
- [ ] Photo of a label saying *"increase to 80 mg starting Monday"* extracts as `{drug_name: <name>, is_dose_change: true, dose_value: null, dose_unit: null, doses_per_day: null}`.
- [ ] The card renders as a non-interactive notice: *"This label has dose-change instructions — confirm with the prescriber and add manually."* No *"Add to my list"* button. Only *"Skip"*.
- [ ] *"Add all"* button **does not** insert dose-change-flagged cards (they remain in the list, only flagged cards persist).

### Edge cases
- [ ] **Empty image** (white/black frame, cat photo, unrelated screenshot): Gemini returns 0 meds with `finishReason='STOP'` → review screen shows *"No medications detected. Try a clearer photo."* Single CTA: *"Take another."*
- [ ] **Safety-filter response** (`finishReason='SAFETY'` etc.): API returns 422; UI shows *"We couldn't process this image. Try another."* — distinct from genuine zero-meds.
- [ ] **Handwritten or low-quality prescription**: extraction may return missing fields (null `dose_value`, etc.). The card still renders; the missing fields show "—" and the caregiver fills them in via the per-field confirm tap (which opens an editor).
- [ ] **>30 meds detected**: review screen shows first 30 cards plus a banner *"Showing the first 30 medications. Re-scan with a tighter crop if needed."*
- [ ] **Drug name that fails RxNorm classification**: insert still proceeds with `drug_class='other'` (matches manual-entry behavior).
- [ ] **Dose-unit mismatch on extracted med** (e.g., model returns "10 L Jardiance"): existing `validateDoseAgainstStrengths` in `addMedication` rejects with the standard error message → caregiver lands back on the form with the error inline → caregiver edits unit → resubmits.
- [ ] **Spell-correction chip + scan interaction**: caregiver scans an image where Gemini returns a typo'd name (e.g., "Furosemde"); the inline `MedicationForm` that opens after *"Add to my list"* shows the spell-correction chip with *"Did you mean Furosemide?"* — same code path.
- [ ] **Image larger than 1.2MB after compression**: API route returns 400 with *"Image too large. Try a closer photo."*
- [ ] **Camera permission denied** (mobile Safari or Capacitor native): explainer shown — *"HeartNote needs camera access to scan labels. Use Upload instead."* Only the Upload CTA visible.
- [ ] **Caregiver navigates back mid-flow**: browser back button returns to `/me/medications` (the route that linked to `/scan`). All scan state — captured image, extracted cards, in-progress confirms — is dropped from React state. UI on `/me/medications/scan` includes a one-line empathetic note in the review state: *"Tapped Back too soon? Scan again from the list."* Re-running the scan starts from a clean state.

### Error states
- [ ] **Network failure mid-upload**: client retries once automatically; on second failure, shows *"Couldn't reach the server — try again."* with retry CTA. No partial server state (no DB writes occurred).
- [ ] **Vertex AI timeout (>15s)**: `/api/medications/scan` returns 504. UI shows *"Couldn't read this one — try a clearer photo or add manually."* No retry loop.
- [ ] **Vertex AI returns invalid JSON despite responseSchema**: API route catches, returns 504, logs `[extractMedicationsFromImage] schema-fail` server-side. Same UI message.
- [ ] **Vertex AI rate limit**: 429 from upstream → API route returns 429 → UI shows *"Try again in a moment."*
- [ ] **Auth missing**: API route returns 401, UI redirects to `/login`.
- [ ] **Vertex env vars missing**: API route throws at module-init — first request returns 500 with *"Server misconfigured."* No fallback to consumer Gemini.
- [ ] **`addMedication` server-side rejects single card** (RLS, unit mismatch, etc.): review card stays in the list with the specific error message inline; caregiver can edit and retry without losing other extracted cards.
- [ ] **`addMedication` partial failure on *"Add all"***: succeeded cards disappear from the list; failed cards remain in the list with per-card error chips inline; top-of-list summary reads *"3 added, 2 need a fix."* Caregiver works the remaining cards individually.

### Performance
- [ ] Camera-to-preview ≤1s on iPhone-13-class hardware (verified by `onLoad` timing).
- [ ] Compression-to-preview-render ≤300ms for a 4MB source image.
- [ ] `/api/medications/scan` round-trip p50 ≤6s, p95 ≤10s. **Measurement plan:** ≥10 representative pill-bottle photos (mix of clean labels, glare, curved bottles) at 1280px/JPEG-0.8, measured against `us-central1` from a Vercel preview deployment.
- [ ] Compression-output-quality verification: same 10-photo corpus, confirm extraction quality is unchanged (or document any degradation) before merge. Empirical, not assumed.
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
- [ ] No alert engine signals (alerts are a separate engine; this is data entry).
- [ ] No `medication_events` rows created (scan is med setup, not dose tracking).
- [ ] No router push to other routes from inside `/me/medications/scan` except: (a) auth redirect, (b) caregiver-initiated tap on *"Done"* / *"Back"* link to `/me/medications`.

### Manual verification (~3-min reproduction)
1. Sign in as a test caregiver. Confirm the *"Scan a label"* button only appears on `/me/medications` (not on `/dashboard`, `/log`, `/me`).
2. Type `Furosemde` in the drug-name field on `/me/medications/new`. Wait ~600ms. Verify chip *"Did you mean Furosemide?"* appears. Tap. Verify input becomes `Furosemide`, chip disappears, "Comes in 20 mg, 40 mg, …" hint renders.
3. Type `asdfgh`. Verify no chip ever appears.
4. Type `Lasix`. Verify no chip appears (exact match, no correction).
5. Navigate to `/me/medications`, tap *"Scan a label."* On a phone, tap *"Take photo"*; in browser, tap *"Upload image"* and pick a Lasix bottle photo. Verify preview `<img>` `onLoad` fires within 1s.
6. Confirm the photo. Verify processing state shows for ≤8s, then review screen renders with one card showing the printed drug name (`Lasix` or `Furosemide`), the printed dose, and the printed frequency in any format.
7. Tap *Drug name* — confirm. Tap *Dose* — confirm. Tap *Doses per day* — confirm. Verify *"Add to my list"* button enables. Tap it. Inline `MedicationForm` opens, pre-filled. Tap *Save*. Verify the med is on `/me/medications` with correct `drug_class` and on `/dashboard`'s `<TodaysMedsCard>`.
8. Run scan again with a screenshot of a 5-drug list. Verify 5 cards render. Tap *"Add all."* Verify all 5 land in `/me/medications` (or, if any failed, the failed cards remain with error chips and summary reads *"X added, Y need a fix"*).
9. Run scan with a deliberately-included taper instruction (e.g., a label that says *"increase to 80 mg starting Monday"*). Verify that med renders as a non-interactive notice card with the "confirm with prescriber" copy and only a *Skip* CTA.
10. Run scan with a cat photo. Verify *"No medications detected"* state.
11. Run scan offline (airplane mode). Verify error state with retry CTA. Verify no orphaned UI state on retry success.
12. Inspect outbound request to Vertex AI in dev tools network panel. Verify body contains image base64 + system prompt + schema only — no `patient_id`, no JWT, no `caregiver_id`.

## Open questions

None remaining. All review-surfaced questions are now locked decisions in §Architectural decisions or §Non-goals.
