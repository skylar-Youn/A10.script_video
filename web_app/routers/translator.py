"""Translator project routes."""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple, Set

import logging
import math
import re
import shutil
import subprocess
import time

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile, status
from starlette.concurrency import run_in_threadpool

from pathlib import Path

from ai_shorts_maker.translator import (
    TranslatorProject,
    TranslatorProjectCreate,
    TranslatorProjectUpdate,
    create_project as translator_create_project,
    delete_project as translator_delete_project,
    list_projects as translator_list_projects,
    load_project as translator_load_project,
    clone_translator_project_with_name,
    translate_selected_segments,
    translate_text,
    update_segment_text,
    generate_segment_audio,
    generate_selected_audio_with_silence,
    generate_all_audio,
    TRANSLATOR_DIR,
    save_project,
)

router = APIRouter(prefix="/api/translator", tags=["translator"])
OUTPUT_ROOT = TRANSLATOR_DIR.parent


def _path_to_web_url(path: Path) -> str:
    return f"/outputs/{path.relative_to(OUTPUT_ROOT).as_posix()}"


def _web_url_to_path(url: Optional[str]) -> Optional[Path]:
    if not url:
        return None
    if url.startswith("/outputs/"):
        return (OUTPUT_ROOT / url[len("/outputs/"):]).resolve()
    return Path(url).resolve()


def _apply_bgm_volume(audio, percent: float):
    if percent <= 0.0:
        from pydub import AudioSegment
        return AudioSegment.silent(duration=len(audio))
    if abs(percent - 100.0) < 1e-6:
        return audio
    gain_db = 20.0 * math.log10(max(percent, 1e-4) / 100.0)
    return audio.apply_gain(gain_db)


def _ensure_bgm_files(project_id: str, project: TranslatorProject) -> Tuple[Path, Path]:
    audio_dir = TRANSLATOR_DIR / project_id / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)

    reference_path = audio_dir / "bgm_reference.wav"
    working_path = audio_dir / "bgm_working.wav"

    extras = project.extra or {}
    base_candidates = [
        extras.get("bgm_custom_path"),
        extras.get("bgm_path"),
        extras.get("bgm_source_path"),
    ]

    base_path: Optional[Path] = None
    for candidate in base_candidates:
        path = _web_url_to_path(candidate)
        if path and path.exists():
            base_path = path
            break

    if not reference_path.exists():
        if base_path and base_path.exists():
            shutil.copyfile(str(base_path), str(reference_path))
        else:
            raise FileNotFoundError("배경음악 트랙을 찾을 수 없습니다.")

    if not working_path.exists():
        shutil.copyfile(str(reference_path), str(working_path))

    extras.setdefault("bgm_source_path", _path_to_web_url(reference_path))
    extras["bgm_path"] = _path_to_web_url(working_path)
    extras.setdefault("bgm_volume_percent", 100.0)
    extras.setdefault("bgm_cache_token", int(time.time()))
    project.extra = extras
    save_project(project)

    return reference_path, working_path


def _label_bgm_candidate(path: Path) -> Tuple[str, str]:
    """Return a user-facing label and kind identifier for a BGM candidate."""
    name = path.stem.lower()
    if "v2" in name and "source" in name:
        return "배경음악 V2 (원본)", "custom_v2_source"
    if "v2" in name:
        return "배경음악 V2", "custom_v2"
    if "custom" in name and "source" in name:
        return "배경음악 커스텀 (원본)", "custom_source"
    if "custom" in name:
        return "배경음악 커스텀", "custom"
    if "working" in name or "mix" in name:
        return "배경음악 작업본", "working"
    if "reference" in name:
        return "배경음악 원본", "reference"
    return "배경음악", "bgm"


def _prepare_dialogue_audio(project_id: str, project: TranslatorProject) -> "tuple[AudioSegment, Path]":
    """Load an audio segment for dialogue extraction (prefer separated vocals)."""
    from pathlib import Path
    from pydub import AudioSegment
    import subprocess

    project_dir = TRANSLATOR_DIR / project_id

    separated_dir = project_dir / "separated"
    vocals_path = separated_dir / "vocals.wav"

    if vocals_path.exists():
        return AudioSegment.from_file(str(vocals_path)), project_dir

    if not project.source_video:
        raise ValueError("원본 비디오 파일이 없습니다.")

    video_path = Path(project.source_video)
    if not video_path.exists():
        raise FileNotFoundError(f"비디오 파일을 찾을 수 없습니다: {video_path}")

    temp_dir = project_dir / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)

    original_audio = temp_dir / "original.wav"
    subprocess.run([
        "ffmpeg", "-y", "-i", str(video_path),
        "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2",
        str(original_audio)
    ], check=True, capture_output=True)

    audio = AudioSegment.from_file(str(original_audio))

    try:
        original_audio.unlink(missing_ok=True)  # type: ignore[arg-type]
    except TypeError:
        if original_audio.exists():
            original_audio.unlink()

    try:
        if temp_dir.exists() and not any(temp_dir.iterdir()):
            temp_dir.rmdir()
    except OSError:
        pass

    return audio, project_dir


def _convert_single_path(value: Optional[str], output_dir: Path, logger) -> Optional[str]:
    if value is None:
        return None

    try:
        string_value = str(value)
    except Exception:
        return value

    if not string_value:
        return string_value

    if string_value.startswith(("http://", "https://")):
        return string_value

    if string_value.startswith("/outputs/"):
        return string_value

    try:
        relative_path = Path(string_value).relative_to(output_dir)
        converted = f"/outputs/{relative_path.as_posix()}"
        logger.info(f"Converted path: {string_value} -> {converted}")
        return converted
    except ValueError as exc:
        logger.warning(f"Cannot convert path {string_value} relative to {output_dir}: {exc}")
        return string_value


def _convert_audio_paths_to_urls(project: TranslatorProject) -> TranslatorProject:
    """Convert absolute file paths to web-accessible URLs."""
    import logging
    logger = logging.getLogger(__name__)

    try:
        # Get the base output directory (parent of translator_projects)
        output_dir = TRANSLATOR_DIR.parent
        logger.info(f"Output directory for path conversion: {output_dir}")

        if project.source_video:
            project.source_video = _convert_single_path(project.source_video, output_dir, logger)
        if project.source_subtitle:
            project.source_subtitle = _convert_single_path(project.source_subtitle, output_dir, logger)

        for segment in project.segments:
            if not segment.audio_path:
                continue

            if isinstance(segment.audio_path, str) and segment.audio_path.startswith("/outputs/"):
                # Already converted to a web URL
                continue

            segment.audio_path = _convert_single_path(segment.audio_path, output_dir, logger)

        if isinstance(project.extra, dict):
            if isinstance(project.extra.get("voice_path"), str):
                project.extra["voice_path"] = _convert_single_path(project.extra["voice_path"], output_dir, logger)
            if isinstance(project.extra.get("rendered_video_path"), str):
                project.extra["rendered_video_path"] = _convert_single_path(project.extra["rendered_video_path"], output_dir, logger)
            if isinstance(project.extra.get("audio_files"), dict):
                project.extra["audio_files"] = {
                    key: _convert_single_path(value, output_dir, logger) if isinstance(value, str) else value
                    for key, value in project.extra["audio_files"].items()
                }
    except Exception as e:
        # If conversion fails, keep original paths
        logger.error(f"Failed to convert audio paths: {e}")

    return project


def _resolve_audio_path(path_str: Optional[str]) -> Optional[Path]:
    """Resolve a stored audio path (absolute or /outputs/) to a filesystem Path."""
    if not path_str:
        return None

    try:
        normalized = str(path_str).strip()
    except Exception:
        return None

    if not normalized:
        return None

    candidates = []

    try:
        candidates.append(Path(normalized))
    except Exception:
        pass

    if normalized.startswith("/outputs/"):
        candidates.append(OUTPUT_ROOT / normalized[len("/outputs/"):])
    elif normalized.startswith("/youtube/download/"):
        candidates.append(OUTPUT_ROOT / normalized.lstrip("/"))

    stripped = normalized.lstrip("/")
    candidates.append(OUTPUT_ROOT / stripped)
    candidates.append(TRANSLATOR_DIR / stripped)

    seen = set()
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except Exception:
            continue
        if resolved in seen:
            continue
        seen.add(resolved)
        if resolved.exists():
            return resolved

    return None


