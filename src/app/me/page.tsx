import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  User,
  LogOut,
  AlertCircle,
  TrendingUp,
  Pill,
  Users,
  CalendarHeart,
  ChevronRight,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { friendlyError } from '@/lib/auth/friendly-error';
import { signOut } from './actions';
import { DeleteAccountButton } from './delete-account-button';

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, timezone, onboarding_completed_at')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarding_completed_at) redirect('/onboarding');

  const { data: patient } = await supabase
    .from('patients')
    .select('display_name, relationship, dry_weight_lb, nyha_class, cardiologist_name, cardiologist_phone')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  return (
    <PhoneShell>
      <header className="px-6 pt-8">
        <p className="text-sm text-muted-foreground">Settings</p>
        <h1 className="font-display text-3xl text-foreground mt-1">Me</h1>
      </header>

      {error && (
        <div
          className="mt-4 mx-4 rounded-2xl p-4 flex gap-3 items-start"
          style={{
            background: 'var(--status-alert-soft)',
            color: 'var(--status-alert-foreground)',
          }}
        >
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <p className="text-sm leading-relaxed">{friendlyError(error)}</p>
        </div>
      )}

      <section className="mt-6 mx-4 rounded-3xl bg-card shadow-card p-6 animate-fade-up">
        <div className="flex items-center gap-4">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center"
            style={{
              background:
                'linear-gradient(135deg, var(--sage), color-mix(in oklab, var(--sage) 60%, white))',
              color: 'var(--primary-foreground)',
            }}
          >
            <User size={24} />
          </div>
          <div className="min-w-0">
            <p className="font-display text-xl truncate">{profile?.display_name ?? 'You'}</p>
            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>

        <dl className="mt-6 space-y-3 text-sm">
          <Row label="Time zone" value={profile?.timezone ?? '—'} />
        </dl>
      </section>

      {patient && (
        <section className="mt-4 mx-4 rounded-3xl bg-card shadow-card p-6">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
            {patient.relationship ?? 'Patient'} on file
          </p>
          <p className="font-display text-2xl">{patient.display_name}</p>
          <dl className="mt-4 space-y-3 text-sm">
            <Row
              label="Dry weight"
              value={patient.dry_weight_lb ? `${patient.dry_weight_lb} lb` : 'not set'}
            />
            <Row label="NYHA class" value={patient.nyha_class ?? 'unknown'} />
            <Row label="Cardiologist" value={patient.cardiologist_name ?? '—'} />
            <Row label="Cardiologist phone" value={patient.cardiologist_phone ?? '—'} />
          </dl>
          <p className="text-xs text-muted-foreground mt-4">
            Editing patient details is coming next; for now changes happen by re-running the
            onboarding wizard.
          </p>
        </section>
      )}

      <section className="mt-5 mx-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1.5 pb-2">
          Sections
        </p>
        <div className="rounded-3xl bg-card border border-border shadow-card overflow-hidden">
          <SectionLink href="/trends" icon={<TrendingUp size={18} />} label="Trends" sub="Last two weeks" />
          <SectionLink
            href="/me/medications"
            icon={<Pill size={18} />}
            label="Medications"
            sub="What's prescribed and when"
          />
          <SectionLink
            href="/visits"
            icon={<CalendarHeart size={18} />}
            label="Visit prep"
            sub="Bring this to cardiology"
          />
          <SectionLink
            href="/family"
            icon={<Users size={18} />}
            label="Family"
            sub="Share status with a sibling"
            isLast
          />
        </div>
      </section>

      <section className="mt-5 mx-4">
        <form action={signOut}>
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-medium border border-border bg-card"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </form>
      </section>

      <section className="mt-3 mx-4 pb-8">
        <DeleteAccountButton email={user.email ?? ''} />
      </section>
    </PhoneShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground text-right">{value}</dd>
    </div>
  );
}

function SectionLink({
  href,
  icon,
  label,
  sub,
  isLast = false,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  sub: string;
  isLast?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-5 py-3.5 active:bg-muted/40 transition-colors"
      style={{
        minHeight: 56,
        borderBottom: isLast
          ? 'none'
          : '0.5px solid color-mix(in oklab, var(--border) 80%, transparent)',
      }}
    >
      <span
        className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </div>
      <ChevronRight size={16} className="text-muted-foreground/50 shrink-0" />
    </Link>
  );
}
