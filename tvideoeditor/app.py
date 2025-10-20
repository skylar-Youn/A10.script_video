"""
FastAPI Video Editor - 비디오 미리보기, 트랙, 자막 효과
Port: 8004
"""
from fastapi import FastAPI, Request, UploadFile, File, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from typing import Optional, List, Dict, Any
import json
import shutil
import uuid

# 앱 초기화
app = FastAPI(title="TVideoEditor", description="비디오 미리보기, 트랙, 자막 효과")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 디렉토리 설정
BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"
UPLOAD_DIR = BASE_DIR / "uploads"
PROJECTS_DIR = BASE_DIR / "projects"

# 디렉토리 생성
UPLOAD_DIR.mkdir(exist_ok=True)
PROJECTS_DIR.mkdir(exist_ok=True)

# Static files 및 Templates 설정
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    """메인 페이지"""
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/api/upload-video")
async def upload_video(file: UploadFile = File(...)):
    """비디오 파일 업로드"""
    try:
        # 파일 저장
        file_id = str(uuid.uuid4())
        file_ext = Path(file.filename).suffix
        file_path = UPLOAD_DIR / f"{file_id}{file_ext}"

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return JSONResponse({
            "success": True,
            "file_id": file_id,
            "filename": file.filename,
            "url": f"/uploads/{file_id}{file_ext}"
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/uploads/{filename}")
async def get_upload(filename: str):
    """업로드된 파일 제공"""
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)


@app.post("/api/projects/create")
async def create_project(data: Dict[str, Any]):
    """새 프로젝트 생성"""
    try:
        project_id = str(uuid.uuid4())
        project_dir = PROJECTS_DIR / project_id
        project_dir.mkdir(exist_ok=True)

        project_data = {
            "id": project_id,
            "name": data.get("name", "Untitled Project"),
            "created_at": str(Path(str(project_dir)).stat().st_ctime),
            "timeline": {
                "tracks": [],
                "duration": 0
            },
            "settings": {
                "width": 1920,
                "height": 1080,
                "fps": 30
            }
        }

        # 프로젝트 저장
        with open(project_dir / "project.json", "w") as f:
            json.dump(project_data, f, indent=2)

        return JSONResponse({"success": True, "project": project_data})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    """프로젝트 조회"""
    project_file = PROJECTS_DIR / project_id / "project.json"
    if not project_file.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    with open(project_file) as f:
        project_data = json.load(f)

    return JSONResponse(project_data)


@app.put("/api/projects/{project_id}")
async def update_project(project_id: str, data: Dict[str, Any]):
    """프로젝트 업데이트"""
    project_file = PROJECTS_DIR / project_id / "project.json"
    if not project_file.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    with open(project_file, "w") as f:
        json.dump(data, f, indent=2)

    return JSONResponse({"success": True, "project": data})


@app.get("/api/projects")
async def list_projects():
    """프로젝트 목록 조회"""
    projects = []
    for project_dir in PROJECTS_DIR.iterdir():
        if project_dir.is_dir():
            project_file = project_dir / "project.json"
            if project_file.exists():
                with open(project_file) as f:
                    projects.append(json.load(f))

    return JSONResponse({"projects": projects})


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    """프로젝트 삭제"""
    project_dir = PROJECTS_DIR / project_id
    if not project_dir.exists():
        raise HTTPException(status_code=404, detail="Project not found")

    shutil.rmtree(project_dir)
    return JSONResponse({"success": True})


@app.get("/health")
async def health_check():
    """헬스 체크"""
    return {"status": "ok", "service": "TVideoEditor", "port": 8004}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)
