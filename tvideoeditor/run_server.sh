#!/bin/bash

# TVideoEditor 서버 실행 스크립트 (Port 8004)

echo "🎬 TVideoEditor 서버를 시작합니다..."

# 프로젝트 디렉토리로 이동
cd "$(dirname "$0")"

# 8004 포트가 사용 중인지 확인
if lsof -Pi :8004 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  8004 포트가 이미 사용 중입니다. 프로세스를 종료합니다..."
    kill -9 $(lsof -t -i:8004)
    sleep 2
fi

# 가상환경 활성화 및 서버 실행
echo "🚀 서버를 8004 포트에서 실행합니다..."
/home/sk/ws/youtubesound/.venv/bin/python app.py
