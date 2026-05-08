// Page header / footer / first-page watermark for the visit-handoff PDF.
//
// All three render in print-safe black/white/gray (see colors.ts) and lean on
// the typography pairings declared in typography.ts. Layout is the band
// described in the plan: three columns top, three columns bottom.
//
// Font registration is the document loader's responsibility; this module
// only consumes registered families.

import { Text, View } from '@react-pdf/renderer';
import { PDF_COLORS } from './colors';
import { PDF_TEXT } from './typography';

interface PageHeaderProps {
  patientDisplayName: string;
  patientDateOfBirth: string | null;
  caregiverFirstName: string;
  generatedAt: Date;
}

export function PageHeader({
  patientDisplayName,
  patientDateOfBirth,
  caregiverFirstName,
  generatedAt,
}: PageHeaderProps) {
  return (
    <View
      fixed
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingBottom: 8,
        marginBottom: 14,
        borderBottomWidth: 0.5,
        borderBottomColor: PDF_COLORS.faint,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ ...PDF_TEXT.wordmark, color: PDF_COLORS.ink }}>HeartNote</Text>
      </View>

      <View style={{ flex: 2, alignItems: 'center' }}>
        <Text style={{ ...PDF_TEXT.patientName, color: PDF_COLORS.ink }}>
          {formatPatientName(patientDisplayName)}
        </Text>
        <Text style={{ ...PDF_TEXT.patientLine, color: PDF_COLORS.ink, marginTop: 2 }}>
          {formatBornLine(patientDateOfBirth)}
        </Text>
        <Text style={{ ...PDF_TEXT.patientLine, color: PDF_COLORS.ink, marginTop: 1 }}>
          Caregiver: {caregiverFirstName}
        </Text>
      </View>

      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text style={{ ...PDF_TEXT.generationStamp, color: PDF_COLORS.muted }}>
          {formatGenerationStamp(generatedAt)}
        </Text>
      </View>
    </View>
  );
}

interface PageFooterProps {
  patientFirstName: string;
  visitDateLabel: string;
}

export function PageFooter({ patientFirstName, visitDateLabel }: PageFooterProps) {
  return (
    <View
      fixed
      style={{
        position: 'absolute',
        left: 36,
        right: 36,
        bottom: 24,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 6,
        borderTopWidth: 0.5,
        borderTopColor: PDF_COLORS.faint,
      }}
    >
      <Text
        fixed
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
        style={{ ...PDF_TEXT.pageNumber, color: PDF_COLORS.muted, flex: 1 }}
      />
      <Text
        style={{
          ...PDF_TEXT.disclaimer,
          color: PDF_COLORS.muted,
          flex: 3,
          textAlign: 'center',
        }}
      >
        Not a medical record. Decision support only. Confirm thresholds with the
        prescribing cardiologist.
      </Text>
      <Text
        style={{
          ...PDF_TEXT.runner,
          color: PDF_COLORS.muted,
          flex: 1,
          textAlign: 'right',
        }}
      >
        {patientFirstName} · {visitDateLabel}
      </Text>
    </View>
  );
}

// Page-1-only diagonal watermark per the user's directive: gives the cardiologist
// an instant cue this is decision support, not an EHR record. 8% opacity keeps
// it from competing with body text for attention or photocopy contrast.
export function FirstPageWatermark() {
  return (
    <View
      style={{
        position: 'absolute',
        top: '38%',
        left: 0,
        right: 0,
        alignItems: 'center',
        opacity: 0.08,
        transform: 'rotate(-28deg)',
      }}
    >
      <Text style={{ ...PDF_TEXT.watermark, color: PDF_COLORS.ink }}>
        DECISION SUPPORT — NOT A MEDICAL RECORD
      </Text>
    </View>
  );
}

// "Sarah Chen" → "Sarah C." | "Mom" → "Mom."
// Logic mirrors the AC: single-word display_name renders without last initial.
function formatPatientName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? displayName.trim();
  const second = parts[1];
  if (!second) return `${first}.`;
  return `${first} ${second.charAt(0).toUpperCase()}.`;
}

// "Born 1958-03-14 · 68 years" | "Born — · — years" if dob unset.
// ISO format matches MyChart/EHR conventions cardiologists already read.
function formatBornLine(dob: string | null): string {
  if (!dob) return 'Born — · — years';
  return `Born ${dob} · ${computeAge(dob)} years`;
}

function computeAge(dob: string): number {
  // dob is YYYY-MM-DD; constructed in local TZ for stable wall-clock math.
  const [y, m, d] = dob.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const dobDate = new Date(y, m - 1, d);
  const today = new Date();
  let age = today.getFullYear() - dobDate.getFullYear();
  const monthDiff = today.getMonth() - dobDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) {
    age -= 1;
  }
  return age;
}

function formatGenerationStamp(d: Date): string {
  const date = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  const tz =
    new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
      .formatToParts(d)
      .find((p) => p.type === 'timeZoneName')?.value ?? '';
  return `Generated ${date} ${time} ${tz}`.trim();
}
