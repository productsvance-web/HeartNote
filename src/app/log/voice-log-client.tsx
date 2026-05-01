'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic,
  Square,
  Check,
  AlertCircle,
  AlertTriangle,
  Scale,
  Heart,
  Activity,
  Wind,
  Droplets,
  Battery,
  Moon,
  Soup,
  Footprints,
  Volume2,
} from 'lucide-react';
import { startVoiceLog } from './actions';
import { openDeepgramClient, type DeepgramClient } from '@/lib/voice-log/deepgram-client';
import { extractNumericTiles, type NumericTiles } from '@/lib/voice-log/numeric-extractors';
import { findMatchedKeyterms, segmentEndsWithStopPhrase } from '@/lib/voice-log/match-keyterms';
import type { TileKey } from '@/lib/voice-log/keyword-map';

type Status =
  | 'idle'
  | 'requesting-mic'
  | 'recording'
  | 'analyzing'
  | 'complete'
  | 'error';

const MAX_SECONDS = 120;
const WRAP_UP_WARNING_AT = 110; // 10-second-left red warning
const VOICE_STOP_ENABLE_AFTER = 10; // seconds before voice-stop arms
const VOICE_STOP_SILENCE_GATE_MS = 1000;

type AISummary = {
  caregiver_summary?: string;
  ai_reasoning?: string;
  follow_up_question?: string | null;
  ai_extraction_error?: string;
};

type ClaudeTiles = {
  // Primary tiles
  weight_lb: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  resting_hr: number | null;
  spo2: number | null;
  dyspnea_level: number | null;
  pillow_count: number | null;
  pnd_episode: boolean | null;
  cough_present: boolean | null;
  cough_nocturnal: boolean | null;
  sputum_color: 'clear' | 'white' | 'pink_frothy' | null;
  swelling_severity: number | null;
  cyanosis: boolean | null;
  chest_pain: boolean | null;
  syncope: boolean | null;
  appetite_change: 'decreased' | 'unchanged' | 'increased' | null;
  early_satiety: boolean | null;
  fatigue_level: number | null;
  cognition_change: 'none' | 'mild_fog' | 'confusion' | 'severe' | null;
  // Background fields surfaced in the "more notes" expand (plan AC)
  feeling_score: number | null;
  extremities_cold_clammy: boolean | null;
  urine_output_change: 'decreased' | 'unchanged' | 'increased' | null;
  chest_pain_character: string | null;
  activity_tolerance_change: string | null;
};

type Props = {
  patientId: string;
  existingLogId: string | null;
  existingStatus: string | null;
  existingTranscript: string | null;
  existingObservations: AISummary | null;
};

const TILE_ORDER: TileKey[] = [
  'weight',
  'blood_pressure',
  'heart_rate',
  'oxygen',
  'breathing',
  'swelling',
  'energy',
  'sleep',
  'cough',
  'appetite',
];

const TILE_META: Record<TileKey, { label: string; Icon: typeof Scale; emptyHint: string }> = {
  weight: { label: 'Weight', Icon: Scale, emptyHint: 'Mention to log' },
  blood_pressure: { label: 'Blood pressure', Icon: Heart, emptyHint: 'Tap if measured' },
  heart_rate: { label: 'Heart rate', Icon: Activity, emptyHint: 'Tap if measured' },
  oxygen: { label: 'Oxygen', Icon: Droplets, emptyHint: 'Tap if measured' },
  breathing: { label: 'Breathing', Icon: Wind, emptyHint: 'Mention to log' },
  swelling: { label: 'Swelling', Icon: Footprints, emptyHint: 'Mention to log' },
  energy: { label: 'Energy', Icon: Battery, emptyHint: 'Mention to log' },
  sleep: { label: 'Sleep', Icon: Moon, emptyHint: 'Mention to log' },
  cough: { label: 'Cough', Icon: Volume2, emptyHint: 'Mention to log' },
  appetite: { label: 'Appetite', Icon: Soup, emptyHint: 'Mention to log' },
};

