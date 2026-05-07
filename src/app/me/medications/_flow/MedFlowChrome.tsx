'use client';

import { ChevronLeft, X } from 'lucide-react';

// Shared chrome used by every step in the unified medication flow. Mirrors
// Apple Health's pattern: drug name centered, prior selections appended as
// a subtitle line, back chevron at the left corner, X close at the right
// corner. A primary action button anchors the bottom; children render the
// step-specific body in between.
//
// `title` is the drug name; `subtitle` is the appended selections line
// (e.g., "Tablet, 40 mg") that grows as the user advances through steps.
// Pass `subtitle = null` to omit the line entirely (Search step).

interface Props {
  title: string;
  subtitle: string | null;
  onBack: (() => void) | null;
  onClose: () => void;
  primaryLabel: string;
  primaryDisabled?: boolean;
  onPrimary: () => void;
  // Optional secondary action below primary (e.g., "Skip — save without a
  // schedule" on Schedule step from a multi-med scan).
  secondaryLabel?: string;
  onSecondary?: () => void;
  children: React.ReactNode;
}

export function MedFlowChrome({
  title,
  subtitle,
  onBack,
  onClose,
  primaryLabel,
  primaryDisabled,
  onPrimary,
  secondaryLabel,
  onSecondary,
  children,
}: Props) {
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="grid grid-cols-[auto_1fr_auto] items-start gap-3 px-4 pt-6 pb-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 text-foreground"
          >
            <ChevronLeft size={20} />
          </button>
        ) : (
          <span className="h-9 w-9" aria-hidden="true" />
        )}
        <div className="text-center pt-1">
          <p className="text-base font-semibold text-foreground leading-tight">{title}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground leading-tight mt-0.5">{subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 text-foreground"
        >
          <X size={18} />
        </button>
      </header>

      <main className="flex-1 px-6 pb-6">{children}</main>

      <footer className="px-6 pb-8 pt-2 space-y-2">
        <button
          type="button"
          onClick={onPrimary}
          disabled={primaryDisabled}
          className="w-full rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold disabled:opacity-50"
        >
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            className="w-full text-center text-xs text-muted-foreground underline"
          >
            {secondaryLabel}
          </button>
        )}
      </footer>
    </div>
  );
}
