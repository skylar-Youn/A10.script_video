"""OpenAI client wrapper with graceful degradation for offline development."""
from __future__ import annotations

import io
import logging
import wave
from typing import Any, Iterable, Tuple

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover - optional dependency
    OpenAI = None  # type: ignore

from .config import settings

logger = logging.getLogger(__name__)


class OpenAIClient:
    """Wrapper around the OpenAI SDK supporting fallbacks."""

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.openai_api_key
        self._client: Any | None = None
        if self.api_key and OpenAI is not None:
            try:
                self._client = OpenAI(api_key=self.api_key)
            except Exception as exc:  # pragma: no cover - network failure
                logger.warning("Failed to initialise OpenAI client: %s", exc)
                self._client = None
        else:
            if not self.api_key:
                logger.info("OpenAI API key not configured – using deterministic mock responses")
            if OpenAI is None:
                logger.info("openai package not installed – using deterministic mock responses")

    # ------------------------------------------------------------------
    # High-level helpers
    # ------------------------------------------------------------------
    def generate_list(self, prompt: str, count: int = 10) -> list[str]:
        """Generate a list of short strings based on a prompt."""

        if self._client is None:
            return self._mock_list(prompt, count)

        messages = [
            {"role": "system", "content": "You are a helpful and creative assistant."},
            {"role": "user", "content": prompt},
        ]
        try:
            response = self._client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                temperature=0.8,
                max_tokens=512,
            )
            text = response.choices[0].message.content or ""
            return self._normalise_list_output(text, count)
        except Exception as exc:  # pragma: no cover - network failure
            logger.error("OpenAI list generation failed: %s", exc)
            return self._mock_list(prompt, count)

    def generate_structured(self, instructions: str, content: str) -> str:
        """Return structured text output using the Responses API if available."""

        if self._client is None:
            return self._mock_structured(instructions, content)

        try:
            response = self._client.responses.create(
                model="gpt-4o-mini",
                input=[
                    {
                        "role": "developer",
                        "content": [
                            {"type": "input_text", "text": instructions},
                        ],
                    },
                    {
                        "role": "user",
                        "content": [
                            {"type": "input_text", "text": content},
                        ],
                    },
                ],
                text={"format": {"type": "text"}},
            )
            if hasattr(response, "output_text") and response.output_text:
                return response.output_text
            # Fallback: attempt to read from response.output sequence
            outputs: Iterable[Any] = getattr(response, "output", [])
            for item in outputs:
                if getattr(item, "type", None) == "message":
                    for block in getattr(item, "content", []):
                        if getattr(block, "type", None) == "output_text":
                            return block.text  # type: ignore[no-any-return]
            return str(response)
        except Exception as exc:  # pragma: no cover
            logger.error("OpenAI structured generation failed: %s", exc)
            return self._mock_structured(instructions, content)

    def synthesize_speech(
        self,
        text: str,
        *,
        voice: str = "alloy",
        audio_format: str = "mp3",
        model: str = "gpt-4o-mini-tts",
    ) -> Tuple[bytes, str]:
        """Generate speech from text and return (audio_bytes, format)."""

        if not text or not text.strip():
            raise ValueError("text is required for speech synthesis")

        if self._client is None:
            return self._mock_audio()

        try:
            response = self._client.audio.speech.create(
                model=model,
                voice=voice,
                input=text,
                response_format=audio_format,
            )
            buffer = io.BytesIO()
            for chunk in response.iter_bytes():
                buffer.write(chunk)
            return buffer.getvalue(), audio_format
        except Exception as exc:  # pragma: no cover - network failure
            logger.error("OpenAI speech synthesis failed: %s", exc)
            return self._mock_audio()

    # ------------------------------------------------------------------
    # Mock helpers used during development or offline mode
    # ------------------------------------------------------------------
    def _mock_list(self, prompt: str, count: int) -> list[str]:
        """Create a deterministic list for offline development."""

        seed = abs(hash(prompt)) % 10_000
        return [f"Mock Item {i+1} ({seed + i})" for i in range(count)]

    def _normalise_list_output(self, raw: str, count: int) -> list[str]:
        lines = [line.strip(" -*\t") for line in raw.splitlines() if line.strip()]
        cleaned: list[str] = []
        for line in lines:
            if line[0].isdigit():
                parts = line.split(".", 1)
                if len(parts) == 2:
                    cleaned.append(parts[1].strip())
                    continue
            cleaned.append(line)
        if not cleaned:
            return self._mock_list(raw, count)
        return cleaned[:count]

    def _mock_structured(self, instructions: str, content: str) -> str:
        return (
            "**[Mock Structured Output]**\n"
            f"Instructions: {instructions[:60]}...\n"
            f"Content: {content[:60]}...\n"
        )

    def _mock_audio(self) -> Tuple[bytes, str]:
        """Create a single second of silence as a WAV fallback."""

        buffer = io.BytesIO()
        sample_rate = 16000
        duration_seconds = 1
        n_frames = sample_rate * duration_seconds
        with wave.open(buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            wav.writeframes(b"\x00\x00" * n_frames)
        return buffer.getvalue(), "wav"


client = OpenAIClient()
