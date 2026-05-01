// Client-side string matching against the synonym dictionary.
//
// Deepgram's `keyterm` parameter biases recognition only — it does NOT tag
// matches in the response payload. We do that match step here, locally:
// after each transcript update, scan the running text for any synonym from
// KEYWORD_MAP and report which tiles to light up. Pure function, easy to
// unit-test. See keyword-map.ts for the dictionary.

import { KEYWORD_MAP, type TileKey, END_RECORDING_PHRASES } from './keyword-map';

// Returns the set of tiles whose synonym list has at least one entry that
// appears (case-insensitive) anywhere in the transcript. Whole-string scan;
// callers can pass either the full running transcript or just the latest
// segment depending on the UX they want.
export function findMatchedKeyterms(transcript: string): Set<TileKey> {
  const lower = transcript.toLowerCase();
  const matched = new Set<TileKey>();
  for (const [tile, synonyms] of Object.entries(KEYWORD_MAP)) {
    for (const synonym of synonyms) {
      if (lower.includes(synonym)) {
        matched.add(tile as TileKey);
        break;
      }
    }
  }
  return matched;
}

// True if the given final transcript segment ends with one of the explicit
// end-recording phrases. Trailing-position-only check guards against false
// triggers like "I want to end note about the cough" — that string contains
// "end note" but doesn't end with it. Punctuation tolerated at the tail.
export function segmentEndsWithStopPhrase(segment: string): boolean {
  const cleaned = segment.toLowerCase().trim().replace(/[.!?,]+$/g, '').trim();
  return END_RECORDING_PHRASES.some((phrase) => cleaned.endsWith(phrase));
}
