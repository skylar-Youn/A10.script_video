#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube Hot Finder - 메인 진입점
모듈화된 버전
"""

import sys
import os

# 현재 디렉토리를 Python 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# 원본 애플리케이션 실행
from app import main

if __name__ == '__main__':
    main()
