#!/usr/bin/env python3
"""PreToolUse hook: remind Claude to consult the design-system mockup before
editing or creating UI files.

Scope: Edit/Write/MultiEdit on .tsx files under src/app/, src/components/,
src/lib/visits/pdf/. Pure server-side files (route handlers, data loaders)
pass through silently.

Behavior: non-blocking. Prints a reminder to stderr (which Claude Code
surfaces back to the agent as part of the tool result) and exits 0. The
goal is to nudge — not to gate. Blocking would slow legitimate work.
"""
import json
import re
import sys


# UI files that should consult the design system before changes.
UI_PATH_PATTERNS = (
    re.compile(r"(^|/)src/app/.*\.tsx$"),
    re.compile(r"(^|/)src/components/.*\.tsx$"),
    re.compile(r"(^|/)src/lib/visits/pdf/.*\.tsx$"),
)

# Skip the reminder for files that don't carry visual register decisions.
SKIP_PATH_PATTERNS = (
    re.compile(r"(^|/)route\.ts$"),
    re.compile(r"(^|/)layout\.tsx$"),
    re.compile(r"(^|/)not-found\.tsx$"),
    re.compile(r"(^|/)error\.tsx$"),
)

REMINDER = (
    "📐 Design system reminder: docs/design/heartnote-home-mockup.html is the "
    "source-of-truth for visual register, component anatomy, and screen "
    "composition. Read the relevant section BEFORE editing this UI file. "
    "When the design and .claude/rules/canonical-controls.md disagree, the "
    "design wins; update the rule file to match (CLAUDE.md rule #12)."
)


def main() -> int:
    try:
        payload = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, ValueError):
        return 0

    tool = payload.get("tool_name", "")
    if tool not in ("Edit", "Write", "MultiEdit"):
        return 0

    inputs = payload.get("tool_input", {}) or {}
    path = inputs.get("file_path", "") or ""
    if not path:
        return 0

    if any(p.search(path) for p in SKIP_PATH_PATTERNS):
        return 0

    if not any(p.search(path) for p in UI_PATH_PATTERNS):
        return 0

    sys.stderr.write(REMINDER + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
