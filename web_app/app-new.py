"""경량 FastAPI 애플리케이션: 주요 템플릿 + API 라우트."""
from __future__ import annotations

import base64
import json
import logging
from pathlib import Path
from typing import List, Optional
from uuid import uuid4

try:
    import cv2
    CV2_IMPORT_ERROR: Optional[Exception] = None
except ImportError as exc:  # pragma: no cover - optional in runtime
    cv2 = None  # type: ignore[assignment]
    CV2_IMPORT_ERROR = exc

from dotenv import load_dotenv
from fastapi import Body, FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.concurrency import run_in_threadpool

from .routers import projects, translator, youtube
from .utils.text_removal import (
    DiffusionUnavailableError,
    RemovalConfig,
    TrackerUnavailableError,
    prepare_video_preview,
    run_text_removal,
)
from .app import TextRemovalBox, TextRemovalProcessRequest  # 재사용


logger = logging.getLogger(__name__)


def _text_removal_boxes_to_tuples(boxes: List[TextRemovalBox]):
    return [(box.x, box.y, box.width, box.height) for box in boxes]


load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
TEXT_REMOVAL_UPLOAD_DIR = BASE_DIR / "uploads" / "text_removal"
TEXT_REMOVAL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


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

    @app.post("/api/text-removal/preview")
    async def api_text_removal_preview(video: UploadFile = File(...)):
        if cv2 is None:
            raise HTTPException(
                status_code=500,
                detail="OpenCV(opencv-contrib-python) 패키지가 설치되어 있어야 합니다.",
            )

        if not video.filename:
            raise HTTPException(status_code=400, detail="업로드할 영상 파일을 선택하세요.")

        session_id = uuid4().hex
        session_dir = TEXT_REMOVAL_UPLOAD_DIR / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        suffix = Path(video.filename).suffix or ".mp4"
        input_path = session_dir / f"input{suffix}"

        try:
            file_bytes = await video.read()
            input_path.write_bytes(file_bytes)
        except Exception as exc:  # pragma: no cover - filesystem failure
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"영상 파일을 저장하지 못했습니다: {exc}",
            ) from exc

        try:
            frame, fps, frame_count, width, height, original_path, processed_path = prepare_video_preview(
                input_path, session_dir
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        success, buffer = cv2.imencode(".png", frame)
        if not success:
            raise HTTPException(status_code=500, detail="미리보기 이미지를 생성하지 못했습니다.")

        preview_image = base64.b64encode(buffer).decode("ascii")

        meta = {
            "input_path": str(original_path),
            "processed_path": str(processed_path),
            "original_filename": video.filename,
            "fps": fps,
            "frame_count": frame_count,
            "width": width,
            "height": height,
            "transcoded": processed_path != original_path,
        }
        (session_dir / "meta.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        return {
            "session_id": session_id,
            "preview_image": f"data:image/png;base64,{preview_image}",
            "fps": fps,
            "frame_count": frame_count,
            "width": width,
            "height": height,
            "message": "미리보기를 생성했습니다.",
            "transcoded": processed_path != original_path,
        }

    @app.post("/api/text-removal/process")
    async def api_text_removal_process(payload: TextRemovalProcessRequest):
        if cv2 is None:
            raise HTTPException(
                status_code=500,
                detail="OpenCV(opencv-contrib-python) 패키지가 설치되어 있어야 합니다.",
            )

        session_dir = TEXT_REMOVAL_UPLOAD_DIR / payload.session_id
        if not session_dir.exists():
            raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다. 먼저 영상을 업로드하세요.")

        meta_path = session_dir / "meta.json"
        if not meta_path.exists():
            raise HTTPException(status_code=400, detail="세션 정보가 손상되었습니다. 다시 시도하세요.")

        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="세션 정보를 읽을 수 없습니다.") from exc

        processed_path_str = meta.get("processed_path") or meta.get("input_path")
        if not processed_path_str:
            raise HTTPException(status_code=400, detail="업로드된 영상 파일을 찾을 수 없습니다.")

        video_path = Path(processed_path_str)
        if not video_path.exists():
            raise HTTPException(status_code=400, detail="업로드된 영상 파일을 찾을 수 없습니다.")

        if not payload.boxes:
            raise HTTPException(status_code=400, detail="인페인팅할 영역을 최소 1개 이상 지정하세요.")

        output_path = session_dir / "restored.mp4"

        config = RemovalConfig(
            video_path=video_path,
            output_path=output_path,
            boxes=_text_removal_boxes_to_tuples(payload.boxes),
            model_id=payload.model_id,
            prompt=payload.prompt,
            negative_prompt=payload.negative_prompt,
            strength=payload.strength,
            guidance_scale=payload.guidance_scale,
            num_inference_steps=payload.num_inference_steps,
            dilate_radius=payload.dilate,
            device=payload.device,
            dtype=payload.dtype,
            seed=payload.seed,
            fps_override=payload.fps,
            max_frames=payload.max_frames,
        )

        try:
            await run_in_threadpool(run_text_removal, config)
        except DiffusionUnavailableError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        except TrackerUnavailableError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        except Exception as exc:  # pylint: disable=broad-except
            logger.exception("Text removal failed: %s", exc)
            raise HTTPException(
                status_code=500,
                detail=f"영상 처리 중 오류가 발생했습니다: {exc}",
            ) from exc

        meta.update(
            {
                "output_path": str(output_path),
                "prompt": payload.prompt,
                "negative_prompt": payload.negative_prompt,
                "boxes": [box.model_dump() for box in payload.boxes],
                "strength": payload.strength,
                "guidance_scale": payload.guidance_scale,
                "num_inference_steps": payload.num_inference_steps,
                "dilate": payload.dilate,
            }
        )
        meta_path.write_text(
            json.dumps(meta, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        return {
            "session_id": payload.session_id,
            "video_url": f"/api/text-removal/download/{payload.session_id}",
            "output_path": str(output_path),
            "message": "영상 인페인팅이 완료되었습니다.",
        }

    @app.get("/api/text-removal/download/{session_id}")
    async def api_text_removal_download(session_id: str):
        session_dir = TEXT_REMOVAL_UPLOAD_DIR / session_id
        meta_path = session_dir / "meta.json"
        if not session_dir.exists() or not meta_path.exists():
            raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")

        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        output_path = Path(meta.get("output_path", session_dir / "restored.mp4"))
        if not output_path.exists():
            raise HTTPException(status_code=404, detail="처리된 영상이 존재하지 않습니다.")

        original_name = meta.get("original_filename", output_path.name)
        stem = Path(original_name).stem or "restored"
        download_name = f"{stem}_restored{output_path.suffix}"

        return FileResponse(output_path, filename=download_name)

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app-new:app", host="0.0.0.0", port=8000, reload=True)
