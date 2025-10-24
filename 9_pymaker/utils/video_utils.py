"""
비디오 처리 유틸리티
FFmpeg를 사용한 썸네일 추출 등
"""

import subprocess
import json
from pathlib import Path


def get_video_info(video_path):
    """
    비디오 정보 가져오기 (길이, 해상도 등)

    Args:
        video_path: 비디오 파일 경로

    Returns:
        dict: 비디오 정보 (duration, width, height, fps)
    """
    try:
        cmd = [
            'ffprobe',
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            str(video_path)
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            return None

        data = json.loads(result.stdout)

        # 비디오 스트림 찾기
        video_stream = None
        for stream in data.get('streams', []):
            if stream.get('codec_type') == 'video':
                video_stream = stream
                break

        if not video_stream:
            return None

        # 정보 추출
        duration = float(data.get('format', {}).get('duration', 0))
        width = int(video_stream.get('width', 0))
        height = int(video_stream.get('height', 0))

        # FPS 계산
        fps_str = video_stream.get('r_frame_rate', '30/1')
        if '/' in fps_str:
            num, den = fps_str.split('/')
            fps = float(num) / float(den)
        else:
            fps = float(fps_str)

        return {
            'duration': duration,
            'width': width,
            'height': height,
            'fps': fps
        }

    except Exception as e:
        print(f"비디오 정보 추출 실패: {e}")
        return None


def extract_thumbnail(video_path, output_path, timestamp=0, width=640):
    """
    비디오에서 썸네일 추출

    Args:
        video_path: 비디오 파일 경로
        output_path: 출력 이미지 경로
        timestamp: 추출할 시간 (초)
        width: 썸네일 너비 (비율 유지)

    Returns:
        bool: 성공 여부
    """
    try:
        cmd = [
            'ffmpeg',
            '-ss', str(timestamp),
            '-i', str(video_path),
            '-vframes', '1',
            '-vf', f'scale={width}:-1',
            '-y',
            str(output_path)
        ]

        result = subprocess.run(
            cmd,
            stdout=subprocess.DEVNULL,  # 출력 메시지 숨김
            stderr=subprocess.DEVNULL,  # 에러 메시지 숨김
            timeout=10
        )

        return result.returncode == 0 and Path(output_path).exists()

    except Exception as e:
        print(f"썸네일 추출 실패: {e}")
        return False


def extract_multiple_thumbnails(video_path, output_dir, count=10, width=320):
    """
    비디오에서 여러 썸네일 추출 (타임라인 프리뷰용)

    Args:
        video_path: 비디오 파일 경로
        output_dir: 출력 디렉토리
        count: 추출할 썸네일 개수
        width: 썸네일 너비

    Returns:
        list: 생성된 썸네일 파일 경로 리스트
    """
    # 비디오 정보 가져오기
    info = get_video_info(video_path)
    if not info:
        return []

    duration = info['duration']
    if duration <= 0:
        return []

    # 출력 디렉토리 생성
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # 균등하게 분포된 시간에서 썸네일 추출
    thumbnails = []
    interval = duration / (count + 1)

    for i in range(count):
        timestamp = interval * (i + 1)
        output_path = output_dir / f"thumb_{i:03d}.jpg"

        if extract_thumbnail(video_path, output_path, timestamp, width):
            thumbnails.append(str(output_path))

    return thumbnails


def convert_to_webm(input_path, output_path, quality='medium'):
    """
    비디오를 WebM 형식으로 변환 (VP9 코덱, Opus 오디오)
    WebEngine에서 재생 가능한 형식으로 변환

    Args:
        input_path: 입력 비디오 파일 경로
        output_path: 출력 WebM 파일 경로
        quality: 화질 ('high', 'medium', 'low')

    Returns:
        bool: 성공 여부
    """
    try:
        # 화질 설정
        quality_settings = {
            'high': {'crf': '30', 'cpu_used': '3'},    # 고화질
            'medium': {'crf': '35', 'cpu_used': '4'},  # 중간 화질 (빠름)
            'low': {'crf': '40', 'cpu_used': '5'}      # 저화질 (매우 빠름)
        }

        settings = quality_settings.get(quality, quality_settings['medium'])

        # FFmpeg 명령어 (빠른 인코딩)
        cmd = [
            'ffmpeg',
            '-i', str(input_path),
            '-c:v', 'libvpx-vp9',          # VP9 비디오 코덱
            '-crf', settings['crf'],        # 화질 (낮을수록 좋음, 0-63)
            '-b:v', '0',                    # VBR 모드
            '-cpu-used', settings['cpu_used'],  # 인코딩 속도 (0-5, 높을수록 빠름)
            '-deadline', 'realtime',        # 실시간 인코딩 모드 (빠름)
            '-row-mt', '1',                 # 멀티스레딩 활성화
            '-threads', '4',                # 스레드 수
            '-c:a', 'libopus',              # Opus 오디오 코덱
            '-b:a', '96k',                  # 오디오 비트레이트 (낮춤)
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',  # 짝수 해상도로 조정
            '-y',                           # 덮어쓰기
            str(output_path)
        ]

        print(f"🔄 WebM 변환 시작: {Path(input_path).name} → {Path(output_path).name}")

        # 변환 실행 (진행 상황 표시)
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=300  # 5분 타임아웃
        )

        if result.returncode == 0 and Path(output_path).exists():
            # 파일 크기 확인
            original_size = Path(input_path).stat().st_size / (1024 * 1024)
            converted_size = Path(output_path).stat().st_size / (1024 * 1024)
            print(f"✅ WebM 변환 완료: {original_size:.1f}MB → {converted_size:.1f}MB")
            return True
        else:
            error_msg = result.stderr.decode('utf-8', errors='ignore')
            print(f"❌ WebM 변환 실패: {error_msg[-200:]}")  # 마지막 200자만 표시
            return False

    except subprocess.TimeoutExpired:
        print(f"❌ WebM 변환 타임아웃 (5분 초과)")
        return False
    except Exception as e:
        print(f"❌ WebM 변환 중 오류: {e}")
        return False
