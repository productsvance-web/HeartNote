---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.sql"
  - "**/*.py"
---

# Code quality — anti-patterns to prevent

Audit reference for code review and ongoing development. Loaded automatically when touching code files. For explicit audits: *"audit `<path>` against `.claude/rules/code-quality.md`."*

These three patterns are the most common drift sources in long-lived codebases. Catch them before they spread.

## 1. Scattered constants

The same magic number or string appears in multiple files, slightly different each time.

Wrong:
```ts
// alerts/weight.ts
if (weightChange >= 4) // ...

// dashboard/banner.tsx
if (gainOverWeek > 5) // ...

// trends/chart.tsx
if (weight > 3) // ...
```

Right — one place, every consumer imports:
```ts
// lib/clinical/thresholds.ts
export const WEIGHT_GAIN_TIER_2_LB = 5;  // cited: research/chf-source-of-truth.md

// alerts/weight.ts
import { WEIGHT_GAIN_TIER_2_LB } from "@/lib/clinical/thresholds";
if (weightChange >= WEIGHT_GAIN_TIER_2_LB) // ...
```

**HeartNote-specific:** every clinical number lives in `src/lib/clinical/thresholds.ts` with a citation comment pointing at the line in `research/chf-source-of-truth.md`. Hardcoding a clinical value anywhere else is a bug.

## 2. Duplicated business logic

The same decision logic gets reimplemented in different places, slightly different each time.

Wrong:
- `alerts/route.ts` has its own "is weight gain dangerous?" check
- `dashboard/page.tsx` reimplements it with slightly different rules
- `visit-report/draft.ts` does its own version

Three implementations drift over time. Two say "all clear," one fires red. Users lose trust.

Right — one function, every consumer calls it:
```ts
// lib/alerts/evaluate.ts
export function evaluateAlertTier(
  log: DailyLog,
  patient: Patient
): AlertCandidate | null { /* ... */ }

// alerts/route.ts → calls evaluateAlertTier()
// dashboard/page.tsx → calls evaluateAlertTier()
// visit-report/draft.ts → calls evaluateAlertTier()
```

**Detection rule:** if you can grep for similar logic in 2+ files, that's a candidate to extract — but only after the third occurrence (rule of three from Karpathy guidelines in CLAUDE.md).

## 3. Database is the source of truth

Values stored in React state, localStorage, or in-memory caches drift from the database. Two screens disagree, users assume the app is broken.

Wrong:
```tsx
const [currentTrend, setCurrentTrend] = useState(computeTrend());
// trend gets stale; refresh shows different data than what's in the DB
```

Right — query the DB, derive on the fly:
```tsx
const { data: logs } = useDailyLogs(patientId, { days: 7 });
const trend = useMemo(() => computeTrend(logs), [logs]);
// always reflects the database; refresh is consistent
```

**The rule:** `daily_logs`, `alerts`, `medications`, etc. are canonical. Never store derived values in component state if the source data is in the DB. Compute derived values in render or via DB views.

---

For the higher-level coding principles (think before coding, simplicity, surgical changes, goal-driven), see CLAUDE.md `IMPORTANT` block — those load on every prompt.
