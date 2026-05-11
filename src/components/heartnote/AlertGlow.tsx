// Screen-edge coral aura — fixed overlay on every PhoneShell page when
// today's assessment is tier-1 (911-territory). The visual reference is
// macOS Claude Desktop's "is using your computer" screen-edge glow:
// inward-radiating warmth that signals "the device is in a special
// state" without occluding content.
//
// Tuned to inch onto the screen — visible but not occlusive. Two layered
// insets: a 14px sharper edge inside a 44px softer outer fade. Together
// they read as a coral lip around the screen, leaving the center clear.
// Earlier version used 90px / 220px spreads which dominated the screen;
// the user wanted "very subtle, but noticeable."
//
// CSS-only. Pointer-events off so it never blocks taps. aria-hidden so
// screen readers ignore it (the actionable copy already lives in
// HeroAlertCard / AlertChipBanner). Respects prefers-reduced-motion:
// reduce — static glow, no pulse.

export function AlertGlow() {
  return (
    <div
      aria-hidden="true"
      data-alert-glow
      className="fixed inset-0 z-[60] pointer-events-none"
      style={{
        animation: 'pulse-alert-glow 3.4s ease-in-out infinite alternate',
        boxShadow:
          'inset 0 0 14px 0 color-mix(in oklab, var(--status-alert) 70%, transparent), inset 0 0 38px 6px color-mix(in oklab, var(--status-alert) 22%, transparent)',
      }}
    />
  );
}
