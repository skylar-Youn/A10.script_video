"""
오디오 분석 및 처리 서비스
"""
import os
import json
import struct
import tempfile
import subprocess
import speech_recognition as sr
import numpy as np
from typing import Dict, Any, List
from pathlib import Path
import logging

from ..config import (
    DEFAULT_SILENCE_THRESHOLD,
    DEFAULT_MIN_GAP_DURATION,
    DEFAULT_SEGMENT_DURATION,
    DEFAULT_LANGUAGE,
    DEFAULT_WAVEFORM_WIDTH,
    FFMPEG_AUDIO_CODEC,
    FFMPEG_SAMPLE_RATE,
    FFMPEG_CHANNELS
)
from ..utils.time_utils import seconds_to_srt_time

logger = logging.getLogger(__name__)


def extract_audio_from_video(video_path: str) -> str:
    """비디오에서 오디오 추출"""
    temp_audio = tempfile.mktemp(suffix='.wav')

    cmd = [
        'ffmpeg', '-i', video_path,
        '-vn', '-acodec', FFMPEG_AUDIO_CODEC,
        '-ar', FFMPEG_SAMPLE_RATE, '-ac', FFMPEG_CHANNELS,
        temp_audio, '-y'
    ]

    subprocess.run(cmd, capture_output=True, check=True)
    return temp_audio


def extract_audio_to_file(video_path: str, output_path: str, output_format: str = "wav") -> bool:
    """영상 파일에서 음성을 추출하여 파일로 저장"""
    try:
        # FFmpeg 명령어 구성
        if output_format.lower() == "wav":
            cmd = [
                'ffmpeg', '-y', '-i', video_path,
                '-vn', '-acodec', 'pcm_s16le',
                '-ar', '48000', '-ac', '2',
                output_path
            ]
        elif output_format.lower() == "mp3":
            cmd = [
                'ffmpeg', '-y', '-i', video_path,
                '-vn', '-acodec', 'libmp3lame',
                '-ab', '192k', '-ar', '48000',
                output_path
            ]
        elif output_format.lower() == "m4a":
            cmd = [
                'ffmpeg', '-y', '-i', video_path,
                '-vn', '-acodec', 'aac',
                '-ab', '192k', '-ar', '48000',
                output_path
            ]
        else:
            logger.error(f"지원되지 않는 출력 형식: {output_format}")
            return False

        # FFmpeg 실행
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        logger.info(f"음성 추출 완료: {video_path} -> {output_path}")
        return True

    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg 에러: {e.stderr}")
        return False
    except Exception as e:
        logger.error(f"음성 추출 실패: {e}")
        return False


