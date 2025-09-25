#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys
import io
import time
import pandas as pd
import gspread
from oauth2client.service_account import ServiceAccountCredentials
import os.path
import re
from openai import OpenAI
from dotenv import load_dotenv

# UTF-8 인코딩 설정
sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# .env 파일 로드
current_dir = os.path.dirname(os.path.abspath(__file__))  # 현재 스크립트 경로
env_path = os.path.join(current_dir, '.env')  # 현재 디렉토리의 .env 파일

print(f"env 파일 경로 확인: {env_path}")
if os.path.exists(env_path):
    print(f".env 파일이 존재합니다: {env_path}")
    load_dotenv(dotenv_path=env_path)
else:
    print(f".env 파일이 존재하지 않습니다: {env_path}")
    # 대체 경로 시도
    alt_env_path = '/home/skyntech/www/html/other/.env'
    if os.path.exists(alt_env_path):
        print(f"대체 경로에서 .env 파일 발견: {alt_env_path}")
        env_path = alt_env_path
        load_dotenv(dotenv_path=env_path)
    else:
        print(f"대체 경로에서도 .env 파일을 찾을 수 없습니다: {alt_env_path}")

# API 키 설정
api_key = os.getenv("OPENAI_API_KEY")
if api_key:
    print("API 키를 성공적으로 로드했습니다.")
else:
    print("API 키를 로드하지 못했습니다.")
    api_key = input("OpenAI API 키를 입력하세요: ").strip()
    if not api_key:
        print("API 키가 필요합니다. 프로그램을 종료합니다.")
        exit(1)

# 검색할 키워드 설정
keyword = "금융"  # 검색하려는 키워드

GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1nzNyy9JDUrDVEAz_23hUJLXOsBXeIXTMSg03kLvbdVw/edit?usp=sharing'
WORKSHEET_KEYWORDS = "시트2"
WORKSHEET_BLOG_OUTLINE = "블로그목차"


