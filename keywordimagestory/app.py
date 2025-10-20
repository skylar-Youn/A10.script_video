"""FastAPI application providing UI and API for story generation."""
from __future__ import annotations

import base64
import glob
import logging
import mimetypes
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import Body, FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from keywordimagestory.config import settings
from keywordimagestory.generators import (
    GenerationContext,
    ImageStoryGenerator,
    ImageTitleGenerator,
    KeywordTitleGenerator,
    ShortsSceneGenerator,
    ShortsScriptGenerator,
)
from keywordimagestory.prompts import (
    PromptTemplate,
    SHORTS_SCENE_ENGLISH_PROMPT_TEMPLATE,
    SHORTS_SCENE_KOREAN_PROMPT_TEMPLATE,
    SHORTS_SCRIPT_ENGLISH_PROMPT_TEMPLATE,
    SHORTS_SCRIPT_KOREAN_PROMPT_TEMPLATE,
)
from keywordimagestory.models import (
    BackgroundMusicSegment,
    ImagePrompt,
    MediaEffect,
    StoryProject,
    TemplateSetting,
    ToolRecord,
    ToolRecordCreate,
    ToolType,
    VideoPrompt,
)
from keywordimagestory.openai_client import client as openai_client
from keywordimagestory.services import editor_service, history_service, tool_store

logger = logging.getLogger(__name__)

app = FastAPI(title="Keyword Image Story Studio", version="0.1.0")

templates = Jinja2Templates(directory=str(settings.templates_dir))
app.mount("/static", StaticFiles(directory=str(settings.static_dir)), name="static")
app.mount("/outputs", StaticFiles(directory=str(settings.outputs_dir)), name="outputs")

DOWNLOAD_ROOT = Path("/home/sk/ws/A10.script_video/youtube/download").resolve()
FRAME_OUTPUT_DIR = settings.outputs_dir / "frames"

LANGUAGE_LABELS = {
    "ko": "Korean",
    "en": "English",
    "ja": "Japanese",
}


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def _project_or_404(project_id: str) -> StoryProject:
    try:
        return editor_service.get_project(project_id)
    except KeyError as exc:  # pragma: no cover - runtime path
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def _language_label(code: str) -> str:
    return LANGUAGE_LABELS.get((code or "").lower(), code)


def _select_script_prompt_template(language: str) -> PromptTemplate:
    code = (language or settings.default_language).lower()
    if code.startswith("ko"):
        return SHORTS_SCRIPT_KOREAN_PROMPT_TEMPLATE
    return SHORTS_SCRIPT_ENGLISH_PROMPT_TEMPLATE


def _select_scene_prompt_template(language: str) -> PromptTemplate:
    code = (language or settings.default_language).lower()
    if code.startswith("ko"):
        return SHORTS_SCENE_KOREAN_PROMPT_TEMPLATE
    return SHORTS_SCENE_ENGLISH_PROMPT_TEMPLATE


# ---------------------------------------------------------------------------
# UI routes
# ---------------------------------------------------------------------------


@app.get("/", response_class=HTMLResponse)
async def root(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "settings": settings.dump(),
            "history": [entry.dict() for entry in history_service.list_history()],
        },
    )


