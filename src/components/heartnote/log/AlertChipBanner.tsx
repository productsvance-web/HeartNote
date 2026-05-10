// Banner that surfaces tier-1 (911-territory) and tier-2 (same-day call)
// alert-engine triggers above the page header. Single source of truth:
// daily_assessments.triggers (per R9). Tier-1 banners render first; tier-2
// banners stack below.
//
// Each trigger arrives with { rule_id, label, evidence } from the engine
// in src/lib/alerts/evaluate.ts. The engine is the single source for what
// each rule says — `Trigger.label` already includes the dynamic context
// ("Weight up 4 lb in 24 hours — call cardiologist today"), so the banner
// just renders that label and pairs it with a tier-derived action line.
//
// Per CLAUDE.md rule #4 ("AI alerts must show their reasoning"), every
// banner shows the engine label. Per rule #6, the strongest action copy is
// "Call the cardiologist now" — never 911 or dose changes.

'use client';

import { AlertTriangle, AlertCircle } from 'lucide-react';
import type { AssessmentTrigger } from '@/lib/log/page-context';

type Tier = 'tier_1_911' | 'tier_2_today' | 'tier_3_48hr' | 'tier_4_log';

interface Props {
  tier: Tier;
  triggers: AssessmentTrigger[];
}

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
        const action = isTier1
          ? 'Call the cardiologist now'
          : 'Call the cardiologist today';
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
                  <p className="text-sm font-semibold">{trigger.label}</p>
                </div>
                <p className="text-sm font-medium mt-2">{action}</p>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
