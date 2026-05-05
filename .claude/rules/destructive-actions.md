# Destructive actions — confirmation discipline

Loaded automatically (no path filter). Required reading when planning, implementing, or reviewing any feature whose action permanently destroys data.

## The rule

Confirmation prompts on destructive actions MUST echo the target's identifying field (email, display name, ID, file path) so the user can verify they're operating on the entity they think they are. Vague copy like "are you sure you want to delete your account?" is forbidden.

## Why

A real production bug shipped past plan-review and code-review: a user with a stale OAuth session for account A clicked "Delete and start over" on /onboarding believing they were account B. The vague confirm gave no signal of the mismatch. Account A got deleted instead.

Industry mitigations are well-known: GitHub's "type the repo name to confirm", Stripe's destructive-action confirmations, Vercel's project-delete dialog all echo the target identity to force the user to internalize what's about to be destroyed.

## Apply when

- The action is irreversible (delete account, delete patient record, drop table, force-push, kill API key)
- The action is reversible but high-cost to undo (sign out all devices, revoke session, archive project)

## How to comply

For all destructive actions:

- Confirmation copy templates in the user-meaningful identifier of the target. Example: `"Permanently delete ${email} and all data?"` — never `"Permanently delete this account?"`.
- The confirmation copy explicitly names the noun being destroyed ("account", "patient record", "voice log") rather than "this" or "it".

For class-A irreversible destruction (account, all-data, repo, dataset wipe):

- Use typed-confirmation, not just `window.confirm()`. The user types the target identity verbatim into a textbox; the destructive button enables only on exact match.
- `window.confirm()` is acceptable only for class-B (reversible-with-effort) operations.

## In acceptance criteria

When proposing ACs for any destructive feature, include a Functional AC of the form:

> Confirmation dialog displays the target's identity (email/name/ID) verbatim. Vague copy like "this account" is a fail.

When dispatching plan-review or code-review subagents on destructive features, prompt them to verify identity echo specifically.

## Examples

| Action | Class | Confirmation pattern |
|---|---|---|
| Delete user account | A | Typed: "Type your email to confirm" + button enables on exact match |
| Delete a patient record | A | Typed: "Type the patient's name to confirm" |
| Sign out all devices | B | `confirm("Sign out of all devices for ${email}?")` |
| Delete a single voice log | B | `confirm("Delete the log from ${date}?")` |
| Force-push to main | A | Typed branch name + button enables on match |

