from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from typing import List
import os
import shutil
import uuid
from backend.models.subtitle import SubtitleItem, TimelineProject, EditRequest, FullProjectData
from backend.utils.subtitle_parser import SubtitleParser
from backend.utils.video_processor import VideoProcessor

router = APIRouter(prefix="/api/editor", tags=["editor"])

# 업로드 디렉토리
UPLOAD_DIR = "/home/sk/ws/youtubeanalysis/10_vmaker/uploads"
OUTPUT_DIR = "/home/sk/ws/youtubeanalysis/10_vmaker/output"
TEMP_DIR = "/home/sk/ws/youtubeanalysis/10_vmaker/temp"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)


@router.post("/upload-video")
async def upload_video(file: UploadFile = File(...)):
    """비디오 파일 업로드"""
    try:
        # 고유 파일명 생성
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)

        # 파일 저장
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 비디오 정보 추출
        video_info = VideoProcessor.get_video_info(file_path)

        return {
            "success": True,
            "filename": unique_filename,
            "path": file_path,
            "info": video_info
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload-subtitle")
async def upload_subtitle(file: UploadFile = File(...)):
    """자막 파일 업로드 및 파싱"""
    try:
        # 파일 저장
        file_extension = os.path.splitext(file.filename)[1]
        if file_extension.lower() not in ['.srt']:
            raise HTTPException(status_code=400, detail="Only SRT files are supported")

        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 자막 파싱
        subtitles = SubtitleParser.parse_srt(file_path)

        return {
            "success": True,
            "filename": unique_filename,
            "path": file_path,
            "subtitles": [sub.dict() for sub in subtitles],
            "count": len(subtitles)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/render")
async def render_video(request: EditRequest):
    """선택된 자막 구간만으로 비디오 렌더링"""
    try:
        # 원본 비디오에서 자막 파싱
        subtitle_path = request.video_path.replace('.mp4', '.srt')
        if not os.path.exists(subtitle_path):
            # 자막 경로가 다를 수 있으므로 요청에서 찾기
            raise HTTPException(status_code=400, detail="Subtitle file not found")

        all_subtitles = SubtitleParser.parse_srt(subtitle_path)

        # 선택된 자막만 필터링
        selected_subtitles = [sub for sub in all_subtitles if sub.id in request.selected_ids]
        selected_subtitles.sort(key=lambda x: x.id)

        if not selected_subtitles:
            raise HTTPException(status_code=400, detail="No subtitles selected")

        # 임시 디렉토리 생성
        session_id = str(uuid.uuid4())
        session_temp_dir = os.path.join(TEMP_DIR, session_id)
        os.makedirs(session_temp_dir, exist_ok=True)

        # 비디오 분할
        clip_paths = VideoProcessor.split_video_by_subtitles(
            request.video_path,
            selected_subtitles,
            session_temp_dir
        )

        # 출력 파일명
        output_filename = f"edited_{uuid.uuid4()}.mp4"
        output_path = os.path.join(OUTPUT_DIR, output_filename)

        # 클립 병합
        VideoProcessor.merge_clips(clip_paths, output_path)

        # 임시 파일 정리
        shutil.rmtree(session_temp_dir)

        return {
            "success": True,
            "output_path": output_path,
            "filename": output_filename,
            "clip_count": len(clip_paths)
        }

    except Exception as e:
        # 에러 발생 시 임시 파일 정리
        if 'session_temp_dir' in locals() and os.path.exists(session_temp_dir):
            shutil.rmtree(session_temp_dir)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/{filename}")
async def download_video(filename: str):
    """렌더링된 비디오 다운로드"""
    file_path = os.path.join(OUTPUT_DIR, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        file_path,
        media_type="video/mp4",
        filename=filename
    )


@router.post("/parse-subtitle-from-path")
async def parse_subtitle_from_path(subtitle_path: str):
    """경로로부터 자막 파싱 (이미 업로드된 파일용)"""
    try:
        if not os.path.exists(subtitle_path):
            raise HTTPException(status_code=404, detail="Subtitle file not found")

        subtitles = SubtitleParser.parse_srt(subtitle_path)

        return {
            "success": True,
            "subtitles": [sub.dict() for sub in subtitles],
            "count": len(subtitles)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/render-full")
async def render_full_project(project: FullProjectData):
    """전체 프로젝트 데이터로 비디오 렌더링 (모든 효과 적용)"""
    try:
        # 비디오 파일 존재 확인
        if not os.path.exists(project.currentVideoPath):
            raise HTTPException(status_code=400, detail=f"Video file not found: {project.currentVideoPath}")

        # 임시 디렉토리 생성
        session_id = str(uuid.uuid4())
        session_temp_dir = os.path.join(TEMP_DIR, session_id)
        os.makedirs(session_temp_dir, exist_ok=True)

        # 타임라인 블록들을 시간순으로 정렬
        timeline_blocks = []

        # 자막 블록 추가 (selected가 true이거나 ID가 selectedIds에 있는 경우)
        for sub in project.subtitles:
            sub_id = sub.get('id')
            is_selected = sub.get('selected', False)
            in_selected_ids = sub_id in project.selectedIds if project.selectedIds else False

            if is_selected or in_selected_ids:
                timeline_blocks.append({
                    'type': 'subtitle',
                    'start': sub.get('start', 0),
                    'end': sub.get('end', 0),
                    'text': sub.get('text', ''),
                    'data': sub
                })

        # 공백 블록 추가 (체크박스가 선택된 경우만)
        for gap in project.gapBlocks:
            # gap 블록의 ID를 문자열 형식으로 확인 (예: "gap-1")
            gap_id = gap.get('id')
            gap_id_str = f"gap-{gap_id}" if gap_id is not None else None

            # selected 필드가 true이거나, selectedIds에 포함된 경우
            is_selected = gap.get('selected', False)
            in_selected_ids = gap_id_str in project.selectedIds if gap_id_str and project.selectedIds else False

            if is_selected or in_selected_ids:
                timeline_blocks.append({
                    'type': 'gap',
                    'start': gap.get('start', 0),
                    'end': gap.get('end', 0),
                    'data': gap
                })

        # 시간순 정렬
        timeline_blocks.sort(key=lambda x: x['start'])

        if not timeline_blocks:
            raise HTTPException(status_code=400, detail="No blocks selected for rendering")

        # 각 블록을 비디오 클립으로 추출
        import ffmpeg
        clip_paths = []

        for i, block in enumerate(timeline_blocks):
            start_time = block['start']
            end_time = block['end']
            duration = end_time - start_time

            if duration <= 0:
                continue

            clip_path = os.path.join(session_temp_dir, f"clip_{i:04d}.mp4")

            try:
                # 기본 비디오 추출
                stream = ffmpeg.input(project.currentVideoPath, ss=start_time, t=duration)

                # 비디오 스트림
                video = stream.video

                # 오디오 스트림 (원본 비디오 오디오 또는 배경 음악)
                audio_streams = []

                # 원본 비디오 오디오 추가
                if block['type'] == 'subtitle':
                    audio_streams.append(stream.audio)

                # 배경 음악이 있고 설정이 활성화된 경우
                if project.currentAudioPath and os.path.exists(project.currentAudioPath):
                    audio_settings = project.audioSettings or {}
                    if audio_settings.get('enabled', False):
                        # 배경 음악 추출 (같은 시간 구간)
                        bg_audio = ffmpeg.input(project.currentAudioPath, ss=start_time, t=duration)

                        # 볼륨 조정
                        volume = audio_settings.get('volume', 50) / 100.0
                        bg_audio = bg_audio.filter('volume', volume)

                        audio_streams.append(bg_audio)

                # 오디오 믹싱
                if len(audio_streams) > 1:
                    audio = ffmpeg.filter(audio_streams, 'amix', inputs=len(audio_streams), duration='shortest')
                elif len(audio_streams) == 1:
                    audio = audio_streams[0]
                else:
                    # 오디오가 없으면 무음 생성
                    audio = ffmpeg.input('anullsrc', f='lavfi', t=duration)

                # 출력
                output = ffmpeg.output(
                    video, audio, clip_path,
                    vcodec='libx264',
                    acodec='aac',
                    preset='ultrafast',
                    crf=23,
                    video_bitrate='2M',
                    audio_bitrate='128k'
                )

                output.overwrite_output().run(capture_stdout=True, capture_stderr=True, quiet=True)
                clip_paths.append(clip_path)

            except ffmpeg.Error as e:
                print(f"Error processing clip {i}: {e.stderr.decode() if e.stderr else str(e)}")
                raise HTTPException(status_code=500, detail=f"Failed to process clip {i}: {str(e)}")

        if not clip_paths:
            raise HTTPException(status_code=400, detail="No clips were generated")

        # 출력 파일명
        output_filename = f"rendered_{uuid.uuid4()}.mp4"
        output_path = os.path.join(OUTPUT_DIR, output_filename)

        # 클립 병합
        VideoProcessor.merge_clips(clip_paths, output_path)

        # 임시 파일 정리
        shutil.rmtree(session_temp_dir)

        return {
            "success": True,
            "output_path": output_path,
            "filename": output_filename,
            "clip_count": len(clip_paths),
            "duration": sum(b['end'] - b['start'] for b in timeline_blocks)
        }

    except HTTPException:
        # HTTPException은 그대로 전달
        if 'session_temp_dir' in locals() and os.path.exists(session_temp_dir):
            shutil.rmtree(session_temp_dir)
        raise
    except Exception as e:
        # 에러 발생 시 임시 파일 정리
        if 'session_temp_dir' in locals() and os.path.exists(session_temp_dir):
            shutil.rmtree(session_temp_dir)
        raise HTTPException(status_code=500, detail=f"Rendering error: {str(e)}")
