# Keyword Image Story Studio

Keyword Image Story Studio는 하나의 키워드나 이미지 묘사를 바탕으로 **유튜브 Shorts 대본, 이미지/영상 프롬프트, 스토리 구성 요소**를 자동 생성하고 편집·내보내기까지 지원하는 통합 제작 도구입니다. FastAPI 기반의 웹 UI와 CLI, 그리고 REST API를 제공하여 아이디어 구상부터 산출물 관리까지 전체 워크플로우를 한 번에 처리할 수 있습니다.

---

## 특징 한눈에 보기

- **원클릭 생성 파이프라인**: 키워드를 입력하면 제목 → 자막 → 이미지 프롬프트 → 영상 프롬프트 → 챕터 구성까지 순차 생성합니다.
- **실시간 편집 타임라인**: 자막·음성·이미지·영상 프롬프트를 동일한 축에서 확인하고, 클릭 한 번으로 상세 내용을 수정합니다.
- **프롬프트 관리**: 자동 생성된 프롬프트를 트랙별로 정렬하고, 추가/수정/삭제 및 수동 입력을 지원합니다.
- **템플릿 & 효과 패널**: 화면 레이아웃 템플릿, 텍스트/영상 효과를 즉시 적용하고 프리뷰를 확인합니다.
- **내보내기 및 이력 추적**: SRT, Markdown, JSON을 동시에 저장하고, 버전 히스토리를 자동 축적합니다.
- **오프라인 친화적**: OpenAI API가 없을 때도 결정적(Mock) 응답으로 동일한 흐름을 테스트할 수 있습니다.

---

## 시스템 요구 사항

- Python 3.11 이상
- `pip install -r requirements.txt`
- (선택) OpenAI API Key (`OPENAI_API_KEY` 환경 변수 또는 `.env`)
- (선택) Google Sheets 연동용 서비스 계정 키 (`GOOGLE_APPLICATION_CREDENTIALS`)

프로젝트 루트에서 다음을 실행해 의존성을 설치합니다.

```bash
pip install -r requirements.txt
```

`.env` 파일 예시:

```
OPENAI_API_KEY=sk-...
ENABLE_GOOGLE_SYNC=true
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
DEFAULT_LANGUAGE=ko
DEFAULT_STORY_DURATION=60
```

> `.env`는 `keywordimagestory/config.py`의 `Settings` 모델을 통해 로딩됩니다. 경로 계열 설정은 자동으로 절대경로로 변환됩니다.

---

## 디렉터리 구조

```
keywordimagestory/
  app.py               # FastAPI 진입점 및 REST 엔드포인트
  main.py              # CLI 워크플로우
  config.py            # 환경 설정 로딩 및 스냅샷 기능
  models.py            # Pydantic 기반 도메인 모델 (프로젝트, 자막, 프롬프트 등)
  prompts.py           # 프롬프트 템플릿 모음
  openai_client.py     # OpenAI 래퍼 및 Mock 동작
  generators/          # 제목/자막/씬 생성기
  services/            # 편집, 저장, 이력, 어셈블러 로직
  ui/templates/        # Jinja2 HTML 템플릿
  ui/static/           # 프런트엔드 JS/CSS (타임라인, 폼)
  outputs/             # 산출물 및 프로젝트 히스토리 저장소
```

---

## 핵심 컴포넌트 및 데이터 흐름

1. **GenerationContext** (`generators/base.py`)
   - 키워드, 언어, 영상 길이, 옵션을 캡슐화합니다.
2. **생성기(Generators)**
   - `KeywordTitleGenerator`: 키워드 기반 제목 리스트
   - `ImageTitleGenerator`: 이미지 설명 기반 제목 리스트
   - `ShortsScriptGenerator`: SRT 자막 + `[이미지 #]` 프롬프트 페어
   - `ShortsSceneGenerator`: `[씬 #]` 영상 프롬프트와 자막 구간
   - `StoryAssembler`: 조각을 정렬해 챕터를 구성
3. **서비스 레이어 (services/)**
   - `editor_service`: 프로젝트 생성, CRUD, 자동 정렬, 내보내기 담당
   - `save_manager`: SRT/Markdown/JSON 저장
   - `history_service`: `outputs/history.json` 기반 버전 이력 관리
4. **저장소**
   - 프로젝트별 산출물은 `outputs/<project_id>/`에 타임스탬프 파일로 저장됩니다.

데이터 흐름은 **키워드 입력 → 생성기 호출 → Pydantic 모델 → 저장/이력 기록 → UI 또는 CLI 출력** 순으로 진행됩니다.

---

## 실행 방법

