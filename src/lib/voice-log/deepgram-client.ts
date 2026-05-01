// Browser-side helper that opens a Deepgram streaming WebSocket given a
// short-lived token + keyterm bias list, pipes a MediaStream through it,
// and emits typed transcript events.
//
// Design notes:
// - Browser WebSockets cannot set an Authorization header on open, so we
//   authenticate using Deepgram's `Sec-WebSocket-Protocol` trick: open with
//   the two-element protocol array ['token', '<jwt>']. This is the path
//   Deepgram documents for browser clients.
// - We send 250 ms PCM/Opus chunks (whatever MediaRecorder produces) and
//   receive interim + final transcript JSON messages.
// - Caller owns the MediaStream lifecycle. We close the WS but never stop
//   tracks ourselves — leaves the caller free to fork the stream for other
//   uses without surprising them.

import { allKeyterms } from './keyword-map';

export type DeepgramTranscript = {
  isFinal: boolean;
  text: string;
};

export type DeepgramClientCallbacks = {
  onTranscript?: (t: DeepgramTranscript) => void;
  onError?: (err: Error) => void;
  onClose?: (code: number, reason: string) => void;
};

export type DeepgramClient = {
  close: () => void;
};

const DEEPGRAM_WS_BASE = 'wss://api.deepgram.com/v1/listen';

// Build the streaming URL with our query params. Keyterms are repeated
// `keyterm=<term>` params per Deepgram's Nova-3 spec. Smart-format ON so
// numbers like "one seventy-four" come back as 174. Punctuation ON so
// segment-end detection (for the "end note" voice-stop) is reliable.
function buildStreamUrl(): string {
  const params = new URLSearchParams();
  params.set('model', 'nova-3');
  params.set('language', 'en-US');
  params.set('interim_results', 'true');
  params.set('smart_format', 'true');
  params.set('punctuate', 'true');
  params.set('endpointing', '300'); // ms of silence before utterance ends

  // URLSearchParams collapses repeated keys with .set; use .append.
  for (const term of allKeyterms()) {
    params.append('keyterm', term);
  }

  return `${DEEPGRAM_WS_BASE}?${params.toString()}`;
}

export function openDeepgramClient(
  token: string,
  stream: MediaStream,
  callbacks: DeepgramClientCallbacks
): DeepgramClient {
  // Sec-WebSocket-Protocol auth: ['token', <jwt>]. Browser WS API uses the
  // second arg of the constructor for protocols.
  const ws = new WebSocket(buildStreamUrl(), ['token', token]);
  ws.binaryType = 'arraybuffer';

  let recorder: MediaRecorder | null = null;

  ws.onopen = () => {
    // MediaRecorder support varies by browser; pick the first supported codec.
    // Deepgram accepts both audio/webm (Chrome, Firefox) and audio/mp4
    // (Safari, iOS Capacitor) with appropriate codec hints.
    const mimeType =
      typeof MediaRecorder !== 'undefined' &&
      MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm';

    try {
      recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 });
    } catch (err) {
      callbacks.onError?.(err instanceof Error ? err : new Error('MediaRecorder unsupported'));
      ws.close();
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        ws.send(e.data);
      }
    };
    // 250 ms chunk cadence — enough to keep Deepgram fed without flooding.
    recorder.start(250);
  };

  ws.onmessage = (event) => {
    if (typeof event.data !== 'string') return;
    try {
      const msg = JSON.parse(event.data) as {
        type?: string;
        is_final?: boolean;
        channel?: { alternatives?: Array<{ transcript?: string }> };
      };
      if (msg.type !== 'Results') return;
      const text = msg.channel?.alternatives?.[0]?.transcript ?? '';
      if (!text) return;
      callbacks.onTranscript?.({ isFinal: Boolean(msg.is_final), text });
    } catch (err) {
      callbacks.onError?.(err instanceof Error ? err : new Error('parse error'));
    }
  };

  ws.onerror = () => {
    // The browser WebSocket Event for errors is opaque; surface a generic
    // message and let the caller decide whether to retry.
    callbacks.onError?.(new Error('Deepgram WebSocket error'));
  };

  ws.onclose = (event) => {
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    callbacks.onClose?.(event.code, event.reason || '');
  };

  return {
    close: () => {
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
      }
      // Deepgram's documented "close stream" message: send the JSON
      // {"type":"CloseStream"} to flush any pending finals before close.
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'CloseStream' }));
        } catch {
          /* ignore */
        }
        ws.close(1000, 'client closed');
      }
    },
  };
}
