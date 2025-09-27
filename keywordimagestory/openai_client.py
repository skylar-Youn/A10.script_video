"""OpenAI client wrapper with graceful degradation for offline development."""
from __future__ import annotations

import base64
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

        logger.info(f"Initializing OpenAI client. API key present: {bool(self.api_key)}, OpenAI module: {OpenAI is not None}")

        if self.api_key and OpenAI is not None:
            try:
                self._client = OpenAI(api_key=self.api_key)
                logger.info("OpenAI client initialized successfully")
            except Exception as exc:  # pragma: no cover - network failure
                logger.warning("Failed to initialise OpenAI client: %s", exc)
                self._client = None
        else:
            if not self.api_key:
                logger.warning("OpenAI API key not configured – using deterministic mock responses")
            if OpenAI is None:
                logger.warning("openai package not installed – using deterministic mock responses")

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
        """Return structured text output using the Chat API."""

        if self._client is None:
            return self._mock_structured(instructions, content)

        try:
            messages = [
                {"role": "system", "content": instructions},
                {"role": "user", "content": content},
            ]
            response = self._client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                temperature=0.7,
                max_tokens=2000,
            )
            return response.choices[0].message.content or ""
        except Exception as exc:  # pragma: no cover
            logger.error("OpenAI structured generation failed: %s", exc)
            return self._mock_structured(instructions, content)

    def analyze_image(self, image_data: bytes, prompt: str) -> str:
        """Analyze image using Vision API and return description."""

        logger.info(f"analyze_image called. Client available: {self._client is not None}, Image size: {len(image_data)} bytes")

        if self._client is None:
            logger.warning("No OpenAI client available, using mock response")
            return self._mock_image_analysis(prompt)

        try:
            # Convert image to base64
            base64_image = base64.b64encode(image_data).decode('utf-8')
            logger.info(f"Image converted to base64, length: {len(base64_image)}")

            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            }
                        }
                    ]
                }
            ]

            logger.info("Making OpenAI Vision API call...")
            response = self._client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                temperature=0.7,
                max_tokens=2000,
            )
            result = response.choices[0].message.content or ""
            logger.info(f"OpenAI Vision API response received, length: {len(result)}")
            return result
        except Exception as exc:  # pragma: no cover
            logger.error("OpenAI image analysis failed: %s", exc)
            return self._mock_image_analysis(prompt)

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

    def _mock_image_analysis(self, prompt: str) -> str:
        """Create a mock image analysis response."""
        return f"Mock 이미지 분석 결과: {prompt[:50]}..."

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
