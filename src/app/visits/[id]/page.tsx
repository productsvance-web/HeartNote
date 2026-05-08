import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { VisitHandoff } from '@/components/heartnote/VisitHandoff';
import { generateVisitHandoff } from '@/lib/visits/generate-handoff';
import { defaultQuestionsForPatient } from '@/lib/visits/default-questions';
import { VisitQuestionsEditor } from './visit-questions-editor';
import { VisitNotesEditor } from './visit-notes-editor';
import { VisitDeleteButton } from './visit-delete-button';
import { ClientPrintButton } from './client-print-button';

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, onboarding_completed_at, timezone')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarding_completed_at) redirect('/onboarding');

  const { data: patient } = await supabase
    .from('patients')
    .select('id, display_name')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!patient) redirect('/onboarding');

  const { data: visit } = await supabase
    .from('cardiology_visits')
    .select('id, patient_id, visit_date, cardiologist_name, visit_kind, questions_to_ask, notes_after')
    .eq('id', id)
    .eq('patient_id', patient.id)
    .maybeSingle();

  if (!visit) notFound();

  const today = getTodayInTimezone(profile.timezone);
  // Today counts as "past" for the notes affordance — the appointment may
  // have already happened this morning, and the caregiver wants to capture
  // what the cardiologist said before the day blurs.
  const isPast = visit.visit_date <= today;

  // Pull the live handoff from real DB rows. We deliberately don't cache
  // `generated_report` for v0 — caregivers always see current data; we can
  // add a "snapshot at time of visit" later if a real use case appears.
  let handoff = null;
  let handoffError = false;
  try {
    handoff = await generateVisitHandoff(supabase, patient.id, today);
  } catch {
    handoffError = true;
  }

  const questions =
    Array.isArray(visit.questions_to_ask) && visit.questions_to_ask.length > 0
      ? (visit.questions_to_ask as string[])
      : defaultQuestionsForPatient(patient.display_name);

  return (
    <PhoneShell>
      <header className="px-6 pt-8 print:pt-2">
        <Link
          href="/visits"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground print:hidden"
        >
          <ChevronLeft size={16} />
          Visits
        </Link>
        <h1
          className="font-display text-[28px] text-foreground mt-3 leading-tight"
          style={{ letterSpacing: '-0.02em' }}
        >
          {prettyDate(visit.visit_date)} · {prettyVisitKind(visit.visit_kind)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          {visit.cardiologist_name ?? 'Cardiology'} · for {patient.display_name ?? 'mom'}
        </p>
      </header>

      {handoffError ? (
        <section className="mx-4 mt-5 rounded-3xl bg-card border border-border shadow-card p-5">
          <p className="text-sm text-muted-foreground">
            This data isn&rsquo;t loading right now. Try again in a moment.
          </p>
        </section>
      ) : handoff ? (
        <VisitHandoff
          data={handoff}
          patientName={patient.display_name ?? 'mom'}
          visitDate={visit.visit_date}
          visitKind={prettyVisitKind(visit.visit_kind)}
          cardiologistName={visit.cardiologist_name}
        />
      ) : null}

      <VisitQuestionsEditor visitId={visit.id} initialQuestions={questions} />

      {isPast && (
        <VisitNotesEditor visitId={visit.id} initialNotes={visit.notes_after} />
      )}

      <section className="mx-4 mt-4 mb-3 print:hidden">
        <ClientPrintButton />
      </section>

      <section className="mx-4 mb-6 flex justify-end print:hidden">
        <VisitDeleteButton
          visitId={visit.id}
          visitDate={visit.visit_date}
          visitDateLabel={prettyDate(visit.visit_date)}
        />
      </section>

      <style>{`
        @media print {
          nav[data-bottom-nav] { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </PhoneShell>
  );
}

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function prettyDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function prettyVisitKind(kind: string | null): string {
  if (kind === 'follow_up') return 'Follow-up';
  if (kind === 'new_symptoms') return 'New symptoms';
  if (kind === 'routine') return 'Routine';
  return 'Visit';
}

