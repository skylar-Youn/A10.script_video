from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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


@app.get("/")
async def root():
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
