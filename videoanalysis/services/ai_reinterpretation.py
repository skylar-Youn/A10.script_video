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

def _build_description_block(subtitles: List[Dict[str, Any]], title: str) -> str:
    if not subtitles:
        return f"{title}: (none)"

    lines: List[str] = []
    for idx, item in enumerate(subtitles[:120]):
        text = (item.get("text") or "").strip()
        if not text:
            continue
        start = _format_time(item.get("start_time"))
        end = _format_time(item.get("end_time"))
        original_index = item.get("original_index")
        if original_index is None:
            original_index = idx
        target_length = item.get("target_length") or item.get("original_length") or len(text)
        lines.append(
            f"{idx:02d}. index={original_index} start={start} end={end} length={target_length} :: {text}"
        )

    if not lines:
        return f"{title}: (none)"

    return f"{title}:\n" + "\n".join(lines)



TONE_INSTRUCTIONS: Dict[str, str] = {
    "neutral": "Maintain a balanced, informative documentary tone.",
    "comic": "Keep the narration playful, witty, and lightly comedic without breaking immersion.",
    "dramatic": "Amplify emotional stakes with cinematic, evocative language.",
    "serious": "Use calm, respectful, and sincere language suited for serious subject matter.",
    "thrilling": "Write with a tense, urgent rhythm that heightens suspense."
}


def sanitize_tone(tone: Optional[str]) -> str:
    if not tone:
        return "neutral"
    tone_key = str(tone).strip().lower()
    if tone_key not in TONE_INSTRUCTIONS:
        return "neutral"
    return tone_key


def build_prompt(
    dialogues: List[Dict[str, Any]],
    descriptions: List[Dict[str, Any]],
    tone: str = "neutral"
) -> str:
    dialogue_block = _build_subtitle_block(dialogues, "[Dialogue Lines]")
    description_block = _build_description_block(descriptions, "[Existing Descriptive Subtitles]")

    tone_key = sanitize_tone(tone)
    tone_instruction = TONE_INSTRUCTIONS.get(tone_key, TONE_INSTRUCTIONS["neutral"])

    instructions = """You are rewriting a Korean narration track for a video where the original audio will be muted.
Use the dialogue and descriptive subtitles to craft a fresh, immersive Korean narration script.
Summarise key dialogue moments but avoid quoting every line verbatim.
Target length: 3~6 sentences, maintain a conversational documentary style.
Return the result as valid JSON with the following structure:
{"outline": ["핵심 포인트 요약"], "script": "최종 내레이션", "replacements": [{"index": 설명자막_index, "new_text": "대체 문장", "target_length": 글자수}]}
- replacements MUST contain exactly one entry per descriptive subtitle (matching index).
- Each new_text must be fluent Korean and MUST NOT exceed target_length characters (prefer within ±3 characters).
- Do not include any commentary outside the JSON object."""
    tone_hint = f"Adopt this tone: {tone_instruction}"

    prompt = (
        f"{instructions}\n\n"
        f"{tone_hint}\n\n"
        f"{dialogue_block}\n\n"
        f"{description_block}\n\n"
        "Generate the JSON now."
    )

    return prompt


def reinterpret_subtitles(
    dialogues: List[Dict[str, Any]],
    descriptions: List[Dict[str, Any]],
    tone: Optional[str] = None
) -> Dict[str, Any]:
    if not dialogues and not descriptions:
        raise ValueError("재해석할 자막 데이터가 없습니다.")

    tone_key = sanitize_tone(tone)

    description_meta: Dict[int, Dict[str, Any]] = {}
    for idx, item in enumerate(descriptions):
        text_value = (item.get("text") or "").strip()
        original_index = item.get("original_index")
        if original_index is None:
            original_index = idx
        try:
            original_index = int(original_index)
        except (TypeError, ValueError):
            original_index = idx
        target_length = item.get("target_length") or item.get("original_length") or len(text_value)
        try:
            target_length = int(target_length)
        except (TypeError, ValueError):
            target_length = len(text_value)
        description_meta[int(original_index)] = {
            "target_length": target_length,
            "original_length": len(text_value),
            "start_time": item.get("start_time"),
            "end_time": item.get("end_time")
        }

    client = _get_client()
    prompt = build_prompt(dialogues, descriptions, tone_key)

    logger.info(
        "재해석 요청: dialogue=%d개, description=%d개",
        len(dialogues),
        len(descriptions),
    )

    response_text = client.generate_script(prompt, temperature=0.7)
    response_text = response_text.strip()

    outline: Optional[List[str]] = None
    script = response_text
    replacements: List[Dict[str, Any]] = []

    try:
        parsed = json.loads(response_text)
        if isinstance(parsed, dict):
            outline_raw = parsed.get("outline")
            if isinstance(outline_raw, list):
                outline = [str(item).strip() for item in outline_raw if str(item).strip()]
            script_text = parsed.get("script")
            if isinstance(script_text, str) and script_text.strip():
                script = script_text.strip()
            replacements_raw = parsed.get("replacements")
            if isinstance(replacements_raw, list):
                for entry in replacements_raw:
                    if not isinstance(entry, dict):
                        continue
                    index = entry.get("index")
                    try:
                        index = int(index)
                    except (TypeError, ValueError):
                        continue
                    new_text = (entry.get("new_text") or entry.get("text") or entry.get("replacement") or "").strip()
                    if not new_text:
                        continue
                    meta = description_meta.get(index, {})
                    target_length = meta.get("target_length")
                    original_length = meta.get("original_length")
                    if isinstance(target_length, (int, float)) and target_length > 0 and len(new_text) > target_length:
                        new_text = new_text[: int(target_length)].strip()
                    replacements.append({
                        "index": index,
                        "text": new_text,
                        "target_length": target_length,
                        "original_length": original_length,
                        "start_time": entry.get("start_time") or meta.get("start_time"),
                        "end_time": entry.get("end_time") or meta.get("end_time")
                    })
    except json.JSONDecodeError:
        logger.debug("재해석 응답 JSON 파싱 실패, 원문 사용")

    result: Dict[str, Any] = {
        "reinterpretation": script.strip(),
        "tone": tone_key,
    }

    if outline:
        result["outline"] = outline
    if replacements:
        result["replacements"] = replacements

    return result
