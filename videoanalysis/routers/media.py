"""
미디어 처리 관련 API 라우터
"""
import os
import logging
import subprocess
import tempfile
from fastapi import APIRouter, HTTPException, Body
from pathlib import Path

from ..services.audio_service import extract_audio_to_file
from ..utils.file_utils import get_media_duration
from ..utils.time_utils import format_duration_str

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["media"])


@router.post("/extract-audio")
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


@router.post("/cut-audio-ranges")
async def cut_audio_ranges_api(request: dict = Body(...)):
    """음성 파일에서 특정 시간 구간들을 무음으로 대체 (원본 길이 유지)"""
    try:
        audio_path = request.get("audio_path")
        time_ranges = request.get("time_ranges", [])

        if not audio_path:
            raise HTTPException(status_code=400, detail="audio_path is required")

        if not time_ranges:
            raise HTTPException(status_code=400, detail="time_ranges is required")

        if not os.path.exists(audio_path):
            raise HTTPException(status_code=404, detail=f"Audio file not found: {audio_path}")

        # 출력 파일 경로 생성 (_muted 접미사 추가)
        audio_path_obj = Path(audio_path)
        output_path = str(audio_path_obj.parent / f"{audio_path_obj.stem}_muted{audio_path_obj.suffix}")

        # FFmpeg 명령어 생성
        import subprocess
        import tempfile

        # 시간 구간을 정렬
        sorted_ranges = sorted(time_ranges, key=lambda x: x['start'])

        logger.info(f"Muting {len(sorted_ranges)} ranges from audio")
        logger.info(f"Time ranges to mute: {sorted_ranges}")

        # 원본 파일 길이 확인
        probe_input_cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            audio_path
        ]

        input_duration_result = subprocess.run(probe_input_cmd, capture_output=True, text=True)
        input_duration = float(input_duration_result.stdout.strip()) if input_duration_result.stdout.strip() else 0

        logger.info(f"Original audio duration: {input_duration}s")

        # volume 필터를 사용하되, 원본 전체를 처리하도록 명시
        # 각 구간마다 volume을 0으로 설정
        filter_parts = []
        for i, time_range in enumerate(sorted_ranges):
            start = time_range['start']
            end = time_range['end']
            # between 함수로 정확한 구간 지정 (시간 범위 내에서만 volume=0)
            filter_parts.append(f"volume=enable='between(t,{start},{end})':volume=0")

        # 필터를 순서대로 적용
        filter_complex = ','.join(filter_parts)

        logger.info(f"Filter chain: {filter_complex}")

        # 원본 파일 포맷 확인
        probe_format_cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'stream=codec_name',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            audio_path
        ]

        format_result = subprocess.run(probe_format_cmd, capture_output=True, text=True)
        original_codec = format_result.stdout.strip()

        logger.info(f"Original codec: {original_codec}")

        # 원본이 WAV(PCM)이면 WAV로, 아니면 AAC로 인코딩
        if 'pcm' in original_codec.lower() or audio_path.lower().endswith('.wav'):
            # WAV 출력
            cmd = [
                'ffmpeg', '-y',
                '-i', audio_path,
                '-af', filter_complex,
                '-t', str(input_duration),  # 원본 길이 유지
                '-c:a', 'pcm_s16le',  # WAV 포맷
                '-ar', '48000',
                output_path
            ]
        else:
            # AAC 출력
            cmd = [
                'ffmpeg', '-y',
                '-i', audio_path,
                '-af', filter_complex,
                '-t', str(input_duration),  # 원본 길이 유지
                '-c:a', 'aac',
                '-b:a', '256k',
                '-ar', '48000',
                '-ac', '2',
                output_path
            ]

        logger.info(f"Running FFmpeg command: {' '.join(cmd)}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5분 타임아웃
        )

        if result.returncode != 0:
            logger.error(f"FFmpeg error: {result.stderr}")
            raise HTTPException(
                status_code=500,
                detail=f"FFmpeg failed: {result.stderr[:500]}"
            )

        # 출력 파일 확인
        if not os.path.exists(output_path):
            raise HTTPException(
                status_code=500,
                detail="Output file was not created"
            )

        # 원본과 결과 파일의 길이 확인
        probe_duration_cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            output_path
        ]

        duration_result = subprocess.run(probe_duration_cmd, capture_output=True, text=True)
        output_duration = float(duration_result.stdout.strip()) if duration_result.stdout.strip() else 0

        # 원본 파일 길이도 확인
        probe_input_cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            audio_path
        ]

        input_duration_result = subprocess.run(probe_input_cmd, capture_output=True, text=True)
        input_duration = float(input_duration_result.stdout.strip()) if input_duration_result.stdout.strip() else 0

        logger.info(f"Original duration: {input_duration}s, Output duration: {output_duration}s")

        return {
            "status": "success",
            "input_path": audio_path,
            "output_path": output_path,
            "ranges_cut": len(time_ranges),
            "input_duration": input_duration,
            "output_duration": output_duration
        }

    except subprocess.TimeoutExpired:
        logger.error("FFmpeg timeout")
        raise HTTPException(status_code=500, detail="Processing timeout")
    except Exception as e:
        logger.exception(f"Audio cutting error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/separate-vocals")
