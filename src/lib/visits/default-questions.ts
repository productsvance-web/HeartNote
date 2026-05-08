// Starter "questions worth asking" list for the cardiology visit handoff.
// Mirrors the AHA 11-question template (research/03-caregiver-education.md
// §5.5, citing AHA "Heart Failure Questions to Ask Your Doctor"), trimmed
// to the 6 most-relevant for an established CHF patient and rewritten
// from the caregiver's perspective. Each item is editable in-app.

export function defaultQuestionsForPatient(patientName: string | null): string[] {
  const subject = patientName?.trim() && patientName.toLowerCase() !== 'them' ? patientName : 'mom';
  return [
    `Have any of ${subject}'s symptoms or numbers changed enough to worry about?`,
    `Should we adjust any of ${subject}'s medications?`,
    `What's the best way to reach you if symptoms change suddenly?`,
    `Are there side effects from any of these medications I should watch for?`,
    `Is there anything else worth tracking at home?`,
    `When should we come back?`,
  ];
}
