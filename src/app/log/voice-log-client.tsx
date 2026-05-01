'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic,
  Square,
  Check,
  AlertCircle,
  Scale,
  Heart,
  Activity,
  Wind,
  Droplets,
  Battery,
  Moon,
  Soup,
  Footprints,
  Wind as Lung,
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
const VOICE_STOP_ENABLE_AFTER = 10; // seconds before voice-stop arms
const VOICE_STOP_SILENCE_GATE_MS = 1000;

type AISummary = {
  caregiver_summary?: string;
  ai_reasoning?: string;
  follow_up_question?: string | null;
  ai_extraction_error?: string;
};

type ClaudeTiles = {
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
  cough: { label: 'Cough', Icon: Lung, emptyHint: 'Mention to log' },
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

type AlertChip = { label: string; sub: string };

function alertChipsFromClaude(c: ClaudeTiles | null): AlertChip[] {
  if (!c) return [];
  const chips: AlertChip[] = [];
  if (c.chest_pain) chips.push({ label: 'New chest pain', sub: 'Call the cardiologist today' });
  if (c.syncope) chips.push({ label: 'Fainted', sub: 'Call the cardiologist today' });
  if (c.cyanosis) chips.push({ label: 'Blue lips or fingertips', sub: 'Call the cardiologist today' });
  if (c.pnd_episode) chips.push({ label: 'Woke up gasping', sub: 'Call the cardiologist today' });
  if (c.sputum_color === 'pink_frothy')
    chips.push({ label: 'Pink-frothy cough', sub: 'Call the cardiologist now' });
  if (c.dyspnea_level === 4)
    chips.push({ label: 'Out of breath at rest', sub: 'Call the cardiologist today' });
  if (c.cognition_change === 'severe')
    chips.push({ label: 'Severe confusion', sub: 'Call the cardiologist today' });
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

  const dgClientRef = useRef<DeepgramClient | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastFinalAtRef = useRef<number>(0);
  const voiceStopTimerRef = useRef<number | null>(null);

  const fullTranscript = useMemo(
    () => [...finals, interim].filter(Boolean).join(' ').trim(),
    [finals, interim]
  );

  const liveNumeric = useMemo(() => extractNumericTiles(fullTranscript), [fullTranscript]);
  const liveMatched = useMemo(() => findMatchedKeyterms(fullTranscript), [fullTranscript]);

  // On mount / when an existing analyzing log is present, fetch its current
  // state so the review-screen tiles render after a refresh.
  useEffect(() => {
    if (!logId || status === 'idle' || status === 'recording') return;
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
  // VOICE_STOP_SILENCE_GATE_MS pass with no further finals, fire stop.
  useEffect(() => {
    if (status !== 'recording' || seconds < VOICE_STOP_ENABLE_AFTER) return;
    const lastFinal = finals[finals.length - 1];
    if (!lastFinal || !segmentEndsWithStopPhrase(lastFinal)) return;
    if (voiceStopTimerRef.current) window.clearTimeout(voiceStopTimerRef.current);
    voiceStopTimerRef.current = window.setTimeout(() => {
      // Re-check the silence gate: if a new final arrived in the interim,
      // the lastFinalAt timestamp will have moved past the deadline.
      const elapsedSinceLastFinal = Date.now() - lastFinalAtRef.current;
      if (elapsedSinceLastFinal >= VOICE_STOP_SILENCE_GATE_MS - 50) {
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
  }, [finals, status, seconds]);

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

    // 3. Mint a Deepgram token
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
      return;
    }

    // 4. Open Deepgram WebSocket
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
        // Any error during recording → stop and surface partial transcript.
        if (status === 'recording' || status === 'requesting-mic') {
          stopRecording('Connection lost — saving what you said.');
        }
      },
      onClose: () => {
        // No-op; close handler runs locally in stopRecording.
      },
    });
    dgClientRef.current = dg;

    // 5. Start the timer
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

    // Give the WS a beat to flush its final events; then submit transcript.
    setStatus('analyzing');
    await new Promise((r) => setTimeout(r, 250));

    // Read the latest finals (state may not be flushed yet — use ref-style)
    void reasonNote; // reserved for future "why we stopped" UI affordance
    setFinals((current) => {
      const transcript = current.join(' ').trim();
      submitTranscript(transcript);
      return current;
    });
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
    setInterim('');
    setFinals([]);
    setObservations(null);
    setClaudeTiles(null);
    setLogId(null);
    setSeconds(0);
  }

  // ===== Render =====

  const alertChips = alertChipsFromClaude(claudeTiles);

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
              <p className="font-display text-3xl tabular-nums">
                {String(Math.floor(seconds / 60)).padStart(2, '0')}:
                {String(seconds % 60).padStart(2, '0')}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {seconds < VOICE_STOP_ENABLE_AFTER
                  ? `Listening…`
                  : `${MAX_SECONDS - seconds}s left · say “end note” to finish`}
              </p>
            </div>
            {/* Live transcript */}
            <div className="w-full mt-2 rounded-2xl bg-muted/60 p-4 min-h-[80px] max-h-[180px] overflow-y-auto">
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

      {/* Tile grid — visible during recording (live) and complete (Claude) */}
      {(status === 'recording' || status === 'analyzing' || status === 'complete') && (
        <div className="grid grid-cols-2 gap-3">
          {TILE_ORDER.map((key) => {
            const meta = TILE_META[key];
            const display = tileDisplay(key, liveNumeric, liveMatched, claudeTiles);
            const filled = display.value != null;
            const matched = display.matched;
            return (
              <div
                key={key}
                className={`rounded-2xl p-4 shadow-card transition ${
                  filled
                    ? 'bg-card'
                    : matched
                      ? 'bg-card ring-2 ring-offset-0'
                      : 'bg-card/70'
                }`}
                style={{
                  borderColor: 'var(--border)',
                  ...(matched && !filled
                    ? { boxShadow: '0 0 0 2px var(--accent)' }
                    : {}),
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center"
                    style={{
                      background: filled ? 'var(--status-good-soft)' : 'var(--accent)',
                      color: filled ? 'var(--status-good-foreground)' : 'var(--accent-foreground)',
                    }}
                  >
                    <meta.Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      {meta.label}
                    </p>
                    <p className="text-sm font-semibold text-foreground truncate">
                      {display.value ?? meta.emptyHint}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Alert chips — only render on complete */}
      {status === 'complete' && alertChips.length > 0 && (
        <div className="flex flex-col gap-2">
          {alertChips.map((chip, i) => (
            <div
              key={i}
              className="rounded-2xl p-4 flex items-center gap-3"
              style={{
                background: 'var(--status-alert-soft)',
                borderColor: 'var(--status-alert)',
                color: 'var(--status-alert-foreground)',
              }}
            >
              <AlertCircle size={20} />
              <div className="flex-1">
                <p className="text-sm font-semibold">{chip.label}</p>
                <p className="text-xs opacity-80">{chip.sub}</p>
              </div>
            </div>
          ))}
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
