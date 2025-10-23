#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
파일 유틸리티 모듈
파일 관련 유틸리티 함수를 제공합니다.
"""

from pathlib import Path
from datetime import datetime
from typing import Optional


class FileUtils:
    """파일 유틸리티 클래스"""

    @staticmethod
    def generate_output_filename(
        prefix: str,
        extension: str = 'mp4',
        output_dir: Optional[Path] = None
    ) -> Path:
        """
        타임스탬프 기반 출력 파일명 생성

        Args:
            prefix: 파일명 접두사 (예: 'cut', 'merged')
            extension: 파일 확장자 (기본값: 'mp4')
            output_dir: 출력 디렉토리 (기본값: None)

        Returns:
            출력 파일 경로
        """
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'{prefix}_{timestamp}.{extension}'

        if output_dir:
            output_dir = Path(output_dir)
            output_dir.mkdir(parents=True, exist_ok=True)
            return output_dir / filename
        else:
            return Path(filename)

    @staticmethod
    def generate_output_dir(
        prefix: str,
        parent_dir: Optional[Path] = None
    ) -> Path:
        """
        타임스탬프 기반 출력 디렉토리 생성

        Args:
            prefix: 디렉토리명 접두사 (예: 'frames')
            parent_dir: 부모 디렉토리 (기본값: None)

        Returns:
            출력 디렉토리 경로
        """
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        dirname = f'{prefix}_{timestamp}'

        if parent_dir:
            parent_dir = Path(parent_dir)
            parent_dir.mkdir(parents=True, exist_ok=True)
            output_dir = parent_dir / dirname
        else:
            output_dir = Path(dirname)

        output_dir.mkdir(parents=True, exist_ok=True)
        return output_dir

    @staticmethod
    def validate_file_exists(file_path: str) -> bool:
        """
        파일 존재 여부 확인

        Args:
            file_path: 파일 경로

        Returns:
            존재 여부
        """
        return Path(file_path).exists() and Path(file_path).is_file()

    @staticmethod
    def get_file_size_mb(file_path: str) -> float:
        """
        파일 크기 조회 (MB)

        Args:
            file_path: 파일 경로

        Returns:
            파일 크기 (MB)
        """
        try:
            size_bytes = Path(file_path).stat().st_size
            return size_bytes / (1024 * 1024)
        except Exception:
            return 0.0

    @staticmethod
    def ensure_extension(file_path: str, extension: str) -> str:
        """
        파일 확장자 확인 및 추가

        Args:
            file_path: 파일 경로
            extension: 확장자 (점 포함 가능)

        Returns:
            확장자가 있는 파일 경로
        """
        path = Path(file_path)
        if not extension.startswith('.'):
            extension = '.' + extension

        if path.suffix.lower() != extension.lower():
            return str(path.with_suffix(extension))
        return str(path)
