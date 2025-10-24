#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
자막 추출 API 모듈
YouTube URL 및 로컬 영상 파일에서 자막 추출
"""

import os
import subprocess
import time
import glob

try:
    import yt_dlp
    YT_DLP_AVAILABLE = True
except ImportError:
    YT_DLP_AVAILABLE = False


class SubtitleExtractor:
    """자막 추출 클래스"""

    def __init__(self):
        pass

    def extract_from_url(self, url, languages, subtitle_format, output_dir,
                        remove_timestamps=False, progress_callback=None):
        """
        YouTube URL에서 자막 추출

        Args:
            url: YouTube URL
            languages: 추출할 언어 리스트 ['ko', 'en', 'ja']
            subtitle_format: 자막 형식 (srt, vtt, ass, best)
            output_dir: 저장 폴더
            remove_timestamps: 타임스탬프 제거 여부
            progress_callback: 진행률 콜백 함수

        Returns:
            (success_count, error_message)
        """
        if not YT_DLP_AVAILABLE:
            return 0, "⚠️ yt-dlp가 설치되어 있지 않습니다."

        try:
            from ..utils.helpers import convert_shorts_to_watch_url, remove_timestamps_from_subtitle

            # Shorts URL 변환
            url = convert_shorts_to_watch_url(url)

            subtitle_files = []
            total_steps = len(languages) + (1 if remove_timestamps else 0)

            # 각 언어별로 순차 다운로드 (HTTP 429 방지)
            for idx, lang in enumerate(languages):
                current_step = idx + 1

                if progress_callback:
                    progress_callback(current_step, total_steps, f"{lang} 자막 다운로드 중...")

                # 3초 대기 (첫 언어 제외)
                if idx > 0:
                    for i in range(3, 0, -1):
                        if progress_callback:
                            progress_callback(current_step, total_steps,
                                            f"{i}초 후 {lang} 자막 다운로드...")
                        time.sleep(1)

                # 하나의 언어씩 다운로드
                ydl_opts = {
                    'skip_download': True,
                    'writesubtitles': True,
                    'writeautomaticsub': True,
                    'subtitleslangs': [lang],
                    'outtmpl': os.path.join(output_dir, '%(title)s.%(ext)s'),
                    'subtitlesformat': subtitle_format,
                    'quiet': True,
                    'no_warnings': True,
                }

                try:
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([url])

                    # 다운로드된 자막 파일 찾기
                    for ext in ['srt', 'vtt', 'ass']:
                        pattern = os.path.join(output_dir, f"*{lang}*.{ext}")
                        files = glob.glob(pattern)
                        subtitle_files.extend(files)

                        if files:
                            if progress_callback:
                                progress_callback(current_step, total_steps,
                                                f"✓ {lang} 자막 다운로드 완료")
                            break

                except Exception as e:
                    if progress_callback:
                        progress_callback(current_step, total_steps,
                                        f"❌ {lang} 자막 다운로드 실패: {str(e)}")

            # 타임스탬프 제거
            if remove_timestamps and subtitle_files:
                if progress_callback:
                    progress_callback(total_steps, total_steps, "타임스탬프 제거 중...")

                for sub_file in subtitle_files:
                    try:
                        with open(sub_file, 'r', encoding='utf-8') as f:
                            content = f.read()

                        text_only = remove_timestamps_from_subtitle(content)

                        # .txt 파일로 저장
                        txt_file = sub_file.rsplit('.', 1)[0] + '.txt'
                        with open(txt_file, 'w', encoding='utf-8') as f:
                            f.write(text_only)

                    except Exception as e:
                        if progress_callback:
                            progress_callback(total_steps, total_steps,
                                            f"⚠️ 타임스탬프 제거 실패: {str(e)}")

            return len(subtitle_files), None

        except Exception as e:
            return 0, f"❌ 자막 추출 실패: {str(e)}"

    def extract_from_file(self, video_path, languages, subtitle_format, output_dir,
                         remove_timestamps=False, progress_callback=None):
        """
        로컬 영상 파일에서 자막 추출 (ffmpeg 사용)

        Args:
            video_path: 영상 파일 경로
            languages: 추출할 언어 리스트 ['ko', 'en', 'ja']
            subtitle_format: 자막 형식 (srt, vtt, ass)
            output_dir: 저장 폴더
            remove_timestamps: 타임스탬프 제거 여부
            progress_callback: 진행률 콜백 함수

        Returns:
            (success_count, error_message)
        """
        try:
            from ..utils.helpers import remove_timestamps_from_subtitle

            # ffprobe로 자막 트랙 확인
            probe_cmd = [
                'ffprobe', '-v', 'error',
                '-show_entries', 'stream=index:stream_tags=language',
                '-select_streams', 's',
                '-of', 'json',
                video_path
            ]

            probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)

            if probe_result.returncode != 0:
                return 0, "❌ ffprobe 실행 실패. ffmpeg가 설치되어 있는지 확인하세요."

            import json
            probe_data = json.loads(probe_result.stdout)

            if 'streams' not in probe_data or len(probe_data['streams']) == 0:
                return 0, "⚠️ 영상 파일에 내장 자막이 없습니다."

            # 비디오 파일명
            video_basename = os.path.splitext(os.path.basename(video_path))[0]
            subtitle_files = []
            success_count = 0

            # 각 자막 스트림 추출
            for stream in probe_data['streams']:
                stream_index = stream['index']
                lang = stream.get('tags', {}).get('language', 'unknown')

                # 지정된 언어만 추출
                if languages and lang not in languages:
                    continue

                # 자막 파일명
                output_file = os.path.join(output_dir, f"{video_basename}.{lang}.{subtitle_format}")

                # ffmpeg로 자막 추출
                extract_cmd = [
                    'ffmpeg', '-y',
                    '-i', video_path,
                    '-map', f'0:{stream_index}',
                    output_file
                ]

                extract_result = subprocess.run(extract_cmd, capture_output=True, text=True)

                if extract_result.returncode == 0:
                    subtitle_files.append(output_file)
                    success_count += 1

                    if progress_callback:
                        progress_callback(success_count, len(probe_data['streams']),
                                        f"✓ {lang} 자막 추출 완료")

            # 타임스탬프 제거
            if remove_timestamps and subtitle_files:
                for sub_file in subtitle_files:
                    try:
                        with open(sub_file, 'r', encoding='utf-8') as f:
                            content = f.read()

                        text_only = remove_timestamps_from_subtitle(content)

                        # .txt 파일로 저장
                        txt_file = sub_file.rsplit('.', 1)[0] + '.txt'
                        with open(txt_file, 'w', encoding='utf-8') as f:
                            f.write(text_only)

                    except Exception as e:
                        if progress_callback:
                            progress_callback(success_count, len(probe_data['streams']),
                                            f"⚠️ 타임스탬프 제거 실패: {str(e)}")

            return success_count, None

        except Exception as e:
            return 0, f"❌ 자막 추출 실패: {str(e)}"
