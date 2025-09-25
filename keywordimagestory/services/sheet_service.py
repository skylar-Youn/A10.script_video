"""Google Sheet integration (optional)."""
from __future__ import annotations

import logging
from typing import Iterable

try:  # pragma: no cover - optional dependency
    import gspread
    from oauth2client.service_account import ServiceAccountCredentials
except ImportError:  # pragma: no cover - optional dependency
    gspread = None  # type: ignore
    ServiceAccountCredentials = None  # type: ignore

from keywordimagestory.config import settings
from keywordimagestory.models import TitleItem

logger = logging.getLogger(__name__)

_SCOPE = [
    "https://spreadsheets.google.com/feeds",
    "https://www.googleapis.com/auth/drive",
]


def _client():  # pragma: no cover - requires external creds
    if not settings.enable_google_sync:
        raise RuntimeError("Google sync disabled")
    if gspread is None or ServiceAccountCredentials is None:
        raise RuntimeError("gspread or oauth2client not installed")
    if not settings.google_credentials_path:
        raise RuntimeError("Google credentials path is not configured")
    credentials = ServiceAccountCredentials.from_json_keyfile_name(
        settings.google_credentials_path,
        _SCOPE,
    )
    return gspread.authorize(credentials)


def append_titles(sheet_url: str, worksheet_title: str, titles: Iterable[TitleItem]) -> None:
    """Append generated titles to a Google Sheet."""

    if not settings.enable_google_sync:
        logger.info("Google sync disabled – skipping sheet append")
        return

    client = _client()
    if "/d/" in sheet_url:
        sheet_key = sheet_url.split("/d/")[1].split("/")[0]
    else:
        sheet_key = sheet_url

    sheet = client.open_by_key(sheet_key)
    try:
        worksheet = sheet.worksheet(worksheet_title)
    except Exception:  # pragma: no cover - gspread runtime
        worksheet = sheet.add_worksheet(title=worksheet_title, rows="100", cols="5")
    data = [[item.index, item.text, item.source] for item in titles]
    worksheet.append_rows(data)
