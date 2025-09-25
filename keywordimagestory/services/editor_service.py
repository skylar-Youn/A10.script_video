"""Editor operations for story projects."""
from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any, Iterable, Sequence

from keywordimagestory.config import settings
from keywordimagestory.generators.story_assembler import StoryAssembler
from keywordimagestory.models import (
    ImagePrompt,
    MediaEffect,
    ProjectHistoryEntry,
    StoryProject,
    SubtitleSegment,
    TemplateSetting,
    TitleItem,
    VideoPrompt,
)
from keywordimagestory.services import history_service, save_manager

_PROJECT_CACHE: dict[str, StoryProject] = {}
_PROJECT_PATH = settings.outputs_dir / "projects"

assembler = StoryAssembler()


def _project_file(project_id: str) -> Path:
    _PROJECT_PATH.mkdir(parents=True, exist_ok=True)
    return _PROJECT_PATH / f"{project_id}.json"


def _persist(project: StoryProject) -> None:
    project.update_timestamp()
    data = json.loads(project.json())
    _project_file(project.project_id).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _load_from_disk(project_id: str) -> StoryProject | None:
    path = _project_file(project_id)
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    return StoryProject.parse_obj(data)


def _get_project(project_id: str) -> StoryProject:
    if project_id in _PROJECT_CACHE:
        return _PROJECT_CACHE[project_id]
    project = _load_from_disk(project_id)
    if project is None:
        raise KeyError(f"Project {project_id} not found")
    _PROJECT_CACHE[project_id] = project
    return project


def get_project(project_id: str) -> StoryProject:
    """Public accessor with clearer semantics."""

    return _get_project(project_id)


def create_project(keyword: str, language: str) -> StoryProject:
    project_id = uuid.uuid4().hex[:12]
    project = StoryProject(
        project_id=project_id,
        keyword=keyword,
        language=language,
        duration=float(settings.default_story_duration),
    )
    _PROJECT_CACHE[project_id] = project
    _persist(project)
    return project


def set_titles(project_id: str, titles: Sequence[TitleItem]) -> StoryProject:
    project = _get_project(project_id)
    project.titles = list(titles)
    _persist(project)
    return project


def set_subtitles(project_id: str, subtitles: Sequence[SubtitleSegment]) -> StoryProject:
    project = _get_project(project_id)
    project.subtitles = list(subtitles)
    _persist(project)
    return project


def set_image_prompts(project_id: str, prompts: Sequence[ImagePrompt]) -> StoryProject:
    project = _get_project(project_id)
    project.image_prompts = list(prompts)
    _persist(project)
    return project


def set_video_prompts(project_id: str, prompts: Sequence[VideoPrompt]) -> StoryProject:
    project = _get_project(project_id)
    project.video_prompts = list(prompts)
    _persist(project)
    return project


def set_duration(project_id: str, duration: float) -> StoryProject:
    project = _get_project(project_id)
    project.duration = duration
    _persist(project)
    return project


def add_image_prompt(project_id: str, prompt: ImagePrompt) -> StoryProject:
    project = _get_project(project_id)
    project.image_prompts.append(prompt)
    _persist(project)
    return project


def update_image_prompt(project_id: str, original_tag: str, payload: dict[str, Any]) -> StoryProject:
    project = _get_project(project_id)
    for index, prompt in enumerate(project.image_prompts):
        if prompt.tag == original_tag:
            data = prompt.dict()
            data.update({k: v for k, v in payload.items() if k in {"tag", "description", "start", "end", "status"}})
            updated = ImagePrompt.parse_obj(data)
            project.image_prompts[index] = updated
            break
    else:
        raise KeyError(f"Image prompt {original_tag} not found in project {project_id}")
    _persist(project)
    return project


def delete_image_prompt(project_id: str, tag: str) -> StoryProject:
    project = _get_project(project_id)
    before = len(project.image_prompts)
    project.image_prompts = [prompt for prompt in project.image_prompts if prompt.tag != tag]
    if len(project.image_prompts) == before:
        raise KeyError(f"Image prompt {tag} not found in project {project_id}")
    _persist(project)
    return project


def add_video_prompt(project_id: str, prompt: VideoPrompt) -> StoryProject:
    project = _get_project(project_id)
    project.video_prompts.append(prompt)
    _persist(project)
    return project


