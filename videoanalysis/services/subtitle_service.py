"""
자막 분석 및 처리 서비스
"""
import logging
import numpy as np
from typing import List, Dict, Any

from ..utils.time_utils import srt_time_to_seconds

logger = logging.getLogger(__name__)


def parse_srt_file(file_path: str) -> List[Dict[str, Any]]:
    """SRT 파일 파싱"""
    subtitles = []

    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read().strip()

    blocks = content.split('\n\n')
    for block in blocks:
        lines = block.strip().split('\n')
        if len(lines) >= 3:
            try:
                index = int(lines[0])
                time_line = lines[1]
                text = '\n'.join(lines[2:])

                # 시간 파싱
                start_time, end_time = time_line.split(' --> ')
                start_seconds = srt_time_to_seconds(start_time)
                end_seconds = srt_time_to_seconds(end_time)

                subtitles.append({
                    "index": index,
                    "start_time": start_seconds,
                    "end_time": end_seconds,
                    "duration": end_seconds - start_seconds,
                    "text": text.strip(),
                    "char_count": len(text.strip())
                })
            except (ValueError, IndexError) as e:
                logger.warning(f"SRT 파싱 에러 - 블록: {block[:50]}..., 에러: {e}")
                continue

    return subtitles


def analyze_subtitle_timing(subtitles: List[Dict[str, Any]]) -> Dict[str, Any]:
    """자막 타이밍 상세 분석"""
    if not subtitles:
        return {
            "total_subtitles": 0,
            "total_duration": 0,
            "gaps": [],
            "overlaps": [],
            "gap_count": 0,
            "overlap_count": 0,
            "gap_percentage": 0,
            "average_subtitle_duration": 0,
            "reading_speed": 0
        }

    gaps = []
    overlaps = []
    durations = []
    char_counts = []

    for i in range(len(subtitles) - 1):
        current = subtitles[i]
        next_sub = subtitles[i + 1]

        durations.append(current["duration"])
        char_counts.append(current["char_count"])

        gap_time = next_sub["start_time"] - current["end_time"]

        if gap_time > 0.1:  # 갭 감지 (0.1초 이상)
            gaps.append({
                "after_subtitle": i + 1,
                "gap_duration": gap_time,
                "start_time": current["end_time"],
                "end_time": next_sub["start_time"]
            })
        elif gap_time < -0.01:  # 겹침 감지 (0.01초 이상)
            overlaps.append({
                "subtitle1": i + 1,
                "subtitle2": i + 2,
                "overlap_duration": -gap_time,
                "overlap_start": next_sub["start_time"],
                "overlap_end": current["end_time"]
            })

    # 마지막 자막 정보 추가
    if subtitles:
        last_subtitle = subtitles[-1]
        durations.append(last_subtitle["duration"])
        char_counts.append(last_subtitle["char_count"])

    total_duration = subtitles[-1]["end_time"] - subtitles[0]["start_time"] if subtitles else 0
    gap_percentage = (sum(gap["gap_duration"] for gap in gaps) / total_duration) * 100 if total_duration > 0 else 0
    average_duration = np.mean(durations) if durations else 0

    # 읽기 속도 계산 (글자/분)
    total_chars = sum(char_counts)
    total_display_time = sum(durations) / 60  # 분 단위
    reading_speed = total_chars / total_display_time if total_display_time > 0 else 0

    return {
        "total_subtitles": len(subtitles),
        "total_duration": total_duration,
        "gaps": gaps,
        "overlaps": overlaps,
        "gap_count": len(gaps),
        "overlap_count": len(overlaps),
        "gap_percentage": gap_percentage,
        "average_subtitle_duration": average_duration,
        "reading_speed": reading_speed,
        "total_characters": total_chars,
        "recommendations": generate_subtitle_recommendations(gaps, overlaps, average_duration, reading_speed)
    }


def generate_subtitle_recommendations(gaps: List, overlaps: List, avg_duration: float,
                                    reading_speed: float) -> List[Dict[str, str]]:
    """자막 개선 권장사항 생성"""
    recommendations = []

    if len(overlaps) > 0:
        recommendations.append({
            "type": "error",
            "icon": "⚠️",
            "message": f"{len(overlaps)}개 자막이 겹쳐있습니다. 자동 수정 도구를 사용하세요.",
            "action": "fix-overlaps"
        })

    if len(gaps) > 10:
        recommendations.append({
            "type": "warning",
            "icon": "📏",
            "message": f"갭이 {len(gaps)}개로 많습니다. 각 자막 간 0.1초 간격 추가를 권장합니다.",
            "action": "reduce-gaps"
        })

    if avg_duration < 1.0:
        recommendations.append({
            "type": "info",
            "icon": "⏱️",
            "message": "평균 자막 지속시간이 짧습니다. 최소 1초 이상 권장합니다.",
            "action": "extend-duration"
        })

    if reading_speed > 300:
        recommendations.append({
            "type": "warning",
            "icon": "👁️",
            "message": f"읽기 속도가 {reading_speed:.0f}자/분으로 빠릅니다. 250자/분 이하 권장합니다.",
            "action": "slow-reading-speed"
        })

    return recommendations


def calculate_quality_score(original_analysis: Dict, generated_analysis: Dict) -> float:
    """자막 품질 점수 계산 (0-100)"""
    score = 100

    # 겹침 페널티
    if generated_analysis["overlap_count"] > 0:
        score -= generated_analysis["overlap_count"] * 10

    # 갭 비율 비교
    gap_diff = abs(generated_analysis["gap_percentage"] - original_analysis["gap_percentage"])
    if gap_diff > 20:
        score -= gap_diff

    # 자막 수 비교
    subtitle_count_ratio = generated_analysis["total_subtitles"] / max(original_analysis["total_subtitles"], 1)
    if subtitle_count_ratio < 0.5 or subtitle_count_ratio > 2:
        score -= 20

    return max(0, score)