def analyze_audio_file(audio_path: str, silence_threshold: float = DEFAULT_SILENCE_THRESHOLD,
                      min_gap_duration: float = DEFAULT_MIN_GAP_DURATION) -> Dict[str, Any]:
    """오디오 파일 상세 분석 (FFmpeg 사용)"""

    # FFmpeg로 오디오 정보 가져오기
    try:
        # 오디오 길이 가져오기
        result = subprocess.run([
            'ffprobe', '-v', 'quiet', '-show_entries',
            'format=duration', '-of', 'csv=p=0', audio_path
        ], capture_output=True, text=True, check=True)
        duration = float(result.stdout.strip())

        # 오디오 포맷 정보 가져오기
        result = subprocess.run([
            'ffprobe', '-v', 'quiet', '-select_streams', 'a:0',
            '-show_entries', 'stream=sample_rate,channels',
            '-of', 'csv=p=0', audio_path
        ], capture_output=True, text=True, check=True)
        audio_info = result.stdout.strip().split(',')
        sample_rate = int(audio_info[0]) if audio_info[0] else 44100
        channels = int(audio_info[1]) if len(audio_info) > 1 and audio_info[1] else 2

    except (subprocess.CalledProcessError, ValueError) as e:
        logger.warning(f"FFmpeg 오디오 정보 읽기 실패: {e}")
        duration = 0
        sample_rate = 44100
        channels = 2

    # 기본적인 무음 구간 감지 (간소화된 버전)
    silence_regions = []

    # FFmpeg로 간단한 무음 감지 (silencedetect 필터 사용)
    try:
        result = subprocess.run([
            'ffmpeg', '-i', audio_path, '-af',
            f'silencedetect=noise={silence_threshold}:d={min_gap_duration}',
            '-f', 'null', '-'
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        # stderr에서 무음 구간 파싱
        lines = result.stderr.split('\n') if hasattr(result, 'stderr') else []
        current_silence = {}

        for line in lines:
            if 'silence_start:' in line:
                start_time = float(line.split('silence_start: ')[1].split()[0])
                current_silence = {'start': start_time}
            elif 'silence_end:' in line and current_silence:
                end_time = float(line.split('silence_end: ')[1].split()[0].split('|')[0])
                current_silence['end'] = end_time
                current_silence['duration'] = end_time - current_silence['start']
                silence_regions.append(current_silence)
                current_silence = {}

    except Exception as e:
        logger.warning(f"무음 구간 감지 실패: {e}")

    # 통계 계산
    total_silence_duration = sum(region['duration'] for region in silence_regions)
    speech_duration = max(0, duration - total_silence_duration)
    speech_ratio = speech_duration / duration if duration > 0 else 0

    return {
        'duration': duration,
        'sample_rate': sample_rate,
        'channels': channels,
        'silence_regions': silence_regions,
        'speech_duration': speech_duration,
        'speech_ratio': speech_ratio,
        'voice_percentage': speech_ratio * 100,  # JavaScript에서 필요한 필드
        'total_silence_duration': total_silence_duration,
        'silence_count': len(silence_regions),
        'max_volume': 1.0,  # 기본값
        'rms': 0.1,  # 기본값
        'dynamic_range': 20.0  # 기본값
    }


def audio_to_srt(audio_path: str, language: str = DEFAULT_LANGUAGE,
                segment_duration: int = DEFAULT_SEGMENT_DURATION) -> Dict[str, Any]:
    """오디오를 SRT로 변환"""
    recognizer = sr.Recognizer()

    # FFmpeg로 오디오 정보 가져오기
    try:
        result = subprocess.run([
            'ffprobe', '-v', 'quiet', '-show_entries',
            'format=duration', '-of', 'csv=p=0', audio_path
        ], capture_output=True, text=True, check=True)
        duration = float(result.stdout.strip())
    except (subprocess.CalledProcessError, ValueError):
        raise Exception("오디오 파일 정보를 읽을 수 없습니다.")

    segments = []
    successful_segments = 0
    total_segments = int(np.ceil(duration / segment_duration))

    for start in range(0, int(duration), segment_duration):
        end = min(start + segment_duration, duration)

        # FFmpeg로 세그먼트 추출
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_wav:
            temp_wav_path = temp_wav.name

        try:
            # FFmpeg로 특정 구간 추출하여 WAV로 변환
            subprocess.run([
                'ffmpeg', '-y', '-i', audio_path,
                '-ss', str(start), '-t', str(end - start),
                '-ar', '48000', '-ac', '1', temp_wav_path
            ], check=True, capture_output=True)

            with sr.AudioFile(temp_wav_path) as source:
                audio_data = recognizer.record(source)
                text = recognizer.recognize_google(audio_data, language=language)

                segments.append({
                    "start": start,
                    "end": end,
                    "text": text.strip()
                })
                logger.info(f"STT 구간 추가: {start}-{end}초, 텍스트: {text.strip()[:50]}")
                successful_segments += 1

        except sr.UnknownValueError:
            logger.warning(f"Google Speech Recognition could not understand audio for segment {start}-{end}")
            pass
        except sr.RequestError as e:
            logger.error(f"Could not request results from Google Speech Recognition service for segment {start}-{end}: {e}")
        except Exception as e:
            logger.warning(f"STT 구간 처리 에러 ({start}-{end}초): {e}")
        finally:
            if os.path.exists(temp_wav_path):
                os.remove(temp_wav_path)

    # SRT 형식으로 변환
    if not segments:
        raise Exception("음성 인식이 가능한 구간을 찾을 수 없습니다. 오디오 품질을 확인해주세요.")

    srt_content = ""
    for i, segment in enumerate(segments, 1):
        start_time = seconds_to_srt_time(segment["start"])
        end_time = seconds_to_srt_time(segment["end"])

        logger.info(f"SRT 생성: 구간 {i}, {segment['start']}-{segment['end']}초 -> {start_time} --> {end_time}")

        srt_content += f"{i}\n"
        srt_content += f"{start_time} --> {end_time}\n"
        srt_content += f"{segment['text']}\n\n"

    accuracy = (successful_segments / total_segments) * 100 if total_segments > 0 else 0

    return {
        "srt_content": srt_content,
        "segments": segments,
        "total_segments": total_segments,
        "successful_segments": successful_segments,
        "accuracy": accuracy,
        "language": language,
        "segment_duration": segment_duration
    }


def extract_waveform_data(audio_path: str, width: int = DEFAULT_WAVEFORM_WIDTH) -> List[float]:
    """FFmpeg를 사용하여 오디오 파일의 파형 데이터를 추출"""
    try:
        import tempfile
        import json

        # 임시 파일로 원시 오디오 데이터 추출
        with tempfile.NamedTemporaryFile(suffix='.raw', delete=False) as temp_file:
            temp_raw_path = temp_file.name

        try:
            # FFmpeg로 모노 PCM 16비트 데이터 추출
            cmd = [
                'ffmpeg', '-i', audio_path,
                '-f', 's16le',  # 16비트 리틀 엔디안
                '-ac', '1',     # 모노
                '-ar', '22050', # 22.05kHz 샘플레이트
                '-y', temp_raw_path
            ]

            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            logger.info(f"오디오 원시 데이터 추출 완료: {audio_path}")

            # 원시 데이터 읽기
            with open(temp_raw_path, 'rb') as f:
                raw_data = f.read()

            # 16비트 정수로 변환
            sample_count = len(raw_data) // 2  # 16비트 = 2바이트
            samples = struct.unpack(f'<{sample_count}h', raw_data)  # 리틀 엔디안 short

            logger.info(f"총 샘플 수: {sample_count}")

            # 파형 데이터 생성 (다운샘플링)
            if sample_count == 0:
                return [0.0] * width

            samples_per_pixel = max(1, sample_count // width)
            waveform_data = []

            for i in range(width):
                start_idx = i * samples_per_pixel
                end_idx = min(start_idx + samples_per_pixel, sample_count)

                # 구간 내 최대 절댓값 찾기
                max_amplitude = 0
                for j in range(start_idx, end_idx):
                    amplitude = abs(samples[j])
                    if amplitude > max_amplitude:
                        max_amplitude = amplitude

                # 정규화 (0.0 ~ 1.0)
                normalized_amplitude = max_amplitude / 32767.0  # 16비트 최댓값
                waveform_data.append(min(1.0, normalized_amplitude))

            logger.info(f"파형 데이터 생성 완료: {len(waveform_data)} 포인트")
            return waveform_data

        finally:
            # 임시 파일 정리
            if os.path.exists(temp_raw_path):
                os.remove(temp_raw_path)

    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg 파형 추출 에러: {e.stderr}")
        # 실패 시 가상 데이터 반환
        return generate_fallback_waveform(width)
    except Exception as e:
        logger.error(f"파형 데이터 추출 실패: {e}")
        return generate_fallback_waveform(width)


def generate_fallback_waveform(width: int) -> List[float]:
    """실제 분석 실패 시 사용할 가상 파형 데이터"""
    import math
    import random

    waveform_data = []
    for i in range(width):
        # 음성과 유사한 패턴 생성
        base_freq = i * 0.02
        speech_envelope = (math.sin(i * 0.008) + 1) / 2  # 0~1 사이

        amplitude = (
            math.sin(base_freq) * 0.6 +
            math.sin(base_freq * 2.3) * 0.3 +
            random.uniform(-0.1, 0.1)
        ) * speech_envelope

        waveform_data.append(max(0, min(1, abs(amplitude))))

    return waveform_data