// iOS-style sheet for the 14 symptoms. Eight graded segmented cards + six
// yes/no red-flag rows + dizziness yes/no with "on standing or persistent"
// follow-up. Sputum graded card is rendered conditionally — only when
// cough != 'none'.
//
// Open/close: <dialog>-style overlay with backdrop. ESC closes and
// flushes (handled by parent via onClose). Drag-down-to-close gated on
// the grip element only (R17) so mid-card drags scroll the modal.
//
// All single-field changes call onChange({ field: <key>, value }) — the
// parent (LogPageClient) accumulates these into the SaveLogPatch and
// debounces autosave.
//
// Visual register matches docs/design/heartnote-log-redesign-mockup.html
// (.modal-sheet / .modal-grip / .modal-head / .modal-title / .modal-close /
//  .modal-scroll / .section-divider). The inner sheet is constrained to
// max-w-md so on desktop it inherits the PhoneShell phone-shell width
// instead of stretching the full viewport.

'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { SymptomState } from '@/lib/log/page-context';
import { SymptomGradedCard } from './SymptomGradedCard';
import { SymptomYesNoCard } from './SymptomYesNoCard';
import { SegmentedControl } from './SegmentedControl';
import type { VitalCardState } from './VitalCard';

export type SymptomTouchState = Partial<Record<keyof SymptomState, VitalCardState>>;

type ChangeHandler = (patch: Partial<SymptomState>) => void;

interface Props {
  open: boolean;
  onClose: () => void;
  symptoms: SymptomState;
  touchState: SymptomTouchState;
  onChange: ChangeHandler;
  // Source line at the bottom of the modal — "{n} of 14 symptoms captured".
  capturedCount: number;
}