def _path_to_web(path: Path) -> str:
    try:
        relative = path.resolve().relative_to(OUTPUT_ROOT)
        return f"/outputs/{relative.as_posix()}"
    except Exception:
        return str(path)


def _locate_translated_audio(project: TranslatorProject) -> Tuple[Optional[Path], List[str]]:
    """Find the translated audio file path and references that need updating."""
    entries = []
    extras = project.extra or {}

    def add_entry(priority: int, ref: str, path_candidate: Optional[str]) -> None:
        resolved = _resolve_audio_path(path_candidate)
        if resolved is not None:
            entries.append((priority, ref, resolved))

    add_entry(0, "extra.voice_path", extras.get("voice_path"))

    audio_files = extras.get("audio_files")
    if isinstance(audio_files, dict):
        priority_keys = [
            "combined",
            "merged",
            "translated",
            "timeline",
            "voice",
        ]
        handled = set()
        for key in priority_keys:
            add_entry(1, f"extra.audio_files.{key}", audio_files.get(key))
            handled.add(key)
        for key, value in audio_files.items():
            if key in handled:
                continue
            add_entry(2, f"extra.audio_files.{key}", value)

    for segment in project.segments:
        add_entry(3, f"segment.{segment.id}", getattr(segment, "audio_path", None))

    if not entries:
        return None, []

    entries.sort(key=lambda item: item[0])
    target_path = entries[0][2]
    refs = sorted({ref for _, ref, resolved in entries if resolved == target_path})
    return target_path, refs


@router.get("/projects")
async def api_list_translator_projects():
    def _list_projects():
        return translator_list_projects()

    projects = await run_in_threadpool(_list_projects)
    # Convert audio paths to URLs for all projects
    return [_convert_audio_paths_to_urls(project) for project in projects]


@router.post("/projects", response_model=TranslatorProject)
async def api_create_translator_project(payload: TranslatorProjectCreate) -> TranslatorProject:
    def _create_project():
        return translator_create_project(payload)

    project = await run_in_threadpool(_create_project)
    return _convert_audio_paths_to_urls(project)


@router.get("/projects/{project_id}", response_model=TranslatorProject)
async def api_get_translator_project(project_id: str) -> TranslatorProject:
    def _load_project():
        return translator_load_project(project_id)

    project = await run_in_threadpool(_load_project)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Translator project '{project_id}' not found."
        )
    return _convert_audio_paths_to_urls(project)


@router.put("/projects/{project_id}", response_model=TranslatorProject)
async def api_update_translator_project(
    project_id: str,
    payload: TranslatorProjectUpdate
) -> TranslatorProject:
    def _update_project():
        project = translator_load_project(project_id)
        if not project:
            return None

        # Update project fields
        update_data = payload.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(project, field):
                setattr(project, field, value)

        return project

    project = await run_in_threadpool(_update_project)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Translator project '{project_id}' not found."
        )
    return _convert_audio_paths_to_urls(project)


@router.delete("/projects/{project_id}")
async def api_delete_translator_project(project_id: str):
    def _delete_project():
        return translator_delete_project(project_id)

    success = await run_in_threadpool(_delete_project)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Translator project '{project_id}' not found."
        )
    return {"message": f"Translator project '{project_id}' deleted successfully."}


@router.post("/projects/{project_id}/clone", response_model=TranslatorProject)
async def api_clone_translator_project(project_id: str, payload: dict) -> TranslatorProject:
    """Clone a translator project with a new name."""
    new_name = payload.get("new_name")
    if not new_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="new_name is required"
        )

    def _clone_project():
        return clone_translator_project_with_name(project_id, new_name)

    try:
        cloned_project = await run_in_threadpool(_clone_project)
        return _convert_audio_paths_to_urls(cloned_project)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Translator project '{project_id}' not found."
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clone project: {str(e)}"
        )


@router.post("/projects/{project_id}/translate-segments", response_model=TranslatorProject)
async def api_translate_selected_segments(project_id: str, payload: dict) -> TranslatorProject:
    """선택된 세그먼트를 번역합니다."""
    segment_ids = payload.get("segment_ids", [])
    target_lang = payload.get("target_lang", "ja")
    translation_mode = payload.get("translation_mode", "reinterpret")
    tone_hint = payload.get("tone_hint")

    def _translate():
        return translate_selected_segments(
            project_id=project_id,
            segment_ids=segment_ids,
            target_lang=target_lang,
            translation_mode=translation_mode,
            tone_hint=tone_hint
        )

    try:
        updated_project = await run_in_threadpool(_translate)
        return _convert_audio_paths_to_urls(updated_project)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Translator project '{project_id}' not found."
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to translate segments: {str(e)}"
        )


@router.post("/projects/{project_id}/reverse-translate-segments", response_model=TranslatorProject)
async def api_reverse_translate_selected_segments(project_id: str, payload: dict) -> TranslatorProject:
    """선택된 세그먼트를 역번역합니다."""
    segment_ids = payload.get("segment_ids", [])

    def _reverse_translate():
        return translate_selected_segments(
            project_id=project_id,
            segment_ids=segment_ids,
            target_lang="ko",
            translation_mode="literal",
            tone_hint=None
        )

    try:
        updated_project = await run_in_threadpool(_reverse_translate)
        return _convert_audio_paths_to_urls(updated_project)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Translator project '{project_id}' not found."
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reverse translate segments: {str(e)}"
        )


@router.post("/projects/{project_id}/reverse-translate")
async def api_reverse_translate_segment(project_id: str, payload: dict):
    """개별 세그먼트를 일본어에서 한국어로 역번역합니다."""
    segment_id = payload.get("segment_id")
    japanese_text = payload.get("japanese_text")

    if not segment_id or not japanese_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="segment_id and japanese_text are required"
        )

    def _translate():
        korean_text = translate_text(
            text=japanese_text,
            target_lang="ko",
            translation_mode="literal",
            tone_hint=None
        )
        # Update segment with reverse translated text
        update_segment_text(project_id, segment_id, "reverse_translated", korean_text)
        return korean_text

    try:
        korean_text = await run_in_threadpool(_translate)
        return {"korean_text": korean_text}
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Translator project '{project_id}' not found."
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reverse translate: {str(e)}"
        )


@router.post("/projects/{project_id}/generate-audio", response_model=TranslatorProject)
async def api_generate_segment_audio(project_id: str, payload: dict) -> TranslatorProject:
    """개별 세그먼트에 대해 일본어 음성 파일을 생성합니다."""
    segment_id = payload.get("segment_id")
    voice = payload.get("voice", "nova")
    audio_format = payload.get("audio_format", "wav")

    if not segment_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="segment_id is required"
        )

    def _generate_audio():
        return generate_segment_audio(project_id, segment_id, voice, audio_format)

    try:
        updated_project = await run_in_threadpool(_generate_audio)
        return _convert_audio_paths_to_urls(updated_project)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Translator project '{project_id}' not found."
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate audio: {str(e)}"
        )


@router.post("/projects/{project_id}/generate-selected-audio")
async def api_generate_selected_audio(project_id: str, payload: dict):
    """선택된 세그먼트들의 음성을 생성하고, 자막 시간에 맞춰 무음을 포함한 음성 파일을 생성합니다."""
    segment_ids = payload.get("segment_ids", [])
    voice = payload.get("voice", "nova")
    audio_format = payload.get("audio_format", "wav")

    if not segment_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="segment_ids is required"
        )

    def _generate_audio():
        return generate_selected_audio_with_silence(project_id, segment_ids, voice, audio_format)

    try:
        audio_path = await run_in_threadpool(_generate_audio)

        audio_path_url = audio_path
        try:
            audio_path_obj = Path(str(audio_path))
            relative_path = audio_path_obj.relative_to(TRANSLATOR_DIR.parent)
            audio_path_url = f"/outputs/{relative_path.as_posix()}"
        except ValueError:
            pass

        return {"audio_path": audio_path_url}
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Translator project '{project_id}' not found."
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate selected audio: {str(e)}"
        )


