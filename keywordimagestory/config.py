"""Configuration management for the Keyword Image Story application."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, validator

try:  # pragma: no cover - optional dependency
    from pydantic_settings import BaseSettings
except ImportError:  # pragma: no cover - dev fallback
    class BaseSettings(BaseModel):  # type: ignore[misc]
        """Fallback shim when pydantic-settings is unavailable."""

        class Config:
            extra = "ignore"


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables."""

    openai_api_key: str | None = Field(default=None, env="OPENAI_API_KEY")
    google_credentials_path: Path | None = Field(
        default=None,
        env="GOOGLE_APPLICATION_CREDENTIALS",
    )
    base_dir: Path = Field(default_factory=lambda: Path(__file__).resolve().parent.parent)
    outputs_dir: Path = Field(default_factory=lambda: Path("outputs"))
    history_db_path: Path = Field(default_factory=lambda: Path("outputs/history.json"))
    templates_dir: Path = Field(default_factory=lambda: Path("keywordimagestory/ui/templates"))
    static_dir: Path = Field(default_factory=lambda: Path("keywordimagestory/ui/static"))
    enable_google_sync: bool = Field(default=False)
    default_language: str = Field(default="ko")
    default_story_duration: int = Field(default=60)
    max_recent_keywords: int = Field(default=10)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

    @validator("outputs_dir", "history_db_path", pre=True)
    def _ensure_absolute(cls, value: Any) -> Path:  # noqa: D401
        """Ensure configured paths are absolute."""

        path = Path(value)
        return path if path.is_absolute() else Path.cwd() / path

    def ensure_directories(self) -> None:
        """Create required directories if they do not exist."""

        self.outputs_dir.mkdir(parents=True, exist_ok=True)
        self.history_db_path.parent.mkdir(parents=True, exist_ok=True)

    def dump(self) -> dict[str, Any]:
        """Return a JSON-serialisable view of the settings."""

        raw = self.dict()
        raw["base_dir"] = str(raw["base_dir"])
        raw["outputs_dir"] = str(raw["outputs_dir"])
        raw["history_db_path"] = str(raw["history_db_path"])
        if raw.get("google_credentials_path"):
            raw["google_credentials_path"] = str(raw["google_credentials_path"])
        return raw

    def save_snapshot(self) -> None:
        """Persist a snapshot of the current settings for debugging."""

        snapshot_path = self.outputs_dir / "settings_snapshot.json"
        snapshot_path.write_text(
            json.dumps(self.dump(), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )


settings = Settings()
settings.ensure_directories()
