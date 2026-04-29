#!/usr/bin/env python3
"""PreToolUse hook: WARN when CLAUDE.md exceeds line budgets.

Warn at 100 lines, warn more loudly at 150 lines.
Never blocks — important rules may need the room.
Exit 0 always (we do not block).
"""
import json
import os
import sys

WARN_THRESHOLD = 100
HARD_WARN_THRESHOLD = 150


def main():
    try:
        input_data = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, Exception):
        sys.exit(0)

    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    if tool_name not in ("Write", "Edit"):
        sys.exit(0)

    file_path = tool_input.get("file_path", "")
    if not file_path.endswith("CLAUDE.md"):
        sys.exit(0)

    # Reconstruct the full content the operation would produce
    if tool_name == "Write":
        content = tool_input.get("content", "")
    else:
        project_root = os.environ.get("PROJECT_DIR", os.getcwd())
        normalized = (
            file_path
            if os.path.isabs(file_path)
            else os.path.join(project_root, file_path)
        )
        try:
            with open(normalized, "r", encoding="utf-8") as f:
                old_content = f.read()
        except Exception:
            sys.exit(0)
        old_string = tool_input.get("old_string", "")
        new_string = tool_input.get("new_string", "")
        content = old_content.replace(old_string, new_string, 1)

    line_count = len(content.strip().split("\n"))

    if line_count > HARD_WARN_THRESHOLD:
        print(
            f"WARNING: CLAUDE.md is {line_count} lines "
            f"(soft cap {HARD_WARN_THRESHOLD} exceeded by {line_count - HARD_WARN_THRESHOLD}).\n"
            f"Move rules to .claude/rules/* or product/status content to docs/*.\n"
            f"Pass 1 trim brought this file to 54 lines — drift is real.",
            file=sys.stderr,
        )
    elif line_count > WARN_THRESHOLD:
        print(
            f"WARNING: CLAUDE.md is {line_count} lines "
            f"(budget {WARN_THRESHOLD} exceeded by {line_count - WARN_THRESHOLD}).\n"
            f"Consider moving rules to .claude/rules/*.",
            file=sys.stderr,
        )

    sys.exit(0)


if __name__ == "__main__":
    main()