@router.post("/projects/{project_id}/generate-all-audio", response_model=TranslatorProject)
async def api_generate_all_audio(project_id: str, payload: dict) -> TranslatorProject:
    """모든 세그먼트에 대해 일본어 음성 파일을 생성합니다."""
    voice = payload.get("voice", "nova")
    audio_format = payload.get("audio_format", "wav")

    def _generate_audio():
        return generate_all_audio(project_id, voice, audio_format)

    try:
        updated_project = await run_in_threadpool(_generate_audio)
        return _convert_audio_paths_to_urls(updated_project)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Translator project '{project_id}' not found."
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate all audio: {str(e)}"
        )


@router.get("/projects/{project_id}/load-generated-tracks")
async def api_load_generated_tracks(project_id: str):
    """생성된 음성 트랙 파일들을 불러옵니다."""
    import logging
    logger = logging.getLogger(__name__)

    def _load_tracks():
        project = translator_load_project(project_id)
        if not project:
            return None

        audio_dir = TRANSLATOR_DIR / project_id / "audio"
        if not audio_dir.exists():
            return {"tracks": []}

        # 생성된 음성 파일 찾기
        tracks = []

        # 1. 선택 세그먼트 음성 파일들 찾기 (selected_audio_*_segments.*)
        selected_audio_files = sorted(audio_dir.glob("selected_audio_*_segments.*"))
        for audio_file in selected_audio_files:
            try:
                output_dir = TRANSLATOR_DIR.parent
                relative_path = audio_file.relative_to(output_dir)
                audio_url = f"/outputs/{relative_path.as_posix()}"

                # 파일명에서 세그먼트 개수 추출
                import re
                match = re.search(r"selected_audio_(\d+)_segments", audio_file.name)
                segment_count = int(match.group(1)) if match else 0

                tracks.append({
                    "type": "selected",
                    "path": audio_url,
                    "filename": audio_file.name,
                    "segment_count": segment_count,
                    "created_at": audio_file.stat().st_mtime
                })
            except Exception as e:
                logger.warning(f"Failed to process audio file {audio_file}: {e}")

        return {"tracks": tracks}

    try:
        result = await run_in_threadpool(_load_tracks)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )
        return result
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Translator project '{project_id}' not found."
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load generated tracks: {str(e)}"
        )


@router.post("/projects/{project_id}/separate-vocal")
async def api_separate_vocal(project_id: str):
    """원본 음성에서 vocal과 배경음악을 분리합니다."""
    import logging
    logger = logging.getLogger(__name__)
    
    def _separate():
        project = translator_load_project(project_id)
        if not project:
            return None
        
        # 원본 비디오 경로 확인
        if not project.source_video:
            raise ValueError("원본 비디오 파일이 없습니다.")
        
        from pathlib import Path
        import subprocess
        
        video_path = Path(project.source_video)
        if not video_path.exists():
            raise FileNotFoundError(f"비디오 파일을 찾을 수 없습니다: {video_path}")
        
        # 출력 디렉토리
        project_dir = TRANSLATOR_DIR / project_id
        separated_dir = project_dir / "separated"
        separated_dir.mkdir(parents=True, exist_ok=True)
        
        # demucs로 분리 (vocal, accompaniment)
        vocals_path = separated_dir / "vocals.wav"
        bgm_path = separated_dir / "bgm.wav"
        
        # ffmpeg로 음성 추출
        audio_temp = separated_dir / "temp_audio.wav"
        subprocess.run([
            "ffmpeg", "-y", "-i", str(video_path),
            "-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2",
            str(audio_temp)
        ], check=True, capture_output=True)
        
        # demucs로 분리
        subprocess.run([
            "demucs", "--two-stems=vocals",
            "-o", str(separated_dir),
            str(audio_temp)
        ], check=True, capture_output=True)
        
        # 분리된 파일 이동 (demucs는 htdemucs/temp_audio/ 형식으로 저장)
        demucs_output = separated_dir / "htdemucs" / "temp_audio"
        if demucs_output.exists():
            import shutil
            shutil.move(str(demucs_output / "vocals.wav"), str(vocals_path))
            shutil.move(str(demucs_output / "no_vocals.wav"), str(bgm_path))
            shutil.rmtree(separated_dir / "htdemucs")
        
        audio_temp.unlink()
        
        # 경로를 웹 URL로 변환
        output_dir = TRANSLATOR_DIR.parent
        vocals_url = f"/outputs/{vocals_path.relative_to(output_dir).as_posix()}"
        bgm_url = f"/outputs/{bgm_path.relative_to(output_dir).as_posix()}"
        
        return {
            "vocals_path": vocals_url,
            "bgm_path": bgm_url,
            "message": "Vocal과 배경음악 분리 완료"
        }
    
    try:
        result = await run_in_threadpool(_separate)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Vocal separation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Vocal 분리 실패: {str(e)}"
        )


@router.post("/projects/{project_id}/extract-dialogue")
async def api_extract_dialogue(project_id: str):
    """번역 음성 구간을 mute하여 원본 대사만 추출합니다."""
    import logging
    logger = logging.getLogger(__name__)
    
    def _extract():
        project = translator_load_project(project_id)
        if not project:
            return None
        
        audio, project_dir = _prepare_dialogue_audio(project_id, project)

        # 대사 전용 파일 저장 (보컬 트랙 그대로 사용)
        dialogue_path = project_dir / "dialogue.wav"
        audio.export(str(dialogue_path), format="wav")

        # 웹 URL 변환
        output_dir = TRANSLATOR_DIR.parent
        dialogue_url = f"/outputs/{dialogue_path.relative_to(output_dir).as_posix()}"

        return {
            "dialogue_path": dialogue_url,
            "message": "대사 추출 완료 (보컬 트랙 생성)"
        }
    
    try:
        result = await run_in_threadpool(_extract)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Dialogue extraction failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"대사 추출 실패: {str(e)}"
        )


@router.post("/projects/{project_id}/extract-dialogue-muted")
async def api_extract_dialogue_muted(project_id: str):
    """번역(해설) 음성이 들어간 구간을 무음으로 치환한 대사 트랙을 생성합니다."""
    import logging
    from pydub import AudioSegment

    logger = logging.getLogger(__name__)

    def _extract():
        project = translator_load_project(project_id)
        if not project:
            return None

        audio, project_dir = _prepare_dialogue_audio(project_id, project)

        for segment in project.segments:
            if segment.start is None or segment.end is None:
                continue
            if not segment.audio_path:
                continue

            start_ms = int(segment.start * 1000)
            end_ms = int(segment.end * 1000)
            if end_ms <= start_ms:
                continue

            mute_duration = end_ms - start_ms
            silence = AudioSegment.silent(duration=mute_duration)
            audio = audio[:start_ms] + silence + audio[end_ms:]

        dialogue_path = project_dir / "dialogue_muted.wav"
        audio.export(str(dialogue_path), format="wav")

        output_dir = TRANSLATOR_DIR.parent
        dialogue_url = f"/outputs/{dialogue_path.relative_to(output_dir).as_posix()}"

        return {
            "dialogue_path": dialogue_url,
            "message": "번역/해설 음성을 제외한 대사 추출 완료"
        }

    try:
        result = await run_in_threadpool(_extract)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Dialogue mute extraction failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"번역 제외 대사 추출 실패: {str(e)}"
        )


@router.post("/projects/{project_id}/bgm/volume")
async def api_adjust_bgm_volume(project_id: str, payload: dict = Body(...)):
    """Adjust the master volume for the background music track."""
    import logging
    from pydub import AudioSegment

    logger = logging.getLogger(__name__)

    try:
        percent_value = float(payload.get("percent", 100.0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="percent 값은 숫자여야 합니다.")

    percent_value = max(0.0, min(percent_value, 200.0))

    def _adjust():
        project = translator_load_project(project_id)
        if not project:
            return None

        try:
            reference_path, working_path = _ensure_bgm_files(project_id, project)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

        reference_audio = AudioSegment.from_file(str(reference_path))
        if len(reference_audio) == 0:
            raise ValueError("배경음악 오디오 길이가 0입니다.")

        processed_audio = _apply_bgm_volume(reference_audio, percent_value)
        processed_audio.export(str(working_path), format="wav")

        extras = project.extra or {}
        extras["bgm_path"] = _path_to_web_url(working_path)
        extras["bgm_volume_percent"] = percent_value
        extras["bgm_cache_token"] = int(time.time())
        project.extra = extras
        save_project(project)

        return {
            "bgm_path": extras["bgm_path"],
            "bgm_volume_percent": percent_value,
            "cache_token": extras["bgm_cache_token"],
        }

    try:
        result = await run_in_threadpool(_adjust)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )
        return result
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # pylint: disable=broad-except
        logger.error("BGM volume adjustment failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"배경음악 볼륨 조정 실패: {exc}"
        )


