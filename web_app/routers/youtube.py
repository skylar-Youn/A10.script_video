"""YouTube download routes."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, Body, HTTPException, UploadFile, File
from starlette.concurrency import run_in_threadpool

from youtube.ytdl import download_with_options, parse_sub_langs

router = APIRouter(prefix="/api", tags=["youtube"])

BASE_DIR = Path(__file__).resolve().parent.parent
YTDL_SETTINGS_PATH = BASE_DIR / "ytdl_settings.json"
YTDL_HISTORY_PATH = BASE_DIR / "ytdl_history.json"
DEFAULT_YTDL_OUTPUT_DIR = (BASE_DIR.parent / "youtube" / "download").resolve()

DEFAULT_YTDL_SETTINGS: Dict[str, Any] = {
    "output_dir": str(DEFAULT_YTDL_OUTPUT_DIR),
    "sub_langs": "ko",
    "sub_format": "srt/best",
    "download_subs": True,
    "auto_subs": True,
    "dry_run": False,
}

LANG_OPTIONS: List[tuple[str, str]] = [
    ("ko", "한국어"),
    ("en", "English"),
    ("ja", "日本語"),
]
LANG_OPTION_SET = {code for code, _ in LANG_OPTIONS}


def sanitize_lang(value: str | None) -> str:
    if not value:
        return "ko"
    value_lower = value.lower()
    return value_lower if value_lower in LANG_OPTION_SET else "ko"


@router.get("/downloads")
async def api_list_downloads() -> List[Dict[str, str]]:
    def _load_downloads():
        try:
            if YTDL_HISTORY_PATH.exists():
                content = YTDL_HISTORY_PATH.read_text(encoding="utf-8")
                data = json.loads(content)
                return data.get("downloads", [])
        except (json.JSONDecodeError, KeyError):
            pass
        return []

    downloads = await run_in_threadpool(_load_downloads)
    return downloads


@router.get("/ytdl/settings")
def api_get_translator_settings() -> Dict[str, Any]:
    try:
        if YTDL_SETTINGS_PATH.exists():
            content = YTDL_SETTINGS_PATH.read_text(encoding="utf-8")
            settings = json.loads(content)
            return {**DEFAULT_YTDL_SETTINGS, **settings}
    except (json.JSONDecodeError, OSError):
        pass
    return DEFAULT_YTDL_SETTINGS.copy()


@router.post("/ytdl/settings")
def api_save_translator_settings(payload: Dict[str, Any] = Body(...)) -> Dict[str, Any]:
    try:
        current_settings = api_get_translator_settings()
        current_settings.update(payload)

        YTDL_SETTINGS_PATH.write_text(
            json.dumps(current_settings, indent=2, ensure_ascii=False),
            encoding="utf-8"
        )
        return current_settings
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {str(e)}")


@router.post("/ytdl/download")
async def api_download_youtube(
    url: str = Body(..., embed=True),
    settings: Dict[str, Any] = Body(...),
) -> Dict[str, Any]:
    try:
        def _download():
            return download_with_options(url, settings)

        result = await run_in_threadpool(_download)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")


@router.post("/ytdl/parse-langs")
async def api_parse_subtitle_languages(
    file: UploadFile = File(...),
) -> Dict[str, List[str]]:
    try:
        content = await file.read()
        text = content.decode("utf-8")

        def _parse():
            return parse_sub_langs(text)

        result = await run_in_threadpool(_parse)
        return {"languages": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse languages: {str(e)}")