// Fullscreen coral aura — fixed overlay on every PhoneShell page when
// today's assessment is tier-1 (911-territory). The visual reference is
// macOS Claude Desktop's "is using your computer" screen-edge glow:
// inward-radiating warmth that signals "the device is in a special
// state" without occluding content.
//
// CSS-only. Pointer-events off so it never blocks taps. aria-hidden so
// screen readers ignore it (the actionable copy already lives in
// HeroAlertCard / AlertChipBanner). Respects prefers-reduced-motion:
// reduce — static glow, no pulse.
//
// Server-component-rendered (no 'use client' needed — pure CSS markup),
// but the animation lives in globals.css under @keyframes
// pulse-alert-glow so the static markup stays trivial.

export function AlertGlow() {
  return (
    <div
      aria-hidden="true"
      data-alert-glow
      className="fixed inset-0 z-[60] pointer-events-none"
      style={{
        animation: 'pulse-alert-glow 3.4s ease-in-out infinite alternate',
        boxShadow:
          'inset 0 0 90px 18px color-mix(in oklab, var(--status-alert) 55%, transparent), inset 0 0 220px 60px color-mix(in oklab, var(--status-alert) 28%, transparent)',
      }}
    />
  );
}
