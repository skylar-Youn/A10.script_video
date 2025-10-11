"""
독립적인 유튜브 비디오 분석 도구
리팩토링된 메인 애플리케이션 파일
"""
import logging
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .config import BASE_DIR, TEMPLATES_DIR, STATIC_DIR, DOWNLOAD_DIR
from .routers import files, analysis, media

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 다운로드 디렉토리 생성
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# FastAPI 앱 초기화
app = FastAPI(
    title="유튜브 비디오 분석 도구",
    description="설계도에 따른 완전한 분석 도구 (리팩토링됨)",
    version="2.0.0"
)

# 정적 파일 및 템플릿 설정
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# 라우터 등록
app.include_router(files.router)
app.include_router(analysis.router)
app.include_router(media.router)


@app.get("/", response_class=HTMLResponse)
async def analysis_main_page(request: Request):
    """메인 분석 페이지"""
    return templates.TemplateResponse("analysis.html", {"request": request})


@app.get("/analysis", response_class=HTMLResponse)
async def analysis_page(request: Request):
    """분석 페이지 (메인과 동일)"""
    return templates.TemplateResponse("analysis.html", {"request": request})


@app.get("/favicon.ico")
async def favicon():
    """Favicon 요청 처리"""
    from fastapi.responses import Response
    return Response(status_code=204)


@app.get("/api/translator/projects")
async def get_translator_projects():
    """번역기 프로젝트 목록 반환"""
    try:
        # ai_shorts_maker.translator 모듈에서 프로젝트 목록 가져오기
        import sys
        from pathlib import Path

        # ai_shorts_maker 모듈 경로 추가
        ai_shorts_maker_path = Path.home() / "ws" / "youtubeanalysis" / "ai_shorts_maker"
        if str(ai_shorts_maker_path.parent) not in sys.path:
            sys.path.insert(0, str(ai_shorts_maker_path.parent))

        from ai_shorts_maker.translator import list_projects, translator_summary

        projects = list_projects()
        return [translator_summary(project) for project in projects]
    except Exception as e:
        logger.error(f"번역기 프로젝트 목록 조회 실패: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/translator/projects/{project_id}")
async def get_translator_project(project_id: str):
    """번역기 프로젝트 상세 정보 반환"""
    try:
        import sys
        from pathlib import Path

        # ai_shorts_maker 모듈 경로 추가
        ai_shorts_maker_path = Path.home() / "ws" / "youtubeanalysis" / "ai_shorts_maker"
        if str(ai_shorts_maker_path.parent) not in sys.path:
            sys.path.insert(0, str(ai_shorts_maker_path.parent))

        from ai_shorts_maker.translator import load_project

        project = load_project(project_id)
        # Pydantic 모델을 dict로 변환
        return project.model_dump()
    except FileNotFoundError:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"프로젝트를 찾을 수 없습니다: {project_id}")
    except Exception as e:
        logger.error(f"번역기 프로젝트 조회 실패: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/translator-audio-files")
async def get_translator_audio_files(project_id: str):
    """번역기 프로젝트의 audio 폴더 파일 목록 반환"""
    import os
    from pathlib import Path

    # 프로젝트 audio 폴더 경로
    audio_dir = Path.home() / "ws" / "youtubeanalysis" / "ai_shorts_maker" / "outputs" / "translator_projects" / project_id / "audio"

    if not audio_dir.exists():
        return []

    files = []
    for file_path in audio_dir.glob("*"):
        if file_path.is_file() and file_path.suffix in ['.wav', '.mp3', '.m4a', '.ogg']:
            stat = file_path.stat()
            files.append({
                "name": file_path.name,
                "path": str(file_path),
                "size": f"{stat.st_size / 1024 / 1024:.2f} MB"
            })

    return files


@app.get("/api/translator-audio/{project_id}/{filename}")
async def get_translator_audio_file(project_id: str, filename: str):
    """번역기 프로젝트의 음성 파일 제공"""
    from fastapi.responses import FileResponse
    from pathlib import Path

    # 파일 경로
    audio_file = Path.home() / "ws" / "youtubeanalysis" / "ai_shorts_maker" / "outputs" / "translator_projects" / project_id / "audio" / filename

    if not audio_file.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(audio_file)


