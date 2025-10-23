#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Video Maker - 메인 애플리케이션

모듈화된 비디오 편집 도구의 진입점입니다.
API 인터페이스를 사용하여 비디오 처리, 자막 생성, AI 분석 등을 수행합니다.
"""

import sys
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# 기존 7.videomaker.py를 실행
# 향후 완전히 모듈화된 UI로 전환할 수 있습니다.
if __name__ == '__main__':
    # 기존 애플리케이션 실행
    old_videomaker = project_root / '7.videomaker.py'

    if old_videomaker.exists():
        print("=" * 60)
        print("Video Maker - 모듈화된 버전")
        print("=" * 60)
        print(f"기존 UI 실행: {old_videomaker}")
        print()
        print("모듈화된 API를 사용하려면:")
        print("  from 7_videomaker.api import VideoAPI, SubtitleAPI, AIAPI")
        print("  from 7_videomaker.config import Config")
        print("=" * 60)
        print()

        # 기존 파일 실행
        with open(old_videomaker, 'r', encoding='utf-8') as f:
            code = f.read()
        exec(code)
    else:
        print(f"Error: {old_videomaker} 파일을 찾을 수 없습니다.")
        sys.exit(1)
