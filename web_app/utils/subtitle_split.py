"""Subtitle split helper utilities."""
from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List
from uuid import uuid4

from ai_shorts_maker.subtitles import format_timestamp, parse_subtitle_file
from ai_shorts_maker.translator import convert_vtt_to_srt


class SubtitleSplitError(Exception):
    """Raised when subtitle splitting fails."""


@dataclass
class SubtitleSplitResult:
    entries: List[Dict[str, object]]
    summary: Dict[str, object]
    plain_text: str
    csv_preview: str


def split_subtitle_upload(
    file_bytes: bytes,
    filename: str,
    upload_dir: Path,
    remove_empty: bool = True,
) -> SubtitleSplitResult:
    """Persist an uploaded subtitle file and return split metadata."""
    if not filename:
        raise SubtitleSplitError("자막 파일을 선택하세요.")

    suffix = Path(filename).suffix.lower()
    if suffix not in {".srt", ".vtt"}:
        raise SubtitleSplitError("SRT 또는 VTT 파일만 지원합니다.")

    upload_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    original_suffix = suffix or ".srt"
    safe_stem = Path(filename).stem or "subtitle"
    safe_stem = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in safe_stem) or "subtitle"
    saved_path = upload_dir / f"{timestamp}_{uuid4().hex[:8]}_{safe_stem}{original_suffix}"

    saved_path.write_bytes(file_bytes)

    processed_path = saved_path
    converted = False
    if saved_path.suffix.lower() == ".vtt":
        try:
            processed_path = convert_vtt_to_srt(saved_path)
        except Exception as exc:  # pragma: no cover - conversion failure path
            raise SubtitleSplitError(f"VTT를 SRT로 변환하지 못했습니다: {exc}") from exc
        converted = processed_path.suffix.lower() == ".srt"

    captions = parse_subtitle_file(processed_path)
    if remove_empty:
        captions = [cap for cap in captions if cap.text.strip()]

    if not captions:
        raise SubtitleSplitError("자막 항목을 찾을 수 없습니다. 파일 형식을 확인하세요.")

    entries: List[Dict[str, object]] = []
    for idx, cap in enumerate(captions, start=1):
        entries.append(
            {
                "index": idx,
                "start": format_timestamp(cap.start),
                "end": format_timestamp(cap.end),
                "text_lines": cap.text.split("\n"),
            }
        )

    summary: Dict[str, object] = {
        "count": len(entries),
        "original_filename": filename,
        "converted": converted,
    }

    plain_lines: List[str] = []
    for entry in entries:
        combined = " / ".join(line.strip() for line in entry["text_lines"] if str(line).strip())
        plain_lines.append(
            f"{entry['index']:03d}. [{entry['start']} - {entry['end']}] {combined or '(빈 자막)'}"
        )
    plain_text = "\n".join(plain_lines)

    csv_buffer = io.StringIO()
    writer = csv.writer(csv_buffer)
    writer.writerow(["index", "start", "end", "text"])
    for entry in entries:
        writer.writerow(
            [
                entry["index"],
                entry["start"],
                entry["end"],
                " / ".join(line.strip() for line in entry["text_lines"] if str(line).strip()),
            ]
        )
    csv_preview = csv_buffer.getvalue()

    return SubtitleSplitResult(
        entries=entries,
        summary=summary,
        plain_text=plain_text,
        csv_preview=csv_preview,
    )
