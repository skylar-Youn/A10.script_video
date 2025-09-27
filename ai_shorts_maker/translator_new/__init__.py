"""Translator module for AI Shorts Maker."""

# Import all required functions from the old translator module for compatibility
from ..translator import (
    TranslatorProject,
    TranslatorProjectCreate,
    TranslatorProjectUpdate,
    TranslatorSegment,
    DEFAULT_SEGMENT_MAX,
    create_project,
    load_project,
    save_project,
    list_projects,
    delete_project,
    update_project,
    clone_translator_project,
    downloads_listing,
    aggregate_dashboard_projects,
    translate_project_segments,
    synthesize_voice_for_project,
    render_translated_project,
    list_translation_versions,
    load_translation_version,
    UPLOADS_DIR,
)

# Import ensure_directories from the repository module
from .repository import ensure_directories

__all__ = [
    "TranslatorProject",
    "TranslatorProjectCreate",
    "TranslatorProjectUpdate",
    "TranslatorSegment",
    "DEFAULT_SEGMENT_MAX",
    "create_project",
    "load_project",
    "save_project",
    "list_projects",
    "delete_project",
    "update_project",
    "clone_translator_project",
    "downloads_listing",
    "aggregate_dashboard_projects",
    "translate_project_segments",
    "synthesize_voice_for_project",
    "render_translated_project",
    "list_translation_versions",
    "load_translation_version",
    "UPLOADS_DIR",
    "ensure_directories",
]