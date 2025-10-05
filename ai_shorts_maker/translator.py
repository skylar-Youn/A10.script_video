"""Translator project repository and utilities."""
from __future__ import annotations

import json
import logging
import glob
import re
import html
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, ValidationError

from .models import ProjectSummary
from .repository import OUTPUT_DIR as SHORTS_OUTPUT_DIR
from .subtitles import parse_subtitle_file, CaptionLine

logger = logging.getLogger(__name__)

TRANSLATOR_DIR = SHORTS_OUTPUT_DIR / "translator_projects"
UPLOADS_DIR = SHORTS_OUTPUT_DIR / "uploads"
DEFAULT_SEGMENT_MAX = 45.0
MERGE_TIME_TOLERANCE = 0.1  # seconds

# 음성 생성 진행률 추적을 위한 전역 딕셔너리
_audio_generation_progress = {}


class TranslatorSegment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    clip_index: int
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    source_text: Optional[str] = None
    translated_text: Optional[str] = None
    reverse_translated_text: Optional[str] = None
    commentary: Optional[str] = None  # 해설 텍스트 (호환성용)
    commentary_korean: Optional[str] = None  # 해설 한국어
    commentary_japanese: Optional[str] = None  # 해설 일본어
    commentary_reverse_korean: Optional[str] = None  # 해설 역번역 한국어
    speaker_name: Optional[str] = None  # 화자 표시
    audio_path: Optional[str] = None  # 일본어 음성 파일 경로
    audio_duration: Optional[float] = None  # 최종 저장된 음성 길이(초)
    audio_generated_duration: Optional[float] = None  # TTS로 생성된 원본 음성 길이(초)


class TranslatorProject(BaseModel):
    id: str
    base_name: str
    source_video: str
    source_subtitle: Optional[str] = None
    source_origin: Literal["youtube", "upload"] = "youtube"
    target_lang: Literal["ko", "en", "ja"]
    translation_mode: Literal["literal", "adaptive", "reinterpret"] = "adaptive"
    tone_hint: Optional[str] = None
    prompt_hint: Optional[str] = None
    fps: Optional[int] = None
    voice: Optional[str] = None
    voice_synthesis_mode: Literal["subtitle", "commentary", "both"] = "subtitle"  # 음성 합성 대상
    music_track: Optional[str] = None
    duration: Optional[float] = None
    segment_max_duration: float = DEFAULT_SEGMENT_MAX
    status: Literal[
        "draft",
        "segmenting",
        "translating",
        "voice_ready",
        "voice_complete",
        "rendering",
        "rendered",
        "failed",
    ] = "segmenting"
    segments: List[TranslatorSegment] = Field(default_factory=list)
    metadata_path: str
    created_at: datetime
    updated_at: datetime
    extra: Dict[str, Any] = Field(default_factory=dict)

    def completed_steps(self) -> int:
        status_order = {
            "draft": 1,
            "segmenting": 1,
            "translating": 2,
            "voice_ready": 3,
            "voice_complete": 4,
            "rendering": 4,
            "rendered": 5,
            "failed": 1,
        }
        return status_order.get(self.status, 1)


class TranslatorProjectCreate(BaseModel):
    source_video: str
    source_subtitle: Optional[str] = None
    source_origin: Literal["youtube", "upload"] = "youtube"
    target_lang: Literal["ko", "en", "ja"]
    translation_mode: Literal["literal", "adaptive", "reinterpret"] = "adaptive"
    tone_hint: Optional[str] = None
    prompt_hint: Optional[str] = None
    fps: Optional[int] = None
    voice: Optional[str] = None
    music_track: Optional[str] = None
    duration: Optional[float] = None
    segment_max_duration: Optional[float] = None


class TranslatorProjectUpdate(BaseModel):
    status: Optional[TranslatorProject.__fields__["status"].annotation] = None  # type: ignore[valid-type]
    segments: Optional[List[TranslatorSegment]] = None
    tone_hint: Optional[str] = None
    prompt_hint: Optional[str] = None
    voice: Optional[str] = None
    music_track: Optional[str] = None
    source_video: Optional[str] = None
    source_subtitle: Optional[str] = None
    target_lang: Optional[Literal["ko", "en", "ja"]] = None
    translation_mode: Optional[Literal["literal", "adaptive", "reinterpret"]] = None
    extra: Optional[Dict[str, Any]] = None


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


def _parse_srt_text(srt_text: str, selected_speakers: Optional[List[str]] = None) -> List[TranslatorSegment]:
    """Parse SRT text content and create segments with timing and text.

    Args:
        srt_text: SRT text content
        selected_speakers: List of speaker names to filter (e.g., ['화자1', '화자3'])
    """
    segments: List[TranslatorSegment] = []
    try:
        content = srt_text.strip()
        if not content:
            return []

        logger.info(f"🔍 Parsing SRT with selected_speakers: {selected_speakers}")
        print(f"🔍 Parsing SRT with selected_speakers: {selected_speakers}", flush=True)

        # Split by double newlines to separate subtitle blocks
        blocks = content.split('\n\n')
        logger.info(f"📋 Total blocks: {len(blocks)}")
        print(f"📋 Total blocks: {len(blocks)}", flush=True)

        import re
        total_count = 0
        filtered_count = 0

        # Print first block for debugging
        if len(blocks) > 0:
            print(f"📝 First block sample:\n{blocks[0][:200]}", flush=True)

        for i, block in enumerate(blocks):
            lines = block.strip().split('\n')
            if len(lines) < 3:
                if i < 3:
                    print(f"  Block {i} skipped: only {len(lines)} lines", flush=True)
                continue

            # Skip subtitle number (first line)
            timing_line = lines[1]
            text_lines = lines[2:]

            # Parse timing: "00:00:00,160 --> 00:00:05,480"
            if ' --> ' not in timing_line:
                if i < 3:
                    print(f"  Block {i} skipped: no --> in timing line", flush=True)
                continue

            start_str, end_str = timing_line.split(' --> ')
            start_time = _parse_srt_time(start_str)
            end_time = _parse_srt_time(end_str)

            # Combine text lines
            source_text = ' '.join(text_lines).strip()
            total_count += 1

            # Extract speaker information from text - matching frontend pattern
            speaker = None
            original_text = source_text

            # Frontend pattern: /^[\[\(]?(화자\d+|SPEAKER_\d+|Speaker \d+)[\]\)]?:?/i
            speaker_match = re.match(r'^[\[\(]?(화자\d+|SPEAKER_\d+|Speaker\s+\d+)[\]\)]?:?\s*', source_text, re.IGNORECASE)
            if speaker_match:
                speaker = speaker_match.group(1)
                # Normalize speaker name to 화자X format
                if speaker.upper().startswith('SPEAKER_'):
                    num = speaker.split('_')[1]
                    speaker = f'화자{num}'
                elif speaker.upper().startswith('SPEAKER '):
                    num = speaker.split()[-1]
                    speaker = f'화자{num}'
                # Remove speaker prefix from text
                source_text = source_text[speaker_match.end():].strip()

            # Log first few segments for debugging
            if i < 5:
                print(f"  Segment {i}: speaker={speaker}, original_text={original_text[:80]}", flush=True)
                logger.info(f"  Segment {i}: speaker={speaker}, original_text={original_text[:50]}")

            # Filter by selected speakers if provided
            if selected_speakers is not None and len(selected_speakers) > 0:
                if speaker is None:
                    if i < 3:
                        print(f"  ⏭️  Skipping segment {i}: no speaker detected", flush=True)
                    logger.info(f"  ⏭️  Skipping segment {i}: no speaker detected in '{original_text[:50]}'")
                    continue
                if speaker not in selected_speakers:
                    if i < 5:
                        print(f"  ⏭️  Skipping segment {i}: speaker '{speaker}' not in {selected_speakers}", flush=True)
                    logger.info(f"  ⏭️  Skipping segment {i}: speaker '{speaker}' not in selected_speakers {selected_speakers}")
                    continue
                filtered_count += 1
                if i < 10:
                    print(f"  ✓ Including segment {i}: speaker '{speaker}' matched", flush=True)
                logger.info(f"  ✓ Including segment {i}: speaker '{speaker}' matched")

            if source_text:  # Only add segments with text
                segments.append(
                    TranslatorSegment(
                        clip_index=i,
                        start=round(start_time, 3),
                        end=round(end_time, 3),
                        source_text=source_text,
                        speaker_name=speaker,
                    )
                )

        print(f"✅ Parsed {len(segments)} segments (total: {total_count}, filtered: {filtered_count}, selected_speakers: {selected_speakers})", flush=True)
        logger.info(f"✅ Parsed {len(segments)} segments (total: {total_count}, filtered: {filtered_count}, selected_speakers: {selected_speakers})")

    except Exception as exc:
        logger.exception(f"Failed to parse SRT text: {exc}")

    return segments


