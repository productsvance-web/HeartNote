// Italic Fraunces transcript card. Visible only when transcript is non-null.
// Eyebrow: "From voice · {time}". Mockup-verbatim: sage-mist gradient bg,
// mask-image fade at top + bottom edges so long transcripts feather out
// without a hard cut.

interface Props {
  transcript: string;
  recordedAtIso?: string;
}

export function TranscriptCard({ transcript, recordedAtIso }: Props) {
  const time = recordedAtIso ? formatTime(recordedAtIso) : null;
  return (
    <section
      className="rounded-3xl px-5 py-5"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--sage-pale) 60%, transparent), color-mix(in oklab, var(--sage-pale) 35%, transparent))',
        border: '0.5px solid color-mix(in oklab, var(--sage-pale) 70%, transparent)',
      }}
    >
      <p
        className="text-[10.5px] font-semibold uppercase tracking-wider mb-2"
        style={{
          color: 'color-mix(in oklab, var(--sage-deep) 90%, transparent)',
          letterSpacing: '0.08em',
        }}
      >
        From voice{time ? ` · ${time}` : ''}
      </p>
      <p
        className="font-display text-[17.5px] italic leading-relaxed text-foreground"
        style={{
          maskImage:
            'linear-gradient(180deg, transparent 0%, black 14%, black 86%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(180deg, transparent 0%, black 14%, black 86%, transparent 100%)',
        }}
      >
        “{transcript}”
      </p>
    </section>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}
