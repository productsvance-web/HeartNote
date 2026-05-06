# Plain-English explanations

Loaded automatically (no path filter). Required reading whenever explaining a code change, a schema choice, a system behavior, or a tradeoff to the user — including in plans, clarifying questions, code-review write-ups, and post-implementation summaries.

## The rule

Lead with plain English. Always. Then layer the technical phrasing underneath if the user needs it.

When asking the user to make a decision, the first sentence describes what would actually happen in product terms — what mom would see, what the caregiver would see, what the app would do — *not* what a column would store, what a function would return, or which alert tier would fire. Code- or schema-shaped phrasing is allowed afterward, but never first.

Forbidden openings (technical-first):
- "T2.1 fires when…"
- "We'd write `dizziness, postural=true` into…"
- "The `evaluateAlertTier` function returns…"
- "An `alerts` table row gets…"
- "Schema-wise…"
- "AI reasoning: weight delta + nocturnal cough trigger compound rule…"

Required openings (plain-first):
- "When mom is gasping for air and can't finish a sentence, the home screen turns red and tells you to call 911."
- "If the caregiver says 'she felt dizzy when she stood up,' the app treats that differently than 'she's been dizzy all afternoon.' First one is a less-urgent watchpoint; second one is a same-day call."
- "Skipping a day of dictating doesn't fire an alert. The engine only acts on what got reported — silence is silence."

## Why

Tech-first phrasing forces the user to translate every paragraph into product reality before they can react. That's slow and lossy. Worse, it lets bad ideas slip through because the user can't tell from the jargon what the app would actually *do*.

Plain-first phrasing lets the user evaluate the proposal on the merits — does the app do the right thing for the caregiver and the patient? — before the implementation phrasing asks "does the schema make sense?" The implementation almost always works fine. It's the product behavior that needs scrutiny.

## Apply when

- Explaining what a code change does to the running app
- Explaining what a database schema choice means for a user
- Asking the user to choose between two implementations
- Summarizing what just shipped
- Writing acceptance criteria — every Functional AC is plain English (the existing `acceptance-criteria.md` rule already enforces "no vague verbs"; this one adds "no leading jargon")
- Any "AI reasoning"-style commentary in chat — strip it unless the user explicitly asks

## Don't apply

- The user explicitly asked for a technical explanation ("walk me through the SQL", "explain the function signature", "show me the regex").
- Code comments — those go to future-Claude and future-engineers, not the user, and follow the comment discipline in `CLAUDE.md`.
- Commit messages and PR descriptions — those are for engineers reading git history; technical phrasing is fine.

## Self-check before sending

Read the first sentence of any decision-prompt or behavior-explanation to the user. If it leads with a function name, table name, column name, tier code, rule ID, or the phrase "schema-wise," rewrite.
