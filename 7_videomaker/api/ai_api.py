#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI 처리 API
AI 기반 자막 생성 및 분석 API를 제공합니다.
"""

import base64
from pathlib import Path
from typing import List, Tuple, Optional


class AIAPI:
    """AI 처리 API 클래스"""

    def __init__(self, anthropic_key: str = '', openai_key: str = ''):
        """
        Args:
            anthropic_key: Anthropic API 키
            openai_key: OpenAI API 키
        """
        self.anthropic_key = anthropic_key
        self.openai_key = openai_key

    def analyze_frames(
        self,
        frame_paths: List[str],
        prompt: str,
        model_type: str = 'claude'
    ) -> Tuple[bool, str, str]:
        """
        프레임 분석

        Args:
            frame_paths: 프레임 경로 리스트
            prompt: 분석 프롬프트
            model_type: 모델 타입 ('claude' or 'openai')

        Returns:
            (성공 여부, 분석 결과, 메시지)
        """
        if not frame_paths:
            return False, '', "프레임이 없습니다"

        # 이미지를 base64로 인코딩
        images_base64 = []
        for frame_path in frame_paths[:10]:  # 최대 10개
            try:
                with open(frame_path, 'rb') as f:
                    image_data = base64.b64encode(f.read()).decode('utf-8')
                    images_base64.append(image_data)
            except Exception as e:
                return False, '', f"이미지 로드 실패: {str(e)}"

        try:
            if model_type == 'claude':
                return self._analyze_with_claude(images_base64, prompt)
            elif model_type == 'openai':
                return self._analyze_with_openai(images_base64, prompt)
            else:
                return False, '', f"지원하지 않는 모델: {model_type}"

        except Exception as e:
            return False, '', f"프레임 분석 실패: {str(e)}"

    def analyze_subtitle(
        self,
        subtitle_text: str,
        analysis_goal: str,
        model_type: str = 'claude'
    ) -> Tuple[bool, str, str]:
        """
        자막 분석

        Args:
            subtitle_text: 자막 내용
            analysis_goal: 분석 목적 ('summary', 'shorts', 'education', 'general')
            model_type: 모델 타입 ('claude' or 'openai')

        Returns:
            (성공 여부, 분석 결과, 메시지)
        """
        if not subtitle_text:
            return False, '', "자막 내용이 비어있습니다"

        # 분석 목적에 따른 프롬프트
        prompts = {
            'general': '이 자막을 분석하여 주요 내용을 요약해주세요.',
            'shorts': '이 자막을 분석하여 쇼츠에 적합한 하이라이트 구간을 추천해주세요. 각 구간의 시작/끝 시간과 이유를 설명해주세요.',
            'education': '이 자막을 분석하여 교육 콘텐츠로 재구성할 방법을 제안해주세요.',
            'summary': '이 자막의 핵심 내용을 3-5개의 bullet point로 요약해주세요.'
        }

        prompt = f"{prompts.get(analysis_goal, prompts['general'])}\n\n자막 내용:\n{subtitle_text}"

        try:
            if model_type == 'claude':
                return self._analyze_text_with_claude(prompt)
            elif model_type == 'openai':
                return self._analyze_text_with_openai(prompt)
            else:
                return False, '', f"지원하지 않는 모델: {model_type}"

        except Exception as e:
            return False, '', f"자막 분석 실패: {str(e)}"

    def generate_subtitle_from_frames(
        self,
        frame_paths: List[str],
        language: str = 'ko',
        model_type: str = 'claude'
    ) -> Tuple[bool, str, str]:
        """
        프레임 기반 자막 생성

        Args:
            frame_paths: 프레임 경로 리스트
            language: 언어 ('ko', 'en', 'ja')
            model_type: 모델 타입 ('claude' or 'openai')

        Returns:
            (성공 여부, 자막 내용, 메시지)
        """
        if not frame_paths:
            return False, '', "프레임이 없습니다"

        # 이미지를 base64로 인코딩
        images_base64 = []
        for frame_path in frame_paths[:20]:  # 최대 20개
            try:
                with open(frame_path, 'rb') as f:
                    image_data = base64.b64encode(f.read()).decode('utf-8')
                    images_base64.append(image_data)
            except Exception as e:
                return False, '', f"이미지 로드 실패: {str(e)}"

        language_map = {
            'ko': '한국어',
            'en': '영어',
            'ja': '일본어'
        }
        lang_name = language_map.get(language, '한국어')

        prompt = f"""이 영상 프레임들을 분석하여 {lang_name} 자막을 생성해주세요.

