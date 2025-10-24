from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from typing import List
import os
import shutil
import uuid
from backend.models.subtitle import SubtitleItem, TimelineProject, EditRequest
from backend.utils.subtitle_parser import SubtitleParser
from backend.utils.video_processor import VideoProcessor

router = APIRouter(prefix="/api/editor", tags=["editor"])

# 업로드 디렉토리
UPLOAD_DIR = "/home/sk/ws/youtubeanalysis/10_vmaker/uploads"
OUTPUT_DIR = "/home/sk/ws/youtubeanalysis/10_vmaker/output"
TEMP_DIR = "/home/sk/ws/youtubeanalysis/10_vmaker/temp"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)


@router.post("/upload-video")
async def upload_video(file: UploadFile = File(...)):
    """비디오 파일 업로드"""
    try:
        # 고유 파일명 생성
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)

        # 파일 저장
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 비디오 정보 추출
        video_info = VideoProcessor.get_video_info(file_path)

        return {
            "success": True,
            "filename": unique_filename,
            "path": file_path,
            "info": video_info
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-subtitle")
async def upload_subtitle(file: UploadFile = File(...)):
    """자막 파일 업로드 및 파싱"""
    try:
        # 파일 저장
        file_extension = os.path.splitext(file.filename)[1]
        if file_extension.lower() not in ['.srt']:
            raise HTTPException(status_code=400, detail="Only SRT files are supported")

        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 자막 파싱
        subtitles = SubtitleParser.parse_srt(file_path)

        return {
            "success": True,
            "filename": unique_filename,
            "path": file_path,
            "subtitles": [sub.dict() for sub in subtitles],
            "count": len(subtitles)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/render")
async def render_video(request: EditRequest):
    """선택된 자막 구간만으로 비디오 렌더링"""
    try:
        # 원본 비디오에서 자막 파싱
        subtitle_path = request.video_path.replace('.mp4', '.srt')
        if not os.path.exists(subtitle_path):
            # 자막 경로가 다를 수 있으므로 요청에서 찾기
            raise HTTPException(status_code=400, detail="Subtitle file not found")

        all_subtitles = SubtitleParser.parse_srt(subtitle_path)

        # 선택된 자막만 필터링
        selected_subtitles = [sub for sub in all_subtitles if sub.id in request.selected_ids]
        selected_subtitles.sort(key=lambda x: x.id)

        if not selected_subtitles:
            raise HTTPException(status_code=400, detail="No subtitles selected")

        # 임시 디렉토리 생성
        session_id = str(uuid.uuid4())
        session_temp_dir = os.path.join(TEMP_DIR, session_id)
        os.makedirs(session_temp_dir, exist_ok=True)

        # 비디오 분할
        clip_paths = VideoProcessor.split_video_by_subtitles(
            request.video_path,
            selected_subtitles,
            session_temp_dir
        )

        # 출력 파일명
        output_filename = f"edited_{uuid.uuid4()}.mp4"
        output_path = os.path.join(OUTPUT_DIR, output_filename)

        # 클립 병합
        VideoProcessor.merge_clips(clip_paths, output_path)

        # 임시 파일 정리
        shutil.rmtree(session_temp_dir)

        return {
            "success": True,
            "output_path": output_path,
            "filename": output_filename,
            "clip_count": len(clip_paths)
        }

    except Exception as e:
        # 에러 발생 시 임시 파일 정리
        if 'session_temp_dir' in locals() and os.path.exists(session_temp_dir):
            shutil.rmtree(session_temp_dir)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/{filename}")
async def download_video(filename: str):
    """렌더링된 비디오 다운로드"""
    file_path = os.path.join(OUTPUT_DIR, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        file_path,
        media_type="video/mp4",
        filename=filename
    )


@router.post("/parse-subtitle-from-path")
async def parse_subtitle_from_path(subtitle_path: str):
    """경로로부터 자막 파싱 (이미 업로드된 파일용)"""
    try:
        if not os.path.exists(subtitle_path):
            raise HTTPException(status_code=404, detail="Subtitle file not found")

        subtitles = SubtitleParser.parse_srt(subtitle_path)

        return {
            "success": True,
            "subtitles": [sub.dict() for sub in subtitles],
            "count": len(subtitles)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
