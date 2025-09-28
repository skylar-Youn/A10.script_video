"""
파일 관련 유틸리티 함수들
"""
import os
import json
import subprocess
from pathlib import Path
from typing import List, Optional
from ..config import VIDEO_EXTENSIONS, AUDIO_EXTENSIONS, SUBTITLE_EXTENSIONS


def get_file_type(ext: str) -> str:
    """파일 확장자에 따른 타입 분류"""
    if ext in VIDEO_EXTENSIONS:
        return 'video'
    elif ext in AUDIO_EXTENSIONS:
        return 'audio'
    elif ext in SUBTITLE_EXTENSIONS:
        return 'subtitle'
    else:
        return 'other'


def is_analyzable(ext: str) -> bool:
    """분석 가능한 파일인지 확인"""
    return ext in VIDEO_EXTENSIONS + AUDIO_EXTENSIONS + SUBTITLE_EXTENSIONS


def find_related_files(file_path: Path) -> List[str]:
    """관련 파일 찾기 (같은 이름의 다른 확장자)"""
    related = []
    stem = file_path.stem
    parent = file_path.parent

    for related_file in parent.glob(f"{stem}.*"):
        if related_file != file_path:
            related.append(str(related_file))

    return related


def get_media_duration(file_path: Path) -> Optional[float]:
    """미디어 파일의 지속시간 반환"""
    try:
        cmd = ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', str(file_path)]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        return float(data['format']['duration'])
    except Exception:
        return None