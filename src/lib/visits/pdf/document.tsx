// Visit-handoff PDF — root document.
//
// US Letter, 0.5in margins on all sides. Page 1 carries the watermark plus
// the highest-priority sections (visit context, what-changed, weight chart,
// symptom timeline). Subsequent pages carry the longer-form sections (meds,
// adherence, questions, notes). @react-pdf paginates automatically when the
// content overflows.

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { Database } from '@/lib/supabase/types';
import { loadVisitHandoffData, type VisitHandoffData } from './index';
import { loadAdherenceForWindow, type AdherenceWindow } from './adherence';
import { registerPdfFonts } from './typography';
import { PDF_COLORS } from './colors';
import { PDF_TEXT } from './typography';
import { PageHeader, PageFooter, FirstPageWatermark } from './header';
import { WhatChangedCallout } from './what-changed';
import { WeightChart } from './weight-chart';
import { SymptomTimeline } from './symptom-timeline';
import { MedsTable } from './meds-table';
import { AdherenceStrip } from './adherence-strip';
import { QuestionsSection } from './questions';
import { NotesSection } from './notes';

const PAGE_PADDING = 36; // 0.5in
const PAGE_BOTTOM_PADDING = 50; // leave room for the fixed footer

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_PADDING,
    paddingHorizontal: PAGE_PADDING,
    paddingBottom: PAGE_BOTTOM_PADDING,
    fontFamily: 'Inter',
    color: PDF_COLORS.ink,
    backgroundColor: PDF_COLORS.paper,
  },
});

interface Props {
  data: VisitHandoffData;
  adherence: AdherenceWindow;
  generatedAt: Date;
}

export function HandoffDocument({ data, adherence, generatedAt }: Props) {
  const visitDateLabel = formatLongDate(data.visit.visitDate);
  const patientFirstName = firstWord(data.patient.displayName) || 'patient';

  return (
    <Document
      title={`HeartNote handoff · ${data.patient.displayName} · ${data.visit.visitDate}`}
      author="HeartNote"
      subject="Cardiology visit handoff"
    >
      {/* Page 1: highest-priority. */}
      <Page size="LETTER" style={styles.page}>
        <FirstPageWatermark />

        <PageHeader
          patientDisplayName={data.patient.displayName}
          patientDateOfBirth={data.patient.dateOfBirth}
          caregiverFirstName={data.caregiver.firstName}
          generatedAt={generatedAt}
        />

        <VisitContextBand
          visitDateLabel={visitDateLabel}
          visitKind={data.visit.visitKind}
          cardiologistName={data.visit.cardiologistName}
        />

        <WhatChangedCallout triggersInWindow={data.triggersInWindow} />

        <WeightChart
          weightSeries={data.weightSeries}
          dryWeightLb={data.patient.dryWeightLb}
          windowStart={data.windowStart}
          windowEnd={data.windowEnd}
        />

        <SymptomTimeline
          symptomEvents={data.symptomEvents}
          pillowReadings={data.pillowReadings}
          normalPillowCount={data.patient.normalPillowCount}
          windowStart={data.windowStart}
          windowEnd={data.windowEnd}
          patientFirstName={patientFirstName}
        />

        <PageFooter patientFirstName={patientFirstName} visitDateLabel={visitDateLabel} />
      </Page>

      {/* Page 2: meds, adherence, questions, notes. */}
      <Page size="LETTER" style={styles.page}>
        <PageHeader
          patientDisplayName={data.patient.displayName}
          patientDateOfBirth={data.patient.dateOfBirth}
          caregiverFirstName={data.caregiver.firstName}
          generatedAt={generatedAt}
        />

        <MedsTable meds={data.activeMedications} />
        <AdherenceStrip meds={data.activeMedications} adherence={adherence} />
        <QuestionsSection questions={data.visit.questionsToAsk} />
        {data.visit.notesAfter ? (
          <NotesSection notes={data.visit.notesAfter} visitDateLabel={visitDateLabel} />
        ) : null}

        <PageFooter patientFirstName={patientFirstName} visitDateLabel={visitDateLabel} />
      </Page>
    </Document>
  );
}

function VisitContextBand({
  visitDateLabel,
  visitKind,
  cardiologistName,
}: {
  visitDateLabel: string;
  visitKind: string | null;
  cardiologistName: string | null;
}) {
  return (
    <View style={{ alignItems: 'center', marginTop: 6, marginBottom: 4 }}>
      <Text style={{ ...PDF_TEXT.visitTitle, color: PDF_COLORS.ink }}>
        Cardiology visit · {visitDateLabel}
      </Text>
      <Text style={{ ...PDF_TEXT.visitSubtitle, color: PDF_COLORS.muted, marginTop: 4 }}>
        Visit kind: {prettyVisitKind(visitKind)} · Cardiologist:{' '}
        {cardiologistName ?? 'not on file'}
      </Text>
    </View>
  );
}

function prettyVisitKind(kind: string | null): string {
  if (kind === 'follow_up') return 'Follow-up';
  if (kind === 'new_symptoms') return 'New symptoms';
  if (kind === 'routine') return 'Routine';
  return 'Visit';
}

function firstWord(s: string | null | undefined): string {
  if (!s) return '';
  return s.trim().split(/\s+/)[0] ?? '';
}

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
}

// Top-level entry: load every slice this PDF needs, register fonts, render.
// The API route calls this once per download click; no caching layer in v0.
export async function renderVisitHandoffPDF(
  supabase: SupabaseClient<Database>,
  visitId: string,
  tz: string,
): Promise<{ buffer: Buffer; data: VisitHandoffData } | null> {
  const data = await loadVisitHandoffData(supabase, visitId);
  if (!data) return null;

  const adherence = await loadAdherenceForWindow(
    supabase,
    data.patient.id,
    data.visit.visitDate,
    tz,
  );

  registerPdfFonts();

  const buffer = await renderToBuffer(
    <HandoffDocument data={data} adherence={adherence} generatedAt={new Date()} />,
  );

  return { buffer, data };
}
