"""
간단한 음성-자막 하이브리드 화자 인식 서비스
scikit-learn 없이 기본적인 오디오 특성으로 화자 구분
"""
import logging
import numpy as np
import librosa
from typing import List, Dict, Any, Tuple
from pathlib import Path
import os

logger = logging.getLogger(__name__)


class SimpleAudioSpeakerRecognition:
    """간단한 음성 기반 화자 인식 클래스"""

    def __init__(self):
        self.sample_rate = 16000  # 16kHz로 통일
        self.window_size = 1.0    # 1초 윈도우
        self.hop_size = 0.5       # 0.5초 겹침

    def extract_simple_features(self, audio_path: str) -> Dict[str, np.ndarray]:
        """간단한 오디오 특성 추출 (scikit-learn 없이)"""
        try:
            logger.info(f"🎵 간단한 오디오 특성 추출 시작: {audio_path}")

            # librosa로 오디오 로드
            y, sr = librosa.load(audio_path, sr=self.sample_rate)

            # 윈도우 단위로 특성 추출
            window_samples = int(self.window_size * sr)
            hop_samples = int(self.hop_size * sr)

            features = {
                'pitch': [],          # 피치 (음높이)
                'energy': [],         # 에너지 (음량)
                'spectral_centroid': [], # 스펙트럼 중심 (음색)
                'zero_crossing_rate': [], # 영점 교차율 (음성 특성)
                'timestamps': []      # 시간 정보
            }

            # 윈도우별 특성 추출
            for i in range(0, len(y) - window_samples, hop_samples):
                window = y[i:i + window_samples]
                timestamp = i / sr

                # 피치 추출 (음높이)
                pitches, magnitudes = librosa.piptrack(y=window, sr=sr)
                pitch = np.mean(pitches[pitches > 0]) if len(pitches[pitches > 0]) > 0 else 0
                features['pitch'].append(pitch)

                # 에너지 계산 (음량)
                energy = np.sum(window ** 2) / len(window)
                features['energy'].append(energy)

                # 스펙트럼 중심 (음색)
                spectral_centroid = librosa.feature.spectral_centroid(y=window, sr=sr)
                features['spectral_centroid'].append(np.mean(spectral_centroid))

                # 영점 교차율 (음성 특성)
                zcr = librosa.feature.zero_crossing_rate(window)
                features['zero_crossing_rate'].append(np.mean(zcr))

                features['timestamps'].append(timestamp)

            # 배열로 변환
            for key in features:
                if key != 'timestamps':
                    features[key] = np.array(features[key])

            logger.info(f"🎵 간단한 특성 추출 완료: {len(features['timestamps'])}개 윈도우")
            return features

        except Exception as e:
            logger.error(f"❌ 간단한 특성 추출 실패: {e}")
            return {}

    def simple_speaker_clustering(self, features: Dict[str, np.ndarray], n_speakers: int = 2) -> np.ndarray:
        """간단한 화자 클러스터링 (k-means 대신 임계값 기반)"""
        try:
            logger.info(f"🎭 간단한 화자 클러스터링 시작: {n_speakers}명 화자")

            if len(features['timestamps']) == 0:
                return np.array([])

            # 주요 특성들을 정규화
            pitch = features['pitch']
            energy = features['energy']
            spectral_centroid = features['spectral_centroid']

            # 정규화 (0-1 범위로)
            def normalize(arr):
                arr_min, arr_max = np.min(arr), np.max(arr)
                if arr_max - arr_min > 0:
                    return (arr - arr_min) / (arr_max - arr_min)
                return np.zeros_like(arr)

            norm_pitch = normalize(pitch)
            norm_energy = normalize(energy)
            norm_spectral = normalize(spectral_centroid)

            # 간단한 2명 화자 구분 (피치 기반)
            if n_speakers == 2:
                # 피치의 중간값을 기준으로 구분
                pitch_median = np.median(norm_pitch[norm_pitch > 0])
                speaker_labels = np.where(norm_pitch > pitch_median, 1, 0)

            # 3명 이상의 화자 구분 (피치 + 에너지 조합)
            else:
                speaker_labels = np.zeros(len(features['timestamps']), dtype=int)

                # 피치와 에너지 조합으로 구분
                for i in range(len(features['timestamps'])):
                    # 높은 피치 + 높은 에너지 = 화자 0
                    if norm_pitch[i] > 0.7 and norm_energy[i] > 0.6:
                        speaker_labels[i] = 0
                    # 낮은 피치 + 높은 에너지 = 화자 1
                    elif norm_pitch[i] < 0.3 and norm_energy[i] > 0.4:
                        speaker_labels[i] = 1
                    # 중간 피치 = 화자 2
                    else:
                        speaker_labels[i] = 2 if n_speakers > 2 else 0

            unique_speakers = len(np.unique(speaker_labels))
            logger.info(f"🎭 간단한 클러스터링 완료: {unique_speakers}명 화자 감지")

            return speaker_labels

        except Exception as e:
            logger.error(f"❌ 간단한 클러스터링 실패: {e}")
            return np.zeros(len(features['timestamps']))

    def map_speakers_to_subtitles(self, speaker_labels: np.ndarray,
                                features: Dict[str, np.ndarray],
                                subtitles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """화자 라벨을 자막에 매핑"""
        try:
            logger.info(f"🎭 화자-자막 매핑 시작")

            timestamps = features['timestamps']

            # 각 자막에 대해 해당 시간대의 화자 결정
            for subtitle in subtitles:
                start_time = subtitle.get('start_time', 0)
                end_time = subtitle.get('end_time', 0)

                # 자막 시간대와 겹치는 오디오 윈도우들 찾기
                overlapping_windows = []
                for i, ts in enumerate(timestamps):
                    window_end = ts + self.window_size

                    # 겹치는 구간이 있는지 확인
                    if not (end_time <= ts or start_time >= window_end):
                        overlapping_windows.append(i)

                if overlapping_windows:
                    # 가장 많이 나타나는 화자를 선택
                    speaker_votes = [speaker_labels[i] for i in overlapping_windows]
                    speaker_id = max(set(speaker_votes), key=speaker_votes.count)
                    speaker_name = f"화자{speaker_id + 1}"

                    if speaker_name == '화자4':
                        subtitle['original_speaker_name'] = '화자4'
                        subtitle['speaker_id'] = -1
                        subtitle['speaker_name'] = '미분류'
                    else:
                        subtitle['speaker_id'] = int(speaker_id)
                        subtitle['speaker_name'] = speaker_name
                else:
                    # 겹치는 윈도우가 없으면 가장 가까운 윈도우의 화자 사용
                    if len(timestamps) > 0:
                        closest_window = np.argmin([abs(ts - start_time) for ts in timestamps])
                        closest_speaker_id = int(speaker_labels[closest_window])
                        speaker_name = f"화자{closest_speaker_id + 1}"

                        if speaker_name == '화자4':
                            subtitle['original_speaker_name'] = '화자4'
                            subtitle['speaker_id'] = -1
                            subtitle['speaker_name'] = '미분류'
                        else:
                            subtitle['speaker_id'] = closest_speaker_id
                            subtitle['speaker_name'] = speaker_name
                    else:
                        subtitle['speaker_id'] = 0
                        subtitle['speaker_name'] = "화자1"

            # 화자별 통계
            speaker_stats = {}
            for speaker_id in np.unique(speaker_labels):
                speaker_subtitles = [s for s in subtitles if s.get('speaker_id') == speaker_id]
                speaker_name = f"화자{speaker_id + 1}"

                if speaker_name == '화자4':
                    speaker_stats[speaker_name] = {
                        "subtitle_count": 0,
                        "total_duration": 0,
                        "sample_texts": []
                    }
                    continue

                speaker_stats[speaker_name] = {
                    "subtitle_count": len(speaker_subtitles),
                    "total_duration": sum(s.get('duration', 0) for s in speaker_subtitles),
                    "sample_texts": [s.get('text', '')[:50] for s in speaker_subtitles[:3]]
                }

            logger.info(f"🎭 화자-자막 매핑 완료: {len(speaker_stats)}명 화자")
            for speaker, stats in speaker_stats.items():
                logger.info(f"  {speaker}: {stats['subtitle_count']}개 자막")

            return subtitles

        except Exception as e:
            logger.error(f"❌ 화자-자막 매핑 실패: {e}")
            return subtitles

    def recognize_speakers_from_audio(self, audio_path: str,
                                    subtitles: List[Dict[str, Any]] = None,
                                    n_speakers: int = None) -> Dict[str, Any]:
        """간단한 오디오 기반 화자 인식 수행"""
        try:
            logger.info(f"🎵 간단한 음성 기반 화자 인식 시작: {audio_path}")

            # 1. 간단한 오디오 특성 추출
            features = self.extract_simple_features(audio_path)
            if not features:
                raise Exception("오디오 특성 추출 실패")

            # 2. 간단한 화자 클러스터링 (기본값: 2명)
            if n_speakers is None:
                n_speakers = 2

            speaker_labels = self.simple_speaker_clustering(features, n_speakers)

            # 3. 자막이 있으면 매핑
            if subtitles:
                subtitles = self.map_speakers_to_subtitles(speaker_labels, features, subtitles)

            # 4. 결과 반환
            unique_speakers = np.unique(speaker_labels)
            speakers = {}

            for speaker_id in unique_speakers:
                speaker_windows = speaker_labels == speaker_id
                speaker_features = {
                    'avg_pitch': float(np.mean(features['pitch'][speaker_windows])),
                    'avg_energy': float(np.mean(features['energy'][speaker_windows])),
                    'avg_spectral_centroid': float(np.mean(features['spectral_centroid'][speaker_windows])),
                    'window_count': int(np.sum(speaker_windows)),
                    'total_duration': float(np.sum(speaker_windows) * self.hop_size)
                }

                speaker_name = f"화자{speaker_id + 1}"

                if speaker_name == '화자4':
                    speaker_features['window_count'] = 0
                    speaker_features['total_duration'] = 0
                    speaker_features['avg_pitch'] = 0
                    speaker_features['avg_energy'] = 0
                    speaker_features['avg_spectral_centroid'] = 0

                if subtitles:
                    speaker_subtitles = [s for s in subtitles if s.get('speaker_id') == speaker_id]
                    speaker_features.update({
                        'subtitle_count': len(speaker_subtitles),
                        'subtitle_indices': [i for i, s in enumerate(subtitles) if s.get('speaker_id') == speaker_id],
                        'sample_texts': [s.get('text', '')[:50] + '...' for s in speaker_subtitles[:3]]
                    })

                    if speaker_name == '화자4':
                        speaker_features['subtitle_count'] = 0
                        speaker_features['subtitle_indices'] = []
                        speaker_features['sample_texts'] = []

                speakers[speaker_name] = speaker_features

            result = {
                "speakers": speakers,
                "total_speakers": len(unique_speakers),
                "analysis_method": "simple_audio_based",
                "audio_duration": float(len(features['timestamps']) * self.hop_size),
                "features_extracted": len(features['timestamps'])
            }

            if subtitles:
                result["classified_subtitles"] = subtitles

            logger.info(f"🎵 간단한 음성 기반 화자 인식 완료: {len(speakers)}명 화자")
            return result

        except Exception as e:
            logger.error(f"❌ 간단한 음성 기반 화자 인식 실패: {e}")
            return {"speakers": {}, "total_speakers": 0, "error": str(e)}
