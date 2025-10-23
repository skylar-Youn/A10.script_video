#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
비디오 처리 워커
백그라운드에서 비디오 처리를 수행합니다.
"""

from PyQt5.QtCore import QThread, pyqtSignal
from typing import List, Optional
from ..api.video_api import VideoAPI
from ..api.subtitle_api import SubtitleAPI


class VideoWorker(QThread):
    """비디오 처리 워커"""

    progress = pyqtSignal(str)  # 진행 상태 메시지
    result = pyqtSignal(dict)    # 결과
    error = pyqtSignal(str)      # 에러

    def __init__(
        self,
        task_type: str,
        video_api: VideoAPI,
        subtitle_api: Optional[SubtitleAPI] = None,
        **kwargs
    ):
        """
        Args:
            task_type: 작업 타입 ('cut', 'merge', 'extract_frames', 'add_subtitle')
            video_api: 비디오 API 인스턴스
            subtitle_api: 자막 API 인스턴스
            **kwargs: 작업별 파라미터
        """
        super().__init__()
        self.task_type = task_type
        self.video_api = video_api
        self.subtitle_api = subtitle_api
        self.kwargs = kwargs

    def run(self):
        """워커 실행"""
        try:
            if self.task_type == "cut":
                self._cut_video()
            elif self.task_type == "merge":
                self._merge_videos()
            elif self.task_type == "extract_frames":
                self._extract_frames()
            elif self.task_type == "add_subtitle":
                self._add_subtitle()
            else:
                self.error.emit(f"알 수 없는 작업 타입: {self.task_type}")
        except Exception as e:
            self.error.emit(str(e))

    def _cut_video(self):
        """비디오 자르기"""
        self.progress.emit(f"비디오 자르기 시작...")

        success, output_path, message = self.video_api.cut_video(
            self.kwargs['input_path'],
            self.kwargs['start_time'],
            self.kwargs['end_time'],
            self.kwargs.get('output_path')
        )

        if success:
            self.result.emit({
                'success': True,
                'output_path': output_path,
                'message': message
            })
        else:
            self.error.emit(message)

    def _merge_videos(self):
        """비디오 합치기"""
        input_paths = self.kwargs['input_paths']
        self.progress.emit(f"{len(input_paths)}개 비디오 합치기 시작...")

        success, output_path, message = self.video_api.merge_videos(
            input_paths,
            self.kwargs.get('output_path')
        )

        if success:
            self.result.emit({
                'success': True,
                'output_path': output_path,
                'message': message
            })
        else:
            self.error.emit(message)

    def _extract_frames(self):
        """프레임 추출"""
        interval = self.kwargs.get('interval', 5)
        self.progress.emit(f"{interval}초 간격으로 프레임 추출 시작...")

        success, frame_paths, message = self.video_api.extract_frames(
            self.kwargs['input_path'],
            interval,
            self.kwargs.get('output_dir')
        )

        if success:
            self.result.emit({
                'success': True,
                'frame_paths': frame_paths,
                'count': len(frame_paths),
                'message': message
            })
        else:
            self.error.emit(message)

    def _add_subtitle(self):
        """자막 추가"""
        if not self.subtitle_api:
            self.error.emit("SubtitleAPI가 초기화되지 않았습니다")
            return

        self.progress.emit("자막 추가 시작...")

        success, output_path, message = self.subtitle_api.add_subtitle_to_video(
            self.kwargs['video_path'],
            self.kwargs['subtitle_content'],
            self.kwargs.get('output_path')
        )

        if success:
            self.result.emit({
                'success': True,
                'output_path': output_path,
                'message': message
            })
        else:
            self.error.emit(message)
