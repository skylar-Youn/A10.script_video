#!/bin/bash

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  8001 포트 해제 및 Uvicorn 실행 스크립트${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# 1단계: VS Code 워크스페이스 설정에 8001 무시 규칙 추가
echo -e "${YELLOW}[1/5] VS Code 워크스페이스 설정에 8001 무시 규칙 추가...${NC}"
mkdir -p .vscode

cat > .vscode/settings.json <<'JSON'
{
  "remote.autoForwardPorts": false,
  "portsAttributes": {
    "8001": { "onAutoForward": "ignore" }
  }
}
JSON

echo -e "${GREEN}✓ 워크스페이스 설정 완료${NC}"
echo

# 2단계: VS Code 유저 전역 설정에도 동일 규칙 추가
echo -e "${YELLOW}[2/5] VS Code 유저 전역 설정에 8001 무시 규칙 추가...${NC}"
mkdir -p ~/.config/Code/User

# 기존 설정 백업
if [ -f ~/.config/Code/User/settings.json ]; then
    cp -a ~/.config/Code/User/settings.json{,.bak.$(date +%Y%m%d-%H%M%S)} 2>/dev/null || true
    echo -e "${GREEN}✓ 기존 설정 백업 완료${NC}"
fi

cat > ~/.config/Code/User/settings.json <<'JSON'
{
  "remote.autoForwardPorts": false,
  "portsAttributes": {
    "8001": { "onAutoForward": "ignore" }
  }
}
JSON

echo -e "${GREEN}✓ 유저 전역 설정 완료${NC}"
echo

# 3단계: 모든 VS Code 프로세스 종료
echo -e "${YELLOW}[3/5] 모든 VS Code 프로세스 종료...${NC}"
killall -9 code 2>/dev/null && echo -e "${GREEN}✓ VS Code 프로세스 종료됨${NC}" || echo -e "${GREEN}✓ 실행 중인 VS Code 프로세스 없음${NC}"
sleep 1
echo

# 4단계: 8001 포트 강제 해제
echo -e "${YELLOW}[4/5] 8001 포트 강제 해제...${NC}"

# 현재 점유 상황 확인
PROCESS_INFO=$(lsof -nP -i :8001 2>/dev/null)
if [ -n "$PROCESS_INFO" ]; then
    echo -e "${RED}현재 8001 포트 점유 상황:${NC}"
    echo "$PROCESS_INFO"
    echo

    # fuser로 강제 종료
    sudo fuser -k 8001/tcp 2>/dev/null && echo -e "${GREEN}✓ 포트 점유 프로세스 종료됨${NC}" || true
    sleep 1
fi

# 최종 확인
if lsof -nP -i :8001 >/dev/null 2>&1; then
    echo -e "${RED}⚠ 8001 포트가 여전히 점유되어 있습니다${NC}"
    lsof -nP -i :8001
    echo
    echo -e "${RED}수동으로 프로세스를 종료해주세요:${NC}"
    echo "  sudo kill -9 \$(lsof -t -i:8001)"
    exit 1
else
    echo -e "${GREEN}✅ 8001 포트 해제 완료!${NC}"
fi
echo

# 5단계: Uvicorn으로 앱 실행 (8001 포트 선점)
echo -e "${YELLOW}[5/5] Uvicorn 실행 (8001 포트 선점)...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ 모든 준비 완료! Uvicorn을 시작합니다...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo
echo -e "${YELLOW}접속 URL: ${GREEN}http://127.0.0.1:8001${NC}"
echo -e "${YELLOW}종료 방법: ${GREEN}Ctrl+C${NC}"
echo
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# 가상환경 활성화 (있는 경우)
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

# Uvicorn 실행
exec uvicorn web_app.app:app --host 127.0.0.1 --port 8011
