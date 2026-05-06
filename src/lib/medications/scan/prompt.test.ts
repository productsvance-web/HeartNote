// Regression tests against the system-prompt text. We can't unit-test
// Gemini's actual classification of a TID label without burning Vertex
// credits, but we can prevent prompt-edit accidents that would degrade
// the dose-change classifier.
//
// Run from repo root:
//   node --test --experimental-strip-types src/lib/medications/scan/prompt.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EXTRACTION_SYSTEM_PROMPT } from './prompt.ts';

describe('EXTRACTION_SYSTEM_PROMPT', () => {
  it('still spells out the dose-change rule (build convention #6 cue)', () => {
    assert.match(EXTRACTION_SYSTEM_PROMPT, /HARD RULE — dose-change/);
    assert.match(EXTRACTION_SYSTEM_PROMPT, /is_dose_change: true/);
    assert.match(EXTRACTION_SYSTEM_PROMPT, /Increase to 80 mg starting Monday/);
    assert.match(EXTRACTION_SYSTEM_PROMPT, /Taper to 20 mg over 2 weeks/);
  });

  it('explicitly distinguishes stable schedules from dose changes', () => {
    // The classifier loses one cue when doses_per_day extraction is
    // dropped from the schema. Without an explicit "TID is not a dose
    // change" example, the model could regress toward over-flagging.
    assert.match(
      EXTRACTION_SYSTEM_PROMPT,
      /Take 1 tablet 3 times daily/,
      'prompt must include a TID stable-schedule counter-example'
    );
    assert.match(
      EXTRACTION_SYSTEM_PROMPT,
      /Stable frequencies are not dose changes/,
      'prompt must state the stable-schedule rule explicitly'
    );
  });

  it('no longer asks the model to extract doses_per_day', () => {
    // Removing this from the schema without removing it from the prompt
    // would teach the model a now-rejected field exists; risk: the model
    // either (a) hallucinates the field anyway, breaking schema-fail, or
    // (b) compensates by stuffing frequency into dose_unit. Keep both
    // ends in sync. The field NAME must not appear in the field list,
    // and the prompt must not instruct the model to map BID/TID/QD to
    // an integer (which is what the old prompt did).
    assert.doesNotMatch(EXTRACTION_SYSTEM_PROMPT, /doses_per_day/);
    assert.doesNotMatch(
      EXTRACTION_SYSTEM_PROMPT,
      /(?:BID|TID|QD)[^\n]*→/,
      'prompt must not contain "BID → 2"-style mapping instructions'
    );
  });

  it('still tells the model NOT to extract schedule times', () => {
    assert.match(EXTRACTION_SYSTEM_PROMPT, /Schedule times/);
    assert.match(EXTRACTION_SYSTEM_PROMPT, /never; even if printed/);
  });

  it('explicitly tells the model NOT to extract frequency', () => {
    assert.match(EXTRACTION_SYSTEM_PROMPT, /Frequency \/ how-often-per-day/);
    assert.match(EXTRACTION_SYSTEM_PROMPT, /caregiver fills this on a separate screen/);
  });
});
