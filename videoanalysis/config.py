"""
VideoAnalysis 설정 파일
"""
from pathlib import Path

# 디렉토리 설정
BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
DOWNLOAD_DIR = Path("/home/sk/ws/youtubeanalysis/youtube/download")
SAVED_RESULTS_DIR = Path("/home/sk/ws/youtubeanalysis/youtube/saved_results")

# 분석 기본값
DEFAULT_SILENCE_THRESHOLD = 0.05
DEFAULT_MIN_GAP_DURATION = 0.15
DEFAULT_SEGMENT_DURATION = 5
DEFAULT_LANGUAGE = "ko-KR"
DEFAULT_WAVEFORM_WIDTH = 800

# 지원하는 파일 형식
VIDEO_EXTENSIONS = ['.mp4', '.webm', '.avi', '.mov', '.mkv']
AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.flac', '.aac']
SUBTITLE_EXTENSIONS = ['.srt', '.vtt', '.ass', '.ssa']

# FFmpeg 설정
FFMPEG_AUDIO_CODEC = 'pcm_s16le'
FFMPEG_SAMPLE_RATE = '48000'
FFMPEG_CHANNELS = '1'
