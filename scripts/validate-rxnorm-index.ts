// Prebuild validator for the bundled RxNorm index. Fails the build (exit 1)
// if the file is missing, malformed, or empty. Runs from package.json's
// "prebuild" script so a deploy can never silently ship without an index.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const INDEX_PATH = join(
  process.cwd(),
  'src/lib/medications/data/rxnorm-index.json'
);

const IndexConcept = z.object({
  rxcui: z.string().min(1),
  name: z.string().min(1),
  tty: z.enum(['IN', 'BN']),
  search: z.string().min(1),
  ingredient: z.string().min(1).optional(),
  ingredientRxcui: z.string().min(1).optional(),
});

const IndexFile = z.object({
  fetchedAt: z.string().min(1),
  concepts: z.array(IndexConcept).min(1),
});

let raw: string;
try {
  raw = readFileSync(INDEX_PATH, 'utf8');
} catch (err) {
  console.error(`✗ ${INDEX_PATH} not readable: ${(err as Error).message}`);
  console.error('  Run: npm run rxnorm:refresh');
  process.exit(1);
}

let parsed: unknown;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  console.error(`✗ ${INDEX_PATH} is not valid JSON: ${(err as Error).message}`);
  process.exit(1);
}

const result = IndexFile.safeParse(parsed);
if (!result.success) {
  console.error(`✗ ${INDEX_PATH} failed schema validation:`);
  console.error(result.error.message);
  process.exit(1);
}

console.log(`✓ rxnorm-index.json: ${result.data.concepts.length} concepts (fetched ${result.data.fetchedAt})`);
