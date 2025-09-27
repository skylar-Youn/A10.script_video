"""Project management routes."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Body, HTTPException, status
from fastapi.responses import JSONResponse

from ai_shorts_maker.models import (
    ProjectMetadata,
    ProjectSummary,
    ProjectVersionInfo,
    SubtitleCreate,
    SubtitleUpdate,
    TimelineUpdate,
)
from ai_shorts_maker.repository import (
    clone_project,
    delete_project as repository_delete_project,
    list_projects,
    load_project,
)
from ai_shorts_maker.services import (
    add_subtitle,
    delete_subtitle_line,
    list_project_versions,
    render_project,
    restore_project_version,
    update_subtitle,
    update_subtitle_style,
    update_timeline,
)

router = APIRouter(prefix="/api", tags=["projects"])


class RenderRequest:
    def __init__(self, burn_subs: Optional[bool] = False):
        self.burn_subs = burn_subs


class SubtitleStyleRequest:
    def __init__(
        self,
        font_size: Optional[int] = None,
        y_offset: Optional[int] = None,
        stroke_width: Optional[int] = None,
        font_path: Optional[str] = None,
        animation: Optional[str] = None,
        template: Optional[str] = None,
        banner_primary_text: Optional[str] = None,
        banner_secondary_text: Optional[str] = None,
        banner_primary_font_size: Optional[int] = None,
        banner_secondary_font_size: Optional[int] = None,
        banner_line_spacing: Optional[int] = None,
    ):
        self.font_size = font_size
        self.y_offset = y_offset
        self.stroke_width = stroke_width
        self.font_path = font_path
        self.animation = animation
        self.template = template
        self.banner_primary_text = banner_primary_text
        self.banner_secondary_text = banner_secondary_text
        self.banner_primary_font_size = banner_primary_font_size
        self.banner_secondary_font_size = banner_secondary_font_size
        self.banner_line_spacing = banner_line_spacing


@router.get("/projects", response_model=List[ProjectSummary])
def api_list_projects() -> List[ProjectSummary]:
    return list_projects()


@router.get("/projects/{base_name}", response_model=ProjectMetadata)
def api_get_project(base_name: str) -> ProjectMetadata:
    project = load_project(base_name)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{base_name}' not found.",
        )
    return project


@router.post("/projects/{base_name}/subtitles", response_model=ProjectMetadata)
def api_add_subtitle(base_name: str, payload: SubtitleCreate) -> ProjectMetadata:
    project = load_project(base_name)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{base_name}' not found.",
        )
    return add_subtitle(project, payload)


@router.put("/projects/{base_name}/subtitles/{subtitle_id}", response_model=ProjectMetadata)
def api_update_subtitle(base_name: str, subtitle_id: str, payload: SubtitleUpdate) -> ProjectMetadata:
    project = load_project(base_name)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{base_name}' not found.",
        )
    return update_subtitle(project, subtitle_id, payload)


@router.delete("/projects/{base_name}/subtitles/{subtitle_id}", response_model=ProjectMetadata)
def api_delete_subtitle(base_name: str, subtitle_id: str) -> ProjectMetadata:
    project = load_project(base_name)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{base_name}' not found.",
        )
    return delete_subtitle_line(project, subtitle_id)


@router.put("/projects/{base_name}/timeline", response_model=ProjectMetadata)
def api_update_timeline(base_name: str, payload: TimelineUpdate) -> ProjectMetadata:
    project = load_project(base_name)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{base_name}' not found.",
        )
    return update_timeline(project, payload)


@router.delete("/projects/{base_name}")
def api_delete_project(base_name: str) -> JSONResponse:
    if repository_delete_project(base_name):
        return JSONResponse({"message": f"Project '{base_name}' deleted successfully."})
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{base_name}' not found.",
        )


@router.post("/projects/{base_name}/clone", response_model=ProjectMetadata)
def api_clone_project(base_name: str) -> ProjectMetadata:
    project = load_project(base_name)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{base_name}' not found.",
        )
    return clone_project(base_name)


@router.post("/projects/{base_name}/render", response_model=ProjectMetadata)
def api_render_project(base_name: str, payload: Optional[RenderRequest] = Body(None)) -> ProjectMetadata:
    project = load_project(base_name)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{base_name}' not found.",
        )

    burn_subs = payload.burn_subs if payload else False
    return render_project(project, burn_subs=burn_subs)


@router.put("/projects/{base_name}/subtitle-style", response_model=ProjectMetadata)
def api_update_subtitle_style_route(base_name: str, payload: SubtitleStyleRequest) -> ProjectMetadata:
    project = load_project(base_name)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{base_name}' not found.",
        )

    style_updates = {k: v for k, v in payload.__dict__.items() if v is not None}
    return update_subtitle_style(project, style_updates)


@router.get("/projects/{base_name}/versions", response_model=List[ProjectVersionInfo])
def api_list_versions(base_name: str) -> List[ProjectVersionInfo]:
    project = load_project(base_name)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{base_name}' not found.",
        )
    return list_project_versions(base_name)


@router.post("/projects/{base_name}/versions/{version}/restore", response_model=ProjectMetadata)
def api_restore_version(base_name: str, version: int) -> ProjectMetadata:
    project = load_project(base_name)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{base_name}' not found.",
        )
    return restore_project_version(base_name, version)