### 1. FastAPI 웹 UI

```bash
uvicorn keywordimagestory.app:app --reload --port 8000
```

- 브라우저에서 `http://127.0.0.1:8000` 접속
- 키워드와 언어를 입력해 새 프로젝트를 생성
- 상단 명령 버튼으로 제목/자막/씬 재생성을 제어
- 타임라인과 사이드 패널에서 프롬프트를 편집

### 2. CLI 파이프라인

```bash
python -m keywordimagestory.main \
  --keyword "달빛 여행" \
  --language ko \
  --image-description "달빛 아래 달리는 빨간 밴" \
  --duration 60
```

주요 옵션

| 옵션 | 설명 |
| --- | --- |
| `--keyword` | 필수. 스토리 키워드 |
| `--language` | 기본값 `settings.default_language` |
| `--image-description` | 선택. 이미지 묘사 기반 제목 생성 |
| `--duration` | 프로젝트 총 길이(초) |
| `--skip-images` | 이미지 프롬프트 생성을 건너뜁니다 |
| `--skip-scenes` | 영상 프롬프트 생성을 건너뜁니다 |
| `--output` | JSON 요약을 저장할 경로 |

CLI 실행 결과는 표준 출력(JSON)과 `outputs/<project_id>/` 내 SRT/Markdown/JSON 파일로 저장됩니다.

### 3. REST API 요약

서버 실행 후 사용할 수 있는 대표 엔드포인트입니다.

| 메서드 & 경로 | 설명 |
| --- | --- |
| `POST /api/projects` | 새 프로젝트 생성 |
| `GET /api/projects/{id}` | 프로젝트 조회 |
| `POST /api/projects/{id}/generate/subtitles` | ShortsScriptGenerator 실행 (자막 + 이미지 프롬프트) |
| `POST /api/projects/{id}/generate/scenes` | ShortsSceneGenerator 실행 (영상 프롬프트) |
| `POST /api/projects/{id}/prompts/image` | 이미지 프롬프트 추가 |
| `PATCH /api/projects/{id}/prompts/image/{tag}` | 이미지 프롬프트 수정 |
| `DELETE /api/projects/{id}/prompts/image/{tag}` | 이미지 프롬프트 삭제 |
| `POST /api/projects/{id}/export` | SRT/Markdown/JSON 일괄 저장 |
| `POST /api/projects/{id}/align` | 자막/프롬프트를 균등 간격으로 자동 정렬 |

요청/응답 포맷은 `keywordimagestory/models.py`의 Pydantic 모델을 따릅니다.

---

## 웹 UI 워크플로우 가이드

1. **프로젝트 생성 패널**
   - 키워드와 언어를 입력하고 생성 버튼 클릭
   - 최근 사용 키워드는 `settings.max_recent_keywords`만큼 저장됩니다
2. **명령 버튼 그룹** (`ui/static/js/app.js`)
   - `제목 재생성`: 키워드 또는 이미지 설명 기반 제목 재생성
   - `자막 재생성`: ShortsScriptGenerator 재실행 후 이미지 프롬프트 갱신
   - `영상 프롬프트`: ShortsSceneGenerator 실행 및 씬 프롬프트 갱신
   - `AI 자동 정렬`: 프로젝트 길이에 맞춰 모든 트랙의 start/end 균등 분배
   - `내보내기`: SRT/Markdown/JSON를 저장하고 History 최신 버전을 만듭니다
3. **동시 편집 타임라인**
   - `자막`, `음성`, `이미지 프롬프트`, `영상 프롬프트`, `정렬 미리보기` 트랙으로 구성
   - 각 세그먼트를 클릭하면 우측 프롬프트 프리뷰에 세부 정보 표시
   - 드래그 대신 폼으로 start/end 값을 편집합니다
4. **템플릿 & 텍스트 효과 패널**
   - 템플릿 버튼 클릭 시 `TemplateSetting` 정보를 프로젝트에 저장
   - 슬라이더로 제목/자막 폰트 크기를 조정하고 `text-effect` 드롭다운으로 효과 적용
5. **이미지 프롬프트 폼**
   - 태그, 설명, 시작/종료 시간을 편집하여 트랙에 즉시 반영
   - 삭제 시 확인 다이얼로그가 뜹니다 (`confirmMessage`)
6. **히스토리 패널**
   - 내보내기 실행 시 `history_service`가 버전을 기록
   - `/api/history/{project_id}/{version}`로 특정 버전을 제거할 수 있습니다

---

## 산출물 및 데이터 저장소

