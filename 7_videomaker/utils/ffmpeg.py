#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FFmpeg 유틸리티 모듈
FFmpeg 명령어 생성 및 실행을 담당합니다.
"""

import subprocess
from pathlib import Path
from typing import List, Optional, Tuple


class FFmpegUtils:
    """FFmpeg 유틸리티 클래스"""

    @staticmethod
    def check_installed() -> bool:
        """FFmpeg 설치 여부 확인"""
        try:
            subprocess.run(
                ['ffmpeg', '-version'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=True
            )
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False

    @staticmethod
    def get_video_info(video_path: str) -> dict:
        """비디오 정보 조회"""
        try:
            cmd = [
                'ffprobe',
                '-v', 'quiet',
                '-print_format', 'json',
                '-show_format',
                '-show_streams',
                video_path
            ]

            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True,
                check=True
            )

            import json
            return json.loads(result.stdout)

        except Exception as e:
            raise Exception(f"비디오 정보 조회 실패: {str(e)}")

    @staticmethod
    def cut_video(
        input_path: str,
        output_path: str,
        start_time: str,
        end_time: str
    ) -> Tuple[bool, str]:
        """
        비디오 자르기

        Args:
            input_path: 입력 비디오 경로
            output_path: 출력 비디오 경로
            start_time: 시작 시간 (HH:MM:SS)
            end_time: 종료 시간 (HH:MM:SS)

        Returns:
            (성공 여부, 메시지)
        """
        try:
            cmd = [
                'ffmpeg', '-y',
                '-i', input_path,
                '-ss', start_time,
                '-to', end_time,
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-preset', 'fast',
                output_path
            ]

            process = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True
            )

            if process.returncode == 0:
                return True, f"비디오 자르기 완료: {output_path}"
            else:
                return False, f"FFmpeg 오류: {process.stderr}"

        except Exception as e:
            return False, f"비디오 자르기 실패: {str(e)}"

    @staticmethod
    def merge_videos(
        input_paths: List[str],
        output_path: str
    ) -> Tuple[bool, str]:
        """
        비디오 합치기

        Args:
            input_paths: 입력 비디오 경로 리스트
            output_path: 출력 비디오 경로

        Returns:
            (성공 여부, 메시지)
        """
        import tempfile
        import os

        try:
            # 임시 파일 목록 생성
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
                for video_path in input_paths:
                    f.write(f"file '{video_path}'\n")
                list_file = f.name

            try:
                cmd = [
                    'ffmpeg', '-y',
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', list_file,
                    '-c', 'copy',
                    output_path
                ]

                process = subprocess.run(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    universal_newlines=True
                )

                if process.returncode == 0:
                    return True, f"비디오 합치기 완료: {output_path}"
                else:
                    return False, f"FFmpeg 오류: {process.stderr}"

            finally:
                os.unlink(list_file)

        except Exception as e:
            return False, f"비디오 합치기 실패: {str(e)}"

    @staticmethod
    def extract_frames(
        input_path: str,
        output_dir: str,
        interval: int = 1
    ) -> Tuple[bool, List[str], str]:
        """
        프레임 추출

        Args:
            input_path: 입력 비디오 경로
            output_dir: 출력 디렉토리
            interval: 추출 간격 (초)

        Returns:
            (성공 여부, 프레임 경로 리스트, 메시지)
        """
        try:
            Path(output_dir).mkdir(parents=True, exist_ok=True)

            cmd = [
                'ffmpeg', '-y',
                '-i', input_path,
                '-vf', f'fps=1/{interval}',
                str(Path(output_dir) / 'frame_%04d.png')
            ]

            process = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True
            )

            if process.returncode == 0:
                frames = sorted(Path(output_dir).glob('frame_*.png'))
                frame_paths = [str(f) for f in frames]
                return True, frame_paths, f"{len(frame_paths)}개 프레임 추출 완료"
            else:
                return False, [], f"FFmpeg 오류: {process.stderr}"

        except Exception as e:
            return False, [], f"프레임 추출 실패: {str(e)}"

    @staticmethod
    def add_subtitle(
        input_path: str,
        subtitle_path: str,
        output_path: str
    ) -> Tuple[bool, str]:
        """
        자막 추가

        Args:
            input_path: 입력 비디오 경로
            subtitle_path: 자막 파일 경로
            output_path: 출력 비디오 경로

        Returns:
            (성공 여부, 메시지)
        """
        try:
            cmd = [
                'ffmpeg', '-y',
                '-i', input_path,
                '-vf', f"subtitles={subtitle_path}",
                '-c:a', 'copy',
                output_path
            ]

            process = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True
            )

            if process.returncode == 0:
                return True, f"자막 추가 완료: {output_path}"
            else:
                return False, f"FFmpeg 오류: {process.stderr}"

        except Exception as e:
            return False, f"자막 추가 실패: {str(e)}"

    @staticmethod
    def extract_audio(
        input_path: str,
        output_path: str
    ) -> Tuple[bool, str]:
        """
        오디오 추출

        Args:
            input_path: 입력 비디오 경로
            output_path: 출력 오디오 경로

        Returns:
            (성공 여부, 메시지)
        """
        try:
            cmd = [
                'ffmpeg', '-y',
                '-i', input_path,
                '-vn',
                '-acodec', 'pcm_s16le',
                '-ar', '16000',
                '-ac', '1',
                output_path
            ]

            process = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True
            )

            if process.returncode == 0:
                return True, f"오디오 추출 완료: {output_path}"
            else:
                return False, f"FFmpeg 오류: {process.stderr}"

        except Exception as e:
            return False, f"오디오 추출 실패: {str(e)}"
