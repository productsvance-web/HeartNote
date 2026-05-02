// Drug classification via NIH RxNorm + RxClass.
//
// Pipeline:
//   1. Exact RxNorm name lookup → RxCUI
//   2. If empty, RxNorm approximate match → RxCUI (+ optional spelling correction)
//   3. RxClass byRxcui (relaSource=ATC) → ATC class codes
//   4. Longest-prefix match against ATC_TO_MED_CLASS → med_class
//
// Total budget is 2000ms across all calls (AbortController). Any failure or
// empty result returns medClass='other' and emits a server-side console.warn
// so sustained outages are visible in ops.
//
// PHI safety: outbound payload contains drug name only — no patient
// identifier, no caregiver identifier.

import { classifyByAtcCodes, type MedClass } from './atc-map';

const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST';
const TIMEOUT_MS = 2000;

export interface AllowedStrengths {
  // Normalized to RxNorm's uppercase ('MG', 'MCG', 'G', etc.)
  unit: string;
  // Sorted ascending. Used for soft-warning on outliers in future PR; v1
  // only checks unit-class membership.
  values: number[];
}

export interface ClassifyResult {
  medClass: MedClass;
  rxcui?: string;
  suggestedName?: string;
  // Set only when RxNorm returns a consistent oral-solid-form strength.
  // Liquids, inhalers, patches → undefined (no validation).
  allowedStrengths?: AllowedStrengths;
}

// Conservative parser: only oral tablets/capsules with consistent simple
// units (MG / MCG / G). Mixed-unit drugs and non-solid forms return null
// — better to skip validation than to wrongly block a real prescription.
function parseAllowedStrengths(names: readonly string[]): AllowedStrengths | undefined {
  const units = new Set<string>();
  const values = new Set<number>();
  const STRENGTH = /(\d+(?:\.\d+)?)\s+(MG|MCG|G)\b/i;
  for (const name of names) {
    if (!/\b(Tablet|Capsule)\b/i.test(name)) continue;
    const m = STRENGTH.exec(name);
    if (m) {
      units.add(m[2].toUpperCase());
      values.add(parseFloat(m[1]));
    }
  }
  if (units.size !== 1 || values.size === 0) return undefined;
  return {
    unit: Array.from(units)[0],
    values: Array.from(values).sort((a, b) => a - b),
  };
}

export async function classifyDrugByName(drugName: string): Promise<ClassifyResult> {
  const trimmed = drugName.trim();
  if (!trimmed) return { medClass: 'other' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    let rxcui: string | undefined;
    let suggestedName: string | undefined;

    const exactResp = await fetch(
      `${RXNAV_BASE}/rxcui.json?name=${encodeURIComponent(trimmed)}`,
      { signal: controller.signal }
    );
    if (exactResp.ok) {
      const exactJson = (await exactResp.json()) as { idGroup?: { rxnormId?: string[] } };
      rxcui = exactJson.idGroup?.rxnormId?.[0];
    }

    if (!rxcui) {
      const approxResp = await fetch(
        `${RXNAV_BASE}/approximateTerm.json?term=${encodeURIComponent(trimmed)}&maxEntries=1`,
        { signal: controller.signal }
      );
      if (approxResp.ok) {
        const approxJson = (await approxResp.json()) as {
          approximateGroup?: {
            candidate?: Array<{ rxcui?: string; name?: string; score?: string }>;
          };
        };
        const candidate = approxJson.approximateGroup?.candidate?.[0];
        rxcui = candidate?.rxcui;
        if (candidate?.name && candidate.name.toLowerCase() !== trimmed.toLowerCase()) {
          suggestedName = candidate.name;
        }
      }
    }

    if (!rxcui) {
      console.warn(`[classifyDrugByName] no RxCUI for "${trimmed}" — defaulting to 'other'`);
      return { medClass: 'other' };
    }

    // Parallel: ATC class lookup + drugs (for strengths). One round trip.
    const [classResp, drugsResp] = await Promise.all([
      fetch(
        `${RXNAV_BASE}/rxclass/class/byRxcui.json?rxcui=${encodeURIComponent(rxcui)}&relaSource=ATC`,
        { signal: controller.signal }
      ),
      fetch(
        `${RXNAV_BASE}/drugs.json?name=${encodeURIComponent(suggestedName ?? trimmed)}`,
        { signal: controller.signal }
      ),
    ]);

    let medClass: MedClass = 'other';
    if (classResp.ok) {
      const classJson = (await classResp.json()) as {
        rxclassDrugInfoList?: {
          rxclassDrugInfo?: Array<{ rxclassMinConceptItem?: { classId?: string } }>;
        };
      };
      const codes = (classJson.rxclassDrugInfoList?.rxclassDrugInfo ?? [])
        .map((info) => info.rxclassMinConceptItem?.classId)
        .filter((id): id is string => typeof id === 'string');
      medClass = classifyByAtcCodes(codes);
    } else {
      console.warn(
        `[classifyDrugByName] RxClass HTTP ${classResp.status} for "${trimmed}" — defaulting to 'other'`
      );
    }

    let allowedStrengths: AllowedStrengths | undefined;
    if (drugsResp.ok) {
      const drugsJson = (await drugsResp.json()) as {
        drugGroup?: {
          conceptGroup?: Array<{ conceptProperties?: Array<{ name?: string }> }>;
        };
      };
      const names: string[] = [];
      for (const g of drugsJson.drugGroup?.conceptGroup ?? []) {
        for (const cp of g.conceptProperties ?? []) {
          if (cp.name) names.push(cp.name);
        }
      }
      allowedStrengths = parseAllowedStrengths(names);
    }

    return { medClass, rxcui, suggestedName, allowedStrengths };
  } catch (err) {
    const reason =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'timeout'
          : err.message
        : 'unknown';
    console.warn(`[classifyDrugByName] fallback to 'other' for "${trimmed}": ${reason}`);
    return { medClass: 'other' };
  } finally {
    clearTimeout(timeout);
  }
}
