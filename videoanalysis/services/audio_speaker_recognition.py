"""
음성 기반 화자 인식 및 분리 서비스
"""
import logging
import numpy as np
import librosa
from typing import List, Dict, Any, Tuple
from pathlib import Path
import subprocess
import tempfile
import os

logger = logging.getLogger(__name__)


class AudioSpeakerRecognition:
    """음성 기반 화자 인식 및 분리 클래스"""

    def __init__(self):
        self.sample_rate = 16000  # 16kHz로 통일
        self.window_size = 2.0    # 2초 윈도우
        self.hop_size = 0.5       # 0.5초 겹침

    def extract_audio_features(self, audio_path: str) -> Dict[str, np.ndarray]:
        """오디오에서 화자 구분용 특성 추출"""
        try:
            # librosa로 오디오 로드
            y, sr = librosa.load(audio_path, sr=self.sample_rate)

            # 윈도우 단위로 특성 추출
            window_samples = int(self.window_size * sr)
            hop_samples = int(self.hop_size * sr)

            features = {
                'mfcc': [],           # Mel-frequency cepstral coefficients
                'chroma': [],         # 크로마 특성
                'spectral_centroid': [],  # 스펙트럼 중심
                'spectral_rolloff': [],   # 스펙트럼 롤오프
                'zero_crossing_rate': [], # 영점 교차율
                'tempo': [],          # 템포
                'pitch': [],          # 피치
                'energy': [],         # 에너지
                'timestamps': []      # 시간 정보
            }

            # 윈도우별 특성 추출
            for i in range(0, len(y) - window_samples, hop_samples):
                window = y[i:i + window_samples]
                timestamp = i / sr

                # MFCC (화자 특성에 중요)
                mfcc = librosa.feature.mfcc(y=window, sr=sr, n_mfcc=13)
                features['mfcc'].append(np.mean(mfcc, axis=1))

                # 크로마 특성
                chroma = librosa.feature.chroma_stft(y=window, sr=sr)
                features['chroma'].append(np.mean(chroma, axis=1))

                # 스펙트럼 특성
                spectral_centroid = librosa.feature.spectral_centroid(y=window, sr=sr)
                features['spectral_centroid'].append(np.mean(spectral_centroid))

                spectral_rolloff = librosa.feature.spectral_rolloff(y=window, sr=sr)
                features['spectral_rolloff'].append(np.mean(spectral_rolloff))

                # 영점 교차율
                zcr = librosa.feature.zero_crossing_rate(window)
                features['zero_crossing_rate'].append(np.mean(zcr))

                # 피치 추출
                pitches, magnitudes = librosa.piptrack(y=window, sr=sr)
                pitch = np.mean(pitches[pitches > 0]) if len(pitches[pitches > 0]) > 0 else 0
                features['pitch'].append(pitch)

                # 에너지 계산
                energy = np.sum(window ** 2) / len(window)
                features['energy'].append(energy)

                features['timestamps'].append(timestamp)

            # 배열로 변환
            for key in features:
                if key != 'timestamps':
                    features[key] = np.array(features[key])

            logger.info(f"🎵 오디오 특성 추출 완료: {len(features['timestamps'])}개 윈도우")
            return features

        except Exception as e:
            logger.error(f"❌ 오디오 특성 추출 실패: {e}")
            return {}

    def cluster_speakers(self, features: Dict[str, np.ndarray], n_speakers: int = None) -> np.ndarray:
        """특성을 기반으로 화자 클러스터링"""
        try:
            # scikit-learn 임포트와 threadpoolctl 경고 무시
            import warnings
            warnings.filterwarnings('ignore', category=UserWarning)

            from sklearn.cluster import KMeans
            from sklearn.preprocessing import StandardScaler
            from sklearn.decomposition import PCA

            # 특성 벡터 구성
            feature_vectors = []

            for i in range(len(features['timestamps'])):
                vector = np.concatenate([
                    features['mfcc'][i],
                    features['chroma'][i],
                    [features['spectral_centroid'][i]],
                    [features['spectral_rolloff'][i]],
                    [features['zero_crossing_rate'][i]],
                    [features['pitch'][i]],
                    [features['energy'][i]]
                ])
                feature_vectors.append(vector)

            feature_vectors = np.array(feature_vectors)

            # 정규화
            scaler = StandardScaler()
            normalized_features = scaler.fit_transform(feature_vectors)

            # 차원 축소 (선택적)
            if normalized_features.shape[1] > 50:
                pca = PCA(n_components=50)
                normalized_features = pca.fit_transform(normalized_features)

            # 화자 수 자동 결정 (없으면 2-5 범위에서 최적값 찾기)
            if n_speakers is None:
                n_speakers = self.find_optimal_speakers(normalized_features)

            # K-means 클러스터링
            kmeans = KMeans(n_clusters=n_speakers, random_state=42, n_init=10)
            speaker_labels = kmeans.fit_predict(normalized_features)

            logger.info(f"🎭 화자 클러스터링 완료: {n_speakers}명 화자")
            return speaker_labels

        except ImportError:
            logger.error("❌ scikit-learn이 설치되지 않았습니다. pip install scikit-learn")
            return np.zeros(len(features['timestamps']))
        except Exception as e:
            logger.error(f"❌ 화자 클러스터링 실패: {e}")
            return np.zeros(len(features['timestamps']))

    def find_optimal_speakers(self, features: np.ndarray, max_speakers: int = 5) -> int:
        """최적 화자 수 자동 결정 (Elbow Method)"""
        try:
            import warnings
            warnings.filterwarnings('ignore', category=UserWarning)

            from sklearn.cluster import KMeans

            inertias = []
            k_range = range(2, min(max_speakers + 1, len(features) // 10 + 1))

            for k in k_range:
                kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
                kmeans.fit(features)
                inertias.append(kmeans.inertia_)

            # Elbow 포인트 찾기 (간단한 방법)
            if len(inertias) < 2:
                return 2

            # 기울기 변화가 가장 큰 지점
            diffs = np.diff(inertias)
            optimal_k = k_range[np.argmax(diffs)] if len(diffs) > 0 else 2

            logger.info(f"🎯 최적 화자 수: {optimal_k}")
            return optimal_k

        except Exception as e:
            logger.error(f"❌ 최적 화자 수 결정 실패: {e}")
            return 2

    def map_speakers_to_subtitles(self, speaker_labels: np.ndarray,
                                features: Dict[str, np.ndarray],
                                subtitles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """화자 라벨을 자막에 매핑"""
        try:
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
        """오디오에서 화자 인식 수행"""
        try:
            logger.info(f"🎵 음성 기반 화자 인식 시작: {audio_path}")

            # 1. 오디오 특성 추출
            features = self.extract_audio_features(audio_path)
            if not features:
                raise Exception("오디오 특성 추출 실패")

            # 2. 화자 클러스터링
            speaker_labels = self.cluster_speakers(features, n_speakers)

            # 3. 자막이 있으면 매핑
            if subtitles:
                subtitles = self.map_speakers_to_subtitles(speaker_labels, features, subtitles)

            # 4. 결과 반환
            unique_speakers = np.unique(speaker_labels)
            speakers = {}

            for speaker_id in unique_speakers:
                speaker_windows = speaker_labels == speaker_id
                speaker_features = {
                    'avg_pitch': np.mean(features['pitch'][speaker_windows]),
                    'avg_energy': np.mean(features['energy'][speaker_windows]),
                    'avg_spectral_centroid': np.mean(features['spectral_centroid'][speaker_windows]),
                    'window_count': np.sum(speaker_windows),
                    'total_duration': np.sum(speaker_windows) * self.hop_size
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
                "analysis_method": "audio_based",
                "audio_duration": len(features['timestamps']) * self.hop_size,
                "features_extracted": len(features['timestamps'])
            }

            if subtitles:
                result["classified_subtitles"] = subtitles

            logger.info(f"🎵 음성 기반 화자 인식 완료: {len(speakers)}명 화자")
            return result

        except Exception as e:
            logger.error(f"❌ 음성 기반 화자 인식 실패: {e}")
            return {"speakers": {}, "total_speakers": 0, "error": str(e)}

    def extract_speaker_segments(self, audio_path: str, speaker_labels: np.ndarray,
                                features: Dict[str, np.ndarray], output_dir: str = None) -> Dict[str, str]:
        """화자별로 오디오 세그먼트 분리하여 저장"""
        try:
            if output_dir is None:
                output_dir = os.path.dirname(audio_path)

            y, sr = librosa.load(audio_path, sr=self.sample_rate)
            timestamps = features['timestamps']
            hop_samples = int(self.hop_size * sr)

            speaker_files = {}

            for speaker_id in np.unique(speaker_labels):
                # 해당 화자의 세그먼트들 추출
                speaker_segments = []

                for i, label in enumerate(speaker_labels):
                    if label == speaker_id:
                        start_sample = i * hop_samples
                        end_sample = min(start_sample + int(self.window_size * sr), len(y))
                        speaker_segments.append(y[start_sample:end_sample])

                if speaker_segments:
                    # 세그먼트들을 하나로 합치기
                    combined_audio = np.concatenate(speaker_segments)

                    # 파일 저장
                    base_name = Path(audio_path).stem
                    speaker_filename = f"{base_name}_speaker{speaker_id + 1}.wav"
                    speaker_path = os.path.join(output_dir, speaker_filename)

                    # librosa로 저장
                    import soundfile as sf
                    sf.write(speaker_path, combined_audio, sr)

                    speaker_files[f"화자{speaker_id + 1}"] = speaker_path
                    logger.info(f"🎵 화자{speaker_id + 1} 오디오 저장: {speaker_path}")

            return speaker_files

        except Exception as e:
            logger.error(f"❌ 화자별 오디오 분리 실패: {e}")
            return {}
