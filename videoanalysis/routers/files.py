"""
파일 관련 API 라우터
"""
import mimetypes
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from ..config import DOWNLOAD_DIR
from ..services.file_service import get_files_list, build_folder_tree

router = APIRouter(prefix="/api", tags=["files"])


@router.get("/files")
async def get_files(
    path: str = Query(str(DOWNLOAD_DIR), description="탐색할 폴더 경로"),
    filter_type: str = Query("all", description="파일 타입 필터")
):
    """분석 가능한 파일 목록 반환"""
    try:
        return get_files_list(path, filter_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/folder-tree")
async def get_folder_tree(path: str = Query(str(DOWNLOAD_DIR))):
    """폴더 구조를 트리 형태로 반환"""
    try:
        return build_folder_tree(Path(path))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/file-content")
async def get_file_content(path: str = Query(...)):
    """파일 내용을 스트리밍으로 제공 (비디오/오디오 파일용)"""
    try:
        file_path = Path(path)

        # 보안 체크: 다운로드 디렉토리 내부 파일만 허용
        if not file_path.is_absolute():
            file_path = DOWNLOAD_DIR / file_path

        # 경로 검증
        try:
            file_path = file_path.resolve()
            DOWNLOAD_DIR.resolve()

            # 다운로드 디렉토리 하위인지 확인
            if not str(file_path).startswith(str(DOWNLOAD_DIR.resolve())):
                raise HTTPException(status_code=403, detail="접근 권한이 없습니다")
        except:
            raise HTTPException(status_code=403, detail="잘못된 파일 경로입니다")

        # 파일 존재 여부 확인
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")

        # MIME 타입 결정
        content_type, _ = mimetypes.guess_type(str(file_path))
        if not content_type:
            content_type = 'application/octet-stream'

        # 파일 스트리밍 응답
        response = FileResponse(
            path=str(file_path),
            media_type=content_type,
            filename=file_path.name
        )

        # CORS 헤더 추가 (필요한 경우)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"

        return response

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))