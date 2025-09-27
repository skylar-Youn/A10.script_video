"""Generate paired titles and image descriptions from image context."""
from __future__ import annotations

import json
from typing import List

from keywordimagestory.models import ImageStoryItem
from keywordimagestory.prompts import IMAGE_STORY_TEMPLATE

from .base import BaseGenerator, GenerationContext


class ImageStoryGenerator(BaseGenerator):
    """Create creative titles and corresponding image scene prompts."""

    def generate(self, context: GenerationContext, context_text: str, count: int = 6, image_data: bytes | None = None) -> List[ImageStoryItem]:
        if not context.keyword:
            raise ValueError("keyword is required to generate image stories")

        # If image data is provided, analyze it first
        if image_data:
            image_analysis_prompt = (
                f"이미지를 분석하여 키워드 '{context.keyword}'와 연관된 "
                f"창의적인 제목 {count}개와 각각의 상세한 장면 묘사를 JSON 형식으로 생성해주세요.\n"
                f"각 항목은 다음 구조를 가져야 합니다:\n"
                f"[{{\n"
                f'  "index": 1,\n'
                f'  "title": "창의적인 제목 (10-20자)",\n'
                f'  "description": "상세한 장면 묘사 (30-50자)"\n'
                f"}}]\n"
                f"전체 {count}개 항목을 배열로 반환해주세요."
            )
            raw = self.client.analyze_image(image_data, image_analysis_prompt)
        else:
            # Use text-based generation
            prompt = IMAGE_STORY_TEMPLATE.format(keyword=context.keyword, count=count, context=context_text)
            # Create a structured prompt that asks for JSON output
            structured_prompt = (
                f"{prompt}\n\n"
                f"응답을 다음 JSON 형식으로 정확히 작성해주세요:\n"
                f"[\n"
                f"  {{\n"
                f'    "index": 1,\n'
                f'    "title": "제목1",\n'
                f'    "description": "묘사1"\n'
                f"  }},\n"
                f"  {{\n"
                f'    "index": 2,\n'
                f'    "title": "제목2",\n'
                f'    "description": "묘사2"\n'
                f"  }}\n"
                f"]\n"
                f"JSON 형식만 응답하고 다른 텍스트는 포함하지 마세요."
            )
            raw = self.client.generate_structured(structured_prompt, context_text)

        items: list[ImageStoryItem] = []

        # Try to extract JSON from response
        try:
            # Find JSON array in the response
            start_idx = raw.find('[')
            end_idx = raw.rfind(']') + 1
            if start_idx != -1 and end_idx != 0:
                json_str = raw[start_idx:end_idx]
                parsed = json.loads(json_str)

                if isinstance(parsed, list):
                    for entry in parsed:
                        try:
                            items.append(
                                ImageStoryItem(
                                    index=int(entry.get("index", len(items) + 1)),
                                    title=str(entry.get("title", "제목")),
                                    description=str(entry.get("description", "이미지 묘사")),
                                )
                            )
                        except Exception:  # pragma: no cover - robustness
                            continue
        except (json.JSONDecodeError, ValueError):
            # If JSON parsing fails, try to parse numbered list format
            lines = raw.split('\n')
            for line in lines:
                line = line.strip()
                if line and (line[0].isdigit() or line.startswith('-')):
                    # Remove numbering and parse
                    clean_line = line.lstrip('0123456789.-').strip()
                    if clean_line:
                        items.append(
                            ImageStoryItem(
                                index=len(items) + 1,
                                title=clean_line[:20] if len(clean_line) > 20 else clean_line,
                                description=f"이미지 기반 장면: {clean_line}",
                            )
                        )

        # If still no items, create fallback
        if not items:
            for idx in range(count):
                items.append(
                    ImageStoryItem(
                        index=idx + 1,
                        title=f"대체 제목 {idx + 1}",
                        description=f"대체 이미지 묘사 {idx + 1} ({context.keyword})",
                    )
                )
        return items[:count]
