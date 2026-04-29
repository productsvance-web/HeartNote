#!/usr/bin/env python3
"""PreToolUse hook: BLOCK git push to main/master.

Force every change through the PR flow. No exemptions in HeartNote.
Exit 2 = block. Exit 0 = allow.
"""
import json
import os
import re
import subprocess
import sys


def main():
    try:
        input_data = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, Exception):
        sys.exit(0)

    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    if tool_name != "Bash":
        sys.exit(0)

    command = tool_input.get("command", "")

    # Check for git push at all
    if "git push" not in command and "git push" not in command.replace("  ", " "):
        sys.exit(0)

    command_lower = command.lower().strip()

    # Patterns that indicate pushing to main/master
    blocked_patterns = [
        "git push origin main",
        "git push origin master",
        "git push upstream main",
        "git push upstream master",
        "git push -f origin main",
        "git push -f origin master",
        "git push --force origin main",
        "git push --force origin master",
        "git push -u origin main",
        "git push -u origin master",
        "git push --force-with-lease origin main",
        "git push --force-with-lease origin master",
        "git push --set-upstream origin main",
        "git push --set-upstream origin master",
    ]

    triggered = False
    trigger_reason = ""

    for pattern in blocked_patterns:
        if pattern in command_lower:
            triggered = True
            trigger_reason = "Direct push to main/master is not allowed."
            break

    # Catch refspec pushes: git push origin HEAD:main, git push origin branch:master
    if not triggered:
        refspec_match = re.search(
            r"git\s+push\s+\S+\s+\S+:(main|master)\b", command_lower
        )
        if refspec_match:
            triggered = True
            trigger_reason = (
                f"Refspec push to {refspec_match.group(1)} is not allowed."
            )

    # Catch reordered flags: git push origin -f main, git push -u origin main
    if not triggered and "git push" in command_lower:
        parts = command_lower.split()
        try:
            push_idx = parts.index("push")
        except ValueError:
            push_idx = -1
        # Limit the scan window to args that belong to this git push invocation.
        terminators = {";", "&&", "||", "|"}
        scan = []
        for tok in parts[push_idx + 1:]:
            if tok in terminators:
                break
            scan.append(tok)
        if "main" in scan or "master" in scan:
            branch = "main" if "main" in scan else "master"
            triggered = True
            trigger_reason = f"Push targeting {branch} is not allowed."

    # Bare "git push" while on main/master
    if not triggered and command_lower.strip() in (
        "git push",
        "git push -f",
        "git push --force",
        "git push --force-with-lease",
    ):
        project_root = os.environ.get("PROJECT_DIR", os.getcwd())
        try:
            branch_result = subprocess.run(
                ["git", "branch", "--show-current"],
                capture_output=True,
                text=True,
                cwd=project_root,
                timeout=5,
            )
            current_branch = branch_result.stdout.strip()
            if current_branch in ("main", "master"):
                triggered = True
                trigger_reason = (
                    "Bare 'git push' blocked as a safety measure on "
                    f"{current_branch}."
                )
        except Exception:
            triggered = True
            trigger_reason = "Bare 'git push' blocked as a safety measure."

    if not triggered:
        sys.exit(0)

    print(
        f"BLOCKED: {trigger_reason}\n"
        f"Create a feature branch and push there instead.\n"
        f"  git checkout -b feat/<name>\n"
        f"  git push -u origin feat/<name>\n"
        f"  gh pr create\n"
        f"\n"
        f"Command: {command}",
        file=sys.stderr,
    )
    sys.exit(2)


if __name__ == "__main__":
    main()
