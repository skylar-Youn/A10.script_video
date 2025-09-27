"""Translator project repository."""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional
from uuid import uuid4

from .models import (
    TranslatorProject,
    TranslatorProjectCreate,
    TranslatorSegment,
    DEFAULT_SEGMENT_MAX,
)
from ..repository import OUTPUT_DIR as SHORTS_OUTPUT_DIR

logger = logging.getLogger(__name__)

TRANSLATOR_DIR = SHORTS_OUTPUT_DIR / "translator_projects"
UPLOADS_DIR = SHORTS_OUTPUT_DIR / "uploads"


def ensure_directories() -> None:
    TRANSLATOR_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    _migrate_legacy_backup_directories()


def _migrate_legacy_backup_directories() -> None:
    """Copy legacy backup metadata files into the expected location."""
    try:
        for item in TRANSLATOR_DIR.iterdir():
            if not item.is_dir():
                continue

            legacy_metadata = item / "metadata.json"
            target_path = TRANSLATOR_DIR / f"{item.name}.json"

            if not legacy_metadata.exists():
                continue

            if not target_path.exists():
                try:
                    data = json.loads(legacy_metadata.read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    logger.warning("Legacy translator backup %s has invalid metadata", legacy_metadata)
                    continue

                data["metadata_path"] = str(target_path)

                target_path.write_text(
                    json.dumps(data, ensure_ascii=False, indent=2, default=str),
                    encoding="utf-8",
                )

            try:
                legacy_metadata.unlink()
            except OSError as exc:
                logger.warning("Failed to remove legacy metadata file %s: %s", legacy_metadata, exc)
    except OSError as exc:
        logger.warning("Failed to migrate legacy translator backups: %s", exc)


def _project_path(project_id: str) -> Path:
    return TRANSLATOR_DIR / f"{project_id}.json"


def create_project(payload: TranslatorProjectCreate) -> TranslatorProject:
    ensure_directories()
    project_id = str(uuid4())
    base_name = Path(payload.source_video).stem
    max_duration = payload.segment_max_duration or DEFAULT_SEGMENT_MAX
    segments = _build_segments(payload.duration, max_duration, payload.source_subtitle)

    metadata_path = str(_project_path(project_id))
    project = TranslatorProject(
        id=project_id,
        base_name=base_name,
        source_video=payload.source_video,
        source_subtitle=payload.source_subtitle,
        source_origin=payload.source_origin,
        target_lang=payload.target_lang,
        translation_mode=payload.translation_mode,
        tone_hint=payload.tone_hint,
        prompt_hint=payload.prompt_hint,
        fps=payload.fps,
        voice=payload.voice,
        music_track=payload.music_track,
        duration=payload.duration,
        segment_max_duration=max_duration,
        segments=segments,
        metadata_path=metadata_path,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    return save_project(project)


def save_project(project: TranslatorProject) -> TranslatorProject:
    ensure_directories()
    project.updated_at = datetime.utcnow()
    path = Path(project.metadata_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    # Save current version
    path.write_text(
        json.dumps(
            project.model_dump(exclude_none=False),
            ensure_ascii=False,
            indent=2,
            default=str,
        ),
        encoding="utf-8",
    )

    # Also save versioned backup for translation comparisons
    _save_translation_version(project)

    return project


def _save_translation_version(project: TranslatorProject) -> None:
    """Save a versioned backup for translation comparison."""
    try:
        version_dir = TRANSLATOR_DIR / project.id / "versions"
        version_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        version_file = version_dir / f"{timestamp}.json"

        version_file.write_text(
            json.dumps(
                project.model_dump(exclude_none=False),
                ensure_ascii=False,
                indent=2,
                default=str,
            ),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.warning("Failed to save translation version: %s", exc)


def load_project(project_id: str) -> Optional[TranslatorProject]:
    try:
        path = _project_path(project_id)
        if not path.exists():
            return None

        data = json.loads(path.read_text(encoding="utf-8"))
        return TranslatorProject(**data)
    except Exception as exc:
        logger.error("Failed to load project %s: %s", project_id, exc)
        return None


def list_projects() -> List[TranslatorProject]:
    ensure_directories()
    projects = []

    try:
        for path in TRANSLATOR_DIR.glob("*.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                project = TranslatorProject(**data)
                projects.append(project)
            except Exception as exc:
                logger.warning("Failed to load project from %s: %s", path, exc)
                continue
    except Exception as exc:
        logger.error("Failed to list projects: %s", exc)

    return sorted(projects, key=lambda p: p.updated_at, reverse=True)


def delete_project(project_id: str) -> bool:
    try:
        path = _project_path(project_id)
        if path.exists():
            path.unlink()

        # Also remove version directory if it exists
        version_dir = TRANSLATOR_DIR / project_id
        if version_dir.exists():
            import shutil
            shutil.rmtree(version_dir)

        return True
    except Exception as exc:
        logger.error("Failed to delete project %s: %s", project_id, exc)
        return False


def _build_segments(
    duration: Optional[float],
    max_length: float,
    subtitle_path: Optional[str] = None
) -> List[TranslatorSegment]:
    # If we have a subtitle file, parse it first
    if subtitle_path and Path(subtitle_path).exists():
        segments = _parse_srt_segments(subtitle_path)
        if segments:  # If we successfully parsed SRT segments
            logger.info(f"Parsed {len(segments)} segments from SRT file: {subtitle_path}")
            return segments

    # Fallback to duration-based segments
    if duration is None or duration <= 0:
        return [TranslatorSegment(clip_index=0, start=0.0, end=float(max_length))]

    segments: List[TranslatorSegment] = []
    start = 0.0
    clip_index = 0
    while start < duration:
        end = min(duration, start + max_length)
        segments.append(
            TranslatorSegment(
                clip_index=clip_index,
                start=round(start, 3),
                end=round(end, 3),
            )
        )
        clip_index += 1
        start = end
    return segments or [TranslatorSegment(clip_index=0, start=0.0, end=float(duration))]


def _parse_srt_time(time_str: str) -> float:
    """Parse SRT time format (HH:MM:SS,mmm) to seconds."""
    try:
        time_part, ms_part = time_str.strip().split(',')
        h, m, s = map(int, time_part.split(':'))
        ms = int(ms_part)
        return h * 3600 + m * 60 + s + ms / 1000.0
    except (ValueError, AttributeError):
        return 0.0


def _parse_srt_segments(srt_path: str) -> List[TranslatorSegment]:
    """Parse SRT file and create segments with timing and text."""
    if not Path(srt_path).exists():
        return []

    segments: List[TranslatorSegment] = []
    try:
        content = Path(srt_path).read_text(encoding='utf-8').strip()
        if not content:
            return []

        # Split by double newlines to separate subtitle blocks
        blocks = content.split('\n\n')

        for i, block in enumerate(blocks):
            lines = block.strip().split('\n')
            if len(lines) < 3:
                continue

            # Skip subtitle number (first line)
            timing_line = lines[1]
            text_lines = lines[2:]

            # Parse timing: "00:00:00,160 --> 00:00:05,480"
            if ' --> ' not in timing_line:
                continue

            start_str, end_str = timing_line.split(' --> ')
            start_time = _parse_srt_time(start_str)
            end_time = _parse_srt_time(end_str)

            # Combine text lines
            source_text = ' '.join(text_lines).strip()

            if source_text:  # Only add segments with text
                segments.append(
                    TranslatorSegment(
                        clip_index=i,
                        start=round(start_time, 3),
                        end=round(end_time, 3),
                        source_text=source_text,
                    )
                )
    except Exception as exc:
        logger.warning(f"Failed to parse SRT file {srt_path}: {exc}")

    return segments