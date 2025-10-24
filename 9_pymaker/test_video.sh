#!/bin/bash
# 비디오 플레이어 테스트 스크립트

echo "🔍 비디오 재생 환경 점검"
echo "================================"

# 1. GStreamer 확인
echo ""
echo "1️⃣ GStreamer 설치 확인:"
if command -v gst-launch-1.0 &> /dev/null; then
    echo "   ✅ GStreamer가 설치되어 있습니다"
    gst-launch-1.0 --version
else
    echo "   ❌ GStreamer가 설치되어 있지 않습니다"
    echo "   설치 방법: sudo apt-get install gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav"
fi

# 2. FFmpeg 확인
echo ""
echo "2️⃣ FFmpeg 설치 확인:"
if command -v ffmpeg &> /dev/null; then
    echo "   ✅ FFmpeg가 설치되어 있습니다"
    ffmpeg -version | head -1
else
    echo "   ❌ FFmpeg가 설치되어 있지 않습니다"
    echo "   설치 방법: sudo apt-get install ffmpeg"
fi

# 3. PyQt5 멀티미디어 확인
echo ""
echo "3️⃣ PyQt5 멀티미디어 모듈 확인:"
python3 -c "from PyQt5.QtMultimedia import QMediaPlayer; print('   ✅ PyQt5 멀티미디어 모듈 정상')" 2>/dev/null || echo "   ❌ PyQt5 멀티미디어 모듈 누락"

# 4. 백엔드 서버 확인
echo ""
echo "4️⃣ 백엔드 서버 확인:"
if curl -s http://localhost:8009/health &> /dev/null; then
    echo "   ✅ 백엔드 서버 실행 중 (포트 8009)"
else
    echo "   ❌ 백엔드 서버가 실행되지 않았습니다"
fi

echo ""
echo "================================"
echo "점검 완료!"
