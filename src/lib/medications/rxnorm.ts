// RxNorm API wrappers for the medication-add wizard.
//
// Two endpoints, both via the public NLM RxNav API (no key required):
//   1. searchDrug(query) — fuzzy match on the typed string. Returns top
//      ingredients (IN) and brand names (BN), capped at 10. Brand results
//      carry their generic ingredient.
//   2. getDrugDetails(...) — for a picked drug, returns the canonical form
//      list and per-form strengths. Brand inputs also include the brand's
//      specific form so the wizard can preselect it.
//
// Latency budget: 1500ms shared deadline per searchDrug or getDrugDetails
// invocation. AbortController propagates the deadline to every nested
// fetch (gRPC-style deadline propagation), so a slow first call shortens
// the budget for downstream parallel calls. Failures fall back to empty
// results; the calling step shows its own error UI per plan ACs.
//
// Rate limiting: NLM caps RxNav at 20 requests/second/IP. searchDrug fans
// out concurrently for TTY checks and brand→ingredient resolution; we cap
// per-stage concurrency at MAX_PARALLEL to stay polite under load and to
// keep two simultaneous user searches from tripping the limit. NLM also
// recommends 12-24h response caching for production traffic — that lives
// in a future PR (see wizard plan's Future Improvements).
//
// PHI safety: outbound payload is the typed string or an RxCUI — no
// patient identifier, no caregiver identifier.

const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST';
const TIMEOUT_MS = 1500;
const SEARCH_RESULT_CAP = 10;
const APPROX_OVERFETCH = 20;
const MAX_PARALLEL = 8;

// RxNorm dose form → singular/plural noun for the wizard's
// "How many ___ per dose?" question. Only discrete-dose forms appear here;
// volume/topical/dose-by-application forms (cream, oral solution, etc.)
// are absent and the wizard skips the count question for those. Keys must
// match RxNorm's exact dose-form display name.
export const FORM_COUNT_NOUN: Record<string, { single: string; plural: string }> = {
  'Oral Tablet': { single: 'tablet', plural: 'tablets' },
  'Oral Capsule': { single: 'capsule', plural: 'capsules' },
  'Sublingual Tablet': { single: 'tablet', plural: 'tablets' },
  'Buccal Tablet': { single: 'tablet', plural: 'tablets' },
  'Chewable Tablet': { single: 'tablet', plural: 'tablets' },
  'Disintegrating Oral Tablet': { single: 'tablet', plural: 'tablets' },
  'Extended Release Oral Capsule': { single: 'capsule', plural: 'capsules' },
  'Extended Release Oral Tablet': { single: 'tablet', plural: 'tablets' },
  'Delayed Release Oral Capsule': { single: 'capsule', plural: 'capsules' },
  'Delayed Release Oral Tablet': { single: 'tablet', plural: 'tablets' },
  'Sublingual Spray': { single: 'spray', plural: 'sprays' },
  'Nasal Spray': { single: 'spray', plural: 'sprays' },
  'Inhalation Aerosol': { single: 'puff', plural: 'puffs' },
  'Inhalation Powder': { single: 'puff', plural: 'puffs' },
  'Suppository': { single: 'suppository', plural: 'suppositories' },
  'Rectal Suppository': { single: 'suppository', plural: 'suppositories' },
  'Vaginal Suppository': { single: 'suppository', plural: 'suppositories' },
  'Transdermal Patch': { single: 'patch', plural: 'patches' },
  '24 HR Transdermal Patch': { single: 'patch', plural: 'patches' },
};

export interface DrugSearchResult {
  rxcui: string;
  name: string;
  type: 'brand' | 'generic';
  // Set only when type === 'brand'.
  ingredient?: string;
  ingredientRxcui?: string;
}

export interface FormWithStrengths {
  // Display name verbatim from RxNorm (e.g., "Oral Tablet"). No friendly
  // renaming in v1.
  name: string;
  // Strength expressions, deduped, sorted by leading numeric value when
  // available.
  strengths: string[];
}

export interface DrugDetails {
  forms: FormWithStrengths[];
  // Set only when input was a brand. Wizard preselects this in the Form
  // step. Null on generic input or if the brand→form lookup failed.
  preselectedForm: string | null;
}

