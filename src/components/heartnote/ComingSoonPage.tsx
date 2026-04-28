import Link from 'next/link';
import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { PhoneShell } from './PhoneShell';

export function ComingSoonPage({
  title,
  subtitle,
  icon: Icon,
  description,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  description: string;
}) {
  return (
    <PhoneShell>
      <header className="px-6 pt-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ChevronLeft size={16} />
          Home
        </Link>
        <h1 className="font-display text-3xl text-foreground mt-3">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </header>

      <section className="mt-8 mx-4 rounded-3xl bg-card shadow-card p-8 animate-fade-up">
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div
            className="h-16 w-16 rounded-2xl flex items-center justify-center"
            style={{
              background: 'var(--status-good-soft)',
              color: 'var(--status-good-foreground)',
            }}
            aria-hidden
          >
            <Icon size={28} />
          </div>
          <h2 className="font-display text-2xl">Coming next</h2>
          <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{description}</p>
        </div>
      </section>

      <div className="mx-4 mt-6 text-center">
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium border border-border bg-card"
        >
          Back to home
        </Link>
      </div>
    </PhoneShell>
  );
}