@router.get("/projects/{project_id}/bgm/candidates")
async def api_list_bgm_candidates(project_id: str):
    """Return available background music files (including custom V2 variants)."""
    import logging

    logger = logging.getLogger(__name__)

    def _collect_candidates() -> Optional[List[Dict[str, object]]]:
        project = translator_load_project(project_id)
        if not project:
            return None

        extras = project.extra or {}
        project_dir = TRANSLATOR_DIR / project_id
        audio_dir = project_dir / "audio"
        separated_dir = project_dir / "separated"

        added: Set[Tuple[Path, str]] = set()
        candidates: List[Dict[str, object]] = []

        def add_candidate(path: Optional[Path], *, label: str, kind: str,
                          volume: Optional[float] = None,
                          cache_token: Optional[int] = None) -> None:
            if not path:
                return
            try:
                resolved = path.resolve()
            except OSError:
                logger.debug("Failed to resolve BGM path: %s", path)
                return
            if not resolved.exists() or (resolved, kind) in added:
                return

            added.add((resolved, kind))
            web_path = _path_to_web_url(resolved)
            stat = resolved.stat()
            candidate: Dict[str, object] = {
                "label": label,
                "kind": kind,
                "path": web_path,
                "filename": resolved.name,
                "modified_at": stat.st_mtime,
                "size": stat.st_size,
            }
            if volume is not None:
                candidate["volume_percent"] = volume
            if cache_token is not None:
                candidate["cache_token"] = cache_token
            candidates.append(candidate)

        # Extras-defined paths (current selections)
        extras_path = _web_url_to_path(extras.get("bgm_path"))
        if extras_path:
            add_candidate(
                extras_path,
                label="현재 배경음악",
                kind="current",
                volume=extras.get("bgm_volume_percent"),
                cache_token=extras.get("bgm_cache_token"),
            )

        custom_path = _web_url_to_path(extras.get("bgm_custom_path"))
        if custom_path:
            add_candidate(custom_path, label="배경음악 커스텀", kind="custom")

        source_path = _web_url_to_path(extras.get("bgm_source_path"))
        if source_path:
            add_candidate(source_path, label="배경음악 원본", kind="reference")

        bgm_v2_path = _web_url_to_path(extras.get("bgm_v2_path") or extras.get("bgm_custom_v2_path"))
        if bgm_v2_path:
            add_candidate(
                bgm_v2_path,
                label="배경음악 V2",
                kind="custom_v2",
                volume=extras.get("bgm_v2_volume_percent"),
                cache_token=extras.get("bgm_v2_cache_token"),
            )

        # Files inside audio directory (bgm_custom*, bgm_working, etc.)
        if audio_dir.exists():
            for path in sorted(audio_dir.glob("bgm*.*")):
                label, kind = _label_bgm_candidate(path)
                add_candidate(path, label=label, kind=kind)

        # Separated-directory BGM (result of vocal separation)
        if separated_dir.exists():
            separated_bgm = separated_dir / "bgm.wav"
            if separated_bgm.exists():
                add_candidate(separated_bgm, label="배경음악 (분리본)", kind="separated")

        priority_map = {
            "custom_v2": 0,
            "custom_v2_source": 1,
            "current": 2,
            "custom": 3,
            "working": 4,
            "reference": 5,
            "bgm": 6,
            "separated": 7,
        }
        candidates.sort(
            key=lambda item: (
                priority_map.get(str(item.get("kind")), 99),
                -float(item.get("modified_at", 0.0)),
            )
        )

        return candidates

    try:
        candidates = await run_in_threadpool(_collect_candidates)
        if candidates is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )
        return {"candidates": candidates}
    except HTTPException:
        raise
    except Exception as exc:  # pylint: disable=broad-except
        logger.error("Failed to list BGM candidates: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"배경음악 목록을 불러오지 못했습니다: {exc}"
        ) from exc


@router.post("/projects/{project_id}/bgm/upload")
async def api_upload_bgm_file(
    project_id: str,
    file: UploadFile = File(...),
    mode: str = Form("replace"),
):
    """Upload a new background music file and set it as the current track."""
    import logging
    from pydub import AudioSegment

    logger = logging.getLogger(__name__)

    mode_normalized = (mode or "replace").strip().lower()
    if mode_normalized not in {"replace", "append"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="지원하지 않는 처리 모드입니다.")

    def _upload():
        project = translator_load_project(project_id)
        if not project:
            return None

        audio_dir = TRANSLATOR_DIR / project_id / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)

        timestamp = int(time.time())
        name_stem = Path(file.filename or f"bgm_{timestamp}").stem or f"bgm_{timestamp}"
        dest_path = audio_dir / f"bgm_custom_{timestamp:010d}.wav"

        suffix = Path(file.filename or "").suffix.lstrip(".")
        format_hint = suffix.lower() if suffix else None
        if not format_hint and file.content_type:
            format_hint = file.content_type.split("/")[-1]
        if not format_hint:
            raise ValueError("오디오 형식을 판별할 수 없습니다.")

        file.file.seek(0)
        new_clip = AudioSegment.from_file(file.file, format=format_hint)
        if len(new_clip) == 0:
            raise ValueError("업로드된 오디오 길이가 0입니다.")

        if mode_normalized == "append":
            existing_path = None
            extras = project.extra or {}
            existing_path = _web_url_to_path(extras.get("bgm_path")) if extras else None
            if existing_path and existing_path.exists():
                existing_audio = AudioSegment.from_file(str(existing_path))
                combined_audio = existing_audio + new_clip
            else:
                combined_audio = new_clip
            combined_audio.export(str(dest_path), format="wav")
        else:
            new_clip.export(str(dest_path), format="wav")

        extras = project.extra or {}
        web_path = _path_to_web_url(dest_path)
        extras["bgm_custom_path"] = web_path
        extras["bgm_path"] = web_path
        extras["bgm_source_path"] = web_path
        extras["bgm_volume_percent"] = 100.0
        extras["bgm_cache_token"] = int(time.time())
        project.extra = extras
        save_project(project)

        label, kind = _label_bgm_candidate(dest_path)
        stat = dest_path.stat()
        return {
            "bgm_path": web_path,
            "bgm_volume_percent": extras["bgm_volume_percent"],
            "bgm_cache_token": extras["bgm_cache_token"],
            "bgm_source_path": extras.get("bgm_source_path"),
            "candidate": {
                "label": label or name_stem,
                "filename": dest_path.name,
                "path": web_path,
                "kind": kind,
                "modified_at": stat.st_mtime,
                "size": stat.st_size,
            },
        }

    try:
        result = await run_in_threadpool(_upload)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )
        return result
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # pylint: disable=broad-except
        logger.error("BGM upload failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"배경음악 업로드 실패: {exc}"
        )


