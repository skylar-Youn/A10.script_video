"""Prompt templates derived from spec requirements."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PromptTemplate:
    name: str
    description: str
    template: str

    def format(self, **kwargs: str) -> str:
        return self.template.format(**kwargs)


KEYWORD_TITLE_TEMPLATE = PromptTemplate(
    name="keyword_titles",
    description="Generate diverse story titles based on a keyword",
    template=(
        "당신은 창의적인 스토리텔러입니다.\n"
        "사용자가 제시하는 \"스토리 키워드\"를 기반으로, 흥미로운 스토리 제목 {count}개를 생성하세요.\n"
        "요구사항:\n"
        "- 모든 제목은 10~20자 이내\n"
        "- 창의적이고 다양한 장르 믹스\n"
        "- 중복 없이 {count}개\n"
        "- 번호 매기기 형식으로 출력\n\n"
        "스토리 키워드: {keyword}\n"
    ),
)

IMAGE_TITLE_TEMPLATE = PromptTemplate(
    name="image_titles",
    description="Generate story titles from image description",
    template=(
        "당신은 창의적인 스토리텔러입니다.\n"
        "사용자가 올려준 유튜브 썸네일(이미지 설명)을 기반으로 스토리 제목 {count}개를 생성하세요.\n"
        "요구사항:\n"
        "- 제목 길이 10~20자\n"
        "- 장르 다양하게\n"
        "- 긴박감/코믹/반전 균형\n"
        "- 중복 없이 {count}개\n"
        "- 번호 매기기 형식\n\n"
        "이미지 설명: {description}\n"
    ),
)

SHORTS_SCRIPT_TEMPLATE = PromptTemplate(
    name="shorts_script",
    description="Create SRT subtitles and image descriptions for a 60-second short",
    template=(
        "입력받은 \"스토리 키워드\"를 바탕으로, 유튜브 Shorts용 자막과 이미지 장면 묘사를 생성하세요.\n"
        "- 60초 분량 SRT 자막 (6~10개 구간)\n"
        "- 각 대사 끝에 [이미지 #] 태그\n"
        "- 자막 작성 후 이미지 장면 묘사를 [이미지 #] 목록으로 제공\n"
        "스토리 키워드: {keyword}\n"
    ),
)

SHORTS_SCENE_TEMPLATE = PromptTemplate(
    name="shorts_scene",
    description="Generate short script with cinematic scene prompts",
    template=(
        "당신은 유튜브 Shorts 제작 어시스턴트입니다.\n"
        "입력받은 \"스토리 키워드\"를 기반으로 60초 분량 SRT 대본과 영상 장면 프롬프트를 생성하세요.\n"
        "- 5~10초 단위의 SRT\n"
        "- 각 대사 끝 [씬 #] 태그\n"
        "- 씬별 카메라 구도/분위기/동작 설명\n"
        "스토리 키워드: {keyword}\n"
    ),
)

TRANSITION_TEMPLATE = PromptTemplate(
    name="transition",
    description="Bridge between two story chapters",
    template=(
        "다음 두 스토리 조각을 자연스럽게 이어주는 짧은 내레이션을 1~2문장 작성하세요.\n"
        "조각 A: {left}\n"
        "조각 B: {right}\n"
    ),
)

__all__ = [
    "PromptTemplate",
    "KEYWORD_TITLE_TEMPLATE",
    "IMAGE_TITLE_TEMPLATE",
    "SHORTS_SCRIPT_TEMPLATE",
    "SHORTS_SCENE_TEMPLATE",
    "TRANSITION_TEMPLATE",
]
