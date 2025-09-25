"""FastAPI application providing UI and API for story generation."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import Body, FastAPI, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from keywordimagestory.config import settings
from keywordimagestory.generators import (
    GenerationContext,
    ImageTitleGenerator,
    KeywordTitleGenerator,
    ShortsSceneGenerator,
    ShortsScriptGenerator,
)
from keywordimagestory.models import ImagePrompt, MediaEffect, StoryProject, TemplateSetting, VideoPrompt
from keywordimagestory.services import editor_service, history_service

logger = logging.getLogger(__name__)

app = FastAPI(title="Keyword Image Story Studio", version="0.1.0")

templates = Jinja2Templates(directory=str(settings.templates_dir))
app.mount("/static", StaticFiles(directory=str(settings.static_dir)), name="static")


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def _project_or_404(project_id: str) -> StoryProject:
    try:
        return editor_service.get_project(project_id)
    except KeyError as exc:  # pragma: no cover - runtime path
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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
    return templates.TemplateResponse(
        "keywords.html",
        {
            "request": request,
            "settings": settings.dump(),
        },
    )


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


@app.post("/api/generate/image-titles")
async def api_generate_image_titles(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    description = str(payload.get("description", "")).strip()
    if not description:
        raise HTTPException(status_code=400, detail="description is required")

    keyword = str(payload.get("keyword", "") or "").strip()
    language = str(payload.get("language", settings.default_language) or settings.default_language)
    try:
        requested_count = int(payload.get("count", 30))
    except (TypeError, ValueError):
        requested_count = 30
    count = max(5, min(requested_count, 60))

    context_keyword = keyword or description[:40] or "스토리"
    context = GenerationContext(keyword=context_keyword, language=language, duration=settings.default_story_duration)
    titles = ImageTitleGenerator().generate(description, context, count=count)
    return {
        "keyword": context_keyword,
        "language": language,
        "description": description,
        "count": len(titles),
        "items": [title.dict() for title in titles],
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


def include_router(app_: FastAPI) -> None:
    """Convenience helper when mounting inside a larger project."""

    for route in app.router.routes:
        app_.router.routes.append(route)
