import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, onboarding_completed_at')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarding_completed_at) redirect('/onboarding');

  const { data: patient } = await supabase
    .from('patients')
    .select('display_name, relationship, dry_weight_lb, nyha_class')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  return (
    <main className="min-h-screen bg-background px-6 py-8 max-w-md mx-auto">
      <header className="space-y-1 mb-8">
        <p className="text-sm text-muted-foreground">Welcome back, {profile?.display_name ?? 'there'}.</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {patient?.display_name ?? 'Your patient'} today
        </h1>
      </header>

      <section className="rounded-2xl border border-border bg-card p-6 space-y-3">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-emerald-500" aria-hidden />
          <p className="font-medium">Green zone</p>
        </div>
        <p className="text-sm text-muted-foreground">
          No alerts. No log yet today. Tap below to record a 30-second check-in.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <button
          type="button"
          disabled
          className="w-full rounded-2xl bg-foreground text-background px-6 py-5 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Daily voice log — coming next
        </button>
        <p className="text-xs text-muted-foreground text-center">
          The voice log, AI trend detection, alerts, visit reports, and family share unlock as we build them.
        </p>
      </section>

      {patient?.dry_weight_lb && (
        <section className="mt-10 text-xs text-muted-foreground">
          <p>
            Baselines on file: dry weight {patient.dry_weight_lb} lb · NYHA {patient.nyha_class}
            {patient.relationship ? ` · cared for as ${patient.relationship}` : ''}.
          </p>
        </section>
      )}
    </main>
  );
}