def parse_subtitle_text_and_add_to_project(
    project_id: str,
    subtitle_text: str,
    subtitle_format: str = "srt",
    target_field: str = "source_text",
    selected_speakers: Optional[List[str]] = None
) -> dict:
    """Parse subtitle text and add segments to project, sorted by time.

    Args:
        project_id: Project ID
        subtitle_text: Subtitle file content
        subtitle_format: Format of subtitle (srt or vtt)
        target_field: Target field to add subtitle text (source_text or commentary_korean)
        selected_speakers: List of speaker names to filter (e.g., ['화자1', '화자3'])

    Returns:
        dict with 'project' and 'added_count'
    """
    project = load_project(project_id)

    # Parse subtitle text with speaker filtering
    if subtitle_format.lower() == "srt":
        new_segments = _parse_srt_text(subtitle_text, selected_speakers)
    else:
        # VTT format could be added here in the future
        raise ValueError(f"Unsupported subtitle format: {subtitle_format}")

    if not new_segments:
        raise ValueError("No valid segments found in subtitle text (after speaker filtering)")

    def _find_matching_segment(candidate: TranslatorSegment) -> Optional[TranslatorSegment]:
        """Find an existing segment with nearly identical timing."""
        best_match: Optional[TranslatorSegment] = None
        best_score = float("inf")
        for existing in project.segments:
            start_diff = abs(existing.start - candidate.start)
            end_diff = abs(existing.end - candidate.end)
            if start_diff <= MERGE_TIME_TOLERANCE and end_diff <= MERGE_TIME_TOLERANCE:
                score = start_diff + end_diff
                if score < best_score:
                    best_score = score
                    best_match = existing
        return best_match

    added_segments: List[TranslatorSegment] = []
    replaced_count = 0
    removed_ids: set[str] = set()

    for seg in new_segments:
        match = _find_matching_segment(seg)
        if match:
            # Update existing segment in place
            if target_field == "commentary_korean":
                match.commentary_korean = seg.source_text
            else:
                match.source_text = seg.source_text

            # Keep speaker information in sync when provided
            if seg.speaker_name:
                match.speaker_name = seg.speaker_name

            # Sync timing if there is a noticeable drift
            if abs(match.start - seg.start) > MERGE_TIME_TOLERANCE / 2:
                match.start = seg.start
            if abs(match.end - seg.end) > MERGE_TIME_TOLERANCE / 2:
                match.end = seg.end

            # Mark other overlapping duplicates for removal (legacy duplicates 방지)
            for existing in project.segments:
                if existing.id == match.id:
                    continue
                if (
                    abs(existing.start - seg.start) <= MERGE_TIME_TOLERANCE
                    and abs(existing.end - seg.end) <= MERGE_TIME_TOLERANCE
                ):
                    removed_ids.add(existing.id)

            replaced_count += 1
            continue

        # No existing segment matched – treat as a new segment
        if target_field == "commentary_korean":
            seg.commentary_korean = seg.source_text
            seg.source_text = ""
        added_segments.append(seg)

    if added_segments:
        project.segments.extend(added_segments)

    if removed_ids:
        project.segments = [seg for seg in project.segments if seg.id not in removed_ids]

    # Sort all segments by start time and reindex
    if added_segments or replaced_count or removed_ids:
        project.segments.sort(key=lambda seg: seg.start)
        for i, seg in enumerate(project.segments):
            seg.clip_index = i

    added_count = len(added_segments)
    speaker_info = f" (speakers: {', '.join(selected_speakers)})" if selected_speakers else ""

    # 즉시 저장하여 UI 새로고침 이전에도 데이터가 유지되도록 함
    saved_project = save_project(project)

    logger.info(
        "Saved %s new segments, replaced %s segments, removed %s duplicates for project %s in field '%s'%s",
        added_count,
        replaced_count,
        len(removed_ids),
        project_id,
        target_field,
        speaker_info,
    )

    return {
        "project": saved_project,
        "added_count": added_count,
        "replaced_count": replaced_count,
        "removed_count": len(removed_ids),
    }


def _build_segments(duration: Optional[float], max_length: float, subtitle_path: Optional[str] = None) -> List[TranslatorSegment]:
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


def _restore_missing_audio_paths(project: TranslatorProject) -> TranslatorProject:
    """Back-fill segment audio_path values from existing audio files if metadata is missing."""
    try:
        audio_dir = TRANSLATOR_DIR / project.id / "audio"
        if not audio_dir.exists():
            return project

        missing_segments = [seg for seg in project.segments if not seg.audio_path]
        if not missing_segments:
            return project

        restored_segment_ids: List[str] = []

        # Prefer per-segment audio files named with the segment id prefix
        for segment in missing_segments:
            pattern = f"segment_*_{segment.id[:8]}.*"
            matches = sorted(audio_dir.glob(pattern))
            if matches:
                segment.audio_path = str(matches[0])
                restored_segment_ids.append(segment.id)

        # If no individual matches were found, fall back to combined timeline audio
        if not restored_segment_ids:
            combined_candidates = sorted(audio_dir.glob("selected_audio_*_segments.*"))
            for candidate in combined_candidates:
                match = re.search(r"selected_audio_(\d+)_segments", candidate.name)
                if not match:
                    continue
                segment_count = int(match.group(1))
                if segment_count != len(project.segments):
                    continue

                path_str = str(candidate)
                for segment in missing_segments:
                    segment.audio_path = path_str
                    restored_segment_ids.append(segment.id)
                break

        if restored_segment_ids:
            try:
                save_project(project)
                logger.info(
                    "Restored %d segment audio paths for project %s using local files",
                    len(restored_segment_ids),
                    project.id,
                )
            except Exception as exc:  # pragma: no cover - best effort persistence
                logger.warning(
                    "Failed to persist restored audio paths for project %s: %s",
                    project.id,
                    exc,
                )

        return project

    except Exception as exc:  # pragma: no cover - restoration should never block loading
        logger.warning(
            "Failed to restore missing audio paths for project %s: %s",
            getattr(project, "id", "<unknown>"),
            exc,
        )
        return project


