'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { defaultQuestionsForPatient } from '@/lib/visits/default-questions';

const VisitKindSchema = z.enum(['routine', 'follow_up', 'new_symptoms']);

const CreateVisitSchema = z.object({
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cardiologistName: z.string().max(120).optional().nullable(),
  visitKind: VisitKindSchema,
});

export async function createVisit(formData: FormData): Promise<void> {
  const parsed = CreateVisitSchema.safeParse({
    visitDate: formData.get('visit_date'),
    cardiologistName: formData.get('cardiologist_name')?.toString().trim() || null,
    visitKind: formData.get('visit_kind'),
  });
  if (!parsed.success) {
    redirect('/visits/new?error=invalid');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: patient } = await supabase
    .from('patients')
    .select('id, display_name, cardiologist_name')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!patient) redirect('/onboarding');

  const cardiologistName = parsed.data.cardiologistName ?? patient.cardiologist_name ?? null;
  const questions = defaultQuestionsForPatient(patient.display_name);

  const { data: insert, error } = await supabase
    .from('cardiology_visits')
    .insert({
      patient_id: patient.id,
      visit_date: parsed.data.visitDate,
      cardiologist_name: cardiologistName,
      visit_kind: parsed.data.visitKind,
      questions_to_ask: questions,
    })
    .select('id')
    .single();
  if (error || !insert) {
    redirect('/visits/new?error=save');
  }

  revalidatePath('/visits');
  redirect(`/visits/${insert.id}`);
}

const QuestionsSchema = z.object({
  visitId: z.string().uuid(),
  questions: z.array(z.string().max(800)).max(50),
});

export async function saveQuestions(input: {
  visitId: string;
  questions: string[];
}) {
  const parsed = QuestionsSchema.safeParse(input);
  if (!parsed.success) return { error: 'Could not save those questions.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in again.' };

  // RLS gates by patients.caregiver_id; the update will return 0 rows if
  // the caregiver doesn't own the patient.
  const cleaned = parsed.data.questions
    .map((q) => q.trim())
    .filter((q) => q.length > 0);

  const { error } = await supabase
    .from('cardiology_visits')
    .update({ questions_to_ask: cleaned })
    .eq('id', parsed.data.visitId);
  if (error) return { error: 'Could not save those questions.' };

  revalidatePath(`/visits/${parsed.data.visitId}`);
  return { ok: true };
}

const NotesSchema = z.object({
  visitId: z.string().uuid(),
  notes: z.string().max(8000),
});

export async function saveNotes(input: { visitId: string; notes: string }) {
  const parsed = NotesSchema.safeParse(input);
  if (!parsed.success) return { error: 'Could not save those notes.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in again.' };

  const { error } = await supabase
    .from('cardiology_visits')
    .update({ notes_after: parsed.data.notes.trim() || null })
    .eq('id', parsed.data.visitId);
  if (error) return { error: 'Could not save those notes.' };

  revalidatePath(`/visits/${parsed.data.visitId}`);
  return { ok: true };
}

const DeleteVisitSchema = z.object({
  visitId: z.string().uuid(),
  confirmedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function deleteVisit(input: { visitId: string; confirmedDate: string }) {
  const parsed = DeleteVisitSchema.safeParse(input);
  if (!parsed.success) return { error: 'Could not delete this visit.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sign in again.' };

  // Defense in depth — read the row first to confirm the typed date matches
  // the visit's actual date. RLS already restricts to caregiver-owned rows,
  // but we additionally require the caregiver to type the date verbatim
  // (per .claude/rules/destructive-actions.md), so a stale tab can't trigger
  // a delete on a visit the user can't see.
  const { data: row } = await supabase
    .from('cardiology_visits')
    .select('visit_date')
    .eq('id', parsed.data.visitId)
    .maybeSingle();
  if (!row || row.visit_date !== parsed.data.confirmedDate) {
    return { error: 'That date didn’t match the visit on record.' };
  }

  const { error } = await supabase
    .from('cardiology_visits')
    .delete()
    .eq('id', parsed.data.visitId);
  if (error) return { error: 'Could not delete this visit.' };

  revalidatePath('/visits');
  redirect('/visits');
}
