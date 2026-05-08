// Patient-details edit form. Replaces the "editing coming next; re-run
// onboarding" stub on /me. The fields here are not cosmetic:
// - cardiologist_phone wires the Call CTA on alerts (tel: link).
// - dry_weight_lb is the baseline for weight-trend rules.
// - normal_pillow_count is the orthopnea baseline (T2.4).
// - cardiologist_name shows in the alert card and the visit handoff.
// Wrong values here mean the engine misfires or the call fails; the
// caregiver has to be able to fix them.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { PatientEditForm } from './edit-form';

export default async function PatientEditPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: patient } = await supabase
    .from('patients')
    .select(
      'id, display_name, relationship, dry_weight_lb, nyha_class, cardiologist_name, cardiologist_phone, normal_pillow_count, date_of_birth',
    )
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!patient) notFound();

  return (
    <PhoneShell>
      <header className="px-6 pt-6 pb-2">
        <Link
          href="/me"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground active:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
          Me
        </Link>
        <p
          className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          style={{ letterSpacing: '0.08em' }}
        >
          {patient.relationship ?? 'Patient'} on file
        </p>
        <h1
          className="font-display text-[28px] text-foreground mt-1.5 leading-tight"
          style={{ letterSpacing: '-0.02em', fontWeight: 500 }}
        >
          {patient.display_name}&rsquo;s details
        </h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Wrong baselines here can make the engine misfire — keep these accurate.
        </p>
      </header>

      <PatientEditForm
        patientId={patient.id}
        initialDisplayName={patient.display_name}
        initialRelationship={patient.relationship ?? ''}
        initialDryWeightLb={patient.dry_weight_lb}
        initialNyhaClass={patient.nyha_class as 'I' | 'II' | 'III' | 'IV' | 'unknown' | null}
        initialCardiologistName={patient.cardiologist_name ?? ''}
        initialCardiologistPhone={patient.cardiologist_phone ?? ''}
        initialNormalPillowCount={patient.normal_pillow_count}
        initialDateOfBirth={patient.date_of_birth}
      />
    </PhoneShell>
  );
}