def update_video_prompt(project_id: str, original_tag: str, payload: dict[str, Any]) -> StoryProject:
    project = _get_project(project_id)
    for index, prompt in enumerate(project.video_prompts):
        if prompt.scene_tag == original_tag:
            data = prompt.dict()
            data.update({
                k: v
                for k, v in payload.items()
                if k in {"scene_tag", "camera", "action", "mood", "start", "end", "status"}
            })
            updated = VideoPrompt.parse_obj(data)
            project.video_prompts[index] = updated
            break
    else:
        raise KeyError(f"Video prompt {original_tag} not found in project {project_id}")
    _persist(project)
    return project


def delete_video_prompt(project_id: str, scene_tag: str) -> StoryProject:
    project = _get_project(project_id)
    before = len(project.video_prompts)
    project.video_prompts = [prompt for prompt in project.video_prompts if prompt.scene_tag != scene_tag]
    if len(project.video_prompts) == before:
        raise KeyError(f"Video prompt {scene_tag} not found in project {project_id}")
    _persist(project)
    return project


def apply_template(project_id: str, template: TemplateSetting) -> StoryProject:
    project = _get_project(project_id)
    project.template = template
    _persist(project)
    return project


def apply_effect(project_id: str, effect: MediaEffect) -> StoryProject:
    project = _get_project(project_id)
    effects = [fx for fx in project.applied_effects if fx.effect_id != effect.effect_id]
    effects.append(effect)
    project.applied_effects = sorted(effects, key=lambda fx: (fx.start_time, fx.effect_id))
    _persist(project)
    return project


def remove_effect(project_id: str, effect_id: str) -> StoryProject:
    project = _get_project(project_id)
    project.applied_effects = [fx for fx in project.applied_effects if fx.effect_id != effect_id]
    _persist(project)
    return project


def reorder_subtitles(project_id: str, order: list[int]) -> StoryProject:
    project = _get_project(project_id)
    id_to_segment = {segment.index: segment for segment in project.subtitles}
    project.subtitles = [id_to_segment[idx] for idx in order if idx in id_to_segment]
    _persist(project)
    return project


def update_subtitle_text(project_id: str, index: int, text: str) -> StoryProject:
    project = _get_project(project_id)
    for segment in project.subtitles:
        if segment.index == index:
            segment.text = text
            break
    _persist(project)
    return project


def update_subtitle_timing(project_id: str, index: int, start: float, end: float) -> StoryProject:
    project = _get_project(project_id)
    for segment in project.subtitles:
        if segment.index == index:
            segment.start = start
            segment.end = end
            break
    _persist(project)
    return project


def delete_subtitle(project_id: str, index: int) -> StoryProject:
    project = _get_project(project_id)
    project.subtitles = [segment for segment in project.subtitles if segment.index != index]
    _persist(project)
    return project


def build_chapters_from_fragments(
    project_id: str,
    fragments: Iterable[tuple[str, str]],
) -> StoryProject:
    project = _get_project(project_id)
    project.chapters = assembler.build_chapters(fragments)
    _persist(project)
    return project


def export_project(project_id: str) -> dict[str, str]:
    project = _get_project(project_id)
    snapshot = save_manager.save_project_snapshot(project)
    subtitle_path = save_manager.save_subtitles(project.project_id, project.subtitles)
    story_path = save_manager.save_story_markdown(project)
    prompts_path = save_manager.save_prompts(project.project_id, project.image_prompts, project.video_prompts)

    history_service.record(
        ProjectHistoryEntry(
            project_id=project.project_id,
            version=len(history_service.list_history(project.project_id)) + 1,
            summary=f"Exported project {project.project_id}",
            payload_path=str(snapshot.relative_to(settings.outputs_dir)),
        )
    )
    return {
        "snapshot": str(snapshot),
        "subtitles": str(subtitle_path),
        "story": str(story_path),
        "prompts": str(prompts_path),
    }


def auto_align(project_id: str) -> StoryProject:
    project = _get_project(project_id)
    count = max(
        len(project.subtitles),
        len(project.image_prompts),
        len(project.video_prompts),
    )
    if count == 0:
        return project
    total = project.duration or float(settings.default_story_duration)
    slot = total / count
    for index in range(count):
        start = round(index * slot, 3)
        end = round(min(total, (index + 1) * slot), 3)
        if index < len(project.subtitles):
            project.subtitles[index].start = start
            project.subtitles[index].end = end
        if index < len(project.image_prompts):
            project.image_prompts[index].start = start
            project.image_prompts[index].end = end
        if index < len(project.video_prompts):
            project.video_prompts[index].start = start
            project.video_prompts[index].end = end
    _persist(project)
    return project
