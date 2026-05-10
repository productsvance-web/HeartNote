// Banner that surfaces tier-1 (911-territory) and tier-2 (same-day call)
// alert-engine triggers above the page header. Single source of truth:
// daily_assessments.triggers (per R9). Tier-1 banners render first; tier-2
// banners stack below.
//
// Each trigger arrives with { rule_id, label, evidence }. RULE_COPY maps
// rule_id → caregiver-facing label/reason/action/cite. Unknown rule_ids
// fall back to the trigger's `label` so the engine never silently blanks
// the banner.
//
// Per CLAUDE.md rule #4 ("AI alerts must show their reasoning"), every
// banner shows the reason. Per rule #6, the strongest action copy is
// "Call the cardiologist now" — never 911 or dose changes.

'use client';

import { AlertTriangle, AlertCircle } from 'lucide-react';
import type { AssessmentTrigger } from '@/lib/log/page-context';

type Tier = 'tier_1_911' | 'tier_2_today' | 'tier_3_48hr' | 'tier_4_log';

interface Props {
  tier: Tier;
  triggers: AssessmentTrigger[];
}

type RuleCopy = {
  label: string;
  reason: string;
  action: string;
  cite: string;
};

// Maps rule_id (from src/lib/alerts/evaluate.ts) → caregiver copy.
// Each entry's `cite` points at research/chf-source-of-truth.md so the
// banner's bottom line traces back to the research file.
const RULE_COPY: Record<string, RuleCopy> = {
  // ── TIER 1 ──────────────────────────────────────────────────────────────
  'T1.1': {
    label: 'Out of breath at rest',
    reason:
      "Shortness of breath at rest — can't finish sentences — is a high-acuity decompensation sign.",
    action: 'Call the cardiologist now',
    cite: 'AHA · §2 Tier 1',
  },
  'T1.2': {
    label: 'Frothy sputum',
    reason:
      'Pink or white frothy sputum can signal acute pulmonary edema (fluid in the lungs).',
    action: 'Call the cardiologist now',
    cite: 'AHA · §2 Tier 1 (acute pulmonary edema)',
  },
  'T1.3': {
    label: 'New chest pain',
    reason: 'New chest pain or pressure in a CHF patient can signal an acute cardiac event.',
    action: 'Call the cardiologist now',
    cite: 'AHA · §2 Tier 1',
  },
  'T1.4': {
    label: 'Severe confusion',
    reason:
      'Severe confusion or not recognizing family can signal poor brain perfusion from low cardiac output.',
    action: 'Call the cardiologist now',
    cite: 'AHA · §2 Tier 1',
  },
  'T1.5': {
    label: 'Fainted',
    reason:
      'Loss of consciousness in CHF can signal a serious arrhythmia or low cardiac output.',
    action: 'Call the cardiologist now',
    cite: 'AHA · §2 Tier 1',
  },
  'T1.6': {
    label: 'Blue lips or fingertips',
    reason: 'Bluish color signals dangerously low blood oxygen.',
    action: 'Call the cardiologist now',
    cite: 'AHA · §2 Tier 1',
  },
  'T1.7a': {
    label: 'Oxygen below 88%',
    reason: 'SpO2 under 88% reflects dangerously low blood oxygen.',
    action: 'Call the cardiologist now',
    cite: 'AHA · §2 Tier 1',
  },
  'T1.7b': {
    label: 'Low oxygen with new shortness of breath',
    reason:
      'SpO2 under 90% with new dyspnea is a tier-1 decompensation pattern.',
    action: 'Call the cardiologist now',
    cite: 'AHA · §2 Tier 1',
  },
  'T1.8': {
    label: 'Fast irregular pulse with chest pain or dizziness',
    reason:
      'Fast irregular pulse compounded with chest pain or dizziness can signal a serious arrhythmia.',
    action: 'Call the cardiologist now',
    cite: 'AHA · §2 Tier 1',
  },
  // ── TIER 2 ──────────────────────────────────────────────────────────────
  'T2.1': {
    label: 'Weight gain in 24 hours',
    reason: 'Rapid 24-hour weight gain typically reflects fluid retention.',
    action: 'Call the cardiologist today',
    cite: 'Cleveland Clinic · §2 Tier 2',
  },
  'T2.2': {
    label: 'Weight gain in 48 hours',
    reason: 'A 3-lb gain over 48 hours typically reflects fluid retention.',
    action: 'Call the cardiologist today',
    cite: 'Cleveland Clinic · §2 Tier 2',
  },
  'T2.3': {
    label: 'Weight gain in a week',
    reason: '5+ lb in 7 days typically reflects fluid retention.',
    action: 'Call the cardiologist today',
    cite: 'AHA · §2 Tier 2',
  },
  'T2.4': {
    label: 'Sleeping on more pillows',
    reason: 'More pillows than usual can signal orthopnea.',
    action: 'Call the cardiologist today',
    cite: 'AHA · §2 Tier 2',
  },
  'T2.5': {
    label: 'Woke up gasping for breath',
    reason:
      'Waking 1–3 hours after lying down gasping (PND) is a high-specificity early decompensation sign.',
    action: 'Call the cardiologist today',
    cite: 'Cleveland Clinic · §2 Tier 2',
  },
  'T2.6': {
    label: 'New or worsened swelling',
    reason: 'Swelling that does not resolve overnight reflects fluid build-up.',
    action: 'Call the cardiologist today',
    cite: 'AHA · §2 Tier 2',
  },
  'T2.7': {
    label: 'Big drop in what she can do today',
    reason:
      'A severe step-change in what the patient can do today often reflects worsening cardiac output.',
    action: 'Call the cardiologist today',
    cite: 'AHA · §2 Tier 2',
  },
  'T2.8': {
    label: 'New nighttime cough',
    reason: 'New persistent nighttime cough can signal pulmonary fluid.',
    action: 'Call the cardiologist today',
    cite: 'AHA · §2 Tier 2',
  },
  'T2.9': {
    label: 'Urine output is down',
    reason: 'Decreased urine output can signal worsening cardiac output.',
    action: 'Call the cardiologist today',
    cite: 'AHA · §2 Tier 2',
  },
  'T2.10': {
    label: 'Low blood pressure with concerning symptoms',
    reason:
      'Low systolic BP combined with dizziness, confusion, or cold/clammy extremities can reflect poor perfusion.',
    action: 'Call the cardiologist today',
    cite: 'AHA · §2 Tier 2',
  },
  'T2.11a': {
    label: 'Resting heart rate above 120',
    reason: 'A resting heart rate above 120 bpm warrants same-day attention.',
    action: 'Call the cardiologist today',
    cite: 'Cleveland Clinic · §2 Tier 2',
  },
  'T2.11b': {
    label: 'Elevated heart rate with other symptoms',
    reason:
      'Resting heart rate above 100 bpm combined with other tier-2 symptoms is a same-day call.',
    action: 'Call the cardiologist today',
    cite: 'AHA · §2 Tier 2',
  },
  'T2.11c': {
    label: 'Slow heart rate with other symptoms',
    reason:
      'Resting heart rate below 50 bpm combined with other tier-2 symptoms is a same-day call.',
    action: 'Call the cardiologist today',
    cite: 'AHA · §2 Tier 2',
  },
  'T2.12': {
    label: 'New nausea',
    reason: 'New nausea in a CHF patient can signal worsening cardiac function.',
    action: 'Call the cardiologist today',
    cite: 'AHA · §2 Tier 2',
  },
  'T2.13': {
    label: 'New mental fog or confusion',
    reason: 'New cognitive change can signal worsening perfusion.',
    action: 'Call the cardiologist today',
    cite: 'AHA · §2 Tier 2',
  },
  'T2.14': {
    label: 'Cold, clammy hands with fatigue',
    reason: 'Cold/clammy extremities with fatigue can reflect poor perfusion.',
    action: 'Call the cardiologist today',
    cite: 'AHA · §2 Tier 2',
  },
};

