"""Assemble story chapters from generated components."""
from __future__ import annotations

from typing import Iterable

from keywordimagestory.models import StoryChapter
from keywordimagestory.prompts import TRANSITION_TEMPLATE

from .base import BaseGenerator


class StoryAssembler(BaseGenerator):
    """Combine titles, subtitles, and prompts into chapters."""

    def build_chapters(
        self,
        fragments: Iterable[tuple[str, str]],
    ) -> list[StoryChapter]:
        chapters: list[StoryChapter] = []
        for order, (source_id, text) in enumerate(fragments, start=1):
            chapters.append(
                StoryChapter(
                    order=order,
                    source_id=source_id,
                    text=text,
                )
            )
        return chapters

    def bridge(self, left_text: str, right_text: str) -> str:
        prompt = TRANSITION_TEMPLATE.format(left=left_text, right=right_text)
        return self.client.generate_structured(prompt, left_text + "\n" + right_text)
