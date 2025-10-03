"""Translator project models."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

DEFAULT_SEGMENT_MAX = 45.0


class TranslatorSegment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    clip_index: int
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    source_text: Optional[str] = None
    translated_text: Optional[str] = None
    reverse_translated_text: Optional[str] = None
    speaker_name: Optional[str] = None  # 화자 이름
    commentary: Optional[str] = None  # 해설 텍스트 (호환성용)
    commentary_korean: Optional[str] = None  # 해설 한국어
    commentary_japanese: Optional[str] = None  # 해설 일본어
    commentary_reverse_korean: Optional[str] = None  # 해설 역번역 한국어
    audio_path: Optional[str] = None
    audio_duration: Optional[float] = None
    audio_generated_duration: Optional[float] = None


class TranslatorProject(BaseModel):
    id: str
    base_name: str
    source_video: str
    source_subtitle: Optional[str] = None
    source_origin: Literal["youtube", "upload"] = "youtube"
    target_lang: Literal["ko", "en", "ja"]
    translation_mode: Literal["literal", "adaptive", "reinterpret"] = "adaptive"
    tone_hint: Optional[str] = None
    prompt_hint: Optional[str] = None
    fps: Optional[int] = None
    voice: Optional[str] = None
    voice_synthesis_mode: Literal["subtitle", "commentary", "both"] = "subtitle"  # 음성 합성 대상
    music_track: Optional[str] = None
    duration: Optional[float] = None
    segment_max_duration: float = DEFAULT_SEGMENT_MAX
    status: Literal[
        "draft",
        "segmenting",
        "translating",
        "voice_ready",
        "voice_complete",
        "rendering",
        "rendered",
        "failed",
    ] = "segmenting"
    segments: List[TranslatorSegment] = Field(default_factory=list)
    metadata_path: str
    created_at: datetime
    updated_at: datetime
    extra: Dict[str, Any] = Field(default_factory=dict)

    def completed_steps(self) -> int:
        status_order = {
            "draft": 1,
            "segmenting": 1,
            "translating": 2,
            "voice_ready": 3,
            "voice_complete": 4,
            "rendering": 4,
            "rendered": 5,
            "failed": 1,
        }
        return status_order.get(self.status, 1)


class TranslatorProjectCreate(BaseModel):
    source_video: str
    source_subtitle: Optional[str] = None
    source_origin: Literal["youtube", "upload"] = "youtube"
    target_lang: Literal["ko", "en", "ja"]
    translation_mode: Literal["literal", "adaptive", "reinterpret"] = "adaptive"
    tone_hint: Optional[str] = None
    prompt_hint: Optional[str] = None
    fps: Optional[int] = None
    voice: Optional[str] = None
    music_track: Optional[str] = None
    duration: Optional[float] = None
    segment_max_duration: Optional[float] = None


class TranslatorProjectUpdate(BaseModel):
    translation_mode: Optional[Literal["literal", "adaptive", "reinterpret"]] = None
    tone_hint: Optional[str] = None
    prompt_hint: Optional[str] = None
    fps: Optional[int] = None
    voice: Optional[str] = None
    music_track: Optional[str] = None
    voice_synthesis_mode: Optional[Literal["subtitle", "commentary", "both"]] = None
    segment_max_duration: Optional[float] = None


class TranslatorSegmentUpdate(BaseModel):
    start: Optional[float] = None
    end: Optional[float] = None
    source_text: Optional[str] = None
    translated_text: Optional[str] = None
    reverse_translated_text: Optional[str] = None
    speaker_name: Optional[str] = None
    commentary: Optional[str] = None
    commentary_korean: Optional[str] = None
    commentary_japanese: Optional[str] = None
    commentary_reverse_korean: Optional[str] = None