@app.post("/api/track-projects")
async def save_track_project(request: Request):
    """현재 트랙 구성을 프로젝트로 저장"""
    from pathlib import Path
    from datetime import datetime
    from fastapi import HTTPException
    import json
    import re

    data = await request.json()

    name = str(data.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="프로젝트 이름을 입력하세요.")

    created_at = data.get("created_at") or datetime.utcnow().isoformat()

    # 저장 경로 설정
    base_output_dir = Path.home() / "ws" / "youtubeanalysis" / "output" / "track_projects"
    base_output_dir.mkdir(parents=True, exist_ok=True)

    # 파일명 안전하게 변환
    safe_token = re.sub(r"[^0-9A-Za-z가-힣-_]+", "_", name)
    safe_token = safe_token.strip("_") or "track_project"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_name = f"{safe_token}_{timestamp}"

    project_payload = {
        "name": name,
        "base_name": base_name,
        "created_at": created_at,
        "video_path": data.get("video_path"),
        "audio_path": data.get("audio_path"),
        "bgm_path": data.get("bgm_path"),
        "commentary_audio_path": data.get("commentary_audio_path"),
        "translator_project_id": data.get("translator_project_id"),
        "translator_project_title": data.get("translator_project_title"),
        "selected_files": data.get("selected_files", []),
        "track_states": data.get("track_states", {}),
        "snapshot": data.get("snapshot"),
        "subtitle_count": data.get("subtitle_count"),
        "notes": data.get("notes", {}),
        "saved_at": datetime.utcnow().isoformat()
    }

    output_path = base_output_dir / f"{base_name}.json"

    with output_path.open("w", encoding="utf-8") as file:
        json.dump(project_payload, file, ensure_ascii=False, indent=2)

    logger.info("트랙 프로젝트 저장 완료: %s", output_path)

    return {
        "detail": "트랙 프로젝트 저장 완료",
        "base_name": base_name,
        "file": str(output_path)
    }


