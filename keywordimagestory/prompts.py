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
        "사용자가 제시하는 \"스토리 키워드\"를 기반으로, 흥미로운 스토리 제목 {count}개를 생성하세요.\n\n"
        "요구사항:\n"
        "- 모든 제목은 10~20자 이내\n"
        "- 창의적이고 다양하게 (판타지, 미스터리, 로맨스, SF 등 여러 장르 혼합)\n"
        "- 중복 없이 {count}개\n"
        "- 목록 형식으로 출력\n\n"
        "예시 입력:\n"
        "제시어: \"달빛 여행\"\n\n"
        "예시 출력:\n"
        "1. 달빛 속의 비밀 여행\n"
        "2. 그림자와 달빛의 동행\n"
        "3. 달빛을 삼킨 바다\n"
        "4. 시간의 문을 연 달빛\n"
        "5. 별빛과 달빛의 약속\n"
        "... (총 {count}개)\n\n"
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
        "당신은 창의적인 스토리텔러입니다.\n"
        "사용자가 올려준 유튜브 썸네일(이미지 설명)을 기반으로 스토리 제목 {count}개를 생성하세요.\n\n"
        "요구사항:\n"
        "- 모든 제목은 10~20자 이내\n"
        "- 장르 다양하게 (스릴러, 코미디, 드라마, SF, 미스터리 등)\n"
        "- 긴박감·코믹함·반전 요소를 골고루 반영\n"
        "- 중복 없이 {count}개\n"
        "- 번호 매기기 형식으로 출력\n\n"
        "예시 입력(이미지 설명):\n"
        "\"시뮬레이션 게임 속 도로에서 빨간 밴이 충돌하는 장면\"\n\n"
        "예시 출력:\n"
        "1. 충돌의 순간, 멈춘 시간\n"
        "2. 도로 위의 마지막 선택\n"
        "3. 빨간 밴의 미스터리\n"
        "4. 게임 속 현실, 운명의 충돌\n"
        "5. 도망친 그림자, 남은 파편\n"
        "6. 전광석화의 블랙박스\n"
        "7. 충돌 뒤에 숨겨진 비밀\n"
        "8. 마지막 도로, 사라진 동승자\n"
        "... (총 {count}개)\n\n"
        "이미지 기반 정보:\n{context}\n\n"
        "관련 키워드: {keyword}\n"
    ),
)

SHORTS_SCRIPT_TEMPLATE = PromptTemplate(
    name="shorts_script",
    description="Create SRT subtitles and image descriptions for a 60-second short",
    template=(
        "입력받은 \"스토리 키워드\"를 바탕으로, 아래 기준에 따라 유튜브 Shorts용 60초 분량의 자막과 이미지 장면 묘사를 생성하세요.\n\n"
        "### 출력 규칙\n\n"
        "1. 60초 분량 자막을 **SRT 형식**으로 작성하세요.\n"
        "    - 각 자막 항목은 다음 요소를 포함해야 합니다:\n"
        "        - 자막 번호\n"
        "        - 타임스탬프 (형식: 00:00:00,000 --> 00:00:05,000)\n"
        "        - 대사(내레이션 또는 인물 대사)\n"
        "    - 각 대사 마지막에 반드시 [이미지 #] 태그를 붙여 해당 장면에 들어갈 이미지를 명확하게 지정하세요.\n"
        "    - 전체 길이가 약 60초가 되도록, 6~10개의 자막으로 구성하세요.\n\n"
        "2. **이미지 장면 묘사**를 모두 작성한 후, 마지막에 구분하여 정리하세요.\n"
        "    - 각 이미지 번호([이미지 1]~[이미지 N])별로 1~2문장으로 구체적으로 묘사하세요.\n"
        "    - 색감, 배경, 인물/사물의 액션, 상황 분위기를 최대한 생생하게 표현하세요.\n\n"
        "### 단계별 지침\n\n"
        "- 먼저, 스토리 키워드를 바탕으로 60초 분량의 흐름 있는 스토리를 구성하세요.\n"
        "- 각 장면과 대사가 자연스럽게 연결되도록 구성합니다.\n"
        "- 자막마다 시각적으로 뚜렷한 장면이 그려질 수 있도록 대사 끝에 [이미지 #] 태그를 정확히 붙이세요.\n"
        "- 이미지 장면 묘사에서는 대사의 시각적 상징성, 분위기, 주요 인물·상황·배경을 충실하게 전달하세요.\n\n"
        "# 출력 형식 예시\n\n"
        "1\n"
        "00:00:00,000 --> 00:00:05,000\n"
        "첫 번째 대사입니다. [이미지 1]\n\n"
        "2\n"
        "00:00:05,000 --> 00:00:10,000\n"
        "두 번째 대사입니다. [이미지 2]\n\n"
        "3\n"
        "00:00:10,000 --> 00:00:15,000\n"
        "세 번째 대사입니다. [이미지 3]\n\n"
        "[이미지 장면 묘사]\n"
        "[이미지 1] 첫 번째 장면에 대한 구체적인 묘사\n"
        "[이미지 2] 두 번째 장면에 대한 구체적인 묘사\n"
        "[이미지 3] 세 번째 장면에 대한 구체적인 묘사\n\n"
        "위와 같은 정확한 형식으로 출력하세요.\n\n"
        "스토리 키워드: {keyword}\n"
    ),
)

