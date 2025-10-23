#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
자막 처리 API
자막 생성 및 편집 관련 API를 제공합니다.
"""

import tempfile
from pathlib import Path
from typing import Tuple, Optional
from ..utils.ffmpeg import FFmpegUtils
from ..utils.file_utils import FileUtils


class SubtitleAPI:
    """자막 처리 API 클래스"""

    def __init__(self, output_dir: Optional[Path] = None):
        """
        Args:
            output_dir: 출력 디렉토리
        """
        self.output_dir = output_dir or Path.home() / 'Videos' / 'videomaker_output'
        self.ffmpeg = FFmpegUtils()

    def add_subtitle_to_video(
        self,
        video_path: str,
        subtitle_content: str,
        output_path: Optional[str] = None
    ) -> Tuple[bool, str, str]:
        """
        영상에 자막 추가

        Args:
            video_path: 입력 비디오 경로
            subtitle_content: 자막 내용 (SRT 형식)
            output_path: 출력 경로 (선택사항)

        Returns:
            (성공 여부, 출력 경로, 메시지)
        """
        # 입력 파일 검증
        if not FileUtils.validate_file_exists(video_path):
            return False, '', f"입력 파일을 찾을 수 없습니다: {video_path}"

        # 임시 자막 파일 생성
        try:
            with tempfile.NamedTemporaryFile(
                mode='w',
                suffix='.srt',
                delete=False,
                encoding='utf-8'
            ) as f:
                f.write(subtitle_content)
                temp_subtitle_path = f.name

            # 출력 경로 생성
            if not output_path:
                output_path = str(FileUtils.generate_output_filename(
                    'with_subtitle',
                    'mp4',
                    self.output_dir
                ))

            # 자막 추가 실행
            success, message = self.ffmpeg.add_subtitle(
                video_path,
                temp_subtitle_path,
                output_path
            )

            # 임시 파일 삭제
            import os
            os.unlink(temp_subtitle_path)

            if success:
                return True, output_path, message
            else:
                return False, '', message

        except Exception as e:
            return False, '', f"자막 추가 실패: {str(e)}"

    def load_subtitle_file(self, subtitle_path: str) -> Tuple[bool, str, str]:
        """
        자막 파일 로드

        Args:
            subtitle_path: 자막 파일 경로

        Returns:
            (성공 여부, 자막 내용, 메시지)
        """
        if not FileUtils.validate_file_exists(subtitle_path):
            return False, '', f"자막 파일을 찾을 수 없습니다: {subtitle_path}"

        try:
            with open(subtitle_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return True, content, "자막 파일 로드 완료"
        except Exception as e:
            return False, '', f"자막 파일 로드 실패: {str(e)}"

    def save_subtitle_file(
        self,
        subtitle_content: str,
        output_path: Optional[str] = None
    ) -> Tuple[bool, str, str]:
        """
        자막 파일 저장

        Args:
            subtitle_content: 자막 내용
            output_path: 출력 경로 (선택사항)

        Returns:
            (성공 여부, 출력 경로, 메시지)
        """
        if not subtitle_content:
            return False, '', "자막 내용이 비어있습니다"

        try:
            # 출력 경로 생성
            if not output_path:
                output_path = str(FileUtils.generate_output_filename(
                    'subtitle',
                    'srt',
                    self.output_dir
                ))

            # 확장자 확인
            output_path = FileUtils.ensure_extension(output_path, '.srt')

            # 자막 저장
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(subtitle_content)

            return True, output_path, f"자막 파일 저장 완료: {output_path}"

        except Exception as e:
            return False, '', f"자막 파일 저장 실패: {str(e)}"

    @staticmethod
    def validate_srt_format(subtitle_content: str) -> Tuple[bool, str]:
        """
        SRT 형식 검증

        Args:
            subtitle_content: 자막 내용

        Returns:
            (유효 여부, 메시지)
        """
        if not subtitle_content.strip():
            return False, "자막 내용이 비어있습니다"

        lines = subtitle_content.strip().split('\n')

        if len(lines) < 3:
            return False, "SRT 형식이 올바르지 않습니다 (최소 3줄 필요)"

        import re
        time_pattern = re.compile(r'\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}')

        has_valid_timestamp = False
        for line in lines:
            if time_pattern.match(line.strip()):
                has_valid_timestamp = True
                break

        if not has_valid_timestamp:
            return False, "유효한 타임스탬프를 찾을 수 없습니다"

        return True, "유효한 SRT 형식입니다"
