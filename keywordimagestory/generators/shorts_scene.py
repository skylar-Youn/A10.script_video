"""Generate shorts script with cinematic scene prompts."""
from __future__ import annotations

import re
from typing import Tuple

from keywordimagestory.models import SubtitleSegment, VideoPrompt
from keywordimagestory.prompts import SHORTS_SCENE_TEMPLATE

from .base import BaseGenerator, GenerationContext


_SCENE_DESC_RE = re.compile(r"\[(?:씬|Scene)\s*(?P<tag>#?\d+)\]\s*(?P<desc>.+)")


class ShortsSceneGenerator(BaseGenerator):
    """Produce script segments and cinematic prompts."""

    def generate(self, context: GenerationContext) -> Tuple[list[SubtitleSegment], list[VideoPrompt]]:
        self._ensure_keyword(context)
        prompt = SHORTS_SCENE_TEMPLATE.format(keyword=context.keyword)
        raw = self.client.generate_structured(prompt, context.keyword)
        subtitles: list[SubtitleSegment] = []
        video_prompts: list[VideoPrompt] = []
        for idx, match in enumerate(_SCENE_DESC_RE.finditer(raw), start=1):
            scene_tag = match.group("tag").replace("#", "")
            description = match.group("desc").strip()
            start_time = (idx - 1) * 6.0
            end_time = idx * 6.0
            subtitles.append(
                SubtitleSegment(
                    index=idx,
                    start=start_time,
                    end=end_time,
                    text=re.sub(r"\[(?:씬|Scene).*?\]", "", description).strip(),
                    scene_tag=f"씬 {scene_tag}",
                )
            )
            video_prompts.append(
                VideoPrompt(
                    scene_tag=f"씬 {scene_tag}",
                    camera="미디엄 샷",
                    action=description,
                    mood="드라마틱",
                    start=start_time,
                    end=end_time,
                )
            )
        return subtitles, video_prompts
