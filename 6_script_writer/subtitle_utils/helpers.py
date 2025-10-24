#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
유틸리티 함수들
"""

import re


def remove_subtitle_timestamps(content):
    """자막에서 타임스탬프 제거하고 텍스트만 추출"""
    lines = content.split('\n')
    text_lines = []

    # SRT/VTT 패턴: 숫자 인덱스, 타임스탬프, 빈 줄 제거
    timestamp_pattern = re.compile(r'^\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}')
    index_pattern = re.compile(r'^\d+$')

    for line in lines:
        line = line.strip()

        # 빈 줄, 인덱스, 타임스탬프 건너뛰기
        if not line or index_pattern.match(line) or timestamp_pattern.match(line):
            continue

        # WEBVTT 헤더 건너뛰기
        if line.startswith('WEBVTT') or line.startswith('NOTE'):
            continue

        text_lines.append(line)

    return '\n'.join(text_lines)
