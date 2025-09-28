"""
독립적인 유튜브 비디오 분석 도구
설계도에 따른 완전한 구현
"""
from fastapi import FastAPI, Request, HTTPException, Query, Body
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
import os
import json
import logging
from typing import List, Dict, Any, Optional
import librosa
import numpy as np
import subprocess
import tempfile
import speech_recognition as sr
import soundfile as sf
from datetime import datetime

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 디렉토리 설정
BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
DOWNLOAD_DIR = Path("/home/sk/ws/youtubeanalysis/youtube/download")

# FastAPI 앱 초기화
app = FastAPI(title="유튜브 비디오 분석 도구", description="설계도에 따른 완전한 분석 도구")

# 정적 파일 및 템플릿 설정
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# 다운로드 디렉토리 생성
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/", response_class=HTMLResponse)
async def analysis_main_page(request: Request):
    """메인 분석 페이지"""
    return templates.TemplateResponse("analysis.html", {"request": request})


@app.get("/api/files")
async def get_files(
    path: str = Query(str(DOWNLOAD_DIR), description="탐색할 폴더 경로"),
    filter_type: str = Query("all", description="파일 타입 필터")
):
    """분석 가능한 파일 목록 반환"""
    try:
        files = []
        base_path = Path(path)

        if not base_path.exists():
            return {"files": [], "total": 0, "error": "폴더를 찾을 수 없습니다"}

        for file_path in base_path.rglob("*"):
            if file_path.is_file():
                file_stat = file_path.stat()
                file_ext = file_path.suffix.lower()

                # 파일 타입 필터링
                file_type = get_file_type(file_ext)
                if filter_type != "all" and file_type != filter_type:
                    continue

                # 관련 파일 찾기
                related_files = find_related_files(file_path)

                file_info = {
                    "name": file_path.name,
                    "path": str(file_path),
                    "relative_path": str(file_path.relative_to(base_path)),
                    "size": file_stat.st_size,
                    "size_mb": round(file_stat.st_size / (1024 * 1024), 2),
                    "modified": file_stat.st_mtime,
                    "modified_str": datetime.fromtimestamp(file_stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                    "type": file_type,
                    "extension": file_ext,
                    "analyzable": is_analyzable(file_ext),
                    "related_files": related_files,
                    "duration": get_media_duration(file_path) if file_type in ['video', 'audio'] else None
                }
                files.append(file_info)

        # 수정일 기준 내림차순 정렬
        files.sort(key=lambda x: x["modified"], reverse=True)

        return {
            "files": files,
            "total": len(files),
            "folder": str(base_path),
            "filter": filter_type
        }

    except Exception as e:
        logger.exception(f"파일 목록 조회 에러: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/folder-tree")
async def get_folder_tree(path: str = Query(str(DOWNLOAD_DIR))):
    """폴더 구조를 트리 형태로 반환"""
    try:
        def build_tree(directory: Path, max_depth: int = 3, current_depth: int = 0):
            if current_depth >= max_depth:
                return None

            tree = {
                "name": directory.name or str(directory),
                "path": str(directory),
                "type": "folder",
                "children": [],
                "file_count": 0,
                "total_size": 0
            }

            try:
                items = list(directory.iterdir())
                files = [item for item in items if item.is_file()]
                folders = [item for item in items if item.is_dir()]

                # 파일 정보 계산
                tree["file_count"] = len(files)
                tree["total_size"] = sum(f.stat().st_size for f in files if f.exists())

                # 하위 폴더 추가
                for folder in sorted(folders):
                    subtree = build_tree(folder, max_depth, current_depth + 1)
                    if subtree:
                        tree["children"].append(subtree)
                        tree["file_count"] += subtree["file_count"]
                        tree["total_size"] += subtree["total_size"]

                # 파일 추가 (처음 10개만)
                for file_item in sorted(files)[:10]:
                    tree["children"].append({
                        "name": file_item.name,
                        "path": str(file_item),
                        "type": "file",
                        "size": file_item.stat().st_size,
                        "extension": file_item.suffix.lower(),
                        "file_type": get_file_type(file_item.suffix.lower())
                    })

            except PermissionError:
                tree["error"] = "접근 권한 없음"

            return tree

        return build_tree(Path(path))

    except Exception as e:
        logger.exception(f"폴더 트리 생성 에러: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analysis/audio")
async def analyze_audio(request: dict = Body(...)):
    """음성 파일 분석 - 무음 구간, 볼륨 등"""
    try:
        file_paths = request.get("files", [])
        options = request.get("options", {})

        silence_threshold = float(options.get("silence_threshold", 0.05))
        min_gap_duration = float(options.get("min_gap", 0.15))

        results = []

        for file_path in file_paths:
            try:
                if not os.path.exists(file_path):
                    results.append({
                        "file": file_path,
                        "status": "error",
                        "error": "파일을 찾을 수 없습니다"
                    })
                    continue

                # 비디오 파일인 경우 오디오 추출
                temp_audio_path = None
                if file_path.endswith(('.mp4', '.webm', '.avi', '.mov')):
                    temp_audio_path = extract_audio_from_video(file_path)
                    audio_path = temp_audio_path
                else:
                    audio_path = file_path

                analysis_result = analyze_audio_file(audio_path, silence_threshold, min_gap_duration)

                # 임시 파일 정리
                if temp_audio_path and os.path.exists(temp_audio_path):
                    os.remove(temp_audio_path)

                results.append({
                    "file": file_path,
                    "status": "success",
                    "data": analysis_result
                })

            except Exception as e:
                logger.exception(f"오디오 분석 에러 - {file_path}: {e}")
                results.append({
                    "file": file_path,
                    "status": "error",
                    "error": str(e)
                })

        return {"results": results}

    except Exception as e:
        logger.exception(f"배치 오디오 분석 에러: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analysis/subtitle")
async def analyze_subtitle(request: dict = Body(...)):
    """SRT 파일 분석 - 갭, 겹침, 타이밍"""
    try:
        file_paths = request.get("files", [])

        results = []

        for file_path in file_paths:
            try:
                if not os.path.exists(file_path):
                    results.append({
                        "file": file_path,
                        "status": "error",
                        "error": "파일을 찾을 수 없습니다"
                    })
                    continue

                if not file_path.endswith('.srt'):
                    results.append({
                        "file": file_path,
                        "status": "error",
                        "error": "SRT 파일이 아닙니다"
                    })
                    continue

                subtitles = parse_srt_file(file_path)
                analysis_result = analyze_subtitle_timing(subtitles)

                results.append({
                    "file": file_path,
                    "status": "success",
                    "data": analysis_result,
                    "subtitles": subtitles[:5]  # 처음 5개만 미리보기
                })

            except Exception as e:
                logger.exception(f"자막 분석 에러 - {file_path}: {e}")
                results.append({
                    "file": file_path,
                    "status": "error",
                    "error": str(e)
                })

        return {"results": results}

    except Exception as e:
        logger.exception(f"배치 자막 분석 에러: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analysis/stt")
async def speech_to_text(request: dict = Body(...)):
    """음성을 텍스트로 변환하여 SRT 생성"""
    try:
        file_paths = request.get("files", [])
        options = request.get("options", {})

        language = options.get("language", "ko-KR")
        segment_duration = int(options.get("segment_duration", 5))

        results = []

        for file_path in file_paths:
            try:
                if not os.path.exists(file_path):
                    results.append({
                        "file": file_path,
                        "status": "error",
                        "error": "파일을 찾을 수 없습니다"
                    })
                    continue

                # 비디오 파일인 경우 오디오 추출
                temp_audio_path = None
                if file_path.endswith(('.mp4', '.webm', '.avi', '.mov')):
                    temp_audio_path = extract_audio_from_video(file_path)
                    audio_path = temp_audio_path
                else:
                    audio_path = file_path

                srt_result = audio_to_srt(audio_path, language, segment_duration)

                # SRT 파일 저장
                base_name = os.path.splitext(os.path.basename(file_path))[0]
                srt_path = DOWNLOAD_DIR / f"{base_name}_generated.srt"

                with open(srt_path, 'w', encoding='utf-8') as f:
                    f.write(srt_result["srt_content"])

                # 임시 파일 정리
                if temp_audio_path and os.path.exists(temp_audio_path):
                    os.remove(temp_audio_path)

                results.append({
                    "file": file_path,
                    "status": "success",
                    "data": {
                        **srt_result,
                        "output_path": str(srt_path)
                    }
                })

            except Exception as e:
                logger.exception(f"STT 분석 에러 - {file_path}: {e}")
                results.append({
                    "file": file_path,
                    "status": "error",
                    "error": str(e)
                })

        return {"results": results}

    except Exception as e:
        logger.exception(f"배치 STT 분석 에러: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analysis/compare")
async def compare_subtitles(request: dict = Body(...)):
    """두 SRT 파일 비교 분석"""
    try:
        original_file = request.get("original_file")
        generated_file = request.get("generated_file")

        if not original_file or not generated_file:
            raise HTTPException(status_code=400, detail="두 파일 경로가 모두 필요합니다")

        if not os.path.exists(original_file) or not os.path.exists(generated_file):
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")

        original_subtitles = parse_srt_file(original_file)
        generated_subtitles = parse_srt_file(generated_file)

        original_analysis = analyze_subtitle_timing(original_subtitles)
        generated_analysis = analyze_subtitle_timing(generated_subtitles)

        comparison_result = {
            "original": {
                "file": original_file,
                "analysis": original_analysis,
                "subtitles": original_subtitles[:10]
            },
            "generated": {
                "file": generated_file,
                "analysis": generated_analysis,
                "subtitles": generated_subtitles[:10]
            },
            "comparison": {
                "subtitle_count_diff": len(generated_subtitles) - len(original_subtitles),
                "duration_diff": generated_analysis["total_duration"] - original_analysis["total_duration"],
                "quality_score": calculate_quality_score(original_analysis, generated_analysis)
            }
        }

        return {
            "status": "success",
            "data": comparison_result
        }

    except Exception as e:
        logger.exception(f"자막 비교 분석 에러: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# 헬퍼 함수들
def get_file_type(ext: str) -> str:
    """파일 확장자에 따른 타입 분류"""
    if ext in ['.mp4', '.webm', '.avi', '.mov', '.mkv']:
        return 'video'
    elif ext in ['.mp3', '.wav', '.m4a', '.flac', '.aac']:
        return 'audio'
    elif ext in ['.srt', '.vtt', '.ass', '.ssa']:
        return 'subtitle'
    else:
        return 'other'


def is_analyzable(ext: str) -> bool:
    """분석 가능한 파일인지 확인"""
    return ext in ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.mp3', '.wav', '.m4a', '.flac', '.aac', '.srt', '.vtt']


def find_related_files(file_path: Path) -> List[str]:
    """관련 파일 찾기 (같은 이름의 다른 확장자)"""
    related = []
    stem = file_path.stem
    parent = file_path.parent

    for related_file in parent.glob(f"{stem}.*"):
        if related_file != file_path:
            related.append(str(related_file))

    return related


def get_media_duration(file_path: Path) -> Optional[float]:
    """미디어 파일의 지속시간 반환"""
    try:
        cmd = ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', str(file_path)]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        return float(data['format']['duration'])
    except Exception:
        return None


def extract_audio_from_video(video_path: str) -> str:
    """비디오에서 오디오 추출"""
    temp_audio = tempfile.mktemp(suffix='.wav')

    cmd = [
        'ffmpeg', '-i', video_path,
        '-vn', '-acodec', 'pcm_s16le',
        '-ar', '48000', '-ac', '1',
        temp_audio, '-y'
    ]

    subprocess.run(cmd, capture_output=True, check=True)
    return temp_audio


def analyze_audio_file(audio_path: str, silence_threshold: float = 0.05, min_gap_duration: float = 0.15) -> Dict[str, Any]:
    """오디오 파일 상세 분석"""
    # librosa로 오디오 로드
    y, sr = librosa.load(audio_path, sr=None)
    duration = len(y) / sr

    # 볼륨 분석
    max_volume = np.max(np.abs(y))
    rms = np.sqrt(np.mean(y**2))
    dynamic_range = 20 * np.log10(max_volume / (rms + 1e-8)) if rms > 0 else 0

    # 무음 구간 감지 (개선된 방법)
    threshold = rms * silence_threshold if rms > 0 else 0.01
    silent_samples = np.abs(y) < threshold

    # 연속 무음 구간 찾기
    silence_regions = []
    in_silence = False
    silence_start = 0
    min_samples = int(min_gap_duration * sr)

    for i, is_silent in enumerate(silent_samples):
        if is_silent and not in_silence:
            in_silence = True
            silence_start = i
        elif not is_silent and in_silence:
            in_silence = False
            silence_duration_samples = i - silence_start
            if silence_duration_samples > min_samples:
                silence_regions.append({
                    "start_time": silence_start / sr,
                    "end_time": i / sr,
                    "duration": silence_duration_samples / sr
                })

    # 마지막 무음 구간 처리
    if in_silence and len(y) - silence_start > min_samples:
        silence_regions.append({
            "start_time": silence_start / sr,
            "end_time": len(y) / sr,
            "duration": (len(y) - silence_start) / sr
        })

    total_silence = sum(region["duration"] for region in silence_regions)
    silence_percentage = (total_silence / duration) * 100 if duration > 0 else 0

    # 스펙트럼 분석
    stft = librosa.stft(y)
    spectral_centroids = librosa.feature.spectral_centroid(S=np.abs(stft))[0]
    avg_spectral_centroid = np.mean(spectral_centroids)

    return {
        "duration": duration,
        "sample_rate": sr,
        "max_volume": float(max_volume),
        "rms": float(rms),
        "dynamic_range": float(dynamic_range),
        "silence_regions": silence_regions,
        "total_silence": total_silence,
        "silence_percentage": silence_percentage,
        "voice_percentage": 100 - silence_percentage,
        "spectral_centroid": float(avg_spectral_centroid),
        "silence_threshold_used": threshold,
        "analysis_timestamp": datetime.now().isoformat()
    }


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


def srt_time_to_seconds(time_str: str) -> float:
    """SRT 시간 형식을 초로 변환"""
    time_str = time_str.replace(',', '.')
    h, m, s = time_str.split(':')
    return int(h) * 3600 + int(m) * 60 + float(s)


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


def generate_subtitle_recommendations(gaps: List, overlaps: List, avg_duration: float, reading_speed: float) -> List[Dict[str, str]]:
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


def audio_to_srt(audio_path: str, language: str = "ko-KR", segment_duration: int = 5) -> Dict[str, Any]:
    """오디오를 SRT로 변환"""
    recognizer = sr.Recognizer()

    # 오디오 로드 및 세그먼트 분할
    y, sr_rate = librosa.load(audio_path, sr=48000)
    duration = len(y) / sr_rate

    segments = []
    successful_segments = 0
    total_segments = int(np.ceil(duration / segment_duration))

    for start in range(0, int(duration), segment_duration):
        end = min(start + segment_duration, duration)
        start_sample = int(start * sr_rate)
        end_sample = int(end * sr_rate)

        segment_audio = y[start_sample:end_sample]

        # 임시 WAV 파일 생성
        temp_wav = tempfile.mktemp(suffix='.wav')

        try:
            sf.write(temp_wav, segment_audio, sr_rate)

            with sr.AudioFile(temp_wav) as source:
                audio_data = recognizer.record(source)
                text = recognizer.recognize_google(audio_data, language=language)

                segments.append({
                    "start": start,
                    "end": end,
                    "text": text.strip()
                })
                successful_segments += 1

        except sr.UnknownValueError:
            logger.warning(f"Google Speech Recognition could not understand audio for segment {start}-{end}")
            pass
        except sr.RequestError as e:
            logger.error(f"Could not request results from Google Speech Recognition service for segment {start}-{end}: {e}")
        except Exception as e:
            logger.warning(f"STT 구간 처리 에러 ({start}-{end}초): {e}")
        finally:
            if os.path.exists(temp_wav):
                os.remove(temp_wav)

    # SRT 형식으로 변환
    if not segments:
        raise Exception("음성 인식이 가능한 구간을 찾을 수 없습니다. 오디오 품질을 확인해주세요.")

    srt_content = ""
    for i, segment in enumerate(segments, 1):
        start_time = seconds_to_srt_time(segment["start"])
        end_time = seconds_to_srt_time(segment["end"])

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


def seconds_to_srt_time(seconds: float) -> str:
    """초를 SRT 시간 형식으로 변환"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}".replace('.', ',')


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8002, reload=True)