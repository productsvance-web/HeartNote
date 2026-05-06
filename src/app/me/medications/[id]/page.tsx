import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { MedicationForm } from '../medications-form';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditMedicationPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: patient } = await supabase
    .from('patients')
    .select('id')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!patient) redirect('/onboarding');

  const { data: med } = await supabase
    .from('medications')
    .select(
      'id, drug_name, drug_class, dose, started_at, ended_at, notes, stopped_at, allowed_strengths, cadence_kind, cycle_on_days, cycle_off_days, interval_days, form'
    )
    .eq('id', id)
    .eq('patient_id', patient.id)
    .single();

  if (!med) notFound();

  const { data: doseTimes } = await supabase
    .from('medication_dose_times')
    .select('time_of_day, quantity, ordinal, applies_to_dow')
    .eq('medication_id', id)
    .order('ordinal', { ascending: true });

  return (
    <PhoneShell>
      <header className="px-6 pt-8">
        <Link href="/me/medications" className="text-sm text-muted-foreground">
          ← Medications
        </Link>
        <h1 className="font-display text-3xl text-foreground mt-2">{med.drug_name}</h1>
        {med.stopped_at && (
          <p className="text-xs text-muted-foreground mt-1">Stopped {med.stopped_at}</p>
        )}
      </header>

      <section className="mt-6 mx-4 rounded-3xl bg-card shadow-card p-6">
        <MedicationForm
          mode="edit"
          medicationId={med.id}
          initial={{
            drugName: med.drug_name,
            dose: med.dose ?? '',
            cadenceKind: med.cadence_kind as never,
            cycleOnDays: med.cycle_on_days,
            cycleOffDays: med.cycle_off_days,
            intervalDays: med.interval_days,
            startedAt: med.started_at ?? '',
            endedAt: med.ended_at ?? '',
            notes: med.notes ?? '',
            isStopped: med.stopped_at !== null,
            allowedStrengths: med.allowed_strengths as never,
            form: med.form,
            doseTimes: (doseTimes ?? []).map((d) => ({
              timeOfDay: d.time_of_day,
              quantity: Number(d.quantity),
              appliesToDow: d.applies_to_dow,
            })),
          }}
        />
      </section>
    </PhoneShell>
  );
}