@app.get("/api/track-projects")
async def list_track_projects():
    """저장된 트랙 프로젝트 목록 반환"""
    from pathlib import Path
    from datetime import datetime
    import json

    base_output_dir = Path.home() / "ws" / "youtubeanalysis" / "output" / "track_projects"

    if not base_output_dir.exists():
        return []

    entries = []

    for json_file in sorted(base_output_dir.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            with json_file.open('r', encoding='utf-8') as file:
                data = json.load(file)
        except Exception as exc:  # pylint: disable=broad-except
            logger.error("저장된 트랙 프로젝트 로드 실패: %s (%s)", json_file, exc)
            continue

        data.setdefault('base_name', json_file.stem)
        data.setdefault('file', str(json_file))
        data.setdefault('saved_at', datetime.fromtimestamp(json_file.stat().st_mtime).isoformat())
        entries.append(data)

    return entries


@app.post("/api/create-output-video")
async def create_output_video(request: Request):
    """체크된 트랙을 합성하여 영상 파일 생성"""
    import subprocess
    from pathlib import Path
    from datetime import datetime
    from fastapi import HTTPException

    from urllib.parse import unquote

    data = await request.json()

    video_enabled = data.get("video_enabled", False)
    audio_enabled = data.get("audio_enabled", False)
    commentary_enabled = data.get("commentary_enabled", False)
    main_subtitle_enabled = data.get("main_subtitle_enabled", False)
    translation_subtitle_enabled = data.get("translation_subtitle_enabled", False)

    video_files = data.get("video_files", [])
    audio_files = data.get("audio_files", [])
    subtitle_data = data.get("subtitle_data", [])
    output_title = data.get("output_title", "")  # 제목 받기
    file_titles = data.get("file_titles", [])  # 개별 파일 제목 목록 받기

    # 출력 파일 경로 생성
    output_dir = Path.home() / "ws" / "youtubeanalysis" / "output" / "videos"
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = output_dir / f"output_{timestamp}.mp4"

    # FFmpeg 명령어 구성
    ffmpeg_cmd = ["ffmpeg", "-y"]

    # 입력 파일 추가
    input_count = 0
    filter_complex_parts = []

    # 영상 입력
    if video_enabled and video_files:
        ffmpeg_cmd.extend(["-i", video_files[0]])
        video_input = f"[0:v]"
        input_count += 1

    # 메인 음성 입력
    main_audio_input = None
    if audio_enabled and audio_files:
        for audio_file in audio_files:
            if audio_file.get("type") == "main":
                # URL에서 실제 파일 경로 추출
                audio_path = audio_file.get("path")
                if audio_path.startswith("/api/"):
                    # API 경로에서 실제 파일 경로 추출
                    continue
                ffmpeg_cmd.extend(["-i", audio_path])
                main_audio_input = f"[{input_count}:a]"
                input_count += 1
                break

    # 해설 음성 입력
    commentary_audio_input = None
    if commentary_enabled and audio_files:
        for audio_file in audio_files:
            if audio_file.get("type") == "commentary":
                audio_path = audio_file.get("path")

                # HTTP URL을 로컬 파일 경로로 변환
                if "api/translator-audio/" in audio_path:
                    # HTTP URL 또는 상대 경로 모두 처리
                    parts = audio_path.split("/")
                    # translator-audio 다음 2개 부분이 project_id와 filename
                    try:
                        translator_index = parts.index("translator-audio")
                        project_id = unquote(parts[translator_index + 1])
                        filename = unquote(parts[translator_index + 2])
                        audio_path = str(Path.home() / "ws" / "youtubeanalysis" / "ai_shorts_maker" / "outputs" / "translator_projects" / project_id / "audio" / filename)
                    except (ValueError, IndexError) as e:
                        logger.error(f"Failed to parse translator audio path: {audio_path}, error: {e}")
                        continue

                ffmpeg_cmd.extend(["-i", audio_path])
                commentary_audio_input = f"[{input_count}:a]"
                input_count += 1
                break

    # 오디오 믹싱
    if main_audio_input and commentary_audio_input:
        filter_complex_parts.append(f"{main_audio_input}{commentary_audio_input}amix=inputs=2:duration=longest[aout]")
        audio_map = "[aout]"
    elif main_audio_input:
        audio_map = main_audio_input
    elif commentary_audio_input:
        audio_map = commentary_audio_input
    else:
        audio_map = None

    # filter_complex 적용
    if filter_complex_parts:
        ffmpeg_cmd.extend(["-filter_complex", ";".join(filter_complex_parts)])

    # 출력 매핑
    if video_enabled and video_files:
        ffmpeg_cmd.extend(["-map", "0:v"])

    if audio_map:
        ffmpeg_cmd.extend(["-map", audio_map])

    # 코덱 설정
    # AV1 코덱을 디코딩할 수 없는 경우를 위해 비디오는 복사 모드 사용
    if video_enabled and video_files:
        ffmpeg_cmd.extend(["-c:v", "copy"])

    if audio_map:
        ffmpeg_cmd.extend(["-c:a", "aac", "-b:a", "192k"])

    # 출력 파일
    ffmpeg_cmd.append(str(output_file))

    logger.info(f"FFmpeg command: {' '.join(ffmpeg_cmd)}")

    # FFmpeg 실행
    try:
        result = subprocess.run(
            ffmpeg_cmd,
            capture_output=True,
            text=True,
            timeout=600  # 10분 타임아웃 (300초 -> 600초)
        )

        if result.returncode != 0:
            logger.error(f"FFmpeg error: {result.stderr}")
            raise HTTPException(status_code=500, detail=f"FFmpeg failed: {result.stderr}")

        # 제목을 메타데이터 JSON 파일로 저장
        if output_title or file_titles:
            import json
            metadata_file = output_file.with_suffix('.json')
            metadata = {
                "title": output_title,
                "file_titles": file_titles,  # 개별 파일 제목 목록
                "file_count": len(file_titles) if file_titles else 0,
                "created_at": datetime.now().isoformat(),
                "video_path": str(output_file),
                "video_files": video_files,
                "audio_files": [af.get("path") for af in audio_files if af.get("path")],
                "tracks": {
                    "video": video_enabled,
                    "audio": audio_enabled,
                    "commentary": commentary_enabled,
                    "main_subtitle": main_subtitle_enabled,
                    "translation_subtitle": translation_subtitle_enabled,
                    "description_subtitle": data.get("description_subtitle_enabled", False)
                }
            }

            with metadata_file.open("w", encoding="utf-8") as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2)

            logger.info(f"영상 메타데이터 저장 완료: {metadata_file}")

        return {"output_path": str(output_file), "message": "영상 생성 완료", "title": output_title, "file_titles": file_titles}

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="영상 생성 시간 초과 (10분 제한). 영상이 너무 길거나 복잡할 수 있습니다.")
    except Exception as e:
        logger.error(f"영상 생성 실패: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/output-videos")