요구사항:
1. 각 프레임은 순서대로 시간 흐름을 나타냅니다
2. 자연스럽고 이해하기 쉬운 {lang_name}로 작성
3. SRT 형식으로 출력
4. 각 자막은 2-4초 길이로 설정

형식:
1
00:00:00,000 --> 00:00:02,000
첫 번째 자막 내용

2
00:00:02,000 --> 00:00:04,000
두 번째 자막 내용
"""

        try:
            if model_type == 'claude':
                return self._generate_subtitle_with_claude(images_base64, prompt)
            elif model_type == 'openai':
                return self._generate_subtitle_with_openai(images_base64, prompt)
            else:
                return False, '', f"지원하지 않는 모델: {model_type}"

        except Exception as e:
            return False, '', f"자막 생성 실패: {str(e)}"

    def _analyze_with_claude(
        self,
        images_base64: List[str],
        prompt: str
    ) -> Tuple[bool, str, str]:
        """Claude로 프레임 분석"""
        try:
            from anthropic import Anthropic
        except ImportError:
            return False, '', "Anthropic 라이브러리가 설치되지 않았습니다"

        if not self.anthropic_key:
            return False, '', "Anthropic API 키가 설정되지 않았습니다"

        client = Anthropic(api_key=self.anthropic_key)

        # 메시지 구성
        content = [{"type": "text", "text": prompt}]
        for img_b64 in images_base64:
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": img_b64
                }
            })

        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=2048,
            messages=[{"role": "user", "content": content}]
        )

        analysis_text = response.content[0].text
        return True, analysis_text, "분석 완료"

    def _analyze_with_openai(
        self,
        images_base64: List[str],
        prompt: str
    ) -> Tuple[bool, str, str]:
        """OpenAI로 프레임 분석"""
        try:
            from openai import OpenAI
        except ImportError:
            return False, '', "OpenAI 라이브러리가 설치되지 않았습니다"

        if not self.openai_key:
            return False, '', "OpenAI API 키가 설정되지 않았습니다"

        client = OpenAI(api_key=self.openai_key)

        # 메시지 구성
        content = [{"type": "text", "text": prompt}]
        for img_b64 in images_base64:
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{img_b64}"}
            })

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": content}],
            max_tokens=2048
        )

        analysis_text = response.choices[0].message.content
        return True, analysis_text, "분석 완료"

    def _analyze_text_with_claude(self, prompt: str) -> Tuple[bool, str, str]:
        """Claude로 텍스트 분석"""
        try:
            from anthropic import Anthropic
        except ImportError:
            return False, '', "Anthropic 라이브러리가 설치되지 않았습니다"

        if not self.anthropic_key:
            return False, '', "Anthropic API 키가 설정되지 않았습니다"

        client = Anthropic(api_key=self.anthropic_key)

        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}]
        )

        analysis_text = response.content[0].text
        return True, analysis_text, "분석 완료"

    def _analyze_text_with_openai(self, prompt: str) -> Tuple[bool, str, str]:
        """OpenAI로 텍스트 분석"""
        try:
            from openai import OpenAI
        except ImportError:
            return False, '', "OpenAI 라이브러리가 설치되지 않았습니다"

        if not self.openai_key:
            return False, '', "OpenAI API 키가 설정되지 않았습니다"

        client = OpenAI(api_key=self.openai_key)

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2048
        )

        analysis_text = response.choices[0].message.content
        return True, analysis_text, "분석 완료"

    def _generate_subtitle_with_claude(
        self,
        images_base64: List[str],
        prompt: str
    ) -> Tuple[bool, str, str]:
        """Claude로 자막 생성"""
        success, result, message = self._analyze_with_claude(images_base64, prompt)

        if success:
            # SRT 블록 추출
            import re
            srt_match = re.search(r'```(?:srt)?\s*\n(.*?)\n```', result, re.DOTALL)
            if srt_match:
                subtitle_text = srt_match.group(1).strip()
            else:
                subtitle_text = result

            return True, subtitle_text, "자막 생성 완료"
        else:
            return False, '', message

    def _generate_subtitle_with_openai(
        self,
        images_base64: List[str],
        prompt: str
    ) -> Tuple[bool, str, str]:
        """OpenAI로 자막 생성"""
        success, result, message = self._analyze_with_openai(images_base64, prompt)

        if success:
            # SRT 블록 추출
            import re
            srt_match = re.search(r'```(?:srt)?\s*\n(.*?)\n```', result, re.DOTALL)
            if srt_match:
                subtitle_text = srt_match.group(1).strip()
            else:
                subtitle_text = result

            return True, subtitle_text, "자막 생성 완료"
        else:
            return False, '', message