export function AlertChipBanner({ tier, triggers }: Props) {
  if (tier === 'tier_4_log' || triggers.length === 0) return null;

  // Order: tier-1 entries first, then tier-2. The triggers array is
  // already ordered by tier in evaluate.ts, but we filter to surface only
  // tier-1 and tier-2 — tier-3 triggers don't render banners on /log.
  const tier1 = triggers.filter((t) => t.rule_id.startsWith('T1.'));
  const tier2 = triggers.filter((t) => t.rule_id.startsWith('T2.'));
  const ordered = [...tier1, ...tier2];

  if (ordered.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {ordered.map((trigger, i) => {
        const isTier1 = trigger.rule_id.startsWith('T1.');
        const copy: RuleCopy = RULE_COPY[trigger.rule_id] ?? {
          label: trigger.label,
          reason: 'Pattern flagged today.',
          action: isTier1 ? 'Call the cardiologist now' : 'Call the cardiologist today',
          cite: 'CHF research file',
        };
        return (
          <section
            key={`${trigger.rule_id}-${i}`}
            className="rounded-2xl p-4 flex flex-col gap-2 border"
            style={{
              background: isTier1
                ? 'var(--status-alert-soft)'
                : 'var(--status-watch-soft)',
              borderColor: isTier1 ? 'var(--status-alert)' : 'var(--status-watch)',
              color: isTier1
                ? 'var(--status-alert-foreground)'
                : 'var(--status-watch-foreground)',
            }}
          >
            <div className="flex items-start gap-3">
              {isTier1 ? (
                <AlertTriangle size={20} className="shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full text-white"
                    style={{
                      background: isTier1
                        ? 'var(--status-alert)'
                        : 'var(--status-watch)',
                    }}
                  >
                    {isTier1 ? 'Highest priority' : 'Watch today'}
                  </span>
                  <p className="text-sm font-semibold">{copy.label}</p>
                </div>
                <p className="text-xs mt-1.5 leading-relaxed opacity-90">
                  {copy.reason}
                </p>
                <p className="text-sm font-medium mt-2">{copy.action}</p>
                <p className="text-[10px] uppercase tracking-wider opacity-70 mt-1">
                  Source: {copy.cite}
                </p>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
