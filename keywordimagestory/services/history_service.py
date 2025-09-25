"""Local history tracking for story projects."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from keywordimagestory.config import settings
from keywordimagestory.models import ProjectHistoryEntry


def _read_entries(path: Path) -> list[ProjectHistoryEntry]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return [ProjectHistoryEntry(**item) for item in data]


def _write_entries(path: Path, entries: Iterable[ProjectHistoryEntry]) -> None:
    payload = [json.loads(entry.json()) for entry in entries]
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def record(entry: ProjectHistoryEntry) -> None:
    entries = _read_entries(settings.history_db_path)
    entries.append(entry)
    _write_entries(settings.history_db_path, entries)


def list_history(project_id: str | None = None) -> list[ProjectHistoryEntry]:
    entries = _read_entries(settings.history_db_path)
    if project_id is None:
        return entries
    return [entry for entry in entries if entry.project_id == project_id]


def delete_entry(project_id: str, version: int) -> ProjectHistoryEntry | None:
    """Remove a history entry and return it if it existed."""

    entries = _read_entries(settings.history_db_path)
    removed: ProjectHistoryEntry | None = None
    remaining: list[ProjectHistoryEntry] = []

    for entry in entries:
        if removed is None and entry.project_id == project_id and entry.version == version:
            removed = entry
            continue
        remaining.append(entry)

    if removed is not None:
        _write_entries(settings.history_db_path, remaining)

    return removed
