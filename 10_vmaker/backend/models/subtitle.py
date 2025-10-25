from pydantic import BaseModel
from typing import List, Optional, Dict, Any


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


class FullProjectData(BaseModel):
    """전체 프로젝트 데이터 (render-full용)"""
    version: str = "1.0"
    currentVideoPath: str
    currentVideoFilename: Optional[str] = None
    currentAudioPath: Optional[str] = None
    currentAudioFilename: Optional[str] = None
    subtitles: List[Dict[str, Any]] = []
    gapBlocks: List[Dict[str, Any]] = []
    selectedIds: List[Any] = []  # 정수와 문자열 모두 허용
    subtitleEffects: Optional[Dict[str, Any]] = None
    videoTitleSettings: Optional[Dict[str, Any]] = None
    letterboxSettings: Optional[Dict[str, Any]] = None
    coverBoxSettings: Optional[Dict[str, Any]] = None
    videoEffects: Optional[Dict[str, Any]] = None
    imageOverlays: List[Dict[str, Any]] = []
    audioSettings: Optional[Dict[str, Any]] = None
    currentAspectRatio: str = "youtube"
    currentVideoSize: int = 50