function formatDyspnea(level: number | null): string | null {
  if (level == null) return null;
  return ['Normal', 'On heavy exertion', 'On normal walking', 'On minimal activity', 'At rest'][level] ?? null;
}
function formatSeverity(level: number | null): string | null {
  if (level == null) return null;
  return ['None', 'Mild', 'Moderate', 'Severe', 'Very severe'][level] ?? null;
}
function formatFatigue(level: number | null): string | null {
  if (level == null) return null;
  return ['No fatigue', 'Mild', 'Moderate', 'Severe', "Can't move"][level] ?? null;
}
function formatAppetite(v: ClaudeTiles['appetite_change']): string | null {
  if (!v) return null;
  return v === 'decreased' ? 'Decreased' : v === 'increased' ? 'Increased' : 'Normal';
}

// "More notes" entries: the 8 background fields the plan promised would
// surface in an expand. Returns only the ones Claude populated; if all
// are null/empty, the section is hidden entirely.
function buildMoreNotes(c: ClaudeTiles | null): { label: string; value: string }[] {
  if (!c) return [];
  const out: { label: string; value: string }[] = [];

  if (c.feeling_score != null) {
    out.push({ label: 'Overall feeling', value: `${c.feeling_score} of 5` });
  }
  if (c.extremities_cold_clammy === true) {
    out.push({ label: 'Hands or feet', value: 'Cold or clammy' });
  }
  if (c.early_satiety === true) {
    out.push({ label: 'At meals', value: 'Filled up after only a few bites' });
  }
  if (c.urine_output_change && c.urine_output_change !== 'unchanged') {
    out.push({
      label: 'Urine output',
      value: c.urine_output_change === 'decreased' ? 'Decreased' : 'Increased',
    });
  }
  if (c.chest_pain_character && c.chest_pain_character.trim()) {
    out.push({ label: 'Chest-pain notes', value: c.chest_pain_character });
  }
  if (c.activity_tolerance_change && c.activity_tolerance_change.trim()) {
    out.push({ label: 'Activity today', value: c.activity_tolerance_change });
  }
  // cognition_change: mild_fog and confusion are surfaced here. Severe is
  // already a tier-1 alert chip elsewhere.
  if (c.cognition_change === 'mild_fog') {
    out.push({ label: 'Mental clarity', value: 'A little foggy' });
  } else if (c.cognition_change === 'confusion') {
    out.push({ label: 'Mental clarity', value: 'Confused at times' });
  }

  return out;
}

// Resolve what each tile shows. Priority: Claude's authoritative values >
// live-extracted numerics > "matched but no value" highlight > empty.
function tileDisplay(
  key: TileKey,
  live: NumericTiles,
  matched: Set<TileKey>,
  claude: ClaudeTiles | null
): { value: string | null; matched: boolean } {
  const isMatched = matched.has(key);
  switch (key) {
    case 'weight': {
      const v = claude?.weight_lb ?? live.weight_lb;
      return { value: v != null ? `${v} lb` : null, matched: isMatched };
    }
    case 'blood_pressure': {
      const sys = claude?.systolic_bp ?? live.systolic_bp;
      const dia = claude?.diastolic_bp ?? live.diastolic_bp;
      return { value: sys != null && dia != null ? `${sys}/${dia}` : null, matched: isMatched };
    }
    case 'heart_rate': {
      const v = claude?.resting_hr ?? live.resting_hr;
      return { value: v != null ? `${v} bpm` : null, matched: isMatched };
    }
    case 'oxygen': {
      const v = claude?.spo2 ?? live.spo2;
      return { value: v != null ? `${v}%` : null, matched: isMatched };
    }
    case 'breathing':
      return { value: formatDyspnea(claude?.dyspnea_level ?? null), matched: isMatched };
    case 'swelling':
      return { value: formatSeverity(claude?.swelling_severity ?? null), matched: isMatched };
    case 'energy':
      return { value: formatFatigue(claude?.fatigue_level ?? null), matched: isMatched };
    case 'sleep': {
      const pillows = claude?.pillow_count ?? live.pillow_count;
      return { value: pillows != null ? `${pillows} pillow${pillows === 1 ? '' : 's'}` : null, matched: isMatched };
    }
    case 'cough': {
      if (claude?.cough_present === true) {
        return {
          value: claude.cough_nocturnal ? 'Yes — nighttime' : 'Yes',
          matched: isMatched,
        };
      }
      return { value: null, matched: isMatched };
    }
    case 'appetite':
      return { value: formatAppetite(claude?.appetite_change ?? null), matched: isMatched };
  }
}

