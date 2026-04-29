# CLAUDE.md history — removed content archive

> Content removed from CLAUDE.md during cleanups. **Not loaded by Claude.** Kept for reference and possible recovery.

## 2026-04-29 — Pass 1 trim (74 → ~57 lines)

### Deleted entirely (with reason)

**"How to work in this folder" section, line:**
> Start sessions in `/Users/jazminescamilla/Desktop/heartnote/` (not the home folder).

Reason: Claude is already in the working directory by virtue of being invoked there.

**Auto-memory path:**
> Auto-memory: `~/.claude/projects/-Users-jazminescamilla-Desktop-heartnote/memory/`.

Reason: Environment fact Claude discovers from session context — not an instruction.

**Feedback-style line:**
> User feedback style: direct critical evaluation, no sycophancy. Dislikes rigid workflow skills.

Reason: Already in `~/.claude/projects/.../memory/feedback_style.md`. Don't double-document.

**Caregiving portion of "Never recommend":**
> Never recommend: quitting full-time caregiving for a traditional job

Reason: Already in `~/.claude/projects/.../memory/user_situation.md` + `feedback_execute_dont_delegate.md`.

**Inline `git log` instruction (was inside Status section):**
> Run `git log --oneline -25` for recent work

Reason: Was running on every session start. Now lives in `docs/status.md` as a pointer, loaded only when feature work is started.

### Moved (not deleted)

| Old CLAUDE.md content | New location |
|---|---|
| "Founder lives the use case ... — that's the moat" | `docs/product.md` (Founder-market fit) |
| Target buyer | `docs/product.md` |
| Free vs. paid (values-driven) | `docs/product.md` |
| v1 feature set | `docs/product.md` |
| Locked decisions | `docs/product.md` |
| "Never recommend Lovable / B2B / PWA" | `docs/product.md` anti-patterns |
| Status section body | `docs/status.md` |
| Build convention #1 (cite source-of-truth) | Promoted to CLAUDE.md IMPORTANT block (top of file) |
