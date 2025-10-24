#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
9.PyMaker Backend API
FastAPI 기반 비디오 편집 백엔드
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
import shutil
from datetime import datetime

app = FastAPI(
    title="9.PyMaker API",
    description="Python 기반 Canva 스타일 비디오 편집기 API",
    version="1.0.0"
)

# CORS 설정 - PyQt5 애플리케이션에서도 접근 가능하도록
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # PyQt5 애플리케이션은 localhost에서 실행
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 업로드 디렉토리
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# 정적 파일 서빙
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


@app.get("/")
async def root():
    """루트 엔드포인트"""
    return {
        "message": "9.PyMaker API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """헬스 체크"""
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat()
    }


@app.post("/api/upload/video")
async def upload_video(file: UploadFile = File(...)):
    """
    비디오 파일 업로드

    Args:
        file: 업로드할 비디오 파일

    Returns:
        업로드된 파일 정보
    """
    try:
        # 파일 확장자 확인
        allowed_extensions = {'.mp4', '.mov', '.avi', '.webm', '.mkv'}
        file_ext = Path(file.filename).suffix.lower()

        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"지원하지 않는 파일 형식입니다: {file_ext}"
            )

        # 파일 저장
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        safe_filename = f"video_{timestamp}{file_ext}"
        file_path = UPLOAD_DIR / safe_filename

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return {
            "success": True,
            "filename": safe_filename,
            "original_filename": file.filename,
            "url": f"/uploads/{safe_filename}",
            "size": file_path.stat().st_size
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload/audio")
async def upload_audio(file: UploadFile = File(...)):
    """
    오디오 파일 업로드

    Args:
        file: 업로드할 오디오 파일

    Returns:
        업로드된 파일 정보
    """
    try:
        # 파일 확장자 확인
        allowed_extensions = {'.mp3', '.wav', '.m4a', '.aac', '.ogg'}
        file_ext = Path(file.filename).suffix.lower()

        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"지원하지 않는 파일 형식입니다: {file_ext}"
            )

        # 파일 저장
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        safe_filename = f"audio_{timestamp}{file_ext}"
        file_path = UPLOAD_DIR / safe_filename

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return {
            "success": True,
            "filename": safe_filename,
            "original_filename": file.filename,
            "url": f"/uploads/{safe_filename}",
            "size": file_path.stat().st_size
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload/subtitle")
async def upload_subtitle(file: UploadFile = File(...)):
    """
    자막 파일 업로드

    Args:
        file: 업로드할 자막 파일

    Returns:
        업로드된 파일 정보
    """
    try:
        # 파일 확장자 확인
        allowed_extensions = {'.srt', '.vtt', '.ass', '.ssa', '.sub'}
        file_ext = Path(file.filename).suffix.lower()

        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"지원하지 않는 파일 형식입니다: {file_ext}"
            )

        # 파일 저장
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        safe_filename = f"subtitle_{timestamp}{file_ext}"
        file_path = UPLOAD_DIR / safe_filename

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return {
            "success": True,
            "filename": safe_filename,
            "original_filename": file.filename,
            "url": f"/uploads/{safe_filename}",
            "size": file_path.stat().st_size
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/files")
async def list_files():
    """
    업로드된 파일 목록 조회

    Returns:
        파일 목록
    """
    files = []

    for file_path in UPLOAD_DIR.iterdir():
        if file_path.is_file():
            files.append({
                "filename": file_path.name,
                "url": f"/uploads/{file_path.name}",
                "size": file_path.stat().st_size,
                "created": datetime.fromtimestamp(
                    file_path.stat().st_ctime
                ).isoformat()
            })

    # 최신 파일부터 정렬
    files.sort(key=lambda x: x['created'], reverse=True)

    return {
        "success": True,
        "count": len(files),
        "files": files
    }


@app.delete("/api/files/{filename}")
async def delete_file(filename: str):
    """
    파일 삭제

    Args:
        filename: 삭제할 파일명

    Returns:
        삭제 결과
    """
    try:
        file_path = UPLOAD_DIR / filename

        if not file_path.exists():
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")

        if not file_path.is_file():
            raise HTTPException(status_code=400, detail="유효한 파일이 아닙니다")

        # 파일 삭제
        file_path.unlink()

        return {
            "success": True,
            "message": f"파일이 삭제되었습니다: {filename}"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8009,
        reload=True
    )