// Alert chips surface tier-1 + tier-2 decompensation signals Claude extracted.
// Per CLAUDE.md rule #4, every chip MUST show its reasoning in the UI;
// per rule #6, no chip recommends 911, doses, or specific medical actions —
// strongest copy is "Call the cardiologist today/now." The tier label lets
// caregivers distinguish 911-territory signals from same-day calls without
// the AI itself saying "go to the ER."
//
// All thresholds and reasoning lines are derived from extract.ts field
// descriptions, which mirror research/chf-source-of-truth.md.
type AlertChip = {
  tier: 1 | 2;
  label: string; // caregiver-language event
  reason: string; // why this fired — visible in UI per rule #4
  action: string; // call-the-cardiologist phrasing
  cite: string; // research-file source label
};

function alertChipsFromClaude(c: ClaudeTiles | null): AlertChip[] {
  if (!c) return [];
  const chips: AlertChip[] = [];

  // ---- Tier 1 — highest priority (911-territory signals) ----
  if (c.chest_pain) {
    chips.push({
      tier: 1,
      label: 'New chest pain',
      reason: 'New chest pain or pressure in a CHF patient can signal an acute cardiac event.',
      action: 'Call the cardiologist now',
      cite: 'AHA · tier-1 decompensation indicator',
    });
  }
  if (c.syncope) {
    chips.push({
      tier: 1,
      label: 'Fainted',
      reason: 'Loss of consciousness in CHF can signal a serious arrhythmia or low cardiac output.',
      action: 'Call the cardiologist now',
      cite: 'AHA · tier-1 decompensation indicator',
    });
  }
  if (c.cyanosis) {
    chips.push({
      tier: 1,
      label: 'Blue lips or fingertips',
      reason: 'Bluish color signals dangerously low blood oxygen.',
      action: 'Call the cardiologist now',
      cite: 'AHA · tier-1 decompensation indicator',
    });
  }
  if (c.sputum_color === 'pink_frothy') {
    chips.push({
      tier: 1,
      label: 'Pink-frothy cough',
      reason: 'Pink or white frothy sputum can signal acute pulmonary edema (fluid in the lungs).',
      action: 'Call the cardiologist now',
      cite: 'AHA · acute pulmonary edema sign',
    });
  }
  if (c.dyspnea_level === 4) {
    chips.push({
      tier: 1,
      label: 'Out of breath at rest',
      reason: "Shortness of breath at rest — can't finish sentences — is a high-acuity decompensation sign.",
      action: 'Call the cardiologist now',
      cite: 'AHA · tier-1 decompensation indicator',
    });
  }
  if (c.cognition_change === 'severe') {
    chips.push({
      tier: 1,
      label: 'Severe confusion',
      reason: 'Severe confusion or not recognizing family can signal poor brain perfusion from low cardiac output.',
      action: 'Call the cardiologist now',
      cite: 'AHA · tier-1 decompensation indicator',
    });
  }

  // ---- Tier 2 — watch / same-day call (early decompensation) ----
  if (c.pnd_episode) {
    chips.push({
      tier: 2,
      label: 'Woke up gasping for breath',
      reason: 'Waking 1–3 hours after lying down gasping (PND) is a high-specificity early decompensation sign.',
      action: 'Call the cardiologist today',
      cite: 'Cleveland Clinic · early decompensation pattern',
    });
  }

  return chips;
}

