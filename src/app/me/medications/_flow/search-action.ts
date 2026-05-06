'use server';

// Server action wrapper around the bundled-index drug search. `'use
// server'` exposes a callable POST endpoint regardless of which page
// imports it — the auth boundary travels with the function, not with the
// route. Auth + input validation live in `authedSearch`.

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
