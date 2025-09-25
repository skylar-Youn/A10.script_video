# Keyword Image Story Studio

키워드 또는 이미지 설명을 입력해서 스토리 제목, 쇼츠용 자막, 이미지/영상 프롬프트를 생성하고, 실시간 편집과 템플릿/효과 적용까지 수행할 수 있는 Python 기반 워크스페이스입니다. FastAPI 웹 UI와 CLI를 모두 제공합니다.

## 구성

```
keywordimagestory/
  __init__.py           # settings 노출
  app.py                # FastAPI 진입점
  config.py             # 설정(.env) 관리
  main.py               # CLI 실행 스크립트
  models.py             # Pydantic 도메인 모델
  openai_client.py      # OpenAI 래퍼(오프라인 모드 지원)
  prompts.py            # 프롬프트 템플릿
  generators/           # 키워드/이미지/쇼츠 생성기
  services/             # 저장, 이력, 편집 서비스
  ui/templates/         # Jinja2 템플릿
  ui/static/            # JS/CSS 자산
  outputs/              # 결과물 저장 위치
```

## 사전 준비

1. 의존성 설치
   ```bash
   pip install -r requirements.txt
   ```
2. `.env` 파일에 OpenAI API 키(선택)를 설정합니다. 키가 없으면 오프라인 모드에서 모의 응답을 사용합니다.
3. Google Sheets 연동을 사용하려면 `GOOGLE_APPLICATION_CREDENTIALS`, `enable_google_sync=True` 등을 `.env`에 추가하세요.

## 사용 방법

### FastAPI UI

```bash
uvicorn keywordimagestory.app:app --reload
```

브라우저에서 `http://127.0.0.1:8000` 접속 → 키워드를 입력하면 자동으로 프로젝트가 생성되고, 동시 편집 타임라인 / 템플릿 & 효과 패널을 조작할 수 있습니다.

### CLI

```bash
python -m keywordimagestory.main --keyword "달빛 여행" --image-description "달빛 아래 달리는 빨간 밴"
```

CLI는 프로젝트를 생성하고, 제목·자막·장면 프롬프트를 순차 생성한 뒤 `outputs/` 폴더에 스냅샷(SRT/Markdown/JSON 등)을 저장합니다.

## 기능 하이라이트

- **실시간 동시 편집**: 자막·음성·장면을 하나의 타임라인에서 조회/수정하고, 컨텍스트 메뉴로 타임스탬프를 조정합니다.
- **템플릿 & 효과 패널**: 5가지 레이아웃 템플릿과 10가지 텍스트/영상 효과를 선택해 즉시 프리뷰를 확인합니다.
- **정렬 미리보기 & AI 자동 정렬**: 자막/음성/이미지/영상 바를 가로 트랙에 겹쳐서 보여주고, 겹침이 발생하면 강조 표시합니다. `AI 자동 정렬` 버튼으로 모든 트랙의 시작·종료 시간을 균등 분배해 간단히 싱크를 맞출 수 있습니다.
- **프롬프트 프리뷰 & 추가**: 타임라인의 이미지/영상 프롬프트를 클릭하면 장면 설명과 카메라 정보를 확인하고, 필요 시 추가 폼으로 새로운 프롬프트를 즉시 등록할 수 있습니다.
- **스토리 빌더**: 생성된 조각을 순서대로 배치하여 장/단편 스토리를 구성하고, 내보내기 시 SRT/Markdown/JSON 파일을 한 번에 생성합니다.
- **이력 관리**: `outputs/history.json`에 버전 이력을 저장하여 언제든지 이전 버전을 확인할 수 있습니다.

자세한 요구사항과 설계 결정은 `keywordimagestory/spec.md`에서 확인할 수 있습니다.
