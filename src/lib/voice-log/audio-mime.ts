// MIME-to-extension mapping for voice-log audio.
//
// Browsers hand us different container formats from `MediaRecorder`:
// Chrome/Firefox/Edge produce `audio/webm`; Safari iOS produces `audio/mp4`.
// We need the on-disk extension and the multipart filename to agree with the
// actual bytes — Whisper sniffs but does so unreliably, and Supabase Storage
// is content-type/extension sensitive when serving objects back.
//
// `.m4a` (not `.mp4`) is the audio-only convention Whisper handles cleanly
// for `audio/mp4` payloads.
const MIME_TO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};

export function extForMime(mimeType: string | undefined | null): string {
  if (!mimeType) return 'webm';
  // Strip codec suffix, e.g. `audio/webm;codecs=opus` → `audio/webm`.
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return MIME_TO_EXT[base] ?? 'webm';
}

export function filenameForMime(stem: string, mimeType: string | undefined | null): string {
  return `${stem}.${extForMime(mimeType)}`;
}
