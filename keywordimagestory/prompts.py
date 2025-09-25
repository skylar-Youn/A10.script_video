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

VIDEO_TITLE_TEMPLATE = PromptTemplate(
    name="video_titles",
    description="Generate story titles from video context",
    template=(
        "당신은 창의적인 영상 콘텐츠 제목 전문가입니다.\n"
        "아래 영상 정보를 분석하여 흡입력 있는 쇼츠/영상 제목 {count}개를 만들어 주세요.\n"
        "조건:\n"
        "- 각 제목은 10~20자 이내\n"
        "- 다양한 장르/무드 반영 (스릴러, 드라마, 코미디, SF 등)\n"
        "- 긴장감·반전·호기심 유발 요소를 적절히 섞기\n"
        "- 중복 없이 {count}개 생성\n"
        "- 번호 매기기 형식으로 출력\n\n"
        "영상 핵심 정보:\n{video_context}\n\n"
        "관련 키워드: {keyword}\n"
    ),
)

IMAGE_STORY_TEMPLATE = PromptTemplate(
    name="image_story",
    description="Generate paired titles and image prompts from an uploaded image",
    template=(
        "당신은 영상·이미지 크리에이티브 디렉터입니다.\n"
        "입력된 이미지 정보를 바탕으로 서로 다른 스토리 콘셉트를 {count}개 작성하세요.\n"
        "출력 형식은 JSON 배열입니다. 각 항목은 다음 형식을 따릅니다:\n"
        '{"index": 1, "title": "창의적인 짧은 제목", "description": "씬에 대한 생생한 이미지 묘사"}\n\n'
        "제약 조건:\n"
        "- 제목은 10~18자 이내, 서로 다른 장르·무드·사건을 반영\n"
        "- 이미지 묘사는 2문장 이내로 색감·구도·인물/사물 행동을 구체적으로 표현\n"
        "- 배열 인덱스는 1부터 시작하여 순차적으로 증가\n\n"
        "이미지 기반 정보:\n{context}\n\n"
        "관련 키워드: {keyword}\n"
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
    "VIDEO_TITLE_TEMPLATE",
    "IMAGE_STORY_TEMPLATE",
    "SHORTS_SCRIPT_TEMPLATE",
    "SHORTS_SCENE_TEMPLATE",
    "TRANSITION_TEMPLATE",
]
