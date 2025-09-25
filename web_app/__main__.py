"""Executable module for running the FastAPI app with sensible defaults."""
from __future__ import annotations

import os

import uvicorn


def _should_reload() -> bool:
    """Read reload preference from environment (defaults to True)."""
    value = os.getenv("WEB_APP_RELOAD", "true").strip().lower()
    return value in {"1", "true", "yes", "on"}


def main() -> None:
    host = os.getenv("WEB_APP_HOST", "127.0.0.1")
    port = int(os.getenv("WEB_APP_PORT", os.getenv("PORT", "8001")))
    uvicorn.run("web_app.app:app", host=host, port=port, reload=_should_reload())


if __name__ == "__main__":
    main()
