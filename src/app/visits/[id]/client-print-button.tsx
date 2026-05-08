'use client';

import { Printer } from 'lucide-react';

export function ClientPrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-5 py-3 text-sm font-medium active:scale-[0.98] transition"
    >
      <Printer size={15} />
      Print or save as PDF
    </button>
  );
}
