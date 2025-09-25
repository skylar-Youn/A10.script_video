"""Generate paired titles and image descriptions from image context."""
from __future__ import annotations

import json
from typing import List

from keywordimagestory.models import ImageStoryItem
from keywordimagestory.prompts import IMAGE_STORY_TEMPLATE

from .base import BaseGenerator, GenerationContext


class ImageStoryGenerator(BaseGenerator):
    """Create creative titles and corresponding image scene prompts."""

    def generate(self, context: GenerationContext, context_text: str, count: int = 6) -> List[ImageStoryItem]:
        if not context.keyword:
            raise ValueError("keyword is required to generate image stories")
        prompt = IMAGE_STORY_TEMPLATE.format(keyword=context.keyword, count=count, context=context_text)
        raw = self.client.generate_structured(prompt, context_text)

        items: list[ImageStoryItem] = []
        try:
            parsed = json.loads(raw)
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
        except json.JSONDecodeError:
            # Fallback: create deterministic mock items when structured output is unavailable
            for idx in range(count):
                items.append(
                    ImageStoryItem(
                        index=idx + 1,
                        title=f"Mock 제목 {idx + 1}",
                        description=f"Mock 이미지 묘사 {idx + 1} for {context_text[:40]}",
                    )
                )

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
