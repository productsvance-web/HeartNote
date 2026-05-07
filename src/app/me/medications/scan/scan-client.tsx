'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import {
  Camera as CameraIcon,
  Image as ImageIcon,
  AlertTriangle,
} from 'lucide-react';
import type { ResolvedMed } from '@/lib/medications/scan/schema';
import {
  addExtractedMedications,
  type MedicationPayload,
} from '../actions';
import { extractedMedToPayload, toTitleCase } from './extracted-to-payload';
import { normalizeForm } from '@/lib/medications/rxnorm';
import {
  rescheduleAll,
  requestNotificationPermission,
  checkPermissionState,
} from '@/lib/medications/notifications';
import { ScanMedicationFlow } from '../_flow/ScanMedicationFlow';

// Compresses an image data URL down to ~800KB at max 1280px on the long
// edge, JPEG quality 0.8.
async function compressImage(srcDataUrl: string): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image load failed'));
    img.src = srcDataUrl;
  });
  const MAX_EDGE = 1280;
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.8);
}

type State =
  | { kind: 'capture' }
  | { kind: 'preview'; dataUrl: string }
  | { kind: 'processing' }
  | {
      kind: 'review';
      medications: ResolvedMed[];
      totalAtScan: number;
      addAllSummary: string | null;
      truncated: boolean;
    }
  | { kind: 'empty' }
  | { kind: 'safety' }
  | { kind: 'error'; message: string };

