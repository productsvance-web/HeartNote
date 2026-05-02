import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Plus, Pill, Camera } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { MED_CLASS_LABEL } from '@/lib/medications/classes';

interface PageProps {
  searchParams: Promise<{ added?: string }>;
}

export default async function MedicationsPage({ searchParams }: PageProps) {
  const { added } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: patient } = await supabase
    .from('patients')
    .select('id, display_name')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!patient) redirect('/onboarding');

  // Postgres orders enums by declaration order; med_class declares
  // loop_diuretic first so this naturally surfaces the highest-signal CHF
  // class at the top. Reordering the enum reorders this list — change both
  // together (see src/lib/medications/classes.ts).
  const { data: meds } = await supabase
    .from('medications')
    .select('id, drug_name, drug_class, dose, doses_per_day, schedule_times, stopped_at')
    .eq('patient_id', patient.id)
    .order('drug_class', { ascending: true })
    .order('drug_name', { ascending: true });

  const active = (meds ?? []).filter((m) => m.stopped_at === null);
  const stopped = (meds ?? []).filter((m) => m.stopped_at !== null);

  return (
    <PhoneShell>
      <header className="px-6 pt-8">
        <Link href="/me" className="text-sm text-muted-foreground">
          ← Settings
        </Link>
        <h1 className="font-display text-3xl text-foreground mt-2">Medications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {patient.display_name}&rsquo;s active list. Voice-log mentions update this automatically.
        </p>
      </header>

      <section className="mt-6 mx-4 rounded-3xl bg-card shadow-card overflow-hidden">
        {active.length === 0 ? (
          <div className="p-6 text-center">
            <Pill size={28} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-foreground">No medications added yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add the meds {patient.display_name} takes so dose tracking can work.
            </p>
          </div>
        ) : (
          <ul>
            {active.map((m) => {
              const isJustAdded = added === m.id;
              return (
                <li key={m.id} className="border-b border-border last:border-0">
                  <Link
                    href={`/me/medications/${m.id}`}
                    className="flex items-start gap-3 p-4 active:bg-muted/40 transition"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">
                        {m.drug_name}
                        {m.dose ? ` · ${m.dose}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {m.doses_per_day === null ? 'as needed' : `${m.doses_per_day}× per day`}
                      </p>
                      {isJustAdded && (
                        <p className="text-xs mt-2 inline-block rounded-full bg-muted px-2.5 py-1 text-foreground">
                          Classed as {MED_CLASS_LABEL[m.drug_class]} — tap to change
                        </p>
                      )}
                    </div>
                    <ChevronRight size={18} className="text-muted-foreground mt-1 shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mx-4 mt-4 space-y-2">
        <Link
          href="/me/medications/new"
          className="w-full flex items-center justify-center gap-2 rounded-full px-6 py-4 text-sm font-semibold border border-border bg-card"
        >
          <Plus size={16} />
          Add medication
        </Link>
        <Link
          href="/me/medications/scan"
          className="w-full flex items-center justify-center gap-2 rounded-full px-6 py-3 text-xs font-medium text-muted-foreground"
        >
          <Camera size={14} />
          Scan a label
        </Link>
      </section>

      {stopped.length > 0 && (
        <details className="mx-4 mt-6 rounded-2xl bg-card/60 border border-border">
          <summary className="px-4 py-3 text-sm text-muted-foreground cursor-pointer">
            Past medications ({stopped.length})
          </summary>
          <ul className="border-t border-border">
            {stopped.map((m) => (
              <li key={m.id} className="border-b border-border last:border-0">
                <Link
                  href={`/me/medications/${m.id}`}
                  className="flex items-center gap-3 p-4 text-muted-foreground"
                >
                  <span className="flex-1 text-sm truncate">
                    {m.drug_name}
                    {m.dose ? ` · ${m.dose}` : ''}
                    <span className="ml-2 text-xs">stopped {m.stopped_at}</span>
                  </span>
                  <ChevronRight size={16} />
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </PhoneShell>
  );
}
