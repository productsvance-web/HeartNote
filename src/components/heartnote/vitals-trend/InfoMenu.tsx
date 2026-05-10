// Floating "i" utility button + small dropdown menu. Same canonical
// register #6 as the "+" button (translucent cream + backdrop blur).
// Menu pops up ABOVE the button, anchored bottom-left of the menu to
// the i button. Clicking a menu item or the backdrop closes it.

'use client';

import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

interface MenuItem {
  label: string;
  onSelect: () => void;
}

interface Props {
  items: MenuItem[];
}

export function InfoMenu({ items }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click. Pointer events instead of mousedown to
  // cover touch + mouse + pen.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    return () => window.removeEventListener('pointerdown', onPointer);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative pointer-events-auto">
      {open && (
        <div
          role="menu"
          aria-label="Weight options"
          className="absolute"
          style={{
            bottom: 56,
            left: 0,
            minWidth: 180,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            boxShadow: '0 10px 30px rgba(28, 28, 28, 0.18)',
            padding: 6,
            zIndex: 40,
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="w-full text-left rounded-lg active:bg-muted transition"
              style={{
                padding: '10px 12px',
                fontSize: 14,
                color: 'var(--foreground)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        aria-label="Weight options"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-full active:scale-95 transition"
        style={{
          width: 46,
          height: 46,
          background: 'rgba(251, 247, 240, 0.55)',
          border: '1px solid color-mix(in oklab, #3D332A 22%, transparent)',
          color: '#6B5E52',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <Info size={20} strokeWidth={1.6} />
      </button>
    </div>
  );
}