async def get_output_videos():
    """저장된 출력 영상 목록과 메타데이터 반환"""
    from pathlib import Path
    import json
    from datetime import datetime

    output_dir = Path.home() / "ws" / "youtubeanalysis" / "output" / "videos"

    if not output_dir.exists():
        return []

    videos = []

    # 모든 JSON 메타데이터 파일 찾기
    for json_file in sorted(output_dir.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            with json_file.open('r', encoding='utf-8') as f:
                metadata = json.load(f)

            # 해당 영상 파일이 존재하는지 확인
            video_path = Path(metadata.get("video_path", ""))
            if video_path.exists():
                videos.append({
                    "title": metadata.get("title", "제목 없음"),
                    "file_titles": metadata.get("file_titles", []),
                    "file_count": metadata.get("file_count", 0),
                    "video_path": str(video_path),
                    "created_at": metadata.get("created_at", ""),
                    "filename": video_path.name,
                    "metadata_file": str(json_file)
                })
        except Exception as e:
            logger.error(f"메타데이터 로드 실패: {json_file}, {e}")
            continue

    return videos


@app.post("/api/add-title-to-subtitle")
async def add_title_to_subtitle(request: Request):
    """저장된 영상 제목을 자막으로 추가"""
    from pathlib import Path
    import json

    data = await request.json()
    metadata_file = data.get("metadata_file")
    track_type = data.get("track_type", "main")  # main, translation, description 중 선택

    if not metadata_file:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="메타데이터 파일 경로가 필요합니다")

    try:
        metadata_path = Path(metadata_file)
        if not metadata_path.exists():
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="메타데이터 파일을 찾을 수 없습니다")

        with metadata_path.open('r', encoding='utf-8') as f:
            metadata = json.load(f)

        title = metadata.get("title", "")

        # 자막 형식으로 반환 (00:00:00 시작, 5초 표시)
        subtitle_entry = {
            "index": 1,
            "start": "00:00:00,000",
            "end": "00:00:05,000",
            "text": title,
            "track": track_type
        }

        return {
            "success": True,
            "title": title,
            "subtitle": subtitle_entry
        }

    except Exception as e:
        logger.error(f"제목 자막 추가 실패: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/subtitle-presets")
async def save_subtitle_preset(request: Request):
    """자막 설정 저장"""
    from pathlib import Path
    import json
    from datetime import datetime

    data = await request.json()
    preset_name = data.get("name", "").strip()
    preset_data = data.get("preset", {})

    if not preset_name:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="설정 이름이 필요합니다")

    # 저장 경로
    presets_dir = Path.home() / "ws" / "youtubeanalysis" / "output" / "subtitle_presets"
    presets_dir.mkdir(parents=True, exist_ok=True)

    preset_file = presets_dir / f"{preset_name}.json"

    try:
        preset_payload = {
            "name": preset_name,
            "preset": preset_data,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }

        with preset_file.open("w", encoding="utf-8") as f:
            json.dump(preset_payload, f, ensure_ascii=False, indent=2)

        logger.info(f"자막 설정 저장 완료: {preset_file}")

        return {
            "success": True,
            "message": f"'{preset_name}' 설정이 저장되었습니다",
            "file": str(preset_file)
        }

    except Exception as e:
        logger.error(f"자막 설정 저장 실패: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/subtitle-presets")
async def list_subtitle_presets():
    """저장된 자막 설정 목록 반환"""
    from pathlib import Path
    import json

    presets_dir = Path.home() / "ws" / "youtubeanalysis" / "output" / "subtitle_presets"

    if not presets_dir.exists():
        return []

    presets = []

    for preset_file in sorted(presets_dir.glob('*.json'), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            with preset_file.open('r', encoding='utf-8') as f:
                preset_data = json.load(f)

            presets.append({
                "name": preset_data.get("name", preset_file.stem),
                "file": str(preset_file),
                "created_at": preset_data.get("created_at", ""),
                "updated_at": preset_data.get("updated_at", "")
            })

        except Exception as e:
            logger.error(f"자막 설정 로드 실패: {preset_file}, {e}")
            continue

    return presets


@app.get("/api/subtitle-presets/{preset_name}")
async def get_subtitle_preset(preset_name: str):
    """특정 자막 설정 반환"""
    from pathlib import Path
    import json

    presets_dir = Path.home() / "ws" / "youtubeanalysis" / "output" / "subtitle_presets"
    preset_file = presets_dir / f"{preset_name}.json"

    if not preset_file.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"설정을 찾을 수 없습니다: {preset_name}")

    try:
        with preset_file.open('r', encoding='utf-8') as f:
            preset_data = json.load(f)

        return preset_data

    except Exception as e:
        logger.error(f"자막 설정 로드 실패: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/subtitle-presets/{preset_name}")
async def delete_subtitle_preset(preset_name: str):
    """자막 설정 삭제"""
    from pathlib import Path

    presets_dir = Path.home() / "ws" / "youtubeanalysis" / "output" / "subtitle_presets"
    preset_file = presets_dir / f"{preset_name}.json"

    if not preset_file.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"설정을 찾을 수 없습니다: {preset_name}")

    try:
        preset_file.unlink()
        logger.info(f"자막 설정 삭제 완료: {preset_file}")

        return {
            "success": True,
            "message": f"'{preset_name}' 설정이 삭제되었습니다"
        }

    except Exception as e:
        logger.error(f"자막 설정 삭제 실패: {e}")
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8002, reload=True)
