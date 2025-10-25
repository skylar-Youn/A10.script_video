from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from backend.api import editor
import os

app = FastAPI(title="VMaker - Video Editor", version="1.0.0")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 라우터 등록
app.include_router(editor.router)

# 정적 파일 서빙 (업로드된 파일)
uploads_dir = "/home/sk/ws/youtubeanalysis/10_vmaker/uploads"
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# 프론트엔드 정적 파일 서빙
frontend_dir = "/home/sk/ws/youtubeanalysis/10_vmaker/frontend"
app.mount("/static", StaticFiles(directory=frontend_dir), name="static")


@app.get("/", response_class=HTMLResponse)
async def root():
    """메인 페이지 - index.html 반환"""
    index_path = os.path.join(frontend_dir, "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        return f.read()


@app.get("/api")
async def api_info():
    """API 정보 엔드포인트"""
    return {
        "message": "VMaker API Server",
        "version": "1.0.0",
        "endpoints": {
            "upload_video": "/api/editor/upload-video",
            "upload_subtitle": "/api/editor/upload-subtitle",
            "render": "/api/editor/render",
            "download": "/api/editor/download/{filename}"
        }
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8007)
