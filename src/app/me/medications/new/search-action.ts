'use server';

// Public server action that wraps the bundled-index search.
//
// `'use server'` exposes a callable POST endpoint regardless of which
// page imports the action — the security boundary travels with the
// function, not with the route's auth gate. Auth + input validation
// live in `authedSearch` (rxnorm-search.ts), unit-tested without
// mocking the Supabase client.

import { createClient } from '@/lib/supabase/server';
import { authedSearch } from '@/lib/medications/rxnorm-search';
import type { DrugSearchResult } from '@/lib/medications/rxnorm';

export async function searchMedications(query: string): Promise<DrugSearchResult[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return authedSearch(user?.id ?? null, query);
}
