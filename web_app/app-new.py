"""FastAPI 애플리케이션: AI 쇼츠 제작 웹 UI 및 API."""
from __future__ import annotations

import logging
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .routers import projects, translator, youtube

logger = logging.getLogger(__name__)

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"


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

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app-new:app", host="0.0.0.0", port=8000, reload=True)