"""Persistent storage for generated tool results (story keywords, titles, scripts)."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable
from uuid import uuid4

from keywordimagestory.config import settings
from keywordimagestory.models import ToolRecord, ToolType

_TOOL_STORE_PATH: Path = settings.outputs_dir / "tool_records.json"


def _ensure_store_path() -> None:
    _TOOL_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not _TOOL_STORE_PATH.exists():
        _TOOL_STORE_PATH.write_text("[]", encoding="utf-8")


def _read_records() -> list[ToolRecord]:
    _ensure_store_path()
    data = json.loads(_TOOL_STORE_PATH.read_text(encoding="utf-8"))
    normalised: list[ToolRecord] = []
    for item in data:
        if item.get("tool") == "video_titles":
            item["tool"] = "image_story"
        try:
            normalised.append(ToolRecord(**item))
        except Exception:
            continue
    return normalised


def _write_records(records: Iterable[ToolRecord]) -> None:
    payload = [json.loads(record.json()) for record in records]
    _TOOL_STORE_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def list_records(tool: ToolType | None = None) -> list[ToolRecord]:
    records = _read_records()
    if tool is None:
        return records
    return [record for record in records if record.tool == tool]


def save_record(tool: ToolType, title: str, payload: dict[str, Any]) -> ToolRecord:
    record = ToolRecord(
        id=uuid4().hex,
        tool=tool,
        title=title.strip() or f"{tool.value}-{datetime.utcnow():%Y%m%d-%H%M%S}",
        payload=payload,
    )
    records = _read_records()
    records.append(record)
    _write_records(records)
    return record


def get_record(tool: ToolType, record_id: str) -> ToolRecord:
    for record in list_records(tool):
        if record.id == record_id:
            return record
    raise KeyError(f"Record {record_id} for tool {tool.value} not found")


def delete_record(tool: ToolType, record_id: str) -> bool:
    records = _read_records()
    updated: list[ToolRecord] = []
    removed = False
    for record in records:
        if not removed and record.tool == tool and record.id == record_id:
            removed = True
            continue
        updated.append(record)
    if removed:
        _write_records(updated)
    return removed
