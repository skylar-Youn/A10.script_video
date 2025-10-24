#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
대본 생성 Worker 스레드
"""

from PyQt5.QtCore import QThread, pyqtSignal

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False


class ScriptGeneratorWorker(QThread):
    """대본 생성을 별도 스레드에서 처리"""
    progress = pyqtSignal(str)
    result = pyqtSignal(dict)
    error = pyqtSignal(str)

    def __init__(self, api_key, topic, language, part_number, part_duration):
        super().__init__()
        self.api_key = api_key
        self.topic = topic
        self.language = language
        self.part_number = part_number
        self.part_duration = part_duration

    def run(self):
        try:
            client = OpenAI(api_key=self.api_key)

            # 언어별 프롬프트
            language_map = {
                "ko": "한국어",
                "en": "영어",
                "ja": "일본어"
            }
            lang_name = language_map.get(self.language, "한국어")

            self.progress.emit(f"{self.topic}에 대한 {self.part_number}부 대본 생성 중...")

            # 대본 생성 프롬프트
            prompt = f"""다음 주제에 대한 {lang_name} 영상 대본을 작성해주세요.

주제: {self.topic}
파트: {self.part_number}부
길이: 약 {self.part_duration}분

요구사항:
1. {lang_name}로 작성
2. 시청자가 이해하기 쉬운 대본
3. 각 장면은 이모지(🎬, ⚛️, 🧘 등)로 시작
4. 장면별로 명확하게 구분
5. 약 {self.part_duration}분 분량의 내용

형식:
🎬 [장면 제목]
대본 내용...

⚛️ [다음 장면 제목]
대본 내용...
"""

            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "당신은 전문 영상 대본 작가입니다. 시청자가 이해하기 쉽고 흥미로운 대본을 작성합니다."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=2000
            )

            script_content = response.choices[0].message.content.strip()

            self.result.emit({
                "topic": self.topic,
                "language": self.language,
                "part_number": self.part_number,
                "part_duration": self.part_duration,
                "content": script_content
            })

        except Exception as e:
            self.error.emit(f"대본 생성 중 오류: {str(e)}")
