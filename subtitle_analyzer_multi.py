#!/usr/bin/env python3
"""
멀티 모델 자막 분석 도구
OpenAI GPT와 Anthropic Claude 모델을 모두 지원합니다.
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, Optional
import openai

try:
    from anthropic import Anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    Anthropic = None


class MultiModelSubtitleAnalyzer:
    """여러 AI 모델을 지원하는 자막 분석 클래스"""

    # 지원 모델 목록
    SUPPORTED_MODELS = {
        # OpenAI 모델
        "gpt-4o": {"provider": "openai", "cost_per_1k_input": 0.0025, "cost_per_1k_output": 0.010},
        "gpt-4o-mini": {"provider": "openai", "cost_per_1k_input": 0.00015, "cost_per_1k_output": 0.0006},

        # Anthropic Claude 모델
        "claude-3-5-sonnet-20241022": {"provider": "anthropic", "cost_per_1k_input": 0.003, "cost_per_1k_output": 0.015},
        "claude-3-haiku-20240307": {"provider": "anthropic", "cost_per_1k_input": 0.00025, "cost_per_1k_output": 0.00125},
        "claude-3-opus-20240229": {"provider": "anthropic", "cost_per_1k_input": 0.015, "cost_per_1k_output": 0.075},
    }

    # 별칭 지원
    MODEL_ALIASES = {
        "gpt4o": "gpt-4o",
        "gpt4o-mini": "gpt-4o-mini",
        "sonnet": "claude-3-5-sonnet-20241022",
        "claude-sonnet": "claude-3-5-sonnet-20241022",
        "haiku": "claude-3-haiku-20240307",
        "claude-haiku": "claude-3-haiku-20240307",
        "opus": "claude-3-opus-20240229",
        "claude-opus": "claude-3-opus-20240229",
    }

    def __init__(self, openai_api_key: str = None, anthropic_api_key: str = None):
        """
        초기화

        Args:
            openai_api_key: OpenAI API 키
            anthropic_api_key: Anthropic API 키
        """
        self.openai_api_key = openai_api_key or os.getenv("OPENAI_API_KEY")
        self.anthropic_api_key = anthropic_api_key or os.getenv("ANTHROPIC_API_KEY")

        if self.openai_api_key:
            openai.api_key = self.openai_api_key

        if self.anthropic_api_key and ANTHROPIC_AVAILABLE:
            self.anthropic_client = Anthropic(api_key=self.anthropic_api_key)
        else:
            self.anthropic_client = None

    def resolve_model_name(self, model: str) -> str:
        """모델 별칭을 실제 모델명으로 변환"""
        return self.MODEL_ALIASES.get(model.lower(), model)

    def get_model_info(self, model: str) -> Dict[str, Any]:
        """모델 정보 반환"""
        model = self.resolve_model_name(model)
        if model not in self.SUPPORTED_MODELS:
            raise ValueError(f"지원하지 않는 모델: {model}\n지원 모델: {list(self.SUPPORTED_MODELS.keys())}")
        return self.SUPPORTED_MODELS[model]

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
반드시 유효한 JSON 형식으로 응답하세요.""",

            "enhanced": """당신은 유튜브 영상 자막 및 나레이션 전문가입니다.
자막을 3가지 타입으로 분류하세요:
1. kept_originals: 원본 대사 유지
2. text_additions: 화면 텍스트만 (소리 없음)
3. narration_additions: AI 음성 나레이션 (소리 있음)
반드시 유효한 JSON 형식으로 응답하세요.""",

            "enhanced-shorts": """당신은 유튜브 쇼츠 전문 편집자입니다.
이 영상을 60초 이내 쇼츠로 만들어야 합니다.
과감한 삭제(60-70%), 빠른 전환, 강렬한 후킹에 집중하세요.
반드시 유효한 JSON 형식으로 응답하세요.""",

            "enhanced-summary": """당신은 영상 요약 전문가입니다.
긴 영상을 핵심만 추려서 3-5분으로 요약하세요.
구조화, 챕터 구분, 흐름 연결에 집중하세요.
반드시 유효한 JSON 형식으로 응답하세요.""",

            "enhanced-education": """당신은 교육 콘텐츠 전문가입니다.
학습 효과를 극대화하는 교육 영상을 만드세요.
명확한 개념 설명, 단계별 학습, 반복 복습에 집중하세요.
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

**출력 형식 (JSON):**
{{
  "title_suggestion": "추천 제목",
  "theme": "영상 주제",
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

**자막:**
{subtitle_content}
"""
        elif prompt_type == "enhanced":
            template = """
아래 자막을 3가지 타입으로 분류하세요:

**분류 기준:**
1. **kept_originals**: 원본 대사 유지 (영상 원본 음성)
2. **text_additions**: 화면 텍스트만 (소리 없음, 예: [화면 전환], 💡 팁)
3. **narration_additions**: AI 음성 나레이션 (TTS로 읽을 내용)
4. **deletions**: 삭제할 자막 (추임새, 중복, 잡담)

**출력 형식 (JSON):**
{{
  "video_info": {{
    "title_suggestion": "추천 제목",
    "theme": "영상 주제",
    "original_count": 원본개수,
    "final_count": 최종개수
  }},
  "kept_originals": [
    {{
      "index": 번호,
      "time": "시작 --> 종료",
      "text": "원본 대사",
      "reason": "유지 이유",
      "importance": "high|medium|low"
    }}
  ],
  "deletions": [
    {{
      "index": 번호,
      "time": "시작 --> 종료",
      "text": "삭제할 텍스트",
      "reason": "삭제 이유",
      "category": "추임새|중복|무의미|잡담"
    }}
  ],
  "text_additions": [
    {{
      "insert_after": 삽입위치,
      "estimated_time": "예상시간",
      "text": "[화면 텍스트]",
      "type": "화면전환|강조|가이드",
      "position": "top|center|bottom",
      "duration": 표시시간(초)
    }}
  ],
  "narration_additions": [
    {{
      "insert_after": 삽입위치,
      "estimated_time": "예상시간",
      "narration_text": "AI 음성으로 읽을 텍스트",
      "subtitle_text": "음성과 함께 표시할 자막",
      "purpose": "맥락설명|요약|전환",
      "tone": "친근|전문적|열정적"
    }}
  ],
  "editing_summary": {{
    "kept_count": 유지개수,
    "deleted_count": 삭제개수,
    "text_added_count": 텍스트자막개수,
    "narration_added_count": 나레이션개수
  }}
}}

**자막:**
{subtitle_content}
"""
        elif prompt_type == "enhanced-shorts":
            template = """
**목표:** 60초 쇼츠로 만들기

**전략:** 과감한 삭제(60-70%), 빠른 전환, 강렬한 후킹

**출력 (JSON):**
{{
  "video_type": "shorts",
  "target_duration": 60,
  "kept_originals": [{{"index": 번호, "text": "대사", "importance": "high", "impact": "후킹|핵심|반전"}}],
  "deletions": [{{"index": 번호, "reason": "이유", "category": "인사|반복|추임새"}}],
  "text_additions": [{{"insert_after": 번호, "text": "텍스트(이모지포함)", "type": "후킹|강조|숫자", "animation": "fade|bounce|zoom"}}],
  "narration_additions": [{{"insert_after": 번호, "narration_text": "나레이션", "purpose": "오프닝|전환|클로징", "tone": "열정적", "speed": "fast"}}],
  "shorts_optimization": {{"opening_hook": "첫 3초 전략", "key_moments": [{{"time": "시간", "moment": "순간"}}]}}
}}

**자막:**
{subtitle_content}
"""
        elif prompt_type == "enhanced-summary":
            template = """
**목표:** 긴 영상을 3-5분으로 요약

**전략:** 구조화, 챕터 구분, 핵심 유지

**출력 (JSON):**
{{
  "video_type": "summary",
  "structure": [{{"chapter": "챕터명", "summary": "요약", "key_points": ["핵심1", "핵심2"]}}],
  "kept_originals": [{{"index": 번호, "text": "대사", "chapter": "챕터", "key_point": "핵심포인트"}}],
  "deletions": [{{"index": 번호, "reason": "이유", "category": "잡담|반복|예시중복"}}],
  "text_additions": [{{"insert_after": 번호, "text": "텍스트", "type": "챕터제목|요약|핵심"}}],
  "narration_additions": [{{"insert_after": 번호, "narration_text": "나레이션", "purpose": "챕터전환|섹션요약", "tone": "전문적"}}]
}}

**자막:**
{subtitle_content}
"""
        elif prompt_type == "enhanced-education":
            template = """
**목표:** 학습 효과 극대화

**전략:** 명확한 개념 설명, 단계별 학습, 반복 복습

**출력 (JSON):**
{{
  "video_type": "education",
  "learning_structure": [{{"step": 번호, "title": "단계", "concepts": ["개념1", "개념2"]}}],
  "kept_originals": [{{"index": 번호, "text": "대사", "category": "개념|예시|설명", "key_concept": "핵심개념"}}],
  "deletions": [{{"index": 번호, "reason": "이유", "category": "말더듬|반복(불필요)"}}],
  "text_additions": [{{"insert_after": 번호, "text": "텍스트", "type": "개념정의|공식|Step|요약", "importance": "critical|important"}}],
  "narration_additions": [{{"insert_after": 번호, "narration_text": "나레이션", "purpose": "개념설명|예시추가|복습", "tone": "차분", "speed": "slow"}}],
  "educational_elements": {{
    "key_concepts": [{{"concept": "개념", "definition": "정의"}}],
    "formulas": [{{"formula": "공식", "explanation": "설명"}}],
    "review_checkpoints": [{{"checkpoint": "복습포인트"}}]
  }}
}}

**자막:**
{subtitle_content}
"""
        else:
            template = """
아래 자막을 분석하고 편집 제안을 해주세요.

**출력 형식 (JSON):**
{{
  "summary": "영상 요약",
  "deletions": [{{"index": 번호, "reason": "이유"}}],
  "additions": [{{"after": 번호, "text": "텍스트"}}],
  "key_moments": [{{"index": 번호, "text": "내용"}}]
}}

**자막:**
{subtitle_content}
"""

        return template.format(subtitle_content=subtitle_content)

    def analyze_with_openai(
        self,
        subtitle_content: str,
        model: str,
        prompt_type: str,
        temperature: float
    ) -> Dict[str, Any]:
        """OpenAI 모델로 분석"""
        if not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다.")

        system_msg = self.get_system_prompt(prompt_type)
        user_msg = self.get_user_prompt(subtitle_content, prompt_type)

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
        usage = response.usage

        return {
            "result": result,
            "usage": {
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
                "total_tokens": usage.total_tokens
            }
        }

    def analyze_with_anthropic(
        self,
        subtitle_content: str,
        model: str,
        prompt_type: str,
        temperature: float
    ) -> Dict[str, Any]:
        """Anthropic Claude 모델로 분석"""
        if not ANTHROPIC_AVAILABLE:
            raise ValueError("anthropic 패키지가 설치되지 않았습니다. pip install anthropic 실행하세요.")
        if not self.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY가 설정되지 않았습니다.")

        system_msg = self.get_system_prompt(prompt_type)
        user_msg = self.get_user_prompt(subtitle_content, prompt_type)

        # Claude는 JSON 모드가 없으므로 프롬프트에 강제
        user_msg += "\n\n반드시 유효한 JSON만 출력하세요. 다른 텍스트는 포함하지 마세요."

        response = self.anthropic_client.messages.create(
            model=model,
            max_tokens=4096,
            temperature=temperature,
            system=system_msg,
            messages=[
                {"role": "user", "content": user_msg}
            ]
        )

        # Claude 응답에서 JSON 추출
        content = response.content[0].text

        # JSON 부분만 추출 (```json ... ``` 형태일 수 있음)
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()

        result = json.loads(content)

        return {
            "result": result,
            "usage": {
                "prompt_tokens": response.usage.input_tokens,
                "completion_tokens": response.usage.output_tokens,
                "total_tokens": response.usage.input_tokens + response.usage.output_tokens
            }
        }

    def calculate_cost(self, model: str, usage: Dict[str, int]) -> float:
        """비용 계산"""
        model_info = self.get_model_info(model)

        input_cost = (usage["prompt_tokens"] / 1000) * model_info["cost_per_1k_input"]
        output_cost = (usage["completion_tokens"] / 1000) * model_info["cost_per_1k_output"]

        return input_cost + output_cost

    def analyze(
        self,
        subtitle_content: str,
        model: str = "gpt-4o-mini",
        prompt_type: str = "shorts",
        temperature: float = 0.7
    ) -> Dict[str, Any]:
        """
        자막 분석

        Args:
            subtitle_content: 자막 내용
            model: 모델명 (gpt-4o, gpt-4o-mini, sonnet, haiku, opus)
            prompt_type: 프롬프트 타입
            temperature: 창의성 수준

        Returns:
            분석 결과
        """
        model = self.resolve_model_name(model)
        model_info = self.get_model_info(model)
        provider = model_info["provider"]

        print(f"🤖 모델: {model}")
        print(f"📊 자막 길이: {len(subtitle_content):,} 자")

        # 제공사별 분석
        if provider == "openai":
            response_data = self.analyze_with_openai(subtitle_content, model, prompt_type, temperature)
        elif provider == "anthropic":
            response_data = self.analyze_with_anthropic(subtitle_content, model, prompt_type, temperature)
        else:
            raise ValueError(f"지원하지 않는 제공사: {provider}")

        # 비용 계산
        cost = self.calculate_cost(model, response_data["usage"])

        print(f"✅ 분석 완료!")
        print(f"💰 토큰: 입력={response_data['usage']['prompt_tokens']:,}, "
              f"출력={response_data['usage']['completion_tokens']:,}, "
              f"총={response_data['usage']['total_tokens']:,}")
        print(f"💵 예상 비용: ${cost:.4f} (약 {cost * 1400:.0f}원)")

        return {
            "result": response_data["result"],
            "model": model,
            "provider": provider,
            "usage": response_data["usage"],
            "cost": cost
        }

    def analyze_file(
        self,
        srt_path: str,
        output_path: str = None,
        model: str = "gpt-4o-mini",
        prompt_type: str = "shorts"
    ) -> Dict[str, Any]:
        """SRT 파일 분석"""
        subtitle_content = self.read_srt(srt_path)
        analysis = self.analyze(subtitle_content, model, prompt_type)

        # 결과 저장
        if output_path is None:
            srt_file = Path(srt_path)
            output_path = srt_file.parent / f"{srt_file.stem}_analysis_{model.replace('/', '-')}.json"

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(analysis, f, ensure_ascii=False, indent=2)

        print(f"💾 결과 저장: {output_path}")

        return analysis

    def compare_models(
        self,
        srt_path: str,
        models: list = None
    ) -> Dict[str, Dict[str, Any]]:
        """여러 모델로 분석하여 비교"""
        if models is None:
            models = ["gpt-4o-mini", "sonnet", "haiku"]

        subtitle_content = self.read_srt(srt_path)
        results = {}

        print(f"\n🔄 {len(models)}개 모델로 비교 분석 시작...\n")

        for model in models:
            print(f"\n{'='*60}")
            print(f"분석 중: {model}")
            print(f"{'='*60}")

            try:
                result = self.analyze(subtitle_content, model=model)
                results[model] = result
            except Exception as e:
                print(f"❌ {model} 분석 실패: {e}")
                results[model] = {"error": str(e)}

        # 비교 결과 출력
        print(f"\n\n{'='*60}")
        print("📊 모델 비교 결과")
        print(f"{'='*60}\n")

        print(f"{'모델':<25} {'비용':>10} {'입력토큰':>12} {'출력토큰':>12}")
        print("-" * 65)

        for model, data in results.items():
            if "error" not in data:
                print(f"{model:<25} ${data['cost']:>9.4f} "
                      f"{data['usage']['prompt_tokens']:>12,} "
                      f"{data['usage']['completion_tokens']:>12,}")

        return results


