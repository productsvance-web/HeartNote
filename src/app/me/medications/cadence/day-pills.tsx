'use client';

import { DOW_BY_INDEX } from '@/lib/medications/cadence';

interface Props {
  bitmap: number;
  // Bits claimed by other groups (these pills render disabled).
  claimedByOthers: number;
  onChange: (next: number) => void;
}

export function DayPills({ bitmap, claimedByOthers, onChange }: Props) {
  return (
    <div className="flex gap-1.5" role="group" aria-label="Days of week">
      {DOW_BY_INDEX.map((dow) => {
        const isOn = (bitmap & dow.bit) !== 0;
        const isClaimed = (claimedByOthers & dow.bit) !== 0;
        const disabled = isClaimed && !isOn;
        return (
          <button
            key={dow.long}
            type="button"
            onClick={() => {
              if (disabled) return;
              onChange(isOn ? bitmap & ~dow.bit : bitmap | dow.bit);
            }}
            disabled={disabled}
            aria-pressed={isOn}
            aria-label={dow.long}
            className={`flex-1 h-10 rounded-full text-xs font-semibold transition-colors ${
              isOn
                ? 'bg-foreground text-background'
                : disabled
                  ? 'bg-muted/30 text-muted-foreground/40'
                  : 'bg-muted/60 text-foreground'
            }`}
          >
            {dow.short}
          </button>
        );
      })}
    </div>
  );
}
