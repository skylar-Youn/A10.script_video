"""FastAPI 애플리케이션: AI 쇼츠 제작 웹 UI 및 API."""
from __future__ import annotations

import base64
import json
import logging
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from functools import lru_cache
from typing import Any, Dict, List, Optional, Literal, Tuple
from uuid import uuid4

try:
    import cv2
    CV2_IMPORT_ERROR: Optional[Exception] = None
except ImportError as exc:  # pragma: no cover - optional at runtime
    cv2 = None  # type: ignore[assignment]
    CV2_IMPORT_ERROR = exc

try:
    import torch  # type: ignore[import-untyped]
    TORCH_IMPORT_ERROR: Optional[Exception] = None
except Exception as exc:  # pragma: no cover - optional at runtime
    torch = None  # type: ignore[assignment]
    TORCH_IMPORT_ERROR = exc

from dotenv import load_dotenv
from fastapi import (
    APIRouter,
    Body,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.concurrency import run_in_threadpool

from pydantic import BaseModel
from PIL import ImageColor

# AI Shorts Maker imports - optional module
try:
    from ai_shorts_maker.generator import GenerationOptions, generate_short
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
        metadata_path,
    )
    from ai_shorts_maker.services import (
        add_subtitle,
        delete_subtitle_line,
        list_versions,
        render_project,
        replace_timeline,
        restore_project_version,
        update_audio_settings,
        update_subtitle_style,
        update_subtitle,
    )
    import ai_shorts_maker.translator as translator_module
    from ai_shorts_maker.translator import (
        TranslatorProject,
        TranslatorProjectCreate,
        TranslatorProjectUpdate,
    aggregate_dashboard_projects,
    clone_translator_project,
    create_project as translator_create_project,
    delete_project as translator_delete_project,
    downloads_listing,
    ensure_directories as ensure_translator_directories,
    list_projects as translator_list_projects,
    load_project as translator_load_project,
    update_project as translator_update_project,
    translate_project_segments,
    synthesize_voice_for_project,
    render_translated_project,
    list_translation_versions,
    load_translation_version,
    apply_saved_result_to_project,
    delete_project_segment,
    UPLOADS_DIR,
)
    AI_SHORTS_MAKER_AVAILABLE = True
except ImportError as e:
    AI_SHORTS_MAKER_AVAILABLE = False
    logging.warning(f"AI Shorts Maker module not available: {e}")
    # Define placeholder variables for missing imports
    TranslatorProject = None
    TranslatorProjectCreate = None
    TranslatorProjectUpdate = None

from videoanalysis.config import SAVED_RESULTS_DIR
from youtube.ytdl import download_with_options, parse_sub_langs
try:
    from youtube.ytcompareinspector import compare_two, compare_dir
    SIMILARITY_IMPORT_ERROR: Optional[Exception] = None
except Exception as exc:  # pylint: disable=broad-except
    compare_two = None  # type: ignore[assignment]
    compare_dir = None  # type: ignore[assignment]
    SIMILARITY_IMPORT_ERROR = exc
from youtube.ytcopyrightinspector import run_precheck as run_copyright_precheck

from .utils.text_removal import (
    BackgroundFillConfig,
    DiffusionUnavailableError,
    RemovalConfig,
    TrackerUnavailableError,
    trim_video_clip,
    prepare_video_preview,
    split_media_components,
    run_background_fill,
    run_text_removal,
)


class RenderRequest(BaseModel):
    burn_subs: Optional[bool] = False


class SubtitleStyleRequest(BaseModel):
    font_size: Optional[int] = None
    y_offset: Optional[int] = None
    stroke_width: Optional[int] = None
    font_path: Optional[str] = None
    animation: Optional[str] = None
    template: Optional[str] = None
    banner_primary_text: Optional[str] = None
    banner_secondary_text: Optional[str] = None
    banner_primary_font_size: Optional[int] = None
    banner_secondary_font_size: Optional[int] = None
    banner_line_spacing: Optional[int] = None


class DashboardProject(BaseModel):
    id: str
    title: str
    project_type: Literal["shorts", "translator"]
    status: Literal["draft", "segmenting", "translating", "voice_ready", "voice_complete", "rendering", "rendered", "failed"]
    completed_steps: int = 1
    total_steps: int = 5
    topic: Optional[str] = None
    language: Optional[str] = None
    thumbnail: Optional[str] = None
    updated_at: Optional[str] = None
    source_origin: Optional[str] = None


class TextRemovalBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class TextRemovalProcessRequest(BaseModel):
    session_id: str
    prompt: str = "clean smooth surface, natural background, seamless texture"
    negative_prompt: str = "text, watermark, caption, letters, words, characters"
    model_id: str = "stabilityai/stable-diffusion-2-inpainting"
    strength: float = 0.9
    guidance_scale: float = 7.5
    num_inference_steps: int = 30
    dilate: int = 10
    device: str = "cuda"
    dtype: Literal["float16", "float32"] = "float16"
    seed: Optional[int] = None
    boxes: List[TextRemovalBox]
    max_frames: Optional[int] = None
    fps: Optional[float] = None


class TextRemovalFillRequest(BaseModel):
    session_id: str
    boxes: List[TextRemovalBox]
    dilate: int = 4
    fps: Optional[float] = None
    max_frames: Optional[int] = None


class TextRemovalSplitRequest(BaseModel):
    session_id: str


class TextRemovalTrimRequest(BaseModel):
    session_id: str
    start: float = 0.0
    duration: float = 4.0


logger = logging.getLogger(__name__)


