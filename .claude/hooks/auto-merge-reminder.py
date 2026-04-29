#!/usr/bin/env python3
"""PostToolUse hook: after `gh pr checks` passes, BLOCK until merge is run.

Detects successful `gh pr checks --watch` output and blocks to force
running `gh pr merge --squash` before moving on.

If no checks are configured (statusCheckRollup is empty), this is a no-op.
"""
import json
import sys


def main():
    try:
        input_data = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, Exception):
        sys.exit(0)

    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})
    tool_output = input_data.get("tool_output", "")

    if tool_name != "Bash":
        sys.exit(0)

    command = tool_input.get("command", "")

    if "gh pr checks" not in command:
        sys.exit(0)

    output = str(tool_output)
    lines = output.strip().split("\n")
    has_pass = any("pass" in line.lower() for line in lines)
    has_fail = any("fail" in line.lower() for line in lines)
    has_pending = any("pending" in line.lower() for line in lines)

    if has_pass and not has_fail and not has_pending:
        print(
            "CI PASSED — you MUST now run `gh pr merge <number> --squash` "
            "and then verify the production deploy. "
            "Do NOT stop or report success until the PR is merged.",
            file=sys.stderr,
        )
        sys.exit(2)

    sys.exit(0)


if __name__ == "__main__":
    main()
