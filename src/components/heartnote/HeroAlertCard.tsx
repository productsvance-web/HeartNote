// HeroAlertCard — replaces the dashboard's inline AlertBlock for tier_1,
// tier_2, and tier_3 home-screen states. The card surfaces the engine's
// trigger labels and, when the lead trigger is weight-related, lays the
// number + 14-day sparkline + AHA threshold band right under the
// headline.
//
// Plain-English: when something is off, this card answers in one glance:
// "what changed, by how much, and what to do about it." Two CTAs — call
// the cardiologist (or 911) and see the full trend.

import Link from 'next/link';
import { AlertTriangle, Phone } from 'lucide-react';
import { WEIGHT_GAIN_TIER_2_7D_LB } from '@/lib/clinical/thresholds';
import { StatusPip } from './StatusPip';
import { MiniTrendSpark } from './MiniTrendSpark';
import type { TriggerRow } from '@/lib/vitals/per-vital-tier';

const WEIGHT_RULE_IDS = new Set(['T2.1', 'T2.2', 'T2.3', 'T3.1']);

type CtaTone = 'alert' | 'watch';

type WeightSeriesPoint = { d: string; v: number };

interface Props {
  tone: CtaTone;
  triggers: TriggerRow[];
  aiReasoning?: string | null;
  weightSeries14d: WeightSeriesPoint[] | null;
  weightBaselineLb: number | null;
  cardiologistName: string | null;
  cardiologistPhone: string | null;
  forceCall911?: boolean; // tier_1_911 path
}

