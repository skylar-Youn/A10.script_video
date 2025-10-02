"""
미디어 처리 관련 API 라우터
"""
import os
import logging
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


@router.post("/preview-audio-mix")
async def preview_audio_mix_api(request: dict = Body(...)):
    """오디오 믹싱 미리듣기 - 임시 파일 생성하여 반환"""
    import subprocess
    import tempfile
    from fastapi.responses import FileResponse

    try:
        bgm_path = request.get("bgm_path")
        voice_path = request.get("voice_path")
        bgm_volume = request.get("bgm_volume", 0.3)
        voice_volume = request.get("voice_volume", 1.2)

        if not bgm_path or not voice_path:
            raise HTTPException(status_code=400, detail="bgm_path and voice_path are required")

        if not os.path.exists(bgm_path):
            raise HTTPException(status_code=404, detail=f"Background music file not found: {bgm_path}")

        if not os.path.exists(voice_path):
            raise HTTPException(status_code=404, detail=f"Voice file not found: {voice_path}")

        # 임시 출력 파일 생성
        temp_output = tempfile.NamedTemporaryFile(suffix='.mp3', delete=False)
        output_path = temp_output.name
        temp_output.close()

        logger.info(f"Creating audio preview: BGM={bgm_path}, Voice={voice_path}")
        logger.info(f"Volumes: BGM={bgm_volume}, Voice={voice_volume}")

        # FFmpeg 명령어 구성 (10초 미리보기)
        cmd = [
            'ffmpeg', '-y',
            '-t', '10',  # 처음 10초만
            '-i', bgm_path,
            '-t', '10',
            '-i', voice_path,
            '-filter_complex',
            f"[0:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume={bgm_volume}[bg];"
            f"[1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume={voice_volume}[voice];"
            f"[bg][voice]amix=inputs=2:duration=shortest:dropout_transition=2[aout]",
            '-map', '[aout]',
            '-c:a', 'libmp3lame',
            '-b:a', '192k',
            output_path
        ]

        logger.info(f"Running FFmpeg preview command: {' '.join(cmd)}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30  # 30초 타임아웃
        )

        if result.returncode != 0:
            logger.error(f"FFmpeg preview error: {result.stderr}")
            # 임시 파일 정리
            if os.path.exists(output_path):
                os.remove(output_path)
            raise HTTPException(
                status_code=500,
                detail=f"FFmpeg failed: {result.stderr[:500]}"
            )

        # 파일 존재 확인
        if not os.path.exists(output_path):
            raise HTTPException(
                status_code=500,
                detail="Preview file was not created"
            )

        logger.info(f"Preview created successfully: {output_path}")

        # 파일 응답 (다운로드 후 자동 삭제를 위해 background_task 사용)
        from fastapi import BackgroundTasks

        def cleanup_file(file_path: str):
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.info(f"Cleaned up preview file: {file_path}")
            except Exception as e:
                logger.error(f"Failed to cleanup preview file: {e}")

        return FileResponse(
            path=output_path,
            media_type='audio/mpeg',
            filename='preview.mp3',
            background=BackgroundTasks().add_task(cleanup_file, output_path)
        )

    except subprocess.TimeoutExpired:
        logger.error("FFmpeg preview timeout")
        raise HTTPException(status_code=500, detail="Preview generation timeout")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Audio preview error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze-audio-volumes")
async def analyze_audio_volumes_api(request: dict = Body(...)):
    """오디오 파일들의 볼륨을 분석하여 최적의 믹싱 비율 계산"""
    import subprocess
    import json

    try:
        bgm_path = request.get("bgm_path")
        voice_path = request.get("voice_path")

        if not bgm_path or not voice_path:
            raise HTTPException(status_code=400, detail="bgm_path and voice_path are required")

        if not os.path.exists(bgm_path):
            raise HTTPException(status_code=404, detail=f"Background music file not found: {bgm_path}")

        if not os.path.exists(voice_path):
            raise HTTPException(status_code=404, detail=f"Voice file not found: {voice_path}")

        logger.info(f"Analyzing audio volumes: BGM={bgm_path}, Voice={voice_path}")

        # FFmpeg volumedetect 필터로 평균/최대 볼륨 분석
        def analyze_volume(file_path):
            cmd = [
                'ffmpeg',
                '-i', file_path,
                '-af', 'volumedetect',
                '-f', 'null',
                '-'
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60
            )

            # 출력에서 볼륨 정보 추출
            output = result.stderr
            mean_volume = None
            max_volume = None

            for line in output.split('\n'):
                if 'mean_volume:' in line:
                    try:
                        mean_volume = float(line.split('mean_volume:')[1].split('dB')[0].strip())
                    except:
                        pass
                if 'max_volume:' in line:
                    try:
                        max_volume = float(line.split('max_volume:')[1].split('dB')[0].strip())
                    except:
                        pass

            return {
                'mean_volume': mean_volume,
                'max_volume': max_volume
            }

        # 각 파일 분석
        bgm_analysis = analyze_volume(bgm_path)
        voice_analysis = analyze_volume(voice_path)

        logger.info(f"BGM analysis: {bgm_analysis}")
        logger.info(f"Voice analysis: {voice_analysis}")

        # 최적 볼륨 계산
        # 목표: 배경음악은 -20dB ~ -15dB, 해설음성은 -6dB ~ -3dB
        bgm_target = -18  # dB
        voice_target = -5  # dB

        bgm_optimal = 1.0
        voice_optimal = 1.0

        if bgm_analysis['mean_volume'] is not None:
            # dB 차이를 볼륨 배율로 변환
            db_diff = bgm_target - bgm_analysis['mean_volume']
            bgm_optimal = 10 ** (db_diff / 20)
            # 0.1 ~ 0.8 범위로 제한
            bgm_optimal = max(0.1, min(0.8, bgm_optimal))

        if voice_analysis['mean_volume'] is not None:
            db_diff = voice_target - voice_analysis['mean_volume']
            voice_optimal = 10 ** (db_diff / 20)
            # 0.8 ~ 2.0 범위로 제한
            voice_optimal = max(0.8, min(2.0, voice_optimal))

        logger.info(f"Optimal volumes: BGM={bgm_optimal:.2f}, Voice={voice_optimal:.2f}")

        return {
            "status": "success",
            "bgm_analysis": bgm_analysis,
            "voice_analysis": voice_analysis,
            "recommended_volumes": {
                "bgm_volume": round(bgm_optimal, 2),
                "voice_volume": round(voice_optimal, 2),
                "bgm_percent": round(bgm_optimal * 100),
                "voice_percent": round(voice_optimal * 100)
            }
        }

    except subprocess.TimeoutExpired:
        logger.error("Volume analysis timeout")
        raise HTTPException(status_code=500, detail="Analysis timeout")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Volume analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))