#!/usr/bin/env python3
"""Watch files or directories and warn when line counts exceed a limit."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, Optional, Sequence, Set, Tuple

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer


def count_lines(path: Path) -> int:
    with path.open("r", encoding="utf-8", errors="ignore") as handle:
        return sum(1 for _ in handle)


def detect_git_root(start: Path) -> Optional[Path]:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=str(start),
            capture_output=True,
            text=True,
            check=False,
        )
    except (FileNotFoundError, OSError):
        return None
    if result.returncode != 0:
        return None
    root = result.stdout.strip()
    return Path(root) if root else None


class LineLimitHandler(FileSystemEventHandler):
    def __init__(
        self,
        file_limits: Dict[Path, int],
        directory_limits: Sequence[Tuple[Path, int]],
        default_limit: int,
        extensions: Set[str],
        make_readonly: bool,
        create_next: bool,
        suggest_next: bool,
        git_root: Optional[Path],
    ) -> None:
        super().__init__()
        self.file_limits = {path.resolve(): limit for path, limit in file_limits.items()}
        self.directory_limits = sorted(
            [(path.resolve(), limit) for path, limit in directory_limits],
            key=lambda item: len(item[0].parts),
            reverse=True,
        )
        self.default_limit = default_limit
        self.extensions = {ext if ext.startswith(".") else f".{ext}" for ext in extensions}
        self.make_readonly = make_readonly
        self.create_next = create_next
        self.suggest_next = suggest_next
        self.git_root = git_root
        self.locked_files: Set[Path] = set()
        self.created_next: Dict[Path, Path] = {}
        self.suggested_next: Dict[Path, Path] = {}

    def on_modified(self, event: FileSystemEvent) -> None:  # noqa: D401
        self._handle_event(event)

    def on_created(self, event: FileSystemEvent) -> None:  # noqa: D401
        self._handle_event(event)

    def _handle_event(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        path = Path(event.src_path).resolve()
        if self.extensions and path.suffix not in self.extensions:
            return
        if not self._is_monitored(path):
            return
        if self._is_git_ignored(path):
            return
        self._check_limit(path, enforce=True)

    def _is_monitored(self, path: Path) -> bool:
        if path in self.file_limits:
            return True
        for directory, _ in self.directory_limits:
            try:
                path.relative_to(directory)
                return True
            except ValueError:
                continue
        return False

    def _is_git_ignored(self, path: Path) -> bool:
        if self.git_root is None:
            return False
        try:
            result = subprocess.run(
                ["git", "check-ignore", "-q", str(path)],
                cwd=str(self.git_root),
                capture_output=True,
                check=False,
            )
        except (FileNotFoundError, OSError):
            return False
        if result.returncode == 0:
            return True
        if result.returncode in (1, 128):
            return False
        return False

    def _resolve_limit(self, path: Path) -> int:
        limit = self.file_limits.get(path)
        if limit is not None:
            return limit
        for directory, dir_limit in self.directory_limits:
            try:
                path.relative_to(directory)
            except ValueError:
                continue
            return dir_limit
        return self.default_limit

    def _check_limit(self, path: Path, *, enforce: bool) -> None:
        limit = self._resolve_limit(path)
        try:
            lines = count_lines(path)
        except OSError as exc:
            print(f"읽기 실패: {path} ({exc})", file=sys.stderr)
            return
        over = lines > limit
        prefix = "⚠️" if over else "✓"
        status = "초과" if over else "OK"
        print(f"{prefix} {path}: {lines}줄 (기준 {limit}줄 {status})", flush=True)
        if not over or not enforce:
            return
        if self.make_readonly:
            self._make_readonly(path)
        if self.create_next or self.suggest_next:
            candidate = self._suggest_next_path(path)
            if self.create_next:
                self._create_next_file(path, candidate)
            if self.suggest_next:
                self._announce_next_candidate(path, candidate)

    def _make_readonly(self, path: Path) -> None:
        if path in self.locked_files:
            return
        try:
            mode = path.stat().st_mode
            new_mode = mode & ~0o222  # remove write bits
            if new_mode != mode:
                path.chmod(new_mode)
                print(
                    f"→ {path}를 읽기 전용으로 설정했습니다. 다시 수정하려면 `chmod +w \"{path}\"`를 실행하세요.",
                    flush=True,
                )
            else:
                print(f"→ {path}는 이미 읽기 전용입니다.", flush=True)
            self.locked_files.add(path)
        except OSError as exc:
            print(f"읽기 전용 설정 실패: {path} ({exc})", file=sys.stderr)

    def _create_next_file(self, path: Path, candidate: Path) -> None:
        previous = self.created_next.get(path)
        if previous == candidate and candidate.exists():
            return
        if candidate.exists():
            print(
                f"→ 계속 작업할 파일이 이미 존재합니다: {candidate}",
                flush=True,
            )
        else:
            try:
                candidate.touch(exist_ok=False)
            except OSError as exc:
                print(f"새 파일 생성 실패: {candidate} ({exc})", file=sys.stderr)
                return
            print(
                f"→ 새 파일 {candidate}를 만들었습니다. 이어지는 작업을 이곳에서 진행하세요.",
                flush=True,
            )
        self.created_next[path] = candidate

    def _announce_next_candidate(self, path: Path, candidate: Path) -> None:
        previous = self.suggested_next.get(path)
        if previous == candidate:
            return
        self.suggested_next[path] = candidate
        print(
            f"→ 새 파일 경로 제안: {candidate} (직접 생성 후 이어서 작업하세요.)",
            flush=True,
        )

    def _suggest_next_path(self, path: Path) -> Path:
        directory = path.parent
        stem = path.stem
        suffix = path.suffix
        match = re.match(r"^(.*)_part(\d+)$", stem)
        if match:
            base = match.group(1) or stem
            index = int(match.group(2)) + 1
        else:
            base = stem
            index = 2
        while True:
            candidate = directory / f"{base}_part{index}{suffix}"
            if not candidate.exists():
                return candidate
            index += 1


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Watch files/directories and alert when they exceed a line limit.",
    )
    parser.add_argument(
        "targets",
        nargs="*",
        help="Paths to watch. Use path:limit to override the limit for a path. Directory targets are watched recursively. Default: current directory.",
    )
    parser.add_argument(
        "--max-lines",
        type=int,
        default=3000,
        help="Default line limit (applies when no explicit limit is given).",
    )
    parser.add_argument(
        "--extensions",
        nargs="*",
        default=[],
        help="Only monitor files with these extensions (e.g. .py .js).",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="Observer polling interval in seconds (default: 1.0).",
    )
    parser.add_argument(
        "--make-readonly",
        action="store_true",
        help="Remove write permissions from files that exceed the limit.",
    )
    parser.add_argument(
        "--create-next",
        action="store_true",
        help="Automatically create a follow-up file when the limit is exceeded.",
    )
    parser.add_argument(
        "--suggest-next",
        action="store_true",
        help="Suggest a follow-up file path when the limit is exceeded.",
    )
    return parser.parse_args(argv)


def normalize_targets(
    raw_targets: Sequence[str],
    default_limit: int,
) -> Tuple[Dict[Path, int], Dict[Path, int]]:
    files: Dict[Path, int] = {}
    directories: Dict[Path, int] = {}

    if not raw_targets:
        directories[Path.cwd().resolve()] = default_limit
        return files, directories

    for item in raw_targets:
        if ":" in item:
            path_str, limit_str = item.rsplit(":", 1)
            try:
                limit = int(limit_str)
            except ValueError:
                print(f"무시: {item} (limit 부분이 정수가 아닙니다)", file=sys.stderr)
                continue
        else:
            path_str = item
            limit = default_limit

        path = Path(path_str).expanduser().resolve()
        if not path.exists():
            print(f"경고: {path}가 존재하지 않습니다 (생성되면 감시 대상).", file=sys.stderr)
        if path.exists() and path.is_dir():
            directories[path] = limit
        else:
            files[path] = limit
    return files, directories


def build_watch_roots(files: Dict[Path, int], directories: Dict[Path, int]) -> Sequence[Tuple[Path, bool]]:
    roots: Dict[Path, bool] = {}
    for directory in directories:
        roots[directory.resolve()] = True
    for file_path in files:
        roots.setdefault(file_path.parent.resolve(), False)
    return list(roots.items())


def main(argv: Sequence[str]) -> int:
    args = parse_args(argv)
    file_targets, dir_targets = normalize_targets(args.targets, args.max_lines)

    git_root = detect_git_root(Path.cwd())

    handler = LineLimitHandler(
        file_targets,
        dir_targets.items(),
        args.max_lines,
        set(args.extensions),
        make_readonly=args.make_readonly,
        create_next=args.create_next,
        suggest_next=args.suggest_next,
        git_root=git_root,
    )
    observer = Observer()

    watch_roots = build_watch_roots(file_targets, dir_targets)
    if not watch_roots:
        print("감시할 경로나 파일이 없습니다.", file=sys.stderr)
        return 1

    for root, recursive in watch_roots:
        observer.schedule(handler, str(root), recursive=recursive)

    observer.start()
    try:
        print("라인 감시를 시작합니다. (종료: Ctrl+C)")
        for directory, limit in sorted(dir_targets.items()):
            print(f"디렉터리 감시: {directory} (기준 {limit}줄)")
        while True:
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("중지 요청을 받았습니다. 종료합니다.")
    finally:
        observer.stop()
        observer.join()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
