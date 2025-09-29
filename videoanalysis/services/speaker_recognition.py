"""
화자 인식 및 대사 분류 서비스
"""
import re
import logging
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict, Counter

logger = logging.getLogger(__name__)


class SpeakerRecognition:
    """화자 인식 및 대사 분류 클래스"""

    def __init__(self):
        self.speakers = {}  # 감지된 화자들
        self.speaker_patterns = []  # 화자 패턴들
        self.speaker_track_mapping = {}  # 화자별 트랙 할당

    def detect_speakers_from_subtitles(self, subtitles: List[Dict[str, Any]]) -> Dict[str, Any]:
        """자막에서 화자들을 자동 감지"""
        logger.info("🎭 자막에서 화자 감지 시작")

        speakers = {}
        speaker_patterns = []

        # 패턴 1: "이름:" 형식 감지
        name_colon_speakers = self._detect_name_colon_pattern(subtitles)

        # 패턴 2: 대화 패턴 감지 (문체, 어투 분석)
        speech_pattern_speakers = self._detect_speech_patterns(subtitles)

        # 패턴 3: 텍스트 길이 및 특성 분석
        text_style_speakers = self._detect_text_styles(subtitles)

        # 모든 패턴 결합
        all_speakers = {}
        all_speakers.update(name_colon_speakers)
        all_speakers.update(speech_pattern_speakers)
        all_speakers.update(text_style_speakers)

        # 화자별 통계 계산
        speaker_stats = self._calculate_speaker_stats(all_speakers, subtitles)

        logger.info(f"🎭 감지된 화자 수: {len(speaker_stats)}")

        return {
            "speakers": speaker_stats,
            "patterns": {
                "name_colon": name_colon_speakers,
                "speech_pattern": speech_pattern_speakers,
                "text_style": text_style_speakers
            },
            "total_speakers": len(speaker_stats)
        }

    def _detect_name_colon_pattern(self, subtitles: List[Dict[str, Any]]) -> Dict[str, List[int]]:
        """'이름:' 패턴으로 화자 감지"""
        speakers = defaultdict(list)

        for idx, subtitle in enumerate(subtitles):
            text = subtitle.get('text', '').strip()

            # 한글 이름: 패턴
            match = re.match(r'^([가-힣]{2,4})\s*:\s*(.+)', text)
            if match:
                speaker_name = match.group(1)
                speakers[speaker_name].append(idx)
                continue

            # 영문 이름: 패턴
            match = re.match(r'^([A-Za-z]{2,10})\s*:\s*(.+)', text)
            if match:
                speaker_name = match.group(1)
                speakers[speaker_name].append(idx)
                continue

            # (이름) 패턴
            match = re.match(r'^\(([가-힣A-Za-z]{2,10})\)\s*(.+)', text)
            if match:
                speaker_name = match.group(1)
                speakers[speaker_name].append(idx)

        return dict(speakers)

    def _detect_speech_patterns(self, subtitles: List[Dict[str, Any]]) -> Dict[str, List[int]]:
        """문체와 어투로 화자 감지"""
        patterns = {
            "정중한_화자": [],
            "반말_화자": [],
            "경어_화자": [],
            "감탄_화자": []
        }

        for idx, subtitle in enumerate(subtitles):
            text = subtitle.get('text', '').strip()

            # 정중한 어투 (습니다, 니다 등)
            if re.search(r'(습니다|니다|게요|에요)\.?$', text):
                patterns["정중한_화자"].append(idx)

            # 반말 어투
            elif re.search(r'(야|어|지|냐|다고)\s*[!?.]?$', text):
                patterns["반말_화자"].append(idx)

            # 경어 (시, 께서 등)
            elif re.search(r'(세요|십니다|께서|시는)', text):
                patterns["경어_화자"].append(idx)

            # 감탄사 많은 화자
            elif re.search(r'[!?]{2,}|아!|어!|오!|우와|헉|어머', text):
                patterns["감탄_화자"].append(idx)

        # 5개 이상의 대사가 있는 패턴만 유효한 화자로 인정
        valid_patterns = {k: v for k, v in patterns.items() if len(v) >= 3}

        return valid_patterns

    def _detect_text_styles(self, subtitles: List[Dict[str, Any]]) -> Dict[str, List[int]]:
        """텍스트 길이와 스타일로 화자 구분"""
        short_texts = []  # 짧은 대사 (나레이션 등)
        long_texts = []   # 긴 대사 (메인 캐릭터 등)
        question_texts = []  # 질문 많은 화자

        for idx, subtitle in enumerate(subtitles):
            text = subtitle.get('text', '').strip()
            text_length = len(text)

            if text_length < 10:
                short_texts.append(idx)
            elif text_length > 30:
                long_texts.append(idx)

            if '?' in text or '물어' in text or '뭐' in text:
                question_texts.append(idx)

        styles = {}
        if len(short_texts) >= 3:
            styles["짧은_대사_화자"] = short_texts
        if len(long_texts) >= 3:
            styles["긴_대사_화자"] = long_texts
        if len(question_texts) >= 3:
            styles["질문_화자"] = question_texts

        return styles

    def _calculate_speaker_stats(self, speakers: Dict[str, List[int]],
                                subtitles: List[Dict[str, Any]]) -> Dict[str, Dict]:
        """화자별 통계 계산"""
        stats = {}

        for speaker_name, subtitle_indices in speakers.items():
            if len(subtitle_indices) < 2:  # 최소 2개 이상의 대사
                continue

            total_duration = 0
            total_chars = 0
            texts = []

            for idx in subtitle_indices:
                if idx < len(subtitles):
                    subtitle = subtitles[idx]
                    duration = subtitle.get('duration', 0)
                    text = subtitle.get('text', '')

                    total_duration += duration
                    total_chars += len(text)
                    texts.append(text)

            avg_duration = total_duration / len(subtitle_indices) if subtitle_indices else 0
            avg_chars = total_chars / len(subtitle_indices) if subtitle_indices else 0

            # 화자 특성 분석
            characteristics = self._analyze_speaker_characteristics(texts)

            stats[speaker_name] = {
                "name": speaker_name,
                "subtitle_count": len(subtitle_indices),
                "subtitle_indices": subtitle_indices,
                "total_duration": total_duration,
                "avg_duration": avg_duration,
                "total_chars": total_chars,
                "avg_chars": avg_chars,
                "characteristics": characteristics,
                "sample_texts": texts[:3]  # 샘플 대사 3개
            }

        return stats

    def _analyze_speaker_characteristics(self, texts: List[str]) -> Dict[str, Any]:
        """화자의 언어적 특성 분석"""
        characteristics = {
            "politeness_level": "보통",  # 정중함 정도
            "emotion_level": "보통",     # 감정 표현 정도
            "question_frequency": 0,     # 질문 빈도
            "exclamation_frequency": 0,  # 감탄사 빈도
            "speech_style": "일반"       # 말투 스타일
        }

        if not texts:
            return characteristics

        # 정중함 분석
        polite_words = sum(1 for text in texts if re.search(r'(습니다|께서|시는|입니다)', text))
        if polite_words / len(texts) > 0.6:
            characteristics["politeness_level"] = "높음"
        elif polite_words / len(texts) > 0.3:
            characteristics["politeness_level"] = "보통"
        else:
            characteristics["politeness_level"] = "낮음"

        # 감정 표현 분석
        emotion_words = sum(1 for text in texts if re.search(r'[!?]{2,}|아!|어!|우와|헉', text))
        characteristics["emotion_level"] = "높음" if emotion_words / len(texts) > 0.4 else "보통"

        # 질문/감탄사 빈도
        characteristics["question_frequency"] = sum(1 for text in texts if '?' in text) / len(texts)
        characteristics["exclamation_frequency"] = sum(1 for text in texts if '!' in text) / len(texts)

        return characteristics

    def assign_speakers_to_tracks(self, speakers: Dict[str, Dict],
                                 track_mapping: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        """화자를 트랙에 자동 할당"""

        if track_mapping:
            return track_mapping

        # 자동 할당 로직
        available_tracks = ["main", "translation", "description"]
        speaker_track_mapping = {}

        # 대사 수가 많은 순서로 정렬
        sorted_speakers = sorted(speakers.items(),
                               key=lambda x: x[1]["subtitle_count"],
                               reverse=True)

        for idx, (speaker_name, speaker_data) in enumerate(sorted_speakers):
            if idx < len(available_tracks):
                track = available_tracks[idx]
                speaker_track_mapping[speaker_name] = track
                logger.info(f"🎭 {speaker_name} → {track} 트랙 할당")

        return speaker_track_mapping

    def classify_subtitles_by_speaker(self, subtitles: List[Dict[str, Any]],
                                    speakers: Dict[str, Dict],
                                    speaker_track_mapping: Dict[str, str]) -> Dict[str, List[Dict]]:
        """화자별로 자막 분류"""

        classified = {
            "main": [],
            "translation": [],
            "description": [],
            "unassigned": []
        }

        # 화자별 자막 인덱스 매핑 생성
        speaker_indices = {}
        for speaker_name, speaker_data in speakers.items():
            speaker_indices[speaker_name] = set(speaker_data["subtitle_indices"])

        for idx, subtitle in enumerate(subtitles):
            assigned = False

            # 각 화자의 자막 인덱스와 매칭
            for speaker_name, indices in speaker_indices.items():
                if idx in indices:
                    track = speaker_track_mapping.get(speaker_name, "unassigned")
                    if track in classified:
                        classified[track].append({**subtitle, "speaker": speaker_name, "original_index": idx})
                        assigned = True
                        break

            if not assigned:
                classified["unassigned"].append({**subtitle, "speaker": "unknown", "original_index": idx})

        logger.info(f"🎭 자막 분류 완료: main={len(classified['main'])}, "
                   f"translation={len(classified['translation'])}, "
                   f"description={len(classified['description'])}, "
                   f"unassigned={len(classified['unassigned'])}")

        return classified