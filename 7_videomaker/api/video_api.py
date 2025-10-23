#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
비디오 처리 API
비디오 편집 관련 API를 제공합니다.
"""

from pathlib import Path
from typing import List, Tuple, Optional
from ..utils.ffmpeg import FFmpegUtils
from ..utils.file_utils import FileUtils


class VideoAPI:
    """비디오 처리 API 클래스"""

    def __init__(self, output_dir: Optional[Path] = None):
        """
        Args:
            output_dir: 출력 디렉토리
        """
        self.output_dir = output_dir or Path.home() / 'Videos' / 'videomaker_output'
        self.ffmpeg = FFmpegUtils()

    def cut_video(
        self,
        input_path: str,
        start_time: str,
        end_time: str,
        output_path: Optional[str] = None
    ) -> Tuple[bool, str, str]:
        """
        비디오 자르기

        Args:
            input_path: 입력 비디오 경로
            start_time: 시작 시간 (HH:MM:SS)
            end_time: 종료 시간 (HH:MM:SS)
            output_path: 출력 경로 (선택사항)

        Returns:
            (성공 여부, 출력 경로, 메시지)
        """
        # 입력 파일 검증
        if not FileUtils.validate_file_exists(input_path):
            return False, '', f"입력 파일을 찾을 수 없습니다: {input_path}"

        # 출력 경로 생성
        if not output_path:
            output_path = str(FileUtils.generate_output_filename(
                'cut',
                'mp4',
                self.output_dir
            ))

        # 비디오 자르기 실행
        success, message = self.ffmpeg.cut_video(
            input_path,
            output_path,
            start_time,
            end_time
        )

        if success:
            return True, output_path, message
        else:
            return False, '', message

    def merge_videos(
        self,
        input_paths: List[str],
        output_path: Optional[str] = None
    ) -> Tuple[bool, str, str]:
        """
        비디오 합치기

        Args:
            input_paths: 입력 비디오 경로 리스트
            output_path: 출력 경로 (선택사항)

        Returns:
            (성공 여부, 출력 경로, 메시지)
        """
        # 입력 파일 검증
        for input_path in input_paths:
            if not FileUtils.validate_file_exists(input_path):
                return False, '', f"입력 파일을 찾을 수 없습니다: {input_path}"

        # 출력 경로 생성
        if not output_path:
            output_path = str(FileUtils.generate_output_filename(
                'merged',
                'mp4',
                self.output_dir
            ))

        # 비디오 합치기 실행
        success, message = self.ffmpeg.merge_videos(
            input_paths,
            output_path
        )

        if success:
            return True, output_path, message
        else:
            return False, '', message

    def extract_frames(
        self,
        input_path: str,
        interval: int = 5,
        output_dir: Optional[str] = None
    ) -> Tuple[bool, List[str], str]:
        """
        프레임 추출

        Args:
            input_path: 입력 비디오 경로
            interval: 추출 간격 (초)
            output_dir: 출력 디렉토리 (선택사항)

        Returns:
            (성공 여부, 프레임 경로 리스트, 메시지)
        """
        # 입력 파일 검증
        if not FileUtils.validate_file_exists(input_path):
            return False, [], f"입력 파일을 찾을 수 없습니다: {input_path}"

        # 출력 디렉토리 생성
        if not output_dir:
            output_dir = str(FileUtils.generate_output_dir(
                'frames',
                self.output_dir
            ))

        # 프레임 추출 실행
        success, frame_paths, message = self.ffmpeg.extract_frames(
            input_path,
            output_dir,
            interval
        )

        return success, frame_paths, message

    def get_video_info(self, video_path: str) -> dict:
        """
        비디오 정보 조회

        Args:
            video_path: 비디오 경로

        Returns:
            비디오 정보 딕셔너리
        """
        if not FileUtils.validate_file_exists(video_path):
            return {'error': f"파일을 찾을 수 없습니다: {video_path}"}

        try:
            return self.ffmpeg.get_video_info(video_path)
        except Exception as e:
            return {'error': str(e)}
