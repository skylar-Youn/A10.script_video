#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI 처리 워커
백그라운드에서 AI 분석 및 생성을 수행합니다.
"""

from PyQt5.QtCore import QThread, pyqtSignal
from typing import List
from ..api.ai_api import AIAPI


class AIWorker(QThread):
    """AI 처리 워커"""

    progress = pyqtSignal(str)  # 진행 상태 메시지
    result = pyqtSignal(dict)    # 결과
    error = pyqtSignal(str)      # 에러

    def __init__(
        self,
        task_type: str,
        ai_api: AIAPI,
        **kwargs
    ):
        """
        Args:
            task_type: 작업 타입 ('analyze_frames', 'analyze_subtitle', 'generate_subtitle')
            ai_api: AI API 인스턴스
            **kwargs: 작업별 파라미터
        """
        super().__init__()
        self.task_type = task_type
        self.ai_api = ai_api
        self.kwargs = kwargs

    def run(self):
        """워커 실행"""
        try:
            if self.task_type == "analyze_frames":
                self._analyze_frames()
            elif self.task_type == "analyze_subtitle":
                self._analyze_subtitle()
            elif self.task_type == "generate_subtitle":
                self._generate_subtitle()
            else:
                self.error.emit(f"알 수 없는 작업 타입: {self.task_type}")
        except Exception as e:
            self.error.emit(str(e))

    def _analyze_frames(self):
        """프레임 분석"""
        frame_paths = self.kwargs['frame_paths']
        self.progress.emit(f"{len(frame_paths)}개 프레임 분석 중...")

        success, analysis, message = self.ai_api.analyze_frames(
            frame_paths,
            self.kwargs.get('prompt', '이 이미지들을 분석하여 영상의 주요 장면을 설명해주세요.'),
            self.kwargs.get('model_type', 'claude')
        )

        if success:
            self.result.emit({
                'success': True,
                'analysis': analysis,
                'frame_count': len(frame_paths)
            })
        else:
            self.error.emit(message)

    def _analyze_subtitle(self):
        """자막 분석"""
        self.progress.emit("자막 분석 중...")

        success, analysis, message = self.ai_api.analyze_subtitle(
            self.kwargs['subtitle_text'],
            self.kwargs.get('analysis_goal', 'general'),
            self.kwargs.get('model_type', 'claude')
        )

        if success:
            self.result.emit({
                'success': True,
                'analysis': analysis,
                'goal': self.kwargs.get('analysis_goal', 'general')
            })
        else:
            self.error.emit(message)

    def _generate_subtitle(self):
        """자막 생성"""
        frame_paths = self.kwargs['frame_paths']
        language = self.kwargs.get('language', 'ko')

        self.progress.emit(f"{len(frame_paths)}개 프레임 기반 자막 생성 중...")

        success, subtitle_text, message = self.ai_api.generate_subtitle_from_frames(
            frame_paths,
            language,
            self.kwargs.get('model_type', 'claude')
        )

        if success:
            self.result.emit({
                'success': True,
                'subtitle_text': subtitle_text,
                'language': language,
                'frame_count': len(frame_paths)
            })
        else:
            self.error.emit(message)
