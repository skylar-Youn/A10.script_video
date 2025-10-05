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


@router.post("/projects/{project_id}/merge-tracks")
async def api_merge_tracks(project_id: str, payload: dict):
    """선택한 트랙들을 합칩니다."""
    import logging
    logger = logging.getLogger(__name__)
    
    track_paths = payload.get("track_paths", [])
    if not track_paths:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="트랙 경로가 필요합니다."
        )
    
    def _merge():
        from pathlib import Path
        from pydub import AudioSegment
        
        project = translator_load_project(project_id)
        if not project:
            return None
        
        # 모든 트랙을 로드하고 합치기
        combined = None
        for track_path in track_paths:
            # 웹 URL을 실제 파일 경로로 변환
            if track_path.startswith("/outputs/"):
                file_path = TRANSLATOR_DIR.parent / track_path[9:]  # /outputs/ 제거
            else:
                file_path = Path(track_path)
            
            if not file_path.exists():
                logger.warning(f"Track file not found: {file_path}")
                continue
            
            track_audio = AudioSegment.from_file(str(file_path))
            
            if combined is None:
                combined = track_audio
            else:
                # 오디오 믹싱 (overlay)
                combined = combined.overlay(track_audio)
        
        if combined is None:
            raise ValueError("합칠 트랙이 없습니다.")
        
        # 합쳐진 파일 저장
        project_dir = TRANSLATOR_DIR / project_id
        merged_path = project_dir / "merged_tracks.wav"
        combined.export(str(merged_path), format="wav")
        
        # 웹 URL 변환
        output_dir = TRANSLATOR_DIR.parent
        merged_url = f"/outputs/{merged_path.relative_to(output_dir).as_posix()}"
        
        return {
            "merged_path": merged_url,
            "message": f"{len(track_paths)}개 트랙 합치기 완료"
        }
    
    try:
        result = await run_in_threadpool(_merge)
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
        logger.error(f"Track merging failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"트랙 합치기 실패: {str(e)}"
        )


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

        project.extra['bgm_path'] = track_state.get('bgm_path')
        project.extra['dialogue_path'] = track_state.get('dialogue_path')
        project.extra['dialogue_muted_path'] = track_state.get('dialogue_muted_path')

        # 프로젝트 저장
        from ai_shorts_maker.translator import save_project
        save_project(project)

        return {
            "message": "트랙 상태가 저장되었습니다.",
            "bgm_path": project.extra.get('bgm_path'),
            "dialogue_path": project.extra.get('dialogue_path'),
            "dialogue_muted_path": project.extra.get('dialogue_muted_path')
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
        bgm_path = project.extra.get('bgm_path') if project.extra else None
        dialogue_path = project.extra.get('dialogue_path') if project.extra else None
        dialogue_muted_path = project.extra.get('dialogue_muted_path') if project.extra else None

        return {
            "message": "트랙 정보를 불러왔습니다.",
            "bgm_path": bgm_path,
            "dialogue_path": dialogue_path,
            "dialogue_muted_path": dialogue_muted_path
        }
    except Exception as e:
        logger.error(f"Track load failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"트랙 불러오기 실패: {str(e)}"
        )
