// RxNorm getDrugDetails wrapper for the medication-add wizard.
//
// Search has moved to src/lib/medications/rxnorm-search.ts (in-memory
// substring search over a bundled index). This module now owns only the
// per-pick form/strength lookup, which still hits the live NLM RxNav API.
//
// Latency budget: 1500ms shared deadline per getDrugDetails invocation.
// AbortController propagates the deadline to every nested fetch (gRPC-
// style deadline propagation), so a slow first call shortens the budget
// for downstream parallel calls. Failures fall back to empty results;
// the calling step shows its own error UI.
//
// PHI safety: outbound payload is the picked drug's RxCUI — no patient
// or caregiver identifier.

const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST';
const TIMEOUT_MS = 1500;

// Minimum trimmed query length before the wizard's Search step fires a
// network request. Lives here (universal module) so both client code
// (step-search.tsx) and server code (rxnorm-search.ts) read the same
// constant without either accidentally bundling the 3MB RxNorm index.
export const MIN_QUERY_LEN = 3;

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

// RxNorm dose form → short caregiver-facing label for display only. Lives
// alongside FORM_COUNT_NOUN because both translate the same vocabulary.
// The RxNorm verbatim form is still what we persist to medications.form;
// this map is the display layer only. Caregiver-noticed regression: the
// raw "Oral Tablet" leaked into the scan-review screen of PR #37.
const FORM_DISPLAY: Record<string, string> = {
  'Oral Tablet': 'tablet',
  'Sublingual Tablet': 'tablet',
  'Buccal Tablet': 'tablet',
  'Chewable Tablet': 'tablet',
  'Disintegrating Oral Tablet': 'tablet',
  'Extended Release Oral Tablet': 'tablet',
  'Delayed Release Oral Tablet': 'tablet',
  'Oral Capsule': 'capsule',
  'Extended Release Oral Capsule': 'capsule',
  'Delayed Release Oral Capsule': 'capsule',
  'Oral Solution': 'solution',
  'Injectable Solution': 'injection',
};

export function normalizeForm(raw: string | null): string | null {
  if (!raw) return null;
  return FORM_DISPLAY[raw] ?? raw.toLowerCase();
}

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

interface RelatedResponse {
  relatedGroup?: {
    conceptGroup?: Array<{
      tty?: string;
      conceptProperties?: Array<{ rxcui?: string; name?: string }>;
    }>;
  };
}

// Run `fn` over `items` with at most `limit` promises in flight. Originally
// used by searchDrug for TTY fan-out; that path was removed in the bundled
// RxNorm index migration. Now used by scan/enrich.ts for NDC resolution
// fan-out — keeps the 8-parallel cap consistent and the helper colocated
// with the only other RxNav-touching code in the wizard module.
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
