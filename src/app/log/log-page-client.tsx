'use client';

// LogPageClient — the unified /log page. Owns:
//   - Five vital cards' state + 14-symptom modal state.
//   - Voice recording state machine (lifted from voice-log-client.tsx).
//   - Live regex extraction → vital state with state='heard'.
//   - Post-process Claude extraction → vitals + symptoms with state='heard'.
//   - Tap handlers (mark state='tapped'; tier-1 yes-flag taps mark 'alert').
//   - Tap-session ID (UUID generated on mount).
//   - Debounced autosave (1.5s after last tap).
//   - Symptom modal open/close + drag-down-from-grip dismissal (R17).
//
// The page eyebrow + headline + subhead live here (not in page.tsx) because
// they depend on client state (idle vs recording vs analyzing vs complete).
// page.tsx is the data-loading shell only.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import type {
  LogPageContext,
  SymptomState,
  SymptomSourcesState,
} from '@/lib/log/page-context';
import {
  upsertTodayTapSession,
  flushAndStartVoice,
  discardEmptyVoiceLog,
  type SaveLogPatch,
  type SaveLogResult,
} from './save-actions';
import { resolveHelperText } from '@/lib/log/helper-text';
import { SPO2_TIER_1_911 } from '@/lib/clinical/thresholds';
import { extractNumericTiles } from '@/lib/voice-log/numeric-extractors';
import { segmentEndsWithStopPhrase } from '@/lib/voice-log/match-keyterms';
import {
  openDeepgramClient,
  type DeepgramClient,
} from '@/lib/voice-log/deepgram-client';
import { MAX_RECORD_SECONDS } from '@/lib/voice-log/limits';
import { getTodayInTimezone } from '@/lib/dates/today';
import { VitalCard, type VitalCardState } from '@/components/heartnote/log/VitalCard';
import { StepperControl } from '@/components/heartnote/log/StepperControl';
import { DualStepperControl } from '@/components/heartnote/log/DualStepperControl';
import { AlertChipBanner } from '@/components/heartnote/log/AlertChipBanner';
import { LogComposer } from '@/components/heartnote/log/LogComposer';
import {
  SymptomsModal,
  type SymptomTouchState,
} from '@/components/heartnote/log/SymptomsModal';
import { VoiceLogDateSheet } from '@/components/heartnote/log/VoiceLogDateSheet';

const AUTOSAVE_DEBOUNCE_MS = 1500;
const VOICE_STOP_SILENCE_GATE_MS = 1000;

type RecordingStatus =
  | 'idle'
  | 'requesting-mic'
  | 'recording'
  | 'analyzing'
  | 'complete'
  | 'error';

type VitalsTouchState = {
  weight: VitalCardState;
  pillows: VitalCardState;
  bp: VitalCardState;
  hr: VitalCardState;
  spo2: VitalCardState;
};

type VitalsValueState = {
  weightLb: number | null;
  pillowCount: number | null;
  bp: { sys: number | null; dia: number | null } | null;
  hrBpm: number | null;
  spo2Pct: number | null;
};

interface Props {
  context: LogPageContext;
}