@router.post("/projects/{project_id}/bgm/remove")
async def api_remove_bgm_candidate(project_id: str, payload: dict = Body(...)):
    """Remove a background music candidate file from the project."""
    import logging

    logger = logging.getLogger(__name__)

    path_value = payload.get("path") if isinstance(payload, dict) else None
    if not path_value or not isinstance(path_value, str):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="제거할 배경음악 경로가 필요합니다.")

    def _remove():
        project = translator_load_project(project_id)
        if not project:
            return None

        resolved = _web_url_to_path(path_value)
        if not resolved:
            raise ValueError("배경음악 파일 경로가 올바르지 않습니다.")

        try:
            resolved_path = resolved.resolve()
        except OSError as exc:  # pragma: no cover - OS specific
            raise ValueError("배경음악 파일 경로를 확인할 수 없습니다.") from exc

        project_root = (TRANSLATOR_DIR / project_id).resolve()
        try:
            relative_path = resolved_path.relative_to(project_root)
        except ValueError as exc:
            raise PermissionError("프로젝트 범위 밖의 파일은 제거할 수 없습니다.") from exc

        if not relative_path.parts or relative_path.parts[0] not in {"audio", "separated"}:
            raise PermissionError("지정한 배경음악 파일을 제거할 수 없습니다.")

        removed = False
        if resolved_path.exists():
            if resolved_path.is_file():
                resolved_path.unlink()
                removed = True
            else:
                raise ValueError("파일이 아닌 항목은 제거할 수 없습니다.")

        extras = project.extra or {}
        cleared_main = False
        cleared_v2 = False
        cleared_keys = []

        def matches_extra(value: Optional[str]) -> bool:
            if not value:
                return False
            if value == path_value:
                return True
            try:
                candidate_path = _web_url_to_path(value)
                if candidate_path:
                    return candidate_path.resolve() == resolved_path
            except Exception:  # pragma: no cover - best effort cleanup
                return False
            return False

        for key in ("bgm_path", "bgm_custom_path", "bgm_source_path"):
            if matches_extra(extras.get(key)):
                cleared_keys.append(key)
                cleared_main = True

        for key in ("bgm_v2_path", "bgm_custom_v2_path"):
            if matches_extra(extras.get(key)):
                cleared_keys.append(key)
                cleared_v2 = True

        for key in cleared_keys:
            extras.pop(key, None)

        if cleared_main:
            extras.pop("bgm_cache_token", None)
            extras.pop("bgm_volume_percent", None)

        if cleared_v2:
            extras.pop("bgm_v2_cache_token", None)
            extras.pop("bgm_v2_volume_percent", None)

        project.extra = extras
        save_project(project)

        return {
            "removed": removed,
            "extra": extras,
        }

    try:
        result = await run_in_threadpool(_remove)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )

        message = "배경음악 파일을 제거했습니다." if result.get("removed") else "이미 제거된 파일입니다."
        return {
            "message": message,
            "removed": bool(result.get("removed")),
            "extra": result.get("extra") or {},
        }
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:  # pylint: disable=broad-except
        logger.error("Failed to remove BGM candidate: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"배경음악 파일 제거에 실패했습니다: {exc}"
        ) from exc


@router.post("/projects/{project_id}/bgm/apply")
async def api_apply_bgm_candidate(project_id: str, payload: dict = Body(...)):
    """Apply a chosen background music file as the working BGM."""
    import logging

    logger = logging.getLogger(__name__)

    path_value = payload.get("path")
    if not path_value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="path is required",
        )

    kind_value = payload.get("kind")
    volume_value = payload.get("volume_percent")
    base_duration_value = payload.get("base_duration")

    def _apply():
        project = translator_load_project(project_id)
        if not project:
            return None

        path = _web_url_to_path(path_value)
        if path is None:
            path = Path(path_value)
        try:
            resolved = path.resolve()
        except OSError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

        if not resolved.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"배경음악 파일을 찾을 수 없습니다: {resolved}",
            )

        extras = project.extra or {}
        current_bgm_path = extras.get("bgm_path")
        current_bgm_volume = extras.get("bgm_volume_percent", 100.0)
        current_bgm_cache = extras.get("bgm_cache_token", int(time.time()))

        is_bgm_v2 = bool(kind_value and str(kind_value).startswith("custom_v2"))

        if is_bgm_v2:
            logger = logging.getLogger(__name__)
            audio_dir = TRANSLATOR_DIR / project_id / "audio"
            audio_dir.mkdir(parents=True, exist_ok=True)

            current_v2_web = extras.get("bgm_v2_path") or extras.get("bgm_custom_v2_path")
            current_v2_path = _web_url_to_path(current_v2_web) if current_v2_web else None
            reuse_existing_file = False
            if current_v2_path:
                try:
                    reuse_existing_file = current_v2_path.resolve() == resolved
                except OSError:
                    reuse_existing_file = False

            if not reuse_existing_file:
                timestamp = int(time.time())
                dest_path = audio_dir / f"bgm_custom_v2_{timestamp:010d}.wav"

                def _probe_duration_seconds(path: Path) -> Optional[float]:
                    try:
                        result = subprocess.run(
                            [
                                "ffprobe",
                                "-v",
                                "error",
                                "-show_entries",
                                "format=duration",
                                "-of",
                                "default=noprint_wrappers=1:nokey=1",
                                str(path),
                            ],
                            capture_output=True,
                            text=True,
                            check=False,
                        )
                        if result.returncode != 0:
                            return None
                        value = result.stdout.strip()
                        return float(value) if value else None
                    except Exception as exc:  # pylint: disable=broad-except
                        logger.debug("Failed to probe audio duration for %s: %s", path, exc)
                        return None

                target_duration_seconds: Optional[float] = None
                if base_duration_value is not None:
                    try:
                        candidate = float(base_duration_value)
                        if candidate > 0:
                            target_duration_seconds = candidate
                    except (TypeError, ValueError):
                        target_duration_seconds = None

                if (not target_duration_seconds or target_duration_seconds <= 0) and project.duration:
                    try:
                        candidate = float(project.duration)
                        if candidate > 0:
                            target_duration_seconds = candidate
                    except (TypeError, ValueError):
                        target_duration_seconds = None

                if not target_duration_seconds or target_duration_seconds <= 0:
                    base_bgm_url = payload.get("base_bgm_path") or extras.get("bgm_path") or extras.get("bgm_custom_path")
                    base_bgm_path = _web_url_to_path(base_bgm_url) if base_bgm_url else None
                    if base_bgm_path and base_bgm_path.exists():
                        probed = _probe_duration_seconds(base_bgm_path)
                        if probed and probed > 0:
                            target_duration_seconds = probed

                trimmed_successfully = False
                if target_duration_seconds and target_duration_seconds > 0:
                    target_seconds = max(target_duration_seconds, 0.01)
                    ffmpeg_cmd = [
                        "ffmpeg",
                        "-y",
                        "-i",
                        str(resolved),
                        "-t",
                        f"{target_seconds:.3f}",
                        "-c",
                        "copy",
                        str(dest_path),
                    ]
                    try:
                        ffmpeg_result = subprocess.run(
                            ffmpeg_cmd,
                            capture_output=True,
                            text=True,
                            check=False,
                        )
                        if ffmpeg_result.returncode == 0:
                            trimmed_successfully = True
                        else:
                            logger.warning(
                                "ffmpeg trim failed for %s: %s",
                                resolved,
                                ffmpeg_result.stderr.strip(),
                            )
                    except Exception as exc:  # pylint: disable=broad-except
                        logger.warning("ffmpeg trim raised error for %s: %s", resolved, exc)

                    if not trimmed_successfully:
                        try:
                            from pydub import AudioSegment  # pylint: disable=import-outside-toplevel

                            source_audio = AudioSegment.from_file(str(resolved))
                            trimmed_audio = source_audio[: int(target_seconds * 1000)]
                            trimmed_audio.export(str(dest_path), format="wav")
                            trimmed_successfully = True
                        except ImportError:
                            logger.warning("pydub is not available; falling back to copy for BGM V2")
                        except Exception as exc:  # pylint: disable=broad-except
                            logger.warning("pydub trim failed for %s: %s", resolved, exc)

                if not trimmed_successfully:
                    try:
                        shutil.copyfile(str(resolved), str(dest_path))
                    except Exception as exc:  # pylint: disable=broad-except
                        raise HTTPException(
                            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=f"배경음악 V2 파일을 저장하지 못했습니다: {exc}",
                        ) from exc

                resolved = dest_path

            v2_web_path = _path_to_web_url(resolved)
            extras["bgm_v2_path"] = v2_web_path
            extras["bgm_custom_v2_path"] = v2_web_path

            working_v2_path = resolved
            if volume_value is not None:
                try:
                    percent_value = float(volume_value)
                except (TypeError, ValueError) as exc:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

                extras["bgm_v2_volume_percent"] = percent_value

                gain_applied = False
                temp_volume_path = audio_dir / f"bgm_custom_v2_working_{int(time.time()) :010d}.wav"

                try:
                    from pydub import AudioSegment  # pylint: disable=import-outside-toplevel

                    source_audio = AudioSegment.from_file(str(resolved))
                    processed = _apply_bgm_volume(source_audio, percent_value)
                    processed.export(str(temp_volume_path), format="wav")
                    working_v2_path = temp_volume_path
                    gain_applied = True
                except ImportError:
                    gain_applied = False
                except Exception as exc:  # pylint: disable=broad-except
                    logger.warning("Failed to apply BGM V2 volume via pydub: %s", exc)
                    gain_applied = False

                if not gain_applied:
                    try:
                        volume_factor = max(percent_value, 0.0) / 100.0
                        ffmpeg_cmd = [
                            "ffmpeg",
                            "-y",
                            "-i",
                            str(resolved),
                            "-filter:a",
                            f"volume={volume_factor}",
                            str(temp_volume_path),
                        ]
                        ffmpeg_result = subprocess.run(
                            ffmpeg_cmd,
                            capture_output=True,
                            text=True,
                            check=False,
                        )
                        if ffmpeg_result.returncode == 0:
                            working_v2_path = temp_volume_path
                            gain_applied = True
                        else:
                            logger.warning(
                                "Failed to apply BGM V2 volume via ffmpeg: %s",
                                ffmpeg_result.stderr.strip(),
                            )
                    except Exception as exc:  # pylint: disable=broad-except
                        logger.warning("ffmpeg volume adjustment failed for BGM V2: %s", exc)

                if not gain_applied and temp_volume_path.exists():
                    try:
                        temp_volume_path.unlink()
                    except OSError:
                        pass

                if gain_applied:
                    working_v2_path = working_v2_path.resolve()
                    resolved = working_v2_path
                    v2_web_path_updated = _path_to_web_url(working_v2_path)
                    extras["bgm_v2_path"] = v2_web_path_updated
                    extras["bgm_custom_v2_path"] = v2_web_path_updated
            else:
                extras.setdefault("bgm_v2_volume_percent", 100.0)

            extras["bgm_v2_cache_token"] = int(time.time())

            project.extra = extras
            save_project(project)

            return {
                "bgm_path": current_bgm_path,
                "bgm_volume_percent": current_bgm_volume,
                "bgm_cache_token": current_bgm_cache,
                "bgm_v2_path": extras["bgm_v2_path"],
                "bgm_v2_volume_percent": extras.get("bgm_v2_volume_percent", 100.0),
                "bgm_v2_cache_token": extras["bgm_v2_cache_token"],
            }

        extras["bgm_path"] = _path_to_web_url(resolved)

        if volume_value is not None:
            try:
                extras["bgm_volume_percent"] = float(volume_value)
            except (TypeError, ValueError) as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        else:
            extras.setdefault("bgm_volume_percent", 100.0)

        extras["bgm_cache_token"] = int(time.time())

        if kind_value and str(kind_value).startswith("custom"):
            extras["bgm_custom_path"] = extras["bgm_path"]

        project.extra = extras
        save_project(project)

        response_payload = {
            "bgm_path": extras["bgm_path"],
            "bgm_volume_percent": extras.get("bgm_volume_percent", 100.0),
            "bgm_cache_token": extras["bgm_cache_token"],
        }

        if extras.get("bgm_v2_path"):
            response_payload.update(
                {
                    "bgm_v2_path": extras["bgm_v2_path"],
                    "bgm_v2_volume_percent": extras.get("bgm_v2_volume_percent", 100.0),
                    "bgm_v2_cache_token": extras.get("bgm_v2_cache_token"),
                }
            )

        return response_payload

    try:
        result = await run_in_threadpool(_apply)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )
        return {"message": "배경음악을 적용했습니다.", **result}
    except HTTPException:
        raise
    except Exception as exc:  # pylint: disable=broad-except
        logger.error("Failed to apply BGM: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"배경음악 적용 실패: {exc}"
        ) from exc