def _save_translation_version(project: TranslatorProject) -> None:
    """Save a versioned backup of translation results for comparison."""
    try:
        # Create versions directory
        versions_dir = TRANSLATOR_DIR / "versions" / project.id
        versions_dir.mkdir(parents=True, exist_ok=True)

        # Find next version number
        existing_versions = list(versions_dir.glob("v*.json"))
        if existing_versions:
            version_numbers = []
            for v_file in existing_versions:
                try:
                    version_num = int(v_file.stem[1:])  # Remove 'v' prefix
                    version_numbers.append(version_num)
                except ValueError:
                    continue
            next_version = max(version_numbers) + 1 if version_numbers else 1
        else:
            next_version = 1

        # Save versioned file
        version_file = versions_dir / f"v{next_version}.json"
        version_data = {
            "version": next_version,
            "created_at": project.updated_at.isoformat() if project.updated_at else datetime.utcnow().isoformat(),
            "target_lang": project.target_lang,
            "translation_mode": project.translation_mode,
            "tone_hint": project.tone_hint,
            "segments": [
                {
                    "id": seg.id,
                    "start": seg.start,
                    "end": seg.end,
                    "source_text": seg.source_text,
                    "translated_text": seg.translated_text
                }
                for seg in project.segments
                if seg.translated_text  # Only save segments with translations
            ]
        }

        version_file.write_text(
            json.dumps(version_data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )

        logger.info(f"Saved translation version {next_version} for project {project.id}")

    except Exception as exc:
        logger.warning(f"Failed to save translation version: {exc}")


def list_translation_versions(project_id: str) -> List[Dict[str, Any]]:
    """List all translation versions for a project."""
    versions_dir = TRANSLATOR_DIR / "versions" / project_id
    if not versions_dir.exists():
        return []

    versions = []
    for version_file in sorted(versions_dir.glob("v*.json")):
        try:
            data = json.loads(version_file.read_text(encoding="utf-8"))
            versions.append({
                "version": data.get("version", 1),
                "created_at": data.get("created_at", ""),
                "target_lang": data.get("target_lang", ""),
                "translation_mode": data.get("translation_mode", ""),
                "tone_hint": data.get("tone_hint", ""),
                "segments_count": len(data.get("segments", []))
            })
        except Exception as exc:
            logger.warning(f"Failed to load version {version_file}: {exc}")

    return versions


def load_translation_version(project_id: str, version: int) -> Optional[Dict[str, Any]]:
    """Load a specific translation version."""
    version_file = TRANSLATOR_DIR / "versions" / project_id / f"v{version}.json"
    if not version_file.exists():
        return None

    try:
        return json.loads(version_file.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning(f"Failed to load version {version}: {exc}")
        return None


def _migrate_project_schema(project_data: Dict[str, Any]) -> Dict[str, Any]:
    """Migrate project data to current schema."""
    # Ensure voice_synthesis_mode exists
    if "voice_synthesis_mode" not in project_data:
        project_data["voice_synthesis_mode"] = "subtitle"

    # Ensure all segments have commentary field
    if "segments" in project_data:
        for segment in project_data["segments"]:
            if "commentary" not in segment:
                segment["commentary"] = None
            if "speaker_name" not in segment:
                segment["speaker_name"] = None

    return project_data


def _match_segment_by_time(
    segments: List[TranslatorSegment],
    start_time: Optional[float],
    fallback_text: Optional[str] = None,
    tolerance: float = 0.3,
) -> Optional[TranslatorSegment]:
    if start_time is None:
        return None
    candidates: List[TranslatorSegment] = []
    for seg in segments:
        if abs(seg.start - start_time) <= tolerance:
            candidates.append(seg)
        elif fallback_text and seg.source_text and seg.source_text.strip() == fallback_text.strip():
            candidates.append(seg)
    if not candidates:
        return None
    return min(candidates, key=lambda seg: abs(seg.start - start_time))


def apply_saved_result_to_project(project_id: str, saved_result: Dict[str, Any]) -> TranslatorProject:
    """Merge timeline classification data into a translator project."""

    project = load_project(project_id)
    classification = (
        saved_result.get("timelineSnapshot", {})
        .get("classification")
    )

    if not isinstance(classification, dict):
        raise ValueError("Saved result does not contain timeline classification data")

    updated = False

    # Update main track speaker info
    for entry in classification.get("main", []) or []:
        if not isinstance(entry, dict):
            continue
        segment = _match_segment_by_time(
            project.segments,
            entry.get("start_time"),
            entry.get("text"),
        )
        if not segment:
            continue
        speaker = entry.get("speaker_name")
        if speaker and segment.speaker_name != speaker:
            segment.speaker_name = speaker
            updated = True

    # Update description track with reinterpretation text and speaker info
    for entry in classification.get("description", []) or []:
        if not isinstance(entry, dict):
            continue
        segment = _match_segment_by_time(project.segments, entry.get("start_time"))
        if not segment:
            continue

        speaker = entry.get("speaker_name")
        text = entry.get("text")

        if speaker and segment.speaker_name != speaker:
            segment.speaker_name = speaker
            updated = True

        if text and segment.commentary_korean != text:
            segment.commentary_korean = text
            updated = True

    if not updated:
        return project

    return save_project(project)


def load_project(project_id: str) -> TranslatorProject:
    path = _project_path(project_id)
    if not path.exists():
        raise FileNotFoundError(f"Translator project {project_id} not found")
    data = json.loads(path.read_text(encoding="utf-8"))

    # Migrate to current schema
    data = _migrate_project_schema(data)
    try:
        project = TranslatorProject.model_validate(data)
    except ValidationError as exc:  # pragma: no cover
        raise ValueError(f"Invalid translator project data: {exc}") from exc
    return _restore_missing_audio_paths(project)


def list_projects() -> List[TranslatorProject]:
    ensure_directories()
    projects: List[TranslatorProject] = []
    for file_path in sorted(TRANSLATOR_DIR.glob("*.json")):
        try:
            projects.append(load_project(file_path.stem))
        except (FileNotFoundError, ValueError) as exc:
            logger.warning("Failed to load translator project %s: %s", file_path, exc)
    return projects


def delete_project(project_id: str) -> None:
    path = _project_path(project_id)
    if path.exists():
        try:
            path.unlink()
        except OSError as exc:
            logger.warning("Failed to delete translator project %s: %s", project_id, exc)

    legacy_dir = TRANSLATOR_DIR / project_id
    legacy_metadata = legacy_dir / "metadata.json"
    if legacy_metadata.exists():
        try:
            legacy_metadata.unlink()
        except OSError as exc:
            logger.warning("Failed to remove legacy metadata for %s: %s", project_id, exc)

    if legacy_dir.exists():
        import shutil

        try:
            shutil.rmtree(legacy_dir)
        except OSError as exc:
            logger.warning("Failed to remove translator assets for %s: %s", project_id, exc)

    versions_dir = TRANSLATOR_DIR / "versions" / project_id
    if versions_dir.exists():
        import shutil

        try:
            shutil.rmtree(versions_dir)
        except OSError as exc:
            logger.warning("Failed to remove translator versions for %s: %s", project_id, exc)


def update_project(project_id: str, payload: TranslatorProjectUpdate) -> TranslatorProject:
    project = load_project(project_id)

    if payload.status is not None:
        project.status = payload.status
    if payload.segments is not None:
        # ensure segments sorted by clip_index
        sorted_segments = sorted(payload.segments, key=lambda seg: seg.clip_index)
        project.segments = sorted_segments
    if payload.tone_hint is not None:
        project.tone_hint = payload.tone_hint
    if payload.prompt_hint is not None:
        project.prompt_hint = payload.prompt_hint
    if payload.voice is not None:
        project.voice = payload.voice
    if payload.music_track is not None:
        project.music_track = payload.music_track
    if payload.target_lang is not None:
        project.target_lang = payload.target_lang
    if payload.translation_mode is not None:
        project.translation_mode = payload.translation_mode
    if payload.source_video is not None:
        project.source_video = payload.source_video
        try:
            project.base_name = Path(payload.source_video).stem or project.base_name
        except Exception:  # pragma: no cover - fallback if Path fails
            pass
    if payload.source_subtitle is not None:
        project.source_subtitle = payload.source_subtitle
    if payload.extra is not None:
        # Merge extra dict with existing extra
        if not isinstance(project.extra, dict):
            project.extra = {}
        project.extra.update(payload.extra)

    return save_project(project)


def delete_project_segment(project_id: str, segment_id: str) -> TranslatorProject:
    project = load_project(project_id)

    original_count = len(project.segments)
    segments = [seg for seg in project.segments if seg.id != segment_id]

    if len(segments) == original_count:
        raise ValueError(f"Segment {segment_id} not found in project {project_id}")

    for index, seg in enumerate(segments):
        seg.clip_index = index

    project.segments = segments
    return save_project(project)


def translator_summary(project: TranslatorProject) -> Dict[str, Any]:
    return {
        "id": project.id,
        "title": project.base_name,
        "project_type": "translator",
        "status": project.status,
        "completed_steps": project.completed_steps(),
        "total_steps": 5,
        "thumbnail": project.source_video,
        "updated_at": project.updated_at.isoformat(),
        "language": project.target_lang,
        "topic": project.prompt_hint or project.tone_hint,
        "source_origin": project.source_origin,
    }


def vtt_to_srt(vtt_content: str) -> str:
    """Convert VTT content to SRT format."""
    lines = vtt_content.split('\n')
    srt_lines = []
    subtitle_counter = 1

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        # Skip WEBVTT header and empty lines
        if line.startswith('WEBVTT') or line == '' or line.startswith('NOTE'):
            i += 1
            continue

        # Check if this is a timestamp line
        if '-->' in line:
            # Convert VTT timestamp to SRT timestamp and remove VTT styling
            timestamp_line = line.replace('.', ',')
            # Remove VTT styling attributes like "align:start position:0%"
            timestamp_parts = timestamp_line.split()
            if len(timestamp_parts) >= 3:  # Should have start --> end
                clean_timestamp = ' '.join(timestamp_parts[:3])  # Keep only "start --> end"
            else:
                clean_timestamp = timestamp_line

            # Add subtitle number
            srt_lines.append(str(subtitle_counter))
            srt_lines.append(clean_timestamp)

            # Get subtitle text (next non-empty lines until empty line or end)
            i += 1
            text_lines = []
            while i < len(lines) and lines[i].strip() != '':
                text = lines[i].strip()
                # Remove VTT formatting tags
                text = re.sub(r'<[^>]*>', '', text)
                # Decode HTML entities
                text = html.unescape(text)
                if text:
                    text_lines.append(text)
                i += 1

            if text_lines:
                srt_lines.extend(text_lines)
                srt_lines.append('')  # Empty line after each subtitle
                subtitle_counter += 1
        else:
            i += 1

    return '\n'.join(srt_lines)


def fix_malformed_srt(srt_path: Path) -> None:
    """Fix malformed SRT files with VTT styling and numbering issues."""
    if not srt_path.exists():
        raise FileNotFoundError(f"SRT file not found: {srt_path}")

    try:
        content = srt_path.read_text(encoding='utf-8')
        lines = [line.strip() for line in content.split('\n')]

        # Extract all subtitle entries
        subtitle_entries = []
        i = 0

        while i < len(lines):
            line = lines[i]

            # Skip empty lines
            if not line:
                i += 1
                continue

            # Look for timestamp lines
            if '-->' in line:
                # Clean timestamp (remove VTT styling)
                timestamp_parts = line.replace('.', ',').split()
                if len(timestamp_parts) >= 3:
                    clean_timestamp = ' '.join(timestamp_parts[:3])
                else:
                    clean_timestamp = line.replace('.', ',')

                # Collect all text lines for this subtitle
                i += 1
                text_lines = []
                while i < len(lines) and lines[i] and '-->' not in lines[i]:
                    text = lines[i]
                    # Skip if it's just a number or duplicate
                    if not text.isdigit() and text not in text_lines:
                        text = html.unescape(text)
                        if text:
                            text_lines.append(text)
                    i += 1

                # Only add if we have text
                if text_lines:
                    subtitle_entries.append({
                        'timestamp': clean_timestamp,
                        'text': text_lines
                    })
            else:
                i += 1

        # Rebuild the SRT file properly
        fixed_lines = []
        for idx, entry in enumerate(subtitle_entries, 1):
            fixed_lines.append(str(idx))
            fixed_lines.append(entry['timestamp'])
            fixed_lines.extend(entry['text'])
            fixed_lines.append('')  # Empty line

        fixed_content = '\n'.join(fixed_lines).strip() + '\n'

        if content != fixed_content:
            srt_path.write_text(fixed_content, encoding='utf-8')
            logger.info(f"Fixed malformed SRT: {srt_path}")

    except Exception as e:
        logger.error(f"Failed to fix malformed SRT: {e}")
        raise


def clean_html_entities_from_srt(srt_path: Path) -> None:
    """Clean HTML entities from existing SRT file."""
    if not srt_path.exists():
        raise FileNotFoundError(f"SRT file not found: {srt_path}")

    try:
        content = srt_path.read_text(encoding='utf-8')
        cleaned_content = html.unescape(content)

        if content != cleaned_content:
            srt_path.write_text(cleaned_content, encoding='utf-8')
            logger.info(f"Cleaned HTML entities from SRT: {srt_path}")

    except Exception as e:
        logger.error(f"Failed to clean HTML entities from SRT: {e}")
        raise


def convert_vtt_to_srt(vtt_path: Path) -> Path:
    """Convert VTT file to SRT format in the same directory."""
    if not vtt_path.exists():
        raise FileNotFoundError(f"VTT file not found: {vtt_path}")

    srt_path = vtt_path.with_suffix('.srt')

    try:
        vtt_content = vtt_path.read_text(encoding='utf-8')
        srt_content = vtt_to_srt(vtt_content)
        srt_path.write_text(srt_content, encoding='utf-8')

        logger.info(f"Converted VTT to SRT: {vtt_path} -> {srt_path}")
        return srt_path

    except Exception as e:
        logger.error(f"Failed to convert VTT to SRT: {e}")
        raise


def downloads_listing(download_dir: Optional[Path] = None) -> List[Dict[str, str]]:
    directory = download_dir or (SHORTS_OUTPUT_DIR.parent.parent / "youtube" / "download")
    directory.mkdir(parents=True, exist_ok=True)

    video_files = list(directory.glob("*.mp4")) + list(directory.glob("*.webm"))
    response: List[Dict[str, str]] = []
    for video in sorted(video_files):
        base = video.stem
        subtitle: Optional[Path] = None

        # First, check if SRT already exists
        escaped_base = glob.escape(base)
        srt_candidates = sorted(list(directory.glob(f"{escaped_base}*.srt")))
        if srt_candidates:
            subtitle = srt_candidates[0]
            # Fix malformed SRT and clean HTML entities
            try:
                fix_malformed_srt(subtitle)
            except Exception as e:
                logger.warning(f"Failed to fix malformed SRT {subtitle}: {e}")
                # Fallback to just cleaning HTML entities
                try:
                    clean_html_entities_from_srt(subtitle)
                except Exception as e2:
                    logger.warning(f"Failed to clean HTML entities from {subtitle}: {e2}")
        else:
            # Look for VTT files and convert them to SRT
            vtt_candidates = sorted(list(directory.glob(f"{escaped_base}*.vtt")))
            if vtt_candidates:
                try:
                    vtt_path = vtt_candidates[0]
                    subtitle = convert_vtt_to_srt(vtt_path)
                except Exception as e:
                    logger.warning(f"Failed to convert VTT to SRT for {vtt_path}: {e}")
                    subtitle = vtt_path  # Fall back to VTT if conversion fails
            else:
                # Look for other subtitle formats
                for ext in (".ass", ".json"):
                    subtitle_candidates = sorted(list(directory.glob(f"{escaped_base}*{ext}")))
                    if subtitle_candidates:
                        subtitle = subtitle_candidates[0]
                        break

        response.append(
            {
                "video_path": str(video),
                "subtitle_path": str(subtitle) if subtitle else "",
                "base_name": base,
            }
        )
    return response


def translate_project_summary(summary: ProjectSummary) -> Dict[str, Any]:
    """Convert Shorts ProjectSummary to dashboard card."""
    thumbnail = summary.video_path or summary.audio_path or summary.base_name
    updated = summary.updated_at.isoformat() if summary.updated_at else None

    audio_ready = bool(summary.audio_path)
    video_ready = bool(summary.video_path)

    if video_ready:
        status = "rendered"
        completed = 5
    elif audio_ready:
        status = "voice_ready"
        completed = 3
    else:
        status = "draft"
        completed = 1

    return {
        "id": summary.base_name,
        "title": summary.topic or summary.base_name,
        "project_type": "shorts",
        "status": status,
        "completed_steps": completed,
        "total_steps": 5,
        "thumbnail": thumbnail,
        "updated_at": updated,
        "language": summary.language,
        "topic": summary.topic,
    }


def aggregate_dashboard_projects(shorts: Iterable[ProjectSummary]) -> List[Dict[str, Any]]:
    translator = [translator_summary(project) for project in list_projects()]
    shorts_cards = [translate_project_summary(item) for item in shorts]
    return translator + shorts_cards


def populate_segments_from_subtitles(project: TranslatorProject) -> TranslatorProject:
    """Load subtitles and populate segment source text."""
    if not project.source_subtitle:
        logger.warning("Project %s has no source subtitle file.", project.id)
        return project

    subtitle_path = Path(project.source_subtitle)
    if not subtitle_path.exists():
        logger.error("Subtitle file not found for project %s: %s", project.id, subtitle_path)
        project.status = "failed"
        project.extra["error"] = f"Subtitle file not found: {subtitle_path.name}"
        return save_project(project)

    captions = parse_subtitle_file(subtitle_path)
    if not captions:
        logger.warning("No captions found in %s", subtitle_path)
        return project

    for segment in project.segments:
        segment_captions = [
            cap.text
            for cap in captions
            if cap.start >= segment.start and cap.end <= segment.end
        ]
        segment.source_text = " ".join(segment_captions).strip()

    logger.info("Populated %d segments with source text for project %s", len(project.segments), project.id)
    return project


def generate_ai_commentary_for_project(project_id: str) -> TranslatorProject:
    """Generate AI commentary for all segments in a project based on source text."""
    project = load_project(project_id)

    if project.status not in ["segmenting", "draft"]:
        logger.warning("Project %s is not in a state for AI commentary generation (status: %s)", project_id, project.status)
        return project

    project = populate_segments_from_subtitles(project)
    if not any(seg.source_text for seg in project.segments):
        project.status = "failed"
        project.extra["error"] = "Could not find any source text to generate commentary from."
        return save_project(project)

    try:
        from .openai_client import OpenAIShortsClient
        client = OpenAIShortsClient()

        # Generate commentary for each segment
        for segment in project.segments:
            if not segment.source_text:
                continue

            # Create prompt for commentary generation
            commentary_prompt = f"""다음은 동영상의 자막 내용입니다. 이 내용에 대해 간단하고 유익한 해설을 한국어로 작성해주세요.

자막 내용: "{segment.source_text}"

해설 요구사항:
- 1-2문장으로 간결하게
- 이해를 돕거나 추가 정보를 제공
- 자연스럽고 친근한 톤
- 시청자에게 도움이 되는 내용

해설:"""

            try:
                commentary = client.generate_script(
                    prompt=commentary_prompt,
                    temperature=0.7
                ).strip()

                segment.commentary = commentary
                logger.info(f"Generated commentary for segment {segment.id}: {commentary[:50]}...")

            except Exception as exc:
                logger.warning(f"Failed to generate commentary for segment {segment.id}: {exc}")
                continue

        project.status = "segmenting"  # Keep in segmenting status
        project = save_project(project)

        logger.info(f"AI commentary generation completed for project {project_id}")
        return project

    except Exception as exc:
        logger.exception("Failed to generate AI commentary for project %s", project_id)
        project.status = "failed"
        project.extra["error"] = f"AI 해설 생성 중 오류 발생: {str(exc)}"
        return save_project(project)


def _find_optimal_commentary_positions(segments: List[TranslatorSegment]) -> List[float]:
    """Find optimal positions to insert commentary between subtitle segments."""
    commentary_positions = []

    for i in range(len(segments) - 1):
        current_segment = segments[i]
        next_segment = segments[i + 1]

        # Calculate gap between current segment end and next segment start
        gap = next_segment.start - current_segment.end

        # If gap is at least 3 seconds, it's suitable for commentary
        if gap >= 3.0:
            # Place commentary in the middle of the gap
            commentary_time = current_segment.end + (gap / 2)
            commentary_positions.append(commentary_time)
        # If gap is between 1.5-3 seconds, place commentary at the end of current segment
        elif gap >= 1.5:
            commentary_time = current_segment.end + 0.5
            commentary_positions.append(commentary_time)
        # For overlapping segments (negative gap), place commentary at the end of current segment
        elif gap < 0:
            # Find a small gap after current segment to insert commentary
            commentary_time = current_segment.end + 0.3
            commentary_positions.append(commentary_time)

    # Add commentary at strategic points (every 15-20 seconds) if no natural gaps found
    if not commentary_positions and segments:
        video_duration = max(seg.end for seg in segments)
        # Add commentary every 18 seconds
        for time_point in [18.0, 36.0, 54.0]:
            if time_point < video_duration - 5.0:  # Don't add too close to end
                commentary_positions.append(time_point)

    # Also consider adding commentary at the very beginning if first segment starts late
    if segments and segments[0].start >= 2.0:
        commentary_positions.insert(0, segments[0].start - 1.0)

    return sorted(commentary_positions)


def _create_commentary_segments(segments: List[TranslatorSegment], commentary_positions: List[float]) -> List[TranslatorSegment]:
    """Create commentary-only segments at specified positions."""
    commentary_segments = []

    for i, position in enumerate(commentary_positions):
        # Commentary segment duration: 2-3 seconds
        start_time = max(0, position)
        end_time = start_time + 2.5

        commentary_segment = TranslatorSegment(
            clip_index=1000 + i,  # Use high index to distinguish commentary segments
            start=round(start_time, 3),
            end=round(end_time, 3),
            source_text=None,  # 원본 자막 (비어있음 - 해설 세그먼트이므로)
            translated_text=None,  # 자막 번역 (비어있음)
            reverse_translated_text=None,  # 자막 역번역 (비어있음)
            commentary_korean=None,  # 해설 한국어
            commentary_japanese=None,  # 해설 일본어 번역
            commentary_reverse_korean=None,  # 해설 역번역 한국어
            commentary=None  # 호환성용
        )
        commentary_segments.append(commentary_segment)

    return commentary_segments


def generate_korean_ai_commentary_for_project(project_id: str) -> TranslatorProject:
    """Generate Korean AI commentary and insert at optimal positions."""
    project = load_project(project_id)

    if project.status not in ["segmenting", "draft", "voice_ready"]:
        logger.warning("Project %s is not in a state for Korean AI commentary generation (status: %s)", project_id, project.status)
        return project

    project = populate_segments_from_subtitles(project)
    if not any(seg.source_text for seg in project.segments):
        project.status = "failed"
        project.extra["error"] = "Could not find any source text to generate commentary from."
        return save_project(project)

    try:
        from .openai_client import OpenAIShortsClient
        client = OpenAIShortsClient()

        # Find optimal positions for commentary insertion
        commentary_positions = _find_optimal_commentary_positions(project.segments)
        logger.info(f"Found {len(commentary_positions)} optimal positions for commentary")

        # Create commentary segments at these positions
        commentary_segments = _create_commentary_segments(project.segments, commentary_positions)

        # Generate AI commentary for each commentary segment
        for i, commentary_segment in enumerate(commentary_segments):
            # Find the surrounding subtitle segments for context
            prev_segments = [seg for seg in project.segments if seg.end <= commentary_segment.start]
            next_segments = [seg for seg in project.segments if seg.start >= commentary_segment.end]

            # Create context from previous segments
            context_texts = []
            if prev_segments:
                # Take last 2 segments for context
                context_segments = prev_segments[-2:] if len(prev_segments) >= 2 else prev_segments
                context_texts = [seg.source_text for seg in context_segments if seg.source_text]

            # Create prompt for Korean commentary generation
            context_str = " ".join(context_texts) if context_texts else "영상 시작"
            korean_commentary_prompt = f"""다음은 드라마/예능 프로그램의 한국어 자막 내용입니다. 이 상황에서 시청자를 위한 재미있고 유용한 해설을 한국어로 작성해주세요.

이전 자막 내용: "{context_str}"

해설 요구사항:
- 한국어로 1문장으로 간결하게 작성 (10-15자 내외)
- 상황을 재미있게 설명하거나 배경 정보 제공
- 시청자의 이해를 돕는 추가 설명
- 드라마틱하고 재미있는 톤 사용
- 이전 내용을 반복하지 말고 새로운 관점 제공

한국어 해설:"""

            try:
                # Generate Korean commentary
                korean_commentary = client.generate_script(
                    prompt=korean_commentary_prompt,
                    temperature=0.8
                ).strip()
                korean_commentary = korean_commentary.strip('"').strip("'")
                commentary_segment.commentary_korean = korean_commentary

                # Generate Japanese translation
                japanese_translation_prompt = f"""다음 한국어 해설을 자연스러운 일본어로 번역해주세요.

한국어 해설: "{korean_commentary}"

일본어 번역:"""

                japanese_translation = client.generate_script(
                    prompt=japanese_translation_prompt,
                    temperature=0.3
                ).strip()
                japanese_translation = japanese_translation.strip('"').strip("'")
                commentary_segment.commentary_japanese = japanese_translation

                # Generate reverse Korean translation
                reverse_korean_prompt = f"""다음 일본어 텍스트를 다시 한국어로 역번역해주세요.

일본어 텍스트: "{japanese_translation}"

한국어 역번역:"""

                reverse_korean = client.generate_script(
                    prompt=reverse_korean_prompt,
                    temperature=0.3
                ).strip()
                reverse_korean = reverse_korean.strip('"').strip("'")
                commentary_segment.commentary_reverse_korean = reverse_korean

                # Keep commentary field for backward compatibility
                commentary_segment.commentary = korean_commentary

                logger.info(f"Generated commentary {i+1} - KR: {korean_commentary}, JP: {japanese_translation}, RV: {reverse_korean}")

            except Exception as exc:
                logger.warning(f"Failed to generate commentary for position {i+1}: {exc}")
                commentary_segment.commentary_korean = "[해설 생성 실패]"
                commentary_segment.commentary_japanese = "[翻訳失敗]"
                commentary_segment.commentary_reverse_korean = "[역번역 실패]"
                commentary_segment.commentary = "[해설 생성 실패]"


        # Merge commentary segments with original segments and sort by time
        all_segments = project.segments + commentary_segments
        all_segments.sort(key=lambda seg: seg.start)

        # Update segment clip_index to maintain order
        for i, segment in enumerate(all_segments):
            segment.clip_index = i

        project.segments = all_segments
        project = save_project(project)
        logger.info(f"Korean AI commentary generation completed for project {project_id}")
        return project

    except Exception as exc:
        logger.exception("Failed to generate Korean AI commentary for project %s", project_id)
        project.status = "failed"
        project.extra["error"] = f"한국어 AI 해설 생성 중 오류 발생: {str(exc)}"
        return save_project(project)


def translate_project_segments(project_id: str) -> TranslatorProject:
    """Run translation for all segments in a project."""
    project = load_project(project_id)

    if project.status not in ["segmenting", "draft"]:
        logger.warning("Project %s is not in a state to be translated (status: %s)", project_id, project.status)
        return project

    project = populate_segments_from_subtitles(project)
    if not any(seg.source_text for seg in project.segments):
        project.status = "failed"
        project.extra["error"] = "Could not find any source text in subtitles to translate."
        return save_project(project)

    project.status = "translating"
    project = save_project(project)

    try:
        from .openai_client import OpenAIShortsClient  # Local import to avoid circular dependency issues

        client = OpenAIShortsClient()

        for segment in project.segments:
            if not segment.source_text:
                continue

            # Remove ">>" prefix from source text for translation
            text_to_translate = segment.source_text.lstrip(">> ").strip()
            if not text_to_translate:
                continue

            translated = client.translate_text(
                text_to_translate=text_to_translate,
                target_lang=project.target_lang,
                translation_mode=project.translation_mode,
                tone_hint=project.tone_hint,
                prompt_hint=project.prompt_hint,
            )
            segment.translated_text = translated

        project.status = "voice_ready"  # Assuming voice is the next step
        project = save_project(project)

        # Save translation results to TXT files
        _save_translation_texts(project)

        return project

    except Exception as e:
        logger.exception("Failed to translate project %s", project_id)
        project.status = "failed"
        project.extra["error"] = str(e)
        return save_project(project)


def translate_text(
    text: str,
    target_lang: str = "ko",
    translation_mode: str = "reinterpret",
    tone_hint: Optional[str] = None,
) -> str:
    """Translate a single text string using the OpenAI client."""
    try:
        from .openai_client import OpenAIShortsClient

        client = OpenAIShortsClient()

        translated = client.translate_text(
            text_to_translate=text,
            target_lang=target_lang,
            translation_mode=translation_mode,
            tone_hint=tone_hint,
            prompt_hint=None,
        )
        return translated

    except Exception as e:
        logger.exception("Failed to translate text: %s", text)
        raise e


def update_segment_text(project_id: str, segment_id: str, text_type: str, text_value: str) -> None:
    """Update a specific text field in a segment."""
    project = load_project(project_id)
    if not project:
        raise FileNotFoundError(f"Project {project_id} not found")

    # Find the segment by ID
    segment = None
    for seg in project.segments:
        if seg.id == segment_id:
            segment = seg
            break

    if not segment:
        raise ValueError(f"Segment {segment_id} not found in project {project_id}")

    # Map text_type values to TranslatorSegment attributes
    field_map = {
        "source": "source_text",
        "translated": "translated_text",
        "reverse_translated": "reverse_translated_text",
        "commentary": "commentary",
        "commentary_korean": "commentary_korean",
        "commentary_japanese": "commentary_japanese",
        "commentary_reverse_korean": "commentary_reverse_korean",
        "reinterpretation": "commentary_korean",
    }

    field_name = field_map.get(text_type)
    if not field_name:
        raise ValueError(f"Invalid text_type: {text_type}")

    setattr(segment, field_name, text_value)

    # Save the updated project
    save_project(project)
    logger.info(
        "Updated %s text for segment %s in project %s",
        text_type,
        segment_id,
        project_id,
    )

    # Keep exported translation summaries in sync when reverse translations change
    if text_type == "reverse_translated":
        _save_translation_texts(project)


def update_segment_time(project_id: str, segment_id: str, start_time: float, end_time: float) -> None:
    """Update the timing of a segment."""
    project = load_project(project_id)
    if not project:
        raise FileNotFoundError(f"Project {project_id} not found")

    # Find the segment by ID
    segment = None
    for seg in project.segments:
        if seg.id == segment_id:
            segment = seg
            break

    if not segment:
        raise ValueError(f"Segment {segment_id} not found in project {project_id}")

    # Update the timing
    segment.start = start_time
    segment.end = end_time

    # Save the updated project
    save_project(project)
    logger.info(
        "Updated timing for segment %s in project %s: %.2f - %.2f",
        segment_id,
        project_id,
        start_time,
        end_time,
    )


def reorder_project_segments(project_id: str, segment_orders: List[Dict[str, Any]]) -> TranslatorProject:
    """Reorder segments in the project based on the provided order list."""
    project = load_project(project_id)
    if not project:
        raise FileNotFoundError(f"Project {project_id} not found")

    # Create a mapping of segment_id to new_index
    order_map = {order["segment_id"]: order["new_index"] for order in segment_orders}

    # Sort segments by the new index order
    reordered_segments = []
    for order in sorted(segment_orders, key=lambda x: x["new_index"]):
        segment_id = order["segment_id"]
        # Find the segment with this ID
        segment = next((seg for seg in project.segments if seg.id == segment_id), None)
        if segment:
            # Update clip_index to match the new order
            segment.clip_index = order["new_index"]
            reordered_segments.append(segment)

    # Replace the segments list with the reordered one
    project.segments = reordered_segments

    # Save the updated project
    save_project(project)
    logger.info(f"Reordered segments in project {project_id}")

    return project


def reset_project_to_translated(project_id: str) -> TranslatorProject:
    """Reset project status back to translated state to allow editing."""
    project = load_project(project_id)
    if not project:
        raise FileNotFoundError(f"Project {project_id} not found")

    # Reset status to translated state
    project.status = "translated"

    # Save the updated project
    save_project(project)
    logger.info(f"Reset project {project_id} to translated state")

    return project


def _save_translation_texts(project: TranslatorProject) -> None:
    """Save translation results to TXT files."""
    from datetime import datetime

    # Create translation_texts directory
    translation_texts_dir = SHORTS_OUTPUT_DIR / "translation_texts"
    translation_texts_dir.mkdir(exist_ok=True)

    # Create timestamp for filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_filename = f"{project.base_name}_{timestamp}"

    # Collect texts
    korean_texts = []
    japanese_texts = []
    reverse_translated_texts = []

    for segment in project.segments:
        if segment.source_text:
            korean_texts.append(f"[{segment.start:.2f}s-{segment.end:.2f}s] {segment.source_text}")

        if segment.translated_text:
            japanese_texts.append(f"[{segment.start:.2f}s-{segment.end:.2f}s] {segment.translated_text}")

        if segment.reverse_translated_text:
            reverse_translated_texts.append(f"[{segment.start:.2f}s-{segment.end:.2f}s] {segment.reverse_translated_text}")

    # Save Korean original text
    if korean_texts:
        korean_file = translation_texts_dir / f"{base_filename}_korean_original.txt"
        korean_file.write_text('\n'.join(korean_texts), encoding='utf-8')
        logger.info(f"Saved Korean original text to {korean_file}")

    # Save Japanese translation
    if japanese_texts:
        japanese_file = translation_texts_dir / f"{base_filename}_japanese_translation.txt"
        japanese_file.write_text('\n'.join(japanese_texts), encoding='utf-8')
        logger.info(f"Saved Japanese translation to {japanese_file}")

    # Save reverse translated Korean
    if reverse_translated_texts:
        reverse_file = translation_texts_dir / f"{base_filename}_korean_reverse.txt"
        reverse_file.write_text('\n'.join(reverse_translated_texts), encoding='utf-8')
        logger.info(f"Saved reverse translated Korean to {reverse_file}")


def synthesize_voice_for_project(project_id: str) -> TranslatorProject:
    """Generate TTS for the entire translated script."""
    project = load_project(project_id)

    if project.status != "voice_ready":
        logger.warning("Project %s is not ready for voice synthesis (status: %s)", project_id, project.status)
        return project

    # Build script based on voice synthesis mode
    script_parts = []
    for seg in project.segments:
        if project.voice_synthesis_mode == "subtitle" and seg.translated_text:
            script_parts.append(seg.translated_text)
        elif project.voice_synthesis_mode == "commentary" and seg.commentary:
            script_parts.append(seg.commentary)
        elif project.voice_synthesis_mode == "both":
            if seg.translated_text:
                script_parts.append(seg.translated_text)
            if seg.commentary:
                script_parts.append(seg.commentary)

    full_script = "\n".join(script_parts)
    if not full_script:
        project.status = "failed"
        mode_text = {"subtitle": "자막", "commentary": "해설", "both": "자막+해설"}[project.voice_synthesis_mode]
        project.extra["error"] = f"음성 변환할 {mode_text} 텍스트가 없습니다."
        return save_project(project)

    project.status = "rendering" # Next logical status
    project = save_project(project)

    try:
        from .openai_client import OpenAIShortsClient

        client = OpenAIShortsClient()
        output_dir = Path(project.metadata_path).parent
        audio_path = output_dir / f"{project.base_name}_voice.mp3"

        voice = project.voice or "alloy"

        client.synthesize_voice(
            text=full_script,
            voice=voice,
            output_path=audio_path,
        )

        # In a real app, you might want to store this in a more structured way
        project.extra["voice_path"] = str(audio_path)
        project.status = "voice_complete"
        return save_project(project)

    except Exception as e:
        logger.exception("Failed to synthesize voice for project %s", project_id)
        project.status = "failed"
        project.extra["error"] = str(e)
        return save_project(project)


def render_translated_project(project_id: str) -> TranslatorProject:
    """Render the final video for a translated project."""
    project = load_project(project_id)

    if project.status != "voice_complete": # Assuming voice synthesis sets it to this
        logger.warning("Project %s is not ready for rendering (status: %s)", project_id, project.status)
        return project

    try:
        from .media import MediaFactory
        from moviepy.editor import VideoFileClip

        factory = MediaFactory(assets_dir=SHORTS_OUTPUT_DIR.parent / "assets")

        # 1. Load base video
        video_clip = VideoFileClip(project.source_video)

        # 2. Attach new audio
        voice_path = project.extra.get("voice_path")
        if not voice_path or not Path(voice_path).exists():
            raise ValueError("Synthesized voice file not found.")
        
        video_clip, _ = factory.attach_audio(
            video_clip,
            narration_audio=Path(voice_path),
            use_music=False, # TODO: Make this configurable
        )

        # 3. Burn subtitles
        captions = [
            CaptionLine(start=seg.start, end=seg.end, text=seg.translated_text)
            for seg in project.segments
            if seg.translated_text
        ]
        video_clip = factory.burn_subtitles(video_clip, captions)

        # 4. Write to file
        output_dir = Path(project.metadata_path).parent
        output_path = output_dir / f"{project.base_name}_translated.mp4"
        
        video_clip.write_videofile(
            str(output_path),
            codec="libx264",
            audio_codec="aac",
            temp_audiofile=output_dir / "temp-audio.m4a",
            remove_temp=True,
            threads=4, # TODO: Make configurable
            fps=project.fps or 24,
        )

        project.extra["rendered_video_path"] = str(output_path)
        project.status = "rendered"
        return save_project(project)

    except Exception as e:
        logger.exception("Failed to render project %s", project_id)
        project.status = "failed"
        project.extra["error"] = str(e)
        return save_project(project)


def translate_selected_segments(
    project_id: str,
    segment_ids: List[str],
    target_lang: str = "ja",
    translation_mode: str = "reinterpret",
    tone_hint: Optional[str] = None,
    progress_callback: Optional[callable] = None
) -> TranslatorProject:
    """선택된 세그먼트만 번역합니다."""
    project = load_project(project_id)

    # 선택된 세그먼트가 없으면 전체 번역
    if not segment_ids:
        segment_ids = [seg.id for seg in project.segments]

    # 선택된 세그먼트만 필터링
    segments_to_translate = [seg for seg in project.segments if seg.id in segment_ids]

    if not segments_to_translate:
        raise ValueError("번역할 세그먼트가 없습니다.")

    logger.info(
        "Translating %d selected segments for project %s to %s",
        len(segments_to_translate),
        project_id,
        target_lang
    )

    total_count = len(segments_to_translate)
    completed_count = 0

    # 번역 진행 상태 초기화
    project.extra["translation_progress"] = {
        "total": total_count,
        "completed": 0,
        "percentage": 0,
        "status": "translating"
    }
    save_project(project)

    # 각 세그먼트 번역
    for idx, segment in enumerate(segments_to_translate):
        # 역번역 모드 (일본어 → 한국어)
        if target_lang == "ko":
            # 역번역: translated_text (일본어)를 읽어서 reverse_translated_text (한국어)에 저장
            text_to_translate = segment.translated_text
            if not text_to_translate:
                continue

            try:
                # 역번역 실행
                reverse_translated = translate_text(
                    text_to_translate,
                    target_lang="ko",
                    translation_mode=translation_mode,
                    tone_hint=tone_hint
                )
                segment.reverse_translated_text = reverse_translated

                completed_count += 1
            except Exception as e:
                logger.error("Failed to reverse translate segment %s: %s", segment.id, e)
                continue
        else:
            # 정방향 번역 (한국어 → 일본어 등)
            # 번역할 텍스트: 재해석 자막 우선, 없으면 원본 자막
            text_to_translate = segment.commentary_korean or segment.source_text
            if not text_to_translate:
                continue

            try:
                # 번역 실행
                translated = translate_text(
                    text_to_translate,
                    target_lang=target_lang,
                    translation_mode=translation_mode,
                    tone_hint=tone_hint
                )
                segment.translated_text = translated

                # 자동 역번역 실행 (일본어인 경우)
                if target_lang == "ja" and translated:
                    reverse_translated = translate_text(
                        translated,
                        target_lang="ko",
                        translation_mode="literal",
                        tone_hint=None
                    )
                    segment.reverse_translated_text = reverse_translated

                completed_count += 1
            except Exception as e:
                logger.error("Failed to translate segment %s: %s", segment.id, e)
                continue

        # 진행률 업데이트
        progress = int((completed_count / total_count) * 100)
        project.extra["translation_progress"] = {
            "total": total_count,
            "completed": completed_count,
            "percentage": progress,
            "status": "translating"
        }
        save_project(project)

        # 진행률 콜백 호출
        if progress_callback:
            progress_callback(progress, completed_count, total_count)

    # 번역 완료 상태로 변경
    project.extra["translation_progress"] = {
        "total": total_count,
        "completed": completed_count,
        "percentage": 100,
        "status": "completed"
    }

    # 프로젝트 저장
    return save_project(project)


def clone_translator_project_with_name(project_id: str, new_name: str) -> TranslatorProject:
    """번역기 프로젝트를 사용자 지정 이름으로 복제합니다."""
    import shutil
    from datetime import datetime
    import re

    ensure_directories()

    logger.info(f"🔄 Cloning project {project_id} with new name: '{new_name}'")

    # 원본 프로젝트 로드
    original_project = load_project(project_id)

    # 파일명으로 사용할 수 있도록 이름 정제
    safe_name = re.sub(r'[^\w\s가-힣-]', '', new_name)
    safe_name = safe_name.strip().replace(' ', '_')

    logger.info(f"📝 Sanitized name: '{safe_name}'")

    if not safe_name:
        safe_name = f"clone_{original_project.base_name}"
        logger.warning(f"⚠️ Empty safe_name, using default: '{safe_name}'")

    # 새 프로젝트 ID 생성
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    clone_id = f"{safe_name}_{timestamp}"

    logger.info(f"🆔 New project ID: '{clone_id}'")
    logger.info(f"📛 New base_name: '{safe_name}'")

    # 프로젝트 메타데이터 복제
    cloned_project = TranslatorProject.model_validate(original_project.model_dump())
    cloned_project.id = clone_id
    cloned_project.base_name = safe_name
    cloned_project.created_at = datetime.utcnow()
    cloned_project.updated_at = datetime.utcnow()

    # 자산 보관 디렉터리 생성
    assets_dir = TRANSLATOR_DIR / clone_id
    assets_dir.mkdir(parents=True, exist_ok=True)

    # 표준 위치에 메타데이터 저장되도록 경로 지정
    cloned_project.metadata_path = str(_project_path(clone_id))

    # 파일들 복제 (원본 파일이 존재하는 경우)
    original_video_path = Path(original_project.source_video)
    if original_video_path.exists():
        new_video_path = assets_dir / f"{safe_name}.webm"
        shutil.copy2(original_video_path, new_video_path)
        cloned_project.source_video = str(new_video_path)

    if original_project.source_subtitle:
        original_subtitle_path = Path(original_project.source_subtitle)
        if original_subtitle_path.exists():
            new_subtitle_path = assets_dir / f"{safe_name}.srt"
            shutil.copy2(original_subtitle_path, new_subtitle_path)
            cloned_project.source_subtitle = str(new_subtitle_path)

    # 렌더링된 영상이 있으면 복제
    if "rendered_video_path" in original_project.extra:
        original_rendered_path = Path(original_project.extra["rendered_video_path"])
        if original_rendered_path.exists():
            new_rendered_path = assets_dir / f"{safe_name}_translated.mp4"
            shutil.copy2(original_rendered_path, new_rendered_path)
            cloned_project.extra["rendered_video_path"] = str(new_rendered_path)

    # 음성 파일들 복사
    if "audio_files" in original_project.extra:
        cloned_project.extra["audio_files"] = {}
        for key, audio_path in original_project.extra["audio_files"].items():
            if audio_path and Path(audio_path).exists():
                original_audio_path = Path(audio_path)
                new_audio_path = assets_dir / f"{safe_name}_{key}{original_audio_path.suffix}"
                shutil.copy2(original_audio_path, new_audio_path)
                cloned_project.extra["audio_files"][key] = str(new_audio_path)

    # audio 디렉토리 전체 복사 (생성된 음성 트랙 파일들 포함)
    original_audio_dir = TRANSLATOR_DIR / project_id / "audio"
    if original_audio_dir.exists() and original_audio_dir.is_dir():
        new_audio_dir = assets_dir / "audio"
        new_audio_dir.mkdir(parents=True, exist_ok=True)

        # audio 디렉토리의 모든 파일 복사
        for audio_file in original_audio_dir.iterdir():
            if audio_file.is_file():
                new_audio_file_path = new_audio_dir / audio_file.name
                shutil.copy2(audio_file, new_audio_file_path)
                logger.info(f"📁 Copied audio file: {audio_file.name}")

                # extra.voice_path가 이 파일을 가리키고 있다면 업데이트
                if "voice_path" in cloned_project.extra:
                    original_voice_path = Path(cloned_project.extra["voice_path"])
                    if original_voice_path.name == audio_file.name:
                        cloned_project.extra["voice_path"] = str(new_audio_file_path)
                        logger.info(f"📝 Updated voice_path to: {new_audio_file_path}")

    # 복제된 프로젝트 저장
    return save_project(cloned_project)


def clone_translator_project(project_id: str) -> TranslatorProject:
    """번역기 프로젝트를 복제하여 백업본을 생성합니다."""
    import shutil
    from datetime import datetime

    ensure_directories()

    # 원본 프로젝트 로드
    original_project = load_project(project_id)

    # 새 프로젝트 ID 생성 (백업_원본ID_타임스탬프)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    clone_id = f"backup_{project_id}_{timestamp}"

    # 프로젝트 메타데이터 복제
    cloned_project = TranslatorProject.model_validate(original_project.model_dump())
    cloned_project.id = clone_id
    cloned_project.base_name = f"backup_{original_project.base_name}_{timestamp}"
    cloned_project.created_at = datetime.utcnow()
    cloned_project.updated_at = datetime.utcnow()

    # 자산 보관 디렉터리 생성
    assets_dir = TRANSLATOR_DIR / clone_id
    assets_dir.mkdir(parents=True, exist_ok=True)

    # 표준 위치에 메타데이터 저장되도록 경로 지정
    cloned_project.metadata_path = str(_project_path(clone_id))

    # 파일들 복제 (원본 파일이 존재하는 경우)
    original_video_path = Path(original_project.source_video)
    if original_video_path.exists():
        new_video_path = assets_dir / f"{cloned_project.base_name}{original_video_path.suffix}"
        shutil.copy2(original_video_path, new_video_path)
        cloned_project.source_video = str(new_video_path)

    if original_project.source_subtitle:
        original_subtitle_path = Path(original_project.source_subtitle)
        if original_subtitle_path.exists():
            new_subtitle_path = assets_dir / f"{cloned_project.base_name}{original_subtitle_path.suffix}"
            shutil.copy2(original_subtitle_path, new_subtitle_path)
            cloned_project.source_subtitle = str(new_subtitle_path)

    # 렌더링된 비디오가 있다면 복사
    if "rendered_video_path" in original_project.extra:
        original_rendered_path = Path(original_project.extra["rendered_video_path"])
        if original_rendered_path.exists():
            new_rendered_path = assets_dir / f"{cloned_project.base_name}_translated.mp4"
            shutil.copy2(original_rendered_path, new_rendered_path)
            cloned_project.extra["rendered_video_path"] = str(new_rendered_path)

    # 음성 파일들 복사
    if "audio_files" in original_project.extra:
        cloned_project.extra["audio_files"] = {}
        for key, audio_path in original_project.extra["audio_files"].items():
            if audio_path and Path(audio_path).exists():
                original_audio_path = Path(audio_path)
                new_audio_path = assets_dir / f"{cloned_project.base_name}_{key}{original_audio_path.suffix}"
                shutil.copy2(original_audio_path, new_audio_path)
                cloned_project.extra["audio_files"][key] = str(new_audio_path)

    # 복제된 프로젝트 저장
    return save_project(cloned_project)


SUPPORTED_TTS_AUDIO_FORMATS = {"mp3", "wav"}


def _normalize_audio_format(audio_format: str) -> str:
    normalized = (audio_format or "wav").lower()
    if normalized not in SUPPORTED_TTS_AUDIO_FORMATS:
        raise ValueError(f"지원하지 않는 오디오 포맷입니다: {audio_format}")
    return normalized


def generate_segment_audio(
    project_id: str,
    segment_id: str,
    voice: str = "nova",
    audio_format: str = "wav",
) -> TranslatorProject:
    """개별 세그먼트에 대해 일본어 음성 파일을 생성합니다."""
    project = load_project(project_id)

    # Find the segment
    segment = None
    for seg in project.segments:
        if seg.id == segment_id:
            segment = seg
            break

    if not segment:
        raise ValueError(f"Segment {segment_id} not found in project {project_id}")

    if not segment.translated_text:
        raise ValueError(f"Segment {segment_id} has no translated text")

    try:
        from .openai_client import OpenAIShortsClient

        client = OpenAIShortsClient()

        # Create audio directory
        audio_dir = TRANSLATOR_DIR / project_id / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)

        normalized_format = _normalize_audio_format(audio_format)

        # Generate audio filename
        audio_filename = f"segment_{segment.clip_index}_{segment_id[:8]}.{normalized_format}"
        audio_path = audio_dir / audio_filename

        # Generate TTS audio
        client.synthesize_voice(
            text=segment.translated_text,
            voice=voice,
            output_path=audio_path,
            audio_format=normalized_format,
        )

        # 생성된 음성 길이를 기록 (초 단위)
        try:
            from pydub import AudioSegment as PydubAudioSegment

            generated_audio = PydubAudioSegment.from_file(
                str(audio_path), format=normalized_format
            )
            duration_seconds = len(generated_audio) / 1000.0
        except Exception:  # pragma: no cover - 메타데이터 추출 실패는 치명적이지 않음
            duration_seconds = None

        if duration_seconds is not None:
            segment.audio_generated_duration = duration_seconds
            segment.audio_duration = duration_seconds

        # Update segment with audio path
        segment.audio_path = str(audio_path)

        logger.info(f"Generated audio for segment {segment_id}: {audio_path}")
        return save_project(project)

    except Exception as e:
        logger.exception(f"Failed to generate audio for segment {segment_id}")
        raise e


def generate_selected_audio_with_silence(
    project_id: str,
    segment_ids: List[str],
    voice: str = "nova",
    audio_format: str = "wav",
    task_id: Optional[str] = None,
) -> str:
    """선택된 세그먼트들의 음성을 생성하고, 자막 시간에 맞춰 무음을 포함한 음성 파일을 생성합니다.

    Returns:
        생성된 음성 파일의 경로
    """
    import subprocess
    from pydub import AudioSegment
    from pydub.generators import Sine

    # task_id 생성
    if not task_id:
        task_id = f"{project_id}_selected_{len(segment_ids)}"

    # 진행률 초기화
    _audio_generation_progress[task_id] = {
        "total": len(segment_ids),
        "current": 0,
        "status": "processing",
        "message": "음성 생성 중..."
    }

    project = load_project(project_id)

    # 선택된 세그먼트만 필터링
    selected_segments = [seg for seg in project.segments if seg.id in segment_ids]
    if not selected_segments:
        raise ValueError("선택된 세그먼트가 없습니다.")

    # 시간순으로 정렬
    selected_segments.sort(key=lambda seg: seg.start)

    try:
        from .openai_client import OpenAIShortsClient

        client = OpenAIShortsClient()

        # Create audio directory
        audio_dir = TRANSLATOR_DIR / project_id / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)

        normalized_format = _normalize_audio_format(audio_format)

        # 겹치는 세그먼트 감지
        overlapping_segments = []
        for i, seg1 in enumerate(selected_segments):
            for j, seg2 in enumerate(selected_segments[i+1:], start=i+1):
                # 두 세그먼트가 겹치는지 확인
                if seg1.end > seg2.start and seg1.start < seg2.end:
                    overlapping_segments.append((i, j))
                    logger.info(
                        f"Overlap detected: Segment {i} ({seg1.start:.2f}s-{seg1.end:.2f}s) "
                        f"overlaps with Segment {j} ({seg2.start:.2f}s-{seg2.end:.2f}s)"
                    )

        has_overlaps = len(overlapping_segments) > 0
        if has_overlaps:
            logger.info(f"Total {len(overlapping_segments)} overlapping segment pairs detected")

        # 전체 타임라인 길이 계산 (원본 비디오 길이 기준, 없으면 가장 늦게 끝나는 세그먼트 기준)
        if project.duration:
            max_end_time = project.duration
            logger.info(f"Using project duration: {max_end_time}s")
        else:
            max_end_time = max(seg.end for seg in selected_segments)
            logger.info(f"Using max segment end time: {max_end_time}s")
        total_duration_ms = int(max_end_time * 1000)

        # 전체 타임라인에 해당하는 빈 오디오 트랙 생성
        combined_audio = AudioSegment.silent(duration=total_duration_ms)

        for idx, segment in enumerate(selected_segments):
            # 진행률 업데이트
            _audio_generation_progress[task_id]["current"] = idx
            _audio_generation_progress[task_id]["message"] = f"세그먼트 {idx + 1}/{len(selected_segments)} 처리 중..."
            if not segment.translated_text:
                logger.warning(f"Segment {segment.id} has no translated text, skipping")
                continue

            # TTS 음성 생성
            temp_audio_path = audio_dir / f"temp_{segment.id[:8]}.{normalized_format}"
            client.synthesize_voice(
                text=segment.translated_text,
                voice=voice,
                output_path=temp_audio_path,
                audio_format=normalized_format,
            )

            # 생성된 음성 로드
            audio_segment = AudioSegment.from_file(
                str(temp_audio_path),
                format=normalized_format,
            )

            # 자막 기간에 맞춰 조정
            subtitle_duration = int((segment.end - segment.start) * 1000)  # ms
            raw_duration_ms = len(audio_segment)

            audio_duration = raw_duration_ms

            if audio_duration < subtitle_duration:
                # 음성이 자막보다 짧으면 뒤에 무음 추가
                padding = AudioSegment.silent(duration=subtitle_duration - audio_duration)
                audio_segment = audio_segment + padding
            elif audio_duration > subtitle_duration:
                # 음성이 자막보다 길면 잘라냄
                audio_segment = audio_segment[:subtitle_duration]

            # 겹치는 경우 볼륨 감소 (믹싱 시 과도한 볼륨 방지)
            if has_overlaps:
                audio_segment = audio_segment - 3  # 3dB 감소
                logger.debug(f"Applied -3dB volume reduction for segment {idx} (overlap detected)")

            # 페이드 인/아웃 효과 적용 (자연스러운 전환)
            fade_duration_ms = min(100, len(audio_segment) // 4)  # 최대 100ms 또는 오디오 길이의 1/4
            if fade_duration_ms > 0:
                audio_segment = audio_segment.fade_in(fade_duration_ms).fade_out(fade_duration_ms)

            # 세그먼트 시작 위치에 오디오를 오버레이 (겹치는 경우 자동으로 믹싱됨)
            segment_start_ms = int(segment.start * 1000)
            combined_audio = combined_audio.overlay(audio_segment, position=segment_start_ms)

            # 임시 파일 삭제
            temp_audio_path.unlink()

            # 세그먼트 음성 길이 기록
            segment.audio_generated_duration = raw_duration_ms / 1000.0
            segment.audio_duration = len(audio_segment) / 1000.0

            logger.info(
                f"Added audio for segment {segment.id}: {segment.start:.2f}s - {segment.end:.2f}s "
                f"(duration: {subtitle_duration}ms, fade: {fade_duration_ms}ms)"
            )

        # 최종 음성 파일 저장
        _audio_generation_progress[task_id]["message"] = "음성 파일 저장 중..."
        output_filename = f"selected_audio_{len(segment_ids)}_segments.{normalized_format}"
        output_path = audio_dir / output_filename
        combined_audio.export(str(output_path), format=normalized_format)

        # 선택된 세그먼트의 audio_path 업데이트
        _audio_generation_progress[task_id]["message"] = "세그먼트 정보 업데이트 중..."
        output_path_str = str(output_path)

        # selected_segments를 딕셔너리로 변환 (빠른 조회를 위해)
        selected_seg_dict = {seg.id: seg for seg in selected_segments}

        # project.segments에서 직접 세그먼트를 찾아서 업데이트
        updated_count = 0
        for segment in project.segments:
            if segment.id in segment_ids:
                segment.audio_path = output_path_str

                # duration 정보도 업데이트
                if segment.id in selected_seg_dict:
                    selected_seg = selected_seg_dict[segment.id]
                    segment.audio_generated_duration = selected_seg.audio_generated_duration
                    segment.audio_duration = selected_seg.audio_duration
                    generated_duration = segment.audio_generated_duration
                    rendered_duration = segment.audio_duration
                    logger.debug(
                        "Updated segment %s: audio_path=%s, generated_duration=%s, audio_duration=%s",
                        segment.id,
                        output_path_str,
                        f"{generated_duration:.2f}s" if isinstance(generated_duration, (int, float)) else "N/A",
                        f"{rendered_duration:.2f}s" if isinstance(rendered_duration, (int, float)) else "N/A",
                    )

                updated_count += 1

        # 프로젝트 저장
        save_project(project)
        logger.info(f"Updated {updated_count}/{len(segment_ids)} segments with audio path: {output_path_str}")

        # 완료 상태 업데이트
        _audio_generation_progress[task_id]["status"] = "completed"
        _audio_generation_progress[task_id]["current"] = len(selected_segments)
        _audio_generation_progress[task_id]["message"] = "완료"

        logger.info(f"Generated combined audio with silence: {output_path}")
        return str(output_path)

    except Exception as e:
        # 에러 상태 업데이트
        _audio_generation_progress[task_id]["status"] = "error"
        _audio_generation_progress[task_id]["message"] = f"오류: {str(e)}"
        logger.exception("Failed to generate combined audio with silence")
        raise e


def generate_all_audio(
    project_id: str,
    voice: str = "nova",
    audio_format: str = "wav",
    task_id: Optional[str] = None,
) -> TranslatorProject:
    """모든 세그먼트에 대해 일본어 음성 파일을 생성합니다."""
    project = load_project(project_id)

    # task_id 생성
    if not task_id:
        task_id = f"{project_id}_all_{len(project.segments)}"

    # 진행률 초기화
    _audio_generation_progress[task_id] = {
        "total": len(project.segments),
        "current": 0,
        "status": "processing",
        "message": "음성 생성 중..."
    }

    try:
        from .openai_client import OpenAIShortsClient

        client = OpenAIShortsClient()

        # Create audio directory
        audio_dir = TRANSLATOR_DIR / project_id / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)

        normalized_format = _normalize_audio_format(audio_format)

        # 겹치는 세그먼트 감지 (정보 로깅용)
        overlapping_count = 0
        for i, seg1 in enumerate(project.segments):
            for j, seg2 in enumerate(project.segments[i+1:], start=i+1):
                if seg1.end > seg2.start and seg1.start < seg2.end:
                    overlapping_count += 1
                    logger.info(
                        f"Overlap detected: Segment {i} ({seg1.start:.2f}s-{seg1.end:.2f}s) "
                        f"overlaps with Segment {j} ({seg2.start:.2f}s-{seg2.end:.2f}s)"
                    )

        if overlapping_count > 0:
            logger.warning(
                f"Total {overlapping_count} overlapping segment pairs detected. "
                f"Consider using generate_selected_audio_with_silence for timeline-based mixing."
            )

        for idx, segment in enumerate(project.segments):
            # 진행률 업데이트
            _audio_generation_progress[task_id]["current"] = idx
            _audio_generation_progress[task_id]["message"] = f"세그먼트 {idx + 1}/{len(project.segments)} 처리 중..."
            if not segment.translated_text:
                logger.warning(f"Segment {segment.id} has no translated text, skipping")
                continue

            # Generate audio filename
            audio_filename = f"segment_{segment.clip_index}_{segment.id[:8]}.{normalized_format}"
            audio_path = audio_dir / audio_filename
            temp_audio_path = audio_dir / f"temp_{segment.id[:8]}.{normalized_format}"

            # Generate TTS audio to temp file first
            client.synthesize_voice(
                text=segment.translated_text,
                voice=voice,
                output_path=temp_audio_path,
                audio_format=normalized_format,
            )

            # Load audio and apply fade effects
            from pydub import AudioSegment as PydubAudioSegment
            audio_segment = PydubAudioSegment.from_file(str(temp_audio_path), format=normalized_format)

            # 페이드 인/아웃 효과 적용
            fade_duration_ms = min(100, len(audio_segment) // 4)  # 최대 100ms 또는 오디오 길이의 1/4
            if fade_duration_ms > 0:
                audio_segment = audio_segment.fade_in(fade_duration_ms).fade_out(fade_duration_ms)

            duration_seconds = len(audio_segment) / 1000.0

            # Export final audio with fade effects
            audio_segment.export(str(audio_path), format=normalized_format)

            # Clean up temp file
            temp_audio_path.unlink()

            # Update segment with audio path
            segment.audio_path = str(audio_path)
            segment.audio_generated_duration = duration_seconds
            segment.audio_duration = duration_seconds

            logger.info(
                f"Generated audio for segment {segment.id}: {audio_path} "
                f"({segment.start:.2f}s-{segment.end:.2f}s, fade: {fade_duration_ms}ms)"
            )

        # 완료 상태 업데이트
        _audio_generation_progress[task_id]["status"] = "completed"
        _audio_generation_progress[task_id]["current"] = len(project.segments)
        _audio_generation_progress[task_id]["message"] = "완료"

        return save_project(project)

    except Exception as e:
        # 에러 상태 업데이트
        _audio_generation_progress[task_id]["status"] = "error"
        _audio_generation_progress[task_id]["message"] = f"오류: {str(e)}"
        logger.exception(f"Failed to generate audio for all segments")
        raise e


def get_audio_generation_progress(task_id: str) -> Optional[Dict[str, Any]]:
    """음성 생성 진행률을 조회합니다.

    Args:
        task_id: 작업 ID

    Returns:
        진행률 정보 딕셔너리 또는 None
    """
    return _audio_generation_progress.get(task_id)


def clear_audio_generation_progress(task_id: str) -> None:
    """음성 생성 진행률을 삭제합니다.

    Args:
        task_id: 작업 ID
    """
    if task_id in _audio_generation_progress:
        del _audio_generation_progress[task_id]


__all__ = [
    "TranslatorSegment",
    "TranslatorProject",
    "TranslatorProjectCreate",
    "TranslatorProjectUpdate",
    "create_project",
    "save_project",
    "load_project",
    "list_projects",
    "delete_project",
    "update_project",
    "clone_translator_project",
    "downloads_listing",
    "aggregate_dashboard_projects",
    "generate_ai_commentary_for_project",
    "generate_korean_ai_commentary_for_project",
    "translate_project_segments",
    "synthesize_voice_for_project",
    "render_translated_project",
    "vtt_to_srt",
    "convert_vtt_to_srt",
    "fix_malformed_srt",
    "clean_html_entities_from_srt",
    "generate_segment_audio",
    "generate_selected_audio_with_silence",
    "generate_all_audio",
    "get_audio_generation_progress",
    "clear_audio_generation_progress",
    "parse_subtitle_text_and_add_to_project",
    "UPLOADS_DIR",
    "ensure_directories",
]