def main():
    """메인 함수"""
    import sys

    if len(sys.argv) < 2:
        print("""
사용법: python subtitle_analyzer_multi.py <SRT파일> [모델] [프롬프트타입]

모델 옵션:
  - OpenAI: gpt-4o, gpt-4o-mini (기본)
  - Claude: sonnet, haiku, opus

프롬프트타입:
  - shorts (기본): 쇼츠 최적화
  - basic: 기본 편집
  - detailed: 상세 분석
  - enhanced: 자막/나레이션 구분
  - enhanced-shorts: 1분 쇼츠 최적화 ⭐ NEW
  - enhanced-summary: 긴 영상 요약 (3-5분) ⭐ NEW
  - enhanced-education: 교육 콘텐츠 최적화 ⭐ NEW

예시:
  python subtitle_analyzer_multi.py video.srt
  python subtitle_analyzer_multi.py video.srt sonnet
  python subtitle_analyzer_multi.py video.srt haiku shorts
  python subtitle_analyzer_multi.py video.srt sonnet enhanced
  python subtitle_analyzer_multi.py video.srt sonnet enhanced-shorts     # 60초 쇼츠
  python subtitle_analyzer_multi.py video.srt sonnet enhanced-summary    # 긴 영상 요약
  python subtitle_analyzer_multi.py video.srt sonnet enhanced-education  # 교육 콘텐츠

비교 모드:
  python subtitle_analyzer_multi.py video.srt --compare
""")
        sys.exit(1)

    srt_path = sys.argv[1]

    # 비교 모드
    if len(sys.argv) > 2 and sys.argv[2] == "--compare":
        models = sys.argv[3:] if len(sys.argv) > 3 else ["gpt-4o-mini", "sonnet", "haiku"]
        analyzer = MultiModelSubtitleAnalyzer()
        analyzer.compare_models(srt_path, models)
        return

    # 일반 모드
    model = sys.argv[2] if len(sys.argv) > 2 else "gpt-4o-mini"
    prompt_type = sys.argv[3] if len(sys.argv) > 3 else "shorts"

    analyzer = MultiModelSubtitleAnalyzer()
    result = analyzer.analyze_file(srt_path, model=model, prompt_type=prompt_type)

    # 결과 요약
    if "result" in result and "edit_summary" in result["result"]:
        summary = result["result"]["edit_summary"]
        print(f"\n📊 편집 요약:")
        print(f"  원본: {summary.get('original_count', 0)}개")
        print(f"  삭제: {summary.get('delete_count', 0)}개")
        print(f"  추가: {summary.get('add_count', 0)}개")
        print(f"  최종: {summary.get('final_count', 0)}개")


if __name__ == "__main__":
    main()