export function LogPageClient({ context }: Props) {
  const router = useRouter();

  // ─── Stable tap-session ID ───────────────────────────────────────────────
  // Generated once on mount; survives until route change. Each open of /log
  // gets its own session row in daily_logs (R4).
  const tapSessionIdRef = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `tap-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  // ─── Recording state ─────────────────────────────────────────────────────
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>(() =>
    context.todayLogStatus === 'complete' ? 'complete' : 'idle',
  );
  const [voiceLogId, setVoiceLogId] = useState<string | null>(
    context.todayLogIsVoice ? context.todayLogId : null,
  );
  const [transcript, setTranscript] = useState<string | null>(context.transcript);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const dgClientRef = useRef<DeepgramClient | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const finalsRef = useRef<string[]>([]);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  // Auto-stop on a trailing stop-phrase ("end note", "I'm done", etc.):
  // we re-render whenever a new final arrives so the watcher effect runs.
  const [finalsTick, setFinalsTick] = useState(0);
  const lastFinalAtRef = useRef<number>(0);
  const voiceStopTimerRef = useRef<number | null>(null);
  // One-attempt reconnect budget per recording session. Reset on every
  // startRecording.
  const reconnectedOnceRef = useRef<boolean>(false);

  // ─── Vitals + symptoms state ─────────────────────────────────────────────
  const [vitals, setVitals] = useState<VitalsValueState>(() => ({
    weightLb: context.vitals.weight.todayLb,
    pillowCount: context.vitals.pillows.todayCount,
    bp: context.vitals.bp.today
      ? { sys: context.vitals.bp.today.sys, dia: context.vitals.bp.today.dia }
      : null,
    hrBpm: context.vitals.hr.todayBpm,
    spo2Pct: context.vitals.spo2.todayPct,
  }));

  // Touch state per field — hydrate to 'heard' if voice extracted; else 'muted'.
  const [vitalsTouch, setVitalsTouch] = useState<VitalsTouchState>(() => ({
    weight: context.vitals.weight.todayLb !== null ? 'heard' : 'muted',
    pillows: context.vitals.pillows.todayCount !== null ? 'heard' : 'muted',
    bp: context.vitals.bp.today !== null ? 'heard' : 'muted',
    hr: context.vitals.hr.todayBpm !== null ? 'heard' : 'muted',
    spo2: context.vitals.spo2.todayPct !== null ? 'heard' : 'muted',
  }));

  const [symptoms, setSymptoms] = useState<SymptomState>(context.symptoms);
  const [symptomsTouch, setSymptomsTouch] = useState<SymptomTouchState>(() =>
    deriveSymptomsTouchFromContext(context.symptoms, context.symptomSources),
  );

  // ─── Modal state ─────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  // Date the most-recent recording landed on. null until a recording
  // completes. When non-null and ≠ today, pageCopy shows a "Saved for
  // [date]" headline so backdated saves don't appear silent.
  const [recordedForDate, setRecordedForDate] = useState<string | null>(null);

  // ─── Autosave: debounced + dirty tracking ────────────────────────────────
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const inFlightSaveRef = useRef<Promise<SaveLogResult> | null>(null);
  const [persistentSaveError, setPersistentSaveError] = useState<string | null>(null);
  const failedAttemptsRef = useRef(0);

  const buildPatch = useCallback((): SaveLogPatch => {
    return {
      tapSessionId: tapSessionIdRef.current,
      vitals: {
        weightLb: vitals.weightLb,
        pillowCount: vitals.pillowCount,
        bp: vitals.bp,
        hrBpm: vitals.hrBpm,
        spo2Pct: vitals.spo2Pct,
      },
      symptoms: buildSymptomsPatch(symptoms),
    };
  }, [vitals, symptoms]);

  const flushSave = useCallback(async (): Promise<SaveLogResult | null> => {
    if (!dirtyRef.current && inFlightSaveRef.current === null) return null;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const patch = buildPatch();
    dirtyRef.current = false;
    const promise = upsertTodayTapSession(patch);
    inFlightSaveRef.current = promise;
    try {
      const result = await promise;
      if (!result.ok) {
        // H5: voice-still-processing is a transient block, not a failure
        // mode worth retrying via the 3-strike persistent banner. Surface
        // it as the immediate save-error toast so the caregiver sees why
        // their tap didn't land. The dirty flag stays so the next final
        // change re-tries.
        if (result.error === 'Voice log still processing — try again in a moment.') {
          setPersistentSaveError(result.error);
          dirtyRef.current = true;
          return result;
        }
        failedAttemptsRef.current += 1;
        if (failedAttemptsRef.current >= 3) {
          setPersistentSaveError("Couldn't save your changes — try again.");
        }
        // Re-mark dirty so the next change triggers another save.
        dirtyRef.current = true;
        return result;
      }
      failedAttemptsRef.current = 0;
      setPersistentSaveError(null);
      router.refresh();
      return result;
    } finally {
      inFlightSaveRef.current = null;
    }
  }, [buildPatch, router]);

  const scheduleSave = useCallback(
    (immediate = false) => {
      dirtyRef.current = true;
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (immediate) {
        void flushSave();
        return;
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void flushSave();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [flushSave],
  );

  // beforeunload + route-leave flush.
  useEffect(() => {
    const onBeforeUnload = () => {
      if (!dirtyRef.current) return;
      // Flushing via fetch in beforeunload is unreliable across browsers;
      // sendBeacon would need a dedicated endpoint. For now, fire the
      // server action without awaiting — best-effort.
      void flushSave();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      // Fire one last save on unmount in case the user navigated.
      if (dirtyRef.current) void flushSave();
    };
  }, [flushSave]);

  // ─── Vital handlers ──────────────────────────────────────────────────────
  // Fat-finger guard: when dry weight is set and the typed value is more
  // than 10 lb below it, ask before committing. Dry weight is the patient's
  // baseline-when-not-retaining-fluid (set by the cardiologist); a sudden
  // drop of 10+ lb is far more likely a typo than a real reading. If dry
  // weight isn't set, no check fires.
  // cited: research/chf-source-of-truth.md §3 — "dry weight" caveat.
  const DRY_WEIGHT_TYPO_THRESHOLD_LB = 10;
  const onWeightChange = (v: number | null) => {
    if (
      v !== null &&
      context.patient.dryWeightLb !== null &&
      v < context.patient.dryWeightLb - DRY_WEIGHT_TYPO_THRESHOLD_LB
    ) {
      const confirmed = window.confirm(
        `Did you mean to enter ${v.toFixed(1)} lbs?`,
      );
      if (!confirmed) return;
    }
    setVitals((s) => ({ ...s, weightLb: v }));
    setVitalsTouch((s) => ({
      ...s,
      weight: v === null ? 'muted' : 'tapped',
    }));
    scheduleSave();
  };
  const onPillowsChange = (v: number | null) => {
    setVitals((s) => ({ ...s, pillowCount: v }));
    setVitalsTouch((s) => ({ ...s, pillows: v === null ? 'muted' : 'tapped' }));
    scheduleSave();
  };
  const onBpChange = (sys: number | null, dia: number | null) => {
    setVitals((s) => ({ ...s, bp: sys === null && dia === null ? null : { sys, dia } }));
    setVitalsTouch((s) => ({
      ...s,
      bp: sys === null && dia === null ? 'muted' : 'tapped',
    }));
    scheduleSave();
  };
  const onHrChange = (v: number | null) => {
    setVitals((s) => ({ ...s, hrBpm: v }));
    setVitalsTouch((s) => ({ ...s, hr: v === null ? 'muted' : 'tapped' }));
    scheduleSave();
  };
  const onSpo2Change = (v: number | null) => {
    setVitals((s) => ({ ...s, spo2Pct: v }));
    setVitalsTouch((s) => ({
      ...s,
      // H2: SpO2 < SPO2_TIER_1_911 is tier-1 (T1.7a). Strict < matches the
      // engine (evaluate.ts:258) and the regression test (evaluate.test.ts:208
      // — "spo2 at SPO2_TIER_1_911 does NOT fire T1.7a").
      // cited: research/chf-source-of-truth.md §2 Tier 1 — SpO2 < 88%.
      spo2:
        v === null ? 'muted' : v < SPO2_TIER_1_911 ? 'alert' : 'tapped',
    }));
    // Crossing the threshold moves tier — bypass the debounce.
    scheduleSave(v !== null && v < SPO2_TIER_1_911);
  };

  // ─── Symptoms handler ────────────────────────────────────────────────────
  const onSymptomsChange = (patch: Partial<SymptomState>) => {
    setSymptoms((s) => ({ ...s, ...patch }));
    setSymptomsTouch((s) => {
      const next: SymptomTouchState = { ...s };
      for (const key of Object.keys(patch) as Array<keyof SymptomState>) {
        const value = patch[key];
        if (value === null || value === undefined) {
          next[key] = 'muted';
        } else if (isSymptomTier1(key, value)) {
          // H2: a tap landing on a tier-1 value lights the alert outline +
          // corner pip directly, not the warn-tone "Tapped" pip.
          next[key] = 'alert';
        } else {
          next[key] = 'tapped';
        }
      }
      return next;
    });
    // Bypass the 1.5s debounce on any change that could move the alert
    // tier — tier-1 yes-flag flipped to true OR tier-1 yes-flag cleared
    // to false (un-trigger). Plain enum changes (dyspnea→non-4, sputum→
    // clear/white) also bypass so the banner clears within the tier-1
    // budget (R-AC: tier-1 path).
    scheduleSave(isTierMovingPatch(patch));
  };

  // ─── Modal close: synchronous flush of any pending edits ─────────────────
  const onModalClose = useCallback(() => {
    setModalOpen(false);
    if (dirtyRef.current) {
      void flushSave();
    }
  }, [flushSave]);

  // ─── Voice ───────────────────────────────────────────────────────────────
  // Mic-tap is a two-stage flow:
  //   1. Tap → open the VoiceLogDateSheet asking "When is this voice log
  //      for?". Symptoms modal gets dismissed first (R2).
  //   2. Sheet confirm (Today or Another day → date) → flush any dirty
  //      tap-session (R3), then call startRecording with the chosen date.
  // Stop-tap (recordingStatus === 'recording') is unchanged — single
  // action, no sheet.
  const onMicClick = useCallback(async () => {
    if (recordingStatus === 'recording') {
      await stopRecording();
      return;
    }
    if (modalOpen) {
      setModalOpen(false);
    }
    setDateSheetOpen(true);
  }, [recordingStatus, modalOpen]);

  const onDateSheetConfirm = useCallback(
    async (logDate: string) => {
      setDateSheetOpen(false);
      setRecordedForDate(logDate);
      // Flush dirty tap-session before voice (R3).
      if (dirtyRef.current) {
        const result = await flushSave();
        if (result && !result.ok) {
          setRecordingError(`Couldn't save your taps — recording not started.`);
          return;
        }
      }
      if (inFlightSaveRef.current) {
        const result = await inFlightSaveRef.current;
        if (!result.ok) {
          setRecordingError(`Couldn't save your taps — recording not started.`);
          return;
        }
      }
      await startRecording(logDate);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [flushSave],
  );

  async function startRecording(logDate: string) {
    setRecordingError(null);
    setRecordSeconds(0);
    setRecordingStatus('requesting-mic');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setRecordingStatus('error');
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Enable it in your browser settings, then try again.'
          : err instanceof Error
            ? err.message
            : 'Could not start recording.';
      setRecordingError(msg);
      return;
    }
    streamRef.current = stream;

    // Permission revoked mid-session. Wire onended on each track so the
    // OS-level mic-off triggers stopRecording with a reason. Read recording
    // state via refs (the closure here captures click-time state).
    stream.getTracks().forEach((t) => {
      t.onended = () => {
        if (streamRef.current) {
          void stopRecording('Mic was turned off — saving what you said.');
        }
      };
    });

    // M6: only attempt discard when the row could plausibly still be
    // empty + pending. The action server-side double-guards, but skipping
    // the round-trip on already-complete rows saves a request per record-tap.
    if (voiceLogId && context.todayLogStatus === 'pending') {
      await discardEmptyVoiceLog({ logId: voiceLogId });
    }

    const startResult = await flushAndStartVoice({
      patientId: context.patient.id,
      logDate,
    });
    if (!startResult.ok) {
      stream.getTracks().forEach((t) => t.stop());
      setRecordingStatus('error');
      setRecordingError(startResult.error);
      return;
    }
    setVoiceLogId(startResult.logId);

    finalsRef.current = [];
    reconnectedOnceRef.current = false;

    const opened = await openSession(stream);
    if (!opened) return; // openSession surfaced its own error state

    setRecordingStatus('recording');
    void acquireWakeLock();
    timerRef.current = window.setInterval(() => {
      setRecordSeconds((s) => {
        const next = s + 1;
        if (next >= MAX_RECORD_SECONDS) {
          window.setTimeout(
            () => stopRecording('Time’s up — saving your log.'),
            0,
          );
        }
        return next;
      });
    }, 1000);
  }

  // Mints a Deepgram token, opens the WebSocket, wires the transcript +
  // close + error callbacks. Returns true on success, false on failure
  // (in which case it has already updated status/error). Reused by both
  // initial start and the one-shot reconnect.
  async function openSession(stream: MediaStream): Promise<boolean> {
    let token: string;
    try {
      const tokRes = await fetch('/api/voice-log/deepgram-token', {
        method: 'POST',
      });
      if (!tokRes.ok) {
        const j = (await tokRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `token mint failed (${tokRes.status})`);
      }
      const j = (await tokRes.json()) as { token: string };
      token = j.token;
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      setRecordingStatus('error');
      setRecordingError(
        err instanceof Error
          ? `Voice log temporarily unavailable: ${err.message}`
          : 'Voice log temporarily unavailable.',
      );
      return false;
    }

    const dg = openDeepgramClient(token, stream, {
      onTranscript: ({ isFinal, text }) => {
        if (isFinal) {
          finalsRef.current = [...finalsRef.current, text];
          lastFinalAtRef.current = Date.now();
          // Bump tick to drive the stop-phrase watcher effect.
          setFinalsTick((n) => n + 1);
          // Live regex extraction for vitals — fills with state='heard'
          // ONLY if the field is not already 'tapped' (R1).
          const live = extractNumericTiles(finalsRef.current.join(' '));
          applyLiveExtraction(live);
        }
      },
      onError: () => {
        /* drop */
      },
      onClose: (code) => {
        // 1000 = normal close (we initiated). Anything else mid-recording
        // is a drop. Try one reconnect with a fresh token; if that also
        // fails, stop and submit what we have. Recording state is read
        // via refs because this callback closes over the openSession-time
        // `recordingStatus` (typically 'requesting-mic').
        if (code === 1000) return;
        if (!streamRef.current || !timerRef.current) return;
        if (reconnectedOnceRef.current) {
          void stopRecording('Connection lost — saving what you said.');
          return;
        }
        reconnectedOnceRef.current = true;
        void attemptReconnect();
      },
    });
    dgClientRef.current = dg;
    return true;
  }

  async function attemptReconnect() {
    const stream = streamRef.current;
    if (!stream) {
      void stopRecording('Connection lost — saving what you said.');
      return;
    }
    const ok = await openSession(stream);
    if (!ok) {
      void stopRecording('Connection lost — saving what you said.');
    }
  }

  async function stopRecording(reasonNote?: string) {
    if (!streamRef.current && !timerRef.current) return;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (voiceStopTimerRef.current) {
      window.clearTimeout(voiceStopTimerRef.current);
      voiceStopTimerRef.current = null;
    }
    dgClientRef.current?.close();
    dgClientRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void releaseWakeLock();

    setRecordingStatus('analyzing');
    if (reasonNote) setRecordingError(reasonNote);
    // Give WS a beat to flush.
    await new Promise((r) => setTimeout(r, 250));
    const finalText = finalsRef.current.join(' ').trim();

    if (!voiceLogId) {
      setRecordingStatus('error');
      setRecordingError('Lost the log session — please try again.');
      return;
    }
    if (finalText.length < 10) {
      setRecordingStatus('error');
      setRecordingError("We didn't catch anything — try again.");
      return;
    }

    setTranscript(finalText);

    try {
      const res = await fetch(`/api/voice-log/${voiceLogId}/process`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transcript: finalText }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `processing failed (${res.status})`);
      }
      // Refresh page-context from server so vitals + symptoms hydrate from
      // the freshly-stored Claude extraction. The router.refresh path
      // re-runs the page server component; tap-not-overwritten (R1) is
      // enforced by reading touch-state below.
      router.refresh();
      setRecordingStatus('complete');
    } catch (err) {
      setRecordingStatus('error');
      setRecordingError(err instanceof Error ? err.message : 'Processing failed.');
    }
  }

  function applyLiveExtraction(live: ReturnType<typeof extractNumericTiles>) {
    setVitals((cur) => {
      const next = { ...cur };
      // R1: tap-during-record locks the field. Don't overwrite a 'tapped'
      // field with live extraction.
      if (live.weight_lb != null && vitalsTouch.weight !== 'tapped') {
        next.weightLb = live.weight_lb;
      }
      if (live.pillow_count != null && vitalsTouch.pillows !== 'tapped') {
        next.pillowCount = live.pillow_count;
      }
      if (
        live.systolic_bp != null &&
        live.diastolic_bp != null &&
        vitalsTouch.bp !== 'tapped'
      ) {
        next.bp = { sys: live.systolic_bp, dia: live.diastolic_bp };
      }
      if (live.resting_hr != null && vitalsTouch.hr !== 'tapped') {
        next.hrBpm = live.resting_hr;
      }
      if (live.spo2 != null && vitalsTouch.spo2 !== 'tapped') {
        next.spo2Pct = live.spo2;
      }
      return next;
    });
    setVitalsTouch((s) => ({
      weight: live.weight_lb != null && s.weight !== 'tapped' ? 'heard' : s.weight,
      pillows:
        live.pillow_count != null && s.pillows !== 'tapped' ? 'heard' : s.pillows,
      bp:
        live.systolic_bp != null && live.diastolic_bp != null && s.bp !== 'tapped'
          ? 'heard'
          : s.bp,
      hr: live.resting_hr != null && s.hr !== 'tapped' ? 'heard' : s.hr,
      spo2: live.spo2 != null && s.spo2 !== 'tapped' ? 'heard' : s.spo2,
    }));
  }

  async function acquireWakeLock() {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
    } catch {
      /* ignore */
    }
  }
  async function releaseWakeLock() {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    if (sentinel) {
      try {
        await sentinel.release();
      } catch {
        /* ignore */
      }
    }
  }

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      dgClientRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) window.clearInterval(timerRef.current);
      void releaseWakeLock();
    };
  }, []);

  // Voice-stop watcher: when the latest final ends with a stop phrase AND
  // no newer final arrives within VOICE_STOP_SILENCE_GATE_MS, fire stop.
  // Re-runs on every final via finalsTick; the trigger-final's timestamp
  // is captured in the closure so a newer final aborts the timer.
  useEffect(() => {
    if (recordingStatus !== 'recording') return;

    const lastFinal = finalsRef.current[finalsRef.current.length - 1];
    if (!lastFinal || !segmentEndsWithStopPhrase(lastFinal)) return;

    const triggerTimestamp = lastFinalAtRef.current;

    if (voiceStopTimerRef.current) window.clearTimeout(voiceStopTimerRef.current);
    voiceStopTimerRef.current = window.setTimeout(() => {
      // Newer final arrived → abort. Equal → no further speech, fire stop.
      if (lastFinalAtRef.current === triggerTimestamp) {
        void stopRecording();
      }
    }, VOICE_STOP_SILENCE_GATE_MS);

    return () => {
      if (voiceStopTimerRef.current) {
        window.clearTimeout(voiceStopTimerRef.current);
        voiceStopTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalsTick, recordingStatus]);

  // Visibility change while recording → graceful stop (preserves the
  // existing voice-log behavior).
  useEffect(() => {
    if (recordingStatus !== 'recording') return;
    function onVisibilityChange() {
      if (document.hidden && streamRef.current) {
        void stopRecording('Screen turned off — saving what you said.');
      } else {
        void acquireWakeLock();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingStatus]);

  // ─── Re-hydrate from server after voice processing completes ─────────────
  // useState initializers only run on first mount, so AI-extracted symptoms
  // (and any vitals Claude refined past what the live regex caught during
  // recording) wouldn't make it into the modal/cards on their own — the
  // page would render the freshly-extracted server values but the modal
  // would still show the stale empty state from page-load time.
  //
  // This effect bridges that gap: when context shows a newly-completed
  // voice row (different id than the last one we hydrated from), pull
  // the new server values into state. Tap-during-record stays sticky
  // per R1 — any field the user has manually tapped keeps its value
  // and 'tapped' touch state.
  const lastHydratedVoiceLogIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!context.todayLogId) return;
    if (context.todayLogStatus !== 'complete') return;
    if (!context.todayLogIsVoice) return;
    if (lastHydratedVoiceLogIdRef.current === context.todayLogId) return;
    lastHydratedVoiceLogIdRef.current = context.todayLogId;

    // Symptoms — overwrite each field unless the user tapped it.
    setSymptoms((current) => {
      const next: SymptomState = { ...current };
      for (const key of Object.keys(context.symptoms) as Array<keyof SymptomState>) {
        if (symptomsTouch[key] !== 'tapped') {
          // Field-by-field assignment with structural-union narrowing is
          // noisy in TS; the cast keeps the loop legible. Each symptom
          // pair (state ↔ context) shares the same SymptomState typing.
          (next[key] as SymptomState[typeof key]) = context.symptoms[key];
        }
      }
      return next;
    });
    setSymptomsTouch((current) => {
      const fresh = deriveSymptomsTouchFromContext(
        context.symptoms,
        context.symptomSources,
      );
      const next: SymptomTouchState = { ...fresh };
      for (const key of Object.keys(current) as Array<keyof SymptomTouchState>) {
        if (current[key] === 'tapped') next[key] = 'tapped';
      }
      return next;
    });

    // Vitals — same pattern. Live regex extraction handles the common
    // numbers during recording, but Claude can refine values post-stop
    // or surface ones the regex missed; sync them in.
    setVitals((current) => ({
      weightLb:
        vitalsTouch.weight === 'tapped'
          ? current.weightLb
          : context.vitals.weight.todayLb,
      pillowCount:
        vitalsTouch.pillows === 'tapped'
          ? current.pillowCount
          : context.vitals.pillows.todayCount,
      bp:
        vitalsTouch.bp === 'tapped'
          ? current.bp
          : context.vitals.bp.today
            ? {
                sys: context.vitals.bp.today.sys,
                dia: context.vitals.bp.today.dia,
              }
            : null,
      hrBpm:
        vitalsTouch.hr === 'tapped'
          ? current.hrBpm
          : context.vitals.hr.todayBpm,
      spo2Pct:
        vitalsTouch.spo2 === 'tapped'
          ? current.spo2Pct
          : context.vitals.spo2.todayPct,
    }));
    setVitalsTouch((current) => ({
      weight:
        current.weight === 'tapped'
          ? 'tapped'
          : context.vitals.weight.todayLb !== null
            ? 'heard'
            : 'muted',
      pillows:
        current.pillows === 'tapped'
          ? 'tapped'
          : context.vitals.pillows.todayCount !== null
            ? 'heard'
            : 'muted',
      bp:
        current.bp === 'tapped'
          ? 'tapped'
          : context.vitals.bp.today !== null
            ? 'heard'
            : 'muted',
      hr:
        current.hr === 'tapped'
          ? 'tapped'
          : context.vitals.hr.todayBpm !== null
            ? 'heard'
            : 'muted',
      spo2:
        current.spo2 === 'tapped'
          ? 'tapped'
          : context.vitals.spo2.todayPct !== null
            ? 'heard'
            : 'muted',
    }));
    // symptomsTouch + vitalsTouch are read from the closure of the render
    // that schedules this effect — that's the latest value at effect-run
    // time, since the effect only re-runs when context.todayLogId changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.todayLogId, context.todayLogStatus, context.todayLogIsVoice]);

  // ─── "Symptom heard" detection (drives ear button glow) ──────────────────
  const symptomHeard = useMemo(() => {
    return Object.values(symptomsTouch).some((s) => s === 'heard');
  }, [symptomsTouch]);

  // ─── Live transcript for the composer ────────────────────────────────────
  // While recording, the captured-state `transcript` is null — words live in
  // finalsRef and the page only re-renders when `finalsTick` bumps. Compose
  // a live string from the refs so the composer shows words as they stream
  // in. After stop, fall back to `transcript` (the captured final).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const liveTranscript = useMemo<string | null>(() => {
    if (recordingStatus === 'recording') {
      const live = finalsRef.current.join(' ').trim();
      return live.length > 0 ? live : null;
    }
    return transcript;
  }, [recordingStatus, transcript, finalsTick]);

  // ─── Captured-count for modal footer ─────────────────────────────────────
  // Counts the 14 distinct symptoms in the extract.ts schema enum:
  // dyspnea, cough, chest_pain, swelling, fatigue, pnd, syncope,
  // cognition_change, extremities_cold_clammy, cyanosis, early_satiety,
  // pulse_irregular, dizziness, nausea. Sputum is a follow-up of cough,
  // not a separate symptom. Appetite and urine are day-level fields, not
  // entries in the symptom_events enum, so they don't count toward the
  // "14 symptoms" denominator the modal footer shows.
  const symptomsCapturedCount = useMemo(() => {
    let n = 0;
    if (symptoms.dyspneaSeverity !== null) n++;
    if (symptoms.cough !== null) n++;
    if (symptoms.swellingSeverity !== null) n++;
    if (symptoms.fatigueSeverity !== null) n++;
    if (symptoms.cognitionChange !== null) n++;
    if (symptoms.chestPain !== null) n++;
    if (symptoms.syncope !== null) n++;
    if (symptoms.cyanosis !== null) n++;
    if (symptoms.pnd !== null) n++;
    if (symptoms.earlySatiety !== null) n++;
    if (symptoms.extremitiesColdClammy !== null) n++;
    if (symptoms.pulseIrregular !== null) n++;
    if (symptoms.dizziness !== null) n++;
    if (symptoms.nausea !== null) n++;
    return n;
  }, [symptoms]);

  // ─── Vital helper-text resolution ────────────────────────────────────────
  const weightHelper = resolveHelperText('weight', {
    valueLb: vitals.weightLb,
    baselineLb: context.vitals.weight.baseline14dLb,
    gainLb14d:
      vitals.weightLb !== null && context.vitals.weight.baseline14dLb !== null
        ? vitals.weightLb - context.vitals.weight.baseline14dLb
        : null,
    baselineFreshDays: context.vitals.weight.baseline14dLb !== null ? 14 : 0,
  });

  const pillowsHelper = resolveHelperText('pillows', {
    countToday: vitals.pillowCount,
    baselineCount: context.patient.normalPillowCount,
  });

  const bpHelper = resolveHelperText('bp', {
    systolic: vitals.bp?.sys ?? null,
    diastolic: vitals.bp?.dia ?? null,
    baselineSysBand: context.patient.baselineSbpBand,
  });

  const hrHelper = resolveHelperText('hr', {
    valueBpm: vitals.hrBpm,
    baselineBand: context.patient.baselineHrBand,
  });

  const spo2Helper = resolveHelperText('spo2', {
    valuePct: vitals.spo2Pct,
    hasNewDyspnea: (symptoms.dyspneaSeverity ?? 0) >= 2,
  });

  // ─── Eyebrow + headline ──────────────────────────────────────────────────
  const { headline, subhead } = pageCopy(recordingStatus, context, recordedForDate);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <section
      data-page="log"
      data-status={recordingStatus}
      data-modal-open={modalOpen}
      className="flex flex-col flex-1 min-h-screen pb-40"
    >
      {/* Alert banner — above page header (L9). */}
      {context.assessment && (
        <AlertChipBanner
          tier={context.assessment.tier}
          triggers={context.assessment.triggers}
        />
      )}

      <header className="px-6 pt-6 pb-2">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground active:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
          Home
        </Link>
        <p
          className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          style={{ letterSpacing: '0.08em' }}
        >
          Voice log · day {context.dayN}
        </p>
        <h1
          className="font-display text-[30px] text-foreground mt-1.5 leading-tight"
          style={{ letterSpacing: '-0.02em', fontWeight: 500 }}
        >
          {headline}
        </h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          {subhead}
        </p>
      </header>

      {recordingError && recordingStatus === 'error' && (
        <div
          role="alert"
          className="mx-4 mt-2 rounded-2xl px-4 py-3 text-sm"
          style={{
            background: 'var(--status-alert-soft)',
            color: 'var(--status-alert-foreground)',
          }}
        >
          {recordingError}
        </div>
      )}

      {persistentSaveError && (
        <div
          role="alert"
          className="mx-4 mt-2 rounded-2xl px-4 py-3 text-sm flex items-center justify-between"
          style={{
            background: 'var(--status-watch-soft)',
            color: 'var(--status-watch-foreground)',
          }}
        >
          <span>{persistentSaveError}</span>
          <button
            type="button"
            onClick={() => {
              setPersistentSaveError(null);
              failedAttemptsRef.current = 0;
              void flushSave();
            }}
            className="text-sm font-semibold underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      <div className="px-4 pt-3 flex flex-col gap-3 flex-1">
        <VitalCard
          label="Weight"
          fieldKey="weight"
          contextLine={
            context.vitals.weight.baseline14dLb !== null
              ? `vs. baseline ${context.vitals.weight.baseline14dLb.toFixed(1)} lb`
              : undefined
          }
          state={vitalsTouch.weight}
          tone={weightHelper.tone}
          helper={weightHelper.copy}
        >
          <StepperControl
            value={vitals.weightLb}
            defaultValue={context.vitals.weight.yesterdayLb}
            // Min lowered from 50 → 8 so the chip stops silently
            // clamping a typo'd "44.4" up to 50. The dry-weight
            // confirm in `onWeightChange` is the real fat-finger guard
            // when the patient profile has a dry weight set.
            min={8}
            max={700}
            step={0.2}
            fieldLabel="weight"
            unit="lb"
            formatValue={(v) => v.toFixed(1)}
            placeholder="—"
            onChange={onWeightChange}
            onClear={() => onWeightChange(null)}
          />
        </VitalCard>

        <VitalCard
          label="Pillows"
          fieldKey="pillows"
          contextLine={`baseline ${context.patient.normalPillowCount}`}
          state={vitalsTouch.pillows}
          tone={pillowsHelper.tone}
          helper={pillowsHelper.copy}
        >
          <StepperControl
            value={vitals.pillowCount}
            defaultValue={
              context.vitals.pillows.todayCount ??
              context.patient.normalPillowCount
            }
            min={0}
            max={10}
            step={1}
            integer
            fieldLabel="pillow count"
            unit="tonight"
            placeholder="—"
            onChange={onPillowsChange}
            onClear={() => onPillowsChange(null)}
          />
        </VitalCard>

        <VitalCard
          label="Blood pressure"
          fieldKey="bp"
          contextLine={
            context.patient.baselineSbpBand
              ? `usual ${context.patient.baselineSbpBand[0]}–${context.patient.baselineSbpBand[1]}`
              : undefined
          }
          state={vitalsTouch.bp}
          tone={bpHelper.tone}
          helper={bpHelper.copy}
        >
          <DualStepperControl
            systolic={vitals.bp?.sys ?? null}
            diastolic={vitals.bp?.dia ?? null}
            defaultSystolic={context.vitals.bp.yesterday?.sys ?? null}
            defaultDiastolic={context.vitals.bp.yesterday?.dia ?? null}
            onChange={onBpChange}
            onClear={() => onBpChange(null, null)}
          />
        </VitalCard>

        <VitalCard
          label="Heart rate"
          fieldKey="hr"
          contextLine={
            context.patient.baselineHrBand
              ? `usual ${context.patient.baselineHrBand[0]}–${context.patient.baselineHrBand[1]} bpm`
              : undefined
          }
          state={vitalsTouch.hr}
          tone={hrHelper.tone}
          helper={hrHelper.copy}
        >
          <StepperControl
            value={vitals.hrBpm}
            defaultValue={context.vitals.hr.yesterdayBpm}
            min={30}
            max={450}
            step={1}
            integer
            inputMin={30}
            fieldLabel="heart rate"
            unit="bpm"
            placeholder="— bpm"
            onChange={onHrChange}
            onClear={() => onHrChange(null)}
          />
        </VitalCard>

        <VitalCard
          label="Oxygen"
          fieldKey="spo2"
          state={vitalsTouch.spo2}
          tone={spo2Helper.tone}
          helper={spo2Helper.copy}
        >
          <StepperControl
            value={vitals.spo2Pct}
            defaultValue={context.vitals.spo2.yesterdayPct}
            min={50}
            max={100}
            step={0.1}
            // Decimals allowed (some pulse-oximeters report half-percent).
            // The chip rounds typed input half-up to 1 decimal: 90.55 → 90.6,
            // 90.12 → 90.1, 44.45 → 44.5.
            inputMin={70}
            // 5-char cap accommodates "100.0" / "99.5" — stops the field
            // from accepting "1000" before commit-time clamp.
            maxLength={5}
            // Whole-number readings render without a trailing ".0".
            formatValue={(v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
            fieldLabel="oxygen"
            unit="%"
            placeholder="— %"
            onChange={onSpo2Change}
            onClear={() => onSpo2Change(null)}
          />
        </VitalCard>

        {/* "Edit today's details" link — voice-only rows only (R13). */}
        {context.todayLogIsVoice &&
          context.todayLogStatus === 'complete' &&
          context.todayLogId &&
          !modalOpen && (
            <div className="text-center mt-2">
              <Link
                href={`/log/${context.todayLogId}/edit`}
                className="text-sm font-semibold underline underline-offset-2"
                style={{ color: 'var(--accent-foreground)' }}
              >
                Edit today&rsquo;s voice log
              </Link>
            </div>
          )}
      </div>

      {/* Bottom-pinned composer — ear + transcript + mic in one floating
          dock. Replaces the prior sticky BottomBar + inline TranscriptCard
          pair (PR 2026-05-10). */}
      <LogComposer
        recording={recordingStatus === 'recording'}
        disabled={
          recordingStatus === 'requesting-mic' ||
          recordingStatus === 'analyzing'
        }
        transcript={liveTranscript}
        symptomHeard={symptomHeard}
        modalOpen={modalOpen}
        onMicClick={onMicClick}
        onEarClick={() => setModalOpen((open) => !open)}
      />

      <SymptomsModal
        open={modalOpen}
        onClose={onModalClose}
        symptoms={symptoms}
        touchState={symptomsTouch}
        onChange={onSymptomsChange}
        capturedCount={symptomsCapturedCount}
      />

      <VoiceLogDateSheet
        open={dateSheetOpen}
        todayLocal={getTodayInTimezone(context.timezone)}
        onCancel={() => setDateSheetOpen(false)}
        onConfirm={onDateSheetConfirm}
      />

      {/* Recording wake-screen counter — small inline visual when recording */}
      {recordingStatus === 'recording' && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-2 right-4 px-3 py-1 rounded-full text-xs font-semibold tabular-nums z-30"
          style={{
            background: 'var(--sage-deep)',
            color: 'var(--card)',
            boxShadow: '0 1px 6px color-mix(in oklab, var(--sage-deep) 30%, transparent)',
          }}
        >
          {String(Math.floor(recordSeconds / 60))}:
          {String(recordSeconds % 60).padStart(2, '0')}
        </div>
      )}
    </section>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Per-field touch state derived from the most-recent symptom event today.
// A symptom is 'heard' only if its source row is voice (tap_session_id IS
// NULL); tap-only events are 'tapped' even after reload — H3 fix to keep
// the ear glow off on tap-only sessions. Used by the useState initializer
// AND the post-voice re-hydrate effect, so both paths derive identical
// touch state from the same context shape.
function deriveSymptomsTouchFromContext(
  s: SymptomState,
  src: SymptomSourcesState,
): SymptomTouchState {
  const out: SymptomTouchState = {};
  const stateFor = (
    hasValue: boolean,
    source: 'voice' | 'tap' | null,
  ): VitalCardState | undefined => {
    if (!hasValue) return undefined;
    if (source === 'voice') return 'heard';
    return 'tapped';
  };
  out.dyspneaSeverity = stateFor(s.dyspneaSeverity !== null, src.dyspneaSeverity);
  out.cough = stateFor(s.cough !== null, src.cough);
  out.sputumColor = stateFor(s.sputumColor !== null, src.sputumColor);
  out.swellingSeverity = stateFor(
    s.swellingSeverity !== null,
    src.swellingSeverity,
  );
  out.swellingRegion = stateFor(s.swellingRegion !== null, src.swellingRegion);
  out.swellingResolvesOvernight = stateFor(
    s.swellingResolvesOvernight !== null,
    src.swellingResolvesOvernight,
  );
  out.fatigueSeverity = stateFor(s.fatigueSeverity !== null, src.fatigueSeverity);
  // Cognition severity 4 ('severe') is the tier-1 banner trigger (T1.4)
  // even though the modal renders the SegmentedControl with value=null
  // for severe (modal omits the severity-4 button by design). Hydrate the
  // card to state='alert' so the corner pip + outline match the banner
  // the engine fires above the page.
  // cited: research/chf-source-of-truth.md §2 Tier 1 — severe confusion.
  out.cognitionChange =
    s.cognitionChange === 'severe'
      ? 'alert'
      : stateFor(s.cognitionChange !== null, src.cognitionChange);
  // appetite/urineOutput are day-level fields; treat as tapped when set.
  if (s.appetiteChange !== null) out.appetiteChange = 'tapped';
  if (s.urineOutputChange !== null) out.urineOutputChange = 'tapped';
  out.chestPain = stateFor(s.chestPain !== null, src.chestPain);
  out.chestPainCharacter = stateFor(
    s.chestPainCharacter !== null,
    src.chestPainCharacter,
  );
  out.syncope = stateFor(s.syncope !== null, src.syncope);
  out.cyanosis = stateFor(s.cyanosis !== null, src.cyanosis);
  out.pnd = stateFor(s.pnd !== null, src.pnd);
  out.earlySatiety = stateFor(s.earlySatiety !== null, src.earlySatiety);
  out.extremitiesColdClammy = stateFor(
    s.extremitiesColdClammy !== null,
    src.extremitiesColdClammy,
  );
  out.pulseIrregular = stateFor(s.pulseIrregular !== null, src.pulseIrregular);
  out.dizziness = stateFor(s.dizziness !== null, src.dizziness);
  out.nausea = stateFor(s.nausea !== null, src.nausea);
  return out;
}

// Mirrors the standalone tier-1 conditions in src/lib/alerts/evaluate.ts
// (T1.1, T1.2, T1.3, T1.4, T1.5, T1.6). Compound tier-1 rules (T1.7 SpO2,
// T1.8 pulse_irregular + HR>100 + chest_pain/dizziness) are NOT modeled
// here because the modal can't see the SpO2/HR/multi-symptom context at
// tap time — the engine still lights the banner above the page for those,
// but the in-card 'alert' register stays off for the standalone case.
function isSymptomTier1(
  key: keyof SymptomState,
  value: SymptomState[keyof SymptomState] | undefined,
): boolean {
  if (value === null || value === undefined) return false;
  switch (key) {
    case 'dyspneaSeverity':
      // cited: research/chf-source-of-truth.md §2 Tier 1 — severe dyspnea at rest.
      return value === 4;
    case 'chestPain':
      // cited: research/chf-source-of-truth.md §2 Tier 1 — new chest pain.
      return value === true;
    case 'syncope':
      // cited: research/chf-source-of-truth.md §2 Tier 1 — syncope.
      return value === true;
    case 'cyanosis':
      // cited: research/chf-source-of-truth.md §2 Tier 1 — cyanotic lips/fingers.
      return value === true;
    case 'sputumColor':
      // cited: research/chf-source-of-truth.md §2 Tier 1 — pink OR white frothy sputum.
      return value === 'pink_frothy' || value === 'white_frothy';
    case 'cognitionChange':
      // cited: research/chf-source-of-truth.md §2 Tier 1 — severe confusion.
      return value === 'severe';
    default:
      // pnd → tier-2 (T2.5). pulseIrregular alone → no banner; the T1.8
      // compound (irregular + HR>100 + chest_pain/dizziness) fires tier-1
      // via the engine, not via the standalone tap state.
      return false;
  }
}

// True when the patch could move the alert tier (banner) — broader than
// `isSymptomTier1` because it includes tier-2 movers (PND) and compound
// tier-1 contributors (pulseIrregular). The card-state 'alert' visual is
// strictly tier-1; the autosave debounce skip is for any tier-changing
// edit, including tier-2 banners. Keep these in sync with the rules in
// src/lib/alerts/evaluate.ts.
function isTierMovingPatch(patch: Partial<SymptomState>): boolean {
  if (patch.chestPain !== undefined) return true;
  if (patch.syncope !== undefined) return true;
  if (patch.cyanosis !== undefined) return true;
  if (patch.pulseIrregular !== undefined) return true;
  if (patch.pnd !== undefined) return true;
  if (patch.dyspneaSeverity !== undefined) return true;
  if (patch.sputumColor !== undefined) return true;
  if (patch.cognitionChange !== undefined) return true;
  return false;
}

function buildSymptomsPatch(s: SymptomState): SaveLogPatch['symptoms'] {
  // The save action expects the per-field shape; this maps the in-component
  // SymptomState to the patch shape. Untouched fields become null/undefined.
  return {
    dyspnea:
      s.dyspneaSeverity === null
        ? null
        : (s.dyspneaSeverity as 0 | 1 | 2 | 3 | 4),
    cough: s.cough,
    sputum: s.sputumColor,
    swelling:
      s.swellingSeverity === null
        ? null
        : {
            severity: s.swellingSeverity as 0 | 1 | 2 | 3 | 4,
            region: s.swellingRegion,
            resolvesOvernight: s.swellingResolvesOvernight ?? false,
          },
    fatigue:
      s.fatigueSeverity === null ? null : (s.fatigueSeverity as 0 | 1 | 2 | 3 | 4),
    cognition:
      s.cognitionChange === null || s.cognitionChange === 'severe'
        ? null
        : s.cognitionChange,
    appetite: s.appetiteChange,
    urineOutput: s.urineOutputChange,
    chestPain:
      s.chestPain === null
        ? null
        : { present: s.chestPain, character: s.chestPainCharacter },
    syncope: s.syncope,
    cyanosis: s.cyanosis,
    pnd: s.pnd,
    earlySatiety: s.earlySatiety,
    extremitiesColdClammy: s.extremitiesColdClammy,
    pulseIrregular: s.pulseIrregular,
    dizziness:
      s.dizziness === null
        ? null
        : {
            present: s.dizziness,
            postural: s.dizzinessPostural,
          },
    nausea: s.nausea,
  };
}

function pageCopy(
  status: RecordingStatus,
  ctx: LogPageContext,
  recordedForDate: string | null,
): { headline: string; subhead: string } {
  if (status === 'recording') {
    return {
      headline: 'Listening — say what you noticed.',
      subhead: 'Tap the mic again to stop.',
    };
  }
  if (status === 'analyzing') {
    return {
      headline: "Reading what you said…",
      subhead: 'A few seconds — keep this open.',
    };
  }
  if (status === 'complete') {
    // Backdated: the transcript and extracted vitals/symptoms land on the
    // chosen day's daily_logs row, not today's. router.refresh re-loads
    // /log for today so none of it is visible on this page — say so
    // explicitly instead of pretending today's check-in is in.
    const today = getTodayInTimezone(ctx.timezone);
    if (recordedForDate && recordedForDate !== today) {
      return {
        headline: `Saved for ${formatHumanDate(recordedForDate)}.`,
        subhead:
          "That day's trends will reflect this. Continue logging today below.",
      };
    }
    if (ctx.transcript) {
      return {
        headline: "Today's check-in is in.",
        subhead: 'Tap a card to adjust, or open the listener for symptoms.',
      };
    }
  }
  // Idle — nothing logged today (or just a tap-session in progress).
  // Mockup-verbatim copy for the cold-start state.
  return {
    headline: 'Nothing logged yet today.',
    subhead:
      'Speak once and the vitals fill themselves — or tap any card. Symptoms live behind the listener button at the bottom-right.',
  };
}

// YYYY-MM-DD → "Mon, May 11" using UTC interpretation. Mirrors the
// formatter inside VoiceLogDateSheet — kept inline (not extracted) since
// these two paths are independent: the sheet picker formats display
// labels in the bottom sheet; the headline formats post-save copy. Two
// usages, both in the /log feature, both small.
function formatHumanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(dt);
}
