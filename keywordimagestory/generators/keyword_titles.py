"""Generate story titles from keywords."""
from __future__ import annotations

from keywordimagestory.models import TitleItem
from keywordimagestory.prompts import KEYWORD_TITLE_TEMPLATE

from .base import BaseGenerator, GenerationContext


class KeywordTitleGenerator(BaseGenerator):
    """Create short creative titles based on a keyword."""

    def generate(self, context: GenerationContext, count: int = 30) -> list[TitleItem]:
        self._ensure_keyword(context)
        prompt = KEYWORD_TITLE_TEMPLATE.format(keyword=context.keyword, count=count)
        titles = self.client.generate_list(prompt, count=count)
        return [
            TitleItem(index=i + 1, text=title, source="keyword")
            for i, title in enumerate(titles)
        ]
