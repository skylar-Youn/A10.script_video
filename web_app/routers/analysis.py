from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi import Request
import os
import json
import librosa
import numpy as np
from pydub import AudioSegment
import speech_recognition as sr
from pathlib import Path
import subprocess
import tempfile

router = APIRouter()
templates = Jinja2Templates(directory="templates")

DOWNLOAD_DIR = "/home/sk/ws/A10.script_video/youtube/download"

@router.get("/analysis", response_class=HTMLResponse)
async def analysis_page(request: Request):
    """분석 페이지 메인"""
    return templates.TemplateResponse("analysis.html", {"request": request})

@router.get("/api/analysis/files")
async def get_files():
    """다운로드된 파일 목록 반환"""
    try:
        files = []
        if os.path.exists(DOWNLOAD_DIR):
            for filename in os.listdir(DOWNLOAD_DIR):
                file_path = os.path.join(DOWNLOAD_DIR, filename)
                if os.path.isfile(file_path):
                    file_stat = os.stat(file_path)
                    file_ext = os.path.splitext(filename)[1].lower()

                    file_info = {
                        "name": filename,
                        "path": file_path,
                        "size": file_stat.st_size,
                        "modified": file_stat.st_mtime,
                        "type": get_file_type(file_ext),
                        "analyzable": is_analyzable(file_ext)
                    }
                    files.append(file_info)

        # 수정일 기준 내림차순 정렬
        files.sort(key=lambda x: x["modified"], reverse=True)
        return {"files": files}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def get_file_type(ext):
    """파일 확장자에 따른 타입 분류"""
    if ext in ['.mp4', '.webm', '.avi', '.mov']:
        return 'video'
    elif ext in ['.mp3', '.wav', '.m4a', '.flac']:
        return 'audio'
    elif ext in ['.srt', '.vtt', '.ass']:
        return 'subtitle'
    else:
        return 'other'

def is_analyzable(ext):
    """분석 가능한 파일인지 확인"""
    return ext in ['.mp4', '.webm', '.avi', '.mov', '.mp3', '.wav', '.m4a', '.flac', '.srt', '.vtt']

