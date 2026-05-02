'use client';

import { useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Camera as CameraIcon, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import type { ExtractedMed } from '@/lib/medications/scan/schema';
import { ScanReviewCard } from './scan-review-card';
import { addExtractedMedications, type MedicationPayload } from '../actions';
import { extractedMedToPayload } from './extracted-to-payload';

// Compresses an image data URL down to ~800KB at max 1280px on the long
// edge, JPEG quality 0.8. Pure browser code — Canvas + toDataURL. Runs
// off the captured dataUrl, returns a new dataUrl.
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
  | { kind: 'review'; medications: ExtractedMed[]; addAllSummary: string | null }
  | { kind: 'empty' }
  | { kind: 'safety' }
  | { kind: 'error'; message: string };

export function ScanClient() {
  const [state, setState] = useState<State>({ kind: 'capture' });
  const [permissionDenied, setPermissionDenied] = useState(false);

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
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      if (message.includes('permission') || message.includes('denied')) {
        setPermissionDenied(true);
      } else if (!message.includes('cancel')) {
        // Genuine error (not a user-cancel). Don't toast on cancel.
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
      const data = (await resp.json()) as { medications: ExtractedMed[] };
      if (data.medications.length === 0) {
        setState({ kind: 'empty' });
        return;
      }
      setState({ kind: 'review', medications: data.medications, addAllSummary: null });
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

  function removeMed(index: number) {
    setState((s) => {
      if (s.kind !== 'review') return s;
      const next = s.medications.slice();
      next.splice(index, 1);
      if (next.length === 0) return { kind: 'capture' };
      return { ...s, medications: next };
    });
  }

  async function addAll() {
    if (state.kind !== 'review') return;
    // Dose-change cards never participate in Add all; they require
    // prescriber confirmation per build conv #6.
    const candidatePayloads: MedicationPayload[] = [];
    const candidateOrigIndexes: number[] = [];
    state.medications.forEach((med, i) => {
      if (med.is_dose_change) return;
      candidatePayloads.push(extractedMedToPayload(med));
      candidateOrigIndexes.push(i);
    });
    if (candidatePayloads.length === 0) return;
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
          ? `${result.added} added`
          : `${result.added} added, ${result.failedIndexes.length} need a fix`;
      return { kind: 'review', medications: next, addAllSummary: summary };
    });
  }

  // Capture state
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

  // Preview state — show captured image, confirm or retake
  if (state.kind === 'preview') {
    return (
      <section className="mt-6 mx-4 space-y-3">
        <div className="rounded-3xl bg-card shadow-card overflow-hidden">
          {/* In-memory data URL preview — next/image can't optimize a base64
              dataUrl and adds layout overhead. Plain <img> is correct here. */}
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

  // Processing
  if (state.kind === 'processing') {
    return (
      <section className="mt-6 mx-4 rounded-3xl bg-card shadow-card p-8 text-center">
        <p className="text-sm text-foreground">Reading the label…</p>
        <p className="text-xs text-muted-foreground mt-1">A few seconds.</p>
      </section>
    );
  }

  // No meds detected
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

  // Safety filter
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

  // Error
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

  // Review state
  return (
    <section className="mt-6 mx-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {state.medications.length} medication
          {state.medications.length === 1 ? '' : 's'} detected. Tap to confirm each
          field, or use Add all.
        </p>
        {state.addAllSummary && (
          <p className="text-xs font-semibold text-foreground">{state.addAllSummary}</p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={addAll}
          disabled={state.medications.every((m) => m.is_dose_change)}
          className="flex-1 rounded-full bg-foreground text-background px-4 py-3 text-sm font-semibold disabled:opacity-50"
        >
          Add all
        </button>
        <button
          type="button"
          onClick={reset}
          className="flex-1 rounded-full border border-border bg-card px-4 py-3 text-sm font-medium"
        >
          Take another
        </button>
      </div>

      <ul className="space-y-3">
        {state.medications.map((med, i) => (
          <li key={i}>
            <ScanReviewCard
              med={med}
              onSkip={() => removeMed(i)}
              onAdded={() => removeMed(i)}
            />
          </li>
        ))}
      </ul>

      {/* Empathetic note: navigation away drops scan state. */}
      <p className="text-xs text-muted-foreground text-center pt-2">
        Tapped Back too soon? Scan again from the list.
      </p>
    </section>
  );
}
