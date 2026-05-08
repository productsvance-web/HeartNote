// Spell-out small counts in caregiver copy. "Two things changed today" /
// "Three patterns to flag" matches the design system's narrative register.
// Falls back to digits at 10+ to avoid awkward hyphenation.

const COUNT_WORDS = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
];

export function countWord(n: number): string {
  return n < COUNT_WORDS.length ? COUNT_WORDS[n] : String(n);
}
