'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, RotateCcw, Check, AlertCircle } from 'lucide-react';
import { uploadVoiceLog } from './actions';

type Status =
  | 'idle'
  | 'requesting-mic'
  | 'recording'
  | 'recorded'
  | 'uploading'
  | 'processing'
  | 'complete'
  | 'error';

const MAX_SECONDS = 90; // allow up to 90s; design target is 30
const TARGET_SECONDS = 30;

type Props = {
  patientId: string;
  existingLogId: string | null;
  existingStatus: string | null;
  existingTranscript: string | null;
};

export function VoiceLogClient({
  patientId,
  existingLogId,
  existingStatus,
  existingTranscript,
}: Props) {
  const [status, setStatus] = useState<Status>(
    existingLogId ? (existingStatus === 'complete' ? 'complete' : 'processing') : 'idle'
  );
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [logId, setLogId] = useState<string | null>(existingLogId);
  const [transcript, setTranscript] = useState<string | null>(existingTranscript);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  // If a log is already pending/processing, poll for updates.
  useEffect(() => {
    if (!logId || status === 'complete' || status === 'idle') return;
    if (existingStatus === 'complete') {
      setStatus('complete');
      return;
    }
    const interval = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/voice-log/${logId}/status`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          processing_status: string;
          transcribed_text: string | null;
          processing_error: string | null;
        };
        if (data.processing_status === 'complete') {
          setStatus('complete');
          setTranscript(data.transcribed_text);
          window.clearInterval(interval);
        } else if (data.processing_status === 'failed') {
          setStatus('error');
          setError(data.processing_error ?? 'Processing failed.');
          window.clearInterval(interval);
        }
      } catch {
        /* silent retry */
      }
    }, 2000);
    return () => window.clearInterval(interval);
  }, [logId, status, existingStatus]);

  async function startRecording() {
    setError(null);
    setStatus('requesting-mic');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        audioBlobRef.current = blob;
        if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = URL.createObjectURL(blob);
        setStatus('recorded');
      };

      recorder.start();
      setSeconds(0);
      setStatus('recording');
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          if (next >= MAX_SECONDS) stopRecording();
          return next;
        });
      }, 1000);
    } catch (err) {
      setStatus('error');
      const msg =
        err instanceof Error
          ? err.message.includes('Permission')
            ? 'Microphone permission was denied. Enable it in your browser settings, then try again.'
            : err.message
          : 'Could not start recording.';
      setError(msg);
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }

  function discardRecording() {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    audioBlobRef.current = null;
    setSeconds(0);
    setStatus('idle');
    setError(null);
  }

  async function saveRecording() {
    if (!audioBlobRef.current) return;
    setStatus('uploading');
    setError(null);
    try {
      const formData = new FormData();
      formData.set('patientId', patientId);
      formData.set('audio', audioBlobRef.current, 'voice-log.webm');
      formData.set('durationSeconds', String(seconds));
      const result = await uploadVoiceLog(formData);
      if (!result.ok) {
        setStatus('error');
        setError(result.error);
        return;
      }
      setLogId(result.logId);
      setStatus('processing');
      // Kick off server-side processing.
      await fetch(`/api/voice-log/${result.logId}/process`, { method: 'POST' });
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  }

  return (
    <section className="mt-6 mx-4 rounded-3xl bg-card shadow-card p-6 animate-fade-up">
      {(status === 'idle' || status === 'requesting-mic') && (
        <div className="flex flex-col items-center gap-6 py-6">
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
            {status === 'requesting-mic' ? 'Asking for mic permission…' : 'Tap to start'}
          </p>
        </div>
      )}

      {status === 'recording' && (
        <div className="flex flex-col items-center gap-6 py-6">
          <button
            type="button"
            onClick={stopRecording}
            className="h-32 w-32 rounded-full text-white shadow-soft active:scale-95 transition animate-pulse-ring relative flex items-center justify-center"
            style={{ background: 'var(--status-alert)' }}
            aria-label="Stop recording"
          >
            <Square size={42} fill="currentColor" />
          </button>
          <div className="text-center">
            <p className="font-display text-3xl tabular-nums">
              {String(Math.floor(seconds / 60)).padStart(2, '0')}:
              {String(seconds % 60).padStart(2, '0')}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {seconds < TARGET_SECONDS
                ? `${TARGET_SECONDS - seconds}s to go`
                : 'Tap to finish'}
            </p>
          </div>
        </div>
      )}

      {status === 'recorded' && (
        <div className="flex flex-col items-center gap-5 py-4">
          <div
            className="h-20 w-20 rounded-full flex items-center justify-center"
            style={{ background: 'var(--status-good-soft)' }}
          >
            <Check size={36} style={{ color: 'var(--status-good-foreground)' }} />
          </div>
          <p className="text-center font-display text-xl">
            {seconds}s captured. Save this log?
          </p>
          {audioUrlRef.current && (
            <audio controls src={audioUrlRef.current} className="w-full" />
          )}
          <div className="flex gap-3 w-full">
            <button
              type="button"
              onClick={discardRecording}
              className="flex-1 rounded-full px-5 py-3 text-sm font-medium border border-border bg-card text-foreground active:scale-[0.98] transition flex items-center justify-center gap-2"
            >
              <RotateCcw size={16} />
              Re-record
            </button>
            <button
              type="button"
              onClick={saveRecording}
              className="flex-1 rounded-full px-5 py-3 font-semibold text-primary-foreground shadow-soft active:scale-[0.98] transition"
              style={{
                background:
                  'linear-gradient(135deg, var(--sage), color-mix(in oklab, var(--sage) 70%, white))',
              }}
            >
              Save log
            </button>
          </div>
        </div>
      )}

      {(status === 'uploading' || status === 'processing') && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div
            className="h-16 w-16 rounded-full animate-pulse-ring flex items-center justify-center"
            style={{ background: 'var(--status-good-soft)' }}
          >
            <Mic size={28} style={{ color: 'var(--status-good-foreground)' }} />
          </div>
          <p className="font-display text-xl">
            {status === 'uploading' ? 'Saving your recording…' : 'Listening to what you said…'}
          </p>
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            HeartNote is transcribing the audio and pulling out weight, symptoms, and anything
            else worth flagging.
          </p>
        </div>
      )}

      {status === 'complete' && (
        <div className="flex flex-col gap-4 py-2">
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
          {transcript ? (
            <div className="rounded-2xl bg-muted/60 p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                What you said
              </p>
              <p className="text-sm whitespace-pre-wrap">{transcript}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Audio saved. Transcription will appear once we wire Whisper to your API key.
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setStatus('idle');
              setTranscript(null);
              setLogId(null);
              setSeconds(0);
            }}
            className="rounded-full px-5 py-3 text-sm font-medium border border-border bg-card text-foreground active:scale-[0.98] transition self-center"
          >
            Record another
          </button>
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
            onClick={discardRecording}
            className="rounded-full px-5 py-3 text-sm font-medium border border-border bg-card"
          >
            Try again
          </button>
        </div>
      )}
    </section>
  );
}