@router.post("/api/analysis/srt")
async def analyze_srt(file_path: str):
    """SRT 자막 파일 분석"""
    try:
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")

        subtitles = parse_srt_file(file_path)
        analysis = analyze_subtitle_timing(subtitles)

        return {
            "success": True,
            "analysis": analysis,
            "subtitles": subtitles[:10]  # 처음 10개만 미리보기
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/analysis/audio")
async def analyze_audio(file_path: str):
    """오디오 파일 분석"""
    try:
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")

        # 비디오 파일인 경우 오디오 추출
        temp_audio_path = None
        if file_path.endswith(('.mp4', '.webm', '.avi', '.mov')):
            temp_audio_path = extract_audio_from_video(file_path)
            audio_path = temp_audio_path
        else:
            audio_path = file_path

        analysis = analyze_audio_file(audio_path)

        # 임시 파일 정리
        if temp_audio_path and os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)

        return {
            "success": True,
            "analysis": analysis
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/analysis/speech-to-text")
async def speech_to_text(file_path: str, language: str = "ko-KR"):
    """음성을 텍스트로 변환하여 SRT 생성"""
    try:
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")

        # 비디오 파일인 경우 오디오 추출
        temp_audio_path = None
        if file_path.endswith(('.mp4', '.webm', '.avi', '.mov')):
            temp_audio_path = extract_audio_from_video(file_path)
            audio_path = temp_audio_path
        else:
            audio_path = file_path

        srt_content = audio_to_srt(audio_path, language)

        # SRT 파일 저장
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        srt_path = os.path.join(DOWNLOAD_DIR, f"{base_name}_generated.srt")

        with open(srt_path, 'w', encoding='utf-8') as f:
            f.write(srt_content)

        # 임시 파일 정리
        if temp_audio_path and os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)

        return {
            "success": True,
            "srt_path": srt_path,
            "srt_content": srt_content
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/analysis/batch")
async def batch_analysis(file_paths: list[str], analysis_types: list[str]):
    """배치 분석 실행"""
    try:
        results = []

        for file_path in file_paths:
            if not os.path.exists(file_path):
                results.append({
                    "file_path": file_path,
                    "error": "파일을 찾을 수 없습니다"
                })
                continue

            file_result = {"file_path": file_path, "analyses": {}}

            for analysis_type in analysis_types:
                try:
                    if analysis_type == "srt" and file_path.endswith('.srt'):
                        subtitles = parse_srt_file(file_path)
                        analysis = analyze_subtitle_timing(subtitles)
                        file_result["analyses"]["srt"] = analysis

                    elif analysis_type == "audio":
                        temp_audio_path = None
                        if file_path.endswith(('.mp4', '.webm', '.avi', '.mov')):
                            temp_audio_path = extract_audio_from_video(file_path)
                            audio_path = temp_audio_path
                        else:
                            audio_path = file_path

                        analysis = analyze_audio_file(audio_path)
                        file_result["analyses"]["audio"] = analysis

                        if temp_audio_path and os.path.exists(temp_audio_path):
                            os.remove(temp_audio_path)

                except Exception as e:
                    file_result["analyses"][analysis_type] = {"error": str(e)}

            results.append(file_result)

        return {
            "success": True,
            "results": results
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 헬퍼 함수들
def parse_srt_file(file_path):
    """SRT 파일 파싱"""
    subtitles = []
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read().strip()

    blocks = content.split('\n\n')
    for block in blocks:
        lines = block.strip().split('\n')
        if len(lines) >= 3:
            index = lines[0]
            time_line = lines[1]
            text = '\n'.join(lines[2:])

            # 시간 파싱
            start_time, end_time = time_line.split(' --> ')
            start_seconds = srt_time_to_seconds(start_time)
            end_seconds = srt_time_to_seconds(end_time)

            subtitles.append({
                "index": int(index),
                "start_time": start_seconds,
                "end_time": end_seconds,
                "text": text
            })

    return subtitles

def srt_time_to_seconds(time_str):
    """SRT 시간 형식을 초로 변환"""
    time_str = time_str.replace(',', '.')
    h, m, s = time_str.split(':')
    return int(h) * 3600 + int(m) * 60 + float(s)

def analyze_subtitle_timing(subtitles):
    """자막 타이밍 분석"""
    if not subtitles:
        return {"total_subtitles": 0, "gaps": [], "overlaps": []}

    gaps = []
    overlaps = []

    for i in range(len(subtitles) - 1):
        current = subtitles[i]
        next_sub = subtitles[i + 1]

        gap_time = next_sub["start_time"] - current["end_time"]

        if gap_time > 0.1:  # 갭 감지
            gaps.append({
                "after_subtitle": i + 1,
                "gap_duration": gap_time,
                "start_time": current["end_time"],
                "end_time": next_sub["start_time"]
            })
        elif gap_time < 0:  # 겹침 감지
            overlaps.append({
                "subtitle1": i + 1,
                "subtitle2": i + 2,
                "overlap_duration": -gap_time,
                "overlap_start": next_sub["start_time"],
                "overlap_end": current["end_time"]
            })

    total_duration = subtitles[-1]["end_time"] - subtitles[0]["start_time"]
    gap_percentage = (sum(gap["gap_duration"] for gap in gaps) / total_duration) * 100

    return {
        "total_subtitles": len(subtitles),
        "total_duration": total_duration,
        "gaps": gaps,
        "overlaps": overlaps,
        "gap_count": len(gaps),
        "overlap_count": len(overlaps),
        "gap_percentage": gap_percentage
    }

def extract_audio_from_video(video_path):
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

def analyze_audio_file(audio_path):
    """오디오 파일 분석"""
    # librosa로 오디오 로드
    y, sr = librosa.load(audio_path, sr=None)
    duration = len(y) / sr

    # 볼륨 분석
    max_volume = np.max(np.abs(y))
    rms = np.sqrt(np.mean(y**2))
    dynamic_range = 20 * np.log10(max_volume / (rms + 1e-8))

    # 무음 구간 감지
    silence_threshold = rms * 0.1
    silent_samples = np.abs(y) < silence_threshold

    # 연속 무음 구간 찾기
    silence_regions = []
    in_silence = False
    silence_start = 0

    for i, is_silent in enumerate(silent_samples):
        if is_silent and not in_silence:
            in_silence = True
            silence_start = i / sr
        elif not is_silent and in_silence:
            in_silence = False
            silence_duration = (i / sr) - silence_start
            if silence_duration > 0.2:  # 0.2초 이상의 무음만 기록
                silence_regions.append({
                    "start_time": silence_start,
                    "end_time": i / sr,
                    "duration": silence_duration
                })

    total_silence = sum(region["duration"] for region in silence_regions)
    silence_percentage = (total_silence / duration) * 100

    return {
        "duration": duration,
        "sample_rate": sr,
        "max_volume": float(max_volume),
        "rms": float(rms),
        "dynamic_range": float(dynamic_range),
        "silence_regions": silence_regions,
        "total_silence": total_silence,
        "silence_percentage": silence_percentage,
        "voice_percentage": 100 - silence_percentage
    }

def audio_to_srt(audio_path, language="ko-KR"):
    """오디오를 SRT로 변환"""
    recognizer = sr.Recognizer()

    # 오디오 로드 및 세그먼트 분할
    y, sr_rate = librosa.load(audio_path, sr=48000)
    duration = len(y) / sr_rate

    segment_duration = 5  # 5초 단위로 분할
    segments = []

    for start in range(0, int(duration), segment_duration):
        end = min(start + segment_duration, duration)
        start_sample = int(start * sr_rate)
        end_sample = int(end * sr_rate)

        segment_audio = y[start_sample:end_sample]

        # 임시 WAV 파일 생성
        temp_wav = tempfile.mktemp(suffix='.wav')
        import soundfile as sf
        sf.write(temp_wav, segment_audio, sr_rate)

        try:
            with sr.AudioFile(temp_wav) as source:
                audio_data = recognizer.record(source)
                text = recognizer.recognize_google(audio_data, language=language)

                segments.append({
                    "start": start,
                    "end": end,
                    "text": text
                })
        except:
            pass  # 인식 실패한 구간은 건너뛰기
        finally:
            if os.path.exists(temp_wav):
                os.remove(temp_wav)

    # SRT 형식으로 변환
    srt_content = ""
    for i, segment in enumerate(segments, 1):
        start_time = seconds_to_srt_time(segment["start"])
        end_time = seconds_to_srt_time(segment["end"])

        srt_content += f"{i}\n"
        srt_content += f"{start_time} --> {end_time}\n"
        srt_content += f"{segment['text']}\n\n"

    return srt_content

def seconds_to_srt_time(seconds):
    """초를 SRT 시간 형식으로 변환"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}".replace('.', ',')