export function VoiceLogClient({
  patientId,
  existingLogId,
  existingStatus,
  existingTranscript,
  existingObservations,
}: Props) {
  const [status, setStatus] = useState<Status>(() => {
    if (!existingLogId) return 'idle';
    if (existingStatus === 'complete') return 'complete';
    if (existingStatus === 'failed') return 'error';
    // 'pending' = row exists from a previous record-attempt that never
    // submitted a transcript (e.g., user tapped record then walked away,
    // or local validation rejected a too-short transcript). Treat as idle
    // so the user can record cleanly; the next startVoiceLog() upserts
    // onto the same row via the (patient_id, log_date) unique key.
    if (existingStatus === 'pending') return 'idle';
    return 'analyzing';
  });
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [logId, setLogId] = useState<string | null>(existingLogId);
  const [interim, setInterim] = useState(''); // current partial
  const [finals, setFinals] = useState<string[]>(
    existingTranscript ? [existingTranscript] : []
  );
  const [observations, setObservations] = useState<AISummary | null>(existingObservations);
  const [claudeTiles, setClaudeTiles] = useState<ClaudeTiles | null>(null);
  // Optional message shown above "Reading what you said…" telling the
  // caregiver WHY the recording stopped (mic revoked, time up, network drop).
  // Empty for a normal manual/voice stop.
  const [stopReason, setStopReason] = useState<string | null>(null);

  const dgClientRef = useRef<DeepgramClient | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastFinalAtRef = useRef<number>(0);
  const voiceStopTimerRef = useRef<number | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  // Latest finals for synchronous reads (avoids the setFinals-callback hack
  // in stopRecording, which was fragile under React 19 StrictMode).
  const finalsRef = useRef<string[]>(existingTranscript ? [existingTranscript] : []);
  // One-attempt reconnect budget per recording session. Reset on every
  // startRecording.
  const reconnectedOnceRef = useRef<boolean>(false);
  // Wall-clock timestamp of when recording started, used by the voice-stop
  // watcher to gate the "must record N seconds before voice-stop arms"
  // check WITHOUT depending on the per-second `seconds` state. Depending
  // on `seconds` made the watcher re-run every tick and the cleanup
  // cleared the 1s silence-gate timeout before it could ever fire.
  const recordingStartedAtRef = useRef<number>(0);

  // Mirror finals into finalsRef on every change.
  useEffect(() => {
    finalsRef.current = finals;
  }, [finals]);

  // Keep the live transcript panel scrolled to the latest text so long
  // dictations don't push the current word below the fold.
  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [finals, interim]);

  const fullTranscript = useMemo(
    () => [...finals, interim].filter(Boolean).join(' ').trim(),
    [finals, interim]
  );

  const liveNumeric = useMemo(() => extractNumericTiles(fullTranscript), [fullTranscript]);
  const liveMatched = useMemo(() => findMatchedKeyterms(fullTranscript), [fullTranscript]);

  // On mount / when an existing analyzing log is present, fetch its current
  // state so the review-screen tiles render after a refresh. Skip in
  // states where there's nothing to fetch (idle/recording) or where we
  // already have the final result (complete/error).
  useEffect(() => {
    if (!logId || status === 'idle' || status === 'recording' || status === 'error') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/voice-log/${logId}/status`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as ClaudeTiles & {
          processing_status: string;
          transcribed_text: string | null;
          processing_error: string | null;
          structured_observations: AISummary | null;
        };
        if (data.processing_status === 'complete') {
          setStatus('complete');
          if (data.transcribed_text && finals.length === 0) {
            setFinals([data.transcribed_text]);
          }
          setObservations(data.structured_observations);
          setClaudeTiles(data);
        } else if (data.processing_status === 'failed') {
          setStatus('error');
          setError(data.processing_error ?? 'Processing failed.');
        }
      } catch {
        /* silent retry */
      }
    };
    tick();
    if (status === 'analyzing') {
      const id = window.setInterval(tick, 1500);
      return () => {
        cancelled = true;
        window.clearInterval(id);
      };
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logId, status]);

  // Voice-stop watcher: when the latest final ends with a stop phrase AND
  // no newer final arrives within VOICE_STOP_SILENCE_GATE_MS, fire stop.
  //
  // Critical: deps are [finals, status] only. Adding `seconds` here causes
  // the effect to re-run every tick — and the cleanup clears the 1s
  // silence-gate timeout before it ever fires, so voice-stop never
  // triggers. The "must record N seconds before voice-stop arms" check
  // uses recordingStartedAtRef instead.
  //
  // Correctness depends on capturing the trigger-final's timestamp inside
  // the effect closure: at fire-time, if lastFinalAtRef.current has moved
  // past triggerTimestamp, a newer final arrived and we abort. Comparing
  // against `Date.now()` would always pass the 1s-elapsed check and
  // give a false stop the moment any final ends with "I'm done."
  useEffect(() => {
    if (status !== 'recording') return;
    const elapsedMs = Date.now() - recordingStartedAtRef.current;
    if (elapsedMs < VOICE_STOP_ENABLE_AFTER * 1000) return;

    const lastFinal = finals[finals.length - 1];
    if (!lastFinal || !segmentEndsWithStopPhrase(lastFinal)) return;

    const triggerTimestamp = lastFinalAtRef.current;

    if (voiceStopTimerRef.current) window.clearTimeout(voiceStopTimerRef.current);
    voiceStopTimerRef.current = window.setTimeout(() => {
      // Newer final arrived → abort. Equal → no further speech, fire stop.
      if (lastFinalAtRef.current === triggerTimestamp) {
        stopRecording();
      }
    }, VOICE_STOP_SILENCE_GATE_MS);

    return () => {
      if (voiceStopTimerRef.current) {
        window.clearTimeout(voiceStopTimerRef.current);
        voiceStopTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finals, status]);

  // Cleanup on unmount: close the WS, stop the mic stream, clear timers.
  useEffect(() => {
    return () => {
      dgClientRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (voiceStopTimerRef.current) window.clearTimeout(voiceStopTimerRef.current);
    };
  }, []);

  async function startRecording() {
    setError(null);
    setStopReason(null);
    setInterim('');
    setFinals([]);
    setClaudeTiles(null);
    setObservations(null);
    setSeconds(0);
    setStatus('requesting-mic');

    // 1. Mic permission
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setStatus('error');
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Enable it in your browser settings, then try again.'
          : err instanceof Error
            ? err.message
            : 'Could not start recording.';
      setError(msg);
      return;
    }
    streamRef.current = stream;

    // Permission revoked mid-session
    stream.getTracks().forEach((t) => {
      t.onended = () => {
        if (status === 'recording') {
          stopRecording('Mic was turned off — saving what you said.');
        }
      };
    });

    // 2. Create the daily_logs row
    const startResult = await startVoiceLog({ patientId });
    if (!startResult.ok) {
      stream.getTracks().forEach((t) => t.stop());
      setStatus('error');
      setError(startResult.error);
      return;
    }
    setLogId(startResult.logId);

    // 3. Reset the reconnect budget for this session.
    reconnectedOnceRef.current = false;

    // 4. Open the Deepgram session (mints token + opens WebSocket).
    const opened = await openSession(stream);
    if (!opened) return; // openSession surfaced its own error state

    // 5. Start the timer
    recordingStartedAtRef.current = Date.now();
    setStatus('recording');
    timerRef.current = window.setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        if (next >= MAX_SECONDS) {
          // Use a microtask to avoid setState-during-setState
          window.setTimeout(() => stopRecording('Time’s up — saving your log.'), 0);
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
      const tokRes = await fetch('/api/voice-log/deepgram-token', { method: 'POST' });
      if (!tokRes.ok) {
        const j = (await tokRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `token mint failed (${tokRes.status})`);
      }
      const j = (await tokRes.json()) as { token: string };
      token = j.token;
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      setStatus('error');
      setError(
        err instanceof Error
          ? `Voice log temporarily unavailable: ${err.message}`
          : 'Voice log temporarily unavailable.'
      );
      return false;
    }

    const dg = openDeepgramClient(token, stream, {
      onTranscript: ({ isFinal, text }) => {
        if (isFinal) {
          setFinals((prev) => [...prev, text]);
          setInterim('');
          lastFinalAtRef.current = Date.now();
        } else {
          setInterim(text);
        }
      },
      onError: () => {
        // Errors only surface here if the WS open itself failed; ongoing
        // disconnects flow through onClose with a non-1000 code below.
      },
      onClose: (code) => {
        // 1000 = normal close (we initiated). Anything else mid-recording
        // is a drop. Try one reconnect with a fresh token; if that also
        // fails, stop and submit what we have.
        if (code === 1000) return;
        if (status !== 'recording') return;
        if (reconnectedOnceRef.current) {
          stopRecording('Connection lost — saving what you said.');
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
      stopRecording('Connection lost — saving what you said.');
      return;
    }
    const ok = await openSession(stream);
    if (!ok) {
      stopRecording('Connection lost — saving what you said.');
    }
  }

  async function stopRecording(reasonNote?: string) {
    if (status !== 'recording' && status !== 'requesting-mic') return;
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

    setStopReason(reasonNote ?? null);

    // Give the WS a beat to flush its final events; then submit transcript.
    // Reading via finalsRef avoids a setFinals-callback updater (which
    // double-fires under React StrictMode in dev).
    setStatus('analyzing');
    await new Promise((r) => setTimeout(r, 250));
    submitTranscript(finalsRef.current.join(' ').trim());
  }

  async function submitTranscript(transcript: string) {
    if (!logId) {
      setStatus('error');
      setError('Lost the log session — please try again.');
      return;
    }
    if (transcript.length < 10) {
      setStatus('error');
      setError("We didn't catch anything — try again.");
      return;
    }

    try {
      const res = await fetch(`/api/voice-log/${logId}/process`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `processing failed (${res.status})`);
      }
      // Processing succeeded; the existing-log fetch effect picks up the
      // results. Trigger an immediate fetch by toggling status.
      setStatus('analyzing');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Processing failed.');
    }
  }

  function recordAnother() {
    setStatus('idle');
    setError(null);
    setStopReason(null);
    setInterim('');
    setFinals([]);
    setObservations(null);
    setClaudeTiles(null);
    setLogId(null);
    setSeconds(0);
  }

  // ===== Render =====

  const alertChips = alertChipsFromClaude(claudeTiles);
  const moreNotes = buildMoreNotes(claudeTiles);

  return (
    <section className="mt-6 mx-4 flex flex-col gap-4">
      {/* Recording surface */}
      <div className="rounded-3xl bg-card shadow-card p-6 animate-fade-up">
        {(status === 'idle' || status === 'requesting-mic') && (
          <div className="flex flex-col items-center gap-5 py-4">
            <button
              type="button"
              onClick={startRecording}
              disabled={status === 'requesting-mic'}
              className="h-32 w-32 rounded-full text-white shadow-soft active:scale-95 transition disabled:opacity-50"
              style={{
                background:
                  'linear-gradient(135deg, var(--sage), color-mix(in oklab, var(--sage) 70%, white))',
              }}
              aria-label="Start recording"
            >
              <Mic size={48} className="mx-auto" />
            </button>
            <p className="text-sm text-muted-foreground text-center">
              {status === 'requesting-mic'
                ? 'Asking for mic permission…'
                : 'Tap and tell HeartNote how today is going. Up to 2 minutes. Say “end note” when you’re done.'}
            </p>
          </div>
        )}

        {status === 'recording' && (
          <div className="flex flex-col items-center gap-4 py-2">
            <button
              type="button"
              onClick={() => stopRecording()}
              className="h-28 w-28 rounded-full text-white shadow-soft active:scale-95 transition animate-pulse-ring relative flex items-center justify-center"
              style={{ background: 'var(--status-alert)' }}
              aria-label="Stop recording"
            >
              <Square size={36} fill="currentColor" />
            </button>
            <div className="text-center">
              <p
                className="font-display text-3xl tabular-nums"
                style={
                  seconds >= WRAP_UP_WARNING_AT
                    ? { color: 'var(--status-alert)' }
                    : undefined
                }
              >
                {String(Math.floor(seconds / 60)).padStart(2, '0')}:
                {String(seconds % 60).padStart(2, '0')}
              </p>
              <p
                className="text-xs mt-0.5"
                style={{
                  color:
                    seconds >= WRAP_UP_WARNING_AT
                      ? 'var(--status-alert)'
                      : 'var(--muted-foreground)',
                  fontWeight: seconds >= WRAP_UP_WARNING_AT ? 600 : undefined,
                }}
              >
                {seconds >= WRAP_UP_WARNING_AT
                  ? `Wrap up — ${MAX_SECONDS - seconds}s left`
                  : seconds < VOICE_STOP_ENABLE_AFTER
                    ? `Listening…`
                    : `${MAX_SECONDS - seconds}s left · say “end note” to finish`}
              </p>
            </div>
            {/* Live transcript — auto-scrolls to the latest text */}
            <div
              ref={transcriptScrollRef}
              className="w-full mt-2 rounded-2xl bg-muted/60 p-4 min-h-[80px] max-h-[180px] overflow-y-auto"
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                <span>{finals.join(' ')}</span>{' '}
                <span className="text-muted-foreground italic">{interim}</span>
                {!finals.length && !interim && (
                  <span className="text-muted-foreground">Start speaking — your words will appear here.</span>
                )}
              </p>
            </div>
          </div>
        )}

        {status === 'analyzing' && (
          <div className="flex flex-col items-center gap-3 py-6">
            {stopReason && (
              <div
                className="w-full rounded-2xl px-4 py-3 text-sm text-center"
                style={{
                  background: 'var(--status-watch-soft)',
                  color: 'var(--status-watch-foreground)',
                }}
              >
                {stopReason}
              </div>
            )}
            <div
              className="h-16 w-16 rounded-full animate-pulse-ring flex items-center justify-center"
              style={{ background: 'var(--status-good-soft)' }}
            >
              <Mic size={26} style={{ color: 'var(--status-good-foreground)' }} />
            </div>
            <p className="font-display text-xl">Reading what you said…</p>
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              Pulling out weight, symptoms, and anything else worth flagging.
            </p>
          </div>
        )}

        {status === 'complete' && (
          <div className="flex flex-col gap-3 py-1">
            <div className="flex items-center gap-3">
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center"
                style={{
                  background: 'var(--status-good-soft)',
                  color: 'var(--status-good-foreground)',
                }}
              >
                <Check size={18} />
              </div>
              <p className="font-display text-xl">Logged for today</p>
            </div>
            {observations?.caregiver_summary && (
              <div
                className="rounded-2xl p-4 border"
                style={{
                  background: 'var(--status-good-soft)',
                  borderColor: 'color-mix(in oklab, var(--status-good) 30%, transparent)',
                }}
              >
                <p
                  className="text-xs uppercase tracking-wider mb-2"
                  style={{ color: 'var(--status-good-foreground)' }}
                >
                  What HeartNote heard
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--status-good-foreground)' }}>
                  {observations.caregiver_summary}
                </p>
              </div>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div
              className="h-12 w-12 rounded-full flex items-center justify-center"
              style={{ background: 'var(--status-alert-soft)' }}
            >
              <AlertCircle size={22} style={{ color: 'var(--status-alert-foreground)' }} />
            </div>
            <p className="text-center text-sm">{error ?? 'Something went wrong.'}</p>
            <button
              type="button"
              onClick={recordAnother}
              className="rounded-full px-5 py-3 text-sm font-medium border border-border bg-card"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Tile grid — always visible. Tiles are a daily-care guide:
          muted/dim in idle, light up as the user speaks, render Claude's
          authoritative values once analysis completes.

          Three visual states (most → least prominent):
            filled  — has a value; full opacity, sage icon, value in bold
            heard   — keyterm matched but no value yet (Claude still working);
                      strong sage ring, pulse animation, "Heard — extracting…"
            muted   — neither; 60% opacity, hint copy
       */}
      <div className="grid grid-cols-2 gap-3">
        {TILE_ORDER.map((key) => {
          const meta = TILE_META[key];
          const display = tileDisplay(key, liveNumeric, liveMatched, claudeTiles);
          const filled = display.value != null;
          const heard = display.matched && !filled;

          return (
            <div
              key={key}
              className={`rounded-2xl p-4 shadow-card transition-all bg-card ${
                filled || heard ? 'opacity-100' : 'opacity-60'
              }`}
              style={
                heard
                  ? { boxShadow: '0 0 0 2px var(--sage), var(--shadow-card)' }
                  : undefined
              }
            >
              <div className="flex items-center gap-3">
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center"
                  style={{
                    background: filled
                      ? 'var(--status-good-soft)'
                      : heard
                        ? 'var(--status-good-soft)'
                        : 'var(--accent)',
                    color:
                      filled || heard
                        ? 'var(--status-good-foreground)'
                        : 'var(--accent-foreground)',
                  }}
                >
                  <meta.Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    {meta.label}
                  </p>
                  <p
                    className="text-sm font-semibold truncate"
                    style={{
                      color: heard ? 'var(--status-good-foreground)' : 'var(--foreground)',
                    }}
                  >
                    {filled
                      ? display.value
                      : heard
                        ? 'Heard — extracting…'
                        : meta.emptyHint}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Alert chips — only render on complete. Tier-1 = red ("Highest
          priority"); tier-2 = amber ("Watch today"). Each chip shows the
          reason it fired (rule #4) and the research source. */}
      {status === 'complete' && alertChips.length > 0 && (
        <div className="flex flex-col gap-2">
          {alertChips.map((chip, i) => {
            const tier1 = chip.tier === 1;
            return (
              <div
                key={i}
                className="rounded-2xl p-4 flex flex-col gap-2 border"
                style={{
                  background: tier1 ? 'var(--status-alert-soft)' : 'var(--status-watch-soft)',
                  borderColor: tier1 ? 'var(--status-alert)' : 'var(--status-watch)',
                  color: tier1 ? 'var(--status-alert-foreground)' : 'var(--status-watch-foreground)',
                }}
              >
                <div className="flex items-start gap-3">
                  {tier1 ? (
                    <AlertTriangle size={20} className="shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle size={20} className="shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: tier1 ? 'var(--status-alert)' : 'var(--status-watch)',
                          color: 'white',
                        }}
                      >
                        {tier1 ? 'Highest priority' : 'Watch today'}
                      </span>
                      <p className="text-sm font-semibold">{chip.label}</p>
                    </div>
                    <p className="text-xs mt-1.5 leading-relaxed opacity-90">{chip.reason}</p>
                    <p className="text-sm font-medium mt-2">{chip.action}</p>
                    <p className="text-[10px] uppercase tracking-wider opacity-70 mt-1">
                      Source: {chip.cite}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pattern note + transcript expand on complete */}
      {status === 'complete' && (
        <>
          {observations?.ai_reasoning &&
            observations.ai_reasoning !== 'No concerning patterns today.' && (
              <div className="rounded-2xl bg-muted/60 p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                  Pattern note
                </p>
                <p className="text-sm leading-relaxed">{observations.ai_reasoning}</p>
              </div>
            )}

          {observations?.follow_up_question && (
            <div
              className="rounded-2xl p-4 border border-dashed"
              style={{ borderColor: 'var(--border)' }}
            >
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                One quick follow-up
              </p>
              <p className="text-sm">{observations.follow_up_question}</p>
            </div>
          )}

          {moreNotes.length > 0 && (
            <details className="rounded-2xl bg-muted/40 p-4">
              <summary className="text-xs uppercase tracking-wider text-muted-foreground cursor-pointer select-none">
                More notes
              </summary>
              <ul className="mt-3 space-y-1.5">
                {moreNotes.map(({ label, value }) => (
                  <li key={label} className="text-sm leading-relaxed">
                    <span className="text-muted-foreground">{label}:</span>{' '}
                    <span className="text-foreground">{value}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {finals.length > 0 && (
            <details className="rounded-2xl bg-muted/40 p-4">
              <summary className="text-xs uppercase tracking-wider text-muted-foreground cursor-pointer select-none">
                Full transcript
              </summary>
              <p className="text-sm whitespace-pre-wrap mt-3">{finals.join(' ')}</p>
            </details>
          )}

          {observations?.ai_extraction_error && (
            <p className="text-xs text-muted-foreground">
              The transcript saved, but pattern detection hit an error: {observations.ai_extraction_error}
            </p>
          )}

          <button
            type="button"
            onClick={recordAnother}
            className="rounded-full px-5 py-3 text-sm font-medium border border-border bg-card text-foreground active:scale-[0.98] transition self-center"
          >
            Record another
          </button>
        </>
      )}
    </section>
  );
}