SHORTS_SCENE_TEMPLATE = PromptTemplate(
    name="shorts_scene",
    description="Generate short script with cinematic scene prompts",
    template=(
        "당신은 유튜브 Shorts 제작 어시스턴트입니다.\n"
        "입력받은 \"스토리 키워드\"를 기반으로 **60초 분량 대본**과 **영상 장면 프롬프트**를 생성하세요.\n\n"
        "### 출력 규칙\n\n"
        "#### 1. 쇼츠 대본 (SRT 형식)\n"
        "- 전체 길이: 60초 이내\n"
        "- 구간: 5~10초 단위로 나눔\n"
        "- 형식:\n"
        "  번호\n"
        "  타임스탬프 (00:00:00,000 --> 00:00:05,000)\n"
        "  대사 (내레이션/대화/효과음)\n"
        "- 각 대사 끝에는 [씬 #] 태그 붙이기 (영상 장면과 연결)\n\n"
        "#### 2. 영상 장면 프롬프트\n"
        "- 각 [씬 #]마다 카메라 구도, 분위기, 동작을 1~2문장으로 묘사\n"
        "- 영상 제작/AI 비디오 생성 도구에서 그대로 활용할 수 있도록 시각적 표현 위주로 작성\n\n"
        "---\n\n"
        "### 예시 출력\n"
        "**[쇼츠 대본 - SRT]**\n"
        "1 00:00:00,000 --> 00:00:05,000 내레이션: 평범한 도로 위, 빨간 밴이 목적지를 향해 달린다. [씬 1]\n"
        "2 00:00:06,000 --> 00:00:12,000 운전자(놀람): 브레이크가 말을 안 들어! [씬 2]\n"
        "3 00:00:13,000 --> 00:00:20,000 내레이션: 속도는 점점 빨라지고, 공포는 커져만 간다. [씬 2]\n"
        "4 00:00:21,000 --> 00:00:30,000 효과음: 쾅! 내레이션: 그 순간, 충돌이 일어났다. [씬 3]\n"
        "5 00:00:31,000 --> 00:00:40,000 내레이션: 하지만 사고 뒤에 나타난 것은 상상조차 못한 광경이었다. [씬 4]\n"
        "6 00:00:41,000 --> 00:01:00,000 내레이션: 빨간 밴의 여정은 이제 시작이었다. [씬 5]\n\n"
        "---\n\n"
        "**[영상 장면 프롬프트]**\n"
        "- [씬 1] 드론 뷰, 햇살이 비치는 고속도로 위를 달리는 빨간 밴. 배경은 푸른 하늘과 곡선 도로.\n"
        "- [씬 2] 운전석 내부 클로즈업, 놀란 운전자가 브레이크를 밟지만 차가 멈추지 않는 장면.\n"
        "- [씬 3] 슬로우모션, 다른 차량과 충돌하는 순간 흰 연기와 파편이 공중에 흩날리는 장면.\n"
        "- [씬 4] 충돌 직후 정적, 도로 위에 멈춰 선 빨간 밴 뒤편에서 신비로운 빛이 퍼져 나옴.\n"
        "- [씬 5] 황량한 도로 위에 홀로 남은 빨간 밴, 카메라가 뒤에서 앞으로 천천히 줌인하며 어두워지는 화면.\n\n"
        "스토리 키워드: {keyword}\n"
    ),
)