def open_video_with_transcode_fallback(video_path: Path) -> tuple[Any, Optional[Path]]:
    """
    OpenCV로 비디오를 열되, AV1 등으로 실패 시 H.264로 트랜스코딩하여 재시도.

    Returns:
        (cv2.VideoCapture, transcoded_file_path or None)
    """
    import subprocess
    import tempfile

    if cv2 is None:
        raise RuntimeError("OpenCV가 설치되지 않았습니다.")

    def _create_capture(path: Path):
        api_preference = getattr(cv2, "CAP_FFMPEG", 0)
        capture = cv2.VideoCapture()

        if hasattr(cv2, "CAP_PROP_HW_ACCELERATION") and hasattr(cv2, "VIDEO_ACCELERATION_NONE"):
            capture.set(cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_NONE)

        opened = False
        try:
            opened = capture.open(str(path), api_preference)
        except TypeError:  # pragma: no cover - older OpenCV fallback
            opened = capture.open(str(path))

        if not opened:
            capture.release()
            try:
                capture = cv2.VideoCapture(str(path), api_preference)
            except TypeError:  # pragma: no cover - older OpenCV fallback
                capture = cv2.VideoCapture(str(path))
            if hasattr(cv2, "CAP_PROP_HW_ACCELERATION") and hasattr(cv2, "VIDEO_ACCELERATION_NONE"):
                capture.set(cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_NONE)
        return capture

    # 먼저 직접 열기 시도
    cap = _create_capture(video_path)
    if cap.isOpened():
        return cap, None

    # 실패 시 트랜스코딩
    logger.info(f"Failed to open video directly, attempting transcode: {video_path}")

    temp_dir = Path(tempfile.gettempdir())
    transcoded_file = temp_dir / f"transcoded_{uuid4().hex}.mp4"

    transcode_cmd = [
        "ffmpeg",
        "-y",
        "-hwaccel", "none",  # 하드웨어 가속 비활성화
        "-i", str(video_path),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "ultrafast",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",  # 해상도 유지 (짝수로 보정)
        "-avoid_negative_ts", "make_zero",
        str(transcoded_file)
    ]

    proc = subprocess.run(transcode_cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not transcoded_file.exists():
        error_msg = proc.stderr.strip() or proc.stdout.strip() or "FFmpeg transcoding failed"
        if transcoded_file.exists():
            transcoded_file.unlink()
        raise RuntimeError(f"Failed to transcode video: {error_msg}")

    cap = _create_capture(transcoded_file)
    if not cap.isOpened():
        if transcoded_file.exists():
            transcoded_file.unlink()
        raise RuntimeError("Failed to open transcoded video")

    return cap, transcoded_file


BASE_DIR = Path(__file__).resolve().parent
PACKAGE_DIR = BASE_DIR.parent / "ai_shorts_maker"
ASSETS_DIR = PACKAGE_DIR / "assets"
OUTPUT_DIR = PACKAGE_DIR / "outputs"
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
YTDL_SETTINGS_PATH = BASE_DIR / "ytdl_settings.json"
YTDL_HISTORY_PATH = BASE_DIR / "ytdl_history.json"
DEFAULT_YTDL_OUTPUT_DIR = (BASE_DIR.parent / "youtube" / "download").resolve()
COPYRIGHT_UPLOAD_DIR = BASE_DIR / "uploads" / "copyright"
TEXT_REMOVAL_UPLOAD_DIR = BASE_DIR / "uploads" / "text_removal"
YTDL_UPLOAD_DIR = BASE_DIR / "uploads" / "ytdl"
COPYRIGHT_REPORT_DIR = BASE_DIR / "reports" / "copyright"
SIMILARITY_SETTINGS_PATH = BASE_DIR / "similarity_settings.json"
COPYRIGHT_SETTINGS_PATH = BASE_DIR / "copyright_settings.json"
DEFAULT_YTDL_SETTINGS: Dict[str, Any] = {
    "output_dir": str(DEFAULT_YTDL_OUTPUT_DIR),
    "sub_langs": "ko",
    "sub_format": "srt/best",
    "download_subs": True,
    "auto_subs": True,
    "dry_run": False,
    "extract_vocal": False,
    "extract_instruments": False,
}

SIMILARITY_DEFAULTS: Dict[str, Any] = {
    "video_a": "",
    "video_b": "",
    "ref_dir": "",
    "fps": "1.0",
    "resize": "320x320",
    "max_frames": "200",
    "phash_th": "12",
    "weight_phash": "0.25",
    "weight_orb": "0.25",
    "weight_hist": "0.25",
    "weight_psnr": "0.25",
    "top_n": "5",
}

TEXT_REMOVAL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
YTDL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def load_similarity_settings() -> Dict[str, Any]:
    settings = SIMILARITY_DEFAULTS.copy()
    if SIMILARITY_SETTINGS_PATH.exists():
        try:
            data = json.loads(SIMILARITY_SETTINGS_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                for key in settings:
                    if key in data:
                        value = data[key]
                        settings[key] = "" if value is None else str(value)
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Failed to load similarity settings: %s", exc)
    return settings


def save_similarity_settings(values: Dict[str, Any]) -> None:
    payload: Dict[str, Any] = {}
    for key in SIMILARITY_DEFAULTS:
        if key in values:
            value = values[key]
            payload[key] = "" if value is None else str(value)
    try:
        SIMILARITY_SETTINGS_PATH.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError as exc:
        logger.error("Failed to save similarity settings: %s", exc)
        raise


def default_similarity_form() -> Dict[str, Any]:
    return load_similarity_settings()


COPYRIGHT_DEFAULTS: Dict[str, Any] = {
    "reference_dir": "",
    "fps": "1.0",
    "hash": "phash",
    "resize": "256x256",
    "max_frames": "",
    "hamming_th": "12",
    "high_th": "0.30",
    "med_th": "0.15",
    "audio_only": False,
    "report_dir": "",
}


def load_copyright_settings() -> Dict[str, Any]:
    settings = COPYRIGHT_DEFAULTS.copy()
    if COPYRIGHT_SETTINGS_PATH.exists():
        try:
            data = json.loads(COPYRIGHT_SETTINGS_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                for key, default_value in settings.items():
                    if key not in data:
                        continue
                    value = data[key]
                    if isinstance(default_value, bool):
                        settings[key] = bool(value)
                    else:
                        settings[key] = "" if value is None else str(value)
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Failed to load copyright settings: %s", exc)
    return settings


def save_copyright_settings(values: Dict[str, Any]) -> None:
    payload: Dict[str, Any] = {}
    for key, default_value in COPYRIGHT_DEFAULTS.items():
        if isinstance(default_value, bool):
            raw = values.get(key)
            if isinstance(raw, str):
                payload[key] = raw.lower() in {"1", "true", "yes", "on"}
            else:
                payload[key] = bool(raw)
        else:
            if key not in values:
                continue
            value = values[key]
            payload[key] = "" if value is None else str(value)
    try:
        COPYRIGHT_SETTINGS_PATH.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError as exc:
        logger.error("Failed to save copyright settings: %s", exc)
        raise


def default_copyright_form() -> Dict[str, Any]:
    return load_copyright_settings()


LANG_OPTIONS: List[tuple[str, str]] = [
    ("ko", "한국어"),
    ("en", "English"),
    ("ja", "日本語"),
]
LANG_OPTION_SET = {code for code, _ in LANG_OPTIONS}


def sanitize_lang(value: Optional[str]) -> str:
    if not value:
        return "ko"
    value_lower = value.lower()
    return value_lower if value_lower in LANG_OPTION_SET else "ko"


def _path_exists(value: Optional[str]) -> bool:
    if not value:
        return False
    try:
        return Path(value).exists()
    except OSError:
        return False


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def parse_resize_form(value: str) -> Optional[tuple[int, int]]:
    try:
        width_str, height_str = value.lower().split("x")
        width = int(width_str)
        height = int(height_str)
        if width <= 0 or height <= 0:
            raise ValueError
        return width, height
    except Exception:  # pylint: disable=broad-except
        return None


# ---------------------------------------------------------------------------
# Styling helpers for video overlay rendering
# ---------------------------------------------------------------------------

FONT_SEARCH_DIRECTORIES: Tuple[Path, ...] = tuple(
    directory
    for directory in (
        Path(__file__).resolve().parent / "static" / "fonts",
        Path(__file__).resolve().parent.parent / "ai_shorts_maker" / "assets" / "fonts",
        Path("/usr/share/fonts/truetype/noto"),
        Path("/usr/share/fonts/truetype/nanum"),
        Path("/usr/share/fonts/truetype/dejavu"),
        Path("/usr/share/fonts/truetype/liberation"),
    )
    if directory.exists()
)


@lru_cache(maxsize=1)
def _collect_font_inventory() -> Dict[str, Path]:
    """Scan known directories for font files and cache the results."""
    inventory: Dict[str, Path] = {}
    for base_dir in FONT_SEARCH_DIRECTORIES:
        try:
            for font_file in base_dir.rglob("*"):
                if font_file.is_file() and font_file.suffix.lower() in {".ttf", ".otf", ".ttc"}:
                    inventory.setdefault(font_file.name.lower(), font_file)
        except (OSError, PermissionError):
            continue
    return inventory


@lru_cache(maxsize=None)
def _resolve_font_file(font_family: Optional[str], font_weight: Optional[str]) -> Optional[str]:
    """Find a matching font file for the requested family/weight."""
    inventory = _collect_font_inventory()
    if not inventory:
        return None

    normalized_family = (font_family or "").lower()
    normalized_weight = (font_weight or "").lower()
    prefer_bold = any(
        normalized_weight.startswith(prefix) for prefix in ("bold", "600", "700", "800", "900")
    )

    candidate_names: List[str] = []

    def add_candidate(name: str) -> None:
        lower = name.lower()
        if lower not in candidate_names:
            candidate_names.append(lower)

    if normalized_family:
        if "pretendard" in normalized_family:
            if prefer_bold:
                add_candidate("pretendard-semibold.ttf")
                add_candidate("pretendard-bold.ttf")
            add_candidate("pretendard-regular.ttf")
            add_candidate("pretendard.ttf")
        if "nanum" in normalized_family:
            if prefer_bold:
                add_candidate("nanumgothicbold.ttf")
                add_candidate("nanumsquareb.ttf")
                add_candidate("nanumbarungothicbold.ttf")
            add_candidate("nanumgothic.ttf")
            add_candidate("nanumsquarer.ttf")
            add_candidate("nanumbarungothic.ttf")
        if "noto" in normalized_family:
            if prefer_bold:
                add_candidate("notosans-bold.ttf")
                add_candidate("notosanscjkk-bold.otf")
                add_candidate("notosanscjkkr-bold.otf")
                add_candidate("notosanskr-bold.ttf")
                add_candidate("notosansjp-bold.ttf")
            add_candidate("notosans-regular.ttf")
            add_candidate("notosanscjkkr-regular.otf")
            add_candidate("notosanscjk-regular.ttc")
            # web_app/static/fonts/ 폴더의 폰트 추가
            add_candidate("notosanskr-regular.ttf")
            add_candidate("notosansjp-regular.ttf")
        if "arial" in normalized_family:
            if prefer_bold:
                add_candidate("arialbd.ttf")
            add_candidate("arial.ttf")
        if "segoe" in normalized_family:
            if prefer_bold:
                add_candidate("segoeuib.ttf")
            add_candidate("segoeui.ttf")

    # 기본 폰트 fallback 순서 (한글 지원 우선)
    if prefer_bold:
        add_candidate("pretendard-semibold.ttf")
        add_candidate("nanumgothicbold.ttf")
        add_candidate("nanumsquareb.ttf")
        add_candidate("nanumbarungothicbold.ttf")
        add_candidate("notosans-bold.ttf")
        add_candidate("arialbd.ttf")

    add_candidate("pretendard-regular.ttf")
    add_candidate("nanumgothic.ttf")
    add_candidate("nanumsquarer.ttf")
    add_candidate("nanumbarungothic.ttf")
    add_candidate("notosans-regular.ttf")
    add_candidate("dejavusans.ttf")
    add_candidate("arial.ttf")

    for candidate in candidate_names:
        if candidate in inventory:
            return str(inventory[candidate])
        for file_name, path in inventory.items():
            if candidate in file_name:
                return str(path)

    return None


@lru_cache(maxsize=256)
def _parse_css_color(value: Optional[str], default_hex: str = "0xFFFFFF") -> Tuple[str, Optional[float]]:
    """Convert CSS color expressions into FFmpeg-compatible hex + alpha."""
    if not value:
        return default_hex, None
    try:
        r, g, b, a = ImageColor.getcolor(value.strip(), "RGBA")
        hex_value = f"0x{r:02X}{g:02X}{b:02X}"
        if a < 255:
            return hex_value, round(a / 255.0, 4)
        return hex_value, None
    except Exception:  # pylint: disable=broad-except
        return default_hex, None


def _format_color_for_ffmpeg(color_hex: str, alpha: Optional[float]) -> str:
    """Format a color + alpha for drawtext."""
    if alpha is None:
        return color_hex
    alpha_clamped = max(0.0, min(1.0, float(alpha)))
    if alpha_clamped >= 0.9999:
        return color_hex
    alpha_str = f"{alpha_clamped:.4f}".rstrip("0").rstrip(".")
    return f"{color_hex}@{alpha_str}"


def _parse_css_length(value: Optional[str], font_size: float) -> Optional[float]:
    """Parse CSS length values (px, em, rem, %) into pixel units."""
    if not value:
        return None
    lowered = value.strip().lower()
    if not lowered or lowered in {"auto", "normal"}:
        return None
    try:
        if lowered.endswith("px"):
            return float(lowered[:-2])
        if lowered.endswith("em"):
            return float(lowered[:-2]) * font_size
        if lowered.endswith("rem"):
            return float(lowered[:-3]) * font_size
        if lowered.endswith("%"):
            return float(lowered[:-1]) * font_size / 100.0
        return float(lowered)
    except ValueError:
        return None


def _parse_text_shadow(shadow_value: Optional[str], font_size: float) -> Optional[Dict[str, Any]]:
    """Extract the first text-shadow entry and convert it to pixel offsets."""
    if not shadow_value:
        return None
    shadow_str = shadow_value.strip()
    if not shadow_str or shadow_str.lower() == "none":
        return None

    entries: List[str] = []
    buffer = ""
    depth = 0
    for char in shadow_str:
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
        if char == "," and depth == 0:
            if buffer.strip():
                entries.append(buffer.strip())
            buffer = ""
        else:
            buffer += char
    if buffer.strip():
        entries.append(buffer.strip())

    if not entries:
        return None

    first_entry = entries[0]
    color_match = re.search(r'(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\s*$', first_entry)
    color = color_match.group(1) if color_match else None
    remainder = first_entry[: color_match.start()].strip() if color_match else first_entry

    length_tokens = [token for token in re.split(r"\s+", remainder) if token]
    dx = _parse_css_length(length_tokens[0], font_size) if len(length_tokens) > 0 else 0.0
    dy = _parse_css_length(length_tokens[1], font_size) if len(length_tokens) > 1 else 0.0

    return {
        "color": color,
        "dx": float(dx or 0.0),
        "dy": float(dy or 0.0),
    }


def escape_ffmpeg_text(text: str) -> str:
    """Escape characters that would break FFmpeg drawtext filters."""
    escaped = text.replace("\\", "\\\\")
    escaped = escaped.replace("'", "'\\''")
    escaped = escaped.replace(":", "\\:")
    escaped = escaped.replace("[", "\\[")
    escaped = escaped.replace("]", "\\]")
    return escaped


def _build_drawtext_filter(
    overlay: Dict[str, Any],
    video_width: int,
    video_height: int,
) -> Optional[Tuple[str, Dict[str, Any]]]:
    """Construct a drawtext filter string that mirrors the web overlay styling."""
    if not overlay or not overlay.get("text"):
        return None

    text_raw = str(overlay.get("text", ""))
    if not text_raw:
        return None
    text = escape_ffmpeg_text(text_raw)

    overlay_type = (overlay.get("type") or "").lower()

    try:
        font_size = max(12, int(round(float(overlay.get("fontSize", 48)))))
    except (TypeError, ValueError):
        font_size = 48

    # ⚠️ 주의: 웹 미리보기와 동기화를 위해 폰트 크기 축소를 제거함
    # if overlay_type in {"korean", "english"}:
    #     font_size = max(12, int(round(font_size / 5.0)))

    def _coerce_position(value: Any, fallback: float) -> float:
        try:
            if value is None:
                raise TypeError
            return float(value)
        except (TypeError, ValueError):
            return fallback

    default_positions = {
        "title": {"x": video_width / 2, "y": video_height * 0.82},
        "subtitle": {"x": video_width / 2, "y": video_height * 0.9},
        "korean": {"x": video_width * 0.898026, "y": video_height * 1.0},
        "english": {"x": video_width * 1.0, "y": video_height * 0.886635},
        "source": {"x": video_width / 2, "y": video_height * 0.97},
    }

    fallback_position = default_positions.get(overlay_type, {"x": video_width / 2, "y": video_height / 2})
    x_value = _coerce_position(overlay.get("x"), fallback_position.get("x", video_width / 2))
    y_value = _coerce_position(overlay.get("y"), fallback_position.get("y", video_height / 2))

    if overlay_type in {"title", "subtitle"} and overlay.get("y") in {None, ""}:
        # 제목/부제목이 위치 값을 갖지 않는 경우 주/보조 자막 기본 위치와 맞춘다.
        anchor_key = "korean" if overlay_type == "title" else "english"
        anchor_fallback = default_positions.get(anchor_key)
        if anchor_fallback and anchor_fallback.get("y") is not None:
            y_value = anchor_fallback["y"]

    # drawtext 좌표는 텍스트 상단/좌측 기준으로 다루며, CSS의 translateX(-50%) 효과를 모사한다.
    x_expr = f"clip({x_value}-text_w/2,0,{video_width}-text_w)"

    # ⚠️ Canvas textBaseline='middle'과 동기화: 모든 텍스트를 중앙 정렬
    # Canvas는 모든 텍스트를 textBaseline='middle'로 렌더링하므로,
    # FFmpeg도 동일하게 y 좌표를 텍스트 중앙으로 처리
    y_expr_base = f"{y_value}-text_h/2"

    y_expr = f"clip({y_expr_base},0,{video_height}-text_h)"

    font_family = overlay.get("fontFamily")
    font_weight = overlay.get("fontWeight")

    # CJK 문자 감지
    has_korean = any('\uac00' <= char <= '\ud7a3' or '\u3131' <= char <= '\u318e' for char in text_raw)
    has_japanese = any(
        '\u3040' <= char <= '\u309f' or  # 히라가나
        '\u30a0' <= char <= '\u30ff' or  # 가타카나
        '\u4e00' <= char <= '\u9faf'     # CJK 한자
        for char in text_raw
    )
    has_cjk = has_korean or has_japanese

    # CJK 문자에 맞는 폰트 선택
    if has_cjk and not font_family:
        if has_japanese:
            # 일본어 우선: Noto Sans CJK 폰트 사용 (한자 + 가나 지원)
            font_family = "NotoSans"
        else:
            # 한글 전용: NanumGothic 사용
            font_family = "NanumGothic"

    font_path = _resolve_font_file(font_family, font_weight)

    # CJK 폰트를 찾지 못한 경우, 시스템 폰트 직접 지정
    if has_cjk and not font_path:
        fallback_fonts = [
            "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
            "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
            "/usr/share/fonts/truetype/nanum/NanumBarunGothic.ttf",
        ]
        for fallback in fallback_fonts:
            if Path(fallback).exists():
                font_path = fallback
                break

    # 오버레이 타입에 따라 색상 강제 설정
    overlay_opacity = overlay.get("opacity")

    if overlay_type in ["korean", "english"]:
        # korean/english 오버레이는 항상 흰색으로 고정 (검정 배경에 표시되므로)
        font_hex = "FFFFFF"
        font_alpha = 1.0
    else:
        # title, subtitle 등은 기존 색상 유지
        font_hex, font_alpha = _parse_css_color(overlay.get("color"))
        if overlay_opacity is not None:
            try:
                opacity_value = float(overlay_opacity)
                opacity_value = max(0.0, min(1.0, opacity_value))
                if font_alpha is None:
                    font_alpha = opacity_value
                else:
                    font_alpha = max(0.0, min(1.0, font_alpha * opacity_value))
            except (TypeError, ValueError):
                pass
    font_color = _format_color_for_ffmpeg(font_hex, font_alpha)

    outline_hex, outline_alpha = _parse_css_color(
        overlay.get("outlineColor"),
        default_hex="0x000000",
    )
    outline_color = _format_color_for_ffmpeg(outline_hex, outline_alpha)

    if overlay_type in {"korean", "english"}:
        border_width = max(2, int(round(font_size * 0.08)))
    else:
        border_width = max(1, int(round(font_size * 0.06)))

    letter_spacing = overlay.get("letterSpacing")
    spacing_value = _parse_css_length(letter_spacing, font_size) if letter_spacing else None

    shadow_info = _parse_text_shadow(overlay.get("textShadow"), font_size)

    background_color_raw = overlay.get("backgroundColor")
    box_color_hex, box_alpha = _parse_css_color(background_color_raw, default_hex="0x000000")

    padding = overlay.get("padding") or {}
    padding_candidates = [
        padding.get("top"),
        padding.get("right"),
        padding.get("bottom"),
        padding.get("left"),
    ]
    padding_pixels = [
        float(value)
        for value in padding_candidates
        if isinstance(value, (int, float)) and value > 0
    ]
    if not padding_pixels and background_color_raw:
        padding_pixels = [font_size * 0.25]
    padding_amount = int(round(max(padding_pixels))) if padding_pixels else 0

    drawtext_params = [
        f"text='{text}'",
        f"x='{x_expr}'",
        f"y='{y_expr}'",
        f"fontsize={font_size}",
        "text_shaping=1",
        f"fontcolor={font_color}",
    ]

    if font_path:
        sanitized_font = font_path.replace("\\", "\\\\").replace(":", "\\:")
        drawtext_params.append(f"fontfile={sanitized_font}")

    if spacing_value:
        drawtext_params.append(f"spacing={spacing_value:.2f}")

    if border_width > 0:
        drawtext_params.append(f"borderw={border_width}")
        drawtext_params.append(f"bordercolor={outline_color}")

    if shadow_info and shadow_info.get("color"):
        shadow_hex, shadow_alpha = _parse_css_color(shadow_info["color"], default_hex="0x000000")
        shadow_color = _format_color_for_ffmpeg(shadow_hex, shadow_alpha)
        drawtext_params.append(f"shadowcolor={shadow_color}")
        drawtext_params.append(f"shadowx={int(round(shadow_info.get('dx', 0.0)))}")
        drawtext_params.append(f"shadowy={int(round(shadow_info.get('dy', 0.0)))}")

    if background_color_raw and (box_alpha is None or box_alpha > 0):
        drawtext_params.append("box=1")
        drawtext_params.append(f"boxcolor={_format_color_for_ffmpeg(box_color_hex, box_alpha)}")
        drawtext_params.append(f"boxborderw={max(1, padding_amount)}")

    filter_str = "drawtext=" + ":".join(drawtext_params)
    meta = {
        "font_size": font_size,
        "fontfile": font_path,
        "font_color": font_color,
        "outline_color": outline_color,
        "border_width": border_width,
        "letter_spacing": spacing_value,
        "shadow": shadow_info,
        "background": background_color_raw,
        "padding": padding_amount,
        "opacity": overlay_opacity,
    }

    return filter_str, meta


def build_dashboard_project(summary: ProjectSummary) -> DashboardProject:
    audio_ready = _path_exists(summary.audio_path)
    video_ready = _path_exists(summary.video_path)

    completed_steps = 1
    status: Literal["draft", "translating", "voice_ready", "rendering", "rendered", "failed"] = "draft"

    if audio_ready:
        completed_steps = max(completed_steps, 3)
        status = "voice_ready"
    if video_ready:
        completed_steps = 4
        status = "rendered"

    updated_at = summary.updated_at.isoformat() if summary.updated_at else None

    return DashboardProject(
        id=summary.base_name,
        title=summary.topic or summary.base_name,
        topic=summary.topic,
        language=summary.language,
        status=status,
        completed_steps=completed_steps,
        thumbnail=summary.video_path,
        updated_at=updated_at,
    )


load_dotenv()
ASSETS_DIR.mkdir(parents=True, exist_ok=True)
(ASSETS_DIR / "broll").mkdir(exist_ok=True)
(ASSETS_DIR / "music").mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
COPYRIGHT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
COPYRIGHT_REPORT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="AI Shorts Maker")

# 다운로드 진행 상태 추적
download_tasks: Dict[str, Dict[str, Any]] = {}

# 오디오 추출 진행 상태 추적
extraction_tasks: Dict[str, Dict[str, Any]] = {}

# 영상 자르기 진행 상태 추적
cut_video_tasks: Dict[str, Dict[str, Any]] = {}

# 프리뷰 영상 생성 진행 상태 추적
preview_video_tasks: Dict[str, Dict[str, Any]] = {}

# CORS 설정 추가
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 모든 origin 허용 (개발용)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")
app.mount("/youtube/download", StaticFiles(directory=DEFAULT_YTDL_OUTPUT_DIR), name="youtube_download")

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

api_router = APIRouter(prefix="/api", tags=["projects"])


@api_router.get("/projects", response_model=List[ProjectSummary])
def api_list_projects() -> List[ProjectSummary]:
    return list_projects(OUTPUT_DIR)


@api_router.get("/projects/{base_name}", response_model=ProjectMetadata)
def api_get_project(base_name: str) -> ProjectMetadata:
    try:
        return load_project(base_name, OUTPUT_DIR)
    except FileNotFoundError as exc:  # pragma: no cover - handled as HTTP 404
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@api_router.post("/projects/{base_name}/subtitles", response_model=ProjectMetadata)
def api_add_subtitle(base_name: str, payload: SubtitleCreate) -> ProjectMetadata:
    try:
        return add_subtitle(base_name, payload)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@api_router.patch("/projects/{base_name}/subtitles/{subtitle_id}", response_model=ProjectMetadata)
def api_update_subtitle(base_name: str, subtitle_id: str, payload: SubtitleUpdate) -> ProjectMetadata:
    try:
        return update_subtitle(base_name, subtitle_id, payload)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@api_router.delete("/projects/{base_name}/subtitles/{subtitle_id}", response_model=ProjectMetadata)
def api_delete_subtitle(base_name: str, subtitle_id: str) -> ProjectMetadata:
    try:
        return delete_subtitle_line(base_name, subtitle_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api_router.patch("/projects/{base_name}/timeline", response_model=ProjectMetadata)
def api_update_timeline(base_name: str, payload: TimelineUpdate) -> ProjectMetadata:
    try:
        return replace_timeline(base_name, payload)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api_router.patch("/projects/{base_name}/audio", response_model=ProjectMetadata)
def api_update_audio(
    base_name: str,
    music_enabled: Optional[bool] = Body(None),
    music_volume: Optional[float] = Body(None),
    ducking: Optional[float] = Body(None),
    music_track: Optional[str] = Body(None),
) -> ProjectMetadata:
    try:
        return update_audio_settings(
            base_name,
            music_enabled=music_enabled,
            music_volume=music_volume,
            ducking=ducking,
            music_track=music_track,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api_router.delete("/projects/{base_name}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_project(base_name: str) -> JSONResponse:
    try:
        repository_delete_project(base_name, OUTPUT_DIR)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return JSONResponse(status_code=status.HTTP_204_NO_CONTENT, content=None)


@api_router.post("/projects/{base_name}/clone", response_model=ProjectMetadata)
def api_clone_project(base_name: str) -> ProjectMetadata:
    """프로젝트를 복제하여 백업본을 생성합니다."""
    try:
        return clone_project(base_name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@api_router.post("/projects/{base_name}/render", response_model=ProjectMetadata)
def api_render_project(base_name: str, payload: Optional[RenderRequest] = Body(None)) -> ProjectMetadata:
    try:
        burn = payload.burn_subs if payload is not None else False
        return render_project(base_name, burn_subs=bool(burn))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@api_router.patch("/projects/{base_name}/subtitle-style", response_model=ProjectMetadata)
def api_update_subtitle_style_route(base_name: str, payload: SubtitleStyleRequest) -> ProjectMetadata:
    try:
        data = payload.model_dump(exclude_unset=True)
        return update_subtitle_style(base_name, **data)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@api_router.get("/projects/{base_name}/versions", response_model=List[ProjectVersionInfo])
def api_list_versions(base_name: str) -> List[ProjectVersionInfo]:
    return list_versions(base_name)


@api_router.post("/projects/{base_name}/versions/{version}/restore", response_model=ProjectMetadata)
def api_restore_version(base_name: str, version: int) -> ProjectMetadata:
    try:
        return restore_project_version(base_name, version)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


app.include_router(api_router)


translator_router = APIRouter(prefix="/api/translator", tags=["translator"])


def _audio_path_to_url(audio_path: Optional[str]) -> Optional[str]:
    """Convert filesystem paths inside outputs/ to web URLs."""
    if audio_path is None:
        return None

    if isinstance(audio_path, (int, float)):
        return audio_path

    value = str(audio_path)
    if not value:
        return value

    if value.startswith("http://") or value.startswith("https://"):
        return value

    if value.startswith("/outputs/"):
        return value

    try:
        base_output_dir = translator_module.TRANSLATOR_DIR.parent
        path_obj = Path(value)
        relative_path = path_obj.relative_to(base_output_dir)
        return f"/outputs/{relative_path.as_posix()}"
    except ValueError:
        return value


def _convert_audio_paths(project: Optional[TranslatorProject]) -> Optional[TranslatorProject]:
    """Normalize audio paths in a translator project for web delivery."""
    if project is None:
        return None

    project.source_video = _audio_path_to_url(project.source_video)
    project.source_subtitle = _audio_path_to_url(project.source_subtitle)

    for segment in project.segments:
        segment.audio_path = _audio_path_to_url(segment.audio_path)

    if isinstance(project.extra, dict):
        if isinstance(project.extra.get("voice_path"), str):
            project.extra["voice_path"] = _audio_path_to_url(project.extra["voice_path"])
        if isinstance(project.extra.get("rendered_video_path"), str):
            project.extra["rendered_video_path"] = _audio_path_to_url(project.extra["rendered_video_path"])
        if isinstance(project.extra.get("audio_files"), dict):
            project.extra["audio_files"] = {
                key: _audio_path_to_url(value) if isinstance(value, str) else value
                for key, value in project.extra["audio_files"].items()
            }

    return project


def _convert_project_list(projects: List[TranslatorProject]) -> List[TranslatorProject]:
    return [_convert_audio_paths(project) for project in projects]


@translator_router.get("/downloads")
async def api_list_downloads() -> List[Dict[str, str]]:
    return downloads_listing()


@translator_router.get("/settings")
def api_get_translator_settings() -> Dict[str, Any]:
    return load_translator_settings()


@translator_router.post("/settings")
def api_save_translator_settings(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    try:
        save_translator_settings(payload)
        return {"success": True, "message": "Settings saved successfully"}
    except Exception as exc:
        logger.exception("Failed to save translator settings")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.get("/projects")
async def api_list_translator_projects():
    try:
        from ai_shorts_maker.translator import list_projects
        projects = await run_in_threadpool(list_projects)
        return _convert_project_list(projects)
    except Exception as exc:
        logger.exception("Failed to list translator projects")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.post("/projects", response_model=TranslatorProject)
async def api_create_translator_project(payload: TranslatorProjectCreate) -> TranslatorProject:
    try:
        settings_to_save = {
            "target_lang": payload.target_lang,
            "translation_mode": payload.translation_mode,
            "tone_hint": payload.tone_hint,
        }
        save_translator_settings(settings_to_save)
        project = await run_in_threadpool(translator_create_project, payload)
        return _convert_audio_paths(project)
    except Exception as exc:
        logger.exception("Failed to create translator project")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.get("/projects/{project_id}", response_model=TranslatorProject)
async def api_get_translator_project(project_id: str) -> TranslatorProject:
    try:
        project = await run_in_threadpool(translator_load_project, project_id)
        return _convert_audio_paths(project)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@translator_router.patch("/projects/{project_id}", response_model=TranslatorProject)
async def api_update_translator_project(
    project_id: str, payload: TranslatorProjectUpdate
) -> TranslatorProject:
    try:
        project = await run_in_threadpool(translator_update_project, project_id, payload)
        return _convert_audio_paths(project)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@translator_router.delete(
    "/projects/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def api_delete_translator_project(project_id: str) -> Response:
    try:
        await run_in_threadpool(translator_delete_project, project_id)
    except FileNotFoundError:
        pass  # Idempotent delete
    except Exception as exc:
        logger.exception("Failed to delete translator project %s", project_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@translator_router.post("/projects/{project_id}/add-subtitle-text")
async def api_add_subtitle_text(project_id: str, payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """자막 텍스트를 파싱하여 프로젝트에 추가"""
    try:
        subtitle_text = payload.get("subtitle_text", "")
        subtitle_format = payload.get("subtitle_format", "srt")  # srt 또는 vtt
        target_field = payload.get("target_field", "source_text")  # source_text 또는 commentary_korean
        selected_speakers = payload.get("selected_speakers", None)  # 선택된 화자 리스트

        if not subtitle_text:
            raise ValueError("subtitle_text is required")

        # 자막 파싱
        from ai_shorts_maker.translator import parse_subtitle_text_and_add_to_project

        result = await run_in_threadpool(
            parse_subtitle_text_and_add_to_project,
            project_id,
            subtitle_text,
            subtitle_format,
            target_field,
            selected_speakers
        )

        return {
            "success": True,
            "project_id": project_id,
            "segments_count": len(result["project"].segments) if result["project"] else 0,
            "added_count": result.get("added_count", 0),
            "replaced_count": result.get("replaced_count", 0),
            "removed_count": result.get("removed_count", 0),
            "target_field": target_field,
            "selected_speakers": selected_speakers
        }
    except Exception as exc:
        logger.exception("Failed to add subtitle text to project %s", project_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.post("/projects/{project_id}/generate-commentary", response_model=TranslatorProject)
async def api_generate_ai_commentary(project_id: str) -> TranslatorProject:
    try:
        from ai_shorts_maker.translator import generate_ai_commentary_for_project
        project = await run_in_threadpool(generate_ai_commentary_for_project, project_id)
        return _convert_audio_paths(project)
    except Exception as exc:
        logger.exception("Failed to generate AI commentary for project %s", project_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.post("/projects/{project_id}/generate-korean-commentary", response_model=TranslatorProject)
async def api_generate_korean_ai_commentary(project_id: str) -> TranslatorProject:
    try:
        from ai_shorts_maker.translator import generate_korean_ai_commentary_for_project
        project = await run_in_threadpool(generate_korean_ai_commentary_for_project, project_id)
        return _convert_audio_paths(project)
    except Exception as exc:
        logger.exception("Failed to generate Korean AI commentary for project %s", project_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.post("/projects/{project_id}/translate", response_model=TranslatorProject)
async def api_translate_project(project_id: str) -> TranslatorProject:
    try:
        project = await run_in_threadpool(translate_project_segments, project_id)
        return _convert_audio_paths(project)
    except Exception as exc:
        logger.exception("Failed to run translation for project %s", project_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.post("/projects/{project_id}/translate-segments", response_model=TranslatorProject)
async def api_translate_segments(project_id: str, payload: Dict[str, Any] = Body(...)) -> TranslatorProject:
    try:
        segment_ids = payload.get("segment_ids", [])
        target_lang = payload.get("target_lang", "ja")
        translation_mode = payload.get("translation_mode", "reinterpret")
        tone_hint = payload.get("tone_hint")

        from ai_shorts_maker.translator import translate_selected_segments

        project = await run_in_threadpool(
            translate_selected_segments,
            project_id,
            segment_ids,
            target_lang,
            translation_mode,
            tone_hint
        )
        return _convert_audio_paths(project)
    except Exception as exc:
        logger.exception("Failed to translate segments for project %s", project_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.post("/projects/{project_id}/voice", response_model=TranslatorProject)
async def api_synthesize_voice(project_id: str) -> TranslatorProject:
    try:
        project = await run_in_threadpool(synthesize_voice_for_project, project_id)
        return _convert_audio_paths(project)
    except Exception as exc:
        logger.exception("Failed to run voice synthesis for project %s", project_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.post("/projects/{project_id}/render", response_model=TranslatorProject)
async def api_render_project(project_id: str) -> TranslatorProject:
    try:
        project = await run_in_threadpool(render_translated_project, project_id)
        return _convert_audio_paths(project)
    except Exception as exc:
        logger.exception("Failed to run render for project %s", project_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.get("/projects/{project_id}/versions")
async def api_list_translation_versions(project_id: str):
    try:
        return await run_in_threadpool(list_translation_versions, project_id)
    except Exception as exc:
        logger.exception("Failed to list translation versions for project %s", project_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.get("/projects/{project_id}/versions/{version}")
async def api_get_translation_version(project_id: str, version: int):
    try:
        result = await run_in_threadpool(load_translation_version, project_id, version)
        if result is None:
            raise HTTPException(status_code=404, detail=f"Version {version} not found")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to load translation version %s for project %s", version, project_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.post("/projects/{project_id}/reverse-translate")
async def api_reverse_translate(project_id: str, payload: Dict[str, Any] = Body(...)):
    try:
        segment_id = payload.get("segment_id")
        japanese_text = payload.get("japanese_text", "").strip()

        if not japanese_text:
            raise HTTPException(status_code=400, detail="Japanese text is required")

        # Use the existing translate_project_segments function with reverse parameters
        from ai_shorts_maker.translator import translate_text, update_segment_text

        korean_text = await run_in_threadpool(
            translate_text,
            japanese_text,
            target_lang="ko",  # Japanese to Korean
            translation_mode="literal",
            tone_hint=None
        )

        # Update segment with reverse translated text
        if segment_id:
            await run_in_threadpool(
                update_segment_text,
                project_id,
                segment_id,
                "reverse_translated",
                korean_text
            )

        return {"korean_text": korean_text}

    except Exception as exc:
        logger.exception("Failed to reverse translate text for project %s", project_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.post("/projects/{project_id}/reverse-translate-segments", response_model=TranslatorProject)
async def api_reverse_translate_segments(project_id: str, payload: Dict[str, Any] = Body(...)) -> TranslatorProject:
    """선택된 세그먼트를 일본어에서 한국어로 역번역합니다."""
    try:
        from ai_shorts_maker.translator import translate_selected_segments

        segment_ids = payload.get("segment_ids", [])

        updated_project = await run_in_threadpool(
            translate_selected_segments,
            project_id=project_id,
            segment_ids=segment_ids,
            target_lang="ko",
            translation_mode="literal",
            tone_hint=None
        )

        return _convert_audio_paths(updated_project)

    except FileNotFoundError as exc:
        logger.exception("Project %s not found", project_id)
        raise HTTPException(status_code=404, detail=f"Translator project '{project_id}' not found.") from exc
    except Exception as exc:
        logger.exception("Failed to reverse translate segments for project %s", project_id)
        raise HTTPException(status_code=500, detail=f"Failed to reverse translate segments: {str(exc)}") from exc


@translator_router.patch("/projects/{project_id}/segments")
async def api_update_segment_text(project_id: str, payload: Dict[str, Any] = Body(...)):
    try:
        segment_id = payload.get("segment_id")
        text_type = payload.get("text_type")
        text_value = payload.get("text_value", "")

        if not segment_id or not text_type:
            raise HTTPException(status_code=400, detail="segment_id and text_type are required")

        from ai_shorts_maker.translator import update_segment_text

        await run_in_threadpool(update_segment_text, project_id, segment_id, text_type, text_value)

        return {"success": True}

    except Exception as exc:
        logger.exception("Failed to update segment text for project %s", project_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.post("/projects/{project_id}/reorder-segments")
async def api_reorder_segments(project_id: str, payload: Dict[str, Any] = Body(...)):
    try:
        segment_orders = payload.get("segment_orders")

        if not segment_orders:
            raise HTTPException(status_code=400, detail="segment_orders is required")

        from ai_shorts_maker.translator import reorder_project_segments

        project = await run_in_threadpool(reorder_project_segments, project_id, segment_orders)
        return _convert_audio_paths(project)

    except Exception as exc:
        logger.exception("Failed to reorder segments for project %s", project_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.post("/projects/{project_id}/apply-saved-result", response_model=TranslatorProject)
async def api_apply_saved_result(project_id: str, payload: Dict[str, Any] = Body(...)) -> TranslatorProject:
    saved_result = payload.get("saved_result")
    if not isinstance(saved_result, dict):
        raise HTTPException(status_code=400, detail="saved_result 데이터가 필요합니다")

    try:
        project = await run_in_threadpool(apply_saved_result_to_project, project_id, saved_result)
        return _convert_audio_paths(project)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Failed to apply saved result to project %s", project_id)
        raise HTTPException(status_code=500, detail="재해석 결과를 적용하지 못했습니다") from exc


@translator_router.delete("/projects/{project_id}/segments/{segment_id}", response_model=TranslatorProject)
async def api_delete_segment(project_id: str, segment_id: str) -> TranslatorProject:
    try:
        project = await run_in_threadpool(delete_project_segment, project_id, segment_id)
        return _convert_audio_paths(project)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Failed to delete segment %s for project %s", segment_id, project_id)
        raise HTTPException(status_code=500, detail="세그먼트를 삭제하지 못했습니다") from exc


@translator_router.get("/saved-results")
def api_list_saved_results() -> Dict[str, Any]:
    entries: List[Dict[str, Any]] = []
    for path in sorted(SAVED_RESULTS_DIR.glob("*.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:  # pylint: disable=broad-except
            logger.warning("Failed to read saved result %s: %s", path, exc)
            continue

        entries.append({
            "id": path.stem,
            "name": data.get("name"),
            "saved_at": data.get("saved_at"),
        })

    return {"results": entries}


@translator_router.get("/saved-results/{result_id}")
def api_get_saved_result(result_id: str) -> Dict[str, Any]:
    safe_id = ''.join(ch for ch in result_id if ch.isalnum() or ch in {'-', '_'})
    if not safe_id:
        raise HTTPException(status_code=400, detail="잘못된 저장본 ID 입니다")

    path = SAVED_RESULTS_DIR / f"{safe_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="저장본을 찾을 수 없습니다")

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Failed to load saved result %s", path)
        raise HTTPException(status_code=500, detail="저장본을 불러오지 못했습니다") from exc

    return {"result": data}


@translator_router.post("/projects/{project_id}/reset-to-translated")
async def api_reset_to_translated(project_id: str):
    try:
        from ai_shorts_maker.translator import reset_project_to_translated

        project = await run_in_threadpool(reset_project_to_translated, project_id)
        return _convert_audio_paths(project)

    except Exception as exc:
        logger.exception("Failed to reset project %s to translated state", project_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.patch("/projects/{project_id}/segments/time")
async def api_update_segment_time(project_id: str, payload: Dict[str, Any] = Body(...)):
    try:
        segment_id = payload.get("segment_id")
        start_time = payload.get("start_time")
        end_time = payload.get("end_time")

        if not segment_id or start_time is None or end_time is None:
            raise HTTPException(status_code=400, detail="segment_id, start_time, and end_time are required")

        if start_time >= end_time:
            raise HTTPException(status_code=400, detail="start_time must be less than end_time")

        if start_time < 0 or end_time < 0:
            raise HTTPException(status_code=400, detail="times must be non-negative")

        from ai_shorts_maker.translator import update_segment_time

        await run_in_threadpool(update_segment_time, project_id, segment_id, float(start_time), float(end_time))

        return {"success": True}

    except Exception as exc:
        logger.exception("Failed to update segment time for project %s", project_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.patch("/projects/{project_id}/voice-synthesis-mode")
async def api_update_voice_synthesis_mode(project_id: str, payload: Dict[str, Any] = Body(...)):
    try:
        voice_synthesis_mode = payload.get("voice_synthesis_mode")

        if not voice_synthesis_mode:
            raise HTTPException(status_code=400, detail="voice_synthesis_mode is required")

        if voice_synthesis_mode not in ["subtitle", "commentary", "both"]:
            raise HTTPException(status_code=400, detail="voice_synthesis_mode must be one of: subtitle, commentary, both")

        from ai_shorts_maker.translator import load_project, save_project

        project = await run_in_threadpool(load_project, project_id)
        project.voice_synthesis_mode = voice_synthesis_mode
        await run_in_threadpool(save_project, project)

        return {"success": True, "voice_synthesis_mode": voice_synthesis_mode}

    except Exception as exc:
        logger.exception("Failed to update voice synthesis mode for project %s", project_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.post("/projects/{project_id}/clone")
async def api_clone_translator_project(project_id: str, payload: Dict[str, Any] = Body(default=None)):
    """번역기 프로젝트를 복제하여 백업본을 생성합니다."""
    try:
        new_name = None
        if payload:
            new_name = payload.get("new_name")

        from ai_shorts_maker.translator import clone_translator_project_with_name

        if new_name:
            project = await run_in_threadpool(clone_translator_project_with_name, project_id, new_name)
        else:
            project = await run_in_threadpool(clone_translator_project, project_id)
        return _convert_audio_paths(project)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to clone translator project %s", project_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@translator_router.post("/projects/{project_id}/generate-selected-audio")
async def api_generate_selected_audio(project_id: str, payload: dict):
    """선택된 세그먼트들의 음성을 생성하고, 자막 시간에 맞춰 무음을 포함한 음성 파일을 생성합니다."""
    segment_ids = payload.get("segment_ids", [])
    voice = payload.get("voice", "nova")
    audio_format = payload.get("audio_format", "wav")
    task_id = payload.get("task_id")  # 선택적 task_id

    if not segment_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="segment_ids is required"
        )

    # task_id가 없으면 자동 생성
    if not task_id:
        task_id = f"{project_id}_selected_{len(segment_ids)}"

    try:
        from ai_shorts_maker.translator import generate_selected_audio_with_silence
        audio_path = await run_in_threadpool(generate_selected_audio_with_silence, project_id, segment_ids, voice, audio_format, task_id)
        return {"audio_path": _audio_path_to_url(audio_path), "task_id": task_id}
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Translator project '{project_id}' not found."
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.exception("Failed to generate selected audio for project %s", project_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate selected audio: {str(e)}"
        )


@translator_router.post("/projects/{project_id}/generate-all-audio", response_model=TranslatorProject)
async def api_generate_all_audio(project_id: str, payload: dict) -> TranslatorProject:
    """모든 세그먼트에 대해 음성 파일을 생성합니다."""
    voice = payload.get("voice", "nova")
    audio_format = payload.get("audio_format", "wav")
    task_id = payload.get("task_id")  # 선택적 task_id

    try:
        from ai_shorts_maker.translator import generate_all_audio
        updated_project = await run_in_threadpool(generate_all_audio, project_id, voice, audio_format, task_id)
        return _convert_audio_paths(updated_project)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Translator project '{project_id}' not found."
        )
    except Exception as e:
        logger.exception("Failed to generate all audio for project %s", project_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate all audio: {str(e)}"
        )


@translator_router.get("/audio-progress/{task_id}")
async def api_get_audio_progress(task_id: str):
    """음성 생성 진행률을 조회합니다."""
    try:
        from ai_shorts_maker.translator import get_audio_generation_progress
        progress = get_audio_generation_progress(task_id)
        if progress is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task '{task_id}' not found."
            )
        return progress
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get audio progress for task %s", task_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get audio progress: {str(e)}"
        )


@translator_router.get("/projects/{project_id}/load-generated-tracks")
async def api_load_generated_tracks(project_id: str):
    """생성된 음성 트랙 파일들을 불러옵니다."""
    try:
        from ai_shorts_maker.translator import TRANSLATOR_DIR
        import re

        project = await run_in_threadpool(translator_load_project, project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Translator project '{project_id}' not found."
            )

        audio_dir = TRANSLATOR_DIR / project_id / "audio"
        if not audio_dir.exists():
            return {"tracks": []}

        # 생성된 음성 파일 찾기
        tracks = []

        # 1. 선택 세그먼트 음성 파일들 찾기 (selected_audio_*_segments.*)
        selected_audio_files = sorted(audio_dir.glob("selected_audio_*_segments.*"))
        for audio_file in selected_audio_files:
            try:
                output_dir = TRANSLATOR_DIR.parent
                relative_path = audio_file.relative_to(output_dir)
                audio_url = f"/outputs/{relative_path.as_posix()}"

                # 파일명에서 세그먼트 개수 추출
                match = re.search(r"selected_audio_(\d+)_segments", audio_file.name)
                segment_count = int(match.group(1)) if match else 0

                tracks.append({
                    "type": "selected",
                    "path": audio_url,
                    "filename": audio_file.name,
                    "segment_count": segment_count,
                    "created_at": audio_file.stat().st_mtime,
                    "file_path": str(audio_file)  # 삭제를 위한 전체 경로
                })
            except Exception as e:
                logger.warning(f"Failed to process audio file {audio_file}: {e}")

        return {"tracks": tracks}

    except HTTPException:
        raise
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Translator project '{project_id}' not found."
        )
    except Exception as e:
        logger.exception("Failed to load generated tracks for project %s", project_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load generated tracks: {str(e)}"
        )


@translator_router.delete("/projects/{project_id}/tracks")
async def api_delete_track(project_id: str, file_path: str = Body(..., embed=True)):
    """트랙 파일을 삭제합니다."""
    try:
        from ai_shorts_maker.translator import TRANSLATOR_DIR
        from pathlib import Path

        # 보안: 프로젝트 디렉터리 내의 파일만 삭제 가능
        track_path = Path(file_path)
        project_audio_dir = TRANSLATOR_DIR / project_id / "audio"

        if not track_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Track file not found."
            )

        # 보안 체크: 파일이 프로젝트 audio 디렉터리 내에 있는지 확인
        try:
            track_path.relative_to(project_audio_dir)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot delete files outside project directory."
            )

        # 파일 삭제
        track_path.unlink()
        logger.info(f"Deleted track file: {track_path}")

        return {"success": True, "message": "Track deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to delete track for project %s", project_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete track: {str(e)}"
        )


app.include_router(translator_router)

# Import and include additional translator routes
from web_app.routers import translator as additional_translator_router
app.include_router(additional_translator_router.router)

# Video Editor Router
video_editor_router = APIRouter(prefix="/api/video-editor", tags=["video-editor"])


class VideoProcessRequest(BaseModel):
    project_id: str
    video_path: str
    template: str
    subtitle_type: str = "translated"  # translated, original, reverse, external
    external_subtitle_path: Optional[str] = None  # 외부 자막 파일 경로


@video_editor_router.post("/process")
async def api_process_video(payload: VideoProcessRequest) -> Dict[str, Any]:
    try:
        # 프로젝트 로드
        project = await run_in_threadpool(translator_load_project, payload.project_id)

        # 영상 처리 실행
        result = await run_in_threadpool(
            process_video_with_subtitles,
            payload.project_id,
            payload.video_path,
            payload.template,
            payload.subtitle_type,
            project,
            payload.external_subtitle_path
        )

        return {"success": True, "result": result}
    except Exception as exc:
        logger.exception("Failed to process video for project %s", payload.project_id)
        return {"success": False, "error": str(exc)}


@video_editor_router.get("/subtitle-preview")
async def api_subtitle_preview(path: str) -> Dict[str, Any]:
    """외부 자막 파일의 미리보기를 제공"""
    try:
        subtitle_path = Path(path)

        if not subtitle_path.exists():
            return {"success": False, "error": "파일을 찾을 수 없습니다"}

        if not subtitle_path.suffix.lower() in ['.srt', '.vtt', '.ass']:
            return {"success": False, "error": "지원하지 않는 자막 파일 형식입니다"}

        # 파일 크기 체크 (10MB 제한)
        if subtitle_path.stat().st_size > 10 * 1024 * 1024:
            return {"success": False, "error": "파일이 너무 큽니다"}

        # 파일 내용 읽기 (처음 1000자만)
        with open(subtitle_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read(1000)

        # 줄 단위로 나누어 처음 10줄만 보여주기
        lines = content.split('\n')[:10]
        preview = '\n'.join(lines)

        if len(content) >= 1000:
            preview += "\n\n... (더 많은 내용이 있습니다)"

        return {"success": True, "preview": preview}

    except Exception as exc:
        logger.exception("Failed to load subtitle preview")
        return {"success": False, "error": str(exc)}


app.include_router(video_editor_router)


def process_video_with_subtitles(project_id: str, video_path: str, template: str, subtitle_type: str, project: Any, external_subtitle_path: Optional[str] = None) -> Dict[str, Any]:
    """영상에 번역된 자막을 합성하는 함수"""
    from pathlib import Path
    import tempfile
    import os

    try:
        # 출력 디렉토리 설정
        output_dir = PACKAGE_DIR / "outputs" / "video_editor"
        output_dir.mkdir(parents=True, exist_ok=True)

        # SRT 파일 생성 (선택된 자막 타입 사용)
        if subtitle_type == "external" and external_subtitle_path:
            # 외부 자막 파일 사용
            srt_file_path = external_subtitle_path
        else:
            # 프로젝트 자막 사용
            srt_content = generate_srt_from_project(project, subtitle_type)

            # 임시 SRT 파일 생성
            with tempfile.NamedTemporaryFile(mode='w', suffix='.srt', delete=False, encoding='utf-8') as srt_file:
                srt_file.write(srt_content)
                srt_file_path = srt_file.name

        # 출력 파일명 생성
        video_name = Path(video_path).stem
        output_filename = f"{project_id}_{video_name}_{template}.mp4"
        output_path = output_dir / output_filename

        # FFmpeg 명령어 구성 (템플릿에 따른 자막 스타일)
        project_language = getattr(project, "target_lang", None) or getattr(project, "language", None)
        subtitle_style = get_subtitle_style_for_template(template, project_language)

        ffmpeg_cmd = [
            'ffmpeg', '-y',  # -y: 출력 파일 덮어쓰기
            '-i', video_path,  # 입력 영상
            '-vf', f"subtitles={srt_file_path}:force_style='{subtitle_style}'",  # 자막 필터
            '-c:a', 'copy',  # 오디오 복사
            str(output_path)  # 출력 경로
        ]

        # FFmpeg 실행
        logger.info(f"Running FFmpeg command: {' '.join(ffmpeg_cmd)}")
        result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True, check=True)

        # 임시 파일 정리 (외부 파일이 아닌 경우만)
        if subtitle_type != "external":
            os.unlink(srt_file_path)

        return {
            "output_path": str(output_path),
            "output_filename": output_filename,
            "template_used": template,
            "video_duration": get_video_duration(video_path)
        }

    except subprocess.CalledProcessError as exc:
        logger.error(f"FFmpeg error: {exc.stderr}")
        raise RuntimeError(f"영상 처리 중 오류 발생: {exc.stderr}")
    except Exception as exc:
        logger.exception("Video processing failed")
        raise RuntimeError(f"영상 처리 실패: {str(exc)}")


def generate_srt_from_project(project: Any, subtitle_type: str = "translated") -> str:
    """프로젝트의 세그먼트에서 SRT 형식의 자막 생성"""
    srt_lines = []

    for i, segment in enumerate(project.segments, 1):
        # 세그먼트 속성 이름 확인 (start/end vs start_time/end_time)
        start_time = getattr(segment, 'start', getattr(segment, 'start_time', 0))
        end_time = getattr(segment, 'end', getattr(segment, 'end_time', 1))

        # 선택된 자막 타입에 따라 텍스트 선택
        if subtitle_type == "original":
            text = getattr(segment, 'source_text', None)
        elif subtitle_type == "reverse":
            text = getattr(segment, 'reverse_translated_text', None)
        else:  # translated (기본값)
            text = getattr(segment, 'translated_text', None)

        # 텍스트가 없으면 다른 텍스트로 대체
        if not text:
            text = getattr(segment, 'translated_text', None) or \
                   getattr(segment, 'source_text', None) or \
                   getattr(segment, 'original_text', '(자막 없음)')

        # 시간을 SRT 형식으로 변환 (HH:MM:SS,mmm)
        start_srt = format_time_for_srt(start_time)
        end_srt = format_time_for_srt(end_time)

        srt_lines.append(str(i))
        srt_lines.append(f"{start_srt} --> {end_srt}")
        srt_lines.append(text)
        srt_lines.append("")  # 빈 줄

    return "\n".join(srt_lines)


def format_time_for_srt(seconds: float) -> str:
    """초를 SRT 형식의 타임코드로 변환"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millisecs = int((seconds - int(seconds)) * 1000)

    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millisecs:03d}"


def _font_family_installed(family: str) -> bool:
    """fontconfig를 통해 지정한 폰트 패밀리 사용 가능 여부 확인"""
    try:
        result = subprocess.run(
            ["fc-match", "--format=%{family}", family],
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        # fontconfig가 없는 환경에서는 확인 불가이지만, 일단 시도한다.
        return True
    matched = (result.stdout or "").strip()
    return bool(matched)


def _detect_font_family(language: Optional[str]) -> Optional[str]:
    """자막 언어별로 적합한 폰트 패밀리를 탐색"""
    lang = (language or "").lower()
    candidates: List[str] = []

    if lang.startswith("ja"):
        candidates.extend(
            [
                "Noto Sans CJK JP",
                "Noto Sans JP",
                "Noto Serif CJK JP",
                "Noto Serif JP",
                "Droid Sans Japanese",
                "IPAGothic",
                "TakaoPGothic",
            ]
        )
    elif lang.startswith("ko"):
        candidates.extend(
            [
                "Noto Sans CJK KR",
                "NanumGothic",
                "NanumSquare",
                "NanumSquareRound",
                "NanumGothicCoding",
            ]
        )
    else:
        candidates.extend(
            [
                "Noto Sans CJK KR",
                "Noto Sans CJK JP",
                "DejaVu Sans",
            ]
        )

    # 모든 언어에서 사용할 수 있는 일반 후보 추가
    candidates.extend(
        [
            "Noto Sans CJK KR",
            "Noto Sans CJK JP",
            "Noto Sans CJK SC",
        ]
    )

    for family in candidates:
        if _font_family_installed(family):
            return family
    return None


def get_subtitle_style_for_template(template: str, language: Optional[str] = None) -> str:
    """템플릿에 따른 자막 스타일 반환"""
    styles = {
        "classic": "FontSize=24,PrimaryColour=&Hffffff,OutlineColour=&H000000,BackColour=&H80000000,Bold=1,Outline=2,Shadow=1,Alignment=2,MarginV=20",
        "banner": "FontSize=26,PrimaryColour=&Hffffff,OutlineColour=&H000000,BackColour=&H80ff0000,Bold=1,Outline=2,Shadow=1,Alignment=2,MarginV=300",
    }
    base_style = styles.get(template, styles["classic"])
    font_family = _detect_font_family(language)
    if font_family:
        return f"{base_style},FontName={font_family}"
    return base_style


def get_video_duration(video_path: str) -> Optional[float]:
    """영상의 지속시간을 초 단위로 반환"""
    try:
        import subprocess
        cmd = ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', video_path]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        import json
        data = json.loads(result.stdout)
        return float(data['format']['duration'])
    except Exception as exc:
        logger.warning(f"Failed to get video duration: {exc}")
        return None


def default_ytdl_form() -> Dict[str, Any]:
    settings = load_ytdl_settings()
    return {
        "urls": "",
        **settings,
    }


def load_ytdl_settings() -> Dict[str, Any]:
    settings = DEFAULT_YTDL_SETTINGS.copy()
    if YTDL_SETTINGS_PATH.exists():
        try:
            data = json.loads(YTDL_SETTINGS_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                for key, value in data.items():
                    if key in settings:
                        if isinstance(settings[key], bool):
                            settings[key] = bool(value)
                        else:
                            settings[key] = value
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Failed to load YTDL settings: %s", exc)
    return settings


def save_ytdl_settings(values: Dict[str, Any]) -> None:
    payload = {}
    for key in DEFAULT_YTDL_SETTINGS:
        if key not in values:
            continue
        original = DEFAULT_YTDL_SETTINGS[key]
        value = values[key]
        if isinstance(original, bool):
            payload[key] = bool(value)
        else:
            payload[key] = value
    try:
        YTDL_SETTINGS_PATH.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError as exc:
        logger.warning("Failed to save YTDL settings: %s", exc)


def load_download_history() -> List[Dict[str, Any]]:
    """Load download history from JSON file."""
    if not YTDL_HISTORY_PATH.exists():
        return []
    try:
        data = json.loads(YTDL_HISTORY_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Failed to load download history: %s", exc)
        return []


def save_download_history(history: List[Dict[str, Any]]) -> None:
    """Save download history to JSON file."""
    try:
        YTDL_HISTORY_PATH.write_text(
            json.dumps(history, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError as exc:
        logger.warning("Failed to save download history: %s", exc)


def extract_audio_sources(
    video_files: List[Path],
    extract_vocal: bool,
    extract_instruments: bool,
    progress_callback: Optional[Callable[[int, int, str], None]] = None
) -> List[Path]:
    """
    Extract vocal and/or instruments from video files using demucs.

    Args:
        video_files: List of video file paths
        extract_vocal: Whether to extract vocal track
        extract_instruments: Whether to extract instruments track
        progress_callback: Optional callback(current, total, message)

    Returns:
        List of extracted audio file paths
    """
    import subprocess

    extracted_files = []

    # 비디오 파일만 필터링 (자막 파일 제외)
    video_extensions = {".mp4", ".webm", ".mkv", ".avi", ".mov"}
    videos = [f for f in video_files if f.suffix.lower() in video_extensions]

    total_files = len(videos)

    for idx, video_path in enumerate(videos, 1):
        try:
            if progress_callback:
                progress_callback(idx, total_files, f"오디오 추출 중 ({idx}/{total_files}): {video_path.name}")

            # 먼저 비디오에서 오디오 추출
            audio_path = video_path.with_suffix(".wav")

            # ffmpeg로 오디오 추출
            cmd = [
                "ffmpeg",
                "-i", str(video_path),
                "-vn",  # 비디오 스트림 제외
                "-acodec", "pcm_s16le",  # WAV format
                "-ar", "44100",  # 샘플링 레이트
                "-ac", "2",  # 스테레오
                "-y",  # 덮어쓰기
                str(audio_path),
            ]

            subprocess.run(cmd, check=True, capture_output=True)

            if progress_callback:
                progress_callback(idx, total_files, f"Vocal/Instruments 분리 중 ({idx}/{total_files}): {video_path.name}")

            # demucs로 오디오 분리
            output_dir = video_path.parent / "separated"
            output_dir.mkdir(exist_ok=True)

            demucs_cmd = [
                "demucs",
                "--two-stems", "vocals",  # vocal과 나머지(instruments)로 분리
                "-o", str(output_dir),
                str(audio_path),
            ]

            try:
                subprocess.run(demucs_cmd, check=True, capture_output=True)

                # demucs 출력 경로 (htdemucs 모델 사용)
                stem_dir = output_dir / "htdemucs" / audio_path.stem

                if extract_vocal:
                    vocal_file = stem_dir / "vocals.wav"
                    if vocal_file.exists():
                        # 파일 이름 변경 (🎤 이모지로 vocal 명확히 표시)
                        final_vocal = video_path.with_name(
                            f"{video_path.stem}__🎤VOCAL.wav"
                        )
                        vocal_file.rename(final_vocal)
                        extracted_files.append(final_vocal)

                if extract_instruments:
                    instruments_file = stem_dir / "no_vocals.wav"
                    if instruments_file.exists():
                        # 파일 이름 변경 (🎸 이모지로 instruments 명확히 표시)
                        final_instruments = video_path.with_name(
                            f"{video_path.stem}__🎸INSTRUMENTS.wav"
                        )
                        instruments_file.rename(final_instruments)
                        extracted_files.append(final_instruments)

                # 정리: separated 폴더 삭제
                import shutil
                if output_dir.exists():
                    shutil.rmtree(output_dir)

            except subprocess.CalledProcessError:
                logger.warning(f"demucs not available, skipping audio separation for {video_path}")

            # 임시 오디오 파일 삭제
            if audio_path.exists():
                audio_path.unlink()

        except Exception as e:
            logger.warning(f"Failed to extract audio from {video_path}: {e}")
            continue

    return extracted_files


def add_to_download_history(urls: List[str], files: List[Path], settings: Dict[str, Any]) -> None:
    """Add download record to history."""
    history = load_download_history()

    download_record = {
        "timestamp": datetime.now().isoformat(),
        "urls": urls,
        "files": [str(f) for f in files],
        "settings": {
            "output_dir": settings.get("output_dir"),
            "sub_langs": settings.get("sub_langs"),
            "download_subs": settings.get("download_subs"),
            "auto_subs": settings.get("auto_subs"),
        }
    }

    history.insert(0, download_record)  # Add to beginning
    # Keep only last 100 records
    history = history[:100]

    save_download_history(history)


def delete_download_files(file_paths: List[str]) -> Dict[str, Any]:
    """Delete downloaded files and return result."""
    deleted = []
    errors = []

    for file_path in file_paths:
        try:
            path = Path(file_path)
            if path.exists():
                path.unlink()
                deleted.append(file_path)

                # Also try to delete related files (subtitles, etc.)
                base_name = path.stem
                parent_dir = path.parent
                for related_file in parent_dir.glob(f"{base_name}.*"):
                    if related_file != path and related_file.exists():
                        related_file.unlink()
                        deleted.append(str(related_file))
            else:
                errors.append(f"File not found: {file_path}")
        except Exception as exc:
            errors.append(f"Error deleting {file_path}: {str(exc)}")

    return {"deleted": deleted, "errors": errors}


TRANSLATOR_SETTINGS_PATH = BASE_DIR / "translator_settings.json"
DEFAULT_TRANSLATOR_SETTINGS: Dict[str, Any] = {
    "target_lang": "ja",
    "translation_mode": "reinterpret",
    "tone_hint": "드라마하고 유쾌하먼서 유머러스하게",
}

def load_translator_settings() -> Dict[str, Any]:
    settings = DEFAULT_TRANSLATOR_SETTINGS.copy()
    if TRANSLATOR_SETTINGS_PATH.exists():
        try:
            data = json.loads(TRANSLATOR_SETTINGS_PATH.read_text(encoding="utf-8"))
            if isinstance(data, dict):
                settings.update(data)
        except (OSError, json.JSONDecodeError) as exc:
            logger.warning("Failed to load Translator settings: %s", exc)
    return settings

def save_translator_settings(values: Dict[str, Any]) -> None:
    payload = {}
    for key in DEFAULT_TRANSLATOR_SETTINGS:
        if key in values and values[key] is not None:
            payload[key] = values[key]
    try:
        TRANSLATOR_SETTINGS_PATH.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError as exc:
        logger.warning("Failed to save Translator settings: %s", exc)


def _split_urls(raw: str) -> List[str]:
    return [line.strip() for line in raw.replace("\r", "\n").splitlines() if line.strip()]


@app.get("/text-removal", response_class=HTMLResponse)
async def text_removal_page(request: Request) -> HTMLResponse:
    context = {
        "request": request,
        "nav_active": "text_removal",
        "torch_cuda_available": torch.cuda.is_available() if torch is not None else False,
    }
    return templates.TemplateResponse("text_removal.html", context)


@app.post("/api/text-removal/preview")
async def text_removal_preview(video: UploadFile = File(...)) -> Dict[str, Any]:
    """Store uploaded video and return the first-frame preview."""

    if cv2 is None:
        raise HTTPException(
            status_code=500,
            detail="OpenCV(opencv-contrib-python) 패키지가 설치되어 있어야 합니다.",
        )

    if not video.filename:
        raise HTTPException(status_code=400, detail="업로드할 영상 파일을 선택하세요.")

    session_id = uuid4().hex
    session_dir = TEXT_REMOVAL_UPLOAD_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(video.filename).suffix or ".mp4"
    input_path = session_dir / f"input{suffix}"

    try:
        file_bytes = await video.read()
        input_path.write_bytes(file_bytes)
    except Exception as exc:  # pragma: no cover - filesystem failure
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"영상 파일을 저장하지 못했습니다: {exc}",
        ) from exc

    try:
        frame, fps, frame_count, width, height, original_path, processed_path = prepare_video_preview(
            input_path, session_dir
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    success, buffer = cv2.imencode(".png", frame)
    if not success:
        raise HTTPException(status_code=500, detail="미리보기 이미지를 생성하지 못했습니다.")

    preview_image = base64.b64encode(buffer).decode("ascii")

    meta = {
        "input_path": str(original_path),
        "processed_path": str(processed_path),
        "original_filename": video.filename,
        "fps": fps,
        "frame_count": frame_count,
        "width": width,
        "height": height,
        "transcoded": processed_path != original_path,
    }
    (session_dir / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return {
        "session_id": session_id,
        "preview_image": f"data:image/png;base64,{preview_image}",
        "fps": fps,
        "frame_count": frame_count,
        "width": width,
        "height": height,
        "message": "미리보기를 생성했습니다.",
        "transcoded": processed_path != original_path,
    }


@app.post("/api/text-removal/process")
async def text_removal_process(payload: TextRemovalProcessRequest) -> Dict[str, Any]:
    if cv2 is None:
        raise HTTPException(
            status_code=500,
            detail="OpenCV(opencv-contrib-python) 패키지가 설치되어 있어야 합니다.",
        )

    session_dir = TEXT_REMOVAL_UPLOAD_DIR / payload.session_id
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다. 먼저 영상을 업로드하세요.")

    meta_path = session_dir / "meta.json"
    if not meta_path.exists():
        raise HTTPException(status_code=400, detail="세션 정보가 손상되었습니다. 다시 시도하세요.")

    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="세션 정보를 읽을 수 없습니다.") from exc

    processed_path_str = meta.get("processed_path") or meta.get("input_path")
    if not processed_path_str:
        raise HTTPException(status_code=400, detail="업로드된 영상 파일을 찾을 수 없습니다.")

    source_path = Path(processed_path_str)
    if not source_path.exists():
        source_path = Path(meta.get("input_path", processed_path_str))
    if not source_path.exists():
        raise HTTPException(status_code=400, detail="업로드된 영상 파일을 찾을 수 없습니다.")

    trim_start = float(meta.get("trim_start", 0.0) or 0.0)
    trim_duration = float(meta.get("trim_duration", 4.0) or 4.0)
    trimmed_path_str = meta.get("trimmed_path")
    trimmed_path = Path(trimmed_path_str) if trimmed_path_str else session_dir / "input_trimmed.mp4"

    effective_source = source_path
    if not trimmed_path.exists():
        try:
            trimmed_path, effective_source = trim_video_clip(
                source_path, trimmed_path, duration=trim_duration, start=trim_start
            )
        except Exception as exc:  # pylint: disable=broad-except
            logger.exception("Failed to trim video clip: %s", exc)
            raise HTTPException(
                status_code=500,
                detail=f"영상 트리밍에 실패했습니다: {exc}",
            ) from exc

    if trimmed_path.exists() and trimmed_path.stat().st_size == 0:
        trimmed_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=500,
            detail="트리밍된 클립이 비어 있습니다. 시작 시간과 길이를 조정해 다시 시도하세요.",
        )

    if effective_source != source_path:
        meta["processed_path"] = str(effective_source)

    if trimmed_path.exists():
        meta.update(
            {
                "trimmed_path": str(trimmed_path),
                "trim_start": trim_start,
                "trim_duration": trim_duration,
            }
        )
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    video_path = trimmed_path if trimmed_path.exists() else effective_source

    if not payload.boxes:
        raise HTTPException(status_code=400, detail="인페인팅할 영역을 최소 1개 이상 지정하세요.")

    output_path = session_dir / "restored.mp4"

    effective_max_frames = payload.max_frames if payload.max_frames and payload.max_frames > 0 else None

    config = RemovalConfig(
        video_path=video_path,
        output_path=output_path,
        boxes=[(box.x, box.y, box.width, box.height) for box in payload.boxes],
        model_id=payload.model_id,
        prompt=payload.prompt,
        negative_prompt=payload.negative_prompt,
        strength=payload.strength,
        guidance_scale=payload.guidance_scale,
        num_inference_steps=payload.num_inference_steps,
        dilate_radius=payload.dilate,
        device=payload.device,
        dtype=payload.dtype,
        seed=payload.seed,
        fps_override=payload.fps,
        max_frames=effective_max_frames,
    )

    try:
        await run_in_threadpool(run_text_removal, config)
    except DiffusionUnavailableError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except TrackerUnavailableError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Text removal failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"영상 처리 중 오류가 발생했습니다: {exc}",
        ) from exc

    if effective_source != source_path:
        meta["processed_path"] = str(effective_source)

    meta.update(
        {
            "output_path": str(output_path),
            "prompt": payload.prompt,
            "negative_prompt": payload.negative_prompt,
            "boxes": [box.model_dump() for box in payload.boxes],
            "strength": payload.strength,
            "guidance_scale": payload.guidance_scale,
            "num_inference_steps": payload.num_inference_steps,
            "dilate": payload.dilate,
            "max_frames": effective_max_frames,
            "trimmed_path": str(trimmed_path),
            "trim_start": trim_start,
            "trim_duration": trim_duration,
        }
    )
    meta_path.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return {
        "session_id": payload.session_id,
        "video_url": f"/api/text-removal/download/{payload.session_id}",
        "output_path": str(output_path),
        "message": "영상 인페인팅이 완료되었습니다.",
    }


@app.post("/api/text-removal/fill-background")
async def text_removal_fill_background(payload: TextRemovalFillRequest) -> Dict[str, Any]:
    if cv2 is None:
        raise HTTPException(
            status_code=500,
            detail="OpenCV(opencv-contrib-python) 패키지가 설치되어 있어야 합니다.",
        )

    session_dir = TEXT_REMOVAL_UPLOAD_DIR / payload.session_id
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다. 먼저 영상을 업로드하세요.")

    meta_path = session_dir / "meta.json"
    if not meta_path.exists():
        raise HTTPException(status_code=400, detail="세션 정보가 손상되었습니다. 다시 시도하세요.")

    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="세션 정보를 읽을 수 없습니다.") from exc

    processed_path_str = meta.get("processed_path") or meta.get("input_path")
    if not processed_path_str:
        raise HTTPException(status_code=400, detail="업로드된 영상 파일을 찾을 수 없습니다.")

    video_path = Path(meta.get("trimmed_path") or processed_path_str)
    if not video_path.exists():
        video_path = Path(processed_path_str)
    if not video_path.exists():
        raise HTTPException(status_code=400, detail="업로드된 영상 파일을 찾을 수 없습니다.")

    if not payload.boxes:
        raise HTTPException(status_code=400, detail="가릴 영역을 최소 한 개 이상 지정하세요.")

    output_path = session_dir / "background_filled.mp4"

    effective_max_frames = payload.max_frames if payload.max_frames and payload.max_frames > 0 else None

    config = BackgroundFillConfig(
        video_path=video_path,
        output_path=output_path,
        boxes=[(box.x, box.y, box.width, box.height) for box in payload.boxes],
        dilate_radius=max(int(payload.dilate or 0), 0),
        fps_override=payload.fps,
        max_frames=effective_max_frames,
    )

    try:
        await run_in_threadpool(run_background_fill, config)
    except TrackerUnavailableError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Background fill failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"영상 처리 중 오류가 발생했습니다: {exc}",
        ) from exc

    meta.update(
        {
            "background_output_path": str(output_path),
            "background_fill_dilate": max(int(payload.dilate or 0), 0),
            "background_boxes": [box.model_dump() for box in payload.boxes],
            "background_max_frames": effective_max_frames,
        }
    )
    meta_path.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return {
        "session_id": payload.session_id,
        "video_url": f"/api/text-removal/download/background/{payload.session_id}",
        "output_path": str(output_path),
        "message": "배경 채우기가 완료되었습니다.",
    }


@app.post("/api/text-removal/split-media")
async def text_removal_split_media(payload: TextRemovalSplitRequest) -> Dict[str, Any]:
    session_dir = TEXT_REMOVAL_UPLOAD_DIR / payload.session_id
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다. 먼저 영상을 업로드하세요.")

    meta_path = session_dir / "meta.json"
    if not meta_path.exists():
        raise HTTPException(status_code=400, detail="세션 정보가 손상되었습니다. 다시 시도하세요.")

    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="세션 정보를 읽을 수 없습니다.") from exc

    processed_path_str = meta.get("processed_path") or meta.get("input_path")
    if not processed_path_str:
        raise HTTPException(status_code=400, detail="업로드된 영상 파일을 찾을 수 없습니다.")

    video_path = Path(meta.get("trimmed_path") or processed_path_str)
    if not video_path.exists():
        video_path = Path(processed_path_str)
    if not video_path.exists():
        raise HTTPException(status_code=400, detail="업로드된 영상 파일을 찾을 수 없습니다.")

    try:
        outputs = split_media_components(video_path, session_dir)
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Media split failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"미디어 분리 중 오류가 발생했습니다: {exc}",
        ) from exc

    meta.update(
        {
            "split_audio_path": str(outputs.get("audio", "")) if outputs.get("audio") else None,
            "split_video_path": str(outputs.get("video", "")) if outputs.get("video") else None,
            "split_subtitles_path": str(outputs.get("subtitle", "")) if outputs.get("subtitle") else None,
        }
    )
    meta_path.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    audio_url = (
        f"/api/text-removal/download/split/{payload.session_id}?kind=audio"
        if outputs.get("audio")
        else None
    )
    video_url = (
        f"/api/text-removal/download/split/{payload.session_id}?kind=video"
        if outputs.get("video")
        else None
    )
    subtitle_url = (
        f"/api/text-removal/download/split/{payload.session_id}?kind=subtitle"
        if outputs.get("subtitle")
        else None
    )

    return {
        "session_id": payload.session_id,
        "audio_url": audio_url,
        "video_url": video_url,
        "subtitle_url": subtitle_url,
        "message": "음성, 영상, 자막 분리를 완료했습니다.",
    }


@app.post("/api/text-removal/trim")
async def text_removal_trim(payload: TextRemovalTrimRequest) -> Dict[str, Any]:
    session_dir = TEXT_REMOVAL_UPLOAD_DIR / payload.session_id
    if not session_dir.exists():
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다. 먼저 영상을 업로드하세요.")

    meta_path = session_dir / "meta.json"
    if not meta_path.exists():
        raise HTTPException(status_code=400, detail="세션 정보가 손상되었습니다. 다시 시도하세요.")

    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="세션 정보를 읽을 수 없습니다.") from exc

    processed_path_str = meta.get("processed_path") or meta.get("input_path")
    if not processed_path_str:
        raise HTTPException(status_code=400, detail="업로드된 영상 파일을 찾을 수 없습니다.")

    source_path = Path(processed_path_str)
    if not source_path.exists():
        source_path = Path(meta.get("input_path", processed_path_str))
    if not source_path.exists():
        raise HTTPException(status_code=400, detail="업로드된 영상 파일을 찾을 수 없습니다.")

    duration = float(payload.duration or 0.0)
    if duration <= 0:
        raise HTTPException(status_code=400, detail="잘라낼 길이가 0보다 커야 합니다.")

    start = float(payload.start or 0.0)
    if start < 0:
        raise HTTPException(status_code=400, detail="시작 시간은 0 이상이어야 합니다.")

    trimmed_path = session_dir / "input_trimmed.mp4"
    effective_source = source_path
    try:
        trimmed_path, effective_source = trim_video_clip(
            source_path, trimmed_path, duration=duration, start=start
        )
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Trim preview failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"영상 자르기에 실패했습니다: {exc}",
        ) from exc

    if trimmed_path.exists() and trimmed_path.stat().st_size == 0:
        trimmed_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="트리밍된 영상이 비어 있습니다. 다른 구간을 시도하세요.")

    if effective_source != source_path:
        meta["processed_path"] = str(effective_source)

    meta.update(
        {
            "trimmed_path": str(trimmed_path),
            "trim_start": start,
            "trim_duration": duration,
        }
    )
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "session_id": payload.session_id,
        "video_url": f"/api/text-removal/download/trim/{payload.session_id}",
        "message": "트리밍한 미리보기 영상을 준비했습니다.",
        "start": start,
        "duration": duration,
    }


@app.get("/api/text-removal/download/{session_id}")
async def text_removal_download(session_id: str) -> FileResponse:
    session_dir = TEXT_REMOVAL_UPLOAD_DIR / session_id
    meta_path = session_dir / "meta.json"
    if not session_dir.exists() or not meta_path.exists():
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    output_path = Path(meta.get("output_path", session_dir / "restored.mp4"))
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="처리된 영상이 존재하지 않습니다.")

    original_name = meta.get("original_filename", output_path.name)
    stem = Path(original_name).stem or "restored"
    download_name = f"{stem}_restored{output_path.suffix}"

    return FileResponse(output_path, filename=download_name)


@app.get("/api/text-removal/download/trim/{session_id}")
async def text_removal_download_trim(session_id: str) -> FileResponse:
    session_dir = TEXT_REMOVAL_UPLOAD_DIR / session_id
    meta_path = session_dir / "meta.json"
    if not session_dir.exists() or not meta_path.exists():
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    target_path = Path(meta.get("trimmed_path", session_dir / "input_trimmed.mp4"))
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="트리밍된 영상을 찾을 수 없습니다.")

    original_name = meta.get("original_filename", target_path.name)
    stem = Path(original_name).stem or "clip"
    download_name = f"{stem}_trimmed{target_path.suffix}"
    return FileResponse(target_path, filename=download_name)


@app.get("/api/text-removal/download/background/{session_id}")
async def text_removal_download_background(session_id: str) -> FileResponse:
    session_dir = TEXT_REMOVAL_UPLOAD_DIR / session_id
    meta_path = session_dir / "meta.json"
    if not session_dir.exists() or not meta_path.exists():
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    output_path = Path(meta.get("background_output_path", session_dir / "background_filled.mp4"))
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="배경 처리된 영상이 존재하지 않습니다.")

    original_name = meta.get("original_filename", output_path.name)
    stem = Path(original_name).stem or "restored"
    download_name = f"{stem}_background{output_path.suffix}"

    return FileResponse(output_path, filename=download_name)


@app.get("/api/text-removal/download/split/{session_id}")
async def text_removal_download_split(session_id: str, kind: str = "audio") -> FileResponse:
    session_dir = TEXT_REMOVAL_UPLOAD_DIR / session_id
    meta_path = session_dir / "meta.json"
    if not session_dir.exists() or not meta_path.exists():
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다.")

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    path_map = {
        "audio": meta.get("split_audio_path"),
        "video": meta.get("split_video_path"),
        "subtitle": meta.get("split_subtitles_path"),
    }
    target_path = path_map.get(kind)
    if not target_path:
        raise HTTPException(status_code=404, detail=f"요청한 {kind} 파일을 찾을 수 없습니다.")

    file_path = Path(target_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="요청한 파일이 존재하지 않습니다.")

    original_name = meta.get("original_filename", file_path.name)
    stem = Path(original_name).stem or "output"
    suffix = file_path.suffix
    if kind == "audio":
        download_name = f"{stem}_audio{suffix}"
    elif kind == "video":
        download_name = f"{stem}_video{suffix}"
    else:
        download_name = f"{stem}_subtitles{suffix}"

    return FileResponse(file_path, filename=download_name)


@app.get("/ytdl", response_class=HTMLResponse)
async def ytdl_index(request: Request) -> HTMLResponse:
    context = {
        "request": request,
        "form_values": default_ytdl_form(),
        "result": None,
        "error": None,
        "settings_saved": False,
        "nav_active": "ytdl",
    }
    return templates.TemplateResponse("ytdl.html", context)


@app.get("/video-analyzer", response_class=HTMLResponse)
async def video_analyzer_index(request: Request) -> HTMLResponse:
    """영상 분석기 페이지."""
    context = {
        "request": request,
        "form_values": {
            "video_path": "",
            "search_directory": "",
            "auto_search": True,
        },
        "result": None,
        "error": None,
        "nav_active": "video_analyzer",
    }
    return templates.TemplateResponse("video_analyzer.html", context)


@app.post("/video-analyzer", response_class=HTMLResponse)
async def video_analyzer_process(
    request: Request,
    video_file: Optional[UploadFile] = File(None),
    subtitle_file: Optional[UploadFile] = File(None),
    video_path: str = Form(""),
    search_directory: str = Form(""),
    auto_search: bool = Form(False),
) -> HTMLResponse:
    """영상에서 자막 추출 및 분석."""
    context = {
        "request": request,
        "form_values": {
            "video_path": video_path,
            "search_directory": search_directory,
            "auto_search": auto_search,
        },
        "result": None,
        "error": None,
        "nav_active": "video_analyzer",
    }

    try:
        # 영상 파일 처리
        video_file_path = None
        if video_file and video_file.filename:
            # 업로드된 파일 저장
            upload_dir = Path("temp_uploads")
            upload_dir.mkdir(exist_ok=True)
            video_file_path = upload_dir / f"{uuid4()}_{video_file.filename}"
            with open(video_file_path, "wb") as f:
                content = await video_file.read()
                f.write(content)
        elif video_path:
            # 경로로 지정된 파일
            video_file_path = Path(video_path)
            if not video_file_path.exists():
                raise ValueError(f"영상 파일을 찾을 수 없습니다: {video_path}")

        if not video_file_path:
            raise ValueError("영상 파일을 선택하거나 경로를 입력하세요.")

        # 자막 파일 찾기
        subtitle_path = None
        subtitles_data = []

        # 업로드된 자막 파일이 있는 경우
        if subtitle_file and subtitle_file.filename:
            upload_dir = Path("temp_uploads")
            upload_dir.mkdir(exist_ok=True)
            subtitle_path = upload_dir / f"{uuid4()}_{subtitle_file.filename}"
            with open(subtitle_path, "wb") as f:
                content = await subtitle_file.read()
                f.write(content)
        else:
            # 자막 파일 자동 검색
            search_paths = []

            logging.info(f"🔍 자막 자동 검색 시작")
            logging.info(f"  - auto_search: {auto_search}")
            logging.info(f"  - search_directory: {search_directory}")

            # 영상 파일과 같은 디렉토리에서 검색
            if video_file_path:
                import re
                video_dir = video_file_path.parent
                video_stem = video_file_path.stem
                video_id = None
                video_id_match = re.search(r'\[([a-zA-Z0-9_-]+)\]', video_file_path.name)
                if video_id_match:
                    video_id = video_id_match.group(1)

                logging.info(f"  - 영상 파일: {video_file_path.name}")
                logging.info(f"  - 영상 디렉토리: {video_dir}")
                logging.info(f"  - 비디오 ID: {video_id}")

                # 정확히 일치하는 자막 파일 우선 검색
                exact_match_paths = [
                    video_dir / f"{video_stem}.srt",
                    video_dir / f"{video_stem}.vtt",
                    video_dir / f"{video_stem}.ko.srt",
                    video_dir / f"{video_stem}.en.srt",
                ]

                # 정확히 일치하는 파일이 있는지 먼저 확인
                for path in exact_match_paths:
                    if path.exists() and path.is_file():
                        subtitle_path = path
                        logging.info(f"  ✅ 정확한 파일명 매칭: {subtitle_path.name}")
                        break

                # 정확한 매칭이 없으면, 비디오 ID 매칭 시도
                if not subtitle_path and video_id:
                    logging.info(f"  🔍 비디오 ID로 자막 검색 중: [{video_id}]")
                    # 같은 비디오 ID를 가진 자막 파일 찾기
                    for ext in [".srt", ".vtt", ".ko.srt", ".en.srt"]:
                        matching_subtitles = list(video_dir.glob(f"*[{video_id}]*{ext}"))
                        if matching_subtitles:
                            subtitle_path = matching_subtitles[0]
                            logging.info(f"  ✅ 비디오 ID 매칭: {subtitle_path.name}")
                            break

                # 비디오 ID 매칭도 실패하면, 검색 디렉토리에서 찾기
                if not subtitle_path and search_directory and auto_search:
                    logging.info(f"  🔍 검색 디렉토리에서 찾기: {search_directory}")
                    search_dir = Path(search_directory)
                    if search_dir.exists() and search_dir.is_dir():
                        # 먼저 비디오 ID로 검색
                        if video_id:
                            logging.info(f"  🔍 검색 디렉토리에서 비디오 ID로 검색: [{video_id}]")
                            for ext in [".srt", ".vtt", ".ko.srt", ".en.srt"]:
                                matching_subtitles = list(search_dir.glob(f"*[{video_id}]*{ext}"))
                                if matching_subtitles:
                                    subtitle_path = matching_subtitles[0]
                                    logging.info(f"  ✅ 검색 디렉토리에서 비디오 ID 매칭: {subtitle_path.name}")
                                    break

                        # 비디오 ID 매칭 실패 시, 파일명 유사도로 찾기
                        if not subtitle_path:
                            logging.info(f"  🔍 파일명 유사도로 자막 검색 중")
                            all_subtitle_files = []
                            for ext in [".srt", ".vtt", ".ass", ".ssa"]:
                                all_subtitle_files.extend(search_dir.glob(f"*{ext}"))

                            logging.info(f"  - 검색 디렉토리의 자막 파일 수: {len(all_subtitle_files)}")

                            # 파일명 유사도 계산 (가장 긴 공통 부분 문자열)
                            best_match = None
                            best_score = 0

                            for sub_file in all_subtitle_files:
                                # 비디오 파일명과 자막 파일명의 유사도 계산
                                common_length = len(set(video_stem.lower().split()) &
                                                    set(sub_file.stem.lower().split()))
                                if common_length > best_score:
                                    best_score = common_length
                                    best_match = sub_file

                            if best_match and best_score > 0:
                                subtitle_path = best_match
                                logging.info(f"  ✅ 유사도 매칭 (점수: {best_score}): {subtitle_path.name}")
                            else:
                                logging.info(f"  ❌ 유사한 자막 파일을 찾지 못했습니다")
                    else:
                        logging.warning(f"  ⚠️ 검색 디렉토리가 존재하지 않거나 디렉토리가 아닙니다: {search_directory}")
                elif not subtitle_path:
                    if not auto_search:
                        logging.info(f"  ⚠️ 자동 검색이 비활성화되어 있습니다")
                    elif not search_directory:
                        logging.info(f"  ⚠️ 검색 디렉토리가 지정되지 않았습니다")

        # 자막 파일 파싱
        if subtitle_path and subtitle_path.exists():
            logging.info(f"✅ 자막 파일 발견: {subtitle_path}")
            logging.info(f"  - 경로: {subtitle_path}")
            with open(subtitle_path, "r", encoding="utf-8") as f:
                content = f.read()

            # 개선된 SRT 파싱
            if subtitle_path.suffix.lower() == ".srt":
                import re

                # 정규식으로 자막 블록 추출
                # 패턴: 숫자 -> 시간 코드 -> 텍스트 (한 줄 이상)
                subtitle_pattern = r'(\d+)\s*\n(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})\s*\n((?:(?!\d+\s*\n\d{2}:\d{2}:).+\n?)+)'

                matches = re.finditer(subtitle_pattern, content, re.MULTILINE)

                for match in matches:
                    index = match.group(1)
                    start = match.group(2)
                    end = match.group(3)
                    text = match.group(4).strip()

                    # 텍스트 정리
                    # 1. 줄 단위로 분리
                    lines = text.split('\n')
                    # 2. 단독 숫자만 있는 줄 제거 (자막 번호가 섞인 경우)
                    lines = [line.strip() for line in lines if line.strip() and not line.strip().isdigit()]
                    # 3. 공백으로 연결
                    text = ' '.join(lines)

                    if text:  # 빈 텍스트가 아닌 경우만 추가
                        subtitles_data.append({
                            "start": start.strip(),
                            "end": end.strip(),
                            "text": text.strip(),
                        })

        if not subtitle_path:
            logging.error(f"❌ 자막 파일을 찾을 수 없습니다")
            logging.error(f"  - 영상 파일: {video_file_path.name if video_file_path else 'None'}")
            logging.error(f"  - 검색 디렉토리: {search_directory or '지정되지 않음'}")
            logging.error(f"  - 자동 검색: {auto_search}")
            raise ValueError("자막 파일을 찾을 수 없습니다. 자막 파일을 직접 업로드하거나 검색 폴더를 지정하세요.")

        context["result"] = {
            "video_name": video_file_path.name,
            "subtitle_file": subtitle_path.name if subtitle_path else None,
            "subtitle_count": len(subtitles_data),
            "subtitles": subtitles_data,
            "download_url": None,  # 필요시 구현
        }

    except ValueError as e:
        context["error"] = str(e)
    except Exception as e:
        logging.exception("영상 분석 중 오류 발생")
        context["error"] = f"처리 중 오류가 발생했습니다: {str(e)}"

    return templates.TemplateResponse("video_analyzer.html", context)


@app.get("/api/video-analyzer/videos")
async def api_get_video_files(folder: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get list of available video files.

    Args:
        folder: Optional folder path to search. If provided, only searches this folder.
    """
    video_files = []
    video_extensions = {".mp4", ".webm", ".mkv", ".avi", ".mov", ".flv", ".m4v", ".wmv"}

    # 폴더 파라미터가 제공된 경우 해당 폴더만 검색
    if folder:
        search_dirs = [Path(folder)]
        max_depth = 1  # 지정된 폴더는 하위 폴더를 검색하지 않음 (성능 향상)
    else:
        # 기본 검색 폴더들
        search_dirs = [
            Path("/home/sk/ws/youtubeanalysis/youtube/download"),  # 기본 폴더
        ]
        max_depth = 1  # 하위 폴더 검색하지 않음 (성능 향상)

    for search_dir in search_dirs:
        if not search_dir.exists():
            continue

        try:
            # 모든 경우에 직접 하위 파일만 검색 (하위 폴더 검색 안 함)
            for item in search_dir.iterdir():
                if item.is_file() and item.suffix.lower() in video_extensions:
                    try:
                        stat_info = item.stat()

                        # 자막 파일 확인
                        # 1. 정확히 같은 이름의 .srt 파일
                        subtitle_path = item.with_suffix('.srt')
                        has_subtitle = subtitle_path.exists()

                        # 2. 언어 코드가 포함된 자막 파일 (.ko.srt, .en.srt 등)
                        if not has_subtitle:
                            # 비디오 ID 추출 (예: [vTMssu3XB7g])
                            import re
                            video_id_match = re.search(r'\[([a-zA-Z0-9_-]+)\]', item.name)

                            if video_id_match:
                                video_id = video_id_match.group(1)
                                # 같은 비디오 ID를 가진 자막 파일 찾기
                                for srt_file in item.parent.glob(f"*[{video_id}]*.srt"):
                                    if srt_file.is_file():
                                        subtitle_path = srt_file
                                        has_subtitle = True
                                        break

                            # 비디오 ID가 없으면 파일명 기준으로 찾기
                            if not has_subtitle:
                                # 확장자를 제거한 파일명으로 자막 찾기
                                base_name = item.stem
                                for srt_file in item.parent.glob(f"{base_name}*.srt"):
                                    if srt_file.is_file():
                                        subtitle_path = srt_file
                                        has_subtitle = True
                                        break

                        video_info = {
                            "name": item.name,
                            "path": str(item.absolute()),
                            "size": stat_info.st_size,
                            "size_mb": round(stat_info.st_size / (1024 * 1024), 2),
                            "modified": datetime.fromtimestamp(stat_info.st_mtime).isoformat(),
                            "directory": str(item.parent),
                            "has_subtitle": has_subtitle,
                        }

                        if has_subtitle:
                            video_info["subtitle_path"] = str(subtitle_path.absolute())

                        video_files.append(video_info)
                    except (OSError, PermissionError):
                        continue
        except (OSError, PermissionError):
            continue

    # 수정 날짜 기준으로 최신순 정렬
    video_files.sort(key=lambda x: x["modified"], reverse=True)

    # 최대 100개로 제한
    return video_files[:100]


@app.get("/api/video-analyzer/stream")
async def api_stream_video(path: str):
    """Stream video or subtitle file for preview.

    Args:
        path: Absolute path to the video or subtitle file.
    """
    import re
    from fastapi.responses import Response

    file_path = Path(path)

    # 보안: 파일이 존재하고 실제 파일인지 확인
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")

    # 지원되는 확장자 확인
    video_extensions = {".mp4", ".webm", ".mkv", ".avi", ".mov", ".flv", ".m4v", ".wmv"}
    subtitle_extensions = {".srt", ".vtt", ".ass", ".ssa"}
    supported_extensions = video_extensions | subtitle_extensions

    if file_path.suffix.lower() not in supported_extensions:
        raise HTTPException(status_code=400, detail="지원하지 않는 파일 형식입니다.")

    # SRT 파일을 WebVTT로 변환
    if file_path.suffix.lower() == ".srt":
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                srt_content = f.read()

            # SRT를 WebVTT로 변환
            vtt_content = "WEBVTT\n\n" + re.sub(
                r'(\d{2}):(\d{2}):(\d{2}),(\d{3})',
                r'\1:\2:\3.\4',
                srt_content
            )

            return Response(
                content=vtt_content,
                media_type="text/vtt; charset=utf-8",
                headers={"Content-Disposition": f"inline; filename={file_path.stem}.vtt"}
            )
        except Exception as e:
            logging.error(f"SRT to VTT conversion error: {e}")
            # 변환 실패 시 원본 파일 반환
            pass

    # MIME 타입 결정
    mime_types = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mkv": "video/x-matroska",
        ".avi": "video/x-msvideo",
        ".mov": "video/quicktime",
        ".flv": "video/x-flv",
        ".m4v": "video/mp4",
        ".wmv": "video/x-ms-wmv",
        ".srt": "text/vtt",
        ".vtt": "text/vtt",
        ".ass": "text/x-ass",
        ".ssa": "text/x-ssa",
    }
    media_type = mime_types.get(file_path.suffix.lower(), "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=file_path.name,
    )


@app.get("/api/video-analyzer/download")
async def api_download_file(path: str):
    """Download video or other file.

    Args:
        path: Absolute path to the file.
    """
    file_path = Path(path)

    # 보안: 파일이 존재하고 실제 파일인지 확인
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")

    # MIME 타입 결정
    mime_types = {
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mkv": "video/x-matroska",
        ".avi": "video/x-msvideo",
        ".mov": "video/quicktime",
        ".srt": "text/srt",
        ".vtt": "text/vtt",
    }
    media_type = mime_types.get(file_path.suffix.lower(), "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=file_path.name,
        headers={"Content-Disposition": f"attachment; filename={file_path.name}"}
    )


@app.post("/api/video-analyzer/extract-frame")
async def api_extract_frame(payload: Dict[str, Any] = Body(...)):
    """Extract a single frame from video.

    Args:
        payload: {
            "video_path": str,
            "frame_type": "first" | "last"
        }
    """
    import cv2
    import base64

    video_path = Path(payload["video_path"])
    frame_type = payload["frame_type"]

    if not video_path.exists():
        raise HTTPException(status_code=404, detail="비디오 파일을 찾을 수 없습니다.")

    transcoded_file = None
    try:
        cap, transcoded_file = open_video_with_transcode_fallback(video_path)

        if frame_type == "first":
            # 첫 프레임
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = cap.read()
            timestamp = 0.0
        elif frame_type == "last":
            # 마지막 프레임
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            if total_frames > 0:
                cap.set(cv2.CAP_PROP_POS_FRAMES, total_frames - 1)
                ret, frame = cap.read()
                fps = cap.get(cv2.CAP_PROP_FPS)
                timestamp = round((total_frames - 1) / fps, 2) if fps > 0 else 0.0
            else:
                raise HTTPException(status_code=400, detail="비디오에 프레임이 없습니다.")
        else:
            raise HTTPException(status_code=400, detail="잘못된 frame_type입니다.")

        cap.release()

        # 임시 파일 정리
        if transcoded_file and transcoded_file.exists():
            try:
                transcoded_file.unlink()
                logger.info(f"Cleaned up transcoded file: {transcoded_file}")
            except Exception as cleanup_exc:
                logger.warning(f"Failed to clean up transcoded file: {cleanup_exc}")

        if not ret:
            raise HTTPException(status_code=400, detail="프레임을 읽을 수 없습니다.")

        # JPEG로 인코딩
        _, buffer = cv2.imencode('.jpg', frame)
        frame_base64 = base64.b64encode(buffer).decode('utf-8')

        return {
            "frame_data": frame_base64,
            "timestamp": timestamp
        }

    except Exception as e:
        # 에러 발생 시에도 임시 파일 정리
        if transcoded_file and transcoded_file.exists():
            try:
                transcoded_file.unlink()
            except Exception:
                pass
        logging.exception("프레임 추출 중 오류 발생")
        raise HTTPException(status_code=500, detail=f"프레임 추출 실패: {str(e)}")


@app.post("/api/video-analyzer/extract-frames-interval")
async def api_extract_frames_interval(payload: Dict[str, Any] = Body(...)):
    """Extract frames at regular intervals from video.

    Args:
        payload: {
            "video_path": str,
            "interval": int (seconds)
        }
    """
    import cv2
    import base64

    video_path = Path(payload["video_path"])
    interval = payload.get("interval", 10)

    if not video_path.exists():
        raise HTTPException(status_code=404, detail="비디오 파일을 찾을 수 없습니다.")

    transcoded_file = None
    try:
        cap, transcoded_file = open_video_with_transcode_fallback(video_path)

        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps if fps > 0 else 0

        frames_data = []
        times = []

        # 간격마다 시간 추가
        current_time = 0
        while current_time < duration:
            times.append(current_time)
            current_time += interval

        # 마지막 프레임 추가 (duration이 interval의 배수가 아닐 경우)
        if len(times) == 0 or times[-1] < duration - 0.1:
            times.append(duration - 0.1)

        # 모든 프레임 추출
        for time in times:
            frame_number = int(time * fps)

            if frame_number >= total_frames:
                frame_number = total_frames - 1

            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
            ret, frame = cap.read()

            if ret:
                # JPEG로 인코딩
                _, buffer = cv2.imencode('.jpg', frame)
                frame_base64 = base64.b64encode(buffer).decode('utf-8')

                frames_data.append({
                    "frame_data": frame_base64,
                    "timestamp": round(time, 2)
                })

        cap.release()

        # 임시 파일 정리
        if transcoded_file and transcoded_file.exists():
            try:
                transcoded_file.unlink()
            except Exception:
                pass

        return {
            "frames": frames_data,
            "total_duration": round(duration, 2)
        }

    except Exception as e:
        # 에러 발생 시에도 임시 파일 정리
        if transcoded_file and transcoded_file.exists():
            try:
                transcoded_file.unlink()
            except Exception:
                pass
        logging.exception("프레임 추출 중 오류 발생")
        raise HTTPException(status_code=500, detail=f"프레임 추출 실패: {str(e)}")


@app.post("/api/video-analyzer/extract-frames-by-segments")
async def api_extract_frames_by_segments(payload: Dict[str, Any] = Body(...)):
    """각 자막 구간마다 균등하게 N개의 프레임을 추출

    Args:
        payload: {
            "video_path": str,
            "subtitle_path": str,
            "frames_per_segment": int (각 구간당 추출할 프레임 개수)
        }
    """
    import cv2
    import base64
    import re

    video_path = Path(payload["video_path"])
    subtitle_path = Path(payload.get("subtitle_path", ""))
    frames_per_segment = payload.get("frames_per_segment", 2)

    if not video_path.exists():
        raise HTTPException(status_code=404, detail="비디오 파일을 찾을 수 없습니다.")

    if not subtitle_path.exists():
        raise HTTPException(status_code=404, detail="자막 파일을 찾을 수 없습니다.")

    try:
        # 자막 파일에서 구간 정보 추출
        with open(subtitle_path, 'r', encoding='utf-8') as f:
            content = f.read()

        file_ext = subtitle_path.suffix.lower()
        segments = []

        if file_ext == '.srt':
            # SRT 형식 파싱 - 시작과 끝 시간 모두 추출
            time_pattern = r'(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})'
            matches = re.findall(time_pattern, content)

            for match in matches:
                # 시작 시간
                start_hours, start_min, start_sec, start_ms = int(match[0]), int(match[1]), int(match[2]), int(match[3])
                start_time = start_hours * 3600 + start_min * 60 + start_sec + start_ms / 1000

                # 끝 시간
                end_hours, end_min, end_sec, end_ms = int(match[4]), int(match[5]), int(match[6]), int(match[7])
                end_time = end_hours * 3600 + end_min * 60 + end_sec + end_ms / 1000

                segments.append({"start": start_time, "end": end_time})

        elif file_ext == '.vtt':
            # VTT 형식 파싱
            time_pattern = r'(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})'
            matches = re.findall(time_pattern, content)

            for match in matches:
                # 시작 시간
                start_hours, start_min, start_sec, start_ms = int(match[0]), int(match[1]), int(match[2]), int(match[3])
                start_time = start_hours * 3600 + start_min * 60 + start_sec + start_ms / 1000

                # 끝 시간
                end_hours, end_min, end_sec, end_ms = int(match[4]), int(match[5]), int(match[6]), int(match[7])
                end_time = end_hours * 3600 + end_min * 60 + end_sec + end_ms / 1000

                segments.append({"start": start_time, "end": end_time})
        else:
            raise HTTPException(status_code=400, detail="지원하지 않는 자막 형식입니다. (.srt 또는 .vtt만 지원)")

        if not segments:
            raise HTTPException(status_code=400, detail="자막 파일에서 시간 정보를 찾을 수 없습니다.")

        # 영상 열기
        transcoded_file = None
        cap, transcoded_file = open_video_with_transcode_fallback(video_path)

        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps if fps > 0 else 0

        frames_data = []

        # 각 구간마다 균등하게 N개 추출
        for segment_idx, segment in enumerate(segments):
            start_time = segment["start"]
            end_time = segment["end"]
            segment_duration = end_time - start_time

            # 구간이 너무 짧으면 스킵
            if segment_duration < 0.1:
                continue

            # N개로 균등 분할
            # frames_per_segment=2: 시작(1/2), 끝(2/2)
            # frames_per_segment=3: 1/3, 2/3, 3/3
            # frames_per_segment=4: 1/4, 2/4, 3/4, 4/4
            for i in range(frames_per_segment):
                # 균등 분할 위치 계산
                ratio = (i + 1) / frames_per_segment
                time = start_time + segment_duration * ratio

                # 영상 끝을 넘어가지 않도록
                if time >= duration:
                    time = duration - 0.1

                frame_number = int(time * fps)
                if frame_number >= total_frames:
                    frame_number = total_frames - 1

                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
                ret, frame = cap.read()

                if ret:
                    # JPEG로 인코딩
                    _, buffer = cv2.imencode('.jpg', frame)
                    frame_base64 = base64.b64encode(buffer).decode('utf-8')

                    frames_data.append({
                        "frame_data": frame_base64,
                        "timestamp": round(time, 2),
                        "segment_index": segment_idx + 1,
                        "frame_in_segment": i + 1
                    })

        cap.release()

        # 임시 파일 정리
        if transcoded_file and transcoded_file.exists():
            try:
                transcoded_file.unlink()
            except Exception:
                pass

        return {
            "frames": frames_data,
            "total_segments": len(segments),
            "frames_per_segment": frames_per_segment,
            "total_frames": len(frames_data)
        }

    except HTTPException:
        # 에러 발생 시에도 임시 파일 정리
        if 'transcoded_file' in locals() and transcoded_file and transcoded_file.exists():
            try:
                transcoded_file.unlink()
            except Exception:
                pass
        raise
    except Exception as e:
        # 에러 발생 시에도 임시 파일 정리
        if 'transcoded_file' in locals() and transcoded_file and transcoded_file.exists():
            try:
                transcoded_file.unlink()
            except Exception:
                pass
        logging.exception("세그먼트별 프레임 추출 중 오류 발생")
        raise HTTPException(status_code=500, detail=f"프레임 추출 실패: {str(e)}")


@app.post("/api/video-analyzer/get-subtitle-times")
async def api_get_subtitle_times(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """자막 파일에서 시작 시간 추출"""
    try:
        subtitle_path = Path(payload.get("subtitle_path", ""))

        if not subtitle_path.exists():
            raise HTTPException(status_code=404, detail="자막 파일을 찾을 수 없습니다.")

        times = []

        # 파일 확장자에 따라 처리
        file_ext = subtitle_path.suffix.lower()

        with open(subtitle_path, 'r', encoding='utf-8') as f:
            content = f.read()

        if file_ext == '.srt':
            # SRT 형식 파싱
            import re
            # 시간 패턴: 00:00:00,000 --> 00:00:02,000
            time_pattern = r'(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})'
            matches = re.findall(time_pattern, content)

            for match in matches:
                # 시작 시간만 추출
                hours, minutes, seconds, milliseconds = int(match[0]), int(match[1]), int(match[2]), int(match[3])
                time_in_seconds = hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
                times.append(time_in_seconds)

        elif file_ext == '.vtt':
            # VTT 형식 파싱
            import re
            # 시간 패턴: 00:00:00.000 --> 00:00:02.000
            time_pattern = r'(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})'
            matches = re.findall(time_pattern, content)

            for match in matches:
                # 시작 시간만 추출
                hours, minutes, seconds, milliseconds = int(match[0]), int(match[1]), int(match[2]), int(match[3])
                time_in_seconds = hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
                times.append(time_in_seconds)

        else:
            raise HTTPException(status_code=400, detail="지원하지 않는 자막 파일 형식입니다. (.srt, .vtt 지원)")

        # 중복 제거 및 정렬
        times = sorted(list(set(times)))

        return {
            "times": times,
            "count": len(times)
        }

    except HTTPException:
        raise
    except Exception as e:
        logging.exception("자막 시간 추출 중 오류 발생")
        raise HTTPException(status_code=500, detail=f"자막 시간 추출 실패: {str(e)}")


@app.get("/api/video-analyzer/read-subtitle")
async def api_read_subtitle(path: str) -> Dict[str, Any]:
    """자막 파일 내용 읽기"""
    try:
        subtitle_path = Path(path)

        if not subtitle_path.exists():
            raise HTTPException(status_code=404, detail="자막 파일을 찾을 수 없습니다.")

        subtitles = []
        file_ext = subtitle_path.suffix.lower()

        with open(subtitle_path, 'r', encoding='utf-8') as f:
            content = f.read()

        if file_ext == '.srt':
            # SRT 형식 파싱
            import re
            # SRT 블록 분리 (빈 줄로 구분)
            blocks = content.strip().split('\n\n')

            for block in blocks:
                lines = block.strip().split('\n')
                if len(lines) >= 3:
                    # 첫 줄: 번호
                    index = lines[0].strip()
                    # 둘째 줄: 시간
                    time_line = lines[1].strip()
                    # 셋째 줄 이후: 텍스트
                    text = '\n'.join(lines[2:]).strip()

                    # 시간 파싱
                    time_pattern = r'(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})'
                    match = re.match(time_pattern, time_line)

                    if match:
                        start_h, start_m, start_s, start_ms = int(match.group(1)), int(match.group(2)), int(match.group(3)), int(match.group(4))
                        end_h, end_m, end_s, end_ms = int(match.group(5)), int(match.group(6)), int(match.group(7)), int(match.group(8))

                        start_time = f"{start_h:02d}:{start_m:02d}:{start_s:02d},{start_ms:03d}"
                        end_time = f"{end_h:02d}:{end_m:02d}:{end_s:02d},{end_ms:03d}"

                        subtitles.append({
                            'index': index,
                            'start': start_time,
                            'end': end_time,
                            'text': text
                        })

        elif file_ext == '.vtt':
            # VTT 형식 파싱
            import re
            lines = content.split('\n')
            i = 0
            index = 1

            while i < len(lines):
                line = lines[i].strip()

                # 시간 패턴 찾기
                time_pattern = r'(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})'
                match = re.match(time_pattern, line)

                if match:
                    start_h, start_m, start_s, start_ms = int(match.group(1)), int(match.group(2)), int(match.group(3)), int(match.group(4))
                    end_h, end_m, end_s, end_ms = int(match.group(5)), int(match.group(6)), int(match.group(7)), int(match.group(8))

                    start_time = f"{start_h:02d}:{start_m:02d}:{start_s:02d},{start_ms:03d}"
                    end_time = f"{end_h:02d}:{end_m:02d}:{end_s:02d},{end_ms:03d}"

                    # 다음 줄들이 텍스트
                    text_lines = []
                    i += 1
                    while i < len(lines) and lines[i].strip():
                        text_lines.append(lines[i].strip())
                        i += 1

                    text = '\n'.join(text_lines)

                    subtitles.append({
                        'index': str(index),
                        'start': start_time,
                        'end': end_time,
                        'text': text
                    })
                    index += 1

                i += 1

        else:
            raise HTTPException(status_code=400, detail="지원하지 않는 자막 파일 형식입니다. (.srt, .vtt 지원)")

        return {
            "success": True,
            "subtitle_path": str(subtitle_path),
            "subtitles": subtitles,
            "count": len(subtitles)
        }

    except HTTPException:
        raise
    except Exception as e:
        logging.exception("자막 파일 읽기 중 오류 발생")
        raise HTTPException(status_code=500, detail=f"자막 파일 읽기 실패: {str(e)}")


@app.post("/api/video-analyzer/cut-by-subtitles-start")
async def api_cut_video_by_subtitles_start(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """자막 시간 기준으로 영상 자르기 시작 (백그라운드)"""
    import threading
    from uuid import uuid4 as generate_uuid

    task_id = str(generate_uuid())
    video_path_str = payload.get("video_path", "")
    subtitle_path_str = payload.get("subtitle_path", "")

    # 초기 상태 설정
    cut_video_tasks[task_id] = {
        "status": "starting",
        "progress": 0,
        "total": 0,
        "current": 0,
        "message": "자막 파일 분석 중...",
        "zip_path": None,
        "error": None,
        "completed": False,
    }

    def run_cut_video():
        """백그라운드 스레드에서 영상 자르기 실행"""
        import subprocess
        import zipfile
        import tempfile
        import re
        from pathlib import Path

        try:
            video_path = Path(video_path_str)
            subtitle_path = Path(subtitle_path_str)

            if not video_path.exists():
                raise Exception("영상 파일을 찾을 수 없습니다.")

            if not subtitle_path.exists():
                raise Exception("자막 파일을 찾을 수 없습니다.")

            cut_video_tasks[task_id]["message"] = "자막 파일 파싱 중..."

            # 자막 파일에서 시간 구간 추출
            file_ext = subtitle_path.suffix.lower()
            time_ranges = []

            with open(subtitle_path, 'r', encoding='utf-8') as f:
                content = f.read()

            if file_ext == '.srt':
                # SRT 형식 파싱
                time_pattern = r'(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,\.](\d{3})'
                matches = re.findall(time_pattern, content)

                for match in matches:
                    # 시작 시간
                    start_h, start_m, start_s, start_ms = int(match[0]), int(match[1]), int(match[2]), int(match[3])
                    start_time = start_h * 3600 + start_m * 60 + start_s + start_ms / 1000

                    # 종료 시간
                    end_h, end_m, end_s, end_ms = int(match[4]), int(match[5]), int(match[6]), int(match[7])
                    end_time = end_h * 3600 + end_m * 60 + end_s + end_ms / 1000

                    time_ranges.append((start_time, end_time))

            elif file_ext == '.vtt':
                # VTT 형식 파싱
                time_pattern = r'(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})'
                matches = re.findall(time_pattern, content)

                for match in matches:
                    # 시작 시간
                    start_h, start_m, start_s, start_ms = int(match[0]), int(match[1]), int(match[2]), int(match[3])
                    start_time = start_h * 3600 + start_m * 60 + start_s + start_ms / 1000

                    # 종료 시간
                    end_h, end_m, end_s, end_ms = int(match[4]), int(match[5]), int(match[6]), int(match[7])
                    end_time = end_h * 3600 + end_m * 60 + end_s + end_ms / 1000

                    time_ranges.append((start_time, end_time))
            else:
                raise Exception("지원하지 않는 자막 파일 형식입니다. (.srt, .vtt 지원)")

            if not time_ranges:
                raise Exception("자막 시간 정보를 찾을 수 없습니다.")

            cut_video_tasks[task_id]["total"] = len(time_ranges)
            cut_video_tasks[task_id]["status"] = "cutting"
            cut_video_tasks[task_id]["message"] = f"영상 자르기 시작 (총 {len(time_ranges)}개 클립)"

            # 영구 임시 디렉토리 생성 (다운로드 완료될 때까지 유지)
            temp_dir = tempfile.mkdtemp()
            temp_path = Path(temp_dir)
            clip_files = []

            # 각 시간 구간마다 영상 자르기
            for idx, (start, end) in enumerate(time_ranges):
                duration = end - start
                if duration <= 0:
                    continue

                cut_video_tasks[task_id]["current"] = idx + 1
                cut_video_tasks[task_id]["progress"] = int((idx + 1) / len(time_ranges) * 100)
                cut_video_tasks[task_id]["message"] = f"클립 {idx + 1}/{len(time_ranges)} 처리 중..."

                output_file = temp_path / f"clip_{idx:04d}.mp4"

                # ffmpeg 명령어 실행
                cmd = [
                    "ffmpeg",
                    "-ss", str(start),
                    "-i", str(video_path),
                    "-t", str(duration),
                    "-c", "copy",  # re-encoding 없이 빠르게 자르기
                    "-y",  # 덮어쓰기
                    str(output_file)
                ]

                result = subprocess.run(cmd, capture_output=True, text=True)

                if result.returncode != 0:
                    logging.error(f"ffmpeg 오류: {result.stderr}")
                    continue

                if output_file.exists():
                    clip_files.append(output_file)

            if not clip_files:
                raise Exception("영상 클립을 생성할 수 없습니다.")

            cut_video_tasks[task_id]["message"] = "ZIP 파일 생성 중..."
            cut_video_tasks[task_id]["progress"] = 95

            # ZIP 파일 생성
            zip_path = temp_path / f"{video_path.stem}_clips.zip"
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for clip_file in clip_files:
                    zipf.write(clip_file, clip_file.name)

            cut_video_tasks[task_id].update({
                "status": "completed",
                "progress": 100,
                "message": f"완료! {len(clip_files)}개 클립 생성됨",
                "zip_path": str(zip_path),
                "completed": True,
            })

        except Exception as e:
            logging.exception("영상 자르기 중 오류 발생")
            cut_video_tasks[task_id].update({
                "status": "error",
                "message": f"오류 발생: {str(e)}",
                "error": str(e),
                "completed": True,
            })

    # 백그라운드 스레드로 시작
    thread = threading.Thread(target=run_cut_video, daemon=True)
    thread.start()

    return {
        "task_id": task_id,
        "message": "영상 자르기 작업이 시작되었습니다.",
    }


@app.get("/api/video-analyzer/cut-status/{task_id}")
async def api_get_cut_video_status(task_id: str) -> Dict[str, Any]:
    """영상 자르기 진행 상태 조회"""
    if task_id not in cut_video_tasks:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")

    return cut_video_tasks[task_id]


@app.get("/api/video-analyzer/cut-download/{task_id}")
async def api_download_cut_video(task_id: str):
    """완료된 영상 클립 ZIP 파일 다운로드"""
    if task_id not in cut_video_tasks:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")

    task = cut_video_tasks[task_id]

    if task["status"] != "completed":
        raise HTTPException(status_code=400, detail="작업이 아직 완료되지 않았습니다.")

    zip_path = task.get("zip_path")
    if not zip_path or not Path(zip_path).exists():
        raise HTTPException(status_code=404, detail="ZIP 파일을 찾을 수 없습니다.")

    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=Path(zip_path).name,
    )


@app.post("/api/video-analyzer/extract-frames-by-times")
async def api_extract_frames_by_times(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """특정 시간 목록에 대해 프레임 추출"""
    try:
        video_path = Path(payload.get("video_path", ""))
        times = payload.get("times", [])

        if not video_path.exists():
            raise HTTPException(status_code=404, detail="영상 파일을 찾을 수 없습니다.")

        if not times:
            raise HTTPException(status_code=400, detail="추출할 시간 목록이 필요합니다.")

        # OpenCV로 영상 열기
        transcoded_file = None
        cap, transcoded_file = open_video_with_transcode_fallback(video_path)

        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps if fps > 0 else 0

        frames_data = []

        for time in times:
            frame_number = int(time * fps)

            if frame_number >= total_frames:
                frame_number = total_frames - 1

            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
            ret, frame = cap.read()

            if not ret:
                continue

            # JPEG로 인코딩
            success, buffer = cv2.imencode('.jpg', frame)

            if not success:
                continue

            # Base64 인코딩
            frame_base64 = base64.b64encode(buffer).decode('utf-8')

            frames_data.append({
                "frame_data": frame_base64,
                "timestamp": round(time, 2)
            })

        cap.release()

        # 임시 파일 정리
        if transcoded_file and transcoded_file.exists():
            try:
                transcoded_file.unlink()
            except Exception:
                pass

        return {
            "frames": frames_data,
            "total_extracted": len(frames_data)
        }

    except HTTPException:
        # 에러 발생 시에도 임시 파일 정리
        if 'transcoded_file' in locals() and transcoded_file and transcoded_file.exists():
            try:
                transcoded_file.unlink()
            except Exception:
                pass
        raise
    except Exception as e:
        # 에러 발생 시에도 임시 파일 정리
        if 'transcoded_file' in locals() and transcoded_file and transcoded_file.exists():
            try:
                transcoded_file.unlink()
            except Exception:
                pass
        logging.exception("프레임 추출 중 오류 발생")
        raise HTTPException(status_code=500, detail=f"프레임 추출 실패: {str(e)}")


@app.post("/api/video-analyzer/merge-videos")
async def api_merge_videos(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """여러 영상을 하나로 합치기"""
    import subprocess
    import tempfile
    import json

    def get_video_duration(video_path: str) -> float:
        """ffprobe를 사용하여 영상의 길이를 초 단위로 반환"""
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'json',
            str(video_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            return 0.0
        try:
            data = json.loads(result.stdout)
            return float(data['format']['duration'])
        except:
            return 0.0

    def format_srt_time(seconds: float) -> str:
        """초를 SRT 시간 형식으로 변환 (HH:MM:SS,mmm)"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int((seconds % 1) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

    def create_subtitle_file(video_paths: list, output_path: Path) -> str:
        """각 영상의 제목을 자막으로 추가한 SRT 파일 생성"""
        subtitle_entries = []
        current_time = 0.0

        for idx, video_path in enumerate(video_paths):
            # 영상 파일명에서 제목 추출 (확장자 제거)
            video_name = Path(video_path).stem

            # 영상 길이 가져오기
            duration = get_video_duration(video_path)

            # 자막 엔트리 생성 (각 영상의 전체 길이 동안 제목 표시)
            start_time = current_time
            end_time = current_time + duration  # 영상 전체 길이 동안 표시

            subtitle_entries.append({
                'index': idx + 1,
                'start': format_srt_time(start_time),
                'end': format_srt_time(end_time),
                'text': f"📌 제목 [{idx + 1}] {video_name}"
            })

            # 다음 영상 시작 시간 업데이트
            current_time += duration

        # SRT 파일 내용 생성
        srt_content = []
        for entry in subtitle_entries:
            srt_content.append(str(entry['index']))
            srt_content.append(f"{entry['start']} --> {entry['end']}")
            srt_content.append(entry['text'])
            srt_content.append("")  # 빈 줄

        # SRT 파일 저장
        subtitle_path = output_path.with_suffix('.srt')
        subtitle_path.write_text('\n'.join(srt_content), encoding='utf-8')

        return str(subtitle_path)

    try:
        video_paths = payload.get("video_paths", [])
        output_name = payload.get("output_name", "merged_video.mp4")

        if len(video_paths) < 2:
            raise HTTPException(status_code=400, detail="최소 2개의 영상이 필요합니다.")

        # 첫 번째 영상의 디렉토리를 출력 디렉토리로 사용
        first_video = Path(video_paths[0])
        output_dir = first_video.parent
        output_path = output_dir / output_name

        # 파일 존재 확인
        for video_path in video_paths:
            if not Path(video_path).exists():
                raise HTTPException(status_code=404, detail=f"영상 파일을 찾을 수 없습니다: {video_path}")

        # FFmpeg concat 파일 생성
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as concat_file:
            concat_file_path = concat_file.name
            for video_path in video_paths:
                # FFmpeg concat 형식: file '/absolute/path/to/video.mp4'
                concat_file.write(f"file '{Path(video_path).absolute()}'\n")

        try:
            # 각 영상 정보 가져오기 (해상도, 코덱 등 확인)
            # 서로 다른 포맷의 영상을 합치려면 재인코딩 필요

            # FFmpeg filter_complex를 사용하여 모든 영상을 동일한 포맷으로 정규화
            # 1. 모든 영상을 동일한 해상도로 스케일링
            # 2. 동일한 프레임레이트 적용
            # 3. h264 코덱으로 재인코딩

            # 입력 파일 리스트 생성
            input_args = []
            for video_path in video_paths:
                input_args.extend(['-i', str(Path(video_path).absolute())])

            # filter_complex 구성
            # 각 입력을 1080p, 30fps로 정규화한 후 concat
            filter_parts = []
            for i in range(len(video_paths)):
                # scale: 1080p로 스케일링 (비율 유지, 패딩 추가)
                # fps: 30fps로 변환
                # setsar: 정사각형 픽셀 비율 설정
                filter_parts.append(
                    f"[{i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,"
                    f"pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1[v{i}];"
                )

            # concat 필터 추가
            concat_inputs = ''.join([f"[v{i}]" for i in range(len(video_paths))])
            filter_parts.append(f"{concat_inputs}concat=n={len(video_paths)}:v=1:a=0[outv]")

            filter_complex = ''.join(filter_parts)

            cmd = [
                '/usr/bin/ffmpeg',  # 시스템 ffmpeg 사용 (AV1 지원)
                *input_args,
                '-filter_complex', filter_complex,
                '-map', '[outv]',
                '-c:v', 'libx264',  # h264 코덱 사용
                '-preset', 'medium',  # 인코딩 속도/품질 균형
                '-crf', '23',  # 품질 설정 (낮을수록 고품질)
                '-y',  # 출력 파일 덮어쓰기
                str(output_path)
            ]

            logging.info(f"FFmpeg 명령 실행: {' '.join(cmd)}")

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600  # 10분 타임아웃 (재인코딩이므로 시간 더 필요)
            )

            if result.returncode != 0:
                logging.error(f"FFmpeg 에러: {result.stderr}")
                raise HTTPException(
                    status_code=500,
                    detail=f"영상 합치기 실패: {result.stderr}"
                )

            # 출력 파일 크기 확인
            if output_path.exists():
                size_mb = output_path.stat().st_size / (1024 * 1024)

                # 자막 파일 생성
                subtitle_path = create_subtitle_file(video_paths, output_path)
                logging.info(f"자막 파일 생성: {subtitle_path}")

                return {
                    "success": True,
                    "output_path": str(output_path),
                    "subtitle_path": subtitle_path,
                    "size_mb": round(size_mb, 2),
                    "video_count": len(video_paths)
                }
            else:
                raise HTTPException(status_code=500, detail="출력 파일이 생성되지 않았습니다.")

        finally:
            # 임시 concat 파일 삭제
            try:
                Path(concat_file_path).unlink()
            except:
                pass

    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="영상 합치기 시간 초과 (5분)")
    except Exception as e:
        logging.exception("영상 합치기 중 오류 발생")
        raise HTTPException(status_code=500, detail=f"영상 합치기 실패: {str(e)}")


@app.post("/api/video-analyzer/create-preview-video")
async def api_create_preview_video(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """텍스트 오버레이와 자막이 적용된 프리뷰 영상 생성"""
    import subprocess
    import tempfile

    try:
        video_path = payload.get("video_path")
        subtitle_path = payload.get("subtitle_path")
        video_width = payload.get("video_width")
        video_height = payload.get("video_height")
        overlays = payload.get("overlays", {})
        black_bars = payload.get("black_bars", {})

        if not video_path or not Path(video_path).exists():
            raise HTTPException(status_code=404, detail="비디오 파일을 찾을 수 없습니다.")

        video_file = Path(video_path)
        output_dir = video_file.parent
        output_name = f"{video_file.stem}_preview.mp4"
        output_path = output_dir / output_name

        # 출력 파일이 이미 존재하면 고유한 이름 생성
        counter = 1
        while output_path.exists():
            output_name = f"{video_file.stem}_preview_{counter}.mp4"
            output_path = output_dir / output_name
            counter += 1

        logging.info(f"🎬 프리뷰 영상 생성 시작: {video_path}")
        logging.info(f"📐 비디오 크기: {video_width}x{video_height}")
        logging.info(f"📝 오버레이: {overlays}")
        logging.info(f"⬛ 검정 배경: {black_bars}")

        # FFmpeg filter_complex 구성
        filters = []

        # 1. 검정 배경 추가
        if black_bars.get("top", {}).get("enabled"):
            top_height_percent = black_bars["top"].get("height", 15)
            top_opacity = black_bars["top"].get("opacity", 0.8)
            top_height = int(video_height * top_height_percent / 100)
            filters.append(
                f"drawbox=x=0:y=0:w={video_width}:h={top_height}:color=black@{top_opacity}:t=fill"
            )

        if black_bars.get("bottom", {}).get("enabled"):
            bottom_height_percent = black_bars["bottom"].get("height", 15)
            bottom_opacity = black_bars["bottom"].get("opacity", 0.8)
            bottom_height = int(video_height * bottom_height_percent / 100)
            bottom_y = video_height - bottom_height
            filters.append(
                f"drawbox=x=0:y={bottom_y}:w={video_width}:h={bottom_height}:color=black@{bottom_opacity}:t=fill"
            )

        # 2. 텍스트 오버레이 추가 (제목, 부제목, 한글 자막, 영어 자막)
        for overlay_key, overlay_data in overlays.items():
            result = _build_drawtext_filter(overlay_data, video_width, video_height)
            if result:
                drawtext_filter, meta = result
                logging.info(
                    "📝 텍스트 오버레이 추가: %s - 폰트크기=%spx, 폰트=%s",
                    overlay_key,
                    meta.get("font_size"),
                    meta.get("fontfile") or "default",
                )
                logging.info(f"   FFmpeg 필터: {drawtext_filter}")
                filters.append(drawtext_filter)

        # 3. 자막 파일 추가 (있는 경우)
        if subtitle_path and Path(subtitle_path).exists():
            # 자막 파일 절대 경로
            subtitle_path_abs = str(Path(subtitle_path).absolute())
            # FFmpeg subtitles 필터: 경로의 특수문자 이스케이프
            # 콜론과 백슬래시를 이스케이프 (FFmpeg filter 문법)
            subtitle_path_escaped = subtitle_path_abs.replace("\\", "\\\\\\\\").replace(":", "\\:").replace("'", "\\'")

            # 자막 스타일 설정 (크고 잘 보이도록)
            # force_style: 자막 스타일 강제 적용
            # FontSize: 폰트 크기 (기본값보다 크게)
            # PrimaryColour: 노란색 (&H00FFFF)
            # OutlineColour: 검정 테두리 (&H000000)
            # BorderStyle: 테두리 스타일 (1 = 테두리 + 그림자)
            # Outline: 테두리 두께
            # Shadow: 그림자 깊이
            # MarginV: 하단 여백
            style = "FontName=Arial,FontSize=48,PrimaryColour=&H00FFFF,OutlineColour=&H000000,BorderStyle=1,Outline=3,Shadow=2,MarginV=80"
            filters.append(f"subtitles={subtitle_path_escaped}:force_style='{style}'")

        # FFmpeg 명령어 구성
        cmd = [
            "/usr/bin/ffmpeg",
            "-i", str(video_file.absolute()),
            "-y"  # 파일 덮어쓰기
        ]

        # filter_complex 추가
        if filters:
            filter_string = ",".join(filters)
            cmd.extend(["-vf", filter_string])

        # 출력 옵션
        cmd.extend([
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "23",
            "-c:a", "copy",  # 오디오는 복사
            str(output_path)
        ])

        logging.info(f"🎬 FFmpeg 명령어: {' '.join(cmd)}")

        # FFmpeg 실행
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600  # 10분 타임아웃
        )

        if result.returncode != 0:
            logging.error(f"FFmpeg 에러: {result.stderr}")
            raise HTTPException(
                status_code=500,
                detail=f"프리뷰 영상 생성 실패: {result.stderr}"
            )

        # 출력 파일 확인
        if output_path.exists():
            size_mb = output_path.stat().st_size / (1024 * 1024)
            logging.info(f"✅ 프리뷰 영상 생성 완료: {output_path} ({size_mb:.2f}MB)")

            return {
                "success": True,
                "preview_path": str(output_path),
                "file_name": output_name,
                "size_mb": round(size_mb, 2)
            }
        else:
            raise HTTPException(status_code=500, detail="프리뷰 영상 파일이 생성되지 않았습니다.")

    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="프리뷰 영상 생성 시간 초과 (10분)")
    except Exception as e:
        logging.exception("프리뷰 영상 생성 중 오류 발생")
        raise HTTPException(status_code=500, detail=f"프리뷰 영상 생성 실패: {str(e)}")


@app.post("/api/video-analyzer/create-final-video")
async def api_create_final_video(
    video_path: str = Form(...),
    video_width: int = Form(...),
    video_height: int = Form(...),
    overlays: str = Form(...),
    black_bars: str = Form(...),
    tracks: str = Form(...),
    subtitle_style: str = Form("{}"),
    canvas_subtitle_positions: str = Form(None),
    audio_file: UploadFile = File(None),
    commentary_file: UploadFile = File(None),
    bgm_file: UploadFile = File(None)
) -> Dict[str, Any]:
    """체크된 트랙을 합성하여 최종 MP4 영상 생성"""
    import subprocess
    import tempfile
    import shutil
    import time

    # ⏱️ 성능 측정 시작
    perf_start_total = time.time()
    perf_marks = {}

    try:
        # JSON 파싱 성능 측정
        perf_start = time.time()
        overlays_data = json.loads(overlays)
        black_bars_data = json.loads(black_bars)
        tracks_data = json.loads(tracks)
        subtitle_style_data = json.loads(subtitle_style) if subtitle_style else {}
        canvas_positions_data = json.loads(canvas_subtitle_positions) if canvas_subtitle_positions else None
        perf_marks['json_parsing'] = time.time() - perf_start

        if not video_path or not Path(video_path).exists():
            raise HTTPException(status_code=404, detail="비디오 파일을 찾을 수 없습니다.")

        video_file = Path(video_path)
        output_dir = video_file.parent
        output_name = f"{video_file.stem}_final.mp4"
        output_path = output_dir / output_name

        # 출력 파일이 이미 존재하면 고유한 이름 생성
        counter = 1
        while output_path.exists():
            output_name = f"{video_file.stem}_final_{counter}.mp4"
            output_path = output_dir / output_name
            counter += 1

        logging.info(f"🎬 최종 영상 생성 시작: {video_path}")
        logging.info(f"📐 비디오 크기: {video_width}x{video_height}")
        logging.info(f"📝 오버레이: {overlays_data}")
        logging.info(f"⬛ 검정 배경: {black_bars_data}")
        logging.info(f"🎭 자막 스타일: {subtitle_style_data}")
        logging.info(f"📍 Canvas 자막 위치: {canvas_positions_data}")
        logging.info(f"🎵 트랙: {tracks_data}")

        # 임시 디렉토리 생성
        perf_start = time.time()
        temp_dir = Path(tempfile.mkdtemp())
        temp_audio_files = []
        perf_marks['temp_dir_creation'] = time.time() - perf_start

        try:
            # 업로드된 오디오 파일 저장
            perf_start = time.time()
            audio_inputs = []

            if audio_file:
                audio_path = temp_dir / audio_file.filename
                with open(audio_path, "wb") as f:
                    shutil.copyfileobj(audio_file.file, f)
                temp_audio_files.append(audio_path)
                audio_inputs.append(str(audio_path))
                logging.info(f"🎵 Audio 파일 저장: {audio_path}")

            if commentary_file:
                commentary_path = temp_dir / commentary_file.filename
                with open(commentary_path, "wb") as f:
                    shutil.copyfileobj(commentary_file.file, f)
                temp_audio_files.append(commentary_path)
                audio_inputs.append(str(commentary_path))
                logging.info(f"🎙️ Commentary 파일 저장: {commentary_path}")

            if bgm_file:
                bgm_path = temp_dir / bgm_file.filename
                with open(bgm_path, "wb") as f:
                    shutil.copyfileobj(bgm_file.file, f)
                temp_audio_files.append(bgm_path)
                audio_inputs.append(str(bgm_path))
                logging.info(f"🎵 BGM 파일 저장: {bgm_path}")

            perf_marks['audio_file_save'] = time.time() - perf_start

            # FFmpeg filter_complex 구성
            perf_start = time.time()
            video_filters = []

            # 1. 검정 배경 추가
            if black_bars_data.get("top", {}).get("enabled"):
                top_height_percent = black_bars_data["top"].get("height", 15)
                top_opacity = black_bars_data["top"].get("opacity", 0.8)  # 0-1 범위로 전송됨
                top_height = int(video_height * top_height_percent / 100)
                logging.info(f"⬛ 상단 검정바: 높이={top_height_percent}%, 투명도={top_opacity} ({top_opacity * 100:.0f}%)")
                video_filters.append(
                    f"drawbox=x=0:y=0:w={video_width}:h={top_height}:color=black@{top_opacity}:t=fill"
                )

            if black_bars_data.get("bottom", {}).get("enabled"):
                bottom_height_percent = black_bars_data["bottom"].get("height", 15)
                bottom_opacity = black_bars_data["bottom"].get("opacity", 0.8)  # 0-1 범위로 전송됨
                bottom_height = int(video_height * bottom_height_percent / 100)
                bottom_y = video_height - bottom_height
                logging.info(f"⬛ 하단 검정바: 높이={bottom_height_percent}%, 투명도={bottom_opacity} ({bottom_opacity * 100:.0f}%)")
                video_filters.append(
                    f"drawbox=x=0:y={bottom_y}:w={video_width}:h={bottom_height}:color=black@{bottom_opacity}:t=fill"
                )

            # 2. 제목/부제목 오버레이 먼저 추가 (배너보다 아래 레이어)
            # ⚠️ korean, english, japanese는 SRT 자막으로 처리되므로 drawtext에서 제외
            logging.info(f"📦 받은 overlays_data: {overlays_data}")
            for overlay_key, overlay_data in overlays_data.items():
                # korean, english, japanese는 SRT subtitles 필터로 처리되므로 건너뜀
                if overlay_key in {"korean", "english", "japanese"}:
                    logging.info(f"⏭️  텍스트 오버레이 건너뜀: {overlay_key} (SRT 자막으로 처리됨)")
                    continue

                logging.info(f"🔍 처리 중인 오버레이: {overlay_key} = {overlay_data}")
                result = _build_drawtext_filter(overlay_data, video_width, video_height)
                if result:
                    drawtext_filter, meta = result
                    logging.info(
                        "📝 텍스트 오버레이 추가: %s - 폰트크기=%spx, 위치=(%s, %s), 폰트=%s",
                        overlay_key,
                        meta.get("font_size"),
                        overlay_data.get("x"),
                        overlay_data.get("y"),
                        meta.get("fontfile") or "default",
                    )
                    logging.info(f"   FFmpeg 필터: {drawtext_filter}")
                    video_filters.append(drawtext_filter)

            # 3. 배너 템플릿 처리 (제목/부제목 위에 배치)
            template_type = subtitle_style_data.get("template", "classic")
            if template_type == "banner":
                banner_primary = subtitle_style_data.get("banner_primary_text")
                banner_secondary = subtitle_style_data.get("banner_secondary_text")

                # 배너 배경 추가 (상단 21%)
                banner_height = int(video_height * 0.21)
                video_filters.append(
                    f"drawbox=x=0:y=0:w={video_width}:h={banner_height}:color=black@0.92:t=fill"
                )

                # CJK 폰트 경로 설정 (한글, 일본어, 중국어 지원)
                cjk_font_path = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"

                # 주 텍스트 (상단)
                if banner_primary:
                    primary_y = int(banner_height * 0.35)
                    primary_size = int(video_height * 0.025)  # 2.5% of height
                    # 텍스트 이스케이프 처리
                    escaped_primary = banner_primary.replace("'", "'\\''").replace(":", "\\:")
                    primary_filter = f"drawtext=text='{escaped_primary}':fontfile={cjk_font_path}:fontsize={primary_size}:fontcolor=white:borderw=2:bordercolor=black:x=(w-text_w)/2:y={primary_y}"
                    video_filters.append(primary_filter)
                    logging.info(f"🎭 배너 주 텍스트: {banner_primary} (크기: {primary_size}px, 폰트: Noto Sans CJK)")

                # 보조 텍스트 (하단) - 비어있으면 실시간 자막 표시됨
                if banner_secondary:
                    secondary_y = int(banner_height * 0.72)
                    secondary_size = int(video_height * 0.022)  # 2.2% of height
                    # 텍스트 이스케이프 처리
                    escaped_secondary = banner_secondary.replace("'", "'\\''").replace(":", "\\:")
                    secondary_filter = f"drawtext=text='{escaped_secondary}':fontfile={cjk_font_path}:fontsize={secondary_size}:fontcolor=#ffd400:borderw=2:bordercolor=black:x=(w-text_w)/2:y={secondary_y}"
                    video_filters.append(secondary_filter)
                    logging.info(f"🎭 배너 보조 텍스트: {banner_secondary} (크기: {secondary_size}px, 폰트: Noto Sans CJK)")
                else:
                    logging.info("💡 배너 보조 텍스트가 비어있음 - 하단에 실시간 자막 표시")

            # 4. 자막 파일 생성 (SRT 형식)
            subtitle_files = []

            # 주자막 (translationSubtitle)
            if tracks_data.get("translationSubtitle", {}).get("enabled") and tracks_data.get("translationSubtitle", {}).get("data"):
                translation_srt = temp_dir / "translation.srt"
                with open(translation_srt, "w", encoding="utf-8") as f:
                    for idx, sub in enumerate(tracks_data["translationSubtitle"]["data"], 1):
                        f.write(f"{idx}\n")
                        f.write(f"{sub['start']} --> {sub['end']}\n")
                        f.write(f"{sub['text']}\n\n")
                subtitle_files.append(("translation", str(translation_srt)))
                logging.info(f"📝 주자막 파일 생성: {translation_srt}")

            # 일본어 자막 (japaneseSubtitle)
            if tracks_data.get("japaneseSubtitle", {}).get("enabled") and tracks_data.get("japaneseSubtitle", {}).get("data"):
                japanese_srt = temp_dir / "japanese.srt"
                with open(japanese_srt, "w", encoding="utf-8") as f:
                    for idx, sub in enumerate(tracks_data["japaneseSubtitle"]["data"], 1):
                        f.write(f"{idx}\n")
                        f.write(f"{sub['start']} --> {sub['end']}\n")
                        f.write(f"{sub['text']}\n\n")
                subtitle_files.append(("japanese", str(japanese_srt)))
                logging.info(f"📝 일본어자막 파일 생성: {japanese_srt}")

            # 보조자막 (descriptionSubtitle)
            if tracks_data.get("descriptionSubtitle", {}).get("enabled") and tracks_data.get("descriptionSubtitle", {}).get("data"):
                description_srt = temp_dir / "description.srt"
                with open(description_srt, "w", encoding="utf-8") as f:
                    for idx, sub in enumerate(tracks_data["descriptionSubtitle"]["data"], 1):
                        f.write(f"{idx}\n")
                        f.write(f"{sub['start']} --> {sub['end']}\n")
                        f.write(f"{sub['text']}\n\n")
                subtitle_files.append(("description", str(description_srt)))
                logging.info(f"📝 보조자막 파일 생성: {description_srt}")

            # 메인자막 (mainSubtitle)
            if tracks_data.get("mainSubtitle", {}).get("enabled") and tracks_data.get("mainSubtitle", {}).get("data"):
                main_srt = temp_dir / "main.srt"
                with open(main_srt, "w", encoding="utf-8") as f:
                    for idx, sub in enumerate(tracks_data["mainSubtitle"]["data"], 1):
                        f.write(f"{idx}\n")
                        f.write(f"{sub['start']} --> {sub['end']}\n")
                        f.write(f"{sub['text']}\n\n")
                subtitle_files.append(("main", str(main_srt)))
                logging.info(f"📝 메인자막 파일 생성: {main_srt}")

            # 자막 필터 추가 (비디오 해상도 기준으로 적절한 크기 사용)
            if subtitle_files:
                # overlays 폰트 크기를 그대로 사용하되 안전한 범위 내로 제한
                def adjust_subtitle_size(overlay_size):
                    # ⚠️ 웹 미리보기와 동기화: 폰트 크기 그대로 사용
                    # 사용자가 웹 UI에서 조정한 크기를 그대로 출력에 반영
                    adjusted = int(round(overlay_size))  # 크기 그대로 사용
                    return max(18, min(adjusted, 120))  # 최소 18px, 최대 120px

                # CSS 색상을 ASS/SSA 형식(&HBBGGRR)으로 변환
                def css_to_ass_color(css_color):
                    """CSS color를 ASS/SSA 형식으로 변환 (BGR 순서)"""
                    if not css_color:
                        return "&H00FFFFFF"  # 기본: 흰색

                    # rgb(r, g, b) 형식 파싱
                    import re
                    match = re.search(r'rgba?\((\d+),\s*(\d+),\s*(\d+)', css_color)
                    if match:
                        r, g, b = int(match.group(1)), int(match.group(2)), int(match.group(3))
                        # ASS는 BGR 순서
                        return f"&H00{b:02X}{g:02X}{r:02X}"
                    return "&H00FFFFFF"

                # overlays에서 폰트 크기 및 색상 추출 (None 안전 처리)
                korean_overlay = overlays_data.get("korean") or {}
                japanese_overlay = overlays_data.get("japanese") or {}
                english_overlay = overlays_data.get("english") or {}
                title_overlay = overlays_data.get("title") or {}

                korean_overlay_size = korean_overlay.get("fontSize", 64)
                japanese_overlay_size = japanese_overlay.get("fontSize", 60)
                english_overlay_size = english_overlay.get("fontSize", 56)
                title_overlay_size = title_overlay.get("fontSize", 96)

                korean_font_size = adjust_subtitle_size(korean_overlay_size)
                japanese_font_size = adjust_subtitle_size(japanese_overlay_size)
                english_font_size = adjust_subtitle_size(english_overlay_size)
                title_font_size = adjust_subtitle_size(title_overlay_size)

                # SRT 자막은 모두 흰색으로 고정
                korean_color = "&H00FFFFFF"  # 흰색
                japanese_color = "&H00FFFFFF"  # 흰색
                english_color = "&H00FFFFFF"  # 흰색
                title_color = "&H00FFFFFF"  # 흰색

                logging.info(f"📏 자막 크기 조정: korean {korean_overlay_size}→{korean_font_size}, japanese {japanese_overlay_size}→{japanese_font_size}, english {english_overlay_size}→{english_font_size}, title {title_overlay_size}→{title_font_size}")
                logging.info(f"🎨 SRT 자막 색상: 모두 흰색 (korean={korean_color}, japanese={japanese_color}, english={english_color}, title={title_color})")

                for sub_type, sub_path in subtitle_files:
                    # 자막 파일 경로 이스케이프
                    sub_path_escaped = sub_path.replace("\\", "\\\\\\\\").replace(":", "\\:").replace("'", "\\'")

                    # CJK(한글, 일본어, 중국어) 지원 폰트 사용
                    font_name = "Noto Sans CJK KR"

                    # 자막 위치 및 스타일 설정
                    # Canvas 위치 정보 사용 (있으면 Canvas 위치, 없으면 기본값)
                    if sub_type == "translation":
                        # 주자막: Canvas 위치 정보 사용
                        font_size = korean_font_size
                        primary_color = korean_color
                        outline_width = max(2, int(font_size * 0.06))

                        # Canvas 위치 정보가 있으면 사용
                        if canvas_positions_data and canvas_positions_data.get("translation"):
                            canvas_style = canvas_positions_data["translation"]
                            y_position = canvas_style.get("yPosition", 0.15)  # 0~1 비율
                            margin_v = int(video_height * (1 - y_position))  # 하단에서부터의 거리
                            font_size = canvas_style.get("fontSize", korean_font_size)
                            # 색상 변환 필요시
                            if canvas_style.get("color"):
                                primary_color = css_to_ass_color(canvas_style["color"])
                            if canvas_style.get("borderWidth"):
                                outline_width = canvas_style["borderWidth"]
                        else:
                            margin_v = 200  # 기본값

                        style = f"FontName={font_name},FontSize={font_size},PrimaryColour={primary_color},OutlineColour=&H000000,BorderStyle=1,Outline={outline_width},Shadow=1,Alignment=2,MarginV={margin_v}"
                    elif sub_type == "japanese":
                        # 일본어자막: 하단에서 130px 위 (한글과 영어 사이)
                        font_size = japanese_font_size
                        primary_color = japanese_color
                        outline_width = max(2, int(font_size * 0.06))
                        margin_v = 130
                        # 일본어 폰트 사용
                        jp_font_name = "Noto Sans CJK JP"
                        style = f"FontName={jp_font_name},FontSize={font_size},PrimaryColour={primary_color},OutlineColour=&H000000,BorderStyle=1,Outline={outline_width},Shadow=1,Alignment=2,MarginV={margin_v}"
                    elif sub_type == "description":
                        # 보조자막: Canvas 위치 정보 사용
                        font_size = english_font_size
                        primary_color = english_color
                        outline_width = max(2, int(font_size * 0.06))

                        # Canvas 위치 정보가 있으면 사용
                        if canvas_positions_data and canvas_positions_data.get("description"):
                            canvas_style = canvas_positions_data["description"]
                            y_position = canvas_style.get("yPosition", 0.70)  # 0~1 비율
                            margin_v = int(video_height * (1 - y_position))
                            font_size = canvas_style.get("fontSize", english_font_size)
                            if canvas_style.get("color"):
                                primary_color = css_to_ass_color(canvas_style["color"])
                            if canvas_style.get("borderWidth"):
                                outline_width = canvas_style["borderWidth"]
                        else:
                            margin_v = 60  # 기본값

                        style = f"FontName={font_name},FontSize={font_size},PrimaryColour={primary_color},OutlineColour=&H000000,BorderStyle=1,Outline={outline_width},Shadow=1,Alignment=2,MarginV={margin_v}"
                    else:
                        # 메인자막: Canvas 위치 정보 사용
                        font_size = title_font_size
                        primary_color = title_color
                        outline_width = max(2, int(font_size * 0.06))

                        # Canvas 위치 정보가 있으면 사용
                        if canvas_positions_data and canvas_positions_data.get("main"):
                            canvas_style = canvas_positions_data["main"]
                            y_position = canvas_style.get("yPosition", 0.85)  # 0~1 비율
                            margin_v = int(video_height * (1 - y_position))
                            font_size = canvas_style.get("fontSize", title_font_size)
                            if canvas_style.get("color"):
                                primary_color = css_to_ass_color(canvas_style["color"])
                            if canvas_style.get("borderWidth"):
                                outline_width = canvas_style["borderWidth"]
                        else:
                            margin_v = 220  # 기본값

                        style = f"FontName={font_name},FontSize={font_size},PrimaryColour={primary_color},OutlineColour=&H000000,BorderStyle=1,Outline={outline_width},Shadow=1,Alignment=2,MarginV={margin_v}"

                    logging.info(f"📝 SRT 자막 스타일: {sub_type} - 폰트={font_name} {font_size}px, 색상={primary_color}, 외곽선={outline_width}px, MarginV={margin_v}")
                    video_filters.append(f"subtitles={sub_path_escaped}:force_style='{style}'")

            # FFmpeg 명령어 구성
            cmd = ["/usr/bin/ffmpeg", "-i", str(video_file.absolute())]

            # 오디오 파일 입력 추가
            for audio_input in audio_inputs:
                cmd.extend(["-i", audio_input])

            cmd.append("-y")  # 파일 덮어쓰기

            # 비디오 필터 적용
            if video_filters:
                filter_string = ",".join(video_filters)
                cmd.extend(["-vf", filter_string])

            # 비디오에 오디오 스트림이 있는지 확인
            video_has_audio = False
            try:
                probe_cmd = ["/usr/bin/ffprobe", "-v", "error", "-select_streams", "a:0",
                           "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1:nokey=1",
                           str(video_file.absolute())]
                probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=10)
                video_has_audio = probe_result.returncode == 0 and probe_result.stdout.strip() == "audio"
                logging.info(f"🔊 비디오 오디오 스트림 존재: {video_has_audio}")
            except Exception as e:
                logging.warning(f"오디오 스트림 확인 실패: {e}")
                video_has_audio = False

            # 오디오 믹싱
            video_track_enabled = tracks_data.get("video", {}).get("enabled", True)
            video_muted = tracks_data.get("video", {}).get("muted", False)

            if len(audio_inputs) > 0:
                # 오디오 입력이 있는 경우
                audio_filter_inputs = []

                # 비디오 원본 오디오 (음소거되지 않고 오디오 스트림이 있는 경우)
                if video_track_enabled and not video_muted and video_has_audio:
                    audio_filter_inputs.append("[0:a]")

                # 추가 오디오 트랙들
                for i in range(len(audio_inputs)):
                    audio_filter_inputs.append(f"[{i+1}:a]")

                if len(audio_filter_inputs) > 1:
                    # 여러 오디오 믹싱
                    audio_filter = f"{''.join(audio_filter_inputs)}amix=inputs={len(audio_filter_inputs)}:duration=first:dropout_transition=2[aout]"
                    cmd.extend(["-filter_complex", audio_filter, "-map", "0:v", "-map", "[aout]"])
                elif len(audio_filter_inputs) == 1:
                    # 단일 오디오
                    cmd.extend(["-map", "0:v", "-map", audio_filter_inputs[0].strip("[]")])
                else:
                    # 오디오 없음
                    cmd.extend(["-map", "0:v", "-an"])
            else:
                # 오디오 입력이 없는 경우
                if video_track_enabled and not video_muted and video_has_audio:
                    cmd.extend(["-map", "0:v", "-map", "0:a"])
                else:
                    cmd.extend(["-map", "0:v", "-an"])

            # 출력 옵션
            cmd.extend([
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "192k",
                str(output_path)
            ])

            perf_marks['filter_construction'] = time.time() - perf_start

            logging.info(f"🎬 FFmpeg 명령어: {' '.join(cmd)}")

            # FFmpeg 실행
            perf_start = time.time()
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            perf_marks['ffmpeg_execution'] = time.time() - perf_start

            if result.returncode != 0:
                logging.error(f"FFmpeg 에러: {result.stderr}")
                raise HTTPException(status_code=500, detail=f"최종 영상 생성 실패: {result.stderr}")

            # 출력 파일 확인
            if output_path.exists():
                size_mb = output_path.stat().st_size / (1024 * 1024)

                # 총 시간 계산
                perf_marks['total_time'] = time.time() - perf_start_total

                # 성능 로그 출력
                logging.info(f"✅ 최종 영상 생성 완료: {output_path} ({size_mb:.2f}MB)")
                logging.info("⏱️ 성능 측정 결과:")
                logging.info(f"   - JSON 파싱: {perf_marks.get('json_parsing', 0):.3f}s")
                logging.info(f"   - 임시 디렉토리 생성: {perf_marks.get('temp_dir_creation', 0):.3f}s")
                logging.info(f"   - 오디오 파일 저장: {perf_marks.get('audio_file_save', 0):.3f}s")
                logging.info(f"   - 필터 구성: {perf_marks.get('filter_construction', 0):.3f}s")
                logging.info(f"   - FFmpeg 실행: {perf_marks.get('ffmpeg_execution', 0):.3f}s")
                logging.info(f"   - 전체 시간: {perf_marks.get('total_time', 0):.3f}s")

                return {
                    "success": True,
                    "output_path": str(output_path),
                    "file_name": output_name,
                    "size_mb": round(size_mb, 2),
                    "performance": {
                        "json_parsing": round(perf_marks.get('json_parsing', 0), 3),
                        "temp_dir_creation": round(perf_marks.get('temp_dir_creation', 0), 3),
                        "audio_file_save": round(perf_marks.get('audio_file_save', 0), 3),
                        "filter_construction": round(perf_marks.get('filter_construction', 0), 3),
                        "ffmpeg_execution": round(perf_marks.get('ffmpeg_execution', 0), 3),
                        "total_time": round(perf_marks.get('total_time', 0), 3)
                    }
                }
            else:
                raise HTTPException(status_code=500, detail="최종 영상 파일이 생성되지 않았습니다.")

        finally:
            # 임시 파일 정리
            for temp_file in temp_audio_files:
                try:
                    if temp_file.exists():
                        temp_file.unlink()
                except Exception as e:
                    logging.warning(f"임시 파일 삭제 실패: {temp_file}, {e}")
            try:
                if temp_dir.exists():
                    shutil.rmtree(temp_dir)
            except Exception as e:
                logging.warning(f"임시 디렉토리 삭제 실패: {temp_dir}, {e}")

    except HTTPException:
        raise
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="최종 영상 생성 시간 초과 (10분)")
    except Exception as e:
        logging.exception("최종 영상 생성 중 오류 발생")
        raise HTTPException(status_code=500, detail=f"최종 영상 생성 실패: {str(e)}")


@app.post("/api/video-analyzer/analyze-frames-with-ai")
async def api_analyze_frames_with_ai(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """AI를 사용한 프레임 분석"""
    import anthropic
    import openai
    import os

    try:
        frames = payload.get("frames", [])
        model = payload.get("model", "sonnet")
        analysis_type = payload.get("analysis_type", "scene-description")
        video_name = payload.get("video_name", "unknown")
        custom_prompt = payload.get("custom_prompt")
        subtitle_language_primary = payload.get("subtitle_language_primary", "korean")
        subtitle_language_secondary = payload.get("subtitle_language_secondary", "")
        original_titles = payload.get("original_titles", [])

        # 디버깅: 받은 데이터 로깅
        logging.info(f"🔍 AI 분석 요청 데이터:")
        logging.info(f"  - 프레임 수: {len(frames)}")
        logging.info(f"  - 원본 제목 수: {len(original_titles)}")
        logging.info(f"  - 원본 제목 목록: {original_titles}")
        if frames:
            logging.info(f"  - 첫 번째 프레임 시간: {frames[0].get('time', 'N/A')}초")

        # 언어별 지시사항
        language_instructions = {
            "korean": "한국어",
            "english": "English",
            "japanese": "日本語"
        }

        # 자막 언어 지시문 생성
        primary_lang = language_instructions.get(subtitle_language_primary, "한국어")

        if subtitle_language_secondary and subtitle_language_secondary != "":
            secondary_lang = language_instructions.get(subtitle_language_secondary, "")
            lang_instruction = f"""**🚨 필수 - 자막 언어 지시사항 🚨**:

각 프레임마다 반드시 다음 **3개의 자막을 모두 작성**해야 합니다:

1️⃣ **2-0. 한글 자막 (기본 자막)** ← 필수!
   - 반드시 한국어로 작성
   - 모든 한국 사용자를 위한 기본 자막
   - 예시: "개와 고양이의 대결!"

2️⃣ **2-1. 주 자막 ({primary_lang})** ← 필수!
   - 반드시 {primary_lang}로 작성
   - 화면 상단 배치용
   - 예시: "Epic Pet Battle!"

3️⃣ **2-2. 보조 자막 ({secondary_lang})** ← 필수!
   - 반드시 {secondary_lang}로 작성
   - 화면 하단 배치용
   - 예시: "ペット大決闘！"

⚠️ **중요**: 하나라도 빠뜨리지 말고 반드시 세 개 모두 작성하세요!"""
        else:
            lang_instruction = f"**중요**: 모든 자막과 나레이션은 **{primary_lang}**로 작성해주세요."

        if not frames:
            raise HTTPException(status_code=400, detail="분석할 프레임이 없습니다.")

        # 각 프레임에 해당하는 제목 매칭
        def match_title_for_frame(frame_time, titles):
            """프레임 시간에 해당하는 자막 제목 찾기"""
            for title in titles:
                start_time = title.get('startTime', 0)
                end_time = title.get('endTime', 0)
                if start_time <= frame_time < end_time:
                    return title.get('title')
            return None

        # 각 프레임에 제목 정보 추가
        for i, frame in enumerate(frames, 1):
            frame_time = frame.get('time', 0)
            matched_title = match_title_for_frame(frame_time, original_titles)
            frame['matched_title'] = matched_title
            logging.info(f"  - 프레임 {i} ({frame_time}초): 매칭된 제목 = '{matched_title}'")

        # 원본 제목 정보 구성
        original_titles_text = ""
        if original_titles and len(original_titles) > 0:
            titles_list = "\n".join([f"- [{t.get('frame')}] {t.get('title')} ({t.get('startTime')}초~{t.get('endTime')}초)" for t in original_titles])
            original_titles_text = f"""
**중요 - 원본 영상 제목 참고**:
이 영상들의 원본 제목과 시간 구간은 다음과 같습니다:
{titles_list}

**각 프레임은 해당 시간 구간의 제목을 기반으로 분석해야 합니다!**

원본 제목의 키워드와 분위기를 **반드시** 반영하여 분석해주세요.
예를 들어 "fight", "battle", "vs"가 포함되어 있다면 싸움이나 대립 상황으로,
"friendship", "love", "together"가 포함되어 있다면 우정이나 친밀함으로 해석해주세요.
원본 제목을 무시하고 임의로 해석하지 마세요.

"""

        # 커스텀 프롬프트가 제공되면 사용, 아니면 기본 프롬프트 사용
        if analysis_type == "custom" and custom_prompt:
            prompt = original_titles_text + custom_prompt
        else:
            # 자막 섹션 구성
            if subtitle_language_secondary and subtitle_language_secondary != "":
                subtitle_section = f"""### 2-0. 한글 자막 (기본 자막) ✅ 필수
- 한국어로 작성 (20자 이내)
- 원본 영상 제목의 키워드를 반영한 임팩트 있는 한글 문구
- 예: "개와 고양이 격투!", "우정의 시작"

### 2-1. 주 자막 ({primary_lang}) - 상단 배치용 ✅ 필수
- {primary_lang}로 작성 (20자 이내)
- 화면 상단에 표시될 임팩트 있는 텍스트
- 원본 영상 제목의 키워드를 반영

### 2-2. 보조 자막 ({secondary_lang}) - 하단 배치용 ✅ 필수
- {secondary_lang}로 작성 (20자 이내)
- 화면 하단에 표시될 임팩트 있는 텍스트
- 원본 영상 제목의 키워드를 반영"""
            else:
                subtitle_section = """### 2. 화면 텍스트 (자막/캡션)
- 화면에 표시될 임팩트 있는 텍스트 (20자 이내)
- 강조할 키워드나 문구"""

            # 각 프레임별 제목 정보 구성
            frame_title_info = "\n\n**각 프레임의 원본 영상 제목 (반드시 이 제목에 맞춰 분석하세요!)**:\n"
            for i, frame in enumerate(frames, 1):
                matched_title = frame.get('matched_title')
                frame_time = frame.get('time', 0)
                if matched_title:
                    frame_title_info += f"- 프레임 {i} ({frame_time}초): \"{matched_title}\" ← 이 제목 기반으로 분석!\n"
                else:
                    frame_title_info += f"- 프레임 {i} ({frame_time}초): 제목 없음\n"

            # 프롬프트 생성
            prompts = {
                "shorts-production": f"""{original_titles_text}{frame_title_info}

다음은 '{video_name}' 영상에서 추출한 {len(frames)}개의 프레임입니다.
이 프레임들을 바탕으로 YouTube 쇼츠(Shorts) 제작을 위한 종합 분석을 해주세요.

{lang_instruction}

다음 형식으로 각 프레임별로 분석해주세요:

## 프레임 [번호]: [타임스탬프] - 원본 제목: "[해당 제목]"

⚠️ **중요**: 위에 명시된 각 프레임의 원본 제목을 **반드시** 참고하여 그 제목의 내용과 분위기에 맞게 분석하세요!

### 1. 시청자용 콘텐츠 설명
- 이 장면에서 전달하려는 핵심 메시지
- 시청자가 느껴야 할 감정이나 반응
- 주목해야 할 포인트

**중요: 다음 자막 섹션은 모두 필수입니다. 반드시 모든 섹션을 작성하세요!**

{subtitle_section}

**자막 작성 예시:**
### 2-0. 한글 자막 (기본 자막)
- "개와 고양이의 대결!"

### 2-1. 주 자막 (English) - 상단 배치용
- "Epic Pet Battle!"

### 2-2. 보조 자막 (日本語) - 하단 배치용
- "ペット大決闘！"

### 3. 나레이션 스크립트
- 보이스오버로 읽을 대사 (자연스럽고 구어체로)
- 예상 읽기 시간: 3-5초

### 4. AI 이미지 생성 프롬프트 (**반드시 영어로만 작성**)
- **IMPORTANT: Write ONLY in English!**
- DALL-E/Midjourney용 상세 묘사
- 스타일, 조명, 구도, 색감 포함
- 예시: "A vibrant YouTube shorts thumbnail, close-up shot, warm lighting, person expressing excitement, modern minimalist background, high contrast, 9:16 aspect ratio"

### 5. AI 영상 생성 프롬프트 (**반드시 영어로만 작성**)
- **IMPORTANT: Write ONLY in English!**
- Sora/Kling/Runway용 동적 장면 묘사
- 카메라 움직임, 액션, 모션 포함
- 시간적 흐름과 변화 설명
- 예시: "Slow zoom in on person's excited face, hands gesturing enthusiastically, natural head movements, soft camera shake for realism, warm lighting gradually brightening, 9:16 vertical format, 3-5 seconds duration"

### 6. 편집 노트
- 전환 효과 제안
- BGM 분위기 제안
- 추가 시각 효과 아이디어

전체 쇼츠는 60초 이내로 구성됩니다. 각 프레임이 전체 스토리 흐름에서 어떤 역할을 하는지 고려해주세요.""",

                "scene-description": f"""{original_titles_text}다음은 '{video_name}' 영상에서 추출한 {len(frames)}개의 프레임입니다.
각 프레임을 상세히 분석하여 다음 정보를 제공해주세요:

1. 각 프레임의 장면 설명 (무엇이 보이는지, 어떤 상황인지)
2. 주요 객체나 인물
3. 배경과 분위기
4. 전체적인 스토리 흐름

프레임 순서대로 분석해주세요.""",

                "object-detection": f"""{original_titles_text}'{video_name}' 영상의 {len(frames)}개 프레임에서 보이는 모든 객체를 인식하고 나열해주세요.

각 프레임별로:
- 사람 (수, 성별, 연령대 등)
- 물체 (종류, 위치)
- 텍스트 (있다면)
- 브랜드나 로고 (있다면)

을 자세히 분석해주세요.""",

                "text-extraction": f"""{original_titles_text}'{video_name}' 영상의 {len(frames)}개 프레임에서 보이는 모든 텍스트를 추출해주세요.

각 프레임별로:
- 화면에 표시된 모든 텍스트
- 텍스트의 위치와 크기
- 텍스트의 중요도
- 자막, 제목, 설명 등 구분

을 분석해주세요.""",

                "story-flow": f"""{original_titles_text}'{video_name}' 영상의 {len(frames)}개 프레임을 시간순으로 분석하여 스토리의 흐름을 파악해주세요.

다음을 포함해주세요:
- 전체 스토리 요약
- 시작-전개-절정-결말 구조
- 각 장면 전환의 의미
- 핵심 메시지나 주제

영상의 내러티브를 이해할 수 있도록 분석해주세요.""",

                "thumbnail-suggest": f"""{original_titles_text}'{video_name}' 영상의 {len(frames)}개 프레임 중에서 썸네일로 사용하기 가장 좋은 프레임을 추천해주세요.

다음 기준으로 평가해주세요:
- 시각적 임팩트
- 클릭을 유도하는 요소
- 영상 내용 대표성
- 감정적 어필

각 프레임을 평가하고 순위를 매겨주세요."""
            }

            prompt = prompts.get(analysis_type, prompts["scene-description"])

        # AI 모델별 처리
        if model in ["sonnet", "haiku"]:
            # Claude API 사용
            client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

            model_map = {
                "sonnet": "claude-3-5-sonnet-20241022",
                "haiku": "claude-3-5-haiku-20241022"
            }

            # 이미지 메시지 구성
            content = [{"type": "text", "text": prompt}]

            for frame in frames:
                content.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": frame["image_data"]
                    }
                })

            message = client.messages.create(
                model=model_map[model],
                max_tokens=4000,
                messages=[{"role": "user", "content": content}]
            )

            analysis_result = message.content[0].text

        else:
            # OpenAI API 사용
            client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

            model_map = {
                "gpt-4o-mini": "gpt-4o-mini",
                "gpt-4o": "gpt-4o"
            }

            # 이미지 메시지 구성
            content = [{"type": "text", "text": prompt}]

            for frame in frames:
                content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{frame['image_data']}"
                    }
                })

            response = client.chat.completions.create(
                model=model_map.get(model, "gpt-4o-mini"),
                messages=[{"role": "user", "content": content}],
                max_tokens=4000
            )

            analysis_result = response.choices[0].message.content

        logging.info(f"AI 프레임 분석 완료: {len(frames)}개 프레임, 모델: {model}, 타입: {analysis_type}")

        return {
            "success": True,
            "analysis_result": analysis_result,
            "frames_count": len(frames),
            "model": model,
            "analysis_type": analysis_type
        }

    except HTTPException:
        raise
    except Exception as e:
        logging.exception("AI 프레임 분석 중 오류 발생")
        raise HTTPException(status_code=500, detail=f"AI 프레임 분석 실패: {str(e)}")


@app.put("/api/video-analyzer/rename-file")
async def api_rename_video_file(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """영상 파일 이름 변경"""
    try:
        old_path = payload.get("old_path")
        new_name = payload.get("new_name")

        if not old_path or not new_name:
            raise HTTPException(status_code=400, detail="old_path와 new_name이 필요합니다.")

        old_path_obj = Path(old_path)

        # 파일 존재 확인
        if not old_path_obj.exists():
            raise HTTPException(status_code=404, detail=f"파일을 찾을 수 없습니다: {old_path}")

        # 디렉토리인 경우 거부
        if old_path_obj.is_dir():
            raise HTTPException(status_code=400, detail="디렉토리는 이름을 변경할 수 없습니다.")

        # 새 경로 생성
        new_path_obj = old_path_obj.parent / new_name

        # 이미 같은 이름의 파일이 있는지 확인
        if new_path_obj.exists():
            raise HTTPException(status_code=400, detail=f"이미 같은 이름의 파일이 존재합니다: {new_name}")

        # 파일 이름 변경
        old_path_obj.rename(new_path_obj)

        logging.info(f"파일 이름 변경 완료: {old_path} -> {new_path_obj}")

        return {
            "success": True,
            "message": "파일 이름이 변경되었습니다.",
            "old_path": str(old_path),
            "new_path": str(new_path_obj),
            "new_name": new_name
        }

    except HTTPException:
        raise
    except PermissionError:
        raise HTTPException(status_code=403, detail="파일 이름 변경 권한이 없습니다.")
    except Exception as e:
        logging.exception("파일 이름 변경 중 오류 발생")
        raise HTTPException(status_code=500, detail=f"파일 이름 변경 실패: {str(e)}")


@app.delete("/api/video-analyzer/delete-file")
async def api_delete_video_file(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """영상 파일 삭제"""
    import os

    try:
        file_path = payload.get("file_path")

        if not file_path:
            raise HTTPException(status_code=400, detail="file_path가 필요합니다.")

        file_path_obj = Path(file_path)

        # 파일 존재 확인
        if not file_path_obj.exists():
            raise HTTPException(status_code=404, detail=f"파일을 찾을 수 없습니다: {file_path}")

        # 디렉토리인 경우 거부
        if file_path_obj.is_dir():
            raise HTTPException(status_code=400, detail="디렉토리는 삭제할 수 없습니다.")

        # 파일 삭제
        file_size = file_path_obj.stat().st_size
        file_path_obj.unlink()

        logging.info(f"파일 삭제 완료: {file_path} ({file_size} bytes)")

        return {
            "success": True,
            "message": "파일이 삭제되었습니다.",
            "deleted_file": str(file_path),
            "size_bytes": file_size
        }

    except HTTPException:
        raise
    except PermissionError:
        raise HTTPException(status_code=403, detail="파일 삭제 권한이 없습니다.")
    except Exception as e:
        logging.exception("파일 삭제 중 오류 발생")
        raise HTTPException(status_code=500, detail=f"파일 삭제 실패: {str(e)}")


@app.post("/api/video-analyzer/translate-subtitles")
async def api_translate_subtitles(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """자막 번역 API"""
    import os

    try:
        subtitles = payload.get("subtitles", [])
        target_lang = payload.get("target_lang", "en")

        if not subtitles:
            raise HTTPException(status_code=400, detail="번역할 자막이 없습니다.")

        logging.info(f"자막 번역 시작: {len(subtitles)}개 자막을 {target_lang}로 번역")

        # 언어 코드를 언어 이름으로 변환
        lang_names = {
            'en': 'English',
            'ja': 'Japanese',
            'zh': 'Chinese',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'vi': 'Vietnamese',
            'th': 'Thai'
        }
        target_lang_name = lang_names.get(target_lang, target_lang)

        # Anthropic API 사용 (Claude)
        try:
            import anthropic

            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY가 설정되지 않았습니다.")

            client = anthropic.Anthropic(api_key=api_key)

            # 자막 텍스트만 추출
            subtitle_texts = [sub.get('text', '') for sub in subtitles]

            # 번역 요청
            prompt = f"""Translate the following subtitles to {target_lang_name}.
Keep the same number of lines and maintain the timing structure.
Only return the translated text for each subtitle, one per line, without any additional formatting or explanations.

Original subtitles:
{chr(10).join(subtitle_texts)}"""

            message = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=8000,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )

            # 번역 결과 파싱
            translated_text = message.content[0].text
            translated_lines = translated_text.strip().split('\n')

            # 번역된 텍스트를 원본 자막 구조에 매핑
            translated_subtitles = []
            for i, subtitle in enumerate(subtitles):
                if i < len(translated_lines):
                    translated_subtitles.append({
                        'start': subtitle.get('start'),
                        'end': subtitle.get('end'),
                        'text': translated_lines[i].strip()
                    })
                else:
                    # 번역 결과가 부족한 경우 원본 유지
                    translated_subtitles.append(subtitle)

            logging.info(f"번역 완료: {len(translated_subtitles)}개 자막")

            return {
                "success": True,
                "translated_subtitles": translated_subtitles,
                "target_lang": target_lang,
                "count": len(translated_subtitles)
            }

        except ImportError:
            # Anthropic이 없으면 OpenAI 시도
            try:
                import openai

                api_key = os.getenv("OPENAI_API_KEY")
                if not api_key:
                    raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다.")

                client = openai.OpenAI(api_key=api_key)

                # 자막 텍스트만 추출
                subtitle_texts = [sub.get('text', '') for sub in subtitles]

                # 번역 요청
                prompt = f"""Translate the following subtitles to {target_lang_name}.
Keep the same number of lines and maintain the timing structure.
Only return the translated text for each subtitle, one per line, without any additional formatting or explanations.

Original subtitles:
{chr(10).join(subtitle_texts)}"""

                response = client.chat.completions.create(
                    model="gpt-4",
                    messages=[
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=8000
                )

                # 번역 결과 파싱
                translated_text = response.choices[0].message.content
                translated_lines = translated_text.strip().split('\n')

                # 번역된 텍스트를 원본 자막 구조에 매핑
                translated_subtitles = []
                for i, subtitle in enumerate(subtitles):
                    if i < len(translated_lines):
                        translated_subtitles.append({
                            'start': subtitle.get('start'),
                            'end': subtitle.get('end'),
                            'text': translated_lines[i].strip()
                        })
                    else:
                        # 번역 결과가 부족한 경우 원본 유지
                        translated_subtitles.append(subtitle)

                logging.info(f"번역 완료: {len(translated_subtitles)}개 자막")

                return {
                    "success": True,
                    "translated_subtitles": translated_subtitles,
                    "target_lang": target_lang,
                    "count": len(translated_subtitles)
                }

            except ImportError:
                raise HTTPException(
                    status_code=500,
                    detail="번역 API 라이브러리가 설치되지 않았습니다. anthropic 또는 openai 패키지를 설치해주세요."
                )

    except HTTPException:
        raise
    except Exception as e:
        logging.exception("자막 번역 중 오류 발생")
        raise HTTPException(status_code=500, detail=f"자막 번역 실패: {str(e)}")


@app.post("/api/video-analyzer/analyze-subtitles-with-ai")
async def api_analyze_subtitles_with_ai(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """AI를 사용한 자막 분석 - 쇼츠 최적화, 영상 요약, 교육 콘텐츠 제작"""
    import anthropic
    import openai
    import os

    try:
        subtitle_content = payload.get("subtitle_content", "")
        model = payload.get("model", "sonnet")
        analysis_type = payload.get("analysis_type", "enhanced-shorts")

        if not subtitle_content:
            raise HTTPException(status_code=400, detail="분석할 자막이 없습니다.")

        logging.info(f"AI 자막 분석 시작: 모델={model}, 타입={analysis_type}")

        # 분석 타입별 프롬프트
        type_prompts = {
            "enhanced-shorts": """이 자막을 60초 이내 YouTube 쇼츠로 편집하기 위해 분석해주세요.
- 핵심 하이라이트 구간만 남기고 나머지는 삭제
- 60-70% 정도의 자막을 삭제하여 빠른 템포 유지
- 임팩트 있는 텍스트 오버레이 추가 (예: "💥 주목!", "🔥 핵심")
- 시청자 후킹을 위한 짧은 나레이션 추가""",

            "enhanced-summary": """이 자막을 3-5분 요약 영상으로 편집하기 위해 분석해주세요.
- 핵심 내용만 남기고 반복/부연설명 삭제
- 40-50% 정도의 자막 삭제
- 챕터 구분을 위한 텍스트 추가 (예: "[챕터 1]", "[핵심 요약]")
- 요약 설명을 위한 나레이션 추가""",

            "enhanced-education": """이 자막을 교육 콘텐츠로 편집하기 위해 분석해주세요.
- 핵심 교육 내용은 최대한 유지
- 20-30% 정도만 삭제 (불필요한 부분만)
- 개념 강조를 위한 텍스트 추가 (예: "📌 개념", "💡 복습 포인트")
- 설명을 보완하는 나레이션 추가"""
        }

        prompt = f"""{type_prompts.get(analysis_type, type_prompts["enhanced-shorts"])}

자막 내용:
{subtitle_content}

다음 JSON 형식으로 분석 결과를 반환해주세요:
{{
    "video_type": "{analysis_type}",
    "kept_originals": [
        {{
            "index": 번호,
            "time": "시작 --> 끝",
            "text": "자막 텍스트",
            "reason": "유지 이유",
            "importance": "high/medium/low"
        }}
    ],
    "deletions": [
        {{
            "index": 번호,
            "time": "시작 --> 끝",
            "text": "자막 텍스트",
            "reason": "삭제 이유",
            "category": "반복/부연/불필요"
        }}
    ],
    "text_additions": [
        {{
            "insert_after": 번호,
            "estimated_time": "00:00:10",
            "text": "추가할 텍스트",
            "type": "후킹/챕터제목/개념정의",
            "position": "top/center/bottom"
        }}
    ],
    "narration_additions": [
        {{
            "insert_after": 번호,
            "estimated_time": "00:00:10",
            "narration": "나레이션 텍스트",
            "type": "도입/전환/요약",
            "tone": "흥미진진한/차분한/진지한"
        }}
    ],
    "statistics": {{
        "original_count": 전체 자막 수,
        "kept_count": 유지 자막 수,
        "delete_count": 삭제 자막 수,
        "text_add_count": 텍스트 추가 수,
        "narration_add_count": 나레이션 추가 수
    }}
}}"""

        # API 호출
        if model in ["sonnet", "haiku"]:
            # Anthropic API 사용
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise HTTPException(status_code=400, detail="ANTHROPIC_API_KEY가 설정되지 않았습니다.")

            client = anthropic.Anthropic(api_key=api_key)

            model_name = "claude-3-5-sonnet-20241022" if model == "sonnet" else "claude-3-5-haiku-20241022"

            message = client.messages.create(
                model=model_name,
                max_tokens=8000,
                messages=[{"role": "user", "content": prompt}]
            )

            response_text = message.content[0].text.strip()

        else:
            # OpenAI API 사용
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise HTTPException(status_code=400, detail="OPENAI_API_KEY가 설정되지 않았습니다.")

            client = openai.OpenAI(api_key=api_key)

            model_name = "gpt-4o" if model == "gpt-4o" else "gpt-4o-mini"

            completion = client.chat.completions.create(
                model=model_name,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=8000
            )

            response_text = completion.choices[0].message.content.strip()

        # JSON 파싱
        import json
        import re

        # JSON 추출 (코드 블록 제거)
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response_text, re.DOTALL)
        if json_match:
            response_text = json_match.group(1)

        result = json.loads(response_text)

        logging.info(f"AI 자막 분석 완료: {result.get('statistics', {})}")

        return {
            "success": True,
            "result": result
        }

    except json.JSONDecodeError as e:
        logging.error(f"JSON 파싱 오류: {e}\n응답: {response_text}")
        raise HTTPException(status_code=500, detail=f"AI 응답 파싱 실패: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("AI 자막 분석 중 오류 발생")
        raise HTTPException(status_code=500, detail=f"AI 자막 분석 실패: {str(e)}")


@app.post("/api/video-analyzer/generate-title-subtitle")
async def api_generate_title_subtitle(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """AI를 사용하여 영상 제목과 부제목 생성"""
    import os

    try:
        video_path_str = payload.get("video_path", "")
        video_info = payload.get("video_info", {})
        selected_model = payload.get("model", "claude")  # 기본값은 claude

        if not video_path_str:
            raise HTTPException(status_code=400, detail="영상 경로가 필요합니다.")

        video_path = Path(video_path_str)
        if not video_path.exists():
            raise HTTPException(status_code=404, detail="영상 파일을 찾을 수 없습니다.")

        logging.info(f"AI 제목/부제목 생성 시작: {video_path.name} (모델: {selected_model})")

        # 영상 정보 추출
        video_name = video_path.stem
        video_ext = video_path.suffix

        # 자막 파일 찾기 (같은 폴더에서)
        subtitle_text = ""
        for ext in ['.ko.srt', '.srt', '.en.srt']:
            subtitle_path = video_path.parent / f"{video_path.stem}{ext}"
            if subtitle_path.exists():
                try:
                    with open(subtitle_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        # 자막 번호와 타임코드 제거, 텍스트만 추출
                        import re
                        subtitle_blocks = re.split(r'\n\d+\n', content)
                        text_lines = []
                        for block in subtitle_blocks:
                            lines = block.strip().split('\n')
                            # 타임코드 라인 제거 (00:00:00,000 --> 00:00:00,000 형식)
                            text_content = [line for line in lines if '-->' not in line]
                            text_lines.extend(text_content)
                        subtitle_text = ' '.join(text_lines[:50])  # 처음 50줄만 사용
                        break
                except Exception as e:
                    logging.warning(f"자막 파일 읽기 실패: {e}")

        # AI 프롬프트 구성
        prompt = f"""영상 제목과 부제목을 생성해주세요.

영상 파일명: {video_name}
{'자막 내용: ' + subtitle_text if subtitle_text else '(자막 없음)'}

요구사항:
1. 영상 파일명과 자막 내용을 분석하여 매력적이고 클릭을 유도하는 제목을 만들어주세요.
2. **제목 앞에 관련있는 이모지 아이콘을 반드시 추가해주세요** (예: 🔥, 💰, 🎯, ⚡, 💡, 🚀, ✨ 등)
3. 부제목은 제목을 보완하고 추가 정보를 제공해야 합니다.
4. 제목은 이모지 포함 한글로 35자 이내, 부제목은 20자 이내로 작성해주세요.
5. 응답은 반드시 다음 JSON 형식으로만 답변해주세요:
{{"title": "🔥 제목", "subtitle": "부제목"}}

추가 설명이나 다른 텍스트 없이 JSON만 반환해주세요."""

        # 모델 선택에 따라 API 호출
        import json
        import re

        if selected_model == "claude":
            # Anthropic API 사용 (Claude)
            try:
                import anthropic

                api_key = os.getenv("ANTHROPIC_API_KEY")
                if not api_key:
                    raise HTTPException(
                        status_code=400,
                        detail="ANTHROPIC_API_KEY가 설정되지 않았습니다. GPT 모델을 선택하거나 Anthropic API 키를 설정해주세요."
                    )

                client = anthropic.Anthropic(api_key=api_key)

                message = client.messages.create(
                    model="claude-3-5-sonnet-20241022",
                    max_tokens=1000,
                    messages=[
                        {"role": "user", "content": prompt}
                    ]
                )

                # 응답 파싱
                response_text = message.content[0].text.strip()

            except ImportError:
                raise HTTPException(
                    status_code=500,
                    detail="Anthropic 라이브러리가 설치되지 않았습니다. pip install anthropic을 실행하거나 GPT 모델을 선택해주세요."
                )
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"Claude API 호출 실패: {str(e)}"
                )

        elif selected_model == "gpt":
            # OpenAI API 사용 (GPT)
            try:
                import openai

                api_key = os.getenv("OPENAI_API_KEY")
                if not api_key:
                    raise HTTPException(
                        status_code=400,
                        detail="OPENAI_API_KEY가 설정되지 않았습니다."
                    )

                client = openai.OpenAI(api_key=api_key)

                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=1000
                )

                response_text = response.choices[0].message.content.strip()

            except ImportError:
                raise HTTPException(
                    status_code=500,
                    detail="OpenAI 라이브러리가 설치되지 않았습니다. pip install openai을 실행해주세요."
                )
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"GPT API 호출 실패: {str(e)}"
                )
        else:
            raise HTTPException(status_code=400, detail=f"지원하지 않는 모델입니다: {selected_model}")

        # JSON 추출 (markdown 코드 블록이 있을 수 있음)
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response_text, re.DOTALL)
        if json_match:
            json_text = json_match.group(1)
        else:
            # 그냥 JSON 찾기
            json_match = re.search(r'\{.*?\}', response_text, re.DOTALL)
            if json_match:
                json_text = json_match.group(0)
            else:
                json_text = response_text

        result = json.loads(json_text)

        title = result.get("title", "")
        subtitle = result.get("subtitle", "")

        if not title:
            raise ValueError("제목이 생성되지 않았습니다.")

        logging.info(f"AI 제목/부제목 생성 완료 ({selected_model}): {title} / {subtitle}")

        return {
            "success": True,
            "title": title,
            "subtitle": subtitle,
            "model": selected_model
        }

    except HTTPException:
        raise
    except Exception as e:
        logging.exception("AI 제목/부제목 생성 중 오류 발생")
        raise HTTPException(status_code=500, detail=f"AI 제목/부제목 생성 실패: {str(e)}")


@app.post("/api/ytdl/start")
async def api_start_download(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """백그라운드로 다운로드 시작"""
    import asyncio
    import threading
    from uuid import uuid4 as generate_uuid

    task_id = str(generate_uuid())
    urls_str = payload.get("urls", "")
    output_dir = payload.get("output_dir", "")
    sub_langs = payload.get("sub_langs", "ko")
    sub_format = payload.get("sub_format", "srt/best")
    download_subs_enabled = payload.get("download_subs", True)
    auto_subs_enabled = payload.get("auto_subs", True)
    dry_run_enabled = payload.get("dry_run", False)
    extract_vocal = payload.get("extract_vocal", False)
    extract_instruments = payload.get("extract_instruments", False)

    parsed_urls = _split_urls(urls_str)

    if not parsed_urls:
        raise HTTPException(status_code=400, detail="최소 하나의 유효한 URL을 입력하세요.")

    # 초기 상태 설정
    download_tasks[task_id] = {
        "status": "starting",
        "progress": 0,
        "total": len(parsed_urls),
        "current": 0,
        "message": "다운로드 준비 중...",
        "files": [],
        "error": None,
        "completed": False,
    }

    def progress_callback(d):
        """yt-dlp progress hook"""
        if d["status"] == "downloading":
            # 진행율 계산
            downloaded = d.get("downloaded_bytes", 0)
            total = d.get("total_bytes") or d.get("total_bytes_estimate", 0)

            if total > 0:
                percent = (downloaded / total) * 100
                download_tasks[task_id]["progress"] = round(percent, 1)
                download_tasks[task_id]["message"] = f"다운로드 중... {percent:.1f}%"
        elif d["status"] == "finished":
            download_tasks[task_id]["message"] = "다운로드 완료, 처리 중..."

    def run_download():
        """백그라운드 스레드에서 다운로드 실행"""
        try:
            download_tasks[task_id]["status"] = "downloading"
            download_tasks[task_id]["message"] = "다운로드 중..."

            files = download_with_options(
                parsed_urls,
                output_dir or None,
                skip_download=dry_run_enabled,
                download_subs=download_subs_enabled,
                auto_subs=auto_subs_enabled,
                sub_langs=sub_langs,
                sub_format=sub_format,
                progress_hook=progress_callback,
            )

            # 오디오 분리 처리 (dry_run이 아닐 때)
            audio_files = []
            if not dry_run_enabled and (extract_vocal or extract_instruments):
                download_tasks[task_id]["message"] = "오디오 분리 중..."
                audio_files = extract_audio_sources(
                    files, extract_vocal, extract_instruments
                )
                files.extend(audio_files)

            # 다운로드 기록에 추가
            if not dry_run_enabled and files:
                form_values = {
                    "output_dir": output_dir,
                    "sub_langs": sub_langs,
                    "sub_format": sub_format,
                    "download_subs": download_subs_enabled,
                    "auto_subs": auto_subs_enabled,
                    "dry_run": dry_run_enabled,
                    "extract_vocal": extract_vocal,
                    "extract_instruments": extract_instruments,
                }
                add_to_download_history(parsed_urls, files, form_values)

            download_tasks[task_id].update({
                "status": "completed",
                "progress": 100,
                "message": "다운로드 완료",
                "files": [str(f) for f in files],
                "completed": True,
            })
        except Exception as e:
            logging.exception("다운로드 중 오류 발생")
            download_tasks[task_id].update({
                "status": "error",
                "message": f"오류 발생: {str(e)}",
                "error": str(e),
                "completed": True,
            })

    # 백그라운드 스레드로 다운로드 시작
    thread = threading.Thread(target=run_download, daemon=True)
    thread.start()

    return {
        "task_id": task_id,
        "message": "다운로드가 시작되었습니다.",
    }


@app.get("/api/ytdl/status/{task_id}")
async def api_get_download_status(task_id: str) -> Dict[str, Any]:
    """다운로드 진행 상태 조회"""
    if task_id not in download_tasks:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")

    return download_tasks[task_id]


@app.get("/api/ytdl/history")
async def api_get_download_history() -> List[Dict[str, Any]]:
    """Get download history."""
    return load_download_history()


@app.delete("/api/ytdl/files")
async def api_delete_files(file_paths: List[str] = Body(...)) -> Dict[str, Any]:
    """Delete downloaded files."""
    return delete_download_files(file_paths)


@app.post("/api/ytdl/extract-audio")
async def api_extract_audio(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    """Extract vocal and/or instruments from already downloaded video files as background task."""
    import threading
    from uuid import uuid4 as generate_uuid

    file_paths_str = payload.get("file_paths", [])
    extract_vocal = payload.get("extract_vocal", False)
    extract_instruments = payload.get("extract_instruments", False)

    if not file_paths_str:
        raise HTTPException(status_code=400, detail="file_paths가 필요합니다.")

    if not extract_vocal and not extract_instruments:
        raise HTTPException(status_code=400, detail="최소 하나의 추출 옵션을 선택해야 합니다.")

    # 문자열 경로를 Path 객체로 변환
    file_paths = [Path(fp) for fp in file_paths_str]

    # 파일 존재 여부 확인
    existing_files = [fp for fp in file_paths if fp.exists()]

    if not existing_files:
        raise HTTPException(status_code=404, detail="유효한 파일이 없습니다.")

    # Task ID 생성
    task_id = str(generate_uuid())

    # 초기 상태 설정
    extraction_tasks[task_id] = {
        "status": "starting",
        "progress": 0,
        "total": len(existing_files),
        "current": 0,
        "message": "오디오 추출 준비 중...",
        "extracted_files": [],
        "error": None,
        "completed": False,
    }

    def progress_callback(current: int, total: int, message: str):
        """Progress callback for extraction"""
        progress_percent = (current / total * 100) if total > 0 else 0
        extraction_tasks[task_id]["current"] = current
        extraction_tasks[task_id]["progress"] = progress_percent
        extraction_tasks[task_id]["message"] = message

    def run_extraction():
        """백그라운드 스레드에서 오디오 추출 실행"""
        try:
            extraction_tasks[task_id]["status"] = "extracting"
            extraction_tasks[task_id]["message"] = "오디오 추출 중..."

            extracted_files = extract_audio_sources(
                existing_files,
                extract_vocal,
                extract_instruments,
                progress_callback
            )

            extraction_tasks[task_id].update({
                "status": "completed",
                "progress": 100,
                "message": "오디오 추출 완료",
                "extracted_files": [str(f) for f in extracted_files],
                "completed": True,
            })
        except Exception as e:
            logging.exception("오디오 추출 중 오류 발생")
            extraction_tasks[task_id].update({
                "status": "error",
                "message": f"오류 발생: {str(e)}",
                "error": str(e),
                "completed": True,
            })

    # 백그라운드 스레드로 추출 시작
    thread = threading.Thread(target=run_extraction, daemon=True)
    thread.start()

    return {
        "task_id": task_id,
        "message": "오디오 추출이 시작되었습니다.",
    }


@app.get("/api/ytdl/extract-audio/status/{task_id}")
async def api_get_extraction_status(task_id: str) -> Dict[str, Any]:
    """오디오 추출 진행 상태 조회"""
    if task_id not in extraction_tasks:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다.")

    return extraction_tasks[task_id]


@app.get("/api/ytdl/load-from-ytdl-server")
async def api_load_from_ytdl_server() -> Dict[str, Any]:
    """8001 포트의 ytdl 서버에서 다운로드 기록을 가져옵니다."""
    import httpx

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get("http://127.0.0.1:8001/api/ytdl/history")
            response.raise_for_status()
            history = response.json()

            # 다운로드된 파일들을 추출하여 반환
            files = []
            for record in history:
                if "files" in record:
                    for file_path in record["files"]:
                        path_obj = Path(file_path)
                        if path_obj.exists():
                            files.append({
                                "path": str(path_obj),
                                "name": path_obj.name,
                                "timestamp": record.get("timestamp", ""),
                                "size": path_obj.stat().st_size,
                            })

            return {
                "success": True,
                "files": files,
                "history": history,
            }
    except httpx.HTTPError as e:
        logger.error(f"8001 포트 연결 실패: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"다운로드 서버(8001)에 연결할 수 없습니다: {str(e)}"
        )
    except Exception as e:
        logger.error(f"다운로드 기록 불러오기 실패: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"다운로드 기록을 불러올 수 없습니다: {str(e)}"
        )


@app.post("/api/ytdl/upload-file")
async def api_upload_file(file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    사용자가 선택한 파일을 업로드하여 vocal/instruments 분리에 사용할 수 있도록 합니다.
    업로드된 파일은 다운로드 기록에 추가됩니다.
    """
    import shutil
    from datetime import datetime

    # 파일 확장자 검증
    allowed_extensions = {".mp4", ".webm", ".mkv", ".avi", ".mov", ".wav", ".mp3", ".m4a", ".ogg", ".flac"}
    file_ext = Path(file.filename or "").suffix.lower()

    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"지원하지 않는 파일 형식입니다. 허용된 형식: {', '.join(allowed_extensions)}"
        )

    try:
        # 고유한 파일명 생성 (타임스탬프 + 원본 파일명)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_filename = file.filename.replace(" ", "_")
        unique_filename = f"{timestamp}_{safe_filename}"
        file_path = YTDL_UPLOAD_DIR / unique_filename

        # 파일 저장
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        logger.info(f"파일 업로드 완료: {file_path}")

        # 다운로드 기록에 추가
        history = load_download_history()
        upload_record = {
            "timestamp": datetime.now().isoformat(),
            "urls": ["Uploaded File"],
            "files": [str(file_path)],
            "settings": {
                "output_dir": str(YTDL_UPLOAD_DIR),
                "sub_langs": "",
                "download_subs": False,
                "auto_subs": False,
            }
        }
        history.insert(0, upload_record)
        history = history[:100]  # Keep only last 100 records
        save_download_history(history)

        return {
            "success": True,
            "file_path": str(file_path),
            "file_name": unique_filename,
            "message": "파일이 성공적으로 업로드되었습니다."
        }

    except Exception as e:
        logger.error(f"파일 업로드 중 오류 발생: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"파일 업로드 중 오류가 발생했습니다: {str(e)}"
        )


@app.get("/api/copyright/settings")
def api_get_copyright_settings() -> Dict[str, Any]:
    return load_copyright_settings()


@app.post("/api/copyright/settings")
def api_save_copyright_settings(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    try:
        save_copyright_settings(payload)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"설정을 저장하지 못했습니다: {exc}",
        ) from exc
    return {"message": "저작권 검사 기본 설정을 저장했습니다."}



@app.get("/copyright", response_class=HTMLResponse)
async def copyright_index(request: Request) -> HTMLResponse:
    context = {
        "request": request,
        "form_values": default_copyright_form(),
        "result_payload": None,
        "error": None,
        "default_report_dir": str(COPYRIGHT_REPORT_DIR),
        "nav_active": "copyright",
    }
    return templates.TemplateResponse("copyright.html", context)


@app.post("/copyright", response_class=HTMLResponse)
async def copyright_check(
    request: Request,
    video_file: UploadFile = File(...),
    reference_dir: Optional[str] = Form(None),
    fps: str = Form("1.0"),
    hash_alg: str = Form("phash"),
    resize: str = Form("256x256"),
    max_frames: Optional[str] = Form(""),
    hamming_th: str = Form("12"),
    high_th: str = Form("0.30"),
    med_th: str = Form("0.15"),
    audio_only: Optional[str] = Form(None),
    report_dir: Optional[str] = Form(""),
) -> HTMLResponse:
    form_values = default_copyright_form()
    result_payload: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

    reference_dir_clean = (reference_dir or "").strip()
    fps_clean = (fps or "").strip() or form_values["fps"]
    hash_clean = (hash_alg or "").strip().lower() or form_values["hash"]
    resize_clean = (resize or "").strip() or form_values["resize"]
    max_frames_clean = (max_frames or "").strip()
    hamming_th_clean = (hamming_th or "").strip() or form_values["hamming_th"]
    high_th_clean = (high_th or "").strip() or form_values["high_th"]
    med_th_clean = (med_th or "").strip() or form_values["med_th"]
    report_dir_clean = (report_dir or "").strip()
    audio_only_flag = audio_only is not None

    form_values.update(
        {
            "reference_dir": reference_dir_clean,
            "fps": fps_clean,
            "hash": hash_clean,
            "resize": resize_clean,
            "max_frames": max_frames_clean,
            "hamming_th": hamming_th_clean,
            "high_th": high_th_clean,
            "med_th": med_th_clean,
            "audio_only": audio_only_flag,
            "report_dir": report_dir_clean,
        }
    )

    saved_path: Optional[Path] = None
    reference_dir_path: Optional[Path] = None
    report_dir_path = COPYRIGHT_REPORT_DIR

    try:
        if not video_file or not video_file.filename:
            error = "검사할 영상을 업로드하세요."

        fps_value: Optional[float] = None
        if error is None:
            try:
                fps_value = float(fps_clean)
                if fps_value <= 0:
                    raise ValueError
            except ValueError:
                error = "FPS는 0보다 큰 숫자로 입력하세요."

        resize_tuple: Optional[tuple[int, int]] = None
        if error is None:
            resize_tuple = parse_resize_form(resize_clean)
            if resize_tuple is None:
                error = "리사이즈는 '가로x세로' 형식으로 입력하세요."

        max_frames_value: Optional[int] = None
        if error is None and max_frames_clean:
            try:
                max_frames_value = int(max_frames_clean)
                if max_frames_value <= 0:
                    raise ValueError
            except ValueError:
                error = "최대 프레임 수는 1 이상의 정수로 입력하세요."

        hamming_th_value: Optional[int] = None
        if error is None:
            try:
                hamming_th_value = int(hamming_th_clean)
                if hamming_th_value < 0:
                    raise ValueError
            except ValueError:
                error = "해밍 임계값은 0 이상의 정수로 입력하세요."

        high_th_value: Optional[float] = None
        if error is None:
            try:
                high_th_value = float(high_th_clean)
                if high_th_value < 0:
                    raise ValueError
            except ValueError:
                error = "HIGH 기준은 0 이상의 숫자로 입력하세요."

        med_th_value: Optional[float] = None
        if error is None:
            try:
                med_th_value = float(med_th_clean)
                if med_th_value < 0:
                    raise ValueError
            except ValueError:
                error = "MED 기준은 0 이상의 숫자로 입력하세요."

        if error is None:
            if hash_clean not in {"phash", "ahash", "dhash"}:
                error = "지원하지 않는 해시 방식입니다."

        if error is None and reference_dir_clean:
            candidate = Path(reference_dir_clean).expanduser().resolve()
            if not candidate.exists() or not candidate.is_dir():
                error = f"비교 기준 폴더가 존재하지 않습니다: {candidate}"
            else:
                reference_dir_path = candidate

        if error is None:
            if report_dir_clean:
                report_candidate = Path(report_dir_clean).expanduser()
            else:
                report_candidate = COPYRIGHT_REPORT_DIR
            try:
                ensure_directory(report_candidate)
                report_dir_path = report_candidate.resolve()
            except OSError as exc:  # pragma: no cover - filesystem error
                logger.exception("Failed to prepare copyright report directory: %s", exc)
                error = f"리포트 저장 폴더를 사용할 수 없습니다: {exc}"

        if error is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            original_suffix = Path(video_file.filename).suffix if video_file.filename else ""
            if not original_suffix:
                original_suffix = ".mp4"
            filename = f"{timestamp}_{uuid4().hex[:8]}{original_suffix}"
            saved_path = COPYRIGHT_UPLOAD_DIR / filename
            try:
                with saved_path.open("wb") as buffer:
                    while True:
                        chunk = await video_file.read(1024 * 1024)
                        if not chunk:
                            break
                        buffer.write(chunk)
            except Exception as exc:  # pragma: no cover - I/O error path
                logger.exception("Failed to save uploaded video for copyright check: %s", exc)
                error = f"업로드 저장 중 오류가 발생했습니다: {exc}"
                if saved_path.exists():
                    try:
                        saved_path.unlink()
                    except OSError:
                        pass

        if error is None and saved_path is not None:
            try:
                result_payload = await run_in_threadpool(
                    run_copyright_precheck,
                    saved_path,
                    reference_dir_path,
                    fps=fps_value or 1.0,
                    hash_name=hash_clean,
                    hamming_th=hamming_th_value or int(form_values["hamming_th"]),
                    resize=resize_tuple,
                    max_frames=max_frames_value,
                    high_th=high_th_value or float(form_values["high_th"]),
                    med_th=med_th_value or float(form_values["med_th"]),
                    audio_only=audio_only_flag,
                    report_dir=report_dir_path,
                    show_progress=False,
                )
                if result_payload is not None:
                    result_payload["uploaded_filename"] = video_file.filename or saved_path.name
                    result_payload["saved_video_path"] = str(saved_path)
            except Exception as exc:  # pragma: no cover - runtime failure
                logger.exception("Copyright precheck failed: %s", exc)
                error = f"저작권 검사 중 오류가 발생했습니다: {exc}"
    finally:
        await video_file.close()

    context = {
        "request": request,
        "form_values": form_values,
        "result_payload": result_payload,
        "error": error,
        "default_report_dir": str(COPYRIGHT_REPORT_DIR),
        "nav_active": "copyright",
    }
    return templates.TemplateResponse("copyright.html", context)


@app.post("/ytdl", response_class=HTMLResponse)
async def ytdl_download(
    request: Request,
    urls: str = Form(""),
    output_dir: str = Form(""),
    sub_langs: str = Form("ko"),
    sub_format: str = Form("srt/best"),
    download_subs: Optional[str] = Form("on"),
    auto_subs: Optional[str] = Form("on"),
    dry_run: Optional[str] = Form(None),
    save_settings: Optional[str] = Form(None),
) -> HTMLResponse:
    download_subs_enabled = download_subs is not None
    auto_subs_enabled = auto_subs is not None
    dry_run_enabled = dry_run is not None

    form_values = {
        "urls": urls,
        "output_dir": output_dir,
        "sub_langs": sub_langs,
        "sub_format": sub_format,
        "download_subs": download_subs_enabled,
        "auto_subs": auto_subs_enabled,
        "dry_run": dry_run_enabled,
    }

    settings_saved = False
    if save_settings is not None:
        settings_payload = {key: value for key, value in form_values.items() if key != "urls"}
        try:
            save_ytdl_settings(settings_payload)
            settings_saved = True
        except Exception as exc:  # pylint: disable=broad-except
            logger.exception("Failed to save YTDL settings: %s", exc)

    parsed_urls = _split_urls(urls)
    error = None
    result: Optional[Dict[str, Any]] = None

    if parsed_urls:
        try:
            selected_langs = parse_sub_langs(sub_langs)
            files = await run_in_threadpool(
                download_with_options,
                parsed_urls,
                output_dir or None,
                skip_download=dry_run_enabled,
                download_subs=download_subs_enabled,
                auto_subs=auto_subs_enabled,
                sub_langs=sub_langs,
                sub_format=sub_format,
            )

            # Add to download history if not dry run
            if not dry_run_enabled and files:
                add_to_download_history(parsed_urls, files, form_values)

            result = {
                "files": [str(path) for path in files],
                "count": len(files),
                "langs": selected_langs,
                "dry_run": dry_run_enabled,
            }
        except Exception as exc:  # pylint: disable=broad-except
            logger.exception("YT download error: %s", exc)
            error = str(exc)
    elif not settings_saved:
        error = "최소 하나의 유효한 URL을 입력하세요."

    context = {
        "request": request,
        "form_values": form_values,
        "error": error,
        "result": result,
        "settings_saved": settings_saved,
        "nav_active": "ytdl",
    }
    return templates.TemplateResponse("ytdl.html", context)







@app.get("/api/similarity/settings")
def api_get_similarity_settings() -> Dict[str, Any]:
    return load_similarity_settings()


@app.post("/api/similarity/settings")
def api_save_similarity_settings(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    try:
        save_similarity_settings(payload)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"설정을 저장하지 못했습니다: {exc}",
        ) from exc
    return {"message": "영상 유사도 기본 설정을 저장했습니다."}



@app.get("/similarity", response_class=HTMLResponse)
async def similarity_index(request: Request) -> HTMLResponse:
    context = {
        "request": request,
        "form_values": default_similarity_form(),
        "result": None,
        "error": None,
        "nav_active": "similarity",
    }
    return templates.TemplateResponse("similarity.html", context)


@app.post("/similarity", response_class=HTMLResponse)
async def similarity_check(
    request: Request,
    video_a: str = Form(""),
    video_b: Optional[str] = Form(None),
    ref_dir: Optional[str] = Form(None),
    fps: str = Form("1.0"),
    resize: str = Form("320x320"),
    max_frames: Optional[str] = Form("200"),
    phash_th: str = Form("12"),
    weight_phash: str = Form("0.25"),
    weight_orb: str = Form("0.25"),
    weight_hist: str = Form("0.25"),
    weight_psnr: str = Form("0.25"),
    top_n: str = Form("5"),
) -> HTMLResponse:
    video_a_clean = video_a.strip()
    video_b_clean = (video_b or "").strip()
    ref_dir_clean = (ref_dir or "").strip()
    fps_clean = (fps or "").strip() or SIMILARITY_DEFAULTS["fps"]
    resize_clean = (resize or "").strip() or SIMILARITY_DEFAULTS["resize"]
    max_frames_clean = (max_frames or "").strip() or SIMILARITY_DEFAULTS["max_frames"]
    phash_th_clean = (phash_th or "").strip() or SIMILARITY_DEFAULTS["phash_th"]
    weight_phash_clean = (weight_phash or "").strip() or SIMILARITY_DEFAULTS["weight_phash"]
    weight_orb_clean = (weight_orb or "").strip() or SIMILARITY_DEFAULTS["weight_orb"]
    weight_hist_clean = (weight_hist or "").strip() or SIMILARITY_DEFAULTS["weight_hist"]
    weight_psnr_clean = (weight_psnr or "").strip() or SIMILARITY_DEFAULTS["weight_psnr"]
    top_n_clean = (top_n or "").strip() or SIMILARITY_DEFAULTS["top_n"]

    form_values = {
        "video_a": video_a_clean,
        "video_b": video_b_clean,
        "ref_dir": ref_dir_clean,
        "fps": fps_clean,
        "resize": resize_clean,
        "max_frames": max_frames_clean,
        "phash_th": phash_th_clean,
        "weight_phash": weight_phash_clean,
        "weight_orb": weight_orb_clean,
        "weight_hist": weight_hist_clean,
        "weight_psnr": weight_psnr_clean,
        "top_n": top_n_clean,
    }

    error: Optional[str] = None
    result: Optional[Dict[str, Any]] = None

    a_path: Optional[Path] = None
    b_path: Optional[Path] = None
    dir_path: Optional[Path] = None

    if not video_a_clean:
        error = "기준 영상 경로를 입력하세요."
    else:
        candidate = Path(video_a_clean).expanduser().resolve()
        if not candidate.exists() or not candidate.is_file():
            error = f"파일이 존재하지 않습니다: {candidate}"
        else:
            a_path = candidate

    fps_value: Optional[float] = None
    if error is None:
        try:
            fps_value = float(fps_clean)
            if fps_value <= 0:
                raise ValueError
        except ValueError:
            error = "FPS는 숫자로 입력하세요."

    resize_tuple: Optional[Tuple[int, int]] = None
    if error is None:
        resize_tuple = parse_resize_form(resize_clean)
        if resize_tuple is None:
            error = "리사이즈는 '가로x세로' 형식으로 입력하세요."

    max_frames_value: Optional[int] = None
    if error is None and max_frames_clean:
        try:
            max_frames_value = int(max_frames_clean)
            if max_frames_value <= 0:
                raise ValueError
        except ValueError:
            error = "최대 프레임 수는 1 이상의 정수로 입력하세요."

    phash_th_value: Optional[int] = None
    if error is None:
        try:
            phash_th_value = int(phash_th_clean)
            if phash_th_value < 0:
                raise ValueError
        except ValueError:
            error = "pHash 임계값은 0 이상의 정수로 입력하세요."

    weights_tuple: Optional[Tuple[float, float, float, float]] = None
    if error is None:
        try:
            weights_tuple = (
                float(weight_phash_clean),
                float(weight_orb_clean),
                float(weight_hist_clean),
                float(weight_psnr_clean),
            )
        except ValueError:
            error = "가중치는 숫자로 입력하세요."

    top_n_value = 5
    if error is None:
        try:
            top_n_value = int(top_n_clean)
            if top_n_value <= 0:
                top_n_value = 5
                form_values["top_n"] = str(top_n_value)
        except ValueError:
            error = "상위 출력 개수는 정수로 입력하세요."

    mode: Optional[str] = None
    if error is None and a_path is not None:
        if video_b_clean and ref_dir_clean:
            error = "비교 영상과 폴더 중 하나만 지정하세요."
        elif video_b_clean:
            candidate = Path(video_b_clean).expanduser().resolve()
            if not candidate.exists() or not candidate.is_file():
                error = f"비교 영상이 존재하지 않습니다: {candidate}"
            else:
                b_path = candidate
                mode = "pair"
        elif ref_dir_clean:
            candidate = Path(ref_dir_clean).expanduser().resolve()
            if not candidate.exists() or not candidate.is_dir():
                error = f"폴더가 존재하지 않습니다: {candidate}"
            else:
                dir_path = candidate
                mode = "dir"
        else:
            error = "비교할 영상 또는 폴더를 입력하세요."

    if error is None and SIMILARITY_IMPORT_ERROR is not None:
        logger.error("Similarity comparison unavailable: %s", SIMILARITY_IMPORT_ERROR)
        error = "영상 유사도 비교 기능을 사용하려면 OpenCV (cv2) 패키지가 설치되어 있어야 합니다."

    if error is None and mode == "pair" and a_path and b_path:
        try:
            scores = await run_in_threadpool(
                compare_two,
                a_path,
                b_path,
                fps_value or 1.0,
                resize_tuple,
                max_frames_value,
                phash_th_value or 12,
                weights_tuple or (0.25, 0.25, 0.25, 0.25),
            )
            result = {
                "mode": "pair",
                "a_path": str(a_path),
                "b_path": str(b_path),
                "scores": scores,
            }
        except Exception as exc:  # pylint: disable=broad-except
            logger.exception("Video similarity check failed (pair): %s", exc)
            error = str(exc)

    if error is None and mode == "dir" and a_path and dir_path:
        try:
            results = await run_in_threadpool(
                compare_dir,
                a_path,
                dir_path,
                fps_value or 1.0,
                resize_tuple,
                max_frames_value,
                phash_th_value or 12,
                weights_tuple or (0.25, 0.25, 0.25, 0.25),
            )
            entries: List[Dict[str, Any]] = []
            for rank, (name, data) in enumerate(results[:top_n_value], start=1):
                if isinstance(data, dict) and "error" in data:
                    entries.append({
                        "rank": rank,
                        "name": name,
                        "error": data.get("error"),
                    })
                else:
                    entries.append({
                        "rank": rank,
                        "name": name,
                        "scores": data,
                    })
            result = {
                "mode": "dir",
                "a_path": str(a_path),
                "dir_path": str(dir_path),
                "entries": entries,
                "total": len(results),
                "top_n": top_n_value,
            }
        except Exception as exc:  # pylint: disable=broad-except
            logger.exception("Video similarity check failed (directory): %s", exc)
            error = str(exc)

    context = {
        "request": request,
        "form_values": form_values,
        "result": result,
        "error": error,
        "nav_active": "similarity",
    }
    return templates.TemplateResponse("similarity.html", context)


@app.get("/api/dashboard/projects", response_model=List[DashboardProject])
async def api_dashboard_projects(query: Optional[str] = None) -> List[DashboardProject]:
    shorts_summaries = list_projects(OUTPUT_DIR)
    all_project_data = aggregate_dashboard_projects(shorts_summaries)

    try:
        all_projects = [DashboardProject(**p) for p in all_project_data]
    except Exception as e:
        print(f"Error validating dashboard projects: {e}")
        print(f"Data: {all_project_data}")
        all_projects = []


    if query:
        q = query.strip().lower()
        if q:
            all_projects = [
                project
                for project in all_projects
                if q in project.id.lower()
                or q in project.title.lower()
                or (project.topic and q in project.topic.lower())
                or (project.language and q in project.language.lower())
            ]

    all_projects.sort(key=lambda p: p.updated_at or "", reverse=True)
    return all_projects


@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    shorts_summaries = list_projects(OUTPUT_DIR)
    all_projects = aggregate_dashboard_projects(shorts_summaries)
    all_projects.sort(key=lambda p: p.get("updated_at"), reverse=True)

    context = {
        "request": request,
        "projects": all_projects,
    }
    return templates.TemplateResponse("dashboard.html", context)


@app.get("/translator", response_class=HTMLResponse)
async def translator_page(request: Request):
    context = {"request": request}
    return templates.TemplateResponse("translator.html", context)


@app.get("/test-simple", response_class=HTMLResponse)
async def test_simple_page(request: Request):
    context = {"request": request}
    return templates.TemplateResponse("test_simple.html", context)


@app.get("/analysis")
async def analysis_redirect():
    """분석 페이지로 리디렉션"""
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="http://127.0.0.1:8002/", status_code=302)


@app.get("/favicon.ico")
async def favicon():
    """Favicon 요청 처리"""
    from fastapi.responses import Response
    return Response(status_code=204)


@app.get("/shorts", response_class=HTMLResponse)
async def index(request: Request):
    selected_base = request.query_params.get("existing")
    project_summaries = list_projects(OUTPUT_DIR)
    version_history: List[ProjectVersionInfo] = []
    version_history_json: List[Dict[str, Any]] = []
    result = None
    error = None

    if selected_base:
        try:
            project = load_project(selected_base, OUTPUT_DIR)
            result = build_result_payload(project)
            version_history = list_versions(selected_base)
            version_history_json = [item.model_dump(exclude_none=True) for item in version_history]
        except FileNotFoundError:
            error = f"'{selected_base}' 프로젝트를 찾을 수 없습니다."

    context = {
        "request": request,
        "form_values": default_form_values(),
        "result": result,
        "error": error,
        "project_summaries": project_summaries,
        "selected_project": selected_base,
        "version_history_json": version_history_json,
        "lang_options": LANG_OPTIONS,
    }
    return templates.TemplateResponse("index.html", context)


@app.post("/generate", response_class=HTMLResponse)
async def generate(
    request: Request,
    topic: str = Form(...),
    style: str = Form("정보/요약"),
    duration: int = Form(30),
    lang: str = Form("ko"),
    voice: str = Form("alloy"),
    fps: int = Form(24),
    music: Optional[str] = Form(None),
    music_volume: float = Form(0.12),
    ducking: float = Form(0.35),
    burn_subs: Optional[str] = Form(None),
    dry_run: Optional[str] = Form(None),
    save_json: Optional[str] = Form(None),
    output_name: Optional[str] = Form(None),
    script_model: str = Form("gpt-4o-mini"),
    tts_model: str = Form("gpt-4o-mini-tts"),
):
    lang = sanitize_lang(lang)

    form_values = {
        "topic": topic,
        "style": style,
        "duration": duration,
        "lang": lang,
        "voice": voice,
        "fps": fps,
        "music": music,
        "music_volume": music_volume,
        "ducking": ducking,
        "burn_subs": burn_subs,
        "dry_run": dry_run,
        "save_json": save_json,
        "output_name": output_name,
        "script_model": script_model,
        "tts_model": tts_model,
    }

    version_history: List[ProjectVersionInfo] = []
    version_history_json: List[Dict[str, Any]] = []
    error = None

    try:
        options = GenerationOptions(
            topic=topic,
            style=style,
            duration=duration,
            lang=lang,
            fps=fps,
            voice=voice,
            music=music is not None,
            music_volume=music_volume,
            ducking=ducking,
            burn_subs=burn_subs is not None,
            dry_run=dry_run is not None,
            save_json=save_json is not None,
            script_model=script_model,
            tts_model=tts_model,
            output_name=output_name or None,
        )

        generation_result = await run_in_threadpool(generate_short, options)
        base_name = generation_result.get("base_name")
        if base_name:
            project = load_project(base_name, OUTPUT_DIR)
            result = build_result_payload(project)
            version_history = list_versions(base_name)
            version_history_json = [item.model_dump(exclude_none=True) for item in version_history]
        else:
            result = build_result_payload_dict(generation_result)
            error = None
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Generation error: %s", exc)
        result = None
        error = str(exc)

    selected_project = None
    if result and isinstance(result.get("metadata"), dict):
        selected_project = result["metadata"].get("base_name")

    context = {
        "request": request,
        "form_values": form_values,
        "result": result,
        "error": error,
        "project_summaries": list_projects(OUTPUT_DIR),
        "selected_project": selected_project,
        "version_history_json": version_history_json,
        "lang_options": LANG_OPTIONS,
    }
    return templates.TemplateResponse("index.html", context)


def default_form_values() -> Dict[str, Any]:
    return {
        "topic": "무서운 썰",
        "style": "공포/미스터리",
        "duration": 30,
        "lang": sanitize_lang("ko"),
        "voice": "alloy",
        "fps": 24,
        "music": "on",
        "music_volume": 0.12,
        "ducking": 0.35,
        "burn_subs": None,
        "dry_run": None,
        "save_json": None,
        "output_name": "",
        "script_model": "gpt-4o-mini",
        "tts_model": "gpt-4o-mini-tts",
    }


def build_result_payload(project: ProjectMetadata) -> Dict[str, Any]:
    metadata = project.model_dump(exclude_none=False)

    def relative_output(path_str: Optional[str]) -> Optional[str]:
        if not path_str:
            return None
        path = Path(path_str)
        try:
            return f"/outputs/{path.name}"
        except ValueError:
            return None

    metadata_json = json.dumps(metadata, ensure_ascii=False, indent=2, default=str)

    return {
        "metadata": metadata,
        "metadata_json": metadata_json,
        "video_url": relative_output(project.video_path),
        "audio_url": relative_output(project.audio_path),
        "srt_url": relative_output(project.subtitles_path),
        "json_url": relative_output(str(metadata_path(project.base_name, OUTPUT_DIR))),
    }


def build_result_payload_dict(metadata: Dict[str, Any]) -> Dict[str, Any]:
    def relative_output(path_str: Optional[str]) -> Optional[str]:
        if not path_str:
            return None
        path = Path(path_str)
        try:
            return f"/outputs/{path.name}"
        except ValueError:
            return None

    metadata_json = json.dumps(metadata, ensure_ascii=False, indent=2, default=str)
    return {
        "metadata": metadata,
        "metadata_json": metadata_json,
        "video_url": relative_output(metadata.get("video_path")),
        "audio_url": relative_output(metadata.get("audio_path")),
        "srt_url": relative_output(metadata.get("subtitles_path")),
        "json_url": relative_output(metadata.get("metadata_path")),
    }
