#!/bin/bash
# GStreamer 플러그인 설치 스크립트
# 비디오 재생에 필요한 코덱을 설치합니다

echo "🎬 9.PyMaker 비디오 코덱 설치"
echo "================================"
echo ""

# 1. 시스템 업데이트
echo "1️⃣ 시스템 패키지 목록 업데이트 중..."
sudo apt-get update

echo ""
echo "2️⃣ GStreamer 플러그인 설치 중..."
echo "   (비밀번호를 입력하세요)"
echo ""

# 2. GStreamer 플러그인 설치
sudo apt-get install -y \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-ugly \
    gstreamer1.0-libav \
    gstreamer1.0-tools \
    gstreamer1.0-x

echo ""
echo "3️⃣ 추가 멀티미디어 코덱 설치 중..."
sudo apt-get install -y \
    ubuntu-restricted-extras \
    ffmpeg

echo ""
echo "================================"
echo "✅ 설치 완료!"
echo ""
echo "📝 다음 단계:"
echo "   1. 터미널을 닫습니다"
echo "   2. 9.PyMaker를 다시 실행합니다:"
echo "      cd /home/sk/ws/youtubeanalysis/9_pymaker"
echo "      ./start.sh"
echo ""
echo "   3. 비디오 파일을 업로드하고 재생해보세요"
echo ""