def clean_markdown_text(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("**") and cleaned.endswith("**"):
        cleaned = cleaned[2:-2]
    cleaned = cleaned.strip("`")
    return cleaned.strip()


def parse_outline_response(outline_text: str, default_topic: str) -> list[dict[str, str]]:
    entries = []
    current_entry = None
    lines = outline_text.splitlines()

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            continue

        number_match = re.match(r"^(\d+)[\.)]\s+(.*)$", line)
        if number_match:
            if current_entry:
                entries.append(current_entry)
            title_text = clean_markdown_text(number_match.group(2))
            current_entry = {
                "번호": number_match.group(1),
                "제목": title_text,
                "소제목": [],
            }
            continue

        if current_entry and re.match(r"^[-•*‣–—]\s+", line):
            bullet_text = re.sub(r"^[-•*‣–—]\s+", "", line)
            bullet_text = clean_markdown_text(bullet_text)
            if bullet_text:
                current_entry["소제목"].append(bullet_text)

    if current_entry:
        entries.append(current_entry)

    rows = []
    for entry in entries:
        subtitles = entry["소제목"][:3]
        while len(subtitles) < 3:
            subtitles.append("")
        rows.append(
            {
                "번호": entry["번호"],
                "제목": entry["제목"],
                "소제목1": subtitles[0],
                "소제목2": subtitles[1],
                "소제목3": subtitles[2],
            }
        )

    if not rows:
        fallback_text = clean_markdown_text(outline_text)
        rows.append(
            {
                "번호": "1",
                "제목": default_topic or fallback_text[:80],
                "소제목1": fallback_text,
                "소제목2": "",
                "소제목3": "",
            }
        )

    return rows


def save_dataframe_outputs(df: pd.DataFrame, filename_prefix: str, worksheet_title: str) -> str:
    timestamp_str = str(int(time.time()))
    safe_prefix = filename_prefix.replace('/', '_')
    excel_filename = f"{safe_prefix}_{timestamp_str}.xlsx"
    df.to_excel(excel_filename, index=False, engine='openpyxl')
    print(f"엑셀 파일 저장 완료: {excel_filename}")

    try:
        credentials_path = os.path.join(current_dir, "youtube-shorts-455403-ea00801dd7b2.json")
        print(f"구글 API 인증 정보 파일 경로: {credentials_path}")

        if not os.path.exists(credentials_path):
            raise FileNotFoundError(f"인증 파일을 찾을 수 없습니다: {credentials_path}")

        scope = [
            'https://spreadsheets.google.com/feeds',
            'https://www.googleapis.com/auth/drive'
        ]

        print("인증 파일을 사용하여 구글 API 인증 시도 중...")
        gs_credentials = ServiceAccountCredentials.from_json_keyfile_name(credentials_path, scope)
        gs_client = gspread.authorize(gs_credentials)
        print("구글 API 인증 성공!")

        sheet_url = GOOGLE_SHEET_URL
        print(f"연결할 스프레드시트 URL: {sheet_url}")

        if '/d/' in sheet_url:
            sheet_key = sheet_url.split('/d/')[1].split('/')[0]
        else:
            sheet_key = sheet_url
        print(f"추출한 스프레드시트 키: {sheet_key}")

        print("스프레드시트 열기 시도 중...")
        sheet = gs_client.open_by_key(sheet_key)
        print(f"스프레드시트 열기 성공: {sheet.title}")

        try:
            worksheet = sheet.worksheet(worksheet_title)
            print(f"'{worksheet_title}' 워크시트가 이미 존재합니다.")
        except Exception:
            print(f"'{worksheet_title}' 워크시트가 없으므로 새로 생성합니다.")
            worksheet = sheet.add_worksheet(title=worksheet_title, rows=100, cols=max(20, len(df.columns)))
            print(f"'{worksheet_title}' 워크시트 생성 완료")

        headers = list(df.columns)
        existing_data = worksheet.get_all_values()
        if not existing_data:
            worksheet.append_row(headers)
            print("헤더를 추가했습니다.")
        else:
            print("시트에 이미 데이터가 있습니다. 헤더 추가를 건너뜁니다.")

        data_to_append = df.fillna("").values.tolist()
        worksheet.append_rows(data_to_append)
        print(f"구글 시트에 데이터 저장 완료 ({worksheet_title}): {sheet_url}")

    except Exception as e:
        import traceback
        print(f"구글 시트 저장 실패: {str(e)}")
        print("상세 에러:")
        traceback.print_exc()

    return excel_filename

# OpenAI API 클라이언트 초기화
client = OpenAI(api_key=api_key)

# 메뉴 선택
print("=" * 60)
print("📝 작업을 선택하세요:")
print("1. 키워드 추출")
print("2. 블로그 목차 생성기 (55편)")
print("=" * 60)
menu_choice = input("선택 (1 또는 2): ").strip()

if menu_choice == "2":
    # 블로그 목차 생성기
    print("\n블로그 목차 생성기를 실행합니다...")
    outline_topic = input(f"블로그 목차 주제를 입력하세요 (기본: {keyword}): ").strip()
    if not outline_topic:
        outline_topic = keyword

    outline_instructions = (
        "당신은 한국어 SEO 전문 콘텐츠 전략가입니다. 응답은 항상 한국어로 작성하세요.\n"
        "요청된 주제를 기반으로 서로 다른 검색 의도와 독자 니즈를 반영한 블로그 포스트 목차를 설계하세요.\n"
        "각 포스트는 제목과 3개의 핵심 소제목(불릿 리스트)으로 구성하고, 제목은 클릭을 유도할 수 있도록 매력적으로 작성하세요."
    )

    outline_request = (
        f"주제: {outline_topic}\n"
        "아래 요건을 만족하는 블로그 포스트 목차 55개를 만들어 주세요.\n"
        "- 결과는 1. 2. 형식의 번호가 붙은 목록으로 제공합니다.\n"
        "- 각 항목은 `제목` 한 줄과 이어지는 3개의 소제목 불릿('-')을 포함합니다.\n"
        "- 한글로 작성하고, 중복되는 소제목 없이 구체적인 행동이나 정보를 담아 주세요."
    )

    try:
        response = client.responses.create(
            model="gpt-4o",
            instructions=outline_instructions,
            input=outline_request,
            temperature=0.7,
            max_output_tokens=4000,
        )
    except Exception as api_error:
        print(f"블로그 목차 생성 중 오류가 발생했습니다: {api_error}")
        exit(1)

    outline_text = getattr(response, "output_text", "")
    if not outline_text:
        try:
            outline_text = "".join(
                block.text
                for item in response.output
                if getattr(item, "type", None) == "message"
                for block in getattr(item, "content", [])
                if getattr(block, "type", None) == "output_text"
            )
        except Exception:
            outline_text = str(response)

    outline_rows = parse_outline_response(outline_text, outline_topic)
    df_outline = pd.DataFrame(outline_rows)
    excel_filename = save_dataframe_outputs(df_outline, f"GPT블로그목차_{outline_topic}", WORKSHEET_BLOG_OUTLINE)

    print("블로그 목차 생성 완료!")
    print(f"목차 {len(df_outline)}건을 저장했습니다. 엑셀 파일: {excel_filename}")
    exit(0)

# 키워드 추출 모드 (기본값: 1번)
print("\n📝 GPT에게 물어볼 키워드 입력하세요:")
user_input = input("입력: ").strip()

if not user_input:
    user_input = f"{keyword} 관련 황금 키워드 50개를 찾아주세요."
    print(f"기본 문장 사용: {user_input}")
else:
    # 사용자 입력이 키워드 추출 요청이 아닌 경우, 키워드 추출 요청으로 변환
    if "키워드" not in user_input and "검색" not in user_input:
        user_input = f"'{user_input}' 관련 키워드 30개를 표 형식으로 정리해주세요. 형식: | 연관키워드 | 월간검색수 |"
        print(f"키워드 추출 형식으로 변환: {user_input}")

# GPT API 호출
print(f"\nOpenAI API 호출 중...")

response = client.chat.completions.create(
  model="gpt-4o",
  messages=[
    {
      "role": "system",
      "content": "You are a helpful assistant. Please provide detailed and accurate information."
    },
    {
      "role": "user",
      "content": user_input
    }
  ],
  temperature=0.9,
  max_tokens=700,
  top_p=1
)

print(f"OpenAI API 응답 완료")

# API 응답을 데이터프레임으로 변환
try:
    # GPT 응답에서 데이터 추출
    assistant_response = response.choices[0].message.content
    print(f"GPT 응답: {assistant_response[:500]}...")
    
    # 응답 텍스트 분석하여 테이블 데이터 추출
    keywords_data = []
    
    # 표 형식 데이터 추출 시도
    lines = assistant_response.strip().split('\n')
    table_started = False
    headers = []
    
    for line in lines:
        line = line.strip()
        # 테이블 헤더 인식
        if '연관키워드' in line and '월간검색수' in line:
            table_started = True
            headers = [col.strip() for col in line.split('|') if col.strip()]
            continue
            
        # 테이블 구분선 건너뛰기
        if table_started and '----' in line:
            continue
            
        # 테이블 데이터 행 처리
        if table_started and '|' in line:
            row_data = [cell.strip() for cell in line.split('|') if cell.strip()]
            if len(row_data) >= len(headers):
                keyword_row = {}
                for i, header in enumerate(headers):
                    if i < len(row_data):
                        keyword_row[header] = row_data[i]
                keywords_data.append(keyword_row)
    
    # 테이블 형식이 아닌 경우, 리스트 형식 추출 시도
    if not keywords_data:
        for line in lines:
            line = line.strip()
            if line.startswith('-') or line.startswith('*') or line.startswith('•'):
                # 키워드만 추출
                keyword_info = line.strip('- *•').strip()
                if keyword_info:
                    keyword_row = {'연관키워드': keyword_info}
                    keywords_data.append(keyword_row)

    # 여전히 키워드가 없는 경우, 숫자로 시작하는 행도 체크
    if not keywords_data:
        for line in lines:
            line = line.strip()
            # 숫자로 시작하는 행 (1. 키워드, 2. 키워드 등)
            if line and line[0].isdigit() and ('.' in line or ')' in line):
                # 숫자와 점/괄호 제거 후 키워드 추출
                keyword_info = line.split('.', 1)[-1].split(')', 1)[-1].strip()
                if keyword_info and len(keyword_info) > 1:
                    keyword_row = {'연관키워드': keyword_info}
                    keywords_data.append(keyword_row)
    
    print(f"추출된 키워드 수: {len(keywords_data)}")
    
    # 데이터프레임 생성
    df = pd.DataFrame(keywords_data)
    
    # 데이터프레임이 비어 있는 경우 기본 키워드 생성
    if len(df) == 0:
        print("GPT 응답에서 키워드를 추출할 수 없습니다.")
        print("원본 응답을 기본 키워드로 저장합니다.")
        # 원본 응답을 키워드로 저장
        keywords_data = [{'연관키워드': f"GPT응답_{int(time.time())}", '내용': assistant_response[:200] + "..."}]
        df = pd.DataFrame(keywords_data)
    
    excel_filename = save_dataframe_outputs(df, f"GPT키워드_{keyword}", WORKSHEET_KEYWORDS)
    print(f"키워드 데이터를 저장했습니다. 엑셀 파일: {excel_filename}")
except Exception as e:
    import traceback
    print(f"키워드 데이터 처리 실패: {str(e)}")
    print("상세 에러:")
    traceback.print_exc() 
