# YouTube Toolkit

## Video Similarity Checker (CLI)
두 영상 또는 **영상 vs 폴더(여러 영상)** 간 유사도를 계산하는 경량 프로그램입니다.
학습 모델 없이도 잘 동작하는 지표들을 조합하여 점수를 냅니다.

### 지원 지표
- **pHash 매칭률**: 프레임 퍼셉추얼 해시(Hamming ≤ 임계값) 기반 유사도
- **ORB 특징 매칭률**: 키포인트 특징 매칭 수 기반 유사도
- **컬러 히스토그램 상관계수**: 색 분포 유사도
- **PSNR 평균**: 프레임 MSE로부터 PSNR(고를수록 유사)

> 기본 종합 점수는 `(pHash + ORB + Hist + PSNR_norm) / 4` 로 계산합니다. 가중치는 옵션으로 조정 가능합니다.

### 설치
```bash
python -m venv .venv
source .venv/bin/activate               # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```
- 독립 실행이 필요하면 `youtube/requirements.txt`를 사용해 가상환경에서 필요한 최소 패키지를 설치하세요.
- OpenCV가 FFmpeg backend를 필요로 할 수 있으므로, 시스템에 FFmpeg가 설치되어 있는지 확인합니다.

### 사용법
`ytinspector.py`는 두 가지 모드(쌍 비교 / 폴더 랭킹)를 제공합니다. 공통 옵션은 `--fps`, `--resize`, `--max-frames`, `--phash-th`, `--weights` 등이며 `--help`로 상세 확인이 가능합니다.

- **쌍 비교:** 개별 두 영상을 비교하고 JSON 리포트를 선택적으로 저장합니다.
```bash
python ytinspector.py --a /path/to/videoA.mp4 --b /path/to/videoB.mp4 \
  --fps 1.0 --resize 320x320 --max-frames 200 --out results/similarity.json
```

- **폴더 랭킹:** 기준 영상과 폴더 내 모든 영상을 비교해 가중 점수 기준으로 내림차순 정렬합니다.
```bash
python ytinspector.py --a /path/to/main.mp4 --dir ./reference_videos --csv ranking.csv
```

#### 주요 출력 항목
- `pHash`, `ORB`, `Hist`, `PSNR`: 0~1 범위의 정규화 점수
- `PSNR_db`: 평균 PSNR(dB)
- `weighted`: 가중 평균 점수
- `frames_used`: 분석에 사용된 프레임 수

에러가 발생하면 메시지가 결과에 포함되어 CSV/콘솔에서 확인할 수 있습니다.

## ytdl.py 사용법

ytdl.py는 yt-dlp를 감싼 간단한 CLI 스크립트로, 유튜브 영상과 자막을 한 번에 내려받을 수 있습니다.

## 사전 준비
- Python 3.11 이상
- 프로젝트 의존성 설치: `python3 -m pip install -r ../requirements.txt`

## 기본 다운로드
```bash
python3 ytdl.py <유튜브-URL>
```
- 영상과 자막 파일은 기본적으로 `youtube/download/"<제목> [<영상ID>].<확장자>"` 형태로 저장됩니다.

## 주요 옵션
- `-o, --output-dir 경로` : 저장할 디렉터리를 지정합니다. (기본값: `youtube/download`)
- `--dry-run` : 실제 다운로드 없이 어떤 파일이 생성될지 미리 확인합니다.
- `--sub-langs 언어코드들` : 자막 언어를 콤마로 구분해 지정합니다. 기본값은 `all`로 제공되는 모든 자막을 받습니다.
- `--sub-format 형식` : 자막 파일 형식을 지정합니다. 기본값은 `best`입니다.
- `--no-subs` : 자막 다운로드를 건너뜁니다.
- `--no-auto-subs` : 자동 생성(기계 번역) 자막은 제외하고, 업로드된 자막만 받습니다.

## 사용 예시
영상과 모든 자막을 특정 폴더로 저장:
```bash
python3 ytdl.py "https://www.youtube.com/watch?v=dQw4w9WgXcQ" \
  --output-dir /tmp/ytdl_downloads
```

영상을 다운로드하지 않고, 영어 자막만 미리 확인:
```bash
python3 ytdl.py "https://www.youtube.com/watch?v=dQw4w9WgXcQ" \
  --dry-run --sub-langs en
```

영상과 영어·일본어 자막을 함께 저장:
```bash
python3 ytdl.py "https://www.youtube.com/watch?v=dQw4w9WgXcQ" \
  --sub-langs en,ja,ko
```

python3 ytdl.py "https://www.youtube.com/watch?v=dQw4w9WgXcQ" --sub-langs ko

python3 ytdl.py "https://www.youtube.com/shorts/4y6uaG2UZ9E" --sub-langs ko

## 참고 사항
- `--no-auto-subs` 옵션을 주지 않으면 자동 생성 자막도 함께 내려받습니다.
- yt-dlp는 동일한 파일이 이미 존재하면 재사용합니다. 새로 받으려면 기존 파일을 삭제하세요.
- 고급 포맷 선택이 필요하면 `yt-dlp --help`를 참고하거나, 필요한 옵션을 환경 변수 `YT_DLP_ACCESS_ARGS`에 추가해 사용할 수 있습니다.

## 웹 UI 활용
- FastAPI 앱(`uvicorn web_app.app:app --reload --port 8001` 또는 `python -m web_app`)을 실행하면 `/ytdl` 경로에서 간단한 폼 기반 UI로 영상/자막 다운로드를 제어할 수 있습니다.
- 한 번에 여러 URL을 줄바꿈으로 넣고, 자막 언어·드라이런 여부 등을 체크박스와 입력란으로 지정할 수 있습니다.

