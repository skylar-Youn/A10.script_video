"""CLI entrypoint for the Keyword Image Story workflow."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from keywordimagestory.config import settings
from keywordimagestory.generators import (
    GenerationContext,
    ImageTitleGenerator,
    KeywordTitleGenerator,
    ShortsSceneGenerator,
    ShortsScriptGenerator,
)
from keywordimagestory.services import editor_service


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Keyword based story generator")
    parser.add_argument("--keyword", required=True, help="Story keyword")
    parser.add_argument("--language", default=settings.default_language)
    parser.add_argument("--image-description", help="Optional image description for title generation")
    parser.add_argument("--duration", type=int, default=settings.default_story_duration)
    parser.add_argument("--output", type=Path, help="Optional path to write JSON summary")
    parser.add_argument("--skip-scenes", action="store_true", help="Skip cinematic scene prompt generation")
    parser.add_argument("--skip-images", action="store_true", help="Skip image prompt generation")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    context = GenerationContext(keyword=args.keyword, language=args.language, duration=args.duration)

    project = editor_service.create_project(args.keyword, args.language)

    titles = KeywordTitleGenerator().generate(context)
    editor_service.set_titles(project.project_id, titles)

    if args.image_description and not args.skip_images:
        image_titles = ImageTitleGenerator().generate(args.image_description, context)
        editor_service.set_titles(project.project_id, titles + image_titles)

    script_subtitles, image_prompts = ShortsScriptGenerator().generate(context)
    editor_service.set_subtitles(project.project_id, script_subtitles)
    if not args.skip_images:
        editor_service.set_image_prompts(project.project_id, image_prompts)

    video_prompts = []
    if not args.skip_scenes:
        scene_subtitles, video_prompts = ShortsSceneGenerator().generate(context)
        # merge subtitles by extending existing list
        editor_service.set_subtitles(project.project_id, script_subtitles + scene_subtitles)
        editor_service.set_video_prompts(project.project_id, video_prompts)

    fragments: list[tuple[str, str]] = []
    for segment in script_subtitles:
        fragments.append((f"subtitle-{segment.index}", segment.text))
    project = editor_service.build_chapters_from_fragments(project.project_id, fragments)

    exports = editor_service.export_project(project.project_id)

    summary: dict[str, Any] = {
        "project_id": project.project_id,
        "keyword": project.keyword,
        "titles": [title.text for title in project.titles],
        "subtitles": [segment.dict() for segment in project.subtitles],
        "image_prompts": [prompt.dict() for prompt in project.image_prompts],
        "video_prompts": [prompt.dict() for prompt in video_prompts],
        "exports": exports,
    }

    if args.output:
        args.output.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    else:
        print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
