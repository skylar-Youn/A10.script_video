"""Translator project routes."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException, status
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
)

router = APIRouter(prefix="/api/translator", tags=["translator"])


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
