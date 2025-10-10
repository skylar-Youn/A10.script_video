#!/usr/bin/env python3
"""
자막 분석 및 편집 제안 도구
ChatGPT API를 사용하여 자막을 분석하고 편집 제안을 받습니다.
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, List
import openai


class SubtitleAnalyzer:
    """자막 분석 클래스"""

    def __init__(self, api_key: str = None):
        """
        초기화

        Args:
            api_key: OpenAI API 키 (없으면 환경변수에서 읽기)
        """
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다.")

        openai.api_key = self.api_key

    def read_srt(self, srt_path: str) -> str:
        """SRT 파일 읽기"""
        with open(srt_path, "r", encoding="utf-8") as f:
            return f.read()

    def get_system_prompt(self, prompt_type: str = "shorts") -> str:
        """시스템 프롬프트 반환"""
        prompts = {
            "shorts": """당신은 유튜브 쇼츠 전문 편집자입니다.
자막을 분석하여 60초 이내 쇼츠 영상에 최적화하세요.
반드시 유효한 JSON 형식으로 응답하세요.""",

            "basic": """당신은 유튜브 영상 자막 편집 전문가입니다.
자막을 분석하여 삭제할 부분과 추가할 설명을 제안하세요.
반드시 유효한 JSON 형식으로 응답하세요.""",

            "detailed": """당신은 자막 편집 전문가입니다.
영상의 구조를 파악하고 상세한 편집 제안을 하세요.
반드시 유효한 JSON 형식으로 응답하세요."""
        }
        return prompts.get(prompt_type, prompts["basic"])

    def get_user_prompt(self, subtitle_content: str, prompt_type: str = "shorts") -> str:
        """사용자 프롬프트 생성"""

        if prompt_type == "shorts":
            template = """
아래 자막을 분석하여 60초 쇼츠에 최적화하세요.

**편집 원칙:**
1. ⏱️ 시간 절약: 불필요한 내용 과감히 삭제
2. 📌 핵심 강조: 중요한 메시지만 남기기
3. 🎯 시청자 몰입: 설명 자막으로 맥락 제공
4. 🔥 후킹 포인트: 흥미로운 부분 강조

**출력 형식:**
```json
{{
  "title_suggestion": "추천 제목",
  "theme": "영상 주제",
  "target_duration": "목표 시간 (초)",
  "edit_summary": {{
    "original_count": 원본개수,
    "delete_count": 삭제개수,
    "add_count": 추가개수,
    "final_count": 최종개수
  }},
  "deletions": [
    {{"index": 번호, "time": "시간", "text": "텍스트", "reason": "이유"}}
  ],
  "additions": [
    {{"after": 번호, "time": "시간", "text": "텍스트", "type": "설명|강조|전환"}}
  ],
  "highlights": [
    {{"index": 번호, "text": "내용", "hook": "왜 주목할만한가"}}
  ]
}}
```

**자막:**
{subtitle_content}
"""
        elif prompt_type == "basic":
            template = """
아래 자막을 분석하고 편집 제안을 해주세요:

**출력 형식:**
```json
{{
  "summary": "영상 전체 내용 요약 (2-3문장)",
  "deletions": [
    {{
      "index": 자막번호,
      "time": "시작시간 --> 종료시간",
      "text": "삭제할 자막 텍스트",
      "reason": "삭제 이유"
    }}
  ],
  "additions": [
    {{
      "insert_after": 삽입할_위치_자막번호,
      "time": "추정시간",
      "text": "추가할 설명 텍스트",
      "reason": "추가 이유"
    }}
  ],
  "key_moments": [
    {{
      "index": 자막번호,
      "text": "핵심 내용",
      "importance": "왜 중요한지"
    }}
  ]
}}
```