export function SymptomsModal({
  open,
  onClose,
  symptoms,
  touchState,
  onChange,
  capturedCount,
}: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const gripDragStartY = useRef<number | null>(null);

  // Lock body scroll while open. Move focus to the close button on open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC closes. The parent's onClose handler flushes the debounced save.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // Drag-down-from-grip handlers (R17). Only fire when touchstart hits
  // the grip element — not anywhere on the modal — so mid-card drags
  // scroll the contents instead of dismissing.
  const onGripTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    gripDragStartY.current = e.touches[0]?.clientY ?? null;
  };
  const onGripTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = gripDragStartY.current;
    if (start === null) return;
    const y = e.touches[0]?.clientY ?? start;
    if (y - start > 60) {
      gripDragStartY.current = null;
      onClose();
    }
  };
  const onGripTouchEnd = () => {
    gripDragStartY.current = null;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="symptoms-modal-title"
      data-modal-open="true"
      // justify-center centers the sheet so on desktop it sits in the
      // PhoneShell phone-shell-width (max-w-md), not stretched edge-to-edge.
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={{ background: 'color-mix(in oklab, var(--foreground) 25%, transparent)' }}
    >
      <div
        ref={dialogRef}
        // w-full + max-w-md = full-width on phones, phone-shell-width on
        // desktop. Inner column is flex so the head+footer stay pinned and
        // only the middle scrolls.
        className="w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden"
        style={{
          background: 'var(--cream-card)',
          borderRadius: '26px 26px 0 0',
          boxShadow: '0 -10px 30px rgba(28, 28, 28, 0.16)',
          animation: 'slide-up-modal 280ms ease-out',
        }}
      >
        {/* .modal-grip — 38×5 px-rounded handle. */}
        <div
          onTouchStart={onGripTouchStart}
          onTouchMove={onGripTouchMove}
          onTouchEnd={onGripTouchEnd}
          className="flex justify-center cursor-grab flex-shrink-0"
          style={{ paddingTop: 8, paddingBottom: 6 }}
          aria-hidden
        >
          <span
            style={{
              display: 'inline-block',
              width: 38,
              height: 5,
              borderRadius: 999,
              background: 'color-mix(in oklab, var(--foreground) 22%, transparent)',
            }}
          />
        </div>

        {/* .modal-head — Fraunces 24 title + em accent + close button.
            Bottom border in sage-mist. */}
        <div
          className="flex-shrink-0 flex items-end justify-between"
          style={{
            padding: '4px 22px 14px',
            gap: 14,
            borderBottom: '1px solid var(--sage-mist)',
          }}
        >
          <div>
            <p
              className="uppercase font-semibold"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 10.5,
                letterSpacing: '1.5px',
                color: 'var(--sage-deep)',
                marginBottom: 4,
              }}
            >
              Symptoms
            </p>
            <h2
              id="symptoms-modal-title"
              className="font-display"
              style={{
                fontSize: 24,
                fontWeight: 400,
                lineHeight: 1.1,
                letterSpacing: '-0.5px',
                color: 'var(--foreground)',
              }}
            >
              Today&rsquo;s{' '}
              <em
                style={{
                  fontStyle: 'italic',
                  fontWeight: 300,
                  color: 'var(--sage-deep)',
                }}
              >
                symptoms.
              </em>
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close symptoms"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-full active:scale-[0.94] transition flex-shrink-0"
            style={{
              width: 36,
              height: 36,
              background: 'color-mix(in oklab, var(--foreground) 7%, transparent)',
              border: 0,
              color: 'var(--muted-foreground)',
            }}
          >
            <X size={14} strokeWidth={2.4} />
          </button>
        </div>

        {/* .modal-scroll — bottom mask gradient signals "more cards below". */}
        <div
          className="flex-1 overflow-y-auto"
          style={{
            padding: '14px 18px 0',
            WebkitMaskImage:
              'linear-gradient(180deg, #000 0%, #000 88%, transparent 100%)',
            maskImage:
              'linear-gradient(180deg, #000 0%, #000 88%, transparent 100%)',
          }}
        >
          {/* ── Graded section ──────────────────────────────────────────── */}
          <SectionDivider title="Breathing & cough" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <SymptomGradedCard
              label="Breathing"
              state={touchState.dyspneaSeverity ?? 'muted'}
              tone={
                symptoms.dyspneaSeverity === 4
                  ? 'urgent'
                  : symptoms.dyspneaSeverity === 3
                    ? 'watch'
                    : 'calm'
              }
              // cited: research/chf-source-of-truth.md §2 Tier 1 — dyspnea
              // at rest = tier 1. Severity 0-3 are the calmer tiers.
              helper={
                symptoms.dyspneaSeverity === 4
                  ? 'Out of breath at rest — call the cardiologist now.'
                  : symptoms.dyspneaSeverity === 3
                    ? 'Out of breath on minimal activity — watch today.'
                    : 'Pick the level that matches today.'
              }
              options={[
                { value: 0, label: 'Normal' },
                { value: 1, label: 'Stairs' },
                { value: 2, label: 'Flat walk' },
                { value: 3, label: 'ADLs', variantOverride: 'warn' },
                { value: 4, label: 'At rest', variantOverride: 'alert' },
              ]}
              value={symptoms.dyspneaSeverity}
              onChange={(v) => onChange({ dyspneaSeverity: v as number })}
              fieldKey="dyspnea"
            />

            <SymptomGradedCard
              label="Cough"
              state={touchState.cough ?? 'muted'}
              tone={symptoms.cough === 'nocturnal' ? 'watch' : 'calm'}
              // cited: research/chf-source-of-truth.md §2 Tier 2 — new
              // persistent nocturnal cough = tier 2.
              helper={
                symptoms.cough === 'nocturnal'
                  ? 'New nighttime cough — watch today.'
                  : 'Picking a cough type unlocks the sputum question.'
              }
              options={[
                { value: 'none', label: 'No cough' },
                { value: 'daytime', label: 'Daytime' },
                { value: 'nocturnal', label: 'Nighttime', variantOverride: 'warn' },
              ]}
              value={symptoms.cough}
              onChange={(v) => onChange({ cough: v as SymptomState['cough'] })}
              fieldKey="cough"
            />

            {/* Sputum: only when cough != 'none' (R-conditional from L5). */}
            {symptoms.cough && symptoms.cough !== 'none' && (
              <SymptomGradedCard
                label="Sputum"
                state={touchState.sputumColor ?? 'muted'}
                tone={
                  symptoms.sputumColor === 'pink_frothy' ||
                  symptoms.sputumColor === 'white_frothy'
                    ? 'urgent'
                    : 'calm'
                }
                // cited: research/chf-source-of-truth.md §2 Tier 1 — pink
                // OR white frothy sputum = tier 1 (acute pulmonary edema).
                helper={
                  symptoms.sputumColor === 'pink_frothy' ||
                  symptoms.sputumColor === 'white_frothy'
                    ? 'Frothy sputum — call the cardiologist now.'
                    : 'Color of what comes up.'
                }
                options={[
                  { value: 'clear', label: 'Clear' },
                  { value: 'white', label: 'White' },
                  {
                    value: 'white_frothy',
                    label: 'White-frothy',
                    variantOverride: 'alert',
                  },
                  {
                    value: 'pink_frothy',
                    label: 'Pink-frothy',
                    variantOverride: 'alert',
                  },
                ]}
                value={symptoms.sputumColor}
                onChange={(v) =>
                  onChange({ sputumColor: v as SymptomState['sputumColor'] })
                }
                fieldKey="sputum"
              />
            )}
          </div>

          {/* ── Body ────────────────────────────────────────────────────── */}
          <SectionDivider title="Body" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <SymptomGradedCard
              label="Swelling"
              state={touchState.swellingSeverity ?? 'muted'}
              tone={(symptoms.swellingSeverity ?? 0) >= 2 ? 'watch' : 'calm'}
              helper="Pick the level that matches today."
              options={[
                { value: 0, label: 'None' },
                { value: 1, label: 'Mild' },
                { value: 2, label: 'Moderate', variantOverride: 'warn' },
                { value: 3, label: 'Severe', variantOverride: 'warn' },
                { value: 4, label: 'Anasarca', variantOverride: 'alert' },
              ]}
              value={symptoms.swellingSeverity}
              onChange={(v) => onChange({ swellingSeverity: v as number })}
              fieldKey="swelling_severity"
            />

            {symptoms.swellingSeverity !== null && symptoms.swellingSeverity > 0 && (
              <>
                <SymptomGradedCard
                  label="Where"
                  state={touchState.swellingRegion ?? 'muted'}
                  tone="calm"
                  helper="Where the swelling is most visible."
                  options={[
                    { value: 'ankles', label: 'Ankles' },
                    { value: 'calves', label: 'Calves' },
                    { value: 'thighs', label: 'Thighs' },
                    { value: 'abdomen', label: 'Abdomen', variantOverride: 'warn' },
                  ]}
                  value={symptoms.swellingRegion}
                  onChange={(v) =>
                    onChange({ swellingRegion: v as SymptomState['swellingRegion'] })
                  }
                  fieldKey="swelling_region"
                />
                <YesNoRow
                  label="Resolves overnight?"
                  value={symptoms.swellingResolvesOvernight}
                  onChange={(v) => onChange({ swellingResolvesOvernight: v })}
                  fieldKey="swelling_resolves_overnight"
                />
              </>
            )}

            <SymptomGradedCard
              label="Energy"
              state={touchState.fatigueSeverity ?? 'muted'}
              tone={(symptoms.fatigueSeverity ?? 0) >= 3 ? 'watch' : 'calm'}
              helper="Pick the level that matches today."
              options={[
                { value: 0, label: 'Normal' },
                { value: 1, label: 'Mild' },
                { value: 2, label: 'Moderate' },
                { value: 3, label: 'Severe', variantOverride: 'warn' },
                { value: 4, label: "Can't move", variantOverride: 'alert' },
              ]}
              value={symptoms.fatigueSeverity}
              onChange={(v) => onChange({ fatigueSeverity: v as number })}
              fieldKey="fatigue"
            />

            <SymptomGradedCard
              label="Mental clarity"
              state={touchState.cognitionChange ?? 'muted'}
              tone={
                symptoms.cognitionChange === 'confusion'
                  ? 'watch'
                  : 'calm'
              }
              helper="Severe confusion fires its own alert — surfaced above."
              options={[
                { value: 'clear', label: 'Clear' },
                { value: 'mild_fog', label: 'A little foggy' },
                { value: 'confusion', label: 'Confused', variantOverride: 'warn' },
              ]}
              value={
                symptoms.cognitionChange === 'severe'
                  ? null // severe is rendered via banner; modal omits it
                  : symptoms.cognitionChange
              }
              onChange={(v) =>
                onChange({
                  cognitionChange: v as Exclude<SymptomState['cognitionChange'], 'severe'>,
                })
              }
              fieldKey="cognition"
            />

            <SymptomGradedCard
              label="Appetite"
              state={touchState.appetiteChange ?? 'muted'}
              tone="calm"
              helper="Versus a usual day."
              options={[
                { value: 'decreased', label: 'Less' },
                { value: 'unchanged', label: 'Normal' },
                { value: 'increased', label: 'More' },
              ]}
              value={symptoms.appetiteChange}
              onChange={(v) =>
                onChange({ appetiteChange: v as SymptomState['appetiteChange'] })
              }
              fieldKey="appetite"
            />

            <SymptomGradedCard
              label="Urine output"
              state={touchState.urineOutputChange ?? 'muted'}
              tone={symptoms.urineOutputChange === 'decreased' ? 'watch' : 'calm'}
              // cited: research/chf-source-of-truth.md §2 Tier 2 — decreased
              // urine output = tier 2.
              helper={
                symptoms.urineOutputChange === 'decreased'
                  ? 'Output down — call the cardiologist today.'
                  : 'Versus a usual day.'
              }
              options={[
                { value: 'decreased', label: 'Less', variantOverride: 'warn' },
                { value: 'unchanged', label: 'Normal' },
                { value: 'increased', label: 'More' },
              ]}
              value={symptoms.urineOutputChange}
              onChange={(v) =>
                onChange({
                  urineOutputChange: v as SymptomState['urineOutputChange'],
                })
              }
              fieldKey="urine_output"
            />
          </div>

          {/* ── Red-flag checks ─────────────────────────────────────────── */}
          <SectionDivider title="Red-flag checks" />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <SymptomYesNoCard
              question="Chest pain or pressure?"
              state={touchState.chestPain ?? 'muted'}
              tone={symptoms.chestPain ? 'urgent' : 'calm'}
              value={symptoms.chestPain}
              onChange={(v) => onChange({ chestPain: v })}
              yesVariant="alert"
              // cited: research/chf-source-of-truth.md §2 Tier 1 — chest
              // pain = tier 1 (911 territory).
              helper={
                symptoms.chestPain
                  ? 'New chest pain — call the cardiologist now.'
                  : undefined
              }
              fieldKey="chest_pain"
            />

            <SymptomYesNoCard
              question="Fainted?"
              state={touchState.syncope ?? 'muted'}
              tone={symptoms.syncope ? 'urgent' : 'calm'}
              value={symptoms.syncope}
              onChange={(v) => onChange({ syncope: v })}
              yesVariant="alert"
              helper={
                symptoms.syncope
                  ? 'Loss of consciousness — call the cardiologist now.'
                  : undefined
              }
              fieldKey="syncope"
            />

            <SymptomYesNoCard
              question="Bluish lips or fingertips?"
              state={touchState.cyanosis ?? 'muted'}
              tone={symptoms.cyanosis ? 'urgent' : 'calm'}
              value={symptoms.cyanosis}
              onChange={(v) => onChange({ cyanosis: v })}
              yesVariant="alert"
              helper={
                symptoms.cyanosis
                  ? 'Bluish color — call the cardiologist now.'
                  : undefined
              }
              fieldKey="cyanosis"
            />

            <SymptomYesNoCard
              question="Woke up gasping for air (PND)?"
              state={touchState.pnd ?? 'muted'}
              tone={symptoms.pnd ? 'watch' : 'calm'}
              value={symptoms.pnd}
              onChange={(v) => onChange({ pnd: v })}
              yesVariant="warn"
              helper={
                symptoms.pnd
                  ? 'PND — call the cardiologist today.'
                  : undefined
              }
              fieldKey="pnd"
            />

            <SymptomYesNoCard
              question="Filled up after a few bites?"
              state={touchState.earlySatiety ?? 'muted'}
              tone={symptoms.earlySatiety ? 'watch' : 'calm'}
              value={symptoms.earlySatiety}
              onChange={(v) => onChange({ earlySatiety: v })}
              yesVariant="warn"
              fieldKey="early_satiety"
            />

            <SymptomYesNoCard
              question="Hands or feet cold or clammy?"
              state={touchState.extremitiesColdClammy ?? 'muted'}
              tone={symptoms.extremitiesColdClammy ? 'watch' : 'calm'}
              value={symptoms.extremitiesColdClammy}
              onChange={(v) => onChange({ extremitiesColdClammy: v })}
              yesVariant="warn"
              fieldKey="extremities_cold_clammy"
            />

            <SymptomYesNoCard
              question="Pulse felt skippy or fluttering?"
              state={touchState.pulseIrregular ?? 'muted'}
              tone={symptoms.pulseIrregular ? 'watch' : 'calm'}
              value={symptoms.pulseIrregular}
              onChange={(v) => onChange({ pulseIrregular: v })}
              yesVariant="warn"
              fieldKey="pulse_irregular"
            />

            <SymptomYesNoCard
              question="Lightheaded or dizzy?"
              state={touchState.dizziness ?? 'muted'}
              tone={symptoms.dizziness ? 'watch' : 'calm'}
              value={symptoms.dizziness}
              onChange={(v) => onChange({ dizziness: v })}
              yesVariant="warn"
              fieldKey="dizziness"
              followUp={
                symptoms.dizziness ? (
                  <SegmentedControl
                    options={[
                      { value: 'standing', label: 'On standing' },
                      { value: 'persistent', label: 'Persistent', variantOverride: 'warn' },
                    ]}
                    value={
                      symptoms.dizzinessPostural === null
                        ? null
                        : symptoms.dizzinessPostural
                          ? 'standing'
                          : 'persistent'
                    }
                    onChange={(v) =>
                      onChange({ dizzinessPostural: v === 'standing' })
                    }
                    ariaLabel="Dizziness type"
                  />
                ) : null
              }
            />

            <SymptomYesNoCard
              question="Felt nauseous?"
              state={touchState.nausea ?? 'muted'}
              tone={symptoms.nausea ? 'watch' : 'calm'}
              value={symptoms.nausea}
              onChange={(v) => onChange({ nausea: v })}
              yesVariant="warn"
              fieldKey="nausea"
            />
          </div>

          <div style={{ height: 16 }} />
        </div>

        {/* .modal-footer — pinned source line ("{n} of 14 symptoms…"). */}
        <div
          className="flex-shrink-0"
          style={{
            padding: '12px 18px 16px',
            borderTop: '1px solid var(--sage-mist)',
            background: 'var(--cream-card)',
          }}
        >
          <p
            className="text-center"
            style={{
              fontSize: 10.5,
              color: 'var(--ink-faint)',
              fontStyle: 'italic',
              lineHeight: 1.5,
            }}
          >
            {capturedCount} of 14 symptoms captured today
          </p>
        </div>
      </div>

      {/* Slide-up keyframe — local because no global animation file owns this. */}
      <style>{`
        @keyframes slide-up-modal {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// .section-divider — Fraunces 15 title left, tiny tracked uppercase right.
// Top border in sage-mist. Mockup lines 438–462.
function SectionDivider({ title }: { title: string }) {
  return (
    <div
      className="flex items-baseline justify-between"
      style={{
        margin: '18px 4px 10px',
        gap: 10,
        borderTop: '1px solid var(--sage-mist)',
        paddingTop: 14,
      }}
    >
      <span
        className="font-display"
        style={{
          fontSize: 15,
          fontWeight: 500,
          color: 'var(--foreground)',
          letterSpacing: '-0.2px',
        }}
      >
        {title}
      </span>
      <span
        className="uppercase font-semibold"
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 9.5,
          letterSpacing: '1.2px',
          color: 'var(--ink-faint)',
        }}
      >
        Tap to record
      </span>
    </div>
  );
}

// Compact yes/no row used for swelling resolves-overnight follow-up.
function YesNoRow({
  label,
  value,
  onChange,
  fieldKey,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  fieldKey: string;
}) {
  return (
    <section
      data-field={fieldKey}
      style={{
        background: 'var(--cream-card)',
        border: '1px solid var(--sage-mist)',
        borderRadius: 18,
        padding: '10px 14px',
      }}
    >
      <p
        className="font-display"
        style={{
          fontSize: 13.5,
          fontWeight: 500,
          color: 'var(--foreground)',
          letterSpacing: '-0.1px',
          lineHeight: 1.3,
        }}
      >
        {label}
      </p>
      <div style={{ marginTop: 8 }}>
        <SegmentedControl
          options={[
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes' },
          ]}
          value={value === null ? null : value ? 'yes' : 'no'}
          onChange={(v) => onChange(v === 'yes')}
          ariaLabel={label}
        />
      </div>
    </section>
  );
}