| 항목 | 위치 | 설명 |
| --- | --- | --- |
| 프로젝트 스냅샷 | `outputs/<project_id>/<timestamp>-project.json` | StoryProject 직렬화 결과 |
| 자막(SRT) | `outputs/<project_id>/<timestamp>-subtitles.srt` | ShortsScriptGenerator 결과 |
| 이야기 Markdown | `outputs/<project_id>/<timestamp>-story.md` | 챕터 정렬 결과 |
| 프롬프트 JSON | `outputs/<project_id>/<timestamp>-prompts.json` | 이미지/영상 프롬프트 목록 |
| 히스토리 DB | `outputs/history.json` | 내보내기 이력 (`ProjectHistoryEntry`) |

`config.Settings.ensure_directories()`가 초기 실행 시 필요한 디렉터리를 자동 생성합니다.

---

## OpenAI & Mock 동작

- `openai_client.OpenAIClient`는 API 키와 SDK가 모두 준비된 경우 OpenAI Responses/Chat API를 호출합니다.
- 키가 없거나 오류가 발생하면 **결정적(Mock) 리스트/텍스트**를 반환하여 개발 환경에서도 동일한 흐름을 보장합니다.
- 모델 파라미터는 `gpt-4o-mini`, `temperature=0.8`, `max_tokens=512`(리스트)입니다. 필요 시 `openai_client.py`에서 수정할 수 있습니다.

---

## Google Sheets 연동 (선택)

- `.env`에 `ENABLE_GOOGLE_SYNC=true`, `GOOGLE_APPLICATION_CREDENTIALS=<path>`를 설정합니다.
- 서비스 계정 JSON 파일을 지정하면, 추후 `services` 레이어에서 Sheets 업로드 기능을 확장할 수 있습니다.
- 현재 저장 매니저는 로컬 파일을 기본으로 하지만, 설계 상 Google Sync 훅을 추가할 수 있도록 구성되어 있습니다.

---

## 커스터마이징 가이드

- **프롬프트 템플릿 수정**: `prompts.py`에서 텍스트를 변경하고, 필요 시 신규 템플릿을 추가한 뒤 생성기에서 참조합니다.
- **기본 지속시간 조정**: `.env`의 `DEFAULT_STORY_DURATION` 또는 `settings.default_story_duration` 속성을 수정합니다.
- **UI 확장**: `ui/static/js/app.js`에 있는 렌더링/이벤트 로직을 수정해 트랙 추가, 스타일 변경 등 커스텀을 적용합니다.
- **모델 필드 추가**: `models.py`의 Pydantic 모델을 확장한 뒤, 관련 서비스/저장 로직을 함께 업데이트합니다.

---

## 문제 해결 & 팁

- **OpenAI 호출 실패**: 네트워크 오류 시 Mock 모드로 전환되므로 로그(`logging`)를 확인하고 필요한 경우 API 키를 재설정하세요.
- **파일 경로 문제**: 설정된 `outputs_dir`가 존재하지 않으면 `ensure_directories()`가 자동 생성합니다. 사용자 지정 경로를 쓰고 싶다면 절대 경로를 `.env`에 입력하세요.
- **타임라인 데이터 누락**: `generate/subtitles` 호출이 성공해야 이미지 프롬프트가 생성됩니다. `--skip-images` 또는 UI의 `자막 재생성` 버튼 상태를 확인하세요.
- **히스토리 충돌**: `outputs/history.json`은 단순 JSON 배열입니다. 협업 시 Git으로 버전을 관리하거나 외부 DB로 마이그레이션을 고려하세요.

---

## 개발 메모

- 패키지는 `keywordimagestory` 모듈 하나로 배포할 수 있도록 구성돼 있습니다.
- 서비스 계층은 대부분 순수 Python이며, FastAPI 의존성 없이도 테스트 가능합니다.
- 현재 레포에는 자동화 테스트 스위트가 없으므로, 주요 서비스(`editor_service`, `save_manager`)에 대해 pytest 기반 단위 테스트를 추가하는 것을 권장합니다.
- 코드 스타일은 Pydantic + FastAPI 기본 구조를 따르며, 모든 직렬화는 UTF-8 및 `ensure_ascii=False`로 처리해 한글 호환성을 보장합니다.

---

## 로드맵 아이디어

- 이미지/영상 프롬프트 자동 시각화 (Stable Diffusion, Sora 등) 연동
- 오디오 파형 업로드 및 싱크 기반 편집 도구
- 협업 편집을 위한 다중 사용자 프로젝트 락/권한 시스템
- 히스토리 브라우저 UI와 버전 비교 뷰

Keyword Image Story Studio와 함께 짧은 시간에 쇼츠용 스토리 콘텐츠를 제작해 보세요!