**자막:**
{subtitle_content}
"""
        else:
            template = "{subtitle_content}"

        return template.format(subtitle_content=subtitle_content)

    def analyze(
        self,
        subtitle_content: str,
        prompt_type: str = "shorts",
        model: str = "gpt-4o",
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        """
        자막 분석

        Args:
            subtitle_content: 자막 내용 (SRT 형식)
            prompt_type: 프롬프트 타입 (shorts, basic, detailed)
            model: 사용할 모델 (gpt-4o, gpt-4o-mini 등)
            temperature: 창의성 수준 (0.0-1.0)

        Returns:
            분석 결과 (JSON)
        """
        system_msg = self.get_system_prompt(prompt_type)
        user_msg = self.get_user_prompt(subtitle_content, prompt_type)

        print(f"🤖 {model} 모델로 분석 중...")
        print(f"📊 자막 길이: {len(subtitle_content)} 자")

        try:
            response = openai.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg}
                ],
                temperature=temperature,
                response_format={"type": "json_object"}
            )

            result = json.loads(response.choices[0].message.content)

            # 토큰 사용량 출력
            usage = response.usage
            print(f"✅ 분석 완료!")
            print(f"💰 토큰 사용: 입력={usage.prompt_tokens}, 출력={usage.completion_tokens}, 총={usage.total_tokens}")

            return result

        except Exception as e:
            print(f"❌ 오류 발생: {e}")
            raise

    def analyze_file(
        self,
        srt_path: str,
        output_path: str = None,
        prompt_type: str = "shorts",
        model: str = "gpt-4o"
    ) -> Dict[str, Any]:
        """
        SRT 파일을 분석하고 결과를 저장

        Args:
            srt_path: SRT 파일 경로
            output_path: 결과 저장 경로 (없으면 자동 생성)
            prompt_type: 프롬프트 타입
            model: 사용할 모델

        Returns:
            분석 결과
        """
        # 자막 읽기
        subtitle_content = self.read_srt(srt_path)

        # 분석
        result = self.analyze(subtitle_content, prompt_type, model)

        # 결과 저장
        if output_path is None:
            srt_file = Path(srt_path)
            output_path = srt_file.parent / f"{srt_file.stem}_analysis.json"

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        print(f"💾 결과 저장: {output_path}")

        return result

    def apply_edits(
        self,
        srt_path: str,
        analysis_result: Dict[str, Any],
        output_path: str = None
    ) -> str:
        """
        분석 결과를 적용하여 새로운 SRT 생성

        Args:
            srt_path: 원본 SRT 파일 경로
            analysis_result: 분석 결과
            output_path: 출력 SRT 경로

        Returns:
            생성된 SRT 파일 경로
        """
        # 원본 SRT 파싱
        subtitle_content = self.read_srt(srt_path)
        blocks = subtitle_content.strip().split("\n\n")

        # 자막 파싱
        subtitles = []
        for block in blocks:
            lines = block.strip().split("\n")
            if len(lines) >= 3:
                try:
                    index = int(lines[0])
                    time = lines[1]
                    text = " ".join(lines[2:])
                    subtitles.append({
                        "index": index,
                        "time": time,
                        "text": text
                    })
                except ValueError:
                    continue

        # 삭제할 인덱스 수집
        deletions = analysis_result.get("deletions", [])
        delete_indices = {d["index"] for d in deletions}

        # 삭제 후 자막
        filtered_subtitles = [
            sub for sub in subtitles
            if sub["index"] not in delete_indices
        ]

        # 추가할 자막 처리
        additions = analysis_result.get("additions", [])
        for add in additions:
            insert_after = add.get("after") or add.get("insert_after")
            new_sub = {
                "index": insert_after + 0.5,  # 임시 인덱스
                "time": add["time"],
                "text": add["text"]
            }
            filtered_subtitles.append(new_sub)

        # 인덱스 기준 정렬 및 재번호 매기기
        filtered_subtitles.sort(key=lambda x: x["index"])
        for i, sub in enumerate(filtered_subtitles, 1):
            sub["index"] = i

        # SRT 형식으로 변환
        new_srt_lines = []
        for sub in filtered_subtitles:
            new_srt_lines.append(str(sub["index"]))
            new_srt_lines.append(sub["time"])
            new_srt_lines.append(sub["text"])
            new_srt_lines.append("")

        new_srt_content = "\n".join(new_srt_lines)

        # 저장
        if output_path is None:
            srt_file = Path(srt_path)
            output_path = srt_file.parent / f"{srt_file.stem}_edited.srt"

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(new_srt_content)

        print(f"✂️ 편집 완료: {len(subtitles)}개 → {len(filtered_subtitles)}개")
        print(f"💾 저장: {output_path}")

        return str(output_path)


def main():
    """메인 함수 - 예제"""
    import sys

    if len(sys.argv) < 2:
        print("사용법: python subtitle_analyzer.py <SRT파일경로> [프롬프트타입] [모델]")
        print("프롬프트타입: shorts (기본), basic, detailed")
        print("모델: gpt-4o (기본), gpt-4o-mini")
        sys.exit(1)

    srt_path = sys.argv[1]
    prompt_type = sys.argv[2] if len(sys.argv) > 2 else "shorts"
    model = sys.argv[3] if len(sys.argv) > 3 else "gpt-4o"

    # 분석기 초기화
    analyzer = SubtitleAnalyzer()

    # 파일 분석
    print(f"📝 자막 파일: {srt_path}")
    result = analyzer.analyze_file(srt_path, prompt_type=prompt_type, model=model)

    # 결과 요약 출력
    print("\n📊 분석 결과 요약:")
    if "edit_summary" in result:
        summary = result["edit_summary"]
        print(f"  원본: {summary.get('original_count', 0)}개")
        print(f"  삭제: {summary.get('delete_count', 0)}개")
        print(f"  추가: {summary.get('add_count', 0)}개")
        print(f"  최종: {summary.get('final_count', 0)}개")

    if "title_suggestion" in result:
        print(f"\n💡 추천 제목: {result['title_suggestion']}")

    if "theme" in result:
        print(f"🎯 영상 주제: {result['theme']}")

    # 편집 적용 여부 확인
    apply = input("\n✂️ 편집을 적용하여 새 SRT 파일을 생성하시겠습니까? (y/N): ")
    if apply.lower() == 'y':
        edited_path = analyzer.apply_edits(srt_path, result)
        print(f"✅ 완료! 편집된 파일: {edited_path}")


if __name__ == "__main__":
    main()
