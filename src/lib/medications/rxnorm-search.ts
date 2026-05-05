// In-memory substring search over the bundled RxNorm IN+BN concept index.
//
// Replaces the live RxNav /approximateTerm call that ranked by edit distance
// (returning Sun Bum sunscreens for "bum" instead of bumetanide). Index
// shape is stable JSON committed at src/lib/medications/data/rxnorm-index.json
// and refreshed monthly via `npm run rxnorm:refresh`.
//
// Bundle isolation contract: the only callers of this module are the
// 'use server' action at src/app/me/medications/new/search-action.ts and
// the offline test file. No client component imports from here. The
// build's bundle-leakage AC enforces this property by grepping
// `.next/static/` for the index's distinctive `fetchedAt` field — a leak
// would surface there. (We avoid `import 'server-only'` because it's a
// Next.js build-time swap-out that throws in plain `node --test`,
// breaking the offline test harness for `authedSearch`.)
//
// Ranking: prefix > word-boundary > substring; within each tier shorter
// name first, alphabetical on ties. See
// docs/plans/medications-search-bundled-index.md Decision 4.

import { z } from 'zod';
import indexJson from './data/rxnorm-index.json' with { type: 'json' };
import { MIN_QUERY_LEN, type DrugSearchResult } from './rxnorm.ts';

const DEFAULT_LIMIT = 10;
const MAX_QUERY_LEN = 100;

export const IndexConceptSchema = z.object({
  rxcui: z.string(),
  name: z.string(),
  tty: z.enum(['IN', 'BN']),
  search: z.string(),
  ingredient: z.string().optional(),
  ingredientRxcui: z.string().optional(),
});

export type IndexConcept = z.infer<typeof IndexConceptSchema>;

interface IndexFile {
  fetchedAt: string;
  concepts: IndexConcept[];
}

const QuerySchema = z.string().trim().min(MIN_QUERY_LEN).max(MAX_QUERY_LEN);

// Module-scope import is parsed once per function instance (Node module cache).
// The cast is safe because validate-rxnorm-index.ts gates the build.
const INDEX = indexJson as IndexFile;

// Server-action entry point. Handles the two boundaries the action needs
// to enforce: authentication and input validation. Pure in its inputs so
// the auth gate is testable without mocking the Supabase client.
export function authedSearch(
  userId: string | null,
  query: string
): DrugSearchResult[] {
  if (!userId) return [];
  const parsed = QuerySchema.safeParse(query);
  if (!parsed.success) return [];
  return searchByIndex(parsed.data);
}

export function searchByIndex(query: string, limit: number = DEFAULT_LIMIT): DrugSearchResult[] {
  const q = query.trim().toLowerCase();
  if (q.length < MIN_QUERY_LEN) return [];

  const tier1: IndexConcept[] = [];
  const tier2: IndexConcept[] = [];
  const tier3: IndexConcept[] = [];

  const wordBoundary = new RegExp(`\\b${escapeRegex(q)}`, 'i');

  for (const c of INDEX.concepts) {
    if (c.search.startsWith(q)) {
      tier1.push(c);
    } else if (wordBoundary.test(c.search)) {
      tier2.push(c);
    } else if (c.search.includes(q)) {
      tier3.push(c);
    }
  }

  for (const tier of [tier1, tier2, tier3]) {
    tier.sort(
      (a, b) =>
        a.name.length - b.name.length || a.name.localeCompare(b.name)
    );
  }

  return [...tier1, ...tier2, ...tier3]
    .slice(0, limit)
    .map(toDrugSearchResult);
}

// RxNorm stores IN names lowercase ("bumetanide") and BN names as-displayed
// ("Bumex"). Title-case at the presentation boundary so the result list and
// downstream stored medication rows are consistent. The `search` field
// stays lowercased — used for matching only, never displayed.
function toDrugSearchResult(c: IndexConcept): DrugSearchResult {
  if (c.tty === 'BN') {
    return {
      rxcui: c.rxcui,
      name: titleCase(c.name),
      type: 'brand',
      ingredient: c.ingredient ? titleCase(c.ingredient) : undefined,
      ingredientRxcui: c.ingredientRxcui,
    };
  }
  return { rxcui: c.rxcui, name: titleCase(c.name), type: 'generic' };
}

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
