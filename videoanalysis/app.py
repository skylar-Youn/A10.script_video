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
import numpy as np
import subprocess
import tempfile
import speech_recognition as sr
import wave
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


@app.get("/favicon.ico")
async def favicon():
    """Favicon 요청 처리"""
    from fastapi.responses import Response
    return Response(status_code=204)


@app.post("/api/extract-audio")
async def extract_audio_from_video_api(request: dict = Body(...)):
    """영상 파일에서 음성을 분리하여 저장"""
    try:
        video_paths = request.get("files", [])
        output_format = request.get("format", "wav")  # wav, mp3, m4a

        results = []

        for video_path in video_paths:
            try:
                if not os.path.exists(video_path):
                    results.append({
                        "file": video_path,
                        "status": "error",
                        "error": "파일을 찾을 수 없습니다"
                    })
                    continue

                # 비디오 파일인지 확인
                video_ext = os.path.splitext(video_path)[1].lower()
                if video_ext not in ['.mp4', '.webm', '.avi', '.mov', '.mkv']:
                    results.append({
                        "file": video_path,
                        "status": "error",
                        "error": "지원되지 않는 비디오 형식입니다"
                    })
                    continue

                # 출력 파일 경로 생성
                base_name = os.path.splitext(os.path.basename(video_path))[0]
                output_dir = os.path.dirname(video_path)
                output_path = os.path.join(output_dir, f"{base_name}_extracted.{output_format}")

                # FFmpeg를 사용하여 음성 추출
                success = extract_audio_to_file(video_path, output_path, output_format)

                if success:
                    # 파일 정보 가져오기
                    file_size = os.path.getsize(output_path)
                    duration = get_media_duration(Path(output_path))

                    results.append({
                        "file": video_path,
                        "status": "success",
                        "data": {
                            "output_path": output_path,
                            "output_filename": os.path.basename(output_path),
                            "format": output_format,
                            "size_bytes": file_size,
                            "size_mb": round(file_size / (1024 * 1024), 2),
                            "duration": duration,
                            "duration_str": format_duration_str(duration) if duration else "알 수 없음"
                        }
                    })
                else:
                    results.append({
                        "file": video_path,
                        "status": "error",
                        "error": "음성 추출에 실패했습니다"
                    })

            except Exception as e:
                logger.exception(f"음성 추출 에러 - {video_path}: {e}")
                results.append({
                    "file": video_path,
                    "status": "error",
                    "error": str(e)
                })

        return {"results": results}

    except Exception as e:
        logger.exception(f"배치 음성 추출 에러: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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


@app.get("/api/file-content")
async def get_file_content(path: str = Query(...)):
    """파일 내용을 스트리밍으로 제공 (비디오/오디오 파일용)"""
    try:
        file_path = Path(path)

        # 보안 체크: 다운로드 디렉토리 내부 파일만 허용
        if not file_path.is_absolute():
            file_path = DOWNLOAD_DIR / file_path

        # 경로 검증
        try:
            file_path = file_path.resolve()
            DOWNLOAD_DIR.resolve()

            # 다운로드 디렉토리 하위인지 확인
            if not str(file_path).startswith(str(DOWNLOAD_DIR.resolve())):
                raise HTTPException(status_code=403, detail="접근 권한이 없습니다")
        except:
            raise HTTPException(status_code=403, detail="잘못된 파일 경로입니다")

        # 파일 존재 여부 확인
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")

        # MIME 타입 결정
        import mimetypes
        content_type, _ = mimetypes.guess_type(str(file_path))
        if not content_type:
            content_type = 'application/octet-stream'

        # 파일 스트리밍 응답
        from fastapi.responses import FileResponse

        # 비디오 파일의 경우 Range 요청을 지원하도록 설정
        response = FileResponse(
            path=str(file_path),
            media_type=content_type,
            filename=file_path.name
        )

        # CORS 헤더 추가 (필요한 경우)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"파일 제공 실패 - {path}: {e}")
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

                # 자막 구간 데이터를 data에 포함
                analysis_result["subtitles"] = subtitles

                results.append({
                    "file": file_path,
                    "status": "success",
                    "data": analysis_result
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

    # FFmpeg로 오디오 정보 가져오기
    try:
        result = subprocess.run([
            'ffprobe', '-v', 'quiet', '-show_entries',
            'format=duration', '-of', 'csv=p=0', audio_path
        ], capture_output=True, text=True, check=True)
        duration = float(result.stdout.strip())
    except (subprocess.CalledProcessError, ValueError):
        raise HTTPException(status_code=400, detail="오디오 파일 정보를 읽을 수 없습니다.")

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


def format_duration_str(seconds: float) -> str:
    """시간을 문자열로 포맷"""
    if not seconds or seconds < 0:
        return "0:00"

    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)

    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    else:
        return f"{minutes}:{secs:02d}"


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8002, reload=True)