"""FastAPI 애플리케이션: AI 쇼츠 제작 웹 UI 및 API."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .routers import projects, translator, youtube
from .utils.subtitle_split import SubtitleSplitError, split_subtitle_upload

logger = logging.getLogger(__name__)

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
SUBTITLE_UPLOAD_DIR = BASE_DIR / "uploads" / "subtitle_split"
SUBTITLE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def create_app() -> FastAPI:
    app = FastAPI(
        title="AI Shorts Maker",
        description="AI 기반 쇼츠 제작 도구",
        version="1.0.0",
    )

    # Include routers
    app.include_router(projects.router)
    app.include_router(translator.router)
    app.include_router(youtube.router)

    # Static files and templates
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    templates = Jinja2Templates(directory=TEMPLATES_DIR)

    @app.get("/", response_class=HTMLResponse)
    async def index(request: Request):
        return templates.TemplateResponse("index.html", {"request": request})

    @app.get("/dashboard", response_class=HTMLResponse)
    async def dashboard(request: Request):
        return templates.TemplateResponse("dashboard.html", {"request": request})

    @app.get("/translator", response_class=HTMLResponse)
    async def translator_page(request: Request):
        return templates.TemplateResponse("translator.html", {"request": request})

    @app.get("/ytdl", response_class=HTMLResponse)
    async def ytdl_page(request: Request):
        return templates.TemplateResponse("ytdl.html", {"request": request})

    @app.get("/text-removal", response_class=HTMLResponse)
    async def text_removal_page(request: Request):
        context = {
            "request": request,
            "nav_active": "text_removal",
        }
        return templates.TemplateResponse("text_removal.html", context)

    @app.get("/subtitle-split", response_class=HTMLResponse)
    async def subtitle_split_page(request: Request):
        context = {
            "request": request,
            "nav_active": "subtitle_split",
            "error": None,
            "split_result": [],
            "summary": None,
            "plain_text": "",
            "csv_preview": "",
            "show_results": False,
        }
        return templates.TemplateResponse("subtitle_split.html", context)

    @app.post("/subtitle-split", response_class=HTMLResponse)
    async def subtitle_split_upload(
        request: Request,
        subtitle_file: UploadFile = File(...),
        remove_empty: Optional[str] = Form(None),
    ):
        error: Optional[str] = None
        split_result: List[Dict[str, Any]] = []
        summary: Optional[Dict[str, Any]] = None
        plain_text = ""
        csv_preview = ""

        try:
            file_bytes = await subtitle_file.read()
            result = split_subtitle_upload(
                file_bytes,
                subtitle_file.filename or "",
                SUBTITLE_UPLOAD_DIR,
                remove_empty=remove_empty is not None,
            )
            split_result = result.entries
            summary = result.summary
            plain_text = result.plain_text
            csv_preview = result.csv_preview
        except SubtitleSplitError as exc:
            error = str(exc)
        except Exception as exc:  # pragma: no cover - unexpected failure
            logger.exception("Subtitle split failed: %s", exc)
            error = f"자막을 분리하는 중 오류가 발생했습니다: {exc}"
        finally:
            await subtitle_file.close()

        context = {
            "request": request,
            "nav_active": "subtitle_split",
            "error": error,
            "split_result": split_result,
            "summary": summary,
            "plain_text": plain_text,
            "csv_preview": csv_preview,
            "show_results": bool(split_result) and error is None,
        }
        return templates.TemplateResponse("subtitle_split.html", context)

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app-new:app", host="0.0.0.0", port=8000, reload=True)
