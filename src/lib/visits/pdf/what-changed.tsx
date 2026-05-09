// "What changed since last visit" — the 60-second-scan callout on page 1.
//
// Reads from `triggersInWindow` (rules-only engine output, accumulated across
// the days between this visit and the prior visit). Top three triggers by
// tier severity surface here. The trigger labels are already plain-English
// caregiver copy — we trust them rather than re-implement threshold logic.

import { Text, View } from '@react-pdf/renderer';
import type { VisitHandoffData } from './index';
import { PDF_COLORS } from './colors';
import { PDF_TEXT } from './typography';

const MAX_DELTAS = 3;

const TIER_RANK: Record<string, number> = {
  tier_1_911: 1,
  tier_2_today: 2,
  tier_3_48hr: 3,
  tier_4_log: 4,
};

interface Props {
  triggersInWindow: VisitHandoffData['triggersInWindow'];
}

export function WhatChangedCallout({ triggersInWindow }: Props) {
  const deltas = pickTopDeltas(triggersInWindow);

  return (
    <View
      style={{
        marginVertical: 10,
        padding: 10,
        borderWidth: 1,
        borderColor: PDF_COLORS.ink,
        backgroundColor: PDF_COLORS.paper,
      }}
    >
      <Text style={{ ...PDF_TEXT.sectionEyebrow, color: PDF_COLORS.ink, marginBottom: 6 }}>
        WHAT CHANGED
      </Text>
      {deltas.length === 0 ? (
        <Text style={{ ...PDF_TEXT.bodyEmphasis, color: PDF_COLORS.muted }}>
          No threshold-crossing changes since the last visit.
        </Text>
      ) : (
        deltas.map((d, i) => (
          <Text
            key={`${d.logDate}-${d.label}-${i}`}
            style={{
              ...PDF_TEXT.bodyEmphasis,
              color: PDF_COLORS.ink,
              marginTop: i === 0 ? 0 : 3,
            }}
          >
            ▲ {d.label}
          </Text>
        ))
      )}
    </View>
  );
}

function pickTopDeltas(rows: VisitHandoffData['triggersInWindow']): Array<{
  logDate: string;
  label: string;
}> {
  const flat: Array<{ logDate: string; tier: string; label: string }> = [];
  for (const row of rows) {
    if (!Array.isArray(row.triggers)) continue;
    for (const t of row.triggers as Array<{ label?: unknown }>) {
      if (typeof t?.label === 'string' && t.label.length > 0) {
        flat.push({ logDate: row.logDate, tier: row.tier, label: t.label });
      }
    }
  }
  // Sort: highest severity tier first, then most recent log_date first.
  flat.sort((a, b) => {
    const tierDiff = (TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9);
    if (tierDiff !== 0) return tierDiff;
    return a.logDate < b.logDate ? 1 : -1;
  });
  // Dedupe by label so a multi-day repeat doesn't crowd out a distinct trigger.
  const seen = new Set<string>();
  const out: Array<{ logDate: string; label: string }> = [];
  for (const d of flat) {
    if (seen.has(d.label)) continue;
    seen.add(d.label);
    out.push({ logDate: d.logDate, label: d.label });
    if (out.length >= MAX_DELTAS) break;
  }
  return out;
}
