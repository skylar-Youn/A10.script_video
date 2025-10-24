from pydantic import BaseModel
from typing import List, Optional


class SubtitleItem(BaseModel):
    """개별 자막 아이템"""
    id: int
    start: float  # 시작 시간 (초)
    end: float    # 종료 시간 (초)
    text: str
    selected: bool = False


class TimelineProject(BaseModel):
    """타임라인 프로젝트"""
    video_path: str
    subtitle_path: Optional[str] = None
    subtitles: List[SubtitleItem] = []


class EditRequest(BaseModel):
    """편집 요청"""
    video_path: str
    selected_ids: List[int]  # 유지할 자막 ID 리스트
    output_path: str
