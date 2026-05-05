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

    const inner = await classifyByRxcuiInner(
      rxcui,
      suggestedName ?? trimmed,
      controller.signal,
      `[classifyDrugByName] for "${trimmed}"`
    );
    return { ...inner, rxcui, suggestedName };
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

// RxCUI-known classification path used by the medication wizard, where
// the user picked an exact RxNorm concept in the search step. Skips the
// name → rxcui resolution that classifyDrugByName has to do up front.
// Returns medClass only — wizard derives strengths from getDrugDetails,
// so the /drugs lookup is unnecessary here.
export async function classifyByRxcui(rxcui: string): Promise<MedClass> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const inner = await classifyByRxcuiInner(
      rxcui,
      '',
      controller.signal,
      `[classifyByRxcui] for ${rxcui}`
    );
    return inner.medClass;
  } catch (err) {
    const reason =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'timeout'
          : err.message
        : 'unknown';
    console.warn(`[classifyByRxcui] fallback to 'other' for ${rxcui}: ${reason}`);
    return 'other';
  } finally {
    clearTimeout(timeout);
  }
}

// Shared inner: ATC class + (optional) drugs lookup for strengths.
// `nameForStrengths` empty skips the drugs-by-name call; the wizard path
// uses this shortcut because strengths come from getDrugDetails instead.
// `logTag` keeps ops grep patterns stable per caller (so existing
// "[classifyDrugByName]" log searches still match).
async function classifyByRxcuiInner(
  rxcui: string,
  nameForStrengths: string,
  signal: AbortSignal,
  logTag: string
): Promise<{ medClass: MedClass; allowedStrengths?: AllowedStrengths }> {
  const [classResp, drugsResp] = await Promise.all([
    fetch(
      `${RXNAV_BASE}/rxclass/class/byRxcui.json?rxcui=${encodeURIComponent(rxcui)}&relaSource=ATC`,
      { signal }
    ),
    nameForStrengths
      ? fetch(
          `${RXNAV_BASE}/drugs.json?name=${encodeURIComponent(nameForStrengths)}`,
          { signal }
        )
      : Promise.resolve(null),
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
      `${logTag}: RxClass HTTP ${classResp.status} — defaulting to 'other'`
    );
  }

  let allowedStrengths: AllowedStrengths | undefined;
  if (drugsResp && drugsResp.ok) {
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

  return { medClass, allowedStrengths };
}