SHORTS_SCRIPT_ENGLISH_PROMPT_TEMPLATE = PromptTemplate(
    name="shorts_script_prompt_en",
    description="English ChatGPT prompt for Shorts script generation",
    template=(
        "Using the story keyword \"{keyword}\", generate a 60-second YouTube Shorts script with SRT subtitles and matching image prompts written in {language_label}.\n\n"
        "### Output Requirements\n\n"
        "1. Write subtitles in full SRT format with index, timestamps (00:00:00,000 --> 00:00:05,000), and dialogue or narration.\n"
        "   - Append a matching [Image #] tag to the end of each subtitle line.\n"
        "   - Provide 6-10 subtitles so the overall runtime stays close to 60 seconds.\n\n"
        "2. After the subtitles, list cinematic image descriptions.\n"
        "   - Use the same [Image #] identifiers referenced in the SRT section.\n"
        "   - For each image, describe mood, lighting, setting, characters or objects, and key motion in 1-2 vivid sentences.\n\n"
        "# Output Format\n\n"
        "**[SRT Subtitles]**\n"
        "1\n"
        "00:00:00,000 --> 00:00:05,000\n"
        "Dialogue... [Image 1]\n\n"
        "2\n"
        "00:00:05,000 --> 00:00:10,000\n"
        "Dialogue... [Image 2]\n\n"
        "...\n\n"
        "**[Image Descriptions]**\n"
        "- [Image 1] ...\n"
        "- [Image 2] ...\n"
        "- ...\n\n"
        "Story keyword: \"{keyword}\"\n"
        "Write every line in {language_label}."
    ),
)

SHORTS_SCENE_ENGLISH_PROMPT_TEMPLATE = PromptTemplate(
    name="shorts_scene_prompt_en",
    description="English ChatGPT prompt for Shorts scene generation",
    template=(
        "Using the story keyword \"{keyword}\", craft a 60-second YouTube Shorts scene script with camera and production directions written in {language_label}.\n\n"
        "### Output Requirements\n\n"
        "1. Write the script as sequential scenes. Each scene must include:\n"
        "   - [Scene #] tag\n"
        "   - Timestamp (00:00:00,000 --> 00:00:05,000)\n"
        "   - Dialogue or narration\n"
        "   - Camera motion and filming instructions\n"
        "   Compose 6-10 scenes so the total runtime stays near 60 seconds.\n\n"
        "2. Provide detailed filming directions for each scene:\n"
        "   - Camera angle (close-up, wide shot, medium shot, etc.)\n"
        "   - Camera movement (pan, tilt, dolly, zoom, tracking, etc.)\n"
        "   - Lighting and color tone\n"
        "   - Background elements and props\n"
        "   - Character or object actions and expressions\n\n"
        "# Output Format\n\n"
        "**[Video Scene Script]**\n\n"
        "[Scene 1] 00:00:00,000 --> 00:00:06,000\n"
        "Dialogue: ...\n"
        "Camera: ...\n\n"
        "[Scene 2] 00:00:06,000 --> 00:00:12,000\n"
        "Dialogue: ...\n"
        "Camera: ...\n\n"
        "...\n\n"
        "**[Filming Directions]**\n"
        "- [Scene 1] Detailed angle, lighting, mood, action notes\n"
        "- [Scene 2] Detailed angle, lighting, mood, action notes\n"
        "- ...\n\n"
        "Story keyword: \"{keyword}\"\n"
        "Write every line in {language_label}."
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
