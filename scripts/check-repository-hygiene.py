#!/usr/bin/env python3
"""Reject repository clutter before it reaches the default branch."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT_MEDIA_EXTENSIONS = {
    ".avif",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".pdf",
    ".png",
    ".svg",
    ".webp",
}

ROOT_MEDIA_ALLOWLIST = {
    "apple-touch-icon.png",
    "favicon.ico",
    "favicon.svg",
}

TEMP_SUFFIXES = {".bak", ".orig", ".tmp"}
ROOT_CLUTTER_PREFIXES = (
    "IMG_",
    "Screenshot",
    "mobile-",
    "pasted-",
)


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout


def candidate_paths(base: str | None) -> list[str]:
    if base:
        output = git("diff", "--name-only", "--diff-filter=ACMR", f"{base}...HEAD")
    else:
        output = git("ls-files")
    return [line.strip() for line in output.splitlines() if line.strip()]


def is_symlink(path: str) -> bool:
    entry = git("ls-files", "-s", "--", path).strip()
    return entry.startswith("120000 ")


def audit(paths: list[str]) -> list[str]:
    problems: list[str] = []

    for raw_path in paths:
        path = Path(raw_path)
        name = path.name

        if len(path.parts) == 1:
            suffix = path.suffix.lower()
            if suffix in ROOT_MEDIA_EXTENSIONS and name not in ROOT_MEDIA_ALLOWLIST:
                problems.append(
                    f"{raw_path}: root-level media is not allowed; move it under assets/."
                )
            if name.startswith(ROOT_CLUTTER_PREFIXES):
                problems.append(
                    f"{raw_path}: screenshot or scratch capture should not be committed."
                )

        if path.suffix.lower() in TEMP_SUFFIXES:
            problems.append(f"{raw_path}: temporary or backup files are not allowed.")

        if is_symlink(raw_path):
            problems.append(f"{raw_path}: symlinks are not allowed in this static site.")

    return problems


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base",
        help="Only inspect files added or modified since this Git ref.",
    )
    args = parser.parse_args()

    problems = audit(candidate_paths(args.base))
    if problems:
        print("Repository hygiene check failed:", file=sys.stderr)
        for problem in problems:
            print(f"- {problem}", file=sys.stderr)
        return 1

    print("Repository hygiene check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
