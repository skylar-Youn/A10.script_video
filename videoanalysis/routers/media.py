"""
미디어 처리 관련 API 라우터
"""
import os
import logging
from fastapi import APIRouter, HTTPException, Body
from pathlib import Path

from ..services.audio_service import extract_audio_to_file
from ..utils.file_utils import get_media_duration
from ..utils.time_utils import format_duration_str

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["media"])


@router.post("/extract-audio")
async def extract_audio_from_video_api(request: dict = Body(...)):
    """영상 파일에서 음성을 분리하여 저장"""
    try:
        video_paths = request.get("files", [])
        output_format = request.get("format", "wav")  # wav, mp3, m4a

        results = []

        for video_path in video_paths:
            try:
                if not os.path.exists(video_path):
                    results.append({
                        "file": video_path,
                        "status": "error",
                        "error": "파일을 찾을 수 없습니다"
                    })
                    continue

                # 비디오 파일인지 확인
                video_ext = os.path.splitext(video_path)[1].lower()
                if video_ext not in ['.mp4', '.webm', '.avi', '.mov', '.mkv']:
                    results.append({
                        "file": video_path,
                        "status": "error",
                        "error": "지원되지 않는 비디오 형식입니다"
                    })
                    continue

                # 출력 파일 경로 생성
                base_name = os.path.splitext(os.path.basename(video_path))[0]
                output_dir = os.path.dirname(video_path)
                output_path = os.path.join(output_dir, f"{base_name}_extracted.{output_format}")

                # FFmpeg를 사용하여 음성 추출
                success = extract_audio_to_file(video_path, output_path, output_format)

                if success:
                    # 파일 정보 가져오기
                    file_size = os.path.getsize(output_path)
                    duration = get_media_duration(Path(output_path))

                    results.append({
                        "file": video_path,
                        "status": "success",
                        "data": {
                            "output_path": output_path,
                            "output_filename": os.path.basename(output_path),
                            "format": output_format,
                            "size_bytes": file_size,
                            "size_mb": round(file_size / (1024 * 1024), 2),
                            "duration": duration,
                            "duration_str": format_duration_str(duration) if duration else "알 수 없음"
                        }
                    })
                else:
                    results.append({
                        "file": video_path,
                        "status": "error",
                        "error": "음성 추출에 실패했습니다"
                    })

            except Exception as e:
                logger.exception(f"음성 추출 에러 - {video_path}: {e}")
                results.append({
                    "file": video_path,
                    "status": "error",
                    "error": str(e)
                })

        return {"results": results}

    except Exception as e:
        logger.exception(f"배치 음성 추출 에러: {e}")
        raise HTTPException(status_code=500, detail=str(e))