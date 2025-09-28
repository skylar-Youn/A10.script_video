# A10.script_video



## Chrome DevTools 사용 가이드

### 개요
- Chrome DevTools는 웹 애플리케이션의 DOM, 스타일, 네트워크, 성능을 분석하고 디버깅할 수 있는 통합 개발 도구입니다.
- FastAPI/프론트엔드 개발 흐름에서 UI 오류, API 호출 상태, 렌더링 성능을 빠르게 진단할 수 있습니다.

### DevTools 열기
- 단축키: Windows/Linux `Ctrl+Shift+I`, macOS `Cmd+Option+I`
- 기능키: `F12`
- 마우스: 페이지 요소 우클릭 후 `검사`
- 새로운 창으로 열고 싶다면 DevTools 상단 메뉴에서 `Dock side`를 `Undock into separate window`로 변경하세요.

### 주요 패널 요약
- **Elements**: DOM 구조와 CSS를 실시간으로 확인·수정. 레이아웃 문제 디버깅에 사용.
- **Styles/Computed/Layout**: 선택한 요소의 스타일, 상속, 박스 모델을 확인하고 라이브 수정합니다.
- **Console**: 자바스크립트 실행, 로그 확인, 오류 추적. `console.log` 출력과 스택 트레이스를 확인할 때 사용합니다.
- **Network**: HTTP 요청/응답, 헤더, Payload, 타이밍 분석. API 호출 상태를 확인하고 재시도할 수 있습니다.
- **Sources**: JS/CSS 파일을 탐색하고 브레이크포인트를 설정해 실행 흐름을 단계별로 추적합니다.
- **Performance**: 렌더링·스크립트 실행 시간, FPS 분석. 느린 인터랙션의 병목을 찾을 때 활용합니다.
- **Application**: Local Storage, IndexedDB, Service Worker, 캐시 등 클라이언트 측 저장소를 점검합니다.
- **Lighthouse**: 성능/접근성/SEO 자동 리포트를 생성합니다.

### 실전 워크플로우 예시
1. `uvicorn keywordimagestory.app:app --reload --port 8000`으로 로컬 서버 실행 후 브라우저에서 페이지를 엽니다.
2. **레이아웃 수정**: Elements에서 문제 요소를 선택하고 Styles에서 CSS를 임시 수정합니다. 적용이 확인되면 실제 CSS 파일에 반영하세요.
3. **API 디버깅**: Network 패널에서 `/api/...` 요청을 선택해 Status, Headers, Response를 확인합니다. `Preserve log`를 켜면 페이지 새로고침 후에도 로그가 남습니다.
4. **콘솔 테스트**: Console에서 `fetch('/api/health')`처럼 간단한 코드를 실행해 API 응답을 점검합니다.
5. **성능 측정**: Performance 탭에서 `Record` 후 페이지 상호작용을 재현하고, 완료되면 분석해 긴 스크립트/레이아웃 작업을 찾습니다.
6. **브레이크포인트 디버깅**: Sources에서 JS 파일 라인 번호를 클릭해 브레이크포인트를 설정하고, 실행 흐름과 변수 상태를 확인합니다.

### 모바일 뷰 & 반응형 확인
- `Ctrl+Shift+M` (`Cmd+Shift+M`)으로 Device Toolbar를 열어 다양한 디바이스 해상도를 시뮬레이션합니다.
- 상단 드롭다운에서 원하는 기기(예: iPhone 12)를 선택하거나 커스텀 크기를 입력합니다.
- `Rotate` 아이콘으로 가로/세로를 전환해 레이아웃을 점검합니다.

### Network 패널 팁
- `Filter` 입력창에 `method:POST` 등 필터 표현식을 사용해 요청을 좁힙니다.
- `Disable cache` 옵션을 켜면 새로고침 시 브라우저 캐시를 무시합니다.
- `Copy as cURL`을 사용해 동일 요청을 터미널에서 재현할 수 있습니다.

### Console 사용 팁
- `console.table(data)`로 배열/객체를 표 형태로 출력합니다.
- `$0`, `$1` 단축 변수를 사용하면 Elements에서 최근 선택한 요소를 즉시 참조할 수 있습니다.
- `Ctrl+L` (`Cmd+K`)로 콘솔을 빠르게 초기화합니다.

### 단축키 모음
- 패널 간 이동: `Ctrl+]` / `Ctrl+[`
- 명령 메뉴: `Ctrl+Shift+P` (`Cmd+Shift+P`) → "screenshot", "coverage" 등 기능 검색
- 요소 검색: `Ctrl+F` → HTML/CSS 텍스트 검색
- 컬러 픽커: Styles에서 색상 값을 클릭하면 빠른 색상 선택기가 열립니다.

### 추가 참고
- DevTools 설정(`⋮` → `Settings`)에서 실험 기능을 활성화할 수 있습니다.
- 성능 측정을 정확히 하려면 시크릿 모드에서 광고·확장 프로그램 영향을 최소화하세요.
- 반복 작업은 Workspace 기능으로 로컬 파일 시스템을 연결해 직접 저장/자동 리로드할 수 있습니다.

codex resume 01997f03-edbd-71b0-bedd-835dc4ff3099
vim config.toml 
npm install -g chrome-devtools-mcp@latest
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/ChromeDebugData"
npm show chrome-devtools-mcp@latest

uvicorn keywordimagestory.app:app --reload --port 8000


lsof -ti :8000 | xargs kill -9

chrome-devtools-mcp.new_page 


 uvicorn keywordimagestory.app:app --reload --port 8000 chrome-devtools-mcp.new_page 로 열어봐

 http://127.0.0.1:8000/