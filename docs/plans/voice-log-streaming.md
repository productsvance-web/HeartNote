# Voice-log streaming redesign — full plan + ACs

**Status:** PROPOSED. Awaiting user approval before implementation. Plan-review subagent already ran; this revision incorporates findings.

## Goal

Replace the current record→Whisper→Claude pipeline with **live streaming transcription via Deepgram** + **structured tile fill as the user speaks** + **Claude extraction at end-of-recording**. Preserve the full 22-field clinical extraction underneath (the inputs the future tier-detection alert engine will run on).

The "doctor writing while you dictate" feel comes from two layers:
1. The transcript animates in word-by-word as Deepgram streams partials.
2. Cheap regex triggers light up tiles in real time as recognized keywords/numbers appear ("174 lb" → Weight tile fills mid-sentence).

At Stop: the final transcript goes to the existing Claude `extractWithClaude()` function (unchanged), which returns the authoritative 22-field structured output. The tile values are overwritten with Claude's results (regex was visual confirmation only — not the source of truth).

## Non-goals

- **Calendar / historical day view.** Separate PR after this lands.
- **Medication tracking as a structured field.** Not in current schema; adding it here is scope creep. Transcripts still capture whatever the user says about meds. Add a `meds_taken` field when we build medication tracking as a feature.
- **Re-extraction of old logs.** Future feature; will reintroduce audio storage when needed.
- **Privacy-policy / state-law (WA MHMD, CA CMIA) compliance audit.** Launch task, not feature task. Flagged as a launch blocker separately.
- **iOS App Store submission / TestFlight.** Capacitor build will be tested locally; App Store work is later.

---

## The tile set (cited from `extract.ts` + `research/chf-source-of-truth.md`)

### Primary tiles — always shown during the daily flow (10)

Tiles are also a **daily-care guide**: their visible presence cues the caregiver to mention or measure each item. Empty state on a tile reads "Tap if measured today" / "Mention to log."

