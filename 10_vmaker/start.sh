#!/bin/bash

# VMaker 시작 스크립트

echo "🎬 VMaker - 자막 기반 비디오 편집기"
echo "===================================="

# 가상환경 확인
if [ ! -d "/home/sk/ws/youtubesound/.venv" ]; then
    echo "❌ 가상환경이 없습니다. 먼저 가상환경을 생성하세요."
    exit 1
fi

# 가상환경 활성화
source /home/sk/ws/youtubesound/.venv/bin/activate

# 의존성 설치
echo "📦 의존성 설치 중..."
pip install -q -r requirements.txt

# 디렉토리 생성
mkdir -p uploads output temp

# 백엔드 시작
echo "🚀 백엔드 서버 시작 중..."
echo "   API: http://localhost:8007"
echo "   Frontend: frontend/index.html 파일을 브라우저로 열어주세요"
echo ""
echo "종료하려면 Ctrl+C를 누르세요"
echo ""

cd /home/sk/ws/youtubeanalysis/10_vmaker
/home/sk/ws/youtubesound/.venv/bin/python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8007 --reload
