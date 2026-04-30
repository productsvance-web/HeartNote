#!/usr/bin/env python3
"""PreToolUse hook: BLOCK clinical-safety violations in proposed edits.

HeartNote's hard rule (CLAUDE.md): never recommend dose changes. This hook
catches the patterns LLM agents repeatedly slip into caregiver-facing strings
even when prompted otherwise — coaching language ("may prompt a ... adjustment"),
specific dose-cut percentages ("30-50% dose cut"), and directive verbs
("skip the dose", "double the dose", "stop the medication").

Scope is narrow: only fires on Edit/Write/MultiEdit, only on clinical-content
files (research/data/*.ts, research/*.md at top level, src/lib/voice-log/*.ts,
src/lib/alerts/*.ts). Read/Bash/everything else passes through. Files outside
scope pass through silently.

Exit 2 = block. Exit 0 = allow. JSON parse / unexpected shape = allow (don't
break the harness on malformed input).
"""
import json
import re
import sys
from pathlib import Path


# Scope: clinical-content files only. Hook is silent on everything else.
CLINICAL_PATH_PATTERNS = (
    re.compile(r"(^|/)research/data/[^/]+\.ts$"),
    re.compile(r"(^|/)research/[^/]+\.md$"),
    re.compile(r"(^|/)src/lib/voice-log/[^/]+\.ts$"),
    re.compile(r"(^|/)src/lib/alerts/[^/]+\.ts$"),
)


# Patterns that are unambiguous violations of "never recommend dose changes."
# Each pattern is paired with a short reason shown to the user.
FORBIDDEN_PATTERNS = (
    (
        re.compile(
            r"\b\d{1,3}\s*[-–]?\s*\d{0,3}\s*%\s+\w*\s*"
            r"(?:dose|cut|reduction|adjustment)\b",
            re.IGNORECASE,
        ),
        "specifies a percentage dose cut/reduction (e.g., '30-50% dose cut')",
    ),
    (
        re.compile(
            r"\b(?:may|might|could|should|will|would)\s+"
            r"(?:prompt|require|need|warrant|trigger)\s+"
            r"(?:a\s+|an\s+)?[\w\-\s]{0,40}?\s*"
            r"(?:dose|drug|medication|diuretic)\s+"
            r"(?:adjustment|change|cut|reduction|increase|decrease)",
            re.IGNORECASE,
        ),
        "coaches expectation of a dose change ('may prompt a ... adjustment')",
    ),
    (
        re.compile(
            r"\bskip\s+(?:a\s+|the\s+|his\s+|her\s+)?"
            r"(?:dose|pill|medication|water[-\s]pill|diuretic)\b",
            re.IGNORECASE,
        ),
        "tells the caregiver to skip a dose",
    ),
    (
        re.compile(
            r"\b(?:double|halve|triple|quadruple)\s+"
            r"(?:the\s+|his\s+|her\s+)?(?:dose|pill|medication)\b",
            re.IGNORECASE,
        ),
        "tells the caregiver to multiply or halve a dose",
    ),
    (
        re.compile(
            r"\b(?:start|stop|increase|decrease|reduce)\s+"
            r"(?:the\s+|his\s+|her\s+)"
            r"(?:diuretic|loop[-\s]diuretic|water[-\s]pill|medication|drug)\b",
            re.IGNORECASE,
        ),
        "directly tells the caregiver to start/stop/change a medication",
    ),
)


# Citations and source-quote lines often legitimately mention these patterns
# (e.g., quoting an FDA label that itself contains dose language). Allow lines
# that are clearly metadata, not caregiver-facing copy.
ALLOW_LINE_RE = re.compile(
    r"^\s*//|"                          # JS/TS line comment
    r"^\s*\*|"                          # JSDoc continuation
    r"\bsourceQuote\s*:|"               # the meta sourceQuote field
    r"\bcitation\s*:|"                  # rule citation field
    r"\bexternal\s*:|"                  # meta external citation
    r"\binternal\s*:|"                  # meta internal citation
    r"\bsource_quote\s*:|"              # snake_case variant
    r"https?://"                        # URL inside markdown link
)


def in_scope(file_path: str) -> bool:
    if not file_path:
        return False
    posix = Path(file_path).as_posix()
    return any(pat.search(posix) for pat in CLINICAL_PATH_PATTERNS)


def extract_writes(tool_name: str, tool_input: dict) -> list[tuple[str, str]]:
    fp = tool_input.get("file_path", "")
    if tool_name == "Write":
        return [(fp, tool_input.get("content", "") or "")]
    if tool_name == "Edit":
        return [(fp, tool_input.get("new_string", "") or "")]
    if tool_name == "MultiEdit":
        edits = tool_input.get("edits") or []
        return [(fp, (e.get("new_string", "") or "")) for e in edits]
    return []


def find_violations(content: str) -> list[tuple[str, str, str]]:
    """Return [(matched_text, reason, line_excerpt)] for violations."""
    out: list[tuple[str, str, str]] = []
    for pattern, reason in FORBIDDEN_PATTERNS:
        for m in pattern.finditer(content):
            line_start = content.rfind("\n", 0, m.start()) + 1
            line_end_idx = content.find("\n", m.end())
            line = content[line_start: line_end_idx if line_end_idx != -1 else len(content)]
            if ALLOW_LINE_RE.search(line):
                continue
            out.append((m.group(0).strip(), reason, line.strip()[:200]))
    return out


def main():
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        sys.exit(0)

    tool_name = data.get("tool_name", "")
    tool_input = data.get("tool_input", {}) or {}

    if tool_name not in ("Edit", "Write", "MultiEdit"):
        sys.exit(0)

    writes = extract_writes(tool_name, tool_input)
    if not writes:
        sys.exit(0)

    all_violations: list[tuple[str, list[tuple[str, str, str]]]] = []
    for fp, content in writes:
        if not in_scope(fp):
            continue
        violations = find_violations(content)
        if violations:
            all_violations.append((fp, violations))

    if not all_violations:
        sys.exit(0)

    msg_lines = [
        "BLOCKED: Clinical-safety violation in proposed edit.",
        "HeartNote rule (CLAUDE.md): never recommend dose changes.",
        "",
    ]
    for fp, violations in all_violations:
        msg_lines.append(f"  File: {fp}")
        for matched, reason, line in violations:
            msg_lines.append(f"    - {reason}")
            msg_lines.append(f"        match: '{matched}'")
            msg_lines.append(f"        line:  {line}")
        msg_lines.append("")
    msg_lines.append(
        "Rephrase: describe the observable signal, not the action. The caregiver "
        "surfaces symptoms; the prescriber decides what to do."
    )
    msg_lines.append(
        "  Bad : 'may prompt a loop-diuretic adjustment by the cardiologist'"
    )
    msg_lines.append(
        "  Good: 'surface these symptoms to the cardiologist if they appear'"
    )
    print("\n".join(msg_lines), file=sys.stderr)
    sys.exit(2)


if __name__ == "__main__":
    main()
