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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8002, reload=True)