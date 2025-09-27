"""Generate shorts script with cinematic scene prompts."""
from __future__ import annotations

import re
from typing import Tuple

from keywordimagestory.models import SubtitleSegment, VideoPrompt
from keywordimagestory.prompts import SHORTS_SCENE_TEMPLATE

from .base import BaseGenerator, GenerationContext


_SRT_BLOCK_RE = re.compile(
    r"(?P<index>\d+)\s*\n"  # index on its own line
    r"(?P<start>\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(?P<end>\d{2}:\d{2}:\d{2},\d{3})\s*\n"  # timing on its own line
    r"(?P<text>.*?)(?=\n\s*\n|\n\s*\d+\s*\n|\Z)",  # text until next subtitle or end
    re.DOTALL | re.MULTILINE,
)

_TIME_RE = re.compile(r"(?P<h>\d{2}):(?P<m>\d{2}):(?P<s>\d{2}),(?P<ms>\d{3})")


class ShortsSceneGenerator(BaseGenerator):
    """Produce script segments and cinematic prompts."""

    def generate(self, context: GenerationContext) -> Tuple[list[SubtitleSegment], list[VideoPrompt]]:
        self._ensure_keyword(context)
        prompt = SHORTS_SCENE_TEMPLATE.format(keyword=context.keyword)
        raw = self.client.generate_structured(prompt, context.keyword)

        # Debug logging
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"OpenAI raw response for keyword '{context.keyword}': {raw[:500]}...")

        subtitles = self._parse_srt(raw)
        video_prompts = self._parse_scenes(raw, subtitles)

        logger.info(f"Parsed {len(subtitles)} subtitles and {len(video_prompts)} video prompts")

        return subtitles, video_prompts

    # ------------------------------------------------------------------
    def _parse_time(self, value: str) -> float:
        import logging
        logger = logging.getLogger(__name__)

        match = _TIME_RE.match(value.strip())
        if not match:
            logger.warning(f"Time parsing failed for '{value}' - regex didn't match")
            return 0.0
        hours = int(match.group("h"))
        minutes = int(match.group("m"))
        seconds = int(match.group("s"))
        millis = int(match.group("ms"))
        result = hours * 3600 + minutes * 60 + seconds + millis / 1000
        logger.info(f"Parsed time '{value}' -> {result} seconds")
        return result

    def _parse_srt(self, raw: str) -> list[SubtitleSegment]:
        import logging
        logger = logging.getLogger(__name__)

        logger.info(f"Raw SRT content (first 1000 chars): {raw[:1000]}")

        subtitles: list[SubtitleSegment] = []
        matches = list(_SRT_BLOCK_RE.finditer(raw))
        logger.info(f"SRT regex found {len(matches)} matches")

        for i, match in enumerate(matches):
            idx = int(match.group("index"))
            start_str = match.group("start")
            end_str = match.group("end")
            start = self._parse_time(start_str)
            end = self._parse_time(end_str)
            text = match.group("text").strip()

            logger.info(f"Match {i+1}: idx={idx}, start_str='{start_str}', end_str='{end_str}', start={start}, end={end}")

            # Remove extra whitespace and newlines from text
            text = " ".join(text.split())
            scene_tag = "default"
            scene_match = re.search(r"\[(씬|Scene)\s*(?P<tag>#?\d+)\]", text)
            if scene_match:
                scene_tag = scene_match.group("tag").replace("#", "")
                text = text.replace(scene_match.group(0), "").strip()
            subtitles.append(
                SubtitleSegment(
                    index=idx,
                    start=start,
                    end=end,
                    text=text,
                    scene_tag=f"씬 {scene_tag}",
                )
            )

        # Fallback: if no proper SRT found, create segments from raw text
        if not subtitles:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning("No SRT format found, creating fallback segments")

            lines = raw.split('\n')
            current_time = 0.0
            segment_duration = 6.0  # 6 seconds per scene for video prompts

            for i, line in enumerate(lines):
                line = line.strip()
                if line and not line.startswith('[') and not line.startswith('#'):
                    subtitles.append(
                        SubtitleSegment(
                            index=i + 1,
                            start=current_time,
                            end=current_time + segment_duration,
                            text=line,
                            scene_tag=f"씬 {i + 1}",
                        )
                    )
                    current_time += segment_duration
                    if len(subtitles) >= 10:  # Limit to 10 segments for 60 seconds
                        break

        return subtitles

    def _parse_scenes(self, raw: str, subtitles: list[SubtitleSegment]) -> list[VideoPrompt]:
        scene_section = []
        if "[씬" in raw or "[Scene" in raw:
            # Extract scene descriptions that appear after the SRT format
            parts = re.split(r"\[(씬|Scene)", raw)
            if len(parts) > 1:
                scene_section = parts[1:]

        prompts: list[VideoPrompt] = []
        for idx, chunk in enumerate(scene_section):
            tag_match = re.match(r"\s*(?P<tag>\d+)\]\s*(?P<desc>.+)", chunk.strip())
            if not tag_match:
                continue
            start, end = self._subtitle_window(subtitles, idx)
            prompts.append(
                VideoPrompt(
                    scene_tag=f"씬 {tag_match.group('tag')}",
                    camera="미디엄 샷",
                    action=tag_match.group("desc").strip(),
                    mood="드라마틱",
                    start=start,
                    end=end,
                )
            )
        return prompts

    def _subtitle_window(self, subtitles: list[SubtitleSegment], index: int) -> Tuple[float, float]:
        if not subtitles:
            slot = 6.0  # 6 seconds per scene for video prompts
            return index * slot, (index + 1) * slot
        wrapped_index = index if index < len(subtitles) else len(subtitles) - 1
        segment = subtitles[max(0, wrapped_index)]
        return segment.start, segment.end
