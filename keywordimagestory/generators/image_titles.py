"""Generate story titles from image descriptions."""
from __future__ import annotations

from keywordimagestory.models import TitleItem
from keywordimagestory.prompts import IMAGE_TITLE_TEMPLATE

from .base import BaseGenerator, GenerationContext


class ImageTitleGenerator(BaseGenerator):
    """Create titles using an image description."""

    def generate(self, description: str, context: GenerationContext, count: int = 30) -> list[TitleItem]:
        if not description:
            raise ValueError("Image description is required")
        prompt = IMAGE_TITLE_TEMPLATE.format(description=description, count=count)
        titles = self.client.generate_list(prompt, count=count)
        return [
            TitleItem(index=i + 1, text=title, source="image")
            for i, title in enumerate(titles)
        ]