@router.delete("/projects/{project_id}/bgm/v2")
async def api_clear_bgm_v2(project_id: str):
    """Remove the stored BGM V2 track from the project extras."""
    import logging

    logger = logging.getLogger(__name__)

    def _clear():
        project = translator_load_project(project_id)
        if not project:
            return None

        extras = project.extra or {}
        removed = False
        for key in ("bgm_v2_path", "bgm_custom_v2_path", "bgm_v2_cache_token", "bgm_v2_volume_percent"):
            if key in extras:
                extras.pop(key, None)
                removed = True

        project.extra = extras

        if removed:
            from ai_shorts_maker.translator import save_project

            save_project(project)

        return {"message": "배경음악 V2를 제거했습니다.", "removed": removed}

    try:
        result = await run_in_threadpool(_clear)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )
        return result
    except HTTPException:
        raise
    except Exception as exc:  # pylint: disable=broad-except
        logger.error("Failed to clear BGM V2: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"배경음악 V2 제거 실패: {exc}"
        ) from exc


@router.post("/projects/{project_id}/bgm/cut")
async def api_cut_bgm_segment(project_id: str, payload: dict = Body(...)):
    """Remove or mute a selected segment from the background music track."""
    import logging
    from pydub import AudioSegment

    logger = logging.getLogger(__name__)

    try:
        start_value = float(payload.get("start", 0.0))
        end_raw = payload.get("end")
        end_value = float(end_raw) if end_raw not in (None, "inf", "INF", "infinity") else float("inf")
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="시작/종료 시간을 숫자로 입력하세요.")

    if end_value <= start_value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="종료 시간은 시작 시간보다 커야 합니다.")

    mode = (payload.get("mode") or "remove").lower()

    def _cut():
        project = translator_load_project(project_id)
        if not project:
            return None

        try:
            reference_path, working_path = _ensure_bgm_files(project_id, project)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

        reference_audio = AudioSegment.from_file(str(reference_path))
        duration_ms = len(reference_audio)
        if duration_ms == 0:
            raise ValueError("배경음악 오디오 길이가 0입니다.")

        start_ms = max(0, int(start_value * 1000))
        if math.isinf(end_value):
            end_ms = duration_ms
        else:
            end_ms = min(int(end_value * 1000), duration_ms)
        if end_ms <= start_ms:
            raise ValueError("선택 구간이 너무 짧습니다.")

        before = reference_audio[:start_ms]
        after = reference_audio[end_ms:]

        if mode == "mute":
            muted_section = AudioSegment.silent(duration=end_ms - start_ms)
            updated_reference = before + muted_section + after
        else:
            updated_reference = before + after

        updated_reference.export(str(reference_path), format="wav")

        extras = project.extra or {}
        volume_percent = float(extras.get("bgm_volume_percent", 100.0))
        processed_audio = _apply_bgm_volume(updated_reference, volume_percent)
        processed_audio.export(str(working_path), format="wav")

        extras["bgm_path"] = _path_to_web_url(working_path)
        extras["bgm_cache_token"] = int(time.time())
        extras["bgm_volume_percent"] = volume_percent
        project.extra = extras
        save_project(project)

        return {
            "bgm_path": extras["bgm_path"],
            "bgm_volume_percent": volume_percent,
            "cache_token": extras["bgm_cache_token"],
        }

    try:
        result = await run_in_threadpool(_cut)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )
        return result
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # pylint: disable=broad-except
        logger.error("BGM segment cut failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"배경음악 구간 삭제 실패: {exc}"
        )


