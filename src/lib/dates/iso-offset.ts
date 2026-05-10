// Add (or subtract, with negative days) calendar days to a YYYY-MM-DD
// string. Uses UTC math purely to avoid local-tz drift; the input is
// assumed to be a calendar date in whatever tz the caller is reasoning
// about. Output is also a YYYY-MM-DD string.
//
// Extracted from /trends/weight where the same 4-line helper appeared
// in four files (page route, server action, view, sheet). Per
// .claude/rules/code-quality.md rule #2, the rule of three triggered
// inside a single PR.

export function isoOffset(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
