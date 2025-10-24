#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
유틸리티 함수 모듈
"""

import re


def convert_shorts_to_watch_url(url):
    """
    YouTube Shorts URL을 일반 watch URL로 변환
    예: https://youtube.com/shorts/VIDEO_ID -> https://www.youtube.com/watch?v=VIDEO_ID
    """
    if not url:
        return url

    # Shorts URL 패턴 감지
    shorts_pattern = r'(?:https?://)?(?:www\.)?(?:youtube\.com|youtu\.be)/shorts/([a-zA-Z0-9_-]+)'
    match = re.search(shorts_pattern, url)

    if match:
        video_id = match.group(1)
        return f"https://www.youtube.com/watch?v={video_id}"

    return url


def remove_timestamps_from_subtitle(subtitle_content):
    """
    자막 파일(SRT, VTT)에서 타임스탬프를 제거하고 텍스트만 추출
    """
    lines = subtitle_content.split('\n')
    text_lines = []

    # SRT 형식 처리
    for line in lines:
        line = line.strip()

        # 빈 줄 무시
        if not line:
            continue

        # 숫자만 있는 줄 (자막 번호) 무시
        if line.isdigit():
            continue

        # 타임스탬프 형식 감지 및 무시
        # SRT: 00:00:00,000 --> 00:00:05,000
        # VTT: 00:00:00.000 --> 00:00:05.000
        if '-->' in line:
            continue

        # WEBVTT 헤더 무시
        if line.startswith('WEBVTT') or line.startswith('NOTE'):
            continue

        # 실제 텍스트 줄만 추가
        text_lines.append(line)

    return '\n'.join(text_lines)