@router.post("/projects/{project_id}/bgm/v2/save")
async def api_save_bgm_v2_copy(project_id: str, payload: dict = Body(...)):
    """Create a copy of the current BGM V2 track with a new name."""
    import logging

    logger = logging.getLogger(__name__)

    name_value = payload.get("name") if isinstance(payload, dict) else None
    apply_value = bool(payload.get("apply")) if isinstance(payload, dict) else False

    def _save():
        project = translator_load_project(project_id)
        if not project:
            return None

        extras = project.extra or {}
        v2_web = extras.get("bgm_v2_path") or extras.get("bgm_custom_v2_path")
        v2_path = _web_url_to_path(v2_web)
        if not v2_path or not v2_path.exists():
            raise FileNotFoundError("배경음악 V2 트랙을 찾을 수 없습니다.")

        audio_dir = TRANSLATOR_DIR / project_id / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)

        base_name = (name_value or "bgm_v2_saved").strip()
        safe_stem = re.sub(r"[^0-9A-Za-z_-]+", "_", base_name).strip("_-") or "bgm_v2_saved"
        timestamp = int(time.time())
        dest_path = audio_dir / f"{safe_stem}_{timestamp:010d}.wav"

        shutil.copyfile(str(v2_path), str(dest_path))

        stat_info = dest_path.stat()
        candidate_label, candidate_kind = _label_bgm_candidate(dest_path)
        candidate = {
            "label": candidate_label or safe_stem,
            "kind": candidate_kind,
            "path": _path_to_web_url(dest_path),
            "filename": dest_path.name,
            "modified_at": stat_info.st_mtime,
            "size": stat_info.st_size,
        }

        apply_payload: Optional[Dict[str, object]] = None
        if apply_value:
            extras.setdefault("bgm_v2_volume_percent", 100.0)
            extras["bgm_v2_path"] = candidate["path"]
            extras["bgm_custom_v2_path"] = candidate["path"]
            extras["bgm_v2_cache_token"] = int(time.time())
            project.extra = extras
            save_project(project)
            apply_payload = {
                "bgm_v2_path": extras["bgm_v2_path"],
                "bgm_v2_volume_percent": extras.get("bgm_v2_volume_percent", 100.0),
                "bgm_v2_cache_token": extras["bgm_v2_cache_token"],
            }
        else:
            # 저장만 하고 extras는 그대로 유지
            project.extra = extras
            save_project(project)

        return {
            "message": "배경음악 V2를 저장했습니다.",
            "candidate": candidate,
            "applied": apply_value,
            **(apply_payload or {}),
        }

    try:
        result = await run_in_threadpool(_save)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )
        return result
    except HTTPException:
        raise
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:  # pylint: disable=broad-except
        logger.error("Failed to save BGM V2 copy: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"배경음악 V2 저장 실패: {exc}"
        ) from exc


@router.post("/projects/{project_id}/bgm/v2/cut")
async def api_cut_bgm_v2_segment(project_id: str, payload: dict = Body(...)):
    """Remove or trim a segment from the V2 background music track."""
    import logging
    from pydub import AudioSegment

    logger = logging.getLogger(__name__)

    try:
        start_value = float(payload.get("start", 0.0))
        end_raw = payload.get("end")
        end_value = float(end_raw) if end_raw not in (None, "inf", "INF", "infinity") else float("inf")
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="시작/종료 시간을 숫자로 입력하세요.") from None

    mode = (payload.get("mode") or "remove").lower()
    if end_value <= start_value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="종료 시간은 시작 시간보다 커야 합니다.")

    def _cut():
        project = translator_load_project(project_id)
        if not project:
            return None

        extras = project.extra or {}
        v2_web = extras.get("bgm_v2_path") or extras.get("bgm_custom_v2_path")
        v2_path = _web_url_to_path(v2_web)
        if not v2_path or not v2_path.exists():
            raise FileNotFoundError("배경음악 V2 트랙을 찾을 수 없습니다.")

        audio = AudioSegment.from_file(str(v2_path))
        duration_ms = len(audio)
        if duration_ms == 0:
            raise ValueError("배경음악 V2 오디오 길이가 0입니다.")

        start_ms = max(0, int(start_value * 1000))
        if math.isinf(end_value):
            end_ms = duration_ms
        else:
            end_ms = min(int(end_value * 1000), duration_ms)

        if mode == "trim_after":
            updated_audio = audio[:end_ms]
        elif mode == "remove":
            updated_audio = audio[:start_ms] + audio[end_ms:]
        else:
            raise ValueError("지원하지 않는 처리 모드입니다.")

        if len(updated_audio) == 0:
            raise ValueError("삭제 후 배경음악 V2 길이가 0입니다.")

        audio_dir = v2_path.parent
        audio_dir.mkdir(parents=True, exist_ok=True)
        dest_path = audio_dir / f"bgm_custom_v2_{int(time.time()):010d}.wav"
        updated_audio.export(str(dest_path), format="wav")

        extras["bgm_v2_path"] = _path_to_web_url(dest_path)
        extras["bgm_custom_v2_path"] = extras["bgm_v2_path"]
        extras["bgm_v2_cache_token"] = int(time.time())

        project.extra = extras
        save_project(project)

        return {
            "bgm_v2_path": extras["bgm_v2_path"],
            "bgm_v2_volume_percent": extras.get("bgm_v2_volume_percent", 100.0),
            "bgm_v2_cache_token": extras["bgm_v2_cache_token"],
        }

    try:
        result = await run_in_threadpool(_cut)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )
        return result
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # pylint: disable=broad-except
        logger.error("BGM V2 segment cut failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"배경음악 V2 구간 삭제 실패: {exc}"
        ) from exc


@router.post("/projects/{project_id}/trim-translated")
async def api_trim_translated_audio(project_id: str):
    """Trim translated audio so it does not exceed the original segment duration."""
    import logging
    from pydub import AudioSegment
    from ai_shorts_maker.translator import save_project

    logger = logging.getLogger(__name__)

    def _trim() -> Optional[dict]:
        project = translator_load_project(project_id)
        if not project:
            return None

        audio_path, refs = _locate_translated_audio(project)
        if audio_path is None:
            raise FileNotFoundError("번역 음성 파일을 찾을 수 없습니다.")

        max_end = max((seg.end or 0.0) for seg in project.segments) if project.segments else 0.0
        if max_end <= 0:
            raise ValueError("세그먼트 종료 시간이 없어 길이를 계산할 수 없습니다.")

        audio = AudioSegment.from_file(str(audio_path))
        current_ms = len(audio)
        target_ms = int(max_end * 1000)

        if current_ms <= target_ms:
            return {
                "trimmed": False,
                "message": "번역 음성이 원본 길이보다 길지 않아 자르지 않았습니다.",
                "web_path": _path_to_web(audio_path),
                "current_ms": current_ms,
                "target_ms": target_ms,
                "updated_refs": refs,
            }

        trimmed_audio = audio[:target_ms]
        suffix = audio_path.suffix.lstrip('.') or 'wav'
        trimmed_path = audio_path.with_name(f"{audio_path.stem}_trimmed.{suffix}")
        trimmed_audio.export(str(trimmed_path), format=suffix)

        extras = project.extra or {}
        updated_refs: List[str] = []

        if "extra.voice_path" in refs:
            extras["voice_path"] = str(trimmed_path)
            updated_refs.append("extra.voice_path")

        audio_files = extras.get("audio_files")
        if isinstance(audio_files, dict):
            for ref in refs:
                if ref.startswith("extra.audio_files."):
                    key = ref.split(".", 2)[-1]
                    audio_files[key] = str(trimmed_path)
                    updated_refs.append(ref)

        for ref in refs:
            if not ref.startswith("segment."):
                continue
            segment_id = ref.split(".", 1)[-1]
            for segment in project.segments:
                if segment.id == segment_id:
                    segment.audio_path = str(trimmed_path)
                    updated_refs.append(ref)
                    break

        project.extra = extras
        save_project(project)

        unique_refs = sorted(set(updated_refs))

        return {
            "trimmed": True,
            "message": "번역 음성을 원본 길이에 맞춰 잘랐습니다.",
            "web_path": _path_to_web(trimmed_path),
            "current_ms": current_ms,
            "target_ms": target_ms,
            "updated_refs": unique_refs,
        }

    try:
        result = await run_in_threadpool(_trim)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )
        return result
    except FileNotFoundError as exc:
        logger.error("Trim translated audio failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc)
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc)
        )
    except Exception as exc:
        logger.exception("Unexpected error while trimming translated audio: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"번역 음성 자르기에 실패했습니다: {exc}"
        )


