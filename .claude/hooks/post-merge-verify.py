#!/usr/bin/env python3
"""PostToolUse hook: after `gh pr merge` succeeds, do housekeeping.

1. Fast-forward `main` in the primary worktree so local stays current.
2. Remove the current worktree + delete the local branch when sitting
   inside a feature worktree whose branch was just merged.
3. Warn loudly if the squash merge produced a no-op commit (tree
   unchanged vs previous main) — protects against branching off another
   feature branch instead of main and silently merging nothing.

Adapted from Brainiac. Vercel deploy verification removed since HeartNote
has no CI configured yet — re-add when CI lands.

Exit codes:
  0 = always (this hook never blocks; housekeeping is best-effort)
"""
import json
import os
import re
import subprocess
import sys


def _git(args, cwd=None, timeout=20):
    try:
        r = subprocess.run(
            ["git", *args],
            capture_output=True, text=True,
            cwd=cwd, timeout=timeout,
        )
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    except Exception:
        return 1, "", ""


def _find_main_worktree():
    """Return absolute path of the worktree that has main (or master) checked out."""
    rc, out, _ = _git(["worktree", "list", "--porcelain"])
    if rc != 0:
        return None
    current_path = None
    current_branch = None
    for line in out.splitlines():
        if line.startswith("worktree "):
            if current_path and current_branch in ("refs/heads/main", "refs/heads/master"):
                return current_path
            current_path = line[len("worktree "):].strip()
            current_branch = None
        elif line.startswith("branch "):
            current_branch = line[len("branch "):].strip()
    if current_path and current_branch in ("refs/heads/main", "refs/heads/master"):
        return current_path
    return None


def run_post_merge_housekeeping():
    cwd = os.environ.get("PROJECT_DIR", os.getcwd())
    main_wt = _find_main_worktree()

    # 1. Fast-forward main in the main worktree.
    if main_wt:
        _git(["fetch", "origin", "main"], cwd=main_wt)
        rc, _, err = _git(["merge", "--ff-only", "origin/main"], cwd=main_wt)
        if rc == 0:
            print(f"Housekeeping: fast-forwarded main in {main_wt}", file=sys.stderr)
        elif err:
            print(
                f"Housekeeping: could not fast-forward main in {main_wt}: {err}",
                file=sys.stderr,
            )

    # 2. If we're in a non-main worktree whose branch was just merged, remove it.
    rc, current_top, _ = _git(["rev-parse", "--show-toplevel"], cwd=cwd)
    rc2, current_branch, _ = _git(["branch", "--show-current"], cwd=cwd)
    if (
        rc == 0 and rc2 == 0 and current_branch
        and current_branch not in ("main", "master")
        and main_wt and os.path.realpath(current_top) != os.path.realpath(main_wt)
    ):
        rm_cwd = main_wt
        rc_rm, _, err_rm = _git(
            ["worktree", "remove", current_top, "--force"], cwd=rm_cwd
        )
        if rc_rm == 0:
            print(f"Housekeeping: removed worktree {current_top}", file=sys.stderr)
            rc_br, _, _ = _git(["branch", "-D", current_branch], cwd=rm_cwd)
            if rc_br == 0:
                print(
                    f"Housekeeping: deleted local branch {current_branch}",
                    file=sys.stderr,
                )
            try:
                os.chdir(main_wt)
                os.environ["PROJECT_DIR"] = main_wt
            except OSError:
                pass
        elif err_rm:
            print(f"Housekeeping: worktree remove failed: {err_rm}", file=sys.stderr)

    # 3. Warn loudly if the squash merge produced a no-op commit.
    check_cwd = main_wt or cwd
    rc, head_sha, _ = _git(["rev-parse", "origin/main"], cwd=check_cwd)
    if rc == 0 and head_sha:
        rc2, diff_out, _ = _git(
            ["diff-tree", "--no-commit-id", "--name-only", "-r", head_sha],
            cwd=check_cwd,
        )
        if rc2 == 0 and not diff_out.strip():
            print(
                "\n" + "=" * 68 + "\n"
                f"WARNING: merge commit {head_sha[:7]} on main changed NO files.\n"
                "The squash merge was a no-op — likely branched from another\n"
                "feature branch instead of main. Create a fresh branch from\n"
                "origin/main and re-ship.\n"
                + "=" * 68,
                file=sys.stderr,
            )


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

    # Only trigger after gh pr merge or gh api merge
    if not re.search(r"gh\s+pr\s+merge|/pulls/\d+/merge", command):
        sys.exit(0)

    # Did the merge actually succeed?
    tool_result = input_data.get("tool_result", "")
    if isinstance(tool_result, dict):
        tool_result = json.dumps(tool_result)
    if isinstance(tool_result, str):
        if "merged" not in tool_result.lower() and "successfully" not in tool_result.lower():
            sys.exit(0)

    # Housekeeping: best-effort, never blocks.
    run_post_merge_housekeeping()
    sys.exit(0)


if __name__ == "__main__":
    main()