// ────────────────────────────────────────────────────────────────────────
// searchDrug
// ────────────────────────────────────────────────────────────────────────

export async function searchDrug(query: string): Promise<DrugSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const approxJson = await fetchJson<ApproximateResponse>(
      `${RXNAV_BASE}/approximateTerm.json?term=${encodeURIComponent(trimmed)}&maxEntries=${APPROX_OVERFETCH}`,
      controller.signal
    );

    const raw = approxJson?.approximateGroup?.candidate ?? [];

    // Dedupe by rxcui (RxNav surfaces the same concept under multiple
    // source vocabularies — USP, RXNORM, ATC, …) and drop names that
    // obviously aren't IN/BN: brackets/slashes/parens are products, names
    // with strength notation ("40 MG") are clinical drugs, names with
    // form-suffix words ("Tablet") are products. Keeps the per-result TTY
    // fan-out small enough to fit the 1500ms shared budget on broad
    // searches like "lasix" that match many SBDs.
    const seen = new Set<string>();
    const deduped: Array<{ rxcui: string; name: string }> = [];
    for (const c of raw) {
      if (!c.rxcui || !c.name || seen.has(c.rxcui)) continue;
      if (!looksLikeIngredientOrBrand(c.name)) continue;
      seen.add(c.rxcui);
      deduped.push({ rxcui: c.rxcui, name: c.name });
    }

    // Bounded-concurrency TTY lookup. approximateTerm matches against any
    // term type; we keep only IN (generic ingredient) and BN (brand name)
    // so the wizard's first screen surfaces conceptual drugs rather than
    // specific products. MAX_PARALLEL caps how many concurrent /property
    // calls we send — staying under NLM's 20 rps limit even when two
    // caregivers search at the same time.
    const ttied = await mapWithConcurrency(deduped, MAX_PARALLEL, async (c) => {
      try {
        const j = await fetchJson<PropertyResponse>(
          `${RXNAV_BASE}/rxcui/${encodeURIComponent(c.rxcui)}/property.json?propName=TTY`,
          controller.signal
        );
        const tty = j?.propConceptGroup?.propConcept?.[0]?.propValue;
        return { ...c, tty };
      } catch {
        return null;
      }
    });

    const filtered = ttied
      .filter(
        (c): c is { rxcui: string; name: string; tty: string } =>
          c !== null && (c.tty === 'IN' || c.tty === 'BN')
      )
      .slice(0, SEARCH_RESULT_CAP);

    // Brand → ingredient resolution, also concurrency-capped.
    return await mapWithConcurrency(filtered, MAX_PARALLEL, async (c): Promise<DrugSearchResult> => {
      if (c.tty !== 'BN') {
        return { rxcui: c.rxcui, name: c.name, type: 'generic' };
      }
      try {
        const j = await fetchJson<RelatedResponse>(
          `${RXNAV_BASE}/rxcui/${encodeURIComponent(c.rxcui)}/related.json?tty=IN`,
          controller.signal
        );
        const ing = j?.relatedGroup?.conceptGroup?.[0]?.conceptProperties?.[0];
        return {
          rxcui: c.rxcui,
          name: c.name,
          type: 'brand',
          ingredient: ing?.name,
          ingredientRxcui: ing?.rxcui,
        };
      } catch {
        // Graceful: brand row renders without sub-line.
        return { rxcui: c.rxcui, name: c.name, type: 'brand' };
      }
    });
  } catch (err) {
    console.warn(`[rxnorm.searchDrug] fallback to [] for "${trimmed}": ${errorReason(err)}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ────────────────────────────────────────────────────────────────────────
// getDrugDetails
// ────────────────────────────────────────────────────────────────────────

export async function getDrugDetails(input: {
  rxcui: string;
  type: 'brand' | 'generic';
  drugName: string;
  ingredientName?: string;
  ingredientRxcui?: string;
  // Caller-supplied cancellation. The 1500ms internal deadline still
  // applies; this just lets the wizard abort an in-flight fetch when
  // the user picks a different drug before the response returns.
  signal?: AbortSignal;
}): Promise<DrugDetails> {
  // For brands, all forms+strengths are sourced from the underlying
  // ingredient (Lasix's available forms = furosemide's available forms).
  // The brand's specific form (preselected) comes from the SBDF lookup.
  const ingRxcui =
    input.type === 'brand' && input.ingredientRxcui
      ? input.ingredientRxcui
      : input.rxcui;
  const ingName = input.ingredientName ?? input.drugName;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (input.signal) {
    if (input.signal.aborted) controller.abort();
    else
      input.signal.addEventListener('abort', () => controller.abort(), {
        once: true,
      });
  }

  try {
    // Batched: SCDF (forms) + SCD (drugs with strengths) come back from a
    // single /relatedByType call against the ingredient rxcui. Brand inputs
    // additionally fetch SBDFs from the brand's rxcui — that's a separate
    // call because the rxcui differs.
    const [ingredientJson, brandJson] = await Promise.all([
      fetchJson<RelatedResponse>(
        `${RXNAV_BASE}/rxcui/${encodeURIComponent(ingRxcui)}/related.json?tty=SCDF+SCD`,
        controller.signal
      ),
      input.type === 'brand'
        ? fetchJson<RelatedResponse>(
            `${RXNAV_BASE}/rxcui/${encodeURIComponent(input.rxcui)}/related.json?tty=SBDF`,
            controller.signal
          )
        : Promise.resolve(null),
    ]);

    // Form list from SCDFs ("furosemide Oral Tablet"). Strip ingredient
    // prefix and dedupe.
    const formNames = uniqueValues(
      extractConceptsOfTty(ingredientJson, 'SCDF')
        .map((n) => stripLeadingIngredient(n, ingName))
        .filter((n): n is string => !!n && n.length > 0)
    ).sort();

    // Strengths from SCDs ("furosemide 40 MG Oral Tablet"). Group by form.
    const formToStrengths = new Map<string, Set<string>>();
    for (const f of formNames) formToStrengths.set(f, new Set());
    for (const scdName of extractConceptsOfTty(ingredientJson, 'SCD')) {
      const parsed = parseScdName(scdName, ingName, formNames);
      if (!parsed) continue;
      formToStrengths.get(parsed.form)?.add(parsed.strength);
    }

    const forms: FormWithStrengths[] = formNames.map((name) => ({
      name,
      strengths: sortStrengths(Array.from(formToStrengths.get(name) ?? [])),
    }));

    // Preselected form (brand only) from SBDFs ("furosemide Oral Tablet
    // [Lasix]"). A single brand can carry multiple SBDFs (Lasix has both
    // "Oral Tablet" and "Cartridge"). Prefer the most common ambulatory
    // form: oral solid first, then anything in FORM_COUNT_NOUN, then first.
    let preselectedForm: string | null = null;
    if (input.type === 'brand' && brandJson) {
      const sbdfForms = extractConceptsOfTty(brandJson, 'SBDF')
        .map((n) =>
          stripLeadingIngredient(n, ingName)?.replace(/\s*\[[^\]]+\]\s*$/, '')
        )
        .filter((n): n is string => !!n && formNames.includes(n));
      preselectedForm = pickPreferredForm(sbdfForms);
    }

    return { forms, preselectedForm };
  } catch (err) {
    console.warn(
      `[rxnorm.getDrugDetails] fallback for ${input.rxcui}: ${errorReason(err)}`
    );
    return { forms: [], preselectedForm: null };
  } finally {
    clearTimeout(timeout);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

interface ApproximateResponse {
  approximateGroup?: {
    candidate?: Array<{ rxcui?: string; name?: string }>;
  };
}

interface PropertyResponse {
  propConceptGroup?: {
    propConcept?: Array<{ propValue?: string }>;
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

// Run `fn` over `items` with at most `limit` promises in flight. Used to
// stay polite against NLM's 20 rps RxNav rate limit when fanning out TTY
// or ingredient lookups across search results. Worker-pool pattern —
// preserves input order in the result array. Exported for reuse by
// scan/extract.ts so the NDC fan-out shares the same concurrency cap.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

function extractConceptsOfTty(json: RelatedResponse | null, tty: string): string[] {
  const groups = json?.relatedGroup?.conceptGroup ?? [];
  for (const g of groups) {
    if (g.tty === tty) {
      return (g.conceptProperties ?? [])
        .map((cp) => cp.name)
        .filter((n): n is string => typeof n === 'string');
    }
  }
  return [];
}

function stripLeadingIngredient(name: string, ingredientName: string): string | null {
  if (!ingredientName) return name;
  const lower = name.toLowerCase();
  const ingLower = ingredientName.toLowerCase();
  if (lower.startsWith(ingLower + ' ')) {
    return name.slice(ingredientName.length + 1).trim();
  }
  return null;
}

function uniqueValues(items: string[]): string[] {
  return Array.from(new Set(items));
}

function parseScdName(
  scdName: string,
  ingredientName: string,
  validForms: string[]
): { form: string; strength: string } | null {
  // Skip combinations: "ingredientA … / ingredientB …" pattern.
  if (/\s\/\s[A-Za-z]+\s\d/.test(scdName)) return null;

  // Strip leading volume prefix (e.g., "10 ML furosemide 10 MG/ML Injection").
  const noVolume = scdName.replace(/^\d+(?:\.\d+)?\s+ML\s+/i, '');

  const withoutIngredient = stripLeadingIngredient(noVolume, ingredientName);
  if (!withoutIngredient) return null;

  for (const form of validForms) {
    const suffix = ' ' + form;
    if (withoutIngredient.endsWith(suffix)) {
      const strength = withoutIngredient.slice(0, -suffix.length).trim();
      if (strength) return { form, strength };
    }
  }
  return null;
}

function sortStrengths(strengths: string[]): string[] {
  return strengths.slice().sort((a, b) => {
    const na = parseFloat(a);
    const nb = parseFloat(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
}

function errorReason(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return 'timeout';
    return err.message;
  }
  return 'unknown';
}

// Reject obvious non-IN/non-BN candidates from approximateTerm output so
// the per-result TTY fan-out stays small. INs are usually a single
// lowercase word ("furosemide"); BNs are short and typically capitalized
// ("Lasix"). Anything with brackets/slashes/parens is a packaged product;
// anything with strength notation ("40 MG", "10 MG/ML", "1 %") is a
// clinical drug; anything mentioning a form-suffix word is a product.
//
// Exported for tests — treat as internal to this module.
export function looksLikeIngredientOrBrand(name: string): boolean {
  if (name.length > 40) return false;
  if (/[\[\]/()]/.test(name)) return false;
  // Strength notation: digit + optional decimal + optional space + unit.
  // Allows digit-bearing brand names without strength units (e.g.,
  // "Tylenol 8 HR", "Vitamin D3", "B-12") through to TTY check.
  if (/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|%)\b/i.test(name)) return false;
  if (
    /\b(Tablet|Capsule|Solution|Injection|Cream|Ointment|Powder|Pill|Product|Suppository|Patch|Spray|Injectable|Drop|Drops|Aerosol|Lozenge|Cartridge|Inhaler|Gel|Lotion|Foam|Liquid|Syrup|Emulsion|Suspension|Granules|Film|Disc)\b/i.test(
      name
    )
  ) {
    return false;
  }
  return true;
}

// Among a brand's available forms, pick the one a typical caregiver
// expects: oral solid first, then any other discrete-dose form, then the
// first remaining option. Encodes Apple's behavior of pre-selecting "Oral
// Tablet" for Lasix even though Lasix also has a Cartridge form.
const PREFERRED_FORM_ORDER = [
  'Oral Tablet',
  'Oral Capsule',
  'Extended Release Oral Tablet',
  'Extended Release Oral Capsule',
  'Sublingual Tablet',
  'Chewable Tablet',
  'Disintegrating Oral Tablet',
];

function pickPreferredForm(candidates: string[]): string | null {
  if (candidates.length === 0) return null;
  for (const preferred of PREFERRED_FORM_ORDER) {
    if (candidates.includes(preferred)) return preferred;
  }
  for (const c of candidates) {
    if (c in FORM_COUNT_NOUN) return c;
  }
  return candidates[0];
}
