// Refresh the bundled RxNorm IN+BN concept index used by the wizard's
// Search step. Runs against the live NLM RxNav API; emits
// src/lib/medications/data/rxnorm-index.json.
//
// Usage:
//   npm run rxnorm:refresh
//
// Failure mode is fail-loud: on persistent 429 / network error the script
// aborts and writes nothing. The previous index file stays committed.
// This is intentional — better to retry than to ship a half-baked index.
//
// PHI safety: outbound payload is the public concept dump and per-rxcui
// IN lookups. No patient data, no caregiver identifier.

import { createHash } from 'node:crypto';
import { writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const ALLCONCEPTS_URL =
  'https://rxnav.nlm.nih.gov/REST/allconcepts.json?tty=IN+BN';
const RELATED_URL = (rxcui: string) =>
  `https://rxnav.nlm.nih.gov/REST/rxcui/${encodeURIComponent(rxcui)}/related.json?tty=IN`;
const OUTPUT_PATH = join(
  process.cwd(),
  'src/lib/medications/data/rxnorm-index.json'
);
const MAX_PARALLEL = 8;
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 2000;

// ─── Schemas ───────────────────────────────────────────────────────────

const MinConcept = z.object({
  rxcui: z.string(),
  name: z.string(),
  tty: z.enum(['IN', 'BN']),
});

const AllConceptsResponse = z.object({
  minConceptGroup: z.object({
    minConcept: z.array(MinConcept),
  }),
});

const RelatedResponse = z.object({
  relatedGroup: z
    .object({
      conceptGroup: z
        .array(
          z.object({
            tty: z.string().optional(),
            conceptProperties: z
              .array(
                z.object({
                  rxcui: z.string().optional(),
                  name: z.string().optional(),
                })
              )
              .optional(),
          })
        )
        .optional(),
    })
    .optional(),
});

interface IndexConcept {
  rxcui: string;
  name: string;
  tty: 'IN' | 'BN';
  search: string;
  ingredient?: string;
  ingredientRxcui?: string;
}

// ─── Fetch with retry ──────────────────────────────────────────────────

async function fetchJsonWithRetry(url: string): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const r = await fetch(url);
      if (r.status === 429) {
        const wait = BACKOFF_BASE_MS * Math.pow(2, attempt);
        await sleep(wait);
        continue;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return await r.json();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await sleep(BACKOFF_BASE_MS * Math.pow(2, attempt));
      }
    }
  }
  throw new Error(
    `Exhausted ${MAX_RETRIES} retries for ${url}: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Worker-pool fan-out preserving input order. Aborts on first failure
// so we don't burn 5 minutes of NLM goodwill writing a partial index.
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let completed = 0;
  let aborted: Error | null = null;

  async function worker() {
    while (true) {
      if (aborted) return;
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await fn(items[i], i);
        completed++;
        if (completed % 500 === 0) {
          console.log(`  ${completed} / ${items.length} BN→IN lookups done`);
        }
      } catch (err) {
        aborted = err instanceof Error ? err : new Error(String(err));
        return;
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  if (aborted) throw aborted;
  return results;
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`Fetching ${ALLCONCEPTS_URL}`);
  const rawAll = await fetchJsonWithRetry(ALLCONCEPTS_URL);
  const parsed = AllConceptsResponse.parse(rawAll);
  const concepts = parsed.minConceptGroup.minConcept;
  const inCount = concepts.filter((c) => c.tty === 'IN').length;
  const bnCount = concepts.filter((c) => c.tty === 'BN').length;
  console.log(`Got ${concepts.length} concepts (${inCount} IN, ${bnCount} BN)`);

  // Fan out BN→IN lookups. Most BNs have a single IN; some (combinations
  // marketed under one brand) have multiple — we take the first.
  const brands = concepts.filter((c) => c.tty === 'BN');
  console.log(`Resolving ${brands.length} BN→IN lookups (max ${MAX_PARALLEL} concurrent)…`);

  const brandIngredients = await mapWithConcurrency(
    brands,
    MAX_PARALLEL,
    async (b) => {
      const raw = await fetchJsonWithRetry(RELATED_URL(b.rxcui));
      const related = RelatedResponse.safeParse(raw);
      if (!related.success) return null;
      const groups = related.data.relatedGroup?.conceptGroup ?? [];
      for (const g of groups) {
        if (g.tty !== 'IN') continue;
        const first = g.conceptProperties?.[0];
        if (first?.name && first?.rxcui) {
          return { name: first.name, rxcui: first.rxcui };
        }
      }
      return null;
    }
  );

  // Map keyed by rxcui so the per-concept BN→IN lookup is O(1) — the
  // earlier findIndex variant was O(n²) at ~100M comparisons across 19k
  // concepts × 5k brands.
  const brandResolved = new Map<string, { name: string; rxcui: string } | null>();
  for (let i = 0; i < brands.length; i++) {
    brandResolved.set(brands[i].rxcui, brandIngredients[i]);
  }

  const indexEntries: IndexConcept[] = [];
  let bnWithIngredient = 0;
  for (const c of concepts) {
    const entry: IndexConcept = {
      rxcui: c.rxcui,
      name: c.name,
      tty: c.tty,
      search: c.name.trim().toLowerCase(),
    };
    if (c.tty === 'BN') {
      const resolved = brandResolved.get(c.rxcui);
      if (resolved) {
        entry.ingredient = resolved.name;
        entry.ingredientRxcui = resolved.rxcui;
        bnWithIngredient++;
      }
    }
    indexEntries.push(entry);
  }

  // Stable diffs across refreshes: sort by rxcui ascending.
  indexEntries.sort((a, b) => a.rxcui.localeCompare(b.rxcui));

  const output = {
    fetchedAt: new Date().toISOString(),
    concepts: indexEntries,
  };

  const json = JSON.stringify(output, null, 2);
  writeFileSync(OUTPUT_PATH, json + '\n', 'utf8');

  const sha = createHash('sha256').update(json).digest('hex');
  const sizeBytes = statSync(OUTPUT_PATH).size;
  console.log('');
  console.log('────────────────────────────────────────');
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`  terms:                ${indexEntries.length}`);
  console.log(`  IN:                   ${inCount}`);
  console.log(`  BN:                   ${bnCount}`);
  console.log(`  BN with ingredient:   ${bnWithIngredient} / ${bnCount}`);
  console.log(`  size on disk:         ${sizeBytes} bytes`);
  console.log(`  sha256:               ${sha}`);
  console.log('────────────────────────────────────────');
}

main().catch((err) => {
  console.error('REFRESH FAILED:', err instanceof Error ? err.message : err);
  console.error('No file written. Re-run when the issue is resolved.');
  process.exit(1);
});
