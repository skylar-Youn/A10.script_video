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
                # subprocess로 FFmpeg 명령어 직접 실행
                import subprocess

                # 비디오 필터 구성
                video_filters = []

                # 1. 자막 텍스트 추가 (자막 블록인 경우)
                if block['type'] == 'subtitle' and block.get('text'):
                    subtitle_text = block['text'].replace("'", "'\\''").replace(":", "\\:")

                    # 자막 효과 설정
                    sub_effects = project.subtitleEffects or {}
                    font_size = sub_effects.get('fontSize', '1.5em').replace('em', '')
                    try:
                        font_size_px = int(float(font_size) * 24)
                    except:
                        font_size_px = 36

                    font_color = sub_effects.get('fontColor', '#ffffff').replace('#', '')
                    bg_color = sub_effects.get('bgColor', '#000000').replace('#', '')
                    bg_opacity = sub_effects.get('bgOpacity', 80) / 100.0

                    drawtext_filter = f"drawtext=text='{subtitle_text}':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:fontsize={font_size_px}:fontcolor={font_color}:x=(w-text_w)/2:y=h-th-20:box=1:boxcolor={bg_color}@{bg_opacity}:boxborderw=10"
                    video_filters.append(drawtext_filter)

                # 비디오 필터 문자열
                vf_string = ','.join(video_filters) if video_filters else None

                # 오디오 처리 - 원본 비디오에 오디오가 있는지 확인
                try:
                    probe = ffmpeg.probe(project.currentVideoPath)
                    has_audio = any(s['codec_type'] == 'audio' for s in probe['streams'])
                except:
                    has_audio = False

                # FFmpeg 명령어 구성
                cmd = [
                    'ffmpeg',
                    '-ss', str(start_time),
                    '-t', str(duration),
                    '-i', project.currentVideoPath
                ]

                # 오디오가 없으면 무음 추가 (input으로)
                if not has_audio or block['type'] != 'subtitle':
                    cmd.extend(['-f', 'lavfi', '-i', f'anullsrc=duration={duration}'])

                # 비디오 필터 추가
                if vf_string:
                    cmd.extend(['-vf', vf_string])

                # 오디오 매핑 및 코덱
                if has_audio and block['type'] == 'subtitle':
                    # 원본 오디오 사용
                    cmd.extend(['-map', '0:v', '-map', '0:a'])
                else:
                    # 무음 사용
                    cmd.extend(['-map', '0:v', '-map', '1:a', '-shortest'])

                # 출력 옵션
                cmd.extend([
                    '-c:v', 'libx264',
                    '-c:a', 'aac',
                    '-preset', 'ultrafast',
                    '-crf', '23',
                    '-b:v', '2M',
                    '-b:a', '128k',
                    '-y',  # 덮어쓰기
                    clip_path
                ])

                # FFmpeg 실행
                result = subprocess.run(cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    print(f"FFmpeg error for clip {i}: {result.stderr}")
                    raise Exception(f"FFmpeg failed: {result.stderr}")

                clip_paths.append(clip_path)

            except Exception as e:
                print(f"Error processing clip {i}: {str(e)}")
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
