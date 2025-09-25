"""Base generator utilities."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from keywordimagestory.openai_client import OpenAIClient, client


@dataclass
class GenerationContext:
    keyword: str
    language: str
    duration: int = 60
    options: dict[str, Any] | None = None


class BaseGenerator:
    """Abstract generator providing OpenAI helpers and fallbacks."""

    def __init__(self, openai_client: OpenAIClient | None = None) -> None:
        self.client = openai_client or client

    def _ensure_keyword(self, context: GenerationContext) -> None:
        if not context.keyword:
            raise ValueError("Keyword is required for generation")
