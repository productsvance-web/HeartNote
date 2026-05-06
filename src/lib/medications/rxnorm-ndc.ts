// RxNav-backed resolution from a US NDC to an RxNorm concept + canonical
// product fields (ingredient, form, strength).
//
// Two endpoints:
//   1. /ndcstatus.json?ndc=<ndc> — returns active rxcui + conceptName
//      (e.g., "Midodrine Hydrochloride 2.5 MG Oral Tablet"). Status field
//      tells us whether the NDC is active, obsolete, or unknown.
//   2. /related.json?tty=IN+SCDF — given the rxcui, returns the
//      ingredient (IN) and dose form (SCDF). Form name from SCDF needs
//      the leading ingredient stripped, same as rxnorm.ts.
//
// Failure modes (all → return null, never throw):
//   - NDC unknown / obsolete → ndcStatus.status !== 'ACTIVE'
//   - HTTP non-2xx
//   - Network timeout (1500ms)
//   - Malformed JSON
//   - Combination products (slash-separator in conceptName) — strength
//     parsing can't disambiguate; caller falls back to OCR.
//
// PHI safety: outbound payload is the NDC string only. No caregiver or
// patient identifier. NDC alone is not PHI under HIPAA — it identifies a
// drug product, not a person.

const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST';
const TIMEOUT_MS = 1500;

export interface NdcResolution {
  rxcui: string;
  ingredient: string;
  form: string;
  strength: string;
  canonicalName: string;
}

export async function resolveByNdc(
  ndc: string,
  signal?: AbortSignal,
): Promise<NdcResolution | null> {
  const trimmed = ndc.trim();
  if (!trimmed) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const statusJson = await fetchJson<NdcStatusResponse>(
      `${RXNAV_BASE}/ndcstatus.json?ndc=${encodeURIComponent(trimmed)}`,
      controller.signal,
    );

    const status = statusJson?.ndcStatus?.status;
    const rxcui = statusJson?.ndcStatus?.rxcui;
    const conceptName = statusJson?.ndcStatus?.conceptName;
    if (status !== 'ACTIVE' || !rxcui || !conceptName) {
      return null;
    }

    const relatedJson = await fetchJson<RelatedResponse>(
      `${RXNAV_BASE}/rxcui/${encodeURIComponent(rxcui)}/related.json?tty=IN+SCDF`,
      controller.signal,
    );

    const ingredient = pickConceptName(relatedJson, 'IN');
    const formRaw = pickConceptName(relatedJson, 'SCDF');
    if (!ingredient || !formRaw) return null;

    const form = stripLeadingIngredient(formRaw, ingredient);
    if (!form) return null;

    const strength = parseStrength(conceptName, form);
    if (!strength) return null;

    return { rxcui, ingredient, form, strength, canonicalName: conceptName };
  } catch (err) {
    console.warn(`[rxnorm-ndc] fallback for ${trimmed}: ${errorReason(err)}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

interface NdcStatusResponse {
  ndcStatus?: {
    status?: string;
    rxcui?: string;
    conceptName?: string;
  };
}

interface RelatedResponse {
  relatedGroup?: {
    conceptGroup?: Array<{
      tty?: string;
      conceptProperties?: Array<{ rxcui?: string; name?: string }>;
    }>;
  };
}

function pickConceptName(json: RelatedResponse | null, tty: string): string | null {
  const groups = json?.relatedGroup?.conceptGroup ?? [];
  for (const g of groups) {
    if (g.tty === tty) {
      const n = g.conceptProperties?.[0]?.name;
      return typeof n === 'string' && n.length > 0 ? n : null;
    }
  }
  return null;
}

function stripLeadingIngredient(name: string, ingredient: string): string | null {
  const lower = name.toLowerCase();
  const ingLower = ingredient.toLowerCase();
  if (lower.startsWith(ingLower + ' ')) return name.slice(ingredient.length + 1).trim();
  return null;
}

// conceptName looks like:
//   "Midodrine Hydrochloride 2.5 MG Oral Tablet"
//   "Furosemide 40 MG Oral Tablet"
// The ingredient prefix may be the salted form ("Midodrine Hydrochloride")
// while the IN-tty ingredient is the unsalted base ("midodrine"). Strategy:
// strip the form suffix, then capture from the first numeric token onward.
//
// Combination products use " / " as separator — e.g.,
//   "Losartan 50 MG / Hydrochlorothiazide 12.5 MG Oral Tablet"
// Naive "first digit to form" extraction yields a corrupted strength
// for combos. Many CHF-relevant meds are combos (HCTZ-containing ARBs,
// fixed-dose β-blocker pairs), so bail and let the caller fall back to OCR.
function parseStrength(conceptName: string, form: string): string | null {
  if (conceptName.includes(' / ')) return null;
  const suffix = ' ' + form;
  if (!conceptName.endsWith(suffix)) return null;
  const head = conceptName.slice(0, -suffix.length);
  const m = /\d/.exec(head);
  if (!m) return null;
  return head.slice(m.index).trim();
}

function errorReason(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return 'timeout';
    return err.message;
  }
  return 'unknown';
}
