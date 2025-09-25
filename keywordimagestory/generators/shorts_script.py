"""Generate shorts subtitles and linked image prompts."""
from __future__ import annotations

import re
from typing import Tuple

from keywordimagestory.models import ImagePrompt, SubtitleSegment
from keywordimagestory.prompts import SHORTS_SCRIPT_TEMPLATE

from .base import BaseGenerator, GenerationContext


_SRT_BLOCK_RE = re.compile(
    r"(?P<index>\d+)\s+"  # index
    r"(?P<start>\d{2}:\d{2}:\d{2},\d{3})\s-->\s(?P<end>\d{2}:\d{2}:\d{2},\d{3})\s+"  # timing
    r"(?P<text>.+?)",  # text
    re.DOTALL,
)

_TIME_RE = re.compile(r"(?P<h>\d{2}):(?P<m>\d{2}):(?P<s>\d{2}),(?P<ms>\d{3})")


class ShortsScriptGenerator(BaseGenerator):
    """Create SRT subtitles and image descriptions."""

    def generate(self, context: GenerationContext) -> Tuple[list[SubtitleSegment], list[ImagePrompt]]:
        self._ensure_keyword(context)
        prompt = SHORTS_SCRIPT_TEMPLATE.format(keyword=context.keyword)
        raw = self.client.generate_structured(prompt, context.keyword)
        subtitles = self._parse_srt(raw)
        images = self._parse_images(raw, subtitles)
        return subtitles, images

    # ------------------------------------------------------------------
    def _parse_time(self, value: str) -> float:
        match = _TIME_RE.match(value.strip())
        if not match:
            return 0.0
        hours = int(match.group("h"))
        minutes = int(match.group("m"))
        seconds = int(match.group("s"))
        millis = int(match.group("ms"))
        return hours * 3600 + minutes * 60 + seconds + millis / 1000

    def _parse_srt(self, raw: str) -> list[SubtitleSegment]:
        subtitles: list[SubtitleSegment] = []
        for match in _SRT_BLOCK_RE.finditer(raw):
            idx = int(match.group("index"))
            start = self._parse_time(match.group("start"))
            end = self._parse_time(match.group("end"))
            text = match.group("text").strip()
            scene_tag = "default"
            scene_match = re.search(r"\[(이미지|씬)\s*(?P<tag>#?\d+)\]", text)
            if scene_match:
                scene_tag = scene_match.group("tag").replace("#", "")
                text = text.replace(scene_match.group(0), "").strip()
            subtitles.append(
                SubtitleSegment(
                    index=idx,
                    start=start,
                    end=end,
                    text=text,
                    scene_tag=f"이미지 {scene_tag}",
                )
            )
        if not subtitles:
            for i in range(6):
                subtitles.append(
                    SubtitleSegment(
                        index=i + 1,
                        start=i * 10,
                        end=(i + 1) * 10,
                        text=f"Mock subtitle {i + 1} for {raw[:30]}",
                        scene_tag=f"이미지 {i + 1}",
                    )
                )
        return subtitles

    def _parse_images(self, raw: str, subtitles: list[SubtitleSegment]) -> list[ImagePrompt]:
        image_section = []
        if "[이미지" in raw:
            parts = raw.split("[이미지")
            if len(parts) > 1:
                image_section = parts[1:]
        prompts: list[ImagePrompt] = []
        for idx, chunk in enumerate(image_section):
            tag_match = re.match(r"\s*(?P<tag>\d+)\]\s*(?P<desc>.+)", chunk.strip())
            if not tag_match:
                continue
            start, end = self._subtitle_window(subtitles, idx)
            prompts.append(
                ImagePrompt(
                    tag=f"이미지 {tag_match.group('tag')}",
                    description=tag_match.group("desc").strip(),
                    start=start,
                    end=end,
                )
            )
        if not prompts:
            for i in range(max(len(subtitles), 1)):
                start, end = self._subtitle_window(subtitles, i)
                prompts.append(
                    ImagePrompt(
                        tag=f"이미지 {i+1}",
                        description="Mock image description",
                        start=start,
                        end=end,
                    )
                )
        return prompts

    def _subtitle_window(self, subtitles: list[SubtitleSegment], index: int) -> Tuple[float, float]:
        if not subtitles:
            slot = 10.0
            return index * slot, (index + 1) * slot
        wrapped_index = index if index < len(subtitles) else len(subtitles) - 1
        segment = subtitles[max(0, wrapped_index)]
        return segment.start, segment.end