async def separate_vocals_api(request: dict = Body(...)):
    """음성과 배경음악을 분리 (Demucs 사용)"""
    try:
        audio_path = request.get("audio_path")
        model = request.get("model", "htdemucs")  # htdemucs (기본), htdemucs_ft, mdx, mdx_extra

        if not audio_path:
            raise HTTPException(status_code=400, detail="audio_path is required")

        if not os.path.exists(audio_path):
            raise HTTPException(status_code=404, detail=f"Audio file not found: {audio_path}")

        # 출력 디렉토리 생성
        audio_path_obj = Path(audio_path)
        output_base_dir = audio_path_obj.parent / "separated"
        output_base_dir.mkdir(exist_ok=True)

        # Demucs 실행
        logger.info(f"Running Demucs on {audio_path} with model {model}")

        cmd = [
            "demucs",
            "--two-stems", "vocals",  # vocals와 no_vocals(배경음악) 2개 트랙만 분리
            "-n", model,
            "-o", str(output_base_dir),
            str(audio_path)
        ]

        logger.info(f"Demucs command: {' '.join(cmd)}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600  # 10분 타임아웃
        )

        if result.returncode != 0:
            logger.error(f"Demucs error: {result.stderr}")
            raise HTTPException(
                status_code=500,
                detail=f"Demucs failed: {result.stderr[:500]}"
            )

        # 출력 파일 경로 확인
        # Demucs는 output_dir/model_name/audio_filename/vocals.wav 형태로 저장
        audio_filename_stem = audio_path_obj.stem
        separated_dir = output_base_dir / model / audio_filename_stem

        vocals_path = separated_dir / "vocals.wav"
        accompaniment_path = separated_dir / "no_vocals.wav"

        if not vocals_path.exists():
            raise HTTPException(
                status_code=500,
                detail=f"Vocals file not found at {vocals_path}"
            )

        if not accompaniment_path.exists():
            raise HTTPException(
                status_code=500,
                detail=f"Accompaniment file not found at {accompaniment_path}"
            )

        # 파일 정보
        vocals_size = vocals_path.stat().st_size
        accompaniment_size = accompaniment_path.stat().st_size

        vocals_duration = get_media_duration(vocals_path)
        accompaniment_duration = get_media_duration(accompaniment_path)

        logger.info(f"Separation complete: vocals={vocals_path}, accompaniment={accompaniment_path}")

        return {
            "status": "success",
            "input_path": audio_path,
            "vocals": {
                "path": str(vocals_path),
                "filename": vocals_path.name,
                "size_bytes": vocals_size,
                "size_mb": round(vocals_size / (1024 * 1024), 2),
                "duration": vocals_duration,
                "duration_str": format_duration_str(vocals_duration) if vocals_duration else "알 수 없음"
            },
            "accompaniment": {
                "path": str(accompaniment_path),
                "filename": accompaniment_path.name,
                "size_bytes": accompaniment_size,
                "size_mb": round(accompaniment_size / (1024 * 1024), 2),
                "duration": accompaniment_duration,
                "duration_str": format_duration_str(accompaniment_duration) if accompaniment_duration else "알 수 없음"
            },
            "model_used": model
        }

    except subprocess.TimeoutExpired:
        logger.error("Demucs timeout")
        raise HTTPException(status_code=500, detail="Processing timeout (10 minutes)")
    except Exception as e:
        logger.exception(f"Vocal separation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))