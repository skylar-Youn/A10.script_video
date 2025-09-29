#!/usr/bin/env python3
"""Fail if any text file exceeds the configured line count."""

from __future__ import annotations

import argparse
import os
import pathlib
import sys
from typing import Iterable, Iterator, Sequence

# Directories ignored by default when crawling.
DEFAULT_IGNORES = {".git", "__pycache__", ".mypy_cache", ".pytest_cache"}


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check that files stay below a maximum line count.",
    )
    parser.add_argument(
        "paths",
        nargs="*",
        default=["."],
        help="Paths to inspect (default: current directory).",
    )
    parser.add_argument(
        "--max-lines",
        type=int,
        default=2000,
        help="Maximum allowed lines per file (default: 2000).",
    )
    parser.add_argument(
        "--ignore",
        action="append",
        default=[],
        help="Optional directories or glob patterns to skip.",
    )
    parser.add_argument(
        "--extensions",
        nargs="*",
        default=[],
        help="Only process files with these extensions (e.g. .py .ts).",
    )
    return parser.parse_args(argv)


def should_skip(path: pathlib.Path, ignores: Sequence[str]) -> bool:
    parts = path.parts
    for part in parts:
        if part in DEFAULT_IGNORES:
            return True
    for pattern in ignores:
        if path.match(pattern) or pattern in parts:
            return True
    return False


def iter_files(paths: Sequence[str], ignores: Sequence[str], extensions: Sequence[str]) -> Iterator[pathlib.Path]:
    include_all = not extensions
    for raw_path in paths:
        root = pathlib.Path(raw_path)
        if not root.exists():
            continue
        if root.is_file():
            if (include_all or root.suffix in extensions) and not should_skip(root.parent, ignores):
                yield root
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            current = pathlib.Path(dirpath)
            if should_skip(current, ignores):
                dirnames[:] = []  # prune traversal
                continue
            dirnames[:] = [d for d in dirnames if not should_skip(current / d, ignores)]
            for filename in filenames:
                candidate = current / filename
                if should_skip(candidate, ignores):
                    continue
                if include_all or candidate.suffix in extensions:
                    yield candidate


def count_lines(path: pathlib.Path) -> int:
    # Use latin-1 fallback to avoid decode errors on odd encodings.
    with path.open("r", encoding="utf-8", errors="ignore") as handle:
        return sum(1 for _ in handle)


def main(argv: Iterable[str]) -> int:
    args = parse_args(argv)
    offenders = []
    for path in iter_files(args.paths, args.ignore, args.extensions):
        try:
            line_count = count_lines(path)
        except (OSError, UnicodeDecodeError):
            continue  # Skip unreadable/binary files.
        if line_count > args.max_lines:
            offenders.append((path, line_count))

    if not offenders:
        print(f"All checked files are within the {args.max_lines} line limit.")
        return 0

    print(f"Found {len(offenders)} file(s) exceeding {args.max_lines} lines:\n")
    for path, line_count in sorted(offenders, key=lambda item: item[1], reverse=True):
        print(f"  {line_count:>6} lines  {path}")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
