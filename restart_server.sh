#!/bin/bash
# youtubeanalysis 서버 재시작 스크립트

set -e

echo "🔄 기존 서버 종료 중..."
pkill -f "uvicorn.*youtubeanalysis" || true
pkill -f "uvicorn.*8001" || true
pkill -f "uvicorn.*8011" || true

echo "⏳ 2초 대기..."
sleep 2

echo "🚀 youtubeanalysis 서버 시작 중..."
cd /home/sk/ws/youtubeanalysis

# 가상환경 확인
if [ ! -d ".venv" ]; then
    echo "❌ 가상환경(.venv)을 찾을 수 없습니다!"
    exit 1
fi

# 서버 시작 (백그라운드)
echo "✅ 서버 시작: http://localhost:8001"
.venv/bin/uvicorn web_app.app:app --host 0.0.0.0 --port 8001 --reload

# 또는 포그라운드로 실행하려면 위 줄 대신 아래 줄 사용:
# nohup .venv/bin/uvicorn web_app.app:app --host 0.0.0.0 --port 8001 --reload > server.log 2>&1 &
# echo "✅ 서버가 백그라운드에서 시작되었습니다. 로그: server.log"