@app.get("/keywords", response_class=HTMLResponse, name="keywords_ui")
async def keywords_ui(request: Request) -> HTMLResponse:
    redirect_target = request.url_for("tools_ui")
    return RedirectResponse(url=redirect_target, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@app.get("/tools", response_class=HTMLResponse, name="tools_ui")
async def tools_ui(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(
        "tools.html",
        {
            "request": request,
            "settings": settings.dump(),
        },
    )


# ---------------------------------------------------------------------------
# Project lifecycle
# ---------------------------------------------------------------------------


@app.post("/api/projects", response_model=StoryProject)
async def api_create_project(payload: dict[str, Any] = Body(...)) -> StoryProject:
    keyword = payload.get("keyword")
    language = payload.get("language", settings.default_language)
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword is required")
    project = editor_service.create_project(keyword, language)
    return project


@app.get("/api/projects/{project_id}", response_model=StoryProject)
async def api_get_project(project_id: str) -> StoryProject:
    return _project_or_404(project_id)


# ---------------------------------------------------------------------------
# Generation endpoints
# ---------------------------------------------------------------------------


@app.post("/api/projects/{project_id}/generate/titles", response_model=StoryProject)
async def api_generate_titles(project_id: str, payload: dict[str, Any] = Body(...)) -> StoryProject:
    project = _project_or_404(project_id)
    context = GenerationContext(keyword=project.keyword, language=project.language, duration=settings.default_story_duration)
    count = int(payload.get("count", 30))
    generator_type = payload.get("type", "keyword")

    titles = []
    if generator_type == "keyword":
        titles.extend(KeywordTitleGenerator().generate(context, count=count))
    if generator_type == "image":
        description = payload.get("image_description")
        if not description:
            raise HTTPException(status_code=400, detail="image_description required for image titles")
        titles.extend(ImageTitleGenerator().generate(description, context, count=count))
    editor_service.set_titles(project_id, titles)
    return _project_or_404(project_id)


@app.post("/api/projects/{project_id}/generate/subtitles", response_model=StoryProject)
async def api_generate_subtitles(project_id: str) -> StoryProject:
    project = _project_or_404(project_id)
    context = GenerationContext(keyword=project.keyword, language=project.language, duration=settings.default_story_duration)
    subtitles, images = ShortsScriptGenerator().generate(context)
    editor_service.set_subtitles(project_id, subtitles)
    if images:
        editor_service.set_image_prompts(project_id, images)
    return _project_or_404(project_id)


@app.post("/api/projects/{project_id}/generate/scenes", response_model=StoryProject)
async def api_generate_scenes(project_id: str) -> StoryProject:
    project = _project_or_404(project_id)
    context = GenerationContext(keyword=project.keyword, language=project.language, duration=settings.default_story_duration)
    subtitles, scenes = ShortsSceneGenerator().generate(context)
    editor_service.set_video_prompts(project_id, scenes)
    editor_service.set_subtitles(project_id, project.subtitles + subtitles)
    return _project_or_404(project_id)


@app.post("/api/generate/story-keywords")
async def api_generate_story_keywords(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    keyword = str(payload.get("keyword", "")).strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword is required")

    language = str(payload.get("language", settings.default_language) or settings.default_language)
    try:
        requested_count = int(payload.get("count", 30))
    except (TypeError, ValueError):
        requested_count = 30
    count = max(1, min(requested_count, 60))

    context = GenerationContext(keyword=keyword, language=language, duration=settings.default_story_duration)
    titles = KeywordTitleGenerator().generate(context, count=count)
    return {
        "keyword": keyword,
        "language": language,
        "count": len(titles),
        "items": [title.dict() for title in titles],
    }


@app.post("/api/generate/image-story")
@app.post("/api/generate/video-titles")  # backward compatibility
async def api_generate_image_story(
    keyword: str = Form(""),
    language: str = Form(""),
    count: int = Form(12),
    image_description: str = Form(""),
    image: UploadFile | None = File(None),
) -> dict[str, Any]:
    keyword = keyword.strip()
    language = (language or settings.default_language).strip() or settings.default_language

    try:
        requested_count = int(count)
    except (TypeError, ValueError):
        requested_count = 12
    count = max(3, min(requested_count, 24))

    context_lines: list[str] = []
    image_filename: str | None = None
    image_size: int | None = None
    image_data: bytes | None = None

    if image is not None:
        image_filename = image.filename
        try:
            image_data = await image.read()
            image_size = len(image_data)
        except Exception:
            image_size = None
            image_data = None
        finally:
            try:
                await image.close()
            except Exception:  # pragma: no cover - best effort
                pass
        if image_filename:
            size_text = f" ({image_size} bytes)" if image_size is not None else ""
            context_lines.append(f"업로드된 이미지: {image_filename}{size_text}")
            context_lines.append("이미지의 분위기와 디테일을 창의적으로 해석해 제목과 묘사를 작성하세요.")

    if image_description.strip():
        context_lines.append(f"사용자 이미지 설명: {image_description.strip()}")

    if not context_lines:
        context_lines.append("이미지 설명 없음. 키워드만으로 장면을 상상해 작성하세요.")

    context_keyword = keyword or (image_description[:30] if image_description else "이미지 스토리")
    context = GenerationContext(keyword=context_keyword, language=language, duration=settings.default_story_duration)
    story_items = ImageStoryGenerator().generate(context, "\n".join(context_lines), count=count, image_data=image_data)

    return {
        "keyword": context_keyword,
        "language": language,
        "count": len(story_items),
        "source": {
            "image_filename": image_filename,
            "image_size": image_size,
            "description": image_description.strip(),
        },
        "items": [item.dict() for item in story_items],
    }


@app.post("/api/generate/shorts-script")
async def api_generate_shorts_script(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    keyword = str(payload.get("keyword", "")).strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword is required")

    language = str(payload.get("language", settings.default_language) or settings.default_language)
    context = GenerationContext(keyword=keyword, language=language, duration=settings.default_story_duration)
    subtitles, images = ShortsScriptGenerator().generate(context)
    return {
        "keyword": keyword,
        "language": language,
        "subtitles": [segment.dict() for segment in subtitles],
        "images": [prompt.dict() for prompt in images],
    }


@app.post("/api/generate/shorts-scenes")
async def api_generate_shorts_scenes(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    keyword = str(payload.get("keyword", "")).strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword is required")

    language = str(payload.get("language", settings.default_language) or settings.default_language)
    context = GenerationContext(keyword=keyword, language=language, duration=settings.default_story_duration)
    subtitles, scenes = ShortsSceneGenerator().generate(context)
    return {
        "keyword": keyword,
        "language": language,
        "subtitles": [segment.dict() for segment in subtitles],
        "scenes": [prompt.dict() for prompt in scenes],
    }


@app.post("/api/generate/long-script")
async def api_generate_long_script(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    topic = str(payload.get("topic") or payload.get("keyword") or "").strip()
    if not topic:
        raise HTTPException(status_code=400, detail="topic is required")

    language = str(payload.get("language", settings.default_language) or settings.default_language)
    context = GenerationContext(keyword=topic, language=language, duration=settings.default_story_duration)
    subtitles, images = ShortsScriptGenerator().generate(context)

    script_lines = []
    for segment in subtitles:
        line_prefix = f"{segment.index}." if segment.index is not None else "- "
        script_lines.append(f"{line_prefix} {segment.text}".strip())
    script_text = "\n".join(script_lines).strip()
    if not script_text:
        fallback_text = "\n".join(segment.text for segment in subtitles if segment.text).strip()
        script_text = fallback_text or topic

    return {
        "topic": topic,
        "keyword": topic,
        "language": language,
        "content": script_text,
        "subtitles": [segment.dict() for segment in subtitles],
        "images": [prompt.dict() for prompt in images],
    }


@app.post("/api/generate/media-prompts-from-script")
async def api_generate_media_prompts_from_script(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    """대본에서 각 장면별 이미지/영상 생성 프롬프트를 생성합니다."""
    script_content = str(payload.get("script_content", "")).strip()
    if not script_content:
        raise HTTPException(status_code=400, detail="script_content is required")

    topic = str(payload.get("topic", "콘텐츠")).strip()

    # 대본을 장면별로 파싱
    scenes = []
    current_scene = {"title": "", "content": ""}

    lines = script_content.split('\n')
    for line in lines:
        line = line.strip()
        if not line:
            if current_scene["content"]:
                scenes.append(current_scene)
                current_scene = {"title": "", "content": ""}
            continue

        # 장면 제목 감지 (🎧, 🎬, ⚛️, 🧘, 🧠, 🌌, 🧑‍🔬, 🧩, 🌠 등)
        if any(emoji in line for emoji in ['🎧', '🎬', '⚛️', '🧘', '🧠', '🌌', '🧑‍🔬', '🧩', '🌠', '📹', '✍️']) or \
           line.startswith('[') or \
           (line.startswith('#') and not current_scene["content"]):
            if current_scene["content"]:
                scenes.append(current_scene)
            current_scene = {"title": line, "content": ""}
        else:
            current_scene["content"] += line + "\n"

    # 마지막 장면 추가
    if current_scene["content"]:
        scenes.append(current_scene)

    # 각 장면별로 프롬프트 생성
    scene_prompts = []
    for idx, scene in enumerate(scenes):
        scene_num = idx + 1
        scene_title = scene["title"] or f"Scene {scene_num}"
        scene_content = scene["content"].strip()

        if not scene_content:
            continue

        # 이미지 생성 프롬프트 생성
        image_prompt_instruction = f"""You are a professional image prompt generator for AI image generation tools (Midjourney, DALL-E, Stable Diffusion, Kling AI).

Based on the following scene from a video script, create a detailed English image generation prompt.

Scene Title: {scene_title}
Scene Content:
{scene_content[:500]}

Requirements:
- Write in English only
- Be specific about visual elements, lighting, colors, composition, mood
- Include artistic style if relevant
- Keep it under 150 words
- Make it suitable for image generation AI

Format: Just provide the prompt text without any prefixes or explanations."""

        try:
            image_prompt = openai_client.generate_structured(
                instructions=image_prompt_instruction,
                content=scene_content
            )
        except Exception as exc:
            logger.error(f"Failed to generate image prompt for scene {scene_num}: {exc}")
            image_prompt = f"Scene {scene_num}: {scene_title}"

        # 영상 생성 프롬프트 생성
        video_prompt_instruction = f"""You are a professional video prompt generator for AI video generation tools (Sora, Runway, Kling AI, Pika).

Based on the following scene from a video script, create a detailed English video generation prompt.

Scene Title: {scene_title}
Scene Content:
{scene_content[:500]}

Requirements:
- Write in English only
- Describe camera movements, transitions, actions, and motion
- Include atmosphere, mood, pacing
- Specify visual style and cinematography if relevant
- Keep it under 150 words
- Make it suitable for video generation AI

Format: Just provide the prompt text without any prefixes or explanations."""

        try:
            video_prompt = openai_client.generate_structured(
                instructions=video_prompt_instruction,
                content=scene_content
            )
        except Exception as exc:
            logger.error(f"Failed to generate video prompt for scene {scene_num}: {exc}")
            video_prompt = f"Scene {scene_num}: {scene_title}"

        scene_prompts.append({
            "scene_number": scene_num,
            "scene_title": scene_title,
            "scene_content": scene_content[:200] + ("..." if len(scene_content) > 200 else ""),
            "image_prompt": image_prompt.strip(),
            "video_prompt": video_prompt.strip(),
        })

    return {
        "topic": topic,
        "total_scenes": len(scene_prompts),
        "prompts": scene_prompts,
    }


@app.post("/api/tools/frames")
async def api_save_trimmed_frame(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    data_url = str(payload.get("data_url", "")).strip()
    if not data_url:
        raise HTTPException(status_code=400, detail="data_url is required")

    match = re.match(r"^data:(image/\w+);base64,(.+)$", data_url)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid data_url format")

    mime_type, encoded = match.groups()
    extension_map = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
    }
    ext = extension_map.get(mime_type, "png")

    try:
        binary = base64.b64decode(encoded)
    except (base64.binascii.Error, ValueError) as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=400, detail="Failed to decode image data") from exc

    FRAME_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"frame-{uuid4().hex}.{ext}"
    target_path = FRAME_OUTPUT_DIR / filename
    target_path.write_bytes(binary)

    url_path = f"/outputs/frames/{filename}"
    return {
        "filename": filename,
        "url": url_path,
    }


@app.post("/api/tools/extract-frames")
async def api_extract_frames(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    """영상에서 지정된 간격으로 프레임을 추출합니다."""
    import cv2
    import subprocess
    import tempfile

    video_path = str(payload.get("video_path", "")).strip()
    interval = payload.get("interval", 10)  # 기본값 10초

    if not video_path:
        raise HTTPException(status_code=400, detail="video_path is required")

    video_file = Path(video_path).expanduser().resolve()
    if not video_file.exists():
        raise HTTPException(status_code=404, detail=f"Video file not found: {video_path}")

    transcoded_file = None  # 임시 파일 추적용
    try:
        # OpenCV로 영상 열기 시도
        cap = cv2.VideoCapture(str(video_file))
        if not cap.isOpened():
            # AV1 코덱 등으로 인해 실패할 수 있으므로 FFmpeg로 H.264로 트랜스코딩 시도
            logger.info(f"Failed to open video directly, attempting transcode: {video_file}")

            temp_dir = Path(tempfile.gettempdir())
            transcoded_file = temp_dir / f"transcoded_{uuid4().hex}.mp4"

            transcode_cmd = [
                "ffmpeg",
                "-y",
                "-hwaccel", "none",  # 하드웨어 가속 비활성화
                "-i", str(video_file),
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-preset", "ultrafast",  # 빠른 트랜스코딩
                "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",  # 해상도 유지 (짝수로 보정)
                "-avoid_negative_ts", "make_zero",  # 타임스탬프 문제 방지
                str(transcoded_file)
            ]

            proc = subprocess.run(transcode_cmd, capture_output=True, text=True)
            if proc.returncode != 0 or not transcoded_file.exists():
                error_msg = proc.stderr.strip() or proc.stdout.strip() or "FFmpeg transcoding failed"
                if transcoded_file and transcoded_file.exists():
                    transcoded_file.unlink()
                raise HTTPException(status_code=400, detail=f"Failed to process video: {error_msg}")

            # 트랜스코딩된 파일로 재시도
            cap = cv2.VideoCapture(str(transcoded_file))
            if not cap.isOpened():
                if transcoded_file.exists():
                    transcoded_file.unlink()
                raise HTTPException(status_code=400, detail="Failed to open transcoded video file")

        # 영상 정보 가져오기
        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps if fps > 0 else 0

        # 프레임 간격 계산
        frame_interval = int(fps * interval)

        # 프레임 추출
        FRAME_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        extracted_frames = []
        frame_count = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # 지정된 간격마다 프레임 저장
            if frame_count % frame_interval == 0:
                timestamp = frame_count / fps
                filename = f"extracted-{uuid4().hex}.jpg"
                target_path = FRAME_OUTPUT_DIR / filename

                # 프레임을 JPEG로 저장
                cv2.imwrite(str(target_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 95])

                extracted_frames.append({
                    "filename": filename,
                    "url": f"/outputs/frames/{filename}",
                    "timestamp": round(timestamp, 2),
                    "frame_number": frame_count
                })

            frame_count += 1

        cap.release()

        # 임시 트랜스코딩 파일 정리
        if transcoded_file and transcoded_file.exists():
            try:
                transcoded_file.unlink()
                logger.info(f"Cleaned up transcoded file: {transcoded_file}")
            except Exception as cleanup_exc:
                logger.warning(f"Failed to clean up transcoded file: {cleanup_exc}")

        return {
            "success": True,
            "video_path": str(video_file),
            "interval": interval,
            "fps": fps,
            "duration": round(duration, 2),
            "total_frames": total_frames,
            "extracted_count": len(extracted_frames),
            "frames": extracted_frames
        }

    except Exception as exc:
        # 에러 발생 시에도 임시 파일 정리
        if transcoded_file and transcoded_file.exists():
            try:
                transcoded_file.unlink()
            except Exception:
                pass
        logger.exception("Frame extraction failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Frame extraction failed: {str(exc)}") from exc


@app.get("/api/tools/list-extracted-frames")
async def api_list_extracted_frames() -> dict[str, Any]:
    """추출된 프레임 목록을 반환합니다."""
    if not FRAME_OUTPUT_DIR.exists():
        return {
            "frames": [],
            "count": 0
        }

    frames = []
    for file_path in sorted(FRAME_OUTPUT_DIR.glob("extracted-*.jpg"), key=lambda p: p.stat().st_mtime, reverse=True):
        frames.append({
            "filename": file_path.name,
            "url": f"/outputs/frames/{file_path.name}",
            "size": file_path.stat().st_size,
            "modified": file_path.stat().st_mtime
        })

    return {
        "frames": frames,
        "count": len(frames)
    }


@app.post("/api/generate/shorts-script-prompt")
async def api_generate_shorts_script_prompt(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    keyword = str(payload.get("keyword", "")).strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword is required")

    language = str(payload.get("language", settings.default_language) or settings.default_language)
    template = _select_script_prompt_template(language)
    prompt = template.format(
        keyword=keyword,
        language_label=_language_label(language),
    )
    return {
        "keyword": keyword,
        "language": language,
        "prompt": prompt,
    }


@app.post("/api/generate/shorts-scenes-prompt")
async def api_generate_shorts_scenes_prompt(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    keyword = str(payload.get("keyword", "")).strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword is required")

    language = str(payload.get("language", settings.default_language) or settings.default_language)
    template = _select_scene_prompt_template(language)
    prompt = template.format(
        keyword=keyword,
        language_label=_language_label(language),
    )
    return {
        "keyword": keyword,
        "language": language,
        "prompt": prompt,
    }


# ---------------------------------------------------------------------------
# Tool record management
# ---------------------------------------------------------------------------


@app.get("/api/tools/{tool}/records", response_model=list[ToolRecord])
async def api_list_tool_records(tool: ToolType) -> list[ToolRecord]:
    return tool_store.list_records(tool)


@app.get("/api/tools/{tool}/records/{record_id}", response_model=ToolRecord)
async def api_get_tool_record(tool: ToolType, record_id: str) -> ToolRecord:
    try:
        return tool_store.get_record(tool, record_id)
    except KeyError as exc:  # pragma: no cover - runtime path
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post(
    "/api/tools/{tool}/records",
    response_model=ToolRecord,
    status_code=status.HTTP_201_CREATED,
)
async def api_save_tool_record(tool: ToolType, payload: ToolRecordCreate = Body(...)) -> ToolRecord:
    if not payload.payload:
        raise HTTPException(status_code=400, detail="payload is required")
    return tool_store.save_record(tool, payload.title, payload.payload)


@app.delete("/api/tools/{tool}/records/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
async def api_delete_tool_record(tool: ToolType, record_id: str) -> Response:
    removed = tool_store.delete_record(tool, record_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Record not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/tools/{tool}/speech")
async def api_generate_speech(tool: ToolType, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    if tool not in {ToolType.shorts_script, ToolType.shorts_scenes}:
        raise HTTPException(status_code=400, detail="Speech synthesis is only supported for shorts tools.")

    subtitles = payload.get("subtitles") or []
    if not isinstance(subtitles, list):
        raise HTTPException(status_code=400, detail="subtitles must be a list")

    text_parts: list[str] = []
    for item in subtitles:
        if not isinstance(item, dict):
            continue
        candidate = str(item.get("text") or item.get("action") or "").strip()
        if candidate:
            text_parts.append(candidate)

    if not text_parts:
        raise HTTPException(status_code=400, detail="No subtitle text provided for speech synthesis")

    full_text = "\n".join(text_parts)
    voice = str(payload.get("voice") or "alloy")
    requested_format = str(payload.get("format") or "mp3").lower()

    try:
        audio_bytes, audio_format = openai_client.synthesize_speech(
            full_text,
            voice=voice,
            audio_format=requested_format,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not audio_bytes:
        raise HTTPException(status_code=500, detail="Failed to generate audio content")

    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    audio_dir = settings.outputs_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{tool.value}-speech-{timestamp}.{audio_format}"
    file_path = audio_dir / filename
    file_path.write_bytes(audio_bytes)

    return {
        "url": f"/outputs/audio/{filename}",
        "voice": voice,
        "format": audio_format,
        "character_count": len(full_text),
    }


# ---------------------------------------------------------------------------
# Editing endpoints
# ---------------------------------------------------------------------------


@app.patch("/api/projects/{project_id}/subtitles/{index}", response_model=StoryProject)
async def api_update_subtitle(project_id: str, index: int, payload: dict[str, Any] = Body(...)) -> StoryProject:
    if "text" in payload:
        editor_service.update_subtitle_text(project_id, index, payload["text"])
    if "start" in payload or "end" in payload:
        start = float(payload.get("start", 0.0))
        end = float(payload.get("end", start + 5.0))
        editor_service.update_subtitle_timing(project_id, index, start, end)
    return _project_or_404(project_id)


@app.delete("/api/projects/{project_id}/subtitles/{index}", response_model=StoryProject)
async def api_delete_subtitle(project_id: str, index: int) -> StoryProject:
    editor_service.delete_subtitle(project_id, index)
    return _project_or_404(project_id)


@app.post("/api/projects/{project_id}/chapters", response_model=StoryProject)
async def api_set_chapters(
    project_id: str,
    fragments: list[dict[str, str]] = Body(..., embed=True),
) -> StoryProject:
    pairs = [(fragment["source_id"], fragment["text"]) for fragment in fragments]
    editor_service.build_chapters_from_fragments(project_id, pairs)
    return _project_or_404(project_id)


@app.post("/api/projects/{project_id}/template", response_model=StoryProject)
async def api_apply_template(project_id: str, payload: dict[str, Any] = Body(...)) -> StoryProject:
    try:
        template = TemplateSetting.parse_obj(payload)
    except Exception as exc:  # pragma: no cover - validation error
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    editor_service.apply_template(project_id, template)
    return _project_or_404(project_id)


@app.post("/api/projects/{project_id}/effects", response_model=StoryProject)
async def api_apply_effect(project_id: str, payload: dict[str, Any] = Body(...)) -> StoryProject:
    try:
        effect = MediaEffect.parse_obj(payload)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    editor_service.apply_effect(project_id, effect)
    return _project_or_404(project_id)


@app.delete("/api/projects/{project_id}/effects/{effect_id}", response_model=StoryProject)
async def api_remove_effect(project_id: str, effect_id: str) -> StoryProject:
    editor_service.remove_effect(project_id, effect_id)
    return _project_or_404(project_id)


@app.post("/api/projects/{project_id}/prompts/image", response_model=StoryProject)
async def api_add_image_prompt(project_id: str, payload: dict[str, Any] = Body(...)) -> StoryProject:
    try:
        prompt = ImagePrompt.parse_obj(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    editor_service.add_image_prompt(project_id, prompt)
    return _project_or_404(project_id)


@app.patch("/api/projects/{project_id}/prompts/image/{tag}", response_model=StoryProject)
async def api_update_image_prompt(project_id: str, tag: str, payload: dict[str, Any] = Body(...)) -> StoryProject:
    try:
        editor_service.update_image_prompt(project_id, tag, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _project_or_404(project_id)


@app.delete("/api/projects/{project_id}/prompts/image/{tag}", response_model=StoryProject)
async def api_delete_image_prompt(project_id: str, tag: str) -> StoryProject:
    try:
        editor_service.delete_image_prompt(project_id, tag)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _project_or_404(project_id)


@app.post("/api/projects/{project_id}/prompts/video", response_model=StoryProject)
async def api_add_video_prompt(project_id: str, payload: dict[str, Any] = Body(...)) -> StoryProject:
    try:
        prompt = VideoPrompt.parse_obj(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    editor_service.add_video_prompt(project_id, prompt)
    return _project_or_404(project_id)


@app.patch("/api/projects/{project_id}/prompts/video/{scene_tag}", response_model=StoryProject)
async def api_update_video_prompt(project_id: str, scene_tag: str, payload: dict[str, Any] = Body(...)) -> StoryProject:
    try:
        editor_service.update_video_prompt(project_id, scene_tag, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _project_or_404(project_id)


@app.delete("/api/projects/{project_id}/prompts/video/{scene_tag}", response_model=StoryProject)
async def api_delete_video_prompt(project_id: str, scene_tag: str) -> StoryProject:
    try:
        editor_service.delete_video_prompt(project_id, scene_tag)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Video prompt not found") from exc
    return _project_or_404(project_id)


@app.post("/api/projects/{project_id}/music", response_model=StoryProject)
async def api_add_music_track(project_id: str, payload: dict[str, Any] = Body(...)) -> StoryProject:
    try:
        track = BackgroundMusicSegment.parse_obj(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        editor_service.add_background_music(project_id, track)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _project_or_404(project_id)


@app.patch("/api/projects/{project_id}/music/{track_id}", response_model=StoryProject)
async def api_update_music_track(project_id: str, track_id: str, payload: dict[str, Any] = Body(...)) -> StoryProject:
    try:
        editor_service.update_background_music(project_id, track_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _project_or_404(project_id)


@app.delete("/api/projects/{project_id}/music/{track_id}", response_model=StoryProject)
async def api_delete_music_track(project_id: str, track_id: str) -> StoryProject:
    try:
        editor_service.delete_background_music(project_id, track_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _project_or_404(project_id)


@app.post("/api/projects/{project_id}/export")
async def api_export_project(project_id: str) -> JSONResponse:
    data = editor_service.export_project(project_id)
    return JSONResponse(data)


@app.post("/api/projects/{project_id}/align", response_model=StoryProject)
async def api_auto_align(project_id: str) -> StoryProject:
    editor_service.auto_align(project_id)
    return _project_or_404(project_id)


@app.get("/api/settings")
async def api_settings() -> dict[str, Any]:
    return settings.dump()


# ---------------------------------------------------------------------------
# Utility endpoints
# ---------------------------------------------------------------------------


@app.get("/api/projects/{project_id}/history")
async def api_history(project_id: str):
    entries = history_service.list_history(project_id)
    return [entry.dict() for entry in entries]


@app.delete("/api/history/{project_id}/{version}", status_code=204)
async def api_delete_history_entry(project_id: str, version: int) -> Response:
    entry = history_service.delete_entry(project_id, version)
    if entry is None:
        raise HTTPException(status_code=404, detail="History entry not found")
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Video Import endpoints
# ---------------------------------------------------------------------------

@app.get("/api/downloads")
async def api_get_downloads():
    """다운로드 폴더에서 사용 가능한 영상과 자막 파일 목록을 반환합니다."""
    try:
        download_dir = DOWNLOAD_ROOT
        if not download_dir.exists():
            return {"files": [], "message": "Download directory not found"}

        files = []
        # SRT 파일들을 찾고 해당하는 영상 파일 확인
        for srt_file in download_dir.glob("*.srt"):
            # 영상 파일 찾기 (webm, mp4 등)
            base_name = srt_file.stem.rsplit('.', 1)[0] if '.' in srt_file.stem else srt_file.stem
            video_files = list(download_dir.glob(f"{base_name}.*"))
            video_files = [f for f in video_files if f.suffix.lower() in ['.webm', '.mp4', '.mkv', '.avi']]

            file_info = {
                "id": base_name,
                "title": base_name.replace('[', '').replace(']', '').split(' [')[0],
                "subtitle_file": str(srt_file),
                "video_files": [str(f) for f in video_files],
                "has_video": len(video_files) > 0,
                "size": srt_file.stat().st_size if srt_file.exists() else 0,
                "modified": srt_file.stat().st_mtime if srt_file.exists() else 0
            }
            files.append(file_info)

        return {"files": files, "count": len(files)}

    except Exception as e:
        logging.error(f"Error listing downloads: {e}")
        raise HTTPException(status_code=500, detail=f"Error listing downloads: {str(e)}")


@app.get("/api/video")
async def api_stream_video(path: str = Query(..., description="경로는 다운로드 디렉터리 내부의 영상 파일이어야 합니다.")) -> FileResponse:
    """요청된 영상 파일을 스트리밍합니다."""
    if not path:
        raise HTTPException(status_code=400, detail="Video path is required.")

    try:
        video_path = Path(path).expanduser().resolve()
    except Exception as exc:  # pragma: no cover - guard for invalid path
        raise HTTPException(status_code=400, detail="Invalid video path.") from exc

    if not video_path.exists() or not video_path.is_file():
        raise HTTPException(status_code=404, detail="Video file not found.")

    try:
        download_dir = DOWNLOAD_ROOT
        if download_dir not in video_path.parents and video_path != download_dir:
            raise HTTPException(status_code=403, detail="Access to the requested file is not allowed.")
    except ValueError as exc:  # pragma: no cover - guard for path resolution errors
        raise HTTPException(status_code=403, detail="Invalid file location.") from exc

    media_type, _ = mimetypes.guess_type(str(video_path))
    return FileResponse(
        video_path,
        media_type=media_type or "application/octet-stream",
        filename=video_path.name
    )


@app.post("/api/import-video")
async def api_import_video(
    selected_file: str = Form(...),
    title: str = Form(None)
):
    """선택된 영상과 자막을 프로젝트로 가져옵니다."""
    try:
        download_dir = DOWNLOAD_ROOT
        logging.info(f"Looking for file: {selected_file}")

        # SRT 파일 찾기 (정확한 파일명으로)
        srt_file = download_dir / f"{selected_file}.ko.srt"
        if not srt_file.exists():
            # .en.srt도 시도
            srt_file = download_dir / f"{selected_file}.en.srt"
            if not srt_file.exists():
                # 다른 언어 확장자들도 시도
                srt_files = list(download_dir.glob(f"{selected_file}.*.srt"))
                if srt_files:
                    srt_file = srt_files[0]
                else:
                    raise HTTPException(status_code=404, detail="Subtitle file not found")

        logging.info(f"Found SRT file: {srt_file}")

        # 영상 파일 찾기
        video_files = []
        for ext in ['.webm', '.mp4', '.mkv', '.avi']:
            video_file = download_dir / f"{selected_file}{ext}"
            if video_file.exists():
                video_files.append(video_file)

        # SRT 파일 읽기
        subtitles = []
        with open(srt_file, 'r', encoding='utf-8') as f:
            content = f.read()

        # 간단한 SRT 파싱
        subtitle_blocks = content.strip().split('\n\n')
        for i, block in enumerate(subtitle_blocks):
            if not block.strip():
                continue
            lines = block.strip().split('\n')
            if len(lines) >= 3:
                index = lines[0]
                time_range = lines[1]
                text = '\n'.join(lines[2:])

                # 시간 파싱 (00:00:00,000 --> 00:00:05,000)
                if '-->' in time_range:
                    start_time, end_time = time_range.split(' --> ')
                    subtitles.append({
                        "index": len(subtitles) + 1,
                        "start_time": start_time.strip(),
                        "end_time": end_time.strip(),
                        "text": text.strip().replace('>> ', '').replace('>>', ''),
                        "scene_tag": f"[씬 {len(subtitles) + 1}]",
                        "status": "imported"
                    })

        # 성공 응답 반환
        return {
            "success": True,
            "message": f"성공적으로 가져왔습니다. 자막 {len(subtitles)}개, 영상 {len(video_files)}개",
            "subtitle_count": len(subtitles),
            "video_count": len(video_files),
            "subtitles": subtitles
        }

    except Exception as e:
        logging.error(f"Error importing video: {e}")
        raise HTTPException(status_code=500, detail=f"Error importing video: {str(e)}")


def include_router(app_: FastAPI) -> None:
    """Convenience helper when mounting inside a larger project."""

    for route in app.router.routes:
        app_.router.routes.append(route)
