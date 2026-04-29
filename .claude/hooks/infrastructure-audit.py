#!/usr/bin/env python3
"""SessionStart hook: meta-verification of repo and hook integrity.

Runs at session start. Catches:
- Hooks listed in settings.json that no longer exist on disk (typo or move)
- Hooks present on disk that aren't registered in settings.json
- Required HeartNote files missing (CLAUDE.md, research/chf-source-of-truth.md)
- Orphaned uncommitted files in src/, supabase/, research/, docs/ from a prior session
- Worktrees whose branch is already merged to main (clean-up signal)

Exit 2 = block session (settings.json broken or required file missing).
Exit 0 with stderr = warnings only, session proceeds.

Adapted from Brainiac. Brainiac-specific spec/skill checks removed.
"""
import json
import os
import sys
import subprocess


def main():
    project_root = os.environ.get("PROJECT_DIR", os.getcwd())
    hooks_dir = os.path.join(project_root, ".claude", "hooks")
    settings_path = os.path.join(project_root, ".claude", "settings.json")

    missing = []
    warnings = []

    # --- Required HeartNote files ---
    required_files = {
        "CLAUDE.md": "Project instructions",
        "research/chf-source-of-truth.md": "Clinical source of truth",
    }
    for rel_path, desc in required_files.items():
        full_path = os.path.join(project_root, rel_path.replace("/", os.sep))
        if not os.path.isfile(full_path):
            missing.append(f"MISSING: {rel_path} ({desc})")

    # --- settings.json must exist and parse ---
    if not os.path.isfile(settings_path):
        missing.append("MISSING: .claude/settings.json")
        if missing:
            print("\n".join(missing), file=sys.stderr)
            sys.exit(2)
        sys.exit(0)

    try:
        with open(settings_path, "r", encoding="utf-8") as f:
            settings = json.load(f)
    except Exception as e:
        missing.append(f"BROKEN: .claude/settings.json cannot be parsed: {e}")
        print("\n".join(missing), file=sys.stderr)
        sys.exit(2)

    # --- Hook registration audit ---
    registered_scripts = set()
    hooks_config = settings.get("hooks", {})
    for event_type, hook_list in hooks_config.items():
        if isinstance(hook_list, list):
            for entry in hook_list:
                for hook in entry.get("hooks", []):
                    cmd = hook.get("command", "")
                    for part in cmd.split():
                        if part.endswith(".py"):
                            script = part.replace("\\", "/")
                            registered_scripts.add(os.path.basename(script))
                            full_script = os.path.join(project_root, script.replace("/", os.sep))
                            if not os.path.isfile(full_script):
                                alt_path = os.path.join(hooks_dir, os.path.basename(script))
                                if not os.path.isfile(alt_path):
                                    missing.append(
                                        f"MISSING: Hook {script} (in settings.json but file not found)"
                                    )

    if os.path.isdir(hooks_dir):
        for py_file in os.listdir(hooks_dir):
            if py_file.endswith(".py") and py_file != "__pycache__":
                if py_file not in registered_scripts:
                    missing.append(
                        f"UNREGISTERED: .claude/hooks/{py_file} exists but is not in settings.json"
                    )

    # --- Orphaned uncommitted files ---
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True, text=True, cwd=project_root, timeout=10
        )
        if result.returncode == 0 and result.stdout.strip():
            orphaned = []
            for line in result.stdout.strip().split("\n"):
                status = line[:2].strip()
                filepath = line[3:].strip()
                if any(filepath.startswith(p) for p in ["src/", "supabase/", "research/", "docs/"]):
                    orphaned.append(f"  {status} {filepath}")
            if orphaned:
                warnings.append(
                    "ORPHANED FILES from a previous session:\n"
                    + "\n".join(orphaned)
                    + "\n  -> Commit on a branch or discard before starting new work."
                )
    except Exception:
        pass

    # --- Stale worktrees (branches already merged to main) ---
    try:
        result = subprocess.run(
            ["git", "worktree", "list", "--porcelain"],
            capture_output=True, text=True, cwd=project_root, timeout=10
        )
        if result.returncode == 0:
            merged_result = subprocess.run(
                ["git", "branch", "--merged", "main"],
                capture_output=True, text=True, cwd=project_root, timeout=10
            )
            merged_branches = set()
            if merged_result.returncode == 0:
                for line in merged_result.stdout.strip().split("\n"):
                    branch = line.strip().lstrip("* ")
                    if branch and branch != "main":
                        merged_branches.add(branch)

            stale = []
            current_worktree = None
            current_branch = None
            for line in result.stdout.strip().split("\n"):
                if line.startswith("worktree "):
                    current_worktree = line.split(" ", 1)[1]
                elif line.startswith("branch "):
                    current_branch = line.split("/")[-1]
                elif line == "":
                    if (
                        current_worktree and current_branch
                        and current_worktree != project_root
                        and current_branch in merged_branches
                    ):
                        stale.append(f"  {current_worktree} [{current_branch}] — MERGED, safe to delete")
                    current_worktree = None
                    current_branch = None

            if stale:
                warnings.append(
                    "STALE WORKTREES (branch already merged to main):\n"
                    + "\n".join(stale)
                    + "\n  -> Clean up: git worktree remove <path> && git branch -d <branch>"
                )
    except Exception:
        pass

    # --- Report ---
    if missing:
        print("[INFRASTRUCTURE AUDIT FAILED]", file=sys.stderr)
        for m in missing:
            print(f"  {m}", file=sys.stderr)
        print("\nFix these issues before proceeding.", file=sys.stderr)
        sys.exit(2)

    if warnings:
        print("[INFRASTRUCTURE AUDIT] Passed with warnings:", file=sys.stderr)
        for w in warnings:
            print(f"  {w}", file=sys.stderr)
        sys.exit(0)

    print("[INFRASTRUCTURE AUDIT] All hooks and required files verified.", file=sys.stderr)
    sys.exit(0)


if __name__ == "__main__":
    main()
