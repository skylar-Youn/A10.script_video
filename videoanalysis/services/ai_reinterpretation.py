"""AI-powered reinterpretation service for dialogue and descriptive subtitles."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Union

from ai_shorts_maker.openai_client import OpenAIShortsClient

logger = logging.getLogger(__name__)

_client: Optional[OpenAIShortsClient] = None


def _get_client() -> OpenAIShortsClient:
    global _client
    if _client is None:
        _client = OpenAIShortsClient()
        logger.info("OpenAIShortsClient 초기화 완료 (재해석 서비스)")
    return _client


def _format_time(seconds: Optional[Union[float, int]]) -> str:
    if seconds is None:
        return "??:??"
    try:
        total_seconds = max(0, float(seconds))
    except (TypeError, ValueError):
        return "??:??"

    minutes = int(total_seconds // 60)
    secs = int(total_seconds % 60)
    return f"{minutes:02d}:{secs:02d}"


def _build_subtitle_block(subtitles: List[Dict[str, Any]], title: str) -> str:
    if not subtitles:
        return f"{title}: (none)"

    lines: List[str] = []
    for idx, item in enumerate(subtitles[:80], start=1):
        text = (item.get("text") or "").strip()
        if not text:
            continue
        start = _format_time(item.get("start_time"))
        end = _format_time(item.get("end_time"))
        speaker = item.get("speaker") or item.get("speaker_name")
        speaker_prefix = f"[{speaker}] " if speaker else ""
        lines.append(f"{idx:02d}. {start}-{end} {speaker_prefix}{text}")

    if not lines:
        return f"{title}: (none)"

    return f"{title}:\n" + "\n".join(lines)


def build_prompt(dialogues: List[Dict[str, Any]], descriptions: List[Dict[str, Any]]) -> str:
    dialogue_block = _build_subtitle_block(dialogues, "[Dialogue Lines]")
    description_block = _build_subtitle_block(descriptions, "[Existing Descriptive Subtitles]")

    instructions = (
        "You are rewriting a Korean narration track for a video where the original audio will be muted.\n"
        "Use the dialogue and descriptive subtitles to craft a fresh, immersive Korean narration script.\n"
        "The narration should explain the situation naturally, convey emotional beats, and guide the viewer through the scene.\n"
        "Summarise key dialogue moments but avoid quoting every line verbatim.\n"
        "Target length: 3~6 sentences, maintain a conversational documentary style.\n"
        "Return the result as valid JSON with the following structure:\n"
        '{"outline": ["핵심 포인트 요약"], "script": "최종 내레이션"}'
    )

    prompt = (
        f"{instructions}\n\n"
        f"{dialogue_block}\n\n"
        f"{description_block}\n\n"
        "Generate the JSON now. Do not include additional commentary."
    )

    return prompt


def reinterpret_subtitles(
    dialogues: List[Dict[str, Any]],
    descriptions: List[Dict[str, Any]]
) -> Dict[str, Any]:
    if not dialogues and not descriptions:
        raise ValueError("재해석할 자막 데이터가 없습니다.")

    client = _get_client()
    prompt = build_prompt(dialogues, descriptions)

    logger.info(
        "재해석 요청: dialogue=%d개, description=%d개",
        len(dialogues),
        len(descriptions),
    )

    response_text = client.generate_script(prompt, temperature=0.7)
    response_text = response_text.strip()

    outline: Optional[List[str]] = None
    script = response_text

    try:
        parsed = json.loads(response_text)
        if isinstance(parsed, dict):
            outline_raw = parsed.get("outline")
            if isinstance(outline_raw, list):
                outline = [str(item).strip() for item in outline_raw if str(item).strip()]
            script_text = parsed.get("script")
            if isinstance(script_text, str) and script_text.strip():
                script = script_text.strip()
    except json.JSONDecodeError:
        logger.debug("재해석 응답 JSON 파싱 실패, 원문 사용")

    result: Dict[str, Any] = {
        "reinterpretation": script.strip(),
    }

    if outline:
        result["outline"] = outline

    return result