export function HeroAlertCard({
  tone,
  triggers,
  aiReasoning,
  weightSeries14d,
  weightBaselineLb,
  cardiologistName,
  cardiologistPhone,
  forceCall911 = false,
}: Props) {
  const lead = triggers[0] ?? null;
  const isWeightLead = lead !== null && WEIGHT_RULE_IDS.has(lead.rule_id);
  const showSpark =
    isWeightLead &&
    weightSeries14d !== null &&
    weightSeries14d.length >= 2;

  const ringVar = tone === 'alert' ? 'var(--status-alert)' : 'var(--status-watch)';
  const softVar = tone === 'alert' ? 'var(--status-alert-soft)' : 'var(--status-watch-soft)';
  const fgVar = tone === 'alert' ? 'var(--status-alert-foreground)' : 'var(--status-watch-foreground)';

  const headline = lead?.label ?? (tone === 'alert' ? 'Pattern worth a phone call.' : 'Worth flagging at the next call.');
  const eyebrow = forceCall911
    ? 'CALL 911'
    : tone === 'alert'
      ? `CALL TODAY · ${categoryFor(lead).toUpperCase()}`
      : `WATCH · ${categoryFor(lead).toUpperCase()}`;

  const todayWeight = showSpark ? weightSeries14d![weightSeries14d!.length - 1].v : null;
  const thresholdLb =
    weightBaselineLb !== null ? weightBaselineLb + WEIGHT_GAIN_TIER_2_7D_LB : null;
  const deltaLb = todayWeight !== null && weightBaselineLb !== null ? todayWeight - weightBaselineLb : null;

  const cta = forceCall911
    ? { label: 'Call 911', href: 'tel:911', kind: 'call' as const }
    : cardiologistPhone
      ? {
          label: `Call ${cardiologistName ?? 'cardiologist'}`,
          href: `tel:${cardiologistPhone}`,
          kind: 'call' as const,
        }
      : {
          label: 'Add cardiologist phone in Settings',
          href: '/me',
          kind: 'fallback' as const,
        };

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex items-center gap-2 text-[10.5px] font-semibold uppercase"
        style={{ letterSpacing: '0.08em', color: fgVar }}
      >
        <StatusPip tier={tone} size={8} />
        {eyebrow}
      </div>

      <div className="flex items-start gap-3">
        <div
          className="h-12 w-12 rounded-full flex items-center justify-center shrink-0"
          style={{ background: softVar, color: fgVar }}
        >
          <AlertTriangle size={22} />
        </div>
        <h2 className="font-display text-[19px] text-foreground leading-snug" style={{ letterSpacing: '-0.015em' }}>
          {headline}
        </h2>
      </div>

      {aiReasoning && aiReasoning.trim().length > 0 && (
        <p className="text-sm text-muted-foreground leading-relaxed -mt-1">
          {aiReasoning}
        </p>
      )}

      {showSpark && todayWeight !== null && weightBaselineLb !== null && deltaLb !== null && (
        <div className="flex items-end gap-3.5">
          <div className="shrink-0">
            <p
              className="text-[30px] font-medium text-foreground tabular-nums leading-none"
              style={{ letterSpacing: '-0.02em' }}
            >
              {todayWeight.toFixed(1)}
              <span className="text-[13px] text-muted-foreground font-normal ml-1">lb</span>
            </p>
            <p className="text-[11.5px] font-medium tabular-nums mt-1" style={{ color: fgVar }}>
              baseline {weightBaselineLb.toFixed(1)} ·{' '}
              {deltaLb >= 0 ? '▲' : '▼'} {Math.abs(deltaLb).toFixed(1)}
            </p>
          </div>
          <div className="flex-1">
            <MiniTrendSpark
              data={weightSeries14d!}
              color={ringVar}
              thresholdValue={thresholdLb ?? undefined}
              baselineValue={weightBaselineLb}
              height={56}
            />
          </div>
        </div>
      )}

      {!showSpark && triggers.length > 0 && (
        <ul className="rounded-2xl px-4 py-3 space-y-1.5" style={{ background: softVar }}>
          {triggers.map((t) => (
            <li key={t.rule_id} className="text-sm" style={{ color: fgVar }}>
              • {t.label}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        {cta.kind === 'call' ? (
          <a
            href={cta.href}
            className="flex-1 flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-white shadow-soft active:scale-[0.98] transition"
            style={{ background: ringVar }}
          >
            <Phone size={14} />
            {cta.label}
          </a>
        ) : (
          <Link
            href={cta.href}
            className="flex-1 flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-medium border active:scale-[0.98] transition"
            style={{ borderColor: ringVar, color: fgVar }}
          >
            <Phone size={14} />
            {cta.label}
          </Link>
        )}
        <Link
          href="/trends"
          className="px-4 py-3 rounded-full text-sm font-medium border active:scale-[0.98] transition"
          style={{ borderColor: `color-mix(in oklab, ${ringVar} 35%, transparent)`, color: fgVar }}
        >
          See trend
        </Link>
      </div>
    </div>
  );
}

function categoryFor(lead: TriggerRow | null): string {
  if (!lead) return 'pattern';
  if (WEIGHT_RULE_IDS.has(lead.rule_id)) return 'weight';
  if (lead.rule_id === 'T2.4') return 'pillows';
  if (lead.rule_id === 'T2.6' || lead.rule_id === 'T3.3') return 'swelling';
  if (
    lead.rule_id === 'T1.1' ||
    lead.rule_id === 'T1.6' ||
    lead.rule_id.startsWith('T1.7') ||
    lead.rule_id === 'T2.5' ||
    lead.rule_id === 'T2.7' ||
    lead.rule_id === 'T3.2' ||
    lead.rule_id === 'T2.10'
  )
    return 'breathing';
  if (lead.rule_id === 'T1.2' || lead.rule_id === 'T2.8') return 'cough';
  if (lead.rule_id === 'T1.3') return 'chest pain';
  if (lead.rule_id === 'T1.5') return 'fainting';
  if (lead.rule_id === 'T1.4' || lead.rule_id === 'T2.13') return 'thinking';
  if (lead.rule_id === 'T1.8' || lead.rule_id.startsWith('T2.11')) return 'pulse';
  if (lead.rule_id === 'T2.9') return 'urine';
  if (lead.rule_id === 'T3.4') return 'dizziness';
  return 'pattern';
}
