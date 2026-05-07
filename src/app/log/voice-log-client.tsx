'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic,
  Square,
  Check,
  AlertCircle,
  AlertTriangle,
  Sparkles,
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
import { startVoiceLog, discardEmptyVoiceLog } from './actions';
import { openDeepgramClient, type DeepgramClient } from '@/lib/voice-log/deepgram-client';
import { extractNumericTiles, type NumericTiles } from '@/lib/voice-log/numeric-extractors';
import { findMatchedKeyterms, segmentEndsWithStopPhrase } from '@/lib/voice-log/match-keyterms';
import type { TileKey } from '@/lib/voice-log/keyword-map';
import type { UnmatchedChip } from '@/lib/voice-log/chip';
import Link from 'next/link';

type Status =
  | 'idle'
  | 'requesting-mic'
  | 'recording'
  | 'analyzing'
  | 'complete'
  | 'error';

const MAX_SECONDS = 120;
const WRAP_UP_WARNING_AT = 110; // 10-second-left red warning
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
  // Background fields surfaced in the "more notes" expand
  extremities_cold_clammy: boolean | null;
  urine_output_change: 'decreased' | 'unchanged' | 'increased' | null;
  chest_pain_character: string | null;
  activity_tolerance_change: string | null;
};

type Props = {
  patientName: string;
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

// `important` flags the daily-track core: the 5 signals that matter most for
// CHF baseline + decompensation detection per research/chf-source-of-truth.md.
// Used to surface a "missing today" nudge banner if any of these go unfilled.
// BP/HR/O2 are conditional vitals (caregiver may not have a cuff/oximeter)
// and Cough/Appetite are signal-bearing but lower urgency, so they don't
// trigger the nudge.
const TILE_META: Record<
  TileKey,
  { label: string; Icon: typeof Scale; emptyHint: string; important: boolean }
> = {
  weight: { label: 'Weight', Icon: Scale, emptyHint: 'Mention to log', important: true },
  blood_pressure: { label: 'Blood pressure', Icon: Heart, emptyHint: 'Tap if measured', important: false },
  heart_rate: { label: 'Heart rate', Icon: Activity, emptyHint: 'Tap if measured', important: false },
  oxygen: { label: 'Oxygen', Icon: Droplets, emptyHint: 'Tap if measured', important: false },
  breathing: { label: 'Breathing', Icon: Wind, emptyHint: 'Mention to log', important: true },
  swelling: { label: 'Swelling', Icon: Footprints, emptyHint: 'Mention to log', important: true },
  energy: { label: 'Energy', Icon: Battery, emptyHint: 'Mention to log', important: true },
  sleep: { label: 'Sleep', Icon: Moon, emptyHint: 'Mention to log', important: true },
  cough: { label: 'Cough', Icon: Volume2, emptyHint: 'Mention to log', important: false },
  appetite: { label: 'Appetite', Icon: Soup, emptyHint: 'Mention to log', important: false },
};

function formatDyspnea(level: number | null): string | null {
  if (level == null) return null;
  // Caregiver-facing labels. The clinical anchors ("on heavy exertion,"
  // "on minimal activity") guide Claude's grading inside the prompt but
  // shouldn't echo into the UI — they imply a precision the caregiver
  // didn't actually express.
  return ['Normal', 'Mild', 'Moderate', 'Severe', 'Very severe'][level] ?? null;
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

// Tile data sources, ordered by visual treatment:
// - 'live'         this dictation's regex extraction → bright/active.
// - 'claude_now'   post-save synthesis (status === 'complete') → bright/active.
// - 'claude_prior' synthesis from earlier dictations today → muted.
// - 'matched'      keyword heard in this dictation, no value yet → "heard…".
// - 'empty'        nothing.
type TileSource = 'live' | 'claude_now' | 'claude_prior' | 'matched' | 'empty';

// Resolve what each tile shows. Priority depends on phase:
// - pre_complete (recording or analyzing): live > matched > claude_prior.
//   Live wins over claude_prior so a fresh dictation surfaces immediately
//   as bright/active even when prior synthesis already has a value.
// - complete: claude_now > live > matched. Post-save claude is authoritative.
function tileDisplay(
  key: TileKey,
  live: NumericTiles,
  matched: Set<TileKey>,
  claude: ClaudeTiles | null,
  phase: 'pre_complete' | 'complete'
): { value: string | null; matched: boolean; source: TileSource } {
  const isMatched = matched.has(key);

  // Format helpers: `liveStr` is null for tiles the regex extractors don't
  // produce (breathing, swelling, energy, cough, appetite). `claudeStr`
  // covers all tiles since Claude grades everything post-save.
  const liveStr: string | null = (() => {
    switch (key) {
      case 'weight':
        return live.weight_lb != null ? `${live.weight_lb} lb` : null;
      case 'blood_pressure':
        return live.systolic_bp != null && live.diastolic_bp != null
          ? `${live.systolic_bp}/${live.diastolic_bp}`
          : null;
      case 'heart_rate':
        return live.resting_hr != null ? `${live.resting_hr} bpm` : null;
      case 'oxygen':
        return live.spo2 != null ? `${live.spo2}%` : null;
      case 'sleep':
        return live.pillow_count != null
          ? `${live.pillow_count} pillow${live.pillow_count === 1 ? '' : 's'}`
          : null;
      default:
        return null;
    }
  })();

  const claudeStr: string | null = (() => {
    if (!claude) return null;
    switch (key) {
      case 'weight':
        return claude.weight_lb != null ? `${claude.weight_lb} lb` : null;
      case 'blood_pressure':
        return claude.systolic_bp != null && claude.diastolic_bp != null
          ? `${claude.systolic_bp}/${claude.diastolic_bp}`
          : null;
      case 'heart_rate':
        return claude.resting_hr != null ? `${claude.resting_hr} bpm` : null;
      case 'oxygen':
        return claude.spo2 != null ? `${claude.spo2}%` : null;
      case 'breathing':
        return formatDyspnea(claude.dyspnea_level);
      case 'swelling':
        return formatSeverity(claude.swelling_severity);
      case 'energy':
        return formatFatigue(claude.fatigue_level);
      case 'sleep':
        return claude.pillow_count != null
          ? `${claude.pillow_count} pillow${claude.pillow_count === 1 ? '' : 's'}`
          : null;
      case 'cough':
        if (claude.cough_present === true) {
          return claude.cough_nocturnal ? 'Yes — nighttime' : 'Yes';
        }
        // Explicit "no cough today" — render "None" so the tile leaves the
        // matched-but-unfilled "heard…" state. Mirrors the pattern
        // Swelling/Breathing/Energy use for their zero-states.
        if (claude.cough_present === false) return 'None';
        return null;
      case 'appetite':
        return formatAppetite(claude.appetite_change);
    }
  })();

  if (phase === 'pre_complete') {
    if (liveStr != null) return { value: liveStr, matched: isMatched, source: 'live' };
    if (isMatched) return { value: null, matched: true, source: 'matched' };
    if (claudeStr != null)
      return { value: claudeStr, matched: false, source: 'claude_prior' };
    return { value: null, matched: false, source: 'empty' };
  }

  if (claudeStr != null)
    return { value: claudeStr, matched: isMatched, source: 'claude_now' };
  if (liveStr != null) return { value: liveStr, matched: isMatched, source: 'live' };
  if (isMatched) return { value: null, matched: true, source: 'matched' };
  return { value: null, matched: false, source: 'empty' };
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
// Lovable-style waveform: 28 thin bars whose heights pulse on a sine curve
// driven by a faux "level" updated every 140ms. Adds visual life to the
// recording header without needing a real AudioContext analyzer.
function Waveform() {
  const [seed, setSeed] = useState(() => Math.random());
  useEffect(() => {
    const id = window.setInterval(() => setSeed(Math.random()), 140);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="flex items-end gap-[2px] h-5 mt-1.5">
      {Array.from({ length: 28 }).map((_, i) => {
        const h = 4 + Math.abs(Math.sin(i * 0.6 + seed * 6)) * 14;
        return (
          <span
            key={i}
            className="rounded-full transition-[height] duration-150 ease-out"
            style={{
              width: 2,
              height: `${h}px`,
              background: 'color-mix(in oklab, var(--sage) 70%, transparent)',
            }}
          />
        );
      })}
    </div>
  );
}

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
  patientName,
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
    // submitted a transcript (user tapped Record then bailed). Treat as
    // idle so the caregiver can record cleanly; when they re-tap Record,
    // we discard that empty pending row before creating a fresh one.
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
  // Render-once unmatched-medication chips returned by the /process route.
  // NOT persisted (architectural decision #8 in docs/plans/medication-flow-v1.md):
  // a caregiver who closes this screen without acting on a chip loses the
  // structured prompt — the transcript still has the original phrase.
  const [unmatchedChips, setUnmatchedChips] = useState<UnmatchedChip[]>([]);
  // Optional message shown above "Reading what you said…" telling the
  // caregiver WHY the recording stopped (mic revoked, time up, network drop).
  // Empty for a normal manual/voice stop.
  const [stopReason, setStopReason] = useState<string | null>(null);
  // Caregiver dismissed the "missing important tiles" nudge for this log.
  const [missingNudgeDismissed, setMissingNudgeDismissed] = useState(false);
  // Brief visual "flash" on the most-recently-filled tile (Lovable's
  // newly-captured-field animation). Cleared 900ms after the fill.
  const [justFilled, setJustFilled] = useState<TileKey | null>(null);
  // Tracks which tiles were filled on the previous render, so we can
  // detect transitions empty→filled and trigger justFilled.
  const prevFilledRef = useRef<Set<TileKey>>(new Set());

  const dgClientRef = useRef<DeepgramClient | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastFinalAtRef = useRef<number>(0);
  const voiceStopTimerRef = useRef<number | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  // Screen Wake Lock — keeps the screen on for the duration of the
  // recording so the OS doesn't background the page mid-dictation. iOS
  // Safari 16.4+ supports it; older browsers fall through silently. The
  // OS auto-releases when the page becomes hidden, so we re-acquire on
  // visibilitychange if the user comes back while still recording.
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  // Latest finals for synchronous reads (avoids the setFinals-callback hack
  // in stopRecording, which was fragile under React 19 StrictMode).
  const finalsRef = useRef<string[]>(existingTranscript ? [existingTranscript] : []);
  // One-attempt reconnect budget per recording session. Reset on every
  // startRecording.
  const reconnectedOnceRef = useRef<boolean>(false);

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

  // Hydrate today's synthesized tile state from /status whenever a logId
  // is set. Keyed ONLY on `logId` because /status synthesizes by
  // (patient_id, log_date) — the response is day-keyed, not log-keyed, so
  // the result is identical regardless of which logId triggered the fetch.
  // Cancellation only fires on logId change or unmount; it does NOT fire
  // on status transitions, so a fetch started in `requesting-mic` survives
  // the flip to `recording` and still hydrates the muted "Earlier today"
  // tiles when claudeTiles was null at Record-tap.
  useEffect(() => {
    if (!logId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/voice-log/${logId}/status`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as ClaudeTiles & {
          processing_status: string;
          transcribed_text: string | null;
          processing_error: string | null;
          structured_observations: AISummary | null;
        };
        setClaudeTiles(data);
        if (data.processing_status === 'complete') {
          setStatus('complete');
          if (data.transcribed_text && finalsRef.current.length === 0) {
            setFinals([data.transcribed_text]);
          }
          setObservations(data.structured_observations);
        } else if (data.processing_status === 'failed') {
          setStatus('error');
          setError(data.processing_error ?? 'Processing failed.');
        }
      } catch {
        /* silent retry */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logId]);

  // Poll /status every 1500ms while processing is in flight. Independent
  // from the hydration effect so its analyzing-only lifecycle doesn't
  // cancel one-shot fetches.
  useEffect(() => {
    if (!logId || status !== 'analyzing') return;
    let cancelled = false;
    const id = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/voice-log/${logId}/status`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as ClaudeTiles & {
          processing_status: string;
          transcribed_text: string | null;
          processing_error: string | null;
          structured_observations: AISummary | null;
        };
        setClaudeTiles(data);
        if (data.processing_status === 'complete') {
          setStatus('complete');
          if (data.transcribed_text && finalsRef.current.length === 0) {
            setFinals([data.transcribed_text]);
          }
          setObservations(data.structured_observations);
        } else if (data.processing_status === 'failed') {
          setStatus('error');
          setError(data.processing_error ?? 'Processing failed.');
        }
      } catch {
        /* silent retry */
      }
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [logId, status]);

  // Voice-stop watcher: when the latest final ends with a stop phrase AND
  // no newer final arrives within VOICE_STOP_SILENCE_GATE_MS, fire stop.
  //
  // Critical: deps are [finals, status] only. Adding `seconds` here causes
  // the effect to re-run every tick — and the cleanup clears the 1s
  // silence-gate timeout before it ever fires, so voice-stop never triggers.
  //
  // No "must record N seconds before arm" gate. The trailing-position
  // phrase match and the 1s silence gate are already specific enough to
  // prevent accidental stops; an arm-up window combined with the
  // lazy-re-run effect created a window where saying "end note" early +
  // staying silent never re-checked after the threshold passed.
  //
  // Correctness depends on capturing the trigger-final's timestamp inside
  // the effect closure: at fire-time, if lastFinalAtRef.current has moved
  // past triggerTimestamp, a newer final arrived and we abort. Comparing
  // against `Date.now()` would always pass the 1s-elapsed check and
  // give a false stop the moment any final ends with "I'm done."
  useEffect(() => {
    if (status !== 'recording') return;

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

  // Cleanup on unmount: close the WS, stop the mic stream, clear timers,
  // release the wake lock.
  useEffect(() => {
    return () => {
      dgClientRef.current?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (voiceStopTimerRef.current) window.clearTimeout(voiceStopTimerRef.current);
      void releaseWakeLock();
    };
  }, []);

  // While recording, watch for the page going hidden (manual screen lock,
  // app switch). The browser will pause our main thread and Deepgram's
  // socket will time out — better to gracefully stop and save what we
  // have than leave a row stuck in 'pending'. If the page comes back
  // while still recording (rare — user toggled briefly), re-acquire the
  // wake lock since the OS auto-released it.
  useEffect(() => {
    if (status !== 'recording') return;
    function onVisibilityChange() {
      if (document.hidden) {
        // Use a ref-based check inside stopRecording to skip the no-op path.
        if (streamRef.current) {
          stopRecording('Screen turned off — saving what you said.');
        }
      } else {
        void acquireWakeLock();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function acquireWakeLock() {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
    } catch {
      // User may have denied, battery may be low, browser may have its own
      // policy. Not fatal — recording still works; the visibilitychange
      // handler will catch a screen-lock gracefully.
    }
  }

  async function releaseWakeLock() {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    if (sentinel) {
      try {
        await sentinel.release();
      } catch {
        // ignore
      }
    }
  }

  async function startRecording() {
    setError(null);
    setStopReason(null);
    setMissingNudgeDismissed(false);
    setInterim('');
    setFinals([]);
    // Intentionally NOT clearing claudeTiles. Retained synthesis from prior
    // dictations today drives the muted "Earlier today" tile state during
    // this recording. The DB is still source of truth — claudeTiles here
    // is the last-saved synthesis, refreshed by the polling effect when
    // the new logId is set below.
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

    // Permission revoked mid-session. Read recording state via refs because
    // this callback closes over the click-time render's `status` (typically
    // 'idle'), so a state-based check would never fire. Guard on `streamRef`
    // alone (not `timerRef`) — between mic-acquired and timer-started, we
    // run several awaited network calls (token mint, discardEmptyVoiceLog,
    // startVoiceLog, openSession). If the user revokes mic in that window,
    // we still want stopRecording to fire and surface the "Mic was turned
    // off" reason; stopRecording handles the no-timer case gracefully via
    // its existing null-checks.
    stream.getTracks().forEach((t) => {
      t.onended = () => {
        if (streamRef.current) {
          stopRecording('Mic was turned off — saving what you said.');
        }
      };
    });

    // 2. If we hydrated a prior empty pending row (caregiver bailed before
    //    saving), discard it now so it doesn't sit orphaned in the DB.
    //    The action server-side double-guards (only deletes pending+empty).
    if (logId) {
      await discardEmptyVoiceLog({ logId });
    }

    // 3. Create the daily_logs row for this dictation.
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

    // 5. Start the timer + request the wake lock so the screen stays on
    //    for the 30-second dictation. Wake lock failure is non-fatal.
    setStatus('recording');
    void acquireWakeLock();
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
        // fails, stop and submit what we have. Recording state is read via
        // refs — this callback closes over the openSession-time `status`
        // (typically 'requesting-mic'), so a state-based check would never
        // see 'recording'.
        if (code === 1000) return;
        if (!streamRef.current || !timerRef.current) return;
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
    // Idempotency guard via ref, not state. The state-based check used to
    // read a stale closure when the auto-stop timer fired (the function was
    // captured at click-time when status was still 'idle'), so the timer
    // would never clear and recording continued past MAX_SECONDS. The ref
    // is always live; checking it twice (here + below) is harmless.
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
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        unmatched_chips?: UnmatchedChip[];
      };
      if (!res.ok) {
        throw new Error(json.error ?? `processing failed (${res.status})`);
      }
      // Capture unmatched-medication chips for render-once display in the
      // review section (NOT persisted — see state declaration).
      setUnmatchedChips(json.unmatched_chips ?? []);
      // Status is already 'analyzing' (set in stopRecording); the polling
      // effect picks up the result.
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Processing failed.');
    }
  }

  function recordAnother() {
    // Keep `claudeTiles` and `logId` so the just-completed dictation's
    // synthesized state stays visible as muted "Earlier today" tiles in
    // the idle phase, instead of blanking. The next Record-tap creates a
    // new logId, which re-fires the hydration effect and refreshes the
    // synthesis. Observations/finals/interim are dictation-specific and
    // do reset.
    setStatus('idle');
    setError(null);
    setStopReason(null);
    setMissingNudgeDismissed(false);
    setInterim('');
    setFinals([]);
    setObservations(null);
    setUnmatchedChips([]);
    setSeconds(0);
  }

  // ===== Render =====

  const alertChips = alertChipsFromClaude(claudeTiles);
  const moreNotes = buildMoreNotes(claudeTiles);

  // Compute each tile's display once per render so we can re-use across
  // multiple sections (record-state grid, complete-state grid, missing-
  // tiles nudge, justFilled tracking).
  const phase: 'pre_complete' | 'complete' = status === 'complete' ? 'complete' : 'pre_complete';
  const tileDisplays = TILE_ORDER.map((key) => ({
    key,
    ...tileDisplay(key, liveNumeric, liveMatched, claudeTiles, phase),
  }));
  const filledCount = tileDisplays.filter((t) => t.value != null).length;

  // Important daily-track tiles the caregiver didn't log today. Drives the
  // post-recording nudge banner — only computed when Claude has finished
  // (otherwise everything looks "missing").
  const missingImportantTiles =
    status === 'complete' && claudeTiles
      ? tileDisplays.filter(({ key, value }) => TILE_META[key].important && value == null).map((t) => t.key)
      : [];

  // Flash animation tracking. Only `live` and `claude_now` are flash-eligible
  // — those are the sources that mean "we just heard / just processed this."
  // `claude_prior` (muted hydration on Record-tap) and `matched` (no value)
  // must not flash.
  const flashEligibleNow = new Set(
    tileDisplays
      .filter((t) => t.source === 'live' || t.source === 'claude_now')
      .map((t) => t.key)
  );
  const flashEligibleCount = flashEligibleNow.size;

  useEffect(() => {
    const prev = prevFilledRef.current;
    for (const k of flashEligibleNow) {
      if (!prev.has(k)) {
        setJustFilled(k);
        const tk = k;
        window.setTimeout(
          () => setJustFilled((cur) => (cur === tk ? null : cur)),
          900
        );
      }
    }
    prevFilledRef.current = flashEligibleNow;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashEligibleCount]);

  const showRecordSurface =
    status === 'idle' || status === 'requesting-mic' || status === 'recording';

  return (
    <section className="px-4 pt-4 flex flex-col gap-4 animate-fade-up">
      {/* Header strip — concise; no big "How is X?" block competing with the
          recording surface for visual weight. Lovable's design instead. */}
      <div className="flex items-center justify-between px-2">
        <p className="text-sm text-muted-foreground">Today’s check-in</p>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          For {patientName}
        </p>
      </div>

      {/* Mic + timer + waveform header — the always-visible vital sign of
          recording state. Pulse ring active during recording; static during
          idle/analyzing/complete. */}
      <div className="flex items-center gap-4 px-2 mt-1">
        <div className="relative h-16 w-16 flex-shrink-0">
          {(status === 'recording' || status === 'analyzing') && (
            <div
              className="absolute inset-0 rounded-full animate-pulse-ring"
              style={{ background: 'var(--status-good-soft)' }}
            />
          )}
          <div
            className="absolute inset-2 rounded-full flex items-center justify-center"
            style={{
              background:
                status === 'complete'
                  ? 'linear-gradient(135deg, var(--status-good), color-mix(in oklab, var(--status-good) 60%, white))'
                  : 'linear-gradient(135deg, var(--sage), color-mix(in oklab, var(--sage) 60%, white))',
              boxShadow:
                '0 8px 24px -6px color-mix(in oklab, var(--sage) 60%, transparent)',
            }}
          >
            {status === 'complete' ? (
              <Check size={22} className="text-white" strokeWidth={2.4} />
            ) : (
              <Mic size={22} className="text-white" strokeWidth={1.8} />
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {status === 'recording'
              ? 'Listening…'
              : status === 'requesting-mic'
                ? 'Asking for mic…'
                : status === 'analyzing'
                  ? 'Reading what you said…'
                  : status === 'complete'
                    ? 'Logged for today'
                    : status === 'error'
                      ? 'Something went wrong'
                      : 'Tap below to start'}
          </p>
          <p
            className="font-display text-2xl tabular-nums text-foreground leading-tight"
            style={
              status === 'recording' && seconds >= WRAP_UP_WARNING_AT
                ? { color: 'var(--status-alert)' }
                : undefined
            }
          >
            {String(Math.floor(seconds / 60))}:{String(seconds % 60).padStart(2, '0')}
          </p>
          {status === 'recording' && <Waveform />}
          {status === 'recording' && seconds >= WRAP_UP_WARNING_AT && (
            <p
              className="text-[11px] mt-0.5 font-semibold"
              style={{ color: 'var(--status-alert)' }}
            >
              Wrap up — {MAX_SECONDS - seconds}s left
            </p>
          )}
        </div>
      </div>

      {/* Optional reason banner above the analyzing state (mic revoked,
          time up, network drop). */}
      {status === 'analyzing' && stopReason && (
        <div
          className="rounded-2xl px-4 py-3 text-sm text-center"
          style={{
            background: 'var(--status-watch-soft)',
            color: 'var(--status-watch-foreground)',
          }}
        >
          {stopReason}
        </div>
      )}

      {/* Live transcript card — visible during record/analyzing/complete. */}
      {(showRecordSurface || status === 'analyzing' || status === 'complete') && (
        <div
          ref={transcriptScrollRef}
          className="rounded-2xl bg-card shadow-card p-4 min-h-[88px] max-h-[180px] overflow-y-auto"
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
            {status === 'complete' ? 'Transcript' : 'Live transcript'}
          </p>
          <p className="text-[15px] leading-relaxed text-foreground">
            {finals.join(' ')}
            {interim && (
              <span className="text-muted-foreground italic"> {interim}</span>
            )}
            {status === 'recording' && (
              <span
                className="inline-block w-1 h-4 ml-0.5 align-middle animate-pulse"
                style={{ background: 'var(--sage)' }}
              />
            )}
            {!finals.length && !interim && (
              <span className="text-muted-foreground italic">
                {status === 'recording'
                  ? "Start talking — I'll capture the important parts…"
                  : status === 'idle'
                    ? `Tap the mic and tell HeartNote how ${patientName} is doing. Up to 2 minutes. Say “end note” when you're done.`
                    : '—'}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Caregiver summary card — appears on complete only. Sage-soft
          background to mirror Lovable's "What we noted" treatment. */}
      {status === 'complete' && observations?.caregiver_summary && (
        <div
          className="rounded-2xl p-4 border"
          style={{
            background: 'var(--status-good-soft)',
            borderColor: 'color-mix(in oklab, var(--status-good) 30%, transparent)',
          }}
        >
          <p
            className="text-[10px] uppercase tracking-wider mb-1.5 flex items-center gap-1.5"
            style={{ color: 'var(--status-good-foreground)' }}
          >
            <Sparkles size={12} /> What HeartNote heard
          </p>
          <p
            className="text-sm leading-relaxed"
            style={{ color: 'var(--status-good-foreground)' }}
          >
            {observations.caregiver_summary}
          </p>
        </div>
      )}

      {/* Missing-important nudge: shown on complete only, dismissible. */}
      {status === 'complete' &&
        missingImportantTiles.length > 0 &&
        !missingNudgeDismissed && (
          <div
            className="rounded-2xl p-4 border"
            style={{
              background: 'var(--status-watch-soft)',
              borderColor: 'var(--status-watch)',
              color: 'var(--status-watch-foreground)',
            }}
          >
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">A few you didn’t mention today</p>
                <p className="text-xs leading-relaxed mt-1.5 opacity-90">
                  These five matter most for spotting changes early:{' '}
                  <span className="font-medium">
                    {missingImportantTiles.map((k) => TILE_META[k].label).join(', ')}
                  </span>
                  . Try to mention them in tomorrow’s log so we can build a stable
                  baseline.
                </p>
                <button
                  type="button"
                  onClick={() => setMissingNudgeDismissed(true)}
                  className="text-xs font-medium mt-3 underline underline-offset-2"
                >
                  Got it
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Auto-filling counter + tile grid (Lovable's smaller, tone-coded
          tiles with flash-on-fill). Heard = sage ring; missing-important
          on complete = watch ring; filled = sage soft. */}
      {status !== 'error' && (
        <div>
          <div className="flex items-baseline justify-between px-2 mb-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles size={12} /> Auto-filling
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {filledCount}/{TILE_ORDER.length} captured
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {tileDisplays.map(({ key, value, source }) => {
              const meta = TILE_META[key];
              const isPrior = source === 'claude_prior';
              const isHeard = source === 'matched';
              const hasValue = value != null;
              const missingImportant =
                status === 'complete' && !hasValue && meta.important;
              const flash = justFilled === key;
              // Muted "Earlier today" tiles use 0.75 opacity — visibly dimmer
              // than active tiles (1.0) but distinct from the empty state's
              // 0.55 + em-dash treatment, so the caregiver can tell at a
              // glance: bright = captured now, muted = on file from earlier,
              // empty = nothing today. 0.75 (not 0.7) keeps the value text
              // above WCAG AA contrast against `var(--card)` in light mode,
              // where `--foreground: oklch(0.28...)` composites borderline
              // at 0.7.
              const opacity = isPrior
                ? 0.75
                : hasValue || isHeard || missingImportant
                  ? 1
                  : 0.55;
              return (
                <div
                  key={key}
                  className="rounded-2xl p-3 shadow-card transition-all duration-300"
                  style={{
                    background: hasValue
                      ? 'var(--card)'
                      : 'color-mix(in oklab, var(--muted) 60%, transparent)',
                    outline: flash
                      ? '2px solid var(--status-good-foreground)'
                      : isHeard
                        ? '2px solid var(--sage)'
                        : missingImportant
                          ? '2px solid var(--status-watch)'
                          : 'none',
                    transform: flash ? 'scale(1.02)' : 'scale(1)',
                    opacity,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
                      style={{
                        background: hasValue
                          ? 'var(--status-good-soft)'
                          : isHeard
                            ? 'var(--status-good-soft)'
                            : 'var(--muted)',
                        color: hasValue || isHeard
                          ? 'var(--status-good-foreground)'
                          : 'var(--muted-foreground)',
                      }}
                    >
                      <meta.Icon size={14} />
                    </div>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">
                      {meta.label}
                    </p>
                  </div>
                  <p
                    className="mt-1.5 text-sm font-medium min-h-[20px] truncate"
                    style={{
                      color: isHeard
                        ? 'var(--status-good-foreground)'
                        : 'var(--foreground)',
                    }}
                  >
                    {hasValue ? (
                      value
                    ) : isHeard ? (
                      <span className="text-xs italic">heard…</span>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </p>
                  {isPrior && (
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                      Earlier today
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom action — sage pill button, contextual label per status.
          On idle/recording it's the primary CTA at thumb reach.
          On complete it offers "Record another." */}
      {status === 'idle' && (
        <button
          type="button"
          onClick={startRecording}
          className="self-center mt-2 mb-2 flex items-center gap-2 rounded-full px-6 py-3.5 text-primary-foreground font-medium active:scale-95 transition shadow-card"
          style={{
            background:
              'linear-gradient(135deg, var(--sage), color-mix(in oklab, var(--sage) 70%, white))',
          }}
          aria-label="Start recording"
        >
          <Mic size={14} /> Start recording
        </button>
      )}
      {status === 'requesting-mic' && (
        <button
          type="button"
          disabled
          className="self-center mt-2 mb-2 flex items-center gap-2 rounded-full px-6 py-3.5 text-primary-foreground font-medium opacity-50 shadow-card"
          style={{
            background:
              'linear-gradient(135deg, var(--sage), color-mix(in oklab, var(--sage) 70%, white))',
          }}
        >
          <Mic size={14} /> Requesting mic…
        </button>
      )}
      {status === 'recording' && (
        <button
          type="button"
          onClick={() => stopRecording()}
          className="self-center mt-2 mb-2 flex items-center gap-2 rounded-full px-6 py-3.5 text-primary-foreground font-medium active:scale-95 transition shadow-card"
          style={{
            background:
              'linear-gradient(135deg, var(--sage), color-mix(in oklab, var(--sage) 70%, white))',
          }}
          aria-label="Stop recording and save"
        >
          <Square size={14} fill="currentColor" /> Stop &amp; save
        </button>
      )}

      {/* Error state — full-card error message + retry button. */}
      {status === 'error' && (
        <div className="rounded-2xl bg-card shadow-card p-6 flex flex-col items-center gap-4">
          <div
            className="h-12 w-12 rounded-full flex items-center justify-center"
            style={{ background: 'var(--status-alert-soft)' }}
          >
            <AlertCircle
              size={22}
              style={{ color: 'var(--status-alert-foreground)' }}
            />
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

      {/* Unmatched-medication chips. Render-once per architectural decision
          #8 in docs/plans/medication-flow-v1.md — a caregiver who navigates
          away without acting loses these from the structured surface. The
          transcript still records the original phrase. */}
      {status === 'complete' && unmatchedChips.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Medications mentioned — quick check
          </p>
          {unmatchedChips.map((chip, i) => {
            if (chip.type === 'pick_med') {
              return (
                <Link
                  key={i}
                  href="/me/medications"
                  className="rounded-2xl bg-card border border-border p-3 flex items-start gap-3 active:bg-muted/40 transition"
                >
                  <span className="text-sm flex-1">
                    Couldn&rsquo;t pin down{' '}
                    <span className="font-semibold">&ldquo;{chip.phrase}&rdquo;</span> — tap to
                    clarify which med you meant.
                  </span>
                </Link>
              );
            }
            if (chip.type === 'restart_med' && chip.medication_id) {
              return (
                <Link
                  key={i}
                  href={`/me/medications/${chip.medication_id}`}
                  className="rounded-2xl bg-card border border-border p-3 flex items-start gap-3 active:bg-muted/40 transition"
                >
                  <span className="text-sm flex-1">
                    <span className="font-semibold">&ldquo;{chip.phrase}&rdquo;</span> is on the
                    stopped list — restart it?
                  </span>
                </Link>
              );
            }
            // add_med
            return (
              <Link
                key={i}
                href="/me/medications/new"
                className="rounded-2xl bg-card border border-border p-3 flex items-start gap-3 active:bg-muted/40 transition"
              >
                <span className="text-sm flex-1">
                  Couldn&rsquo;t find{' '}
                  <span className="font-semibold">&ldquo;{chip.phrase}&rdquo;</span> on the meds
                  list — add it?
                </span>
              </Link>
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
