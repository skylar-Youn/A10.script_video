"""Persist generated artefacts to disk."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Iterable

from keywordimagestory.config import settings
from keywordimagestory.models import (
    ImagePrompt,
    StoryChapter,
    StoryProject,
    SubtitleSegment,
    VideoPrompt,
)


def _timestamp() -> str:
    return datetime.utcnow().strftime("%Y%m%d-%H%M%S")


def _project_dir(project_id: str) -> Path:
    directory = settings.outputs_dir / project_id
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def save_subtitles(project_id: str, subtitles: Iterable[SubtitleSegment]) -> Path:
    path = _project_dir(project_id) / f"{_timestamp()}-subtitles.srt"
    lines = []
    for segment in subtitles:
        start = _format_time(segment.start)
        end = _format_time(segment.end)
        lines.append(f"{segment.index}")
        lines.append(f"{start} --> {end}")
        lines.append(segment.text)
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def save_story_markdown(project: StoryProject) -> Path:
    path = _project_dir(project.project_id) / f"{_timestamp()}-story.md"
    blocks: list[str] = [f"# {project.keyword}"]
    for chapter in sorted(project.chapters, key=lambda c: c.order):
        blocks.append(f"\n## Chapter {chapter.order}")
        blocks.append(chapter.text)
    path.write_text("\n".join(blocks), encoding="utf-8")
    return path


def save_prompts(
    project_id: str,
    images: Iterable[ImagePrompt] | None = None,
    videos: Iterable[VideoPrompt] | None = None,
) -> Path:
    data: dict[str, list[dict[str, str]]] = {"images": [], "videos": []}
    if images:
        data["images"] = [prompt.dict() for prompt in images]
    if videos:
        data["videos"] = [prompt.dict() for prompt in videos]
    path = _project_dir(project_id) / f"{_timestamp()}-prompts.json"
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def save_project_snapshot(project: StoryProject) -> Path:
    path = _project_dir(project.project_id) / f"{_timestamp()}-project.json"
    payload = json.loads(project.json())
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def _format_time(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"