| Tile | Schema column(s) | Tier-1 alert if… |
|---|---|---|
| **Weight** | `weight_lb` (number, lb) | Trend rule, not single-value (handled by future alert engine) |
| **Blood pressure** | `systolic_bp`, `diastolic_bp` | Hypotension (SBP <90) or hypertensive crisis (SBP >180) — alert engine, not single-tile rule |
| **Heart rate** | `resting_hr` | Resting tachycardia (>110) is a tier-2 decompensation sign |
| **Oxygen** | `spo2` | SpO2 <92% is a tier-2 sign |
| **Breathing** | `dyspnea_level` (0–4 scale) | `dyspnea_level === 4` (at rest, can't finish sentences) |
| **Swelling** | `swelling_severity` (0–4) | `swelling_severity === 4` (anasarca) — tier-2; trip-line is at-rest dyspnea, not swelling alone |
| **Energy** | `fatigue_level` (0–4) | `fatigue_level === 4` ("can't move from chair") — tier-2 |
| **Sleep** | `pillow_count`, `pnd_episode` | `pnd_episode === true` (woke gasping) |
| **Cough** | `cough_present`, `cough_nocturnal`, `sputum_color` | `sputum_color === 'pink_frothy'` (911-tier acute pulmonary edema) |
| **Appetite** | `appetite_change` ('decreased'/'unchanged'/'increased'), `early_satiety` | None (informs trends) |

**Cite:** every threshold above is verbatim from `extract.ts` field descriptions and `research/chf-source-of-truth.md`. Vitals thresholds (SBP <90, HR >110, SpO2 <92) confirmed against the research file before code is written. The trends feature, when it ships, uses the same column data — tiles ARE the trend inputs.

### Alert chips — appear only if extracted as true/severe (4)

These are NOT tiles. They render as red banners at the top of the review screen if Claude extracts them, with explicit tier-1 / tier-2 labels and "call the cardiologist today" copy (no medical advice beyond that, per CLAUDE.md rule #6).

| Chip | Field |
|---|---|
| **Chest pain** | `chest_pain === true` |
| **Fainting** | `syncope === true` |
| **Blue lips/fingers** | `cyanosis === true` |
| **Severe confusion** | `cognition_change === 'severe'` |

### Background-captured fields — visible in "more notes" expand only (8)

`feeling_score`, `extremities_cold_clammy`, `early_satiety` (also under Appetite), `urine_output_change`, `chest_pain_character`, `activity_tolerance_change`, `cognition_change` (mild/confusion levels), full transcript.

**Coverage check:** every one of the 22 fields in the existing `LOG_OBSERVATION_TOOL` schema in `extract.ts` is mapped above. Nothing dropped. The 22-field extraction stays untouched; the tiles are presentation only.

---

## Architecture

### Browser flow

1. User taps "Record" → request mic permission (existing).
2. Open one MediaStream. Fork to Deepgram WebSocket (no second fork — audio is not persisted).
3. Mint a Deepgram temp token immediately before WebSocket open via new server endpoint `/api/voice-log/deepgram-token` (POST). Token TTL: 30s. On reconnect, mint a fresh token.
4. Stream audio bytes to Deepgram. Receive partial + final transcript events. Append finals to a transcript buffer; show interim text with a faint highlight.
5. Run cheap regex triggers on the running transcript to light up tiles (visual confirmation only — see below).
6. User taps "Stop" → close mic stream, close Deepgram socket.
7. POST the final transcript text to the existing-but-simplified `/api/voice-log/[id]/process` endpoint.
8. Server runs `extractWithClaude()` (unchanged). Claude returns 22-field structured output. Server writes to `daily_logs`.
9. Client polls `/api/voice-log/[id]/status` (unchanged) until `complete`. Tiles re-render with Claude's authoritative values, overwriting any regex-derived placeholders. Alert chips render if any tier-1 fields are true.

### Live tile-fill: Deepgram keyterms + numeric regex (visual feedback during dictation)

Two layers, both running on partial/final transcripts as they arrive. **These do not write to the DB.** They populate a separate `liveTiles` state in the client. Claude's authoritative extraction at end-of-recording overwrites them.

#### Layer 1 — keyword spotting via Deepgram `keyterms` (Nova-3 feature)

Instead of hand-rolled regex for symptom keywords, we ship a structured **synonym dictionary** at `src/lib/voice-log/keyword-map.ts`:

```ts
export const KEYWORD_MAP: Record<TileKey, string[]> = {
  swelling: ['puffy', 'swollen', 'swelling', 'edema', 'ankles look big', 'feet are tight', 'fluid', 'bloated', ...],
  breathing: ['short of breath', 'out of breath', 'winded', 'huffing', "can't catch her breath", "can't catch his breath", 'gasping', ...],
  energy: ['tired', 'exhausted', 'wiped', 'no energy', 'fatigue', 'worn out', 'sluggish', 'dragging', ...],
  cough: ['cough', 'coughing', 'hacking', 'clearing throat'],
  sleep: ['pillow', 'pillows', 'orthopnea', 'propped up', 'sat up to breathe', 'woke up gasping', ...],
  appetite: ["didn't eat", 'no appetite', 'skipped meal', 'full quickly', "couldn't finish", 'picked at food', ...],
  // ...vitals tile keywords...
};

// Common CHF medications biased into recognition (replaces the lost Whisper-bias prompt)
export const CHF_MEDICATIONS: string[] = [
  'furosemide', 'lasix', 'torsemide', 'bumetanide',
  'sacubitril', 'valsartan', 'entresto',
  'lisinopril', 'losartan', 'metoprolol', 'carvedilol', 'bisoprolol',
  'spironolactone', 'eplerenone',
  'dapagliflozin', 'farxiga', 'empagliflozin', 'jardiance',
  'digoxin', 'amiodarone', 'warfarin',
  // colloquial: 'water pill', 'blood thinner', 'heart pill'
];
```

- **All terms** (symptoms + meds + vitals keywords) are passed to Deepgram as `keyterm` query parameters (singular, repeatable — Nova-3 only) when opening the WebSocket. This **biases recognition only** — it makes Deepgram more likely to correctly transcribe CHF-specific vocabulary like "furosemide," "orthopnea," "pink frothy" (replaces the WHISPER_MEDICAL_PROMPT we're losing). Deepgram does NOT tag matches in the response.
- Client-side, after every transcript update: a pure function `findMatchedKeyterms(transcript, KEYWORD_MAP)` does a case-insensitive `includes()` check for each synonym, returns the set of matched tiles. Lights up tiles whose synonyms appear in the transcript-so-far.
- Adding new caregiver phrasings is a one-line edit — no code changes, no regex maintenance.
- Verified: [Deepgram listen-streaming reference](https://developers.deepgram.com/reference/speech-to-text/listen-streaming) confirms `keyterm` is Nova-3-only and returns no match-tagging in the response payload.

#### Layer 2 — numeric regex (only for values, not symptoms)

Deepgram keyterms spot words; numeric values (weight, BP, HR, O2) still need lightweight regex on the running transcript. Lives in `src/lib/voice-log/numeric-extractors.ts`:

| Pattern | Tile populated |
|---|---|
| `\b(\d{2,3}(?:\.\d)?)\s*(lb|pound|pounds)\b` | Weight (`weight_lb`) |
| `\b(\d{2,3})\s*(?:over|\/)\s*(\d{2,3})\b` | BP (`systolic_bp` / `diastolic_bp`) |
| `\b(?:heart\s+rate|pulse|bpm)\D{0,15}(\d{2,3})\b` | HR (`resting_hr`) |
| `\b(?:oxygen|spo2|pulse\s+ox|o2)\D{0,15}(\d{2,3})\b` | O2 (`spo2`) |
| `\b(\d)\s*pillow` | Sleep (`pillow_count`) |

Six numeric patterns, no other regex. Pure functions. Unit-tested. ASCII-only, case-insensitive.

**Why this split is the right architecture:** keyterms scale (caregiver phrasings live in data, not code) and improve as Deepgram's model improves. Numeric regex is bounded (5 patterns, never grow). No client-side ML, no per-partial Claude calls.

### "End note" voice-activated stop

After ~10 seconds of recording, the client begins listening for an explicit "I'm done" phrase in Deepgram finals. Trigger phrases (in `keyword-map.ts` under `END_RECORDING_PHRASES`): `'end note'`, `'save log'`, `'i am done'`, `'i\'m done'`, `'that\'s all'`. Auto-stop fires when:
1. The phrase appears in the most recent `is_final` transcript segment, AND
2. It's at the END of that segment (not embedded mid-sentence), AND
3. Deepgram emits no further speech for 1 second.

The 1-second silence gate prevents false triggers like "I want to **end note** about the cough." Manual Stop button remains as the always-available primary action.

### Server flow

- **`POST /api/voice-log/deepgram-token`** — auth-gated; returns `{ token: string, expiresAt: number }`. Server uses `DEEPGRAM_API_KEY` to mint a 30s token via Deepgram's `/v1/auth/grant` endpoint (verify exact path during implementation; fallback: server-side WebSocket proxy if temp tokens aren't available for the chosen Deepgram model). Zod-validate empty body. Reject any non-POST. Returns 401 if no session.
- **`POST /api/voice-log/[id]/process`** — simplified. Accepts JSON body `{ transcript: string }` (Zod-validated; min 10 chars, max 4000 chars). Skips the Whisper step. Calls existing `extractWithClaude()`. Writes results.
- **`GET /api/voice-log/[id]/status`** — unchanged.

### Database

**No new fields added.** The 22 extracted fields all exist as columns already.

**Migration drops:**
- `daily_logs.audio_storage_path` column
- `daily_logs.whisper_confidence` column
- `audio_logs` storage bucket + 3 RLS policies
- `transcribing` value from the `log_processing_status` enum (Whisper is gone — state machine collapses to `pending` / `analyzing` / `complete` / `failed`)

Migration filename: `supabase/migrations/<timestamp>_drop_audio_storage_and_whisper.sql`. **Run `supabase db push` before merging** (CLAUDE.md migration rule).

---

## File plan

### New files

| File | Purpose |
|---|---|
| `src/app/api/voice-log/deepgram-token/route.ts` | POST endpoint that mints a 30s Deepgram temp token. Auth-gated, Zod-validated. |
| `src/lib/voice-log/keyword-map.ts` | Synonym dictionary: tile → caregiver-phrasing list, plus `CHF_MEDICATIONS` and `END_RECORDING_PHRASES`. The single source for what Deepgram listens for. |
| `src/lib/voice-log/numeric-extractors.ts` | Pure regex functions for numeric values (weight, BP, HR, O2, pillows). Exported as `extractNumericTiles(transcript: string): Partial<LiveTileState>`. |
| `src/lib/voice-log/deepgram-client.ts` | Browser-side helper: opens Deepgram WebSocket given a token + keyterm list (passed as `?keyterm=foo&keyterm=bar` query params), pipes a `MediaStream` through it, emits typed events (`onPartial`, `onFinal`, `onError`, `onClose`). Authenticates via `Sec-WebSocket-Protocol` header trick (browser WebSockets can't set Authorization headers). |
| `src/lib/voice-log/match-keyterms.ts` | Pure function `findMatchedKeyterms(transcript, KEYWORD_MAP) → Set<TileKey>` for client-side matching. Unit-tested against caregiver-phrasing examples. |
| `supabase/migrations/<ts>_drop_audio_storage_and_whisper.sql` | Schema cleanup. |
| ~~`__tests__/voice-log/*.test.ts`~~ | **Deferred.** No test runner installed; adding vitest violates the "no new deps" AC. Patterns are small and inspectable; correctness verified by manual smoke test. Add a test runner as part of the next feature that needs broader coverage. |

### Rewritten files

| File | Change |
|---|---|
| `src/app/log/voice-log-client.tsx` | Full rewrite. WebSocket recording, live transcript, live tiles, end-of-recording extraction. ~300 lines. |
| `src/app/log/actions.ts` | Renamed export `uploadVoiceLog` → `startVoiceLog` (or kept name; either way, it now creates the `daily_logs` row WITHOUT any audio handling — just `patient_id` + `log_date` + `pending` status — and returns the `logId`). No more FormData; takes a typed object. |
| `src/lib/voice-log/process.ts` | Drop `transcribeWithWhisper()`, `WHISPER_MEDICAL_PROMPT`, the audio-download step, the OPENAI_API_KEY env check. Function signature changes: `processVoiceLog(logId, callerUserId, transcript: string)`. State machine: `pending` → `analyzing` → `complete`/`failed`. |
| `src/app/api/voice-log/[id]/process/route.ts` | Read JSON body, Zod-validate transcript, call updated `processVoiceLog()`. |

### Deleted files

| File | Reason |
|---|---|
| `src/lib/voice-log/audio-mime.ts` | No more audio uploads — MIME-type-to-extension helper is dead. |

### Unchanged files

- `src/app/log/page.tsx` — auth check + render. Does not touch audio.
- `src/app/api/voice-log/[id]/status/route.ts` — same shape.
- `src/lib/voice-log/extract.ts` — Claude extraction logic stays intact, including the `cache_control: { type: 'ephemeral' }` on the system prompt (CLAUDE.md prompt-caching rule).
- `src/app/dashboard/page.tsx` — references the existing `daily_logs` row shape (still valid).

---

## Acceptance criteria

### Engineering

- [ ] Plan-review subagent ran and findings addressed (this revision).
- [ ] Diff scoped to files listed above. No edits to dashboard, auth, onboarding, or unrelated routes.
- [ ] No new abstractions beyond the listed ones (`live-triggers.ts`, `deepgram-client.ts`, the new token route). No "framework," no "pluggable provider" indirection.
- [ ] All unused imports/files removed (clean removal — `audio-mime.ts`, the Whisper code path, the `transcribing` enum value). No `_unused` rename hacks.
- [ ] No new npm dependencies. Use the browser-native `WebSocket` and `MediaRecorder` APIs (no `@deepgram/sdk` for the client; the SDK is unnecessary for our flow).
- [ ] `supabase db push` is run before merge.
- [ ] Code-review subagent (fresh context) ran on the diff before merge.

### Functional — happy path

- [ ] Caregiver taps Record. Within 600ms of taps the mic permission prompt appears (or recording starts if permission was previously granted).
- [ ] Within 1.2s of granting permission, the WebSocket is open, the timer starts, and the UI is in the "recording" state with a waveform/pulse animation.
- [ ] As the caregiver speaks, the transcript animates in: each Deepgram interim result replaces the previous interim with a faint-then-solid color transition; finals are persisted in solid type.
- [ ] When a regex trigger matches (e.g., "she weighed 174 today"), the corresponding tile fills with the captured value within 200ms of the partial transcript update. Tile shows a subtle pulse to indicate "I heard that."
- [ ] Caregiver taps Stop. The WebSocket closes. The transcript text is POSTed to `/api/voice-log/[id]/process`. UI state changes to "Listening to what you said…" within 300ms of tap.
- [ ] Within 5s (typical) of Stop, Claude's structured extraction returns. Tiles update to reflect Claude's authoritative values (a regex-filled "174" may become "174.0" with normalized formatting; a tile that regex didn't fill but Claude did populates now). Alert chips render for any tier-1 trues.
- [ ] The review screen shows: caregiver_summary at top, tiles in a grid, alert chips (if any), pattern-note (`ai_reasoning`), follow-up question (if any), full transcript expand.
- [ ] User can re-record (discard and start over) or accept-and-go-home.

### Edge cases

- [ ] **First-time user, no prior log today:** new `daily_logs` row created at Record-tap with `processing_status='pending'`.
- [ ] **Returning user with an existing log today:** UPSERT semantics preserved on `(patient_id, log_date)`; the existing row is reused; new transcript replaces old.
- [ ] **Tap Record then immediately Stop (zero seconds):** WebSocket may not have opened. Show "no audio captured — try again." Don't POST to process.
- [ ] **30-second silence after starting:** transcript is empty string. Show "We didn't catch anything — try again." Don't POST to process.
- [ ] **Long recording (>90 seconds):** auto-stop at 90s, same as today. Send transcript-so-far to process.
- [ ] **Same-local-day second log:** UPSERT clobbers the previous row's transcript and structured fields. (Matches current behavior. We may want to revisit "merge logs" later — out of scope.)
- [ ] **Browser tab backgrounded mid-recording:** Mic streams in some browsers pause when the tab is hidden. Document the known limitation; UI shows "tap stop to finish" — we do not introduce a visibilitychange handler in this PR.

### Error states

- [ ] **Mic permission denied at start:** show "Microphone permission was denied. Enable it in your browser settings, then try again." (Existing copy.) No row created.
- [ ] **Mic permission revoked mid-session:** browser fires `MediaStreamTrack.onended`. Stop the recording, close the WebSocket, surface "Mic was turned off — your recording is saved up to that point" and process whatever transcript was received.
- [ ] **Network drop mid-stream:** WebSocket fires `onclose` with a non-1000 code. Attempt one reconnect with a fresh token. If reconnect fails, surface "Connection lost — your recording is saved up to that point" and process the partial transcript.
- [ ] **Deepgram returns an error event:** mark the recording failed, surface "Transcription failed — please try again." No partial save.
- [ ] **Token mint fails (Deepgram down or our env unset):** surface "Voice log temporarily unavailable. Please try again in a minute." Log to server. No row created.
- [ ] **Claude extraction fails:** transcript is preserved on the row (matches current behavior); `structured_observations.ai_extraction_error` is populated; processing_status set to `complete`. UI shows transcript + "Pattern detection hit an error — your words are saved" copy.
- [ ] **Transcript too short (<10 chars) or too long (>4000 chars):** Zod rejects at `/process`. Client shows the validation error.

### Performance

- [ ] Token-mint endpoint p50 latency <300ms.
- [ ] First Deepgram partial transcript visible to user within 800ms of speech start (Deepgram's typical).
- [ ] Stop → tile values updated by Claude within 5s (p50). Equal to or better than current Whisper+Claude pipeline.
- [ ] No client-side fetching for streak / dashboard data (unchanged).

### Persistence

- [ ] One `daily_logs` row per `(patient_id, log_date)`.
- [ ] **Persisted at row creation:** `patient_id`, `log_date`, `processing_status='pending'`.
- [ ] **Persisted at end of recording (process route):** `transcribed_text`, all 22 structured columns Claude returned, `structured_observations` jsonb (caregiver_summary, ai_reasoning, follow_up_question), `ai_processed_at`, `processing_status='complete'`.
- [ ] **Not persisted:** raw audio (no Supabase Storage write), interim transcripts (only the final concatenated transcript is saved).
- [ ] **Removed columns:** `audio_storage_path`, `whisper_confidence` (migration). Existing rows have these dropped — this is destructive but acceptable per CLAUDE.md "no backwards-compatibility / pre-launch."

### Permissions / RLS

- [ ] `daily_logs` RLS policy unchanged: caregiver may CRUD only logs whose `patient_id` belongs to their `caregiver_id`. Re-verified after migration runs.
- [ ] `/api/voice-log/deepgram-token` requires authenticated session (401 otherwise). Returns no info for unauthenticated callers.
- [ ] `/api/voice-log/[id]/process` requires authenticated session and patient ownership (existing behavior preserved).
- [ ] **Future:** rate-limit the token-mint endpoint per user. Out of scope for this PR; flagged as a launch task in `docs/status.md`.

### Side effects

- [ ] `audio_logs` storage bucket is dropped. Any existing audio in dev/staging is wiped (acceptable pre-launch).
- [ ] No analytics events fired (we don't have analytics yet).
- [ ] No notifications. No push, email, or otherwise.

### Clinical content review (CLAUDE.md "cite the research file" rule)

- [ ] Every alert-threshold copy in tile labels and alert chips is verified line-by-line against `research/chf-source-of-truth.md` and `research/01-clinical-thresholds.md` before code is written. If the research file's wording differs from `extract.ts`'s field descriptions, the research file wins (and `extract.ts` gets corrected — separate concern, flag don't fix).
- [ ] Alert chip copy includes a research-file citation (or short label like "AHA tier-1") in a tooltip or expand. The reasoning behind the alert must be visible in the UI per CLAUDE.md rule #4.
- [ ] No alert chip recommends a dose change, a specific medication action, or 911 (CLAUDE.md rule #6). Strongest copy: "Call the cardiologist today" or "Call the cardiologist's office now."
- [ ] The `extractWithClaude()` system prompt is unchanged. Prompt caching against `research/chf-source-of-truth.md` continues to work (verified by checking the system block still uses `cache_control: { type: 'ephemeral' }` after the call shape changes).

### Caregiver language — no medical jargon visible to the user

- [ ] **Tile labels** are plain English: "Breathing" not "Dyspnea," "Sleep" not "Orthopnea," "Swelling" not "Edema," "Wakes gasping" not "PND."
- [ ] **Alert-chip text** is plain English: "Wakes gasping for breath" not "PND episode," "Fluid building up in the lungs" not "Pulmonary edema," "Blue lips or fingertips" not "Cyanosis."
- [ ] **The `keyword-map.ts` synonym dictionary** is exhaustively caregiver-phrasing. Each tile has ≥4 colloquial entries plus the medical term as a fallback (so caregivers who DO say "edema" still get matched).
- [ ] **Medical jargon stays in:** the schema column names (`dyspnea_level`), Claude's system prompt + tool description (model-facing), the research file (research-facing), the Deepgram `keyterms` array (recognition-facing — accuracy benefits from medical vocab AND colloquial). Caregivers never see these.
- [ ] **Empty-state copy on tiles** uses caregiver phrasing: "Tap if measured today" / "Mention to log" / "Nothing to report? That's a steady day."

### Recording duration + voice-activated stop

- [ ] `MAX_SECONDS = 120` (2 minutes). Auto-stop fires at 120s with a 10-second warning at 110s ("10 seconds left — wrap up or tap stop").
- [ ] After 10 seconds elapsed, the client listens for end-of-recording phrases. Phrases live in `keyword-map.ts → END_RECORDING_PHRASES`.
- [ ] Voice-stop fires only when: (a) the phrase appears at the END of an `is_final` transcript segment (not mid-sentence), AND (b) Deepgram emits no further speech for 1 second.
- [ ] Manual Stop button remains the primary always-visible action and works at any time.
- [ ] Voice-stop is unit-tested for the false-positive case: "I want to end note about the cough" → does NOT trigger stop because "end note" is not at end of segment + sentence continues.

### Manual verification

Run from a clean state with the dev server up and a signed-in test caregiver, in this order:

1. **Web (Chrome/Safari desktop):**
   1. `/log` → Tap Record. Mic prompt appears. Grant. Timer starts within 1.2s.
   2. Say: "Mom weighed 174 today, ankles look puffy, she's been tired, slept on two pillows, cough at night."
   3. Watch the transcript animate in. Watch the Weight tile fill to "174" within 200ms of saying it. Watch Sleep, Energy, Swelling, Cough light up in turn.
   4. Tap Stop. UI changes to "Listening…" within 300ms.
   5. Within 5s, tiles render Claude's authoritative values (174.0 lb / pillow_count=2 / dyspnea_level filled / etc.). Caregiver-summary, pattern note, transcript expand all render.
   6. Re-record from the review screen. The tiles reset; the existing daily_log row is reused.
2. **iOS Capacitor build (simulator + physical device):**
   1. Same flow as (1).
   2. **Pass criterion:** end-to-end completes; final daily_log row populated with non-empty transcript and at least 1 structured field.
   3. **Fail criterion:** WebSocket fails to open, mic blocks, or transcript is empty. **If iOS fails, this PR is held until fixed — no fallback path is added.**
3. **Error path verification:**
   1. Deny mic permission → see denied copy, no row created.
   2. Disconnect Wi-Fi mid-recording → see "Connection lost" copy + partial transcript persisted.
   3. Tap Stop after <1s with no speech → see "We didn't catch anything" copy, no row created.

Total time: ~5 minutes once everything's in place.

---

## Open questions / decisions made

1. **Tile set ≠ Lovable's 8.** Decided: **10 primary** (Weight, BP, HR, O2, Breathing, Swelling, Energy, Sleep, Cough, Appetite) + 4 alert chips (Chest pain, Fainting, Cyanosis, Severe confusion), all mapped 1:1 to existing schema. No `meds` or `diet` tiles — those are their own future features with their own schema needs.
2. **BP / HR / SpO2 promoted from conditional to primary.** Reason: AHA recommends home BP/HR monitoring for CHF; tiles double as a daily-care guide that cues caregivers to measure.
3. **Audio retention.** Decided: drop entirely. Re-extraction feature later will re-introduce.
4. **Live extraction strategy.** Decided: **Deepgram `keyterms` keyword spotting + small numeric regex** during dictation; authoritative Claude pass at end. Synonym dictionary in `keyword-map.ts` is the single source of caregiver phrasings — extensible without code changes.
5. **Recording duration.** `MAX_SECONDS = 120` (2 minutes). Voice-activated stop via "end note" / "save log" / "I'm done" with a 1-second silence gate to prevent false triggers.
6. **No medical jargon in caregiver-facing copy.** Schema names and Claude prompt are model-facing; UI is plain-English caregiver phrasing.
7. **iOS Capacitor fallback.** Decided: no fallback. If WebSocket audio breaks on iOS, fix the Capacitor build before merge.
8. **State machine.** Decided: collapse `pending`/`transcribing`/`analyzing`/`complete`/`failed` to `pending`/`analyzing`/`complete`/`failed`. Drop the `transcribing` enum value.
9. **Deepgram model.** Default to `nova-3` general model. Required for the `keyterms` feature.
10. **Token TTL.** 30s (Deepgram default). Re-mint on reconnect.
11. **Surface architectural pivots before making them.** If Deepgram's temp-token API doesn't work for browser clients on `nova-3`, OR if `keyterms` isn't supported in the streaming endpoint we use, the plan stops and surfaces the alternatives — never silently swap to a different transport or model.

---

## Risk register

| Risk | Mitigation |
|---|---|
| Deepgram doesn't expose a usable browser-side temp-token API for our chosen model | Fallback at implementation time: server proxies the WebSocket. Slightly more latency, same security. Decision deferred to first day of implementation when the API is verified. |
| iOS Capacitor WebView can't handle WebSocket audio streaming | Concrete iOS test before merge (manual verification step 2). If it breaks: fix Capacitor (likely a `MediaRecorder`/`getUserMedia` permission issue) — not maintain two pipelines. |
| Claude extraction silently regresses because the call-shape changed | `extract.ts` is not modified. The change is upstream — the transcript string is the same shape Claude already receives. Smoke-test by feeding a known transcript and diffing the structured output before/after. |
| Regex live-triggers fire on irrelevant phrasing ("she had pillow at the back of the couch") | Triggers are visual feedback only; Claude's authoritative pass overrides. False positives flicker briefly and self-correct. Document this in the live-triggers comment. |
| Trust boundary: client now sends the transcript text. Malicious user could submit any string. | Zod max length 4000, min 10. Claude's hard guardrails (no diagnosis / no dose advice) survive any input. The structured fields populated are bounded by enums and check constraints in the DB. |

---

## Workflow

1. ~~Plan written~~ ✓
2. ~~Plan-review subagent ran~~ ✓
3. ~~Plan revised based on review~~ ✓ (this doc)
4. **User approval ← here**
5. Implement (single feature branch off `main`)
6. Smoke-test web + iOS Capacitor
7. Code-review subagent (fresh context, required for voice-log per `.claude/rules/feature-workflow.md`)
8. Patch reviewer findings
9. PR via `git push` → `gh pr create` → `gh pr checks --watch` → `gh pr merge --squash`
10. Memory update: voice-log redesign → done; mark calendar-view as next feature
