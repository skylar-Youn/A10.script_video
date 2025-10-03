"""
파일 관리 서비스
"""
import os
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any

from ..utils.file_utils import get_file_type, is_analyzable, find_related_files, get_media_duration


def get_files_list(path: str, filter_type: str = "all") -> Dict[str, Any]:
    """분석 가능한 파일 목록 반환"""
    try:
        files = []
        base_path = Path(path)

        if not base_path.exists():
            return {"files": [], "total": 0, "error": "폴더를 찾을 수 없습니다"}

        # 현재 디렉토리의 모든 파일 탐색
        for file_path in base_path.rglob("*"):
            if file_path.is_file():
                file_stat = file_path.stat()
                file_ext = file_path.suffix.lower()

                # 파일 타입 필터링
                file_type = get_file_type(file_ext)

                # 미디어 파일(영상, 음성, 자막)만 표시
                if file_type == 'other':
                    continue

                if filter_type != "all" and file_type != filter_type:
                    continue

                # 관련 파일 찾기
                related_files = find_related_files(file_path)

                file_info = {
                    "name": file_path.name,
                    "path": str(file_path),
                    "relative_path": str(file_path.relative_to(base_path)),
                    "size": file_stat.st_size,
                    "size_mb": round(file_stat.st_size / (1024 * 1024), 2),
                    "modified": file_stat.st_mtime,
                    "modified_str": datetime.fromtimestamp(file_stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                    "type": file_type,
                    "extension": file_ext,
                    "analyzable": is_analyzable(file_ext),
                    "related_files": related_files,
                    "duration": get_media_duration(file_path) if file_type in ['video', 'audio'] else None
                }
                files.append(file_info)

        # 수정일 기준 내림차순 정렬
        files.sort(key=lambda x: x["modified"], reverse=True)

        return {
            "files": files,
            "total": len(files),
            "folder": str(base_path),
            "filter": filter_type
        }

    except Exception as e:
        return {"files": [], "total": 0, "error": str(e)}


def build_folder_tree(directory: Path, max_depth: int = 3, current_depth: int = 0) -> Dict[str, Any]:
    """폴더 구조를 트리 형태로 반환"""
    if current_depth >= max_depth:
        return None

    tree = {
        "name": directory.name or str(directory),
        "path": str(directory),
        "type": "folder",
        "children": [],
        "file_count": 0,
        "total_size": 0
    }

    try:
        items = list(directory.iterdir())
        files = [item for item in items if item.is_file()]
        folders = [item for item in items if item.is_dir()]

        # 미디어 파일만 카운트
        media_files = [f for f in files if get_file_type(f.suffix.lower()) != 'other']

        # 파일 정보 계산 (미디어 파일만)
        tree["file_count"] = len(media_files)
        tree["total_size"] = sum(f.stat().st_size for f in media_files if f.exists())

        # 하위 폴더 추가
        for folder in sorted(folders):
            subtree = build_folder_tree(folder, max_depth, current_depth + 1)
            if subtree:
                tree["children"].append(subtree)
                tree["file_count"] += subtree["file_count"]
                tree["total_size"] += subtree["total_size"]

        # 파일 추가 (미디어 파일만, 처음 10개)
        for file_item in sorted(media_files)[:10]:
            tree["children"].append({
                "name": file_item.name,
                "path": str(file_item),
                "type": "file",
                "size": file_item.stat().st_size,
                "extension": file_item.suffix.lower(),
                "file_type": get_file_type(file_item.suffix.lower())
            })

    except PermissionError:
        tree["error"] = "접근 권한 없음"

    return tree