"""Generate story titles from video context."""
from __future__ import annotations

import textwrap

from keywordimagestory.models import TitleItem
from keywordimagestory.prompts import VIDEO_TITLE_TEMPLATE

from .base import BaseGenerator, GenerationContext


class ImageTitleGenerator(BaseGenerator):
    """Create titles using video metadata, transcript, or description."""

    def generate(
        self,
        description: str | None,
        context: GenerationContext,
        count: int = 30,
        *,
        video_url: str | None = None,
        transcript: str | None = None,
    ) -> list[TitleItem]:
        if not (description or transcript or video_url):
            raise ValueError("영상 정보(설명, URL, 대사 등)를 최소 한 개 이상 입력해야 합니다.")

        details: list[str] = []
        if video_url:
            details.append(f"- 영상 URL: {video_url}")
        if description:
            summary = description.strip()
            if summary:
                details.append(f"- 주요 장면 요약: {summary}")
        if transcript:
            cleaned_transcript = transcript.strip()
            if cleaned_transcript:
                trimmed = textwrap.shorten(cleaned_transcript, width=600, placeholder="…")
                details.append(f"- 핵심 대사/내레이션: {trimmed}")

        if not details:
            raise ValueError("영상 정보를 파악할 수 없습니다. 설명이나 대사를 입력해 주세요.")

        video_context = "\n".join(details)
        prompt = VIDEO_TITLE_TEMPLATE.format(
            video_context=video_context,
            keyword=context.keyword,
            count=count,
        )
        titles = self.client.generate_list(prompt, count=count)
        return [
            TitleItem(index=i + 1, text=title, source="image")
            for i, title in enumerate(titles)
        ]
