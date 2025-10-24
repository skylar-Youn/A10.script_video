#!/bin/bash
# 9.PyMaker 시작 스크립트

echo "🎬 9.PyMaker 시작 중..."

# 현재 디렉토리로 이동
cd "$(dirname "$0")"

# Python 경로 확인
if command -v python3 &> /dev/null; then
    PYTHON_CMD=python3
elif command -v python &> /dev/null; then
    PYTHON_CMD=python
else
    echo "❌ Python을 찾을 수 없습니다."
    exit 1
fi

echo "✅ Python: $PYTHON_CMD"

# 가상환경 활성화 (있는 경우)
if [ -f "../.venv/bin/activate" ]; then
    echo "✅ 가상환경 활성화..."
    source ../.venv/bin/activate
elif [ -f "venv/bin/activate" ]; then
    echo "✅ 가상환경 활성화..."
    source venv/bin/activate
fi

# 필요한 패키지 확인
echo "📦 패키지 확인 중..."
$PYTHON_CMD -c "import PyQt5" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  PyQt5가 설치되어 있지 않습니다."
    echo "설치 방법: pip install -r requirements.txt"
    exit 1
fi

$PYTHON_CMD -c "import fastapi" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  FastAPI가 설치되어 있지 않습니다."
    echo "설치 방법: pip install -r requirements.txt"
    exit 1
fi

# 애플리케이션 실행
echo "🚀 9.PyMaker 실행..."
$PYTHON_CMD main.py

echo "👋 9.PyMaker 종료됨"
