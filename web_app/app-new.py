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
    trim_video_clip,
)
from .app import (
    TextRemovalBox,
    TextRemovalProcessRequest,
    TextRemovalTrimRequest,
)  # 재사용


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

        source_path = Path(processed_path_str)
        if not source_path.exists():
            source_path = Path(meta.get("input_path", processed_path_str))
        if not source_path.exists():
            raise HTTPException(status_code=400, detail="업로드된 영상 파일을 찾을 수 없습니다.")

        trim_start = float(meta.get("trim_start", 0.0) or 0.0)
        trim_duration = float(meta.get("trim_duration", 4.0) or 4.0)
        trimmed_path_str = meta.get("trimmed_path")
        trimmed_path = Path(trimmed_path_str) if trimmed_path_str else session_dir / "input_trimmed.mp4"

        effective_source = source_path
        if not trimmed_path.exists():
            try:
                trimmed_path, effective_source = trim_video_clip(
                    source_path, trimmed_path, duration=trim_duration, start=trim_start
                )
            except Exception as exc:  # pylint: disable=broad-except
                logger.exception("Failed to trim video clip: %s", exc)
                raise HTTPException(
                    status_code=500,
                    detail=f"영상 트리밍에 실패했습니다: {exc}",
                ) from exc

        if trimmed_path.exists() and trimmed_path.stat().st_size == 0:
            trimmed_path.unlink(missing_ok=True)
            raise HTTPException(
                status_code=500,
                detail="트리밍된 클립이 비어 있습니다. 시작 시간과 길이를 조정해 다시 시도하세요.",
            )

        if effective_source != source_path:
            meta["processed_path"] = str(effective_source)

        if trimmed_path.exists():
            meta.update(
                {
                    "trimmed_path": str(trimmed_path),
                    "trim_start": trim_start,
                    "trim_duration": trim_duration,
                }
            )
            meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

        video_path = trimmed_path if trimmed_path.exists() else effective_source

        if not payload.boxes:
            raise HTTPException(status_code=400, detail="인페인팅할 영역을 최소 1개 이상 지정하세요.")

        output_path = session_dir / "restored.mp4"

        effective_max_frames = payload.max_frames if payload.max_frames and payload.max_frames > 0 else None

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
            max_frames=effective_max_frames,
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

        if effective_source != source_path:
            meta["processed_path"] = str(effective_source)

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
                "max_frames": effective_max_frames,
                "trimmed_path": str(trimmed_path),
                "trim_start": trim_start,
                "trim_duration": trim_duration,
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

    @app.post("/api/text-removal/trim")
    async def api_text_removal_trim(payload: TextRemovalTrimRequest):
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

        source_path = Path(processed_path_str)
        if not source_path.exists():
            source_path = Path(meta.get("input_path", processed_path_str))
        if not source_path.exists():
            raise HTTPException(status_code=400, detail="업로드된 영상 파일을 찾을 수 없습니다.")

        duration = float(payload.duration or 0.0)
        if duration <= 0:
            raise HTTPException(status_code=400, detail="잘라낼 길이가 0보다 커야 합니다.")

        start = float(payload.start or 0.0)
        if start < 0:
            raise HTTPException(status_code=400, detail="시작 시간은 0 이상이어야 합니다.")

        trimmed_path = session_dir / "input_trimmed.mp4"
        effective_source = source_path
        try:
            trimmed_path, effective_source = trim_video_clip(
                source_path, trimmed_path, duration=duration, start=start
            )
        except (ValueError, FileNotFoundError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:  # pylint: disable=broad-except
            logger.exception("Trim preview failed: %s", exc)
            raise HTTPException(
                status_code=500,
                detail=f"영상 자르기에 실패했습니다: {exc}",
            ) from exc

        if trimmed_path.exists() and trimmed_path.stat().st_size == 0:
            trimmed_path.unlink(missing_ok=True)
            raise HTTPException(status_code=500, detail="트리밍된 영상이 비어 있습니다. 다른 구간을 시도하세요.")

        if effective_source != source_path:
            meta["processed_path"] = str(effective_source)

        meta.update(
            {
                "trimmed_path": str(trimmed_path),
                "trim_start": start,
                "trim_duration": duration,
            }
        )
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

        return {
            "session_id": payload.session_id,
            "video_url": f"/api/text-removal/download/trim/{payload.session_id}",
            "message": "트리밍한 미리보기 영상을 준비했습니다.",
            "start": start,
            "duration": duration,
        }

    @app.get("/api/text-removal/download/trim/{session_id}")
    async def api_text_removal_download_trim(session_id: str):
        session_dir = TEXT_REMOVAL_UPLOAD_DIR / session_id
        meta_path = session_dir / "meta.json"
        if not session_dir.exists() or not meta_path.exists():
            raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")

        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        target_path = Path(meta.get("trimmed_path", session_dir / "input_trimmed.mp4"))
        if not target_path.exists():
            raise HTTPException(status_code=404, detail="트리밍된 영상을 찾을 수 없습니다.")

        original_name = meta.get("original_filename", target_path.name)
        stem = Path(original_name).stem or "clip"
        download_name = f"{stem}_trimmed{target_path.suffix}"
        return FileResponse(target_path, filename=download_name)

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app-new:app", host="0.0.0.0", port=8000, reload=True)