@router.post("/projects/{project_id}/merge-tracks")
async def api_merge_tracks(project_id: str, payload: dict):
    """선택한 트랙들을 합쳐 하나의 오디오로 생성한다."""
    import logging

    logger = logging.getLogger(__name__)

    raw_items = payload.get("tracks")
    if not raw_items:
        legacy_paths = payload.get("track_paths") or []
        raw_items = [{"path": path, "role": "unknown"} for path in legacy_paths]

    if not isinstance(raw_items, list) or not raw_items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="합칠 트랙이 필요합니다.")

    auto_duck = bool(payload.get("auto_duck"))
    duck_ratio_value = payload.get("duck_ratio")
    try:
        duck_ratio = float(duck_ratio_value) if duck_ratio_value is not None else 1.0
    except (TypeError, ValueError):
        duck_ratio = 1.0
    if duck_ratio <= 0:
        duck_ratio = 1.0

    def _merge():
        from pathlib import Path
        from pydub import AudioSegment

        project = translator_load_project(project_id)
        if not project:
            return None

        track_items: List[Dict[str, object]] = []
        voice_roles = {"dialogue", "dialogue_muted", "translated", "voice"}

        for item in raw_items:
            if isinstance(item, dict):
                path_value = str(item.get("path") or '').strip()
                role_value = str(item.get("role") or 'unknown').lower()
            else:
                path_value = str(item or '').strip()
                role_value = 'unknown'

            if not path_value:
                continue

            if path_value.startswith("/outputs/"):
                file_path = (TRANSLATOR_DIR.parent / path_value[9:]).resolve()
            else:
                file_path = Path(path_value).resolve()

            if not file_path.exists():
                logger.warning("Track file not found: %s", file_path)
                continue

            audio_segment = AudioSegment.from_file(str(file_path))
            track_items.append({
                "path": file_path,
                "role": role_value,
                "audio": audio_segment
            })

        if not track_items:
            raise ValueError("합칠 트랙이 없습니다.")

        # BGM V2를 우선, 그 다음 BGM, 나머지는 이후에
        role_rank = {
            "bgm_v2": 0,
            "bgm": 1,
        }
        track_items.sort(key=lambda item: role_rank.get(item["role"], 2))

        # 길이를 기준으로 패딩
        max_duration = max(len(item["audio"]) for item in track_items)
        for item in track_items:
            audio = item["audio"]
            if len(audio) < max_duration:
                item["audio"] = audio + AudioSegment.silent(duration=max_duration - len(audio))

        base_item = track_items[0]
        base_audio = base_item["audio"]
        base_role = base_item["role"]
        combined = base_audio

        duck_gain_db = 0.0
        if auto_duck:
            duck_gain_db = 20.0 * math.log10(max(duck_ratio, 1e-4))

        for item in track_items[1:]:
            audio = item["audio"]
            role = item["role"]
            if auto_duck and base_role == "bgm_v2" and role in voice_roles:
                combined = combined.overlay(audio, gain_during_overlay=duck_gain_db)
            else:
                combined = combined.overlay(audio)

        project_dir = TRANSLATOR_DIR / project_id
        project_dir.mkdir(parents=True, exist_ok=True)
        timestamp = int(time.time())
        merged_path = project_dir / f"merged_tracks_{timestamp:010d}.wav"
        combined.export(str(merged_path), format="wav")

        output_dir = TRANSLATOR_DIR.parent
        merged_url = f"/outputs/{merged_path.relative_to(output_dir).as_posix()}"

        return {
            "merged_path": merged_url,
            "merged_filename": merged_path.name,
            "message": f"{len(track_items)}개 트랙 합치기 완료",
        }

    try:
        result = await run_in_threadpool(_merge)
        if result is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:  # pylint: disable=broad-except
        logger.error("Track merging failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"트랙 합치기 실패: {exc}"
        ) from exc


@router.post("/projects/{project_id}/save-tracks")
async def api_save_tracks(project_id: str, track_state: dict):
    """트랙 상태를 프로젝트에 저장합니다."""
    import logging
    logger = logging.getLogger(__name__)

    try:
        project = translator_load_project(project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )

        # extra 필드에 트랙 정보 저장
        if project.extra is None:
            project.extra = {}

        if 'bgm_path' in track_state:
            project.extra['bgm_path'] = track_state.get('bgm_path')
        if 'dialogue_path' in track_state:
            project.extra['dialogue_path'] = track_state.get('dialogue_path')
        if 'dialogue_muted_path' in track_state:
            project.extra['dialogue_muted_path'] = track_state.get('dialogue_muted_path')
        if track_state.get('bgm_volume_percent') is not None:
            try:
                project.extra['bgm_volume_percent'] = float(track_state['bgm_volume_percent'])
            except (TypeError, ValueError):
                pass
        project.extra['bgm_cache_token'] = int(time.time())

        bgm_v2_path = track_state.get('bgm_v2_path')
        project.extra['bgm_v2_path'] = bgm_v2_path
        if bgm_v2_path:
            project.extra['bgm_custom_v2_path'] = bgm_v2_path
            project.extra['bgm_v2_cache_token'] = int(time.time())
        else:
            project.extra.pop('bgm_custom_v2_path', None)
            project.extra.pop('bgm_v2_cache_token', None)

        if track_state.get('bgm_v2_volume_percent') is not None:
            try:
                project.extra['bgm_v2_volume_percent'] = float(track_state['bgm_v2_volume_percent'])
            except (TypeError, ValueError):
                pass
        elif not bgm_v2_path:
            project.extra.pop('bgm_v2_volume_percent', None)

        if 'bgm_v2_auto_duck' in track_state:
            project.extra['bgm_v2_auto_duck'] = bool(track_state['bgm_v2_auto_duck'])

        # 프로젝트 저장
        from ai_shorts_maker.translator import save_project
        save_project(project)

        return {
            "message": "트랙 상태가 저장되었습니다.",
            "bgm_path": project.extra.get('bgm_path'),
            "dialogue_path": project.extra.get('dialogue_path'),
            "dialogue_muted_path": project.extra.get('dialogue_muted_path'),
            "bgm_volume_percent": project.extra.get('bgm_volume_percent'),
            "bgm_cache_token": project.extra.get('bgm_cache_token'),
            "bgm_v2_path": project.extra.get('bgm_v2_path'),
            "bgm_v2_volume_percent": project.extra.get('bgm_v2_volume_percent'),
            "bgm_v2_cache_token": project.extra.get('bgm_v2_cache_token'),
            "bgm_v2_auto_duck": project.extra.get('bgm_v2_auto_duck'),
        }
    except Exception as e:
        logger.error(f"Track save failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"트랙 저장 실패: {str(e)}"
        )


@router.get("/projects/{project_id}/load-tracks")
async def api_load_tracks(project_id: str):
    """저장된 트랙 상태를 불러옵니다."""
    import logging
    logger = logging.getLogger(__name__)

    try:
        project = translator_load_project(project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )

        # extra 필드에서 트랙 정보 가져오기
        extras = project.extra or {}
        bgm_path = extras.get('bgm_path')
        dialogue_path = extras.get('dialogue_path')
        dialogue_muted_path = extras.get('dialogue_muted_path')
        bgm_volume = extras.get('bgm_volume_percent')
        bgm_cache = extras.get('bgm_cache_token')
        bgm_v2_path = extras.get('bgm_v2_path') or extras.get('bgm_custom_v2_path')
        bgm_v2_volume = extras.get('bgm_v2_volume_percent')
        bgm_v2_cache = extras.get('bgm_v2_cache_token')
        bgm_v2_auto_duck = extras.get('bgm_v2_auto_duck')

        return {
            "message": "트랙 정보를 불러왔습니다.",
            "bgm_path": bgm_path,
            "dialogue_path": dialogue_path,
            "dialogue_muted_path": dialogue_muted_path,
            "bgm_volume_percent": bgm_volume,
            "bgm_cache_token": bgm_cache,
            "bgm_v2_path": bgm_v2_path,
            "bgm_v2_volume_percent": bgm_v2_volume,
            "bgm_v2_cache_token": bgm_v2_cache,
            "bgm_v2_auto_duck": bool(bgm_v2_auto_duck) if bgm_v2_auto_duck is not None else None,
        }
    except Exception as e:
        logger.error(f"Track load failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"트랙 불러오기 실패: {str(e)}"
        )
