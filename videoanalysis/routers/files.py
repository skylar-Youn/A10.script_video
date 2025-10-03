"""
파일 관련 API 라우터
"""
import mimetypes
import os
import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, Body
from fastapi.responses import FileResponse

from ..config import DOWNLOAD_DIR
from ..services.file_service import get_files_list, build_folder_tree

logger = logging.getLogger(__name__)

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
        file_path = file_path.resolve()
        base_dir = DOWNLOAD_DIR.resolve()

        # 다운로드 디렉토리 하위인지 확인
        try:
            file_path.relative_to(base_dir)
        except ValueError:
            logger.warning(f"Access denied: {file_path} not under {base_dir}")
            raise HTTPException(status_code=403, detail="접근 권한이 없습니다")

        # 파일 존재 여부 확인
        if not file_path.exists():
            logger.warning(f"File not found: {file_path}")
            raise HTTPException(status_code=404, detail=f"파일을 찾을 수 없습니다: {file_path.name}")

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


@router.post("/delete-file")
async def delete_file(request: dict = Body(...)):
    """파일 삭제"""
    try:
        file_path_str = request.get("file_path")

        if not file_path_str:
            raise HTTPException(status_code=400, detail="file_path is required")

        file_path = Path(file_path_str)

        # 보안 체크: 절대 경로로 변환
        if not file_path.is_absolute():
            file_path = DOWNLOAD_DIR / file_path

        # 경로 검증
        try:
            file_path = file_path.resolve()
            download_dir_resolved = DOWNLOAD_DIR.resolve()

            # 다운로드 디렉토리 하위인지 확인
            if not str(file_path).startswith(str(download_dir_resolved)):
                raise HTTPException(status_code=403, detail="접근 권한이 없습니다. 허용된 디렉토리 외부의 파일입니다.")
        except Exception as e:
            logger.error(f"Path validation error: {e}")
            raise HTTPException(status_code=403, detail="잘못된 파일 경로입니다")

        # 파일 존재 여부 확인
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")

        # 파일인지 확인 (디렉토리는 삭제 불가)
        if not file_path.is_file():
            raise HTTPException(status_code=400, detail="디렉토리는 삭제할 수 없습니다")

        # 파일 삭제
        file_name = file_path.name
        os.remove(file_path)

        logger.info(f"File deleted: {file_path}")

        return {
            "status": "success",
            "message": f"파일이 삭제되었습니다: {file_name}",
            "deleted_file": file_name
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"File deletion error: {e}")
        raise HTTPException(status_code=500, detail=str(e))