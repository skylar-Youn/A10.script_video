"""Domain models for keyword-driven story creation."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, validator


class ProjectType(str, Enum):
    shorts = "shorts"
    translator = "translator"


class GenerationStatus(str, Enum):
    draft = "draft"
    editing = "editing"
    approved = "approved"
    regenerating = "regenerating"


class TitleItem(BaseModel):
    index: int
    text: str
    source: Literal["keyword", "image"]
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ImageStoryItem(BaseModel):
    index: int
    title: str
    description: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SubtitleSegment(BaseModel):
    index: int
    start: float
    end: float
    text: str
    scene_tag: str
    status: GenerationStatus = GenerationStatus.draft

    @validator("end")
    def _ensure_end_after_start(cls, value: float, values: dict[str, Any]) -> float:
        start = values.get("start", 0.0)
        if value < start:
            raise ValueError("Subtitle end must be greater than start")
        return value


class ImagePrompt(BaseModel):
    tag: str
    description: str
    start: float | None = None
    end: float | None = None
    status: GenerationStatus = GenerationStatus.draft

    @validator("end")
    def _validate_end(cls, value: float | None, values: dict[str, Any]) -> float | None:
        start = values.get("start")
        if value is not None and start is not None and value < start:
            raise ValueError("Image prompt end must be greater than start")
        return value


class VideoPrompt(BaseModel):
    scene_tag: str
    camera: str
    action: str
    mood: str
    start: float | None = None
    end: float | None = None
    status: GenerationStatus = GenerationStatus.draft

    @validator("end")
    def _validate_end(cls, value: float | None, values: dict[str, Any]) -> float | None:
        start = values.get("start")
        if value is not None and start is not None and value < start:
            raise ValueError("Video prompt end must be greater than start")
        return value


class StoryChapter(BaseModel):
    order: int
    source_id: str
    text: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class MediaEffect(BaseModel):
    effect_id: str
    name: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    start_time: float
    end_time: float


class TemplateSetting(BaseModel):
    template_id: str
    title_position: tuple[float, float]
    subtitle_position: tuple[float, float]
    title_style: dict[str, Any] = Field(default_factory=dict)
    subtitle_style: dict[str, Any] = Field(default_factory=dict)


class ProjectHistoryEntry(BaseModel):
    project_id: str
    version: int
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    summary: str
    payload_path: str


class StoryProject(BaseModel):
    project_id: str
    keyword: str
    language: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    duration: float = 60.0
    titles: list[TitleItem] = Field(default_factory=list)
    subtitles: list[SubtitleSegment] = Field(default_factory=list)
    image_prompts: list[ImagePrompt] = Field(default_factory=list)
    video_prompts: list[VideoPrompt] = Field(default_factory=list)
    chapters: list[StoryChapter] = Field(default_factory=list)
    applied_effects: list[MediaEffect] = Field(default_factory=list)
    template: TemplateSetting | None = None
    status: GenerationStatus = GenerationStatus.draft

    def update_timestamp(self) -> None:
        self.updated_at = datetime.utcnow()


@dataclass
class TimelineSelection:
    """Represents a selection in the dual timeline view."""

    subtitle_indices: list[int]
    audio_range: tuple[float, float] | None = None
    scene_indices: list[int] | None = None


class ToolType(str, Enum):
    story_keywords = "story_keywords"
    image_story = "image_story"
    shorts_script = "shorts_script"
    shorts_scenes = "shorts_scenes"

    @classmethod
    def _missing_(cls, value: object):  # type: ignore[override]
        if isinstance(value, str) and value == "video_titles":
            return cls.image_story
        return super()._missing_(value)


class ToolRecord(BaseModel):
    id: str
    tool: ToolType
    title: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    payload: dict[str, Any]


class ToolRecordCreate(BaseModel):
    title: str
    payload: dict[str, Any]