export function ScanClient() {
  const [state, setState] = useState<State>({ kind: 'capture' });
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [addAllPending, setAddAllPending] = useState(false);
  // True while the head card is being scheduled — shows the
  // ScanMedicationFlow overlay instead of the head's summary.
  const [schedulingHead, setSchedulingHead] = useState(false);
  const searchParams = useSearchParams();
  const autoTriggeredRef = useRef(false);

  useEffect(() => {
    if (autoTriggeredRef.current) return;
    const source = searchParams.get('source');
    if (source === 'camera') {
      autoTriggeredRef.current = true;
      void pickImage(CameraSource.Camera);
    } else if (source === 'photos') {
      autoTriggeredRef.current = true;
      void pickImage(CameraSource.Photos);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickImage(source: CameraSource) {
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source,
        quality: 90,
      });
      if (!photo.dataUrl) {
        setState({ kind: 'error', message: 'No image returned. Try again.' });
        return;
      }
      setState({ kind: 'preview', dataUrl: photo.dataUrl });
    } catch (err) {
      const errName = err instanceof Error ? err.name : '';
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      if (
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        message.includes('permission') ||
        message.includes('denied')
      ) {
        setPermissionDenied(true);
      } else if (!message.includes('cancel')) {
        setState({ kind: 'error', message: 'Could not open camera. Try again.' });
      }
    }
  }

  async function submitImage(dataUrl: string) {
    setState({ kind: 'processing' });
    try {
      const compressed = await compressImage(dataUrl);
      const resp = await fetch('/api/medications/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: compressed }),
      });
      if (resp.status === 422) {
        setState({ kind: 'safety' });
        return;
      }
      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as { error?: string } | null;
        setState({
          kind: 'error',
          message: data?.error ?? "Couldn't reach the server — try again.",
        });
        return;
      }
      const data = (await resp.json()) as {
        medications: ResolvedMed[];
        truncated?: boolean;
      };
      if (data.medications.length === 0) {
        setState({ kind: 'empty' });
        return;
      }
      setState({
        kind: 'review',
        medications: data.medications,
        totalAtScan: data.medications.length,
        addAllSummary: null,
        truncated: !!data.truncated,
      });
    } catch {
      setState({
        kind: 'error',
        message: "Couldn't reach the server — try again.",
      });
    }
  }

  function reset() {
    setState({ kind: 'capture' });
  }

  function advanceHead() {
    setSchedulingHead(false);
    setState((s) => {
      if (s.kind !== 'review') return s;
      const next = s.medications.slice(1);
      if (next.length === 0) return { kind: 'capture' };
      return { ...s, medications: next };
    });
  }

  async function saveHead(
    payload: MedicationPayload,
    cadenceKind: MedicationPayload['cadenceKind']
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    let result: Awaited<ReturnType<typeof addExtractedMedications>>;
    try {
      result = await addExtractedMedications([payload]);
    } catch (err) {
      console.error('saveHead threw', err);
      const detail = err instanceof Error ? err.message : 'unknown error';
      return { ok: false, error: `Could not save schedule: ${detail}` };
    }
    if (result.failedIndexes.length === 0) {
      if (cadenceKind !== 'as_needed') {
        const ps = await checkPermissionState();
        if (ps === 'prompt' || ps === 'prompt-with-rationale') {
          await requestNotificationPermission();
        }
      }
      void rescheduleAll();
      advanceHead();
      return { ok: true };
    }
    return { ok: false, error: result.errors[0] ?? 'Could not save.' };
  }

  async function addAll() {
    if (state.kind !== 'review' || addAllPending) return;
    // Dose-change cards never participate in Add all per build conv #6.
    const candidatePayloads: MedicationPayload[] = [];
    const candidateOrigIndexes: number[] = [];
    state.medications.forEach((med, i) => {
      if (med.is_dose_change) return;
      candidatePayloads.push(extractedMedToPayload(med));
      candidateOrigIndexes.push(i);
    });
    if (candidatePayloads.length === 0) return;
    setAddAllPending(true);
    try {
      const result = await addExtractedMedications(candidatePayloads);
      setState((s) => {
        if (s.kind !== 'review') return s;
        const failedOrigIndexes = new Set(
          result.failedIndexes.map((i) => candidateOrigIndexes[i])
        );
        const next = s.medications.filter(
          (med, i) => med.is_dose_change || failedOrigIndexes.has(i)
        );
        const summary =
          result.failedIndexes.length === 0
            ? `${result.added} added. Set reminder times in Medications when ready.`
            : `${result.added} added, ${result.failedIndexes.length} need a fix.`;
        if (next.length === 0) {
          return { kind: 'capture' };
        }
        return {
          kind: 'review',
          medications: next,
          totalAtScan: s.totalAtScan,
          addAllSummary: summary,
          truncated: s.truncated,
        };
      });
    } finally {
      setAddAllPending(false);
    }
  }

  if (state.kind === 'capture') {
    return (
      <section className="mt-6 mx-4 rounded-3xl bg-card shadow-card p-6 space-y-3">
        {permissionDenied && (
          <p className="text-xs text-muted-foreground bg-muted/60 rounded-lg px-3 py-2">
            HeartNote needs camera access to scan labels. Use Upload instead.
          </p>
        )}
        {!permissionDenied && (
          <button
            type="button"
            onClick={() => pickImage(CameraSource.Camera)}
            className="w-full flex items-center justify-center gap-2 rounded-full bg-foreground text-background px-6 py-4 text-sm font-semibold"
          >
            <CameraIcon size={16} />
            Take photo
          </button>
        )}
        <button
          type="button"
          onClick={() => pickImage(CameraSource.Photos)}
          className="w-full flex items-center justify-center gap-2 rounded-full border border-border bg-card px-6 py-4 text-sm font-semibold"
        >
          <ImageIcon size={16} />
          Upload image
        </button>
      </section>
    );
  }

  if (state.kind === 'preview') {
    return (
      <section className="mt-6 mx-4 space-y-3">
        <div className="rounded-3xl bg-card shadow-card overflow-hidden">
          {/* In-memory data URL preview — next/image can't optimize a base64
              dataUrl. Plain <img> is correct. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.dataUrl}
            alt="captured medication label"
            className="w-full max-h-[60vh] object-contain bg-muted"
          />
        </div>
        <button
          type="button"
          onClick={() => submitImage(state.dataUrl)}
          className="w-full rounded-full bg-foreground text-background px-6 py-4 text-sm font-semibold"
        >
          Use this photo
        </button>
        <button
          type="button"
          onClick={reset}
          className="w-full rounded-full border border-border bg-card px-6 py-3 text-sm font-medium"
        >
          Take another
        </button>
      </section>
    );
  }

  if (state.kind === 'processing') {
    return (
      <section className="mt-6 mx-4 rounded-3xl bg-card shadow-card p-8 text-center">
        <p className="text-sm text-foreground">Reading the label…</p>
        <p className="text-xs text-muted-foreground mt-1">A few seconds.</p>
      </section>
    );
  }

  if (state.kind === 'empty') {
    return (
      <section className="mt-6 mx-4 rounded-3xl bg-card shadow-card p-6 text-center">
        <p className="text-sm text-foreground">No medications detected.</p>
        <p className="text-xs text-muted-foreground mt-1">Try a clearer photo.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold"
        >
          Take another
        </button>
      </section>
    );
  }

  if (state.kind === 'safety') {
    return (
      <section className="mt-6 mx-4 rounded-3xl bg-card shadow-card p-6 text-center">
        <AlertTriangle size={20} className="mx-auto text-muted-foreground" />
        <p className="text-sm text-foreground mt-2">
          We couldn&rsquo;t process this image. Try another.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold"
        >
          Take another
        </button>
      </section>
    );
  }

  if (state.kind === 'error') {
    return (
      <section className="mt-6 mx-4 rounded-3xl bg-card shadow-card p-6 text-center">
        <p className="text-sm text-foreground">{state.message}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-full bg-foreground text-background px-6 py-3 text-sm font-semibold"
        >
          Try again
        </button>
      </section>
    );
  }

  // Review state — sequential, one med at a time.
  const headMed = state.medications[0];
  const position = state.totalAtScan - state.medications.length + 1;
  const allRemainingAreDoseChange = state.medications.every((m) => m.is_dose_change);

  // When the caregiver tapped Set schedule on the head, render the unified
  // flow full-bleed for that one med. Multi-card chrome (Add all, etc.)
  // is intentionally hidden during scheduling so the focus is on this med.
  if (schedulingHead && !headMed.is_dose_change) {
    return (
      <ScanMedicationFlow
        med={headMed}
        onSave={saveHead}
        onCancel={() => setSchedulingHead(false)}
        allowSkip={state.medications.length > 1}
      />
    );
  }

  return (
    <section className="mt-6 mx-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {state.totalAtScan} medication
          {state.totalAtScan === 1 ? '' : 's'} detected.
        </p>
        {state.addAllSummary && (
          <p className="text-xs font-semibold text-foreground">{state.addAllSummary}</p>
        )}
      </div>

      {state.truncated && (
        <p className="text-xs text-muted-foreground bg-muted/60 rounded-lg px-3 py-2">
          Showing the first 30 medications. Re-scan with a tighter crop if needed.
        </p>
      )}

      {state.medications.length > 1 && !allRemainingAreDoseChange && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addAll}
            disabled={addAllPending}
            className="flex-1 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-medium disabled:opacity-50"
          >
            {addAllPending
              ? 'Adding…'
              : `Add all ${state.medications.filter((m) => !m.is_dose_change).length}`}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={addAllPending}
            className="flex-1 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-medium disabled:opacity-50"
          >
            Take another
          </button>
        </div>
      )}

      {headMed.is_dose_change ? (
        <DoseChangeNotice
          drugName={headMed.drug_name}
          onSkip={advanceHead}
          position={state.totalAtScan > 1 ? position : null}
          totalCount={state.totalAtScan}
        />
      ) : (
        <PendingMedSummary
          med={headMed}
          onSetSchedule={() => setSchedulingHead(true)}
          onSkip={advanceHead}
          disabled={addAllPending}
          position={state.totalAtScan > 1 ? position : null}
          totalCount={state.totalAtScan}
        />
      )}

      <p className="text-xs text-muted-foreground text-center pt-2">
        Tapped Back too soon? Scan again from the list.
      </p>
    </section>
  );
}

// Per-med entry card for the multi-card scan view. Shows the OCR'd drug
// name + resolved strength and form so the caregiver can verify against
// the bottle before tapping "Set schedule" to enter the unified flow.
function PendingMedSummary({
  med,
  onSetSchedule,
  onSkip,
  disabled,
  position,
  totalCount,
}: {
  med: ResolvedMed;
  onSetSchedule: () => void;
  onSkip: () => void;
  disabled?: boolean;
  position: number | null;
  totalCount: number;
}) {
  const ocrName = med.drug_name.trim();
  const primary = toTitleCase(
    ocrName.length > 0 ? ocrName : (med.canonicalName ?? '').trim()
  );
  const displayDose = displayStrength(med);
  const displayForm = normalizeForm(med.form);

  return (
    <div className="rounded-2xl bg-card shadow-card p-4">
      {position !== null && totalCount > 1 && (
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-2">
          Med {position} of {totalCount}
        </p>
      )}
      <p className="text-base font-semibold text-foreground">{primary}</p>

      <dl className="mt-3 space-y-1.5 text-sm">
        <Row
          label="Strength"
          value={displayDose || <span className="text-muted-foreground">Not on label</span>}
        />
        <Row
          label="Form"
          value={displayForm ?? <span className="text-muted-foreground">Not on label</span>}
        />
      </dl>

      <button
        type="button"
        onClick={onSetSchedule}
        disabled={disabled}
        className="mt-4 w-full rounded-full bg-foreground text-background px-4 py-3 text-sm font-semibold disabled:opacity-50"
      >
        Set schedule
      </button>
      <button
        type="button"
        onClick={onSkip}
        disabled={disabled}
        className="mt-2 w-full text-center text-xs text-muted-foreground underline"
      >
        Skip
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground/70">{label}</dt>
      <dd className="text-sm text-foreground text-right">{value}</dd>
    </div>
  );
}

// Mirrors the chain in extracted-to-payload's resolveDose so the
// summary card never displays a different strength than what saves.
function displayStrength(med: ResolvedMed): string {
  if (med.strength) return med.strength.toLowerCase().trim();
  if (med.canonicalName && !med.canonicalName.includes(' / ')) {
    const m = /(\d+(?:\.\d+)?)\s+([A-Za-z]+(?:\/[A-Za-z]+)?)/.exec(med.canonicalName);
    if (m) return `${m[1]} ${m[2].toLowerCase()}`;
  }
  if (med.dose_value !== null && med.dose_unit && med.dose_unit.trim().length > 0) {
    return `${med.dose_value} ${med.dose_unit.toLowerCase().trim()}`;
  }
  return '';
}

// Dose-change short-circuit per build conv #6: labels with dose-change
// instructions never auto-ingest.
function DoseChangeNotice({
  drugName,
  onSkip,
  position,
  totalCount,
}: {
  drugName: string;
  onSkip: () => void;
  position: number | null;
  totalCount: number;
}) {
  return (
    <div className="rounded-2xl bg-card shadow-card p-4 border border-border">
      {position !== null && totalCount > 1 && (
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-2">
          Med {position} of {totalCount}
        </p>
      )}
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="text-foreground mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-foreground">{toTitleCase(drugName)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            This label has dose-change instructions. Confirm with the prescriber and add manually.
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground underline"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
