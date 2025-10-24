#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube Hot Finder (통합 버전)
- API 키 사용/미사용 모두 지원
- 설정에서 선택 가능
"""

import sys
import json
import os
import csv
import subprocess
import webbrowser
import re
from datetime import datetime, timedelta
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout,
                             QHBoxLayout, QTabWidget, QLabel, QLineEdit,
                             QPushButton, QTableWidget, QTableWidgetItem,
                             QComboBox, QSpinBox, QDoubleSpinBox,
                             QTextEdit, QGroupBox, QGridLayout, QMessageBox,
                             QHeaderView, QProgressBar, QRadioButton, QButtonGroup,
                             QFileDialog, QCheckBox)
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QFont
import time
import urllib.request
import urllib.parse

# API 모듈 import
try:
    from api import PixabayDownloader, PexelsDownloader, GoogleDownloader, SubtitleExtractor
    API_MODULES_AVAILABLE = True
except ImportError:
    API_MODULES_AVAILABLE = False

# 라이브러리 가용성 확인
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

try:
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
    GOOGLE_API_AVAILABLE = True
except ImportError:
    GOOGLE_API_AVAILABLE = False

try:
    import yt_dlp
    YT_DLP_AVAILABLE = True
except ImportError:
    YT_DLP_AVAILABLE = False

try:
    from rembg import remove, new_session
    from PIL import Image
    REMBG_AVAILABLE = True
except ImportError:
    REMBG_AVAILABLE = False


# 유틸리티 함수
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


class YouTubeAPIWorker(QThread):
    """YouTube API 작업을 별도 스레드에서 처리"""
    progress = pyqtSignal(str)
    result = pyqtSignal(list)
    error = pyqtSignal(str)

    def __init__(self, api_key, search_params):
        super().__init__()
        self.api_key = api_key
        self.search_params = search_params

    def run(self):
        try:
            youtube = build('youtube', 'v3', developerKey=self.api_key)
            results = []

            self.progress.emit("키워드로 영상 검색 중...")
            search_response = youtube.search().list(
                q=self.search_params['query'],
                part='snippet',
                maxResults=self.search_params['max_results'],
                type='video',
                order=self.search_params.get('order', 'relevance'),
                regionCode=self.search_params.get('region', 'KR'),
                relevanceLanguage=self.search_params.get('language', 'ko')
            ).execute()

            video_ids = [item['id']['videoId'] for item in search_response.get('items', [])]

            # 영상 상세 정보 가져오기
            if video_ids:
                self.progress.emit(f"{len(video_ids)}개 영상의 상세 정보 수집 중...")
                videos_response = youtube.videos().list(
                    part='snippet,statistics,contentDetails',
                    id=','.join(video_ids)
                ).execute()

                for video in videos_response.get('items', []):
                    try:
                        # 채널 정보 가져오기
                        channel_id = video['snippet']['channelId']
                        channel_response = youtube.channels().list(
                            part='statistics',
                            id=channel_id
                        ).execute()

                        if channel_response['items']:
                            subscriber_count = int(channel_response['items'][0]['statistics'].get('subscriberCount', 0))
                        else:
                            subscriber_count = 0

                        # 조회수 및 시간당 조회수 계산
                        view_count = int(video['statistics'].get('viewCount', 0))
                        published_at = datetime.strptime(video['snippet']['publishedAt'], '%Y-%m-%dT%H:%M:%SZ')
                        hours_since_published = max(1, (datetime.utcnow() - published_at).total_seconds() / 3600)
                        views_per_hour = view_count / hours_since_published

                        # 조회수/구독자수 비율
                        views_per_subscriber = view_count / subscriber_count if subscriber_count > 0 else 0

                        # 필터링
                        if view_count < self.search_params.get('min_views', 0):
                            continue
                        if views_per_hour < self.search_params.get('min_views_per_hour', 0):
                            continue

                        results.append({
                            'channel_name': video['snippet']['channelTitle'],
                            'title': video['snippet']['title'],
                            'video_id': video['id'],
                            'published_at': published_at.strftime('%Y-%m-%d %H:%M'),
                            'view_count': view_count,
                            'views_per_hour': round(views_per_hour, 2),
                            'subscriber_count': subscriber_count,
                            'views_per_subscriber': round(views_per_subscriber, 4),
                            'like_count': int(video['statistics'].get('likeCount', 0)),
                            'comment_count': int(video['statistics'].get('commentCount', 0))
                        })

                    except Exception as e:
                        self.progress.emit(f"영상 처리 중 오류: {str(e)}")
                        continue

                # 시간당 조회수 기준으로 정렬
                results.sort(key=lambda x: x['views_per_hour'], reverse=True)

            self.result.emit(results)

        except HttpError as e:
            self.error.emit(f"YouTube API 오류: {str(e)}")
        except Exception as e:
            self.error.emit(f"오류 발생: {str(e)}")


class YouTubeScraperWorker(QThread):
    """yt-dlp를 사용한 YouTube 검색 (API 키 불필요)"""
    progress = pyqtSignal(str)
    result = pyqtSignal(list)
    error = pyqtSignal(str)

    def __init__(self, search_params):
        super().__init__()
        self.search_params = search_params

    def run(self):
        try:
            results = []
            query = self.search_params['query']
            max_results = self.search_params.get('max_results', 20)

            self.progress.emit(f"'{query}' 검색 중... (yt-dlp 사용)")

            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': False,
                'skip_download': True,
                'format': 'best',
            }

            search_url = f"ytsearch{max_results}:{query}"

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                self.progress.emit("영상 정보 수집 중...")
                info = ydl.extract_info(search_url, download=False)

                if 'entries' in info:
                    for idx, entry in enumerate(info['entries'][:max_results]):
                        try:
                            if not entry:
                                continue

                            upload_date = entry.get('upload_date', '')
                            if upload_date:
                                try:
                                    published_at = datetime.strptime(upload_date, '%Y%m%d')
                                except:
                                    published_at = datetime.now()
                            else:
                                published_at = datetime.now()

                            view_count = entry.get('view_count', 0) or 0
                            hours_since_published = max(1, (datetime.now() - published_at).total_seconds() / 3600)
                            views_per_hour = view_count / hours_since_published

                            subscriber_count = entry.get('channel_follower_count', 0) or 0
                            views_per_subscriber = view_count / subscriber_count if subscriber_count > 0 else 0

                            # 영상 길이
                            duration = entry.get('duration', 0) or 0

                            # 필터링
                            if view_count < self.search_params.get('min_views', 0):
                                continue
                            if views_per_hour < self.search_params.get('min_views_per_hour', 0):
                                continue

                            # 영상 길이 필터링
                            video_length_filter = self.search_params.get('video_length_filter', 'all')
                            if video_length_filter == 'shorts':
                                # 숏폼만
                                if duration > self.search_params.get('shorts_max_duration', 60):
                                    continue
                            elif video_length_filter == 'long':
                                # 롱폼만
                                if duration < self.search_params.get('long_min_duration', 600):
                                    continue

                            results.append({
                                'channel_name': entry.get('uploader', entry.get('channel', 'Unknown')),
                                'title': entry.get('title', 'No Title'),
                                'video_id': entry.get('id', ''),
                                'published_at': published_at.strftime('%Y-%m-%d %H:%M'),
                                'view_count': view_count,
                                'views_per_hour': round(views_per_hour, 2),
                                'subscriber_count': subscriber_count,
                                'views_per_subscriber': round(views_per_subscriber, 4),
                                'like_count': entry.get('like_count', 0) or 0,
                                'comment_count': entry.get('comment_count', 0) or 0,
                                'duration': duration
                            })

                            self.progress.emit(f"처리 중... {idx+1}/{max_results}")

                        except Exception as e:
                            self.progress.emit(f"영상 처리 중 오류: {str(e)}")
                            continue

                results.sort(key=lambda x: x['views_per_hour'], reverse=True)

            self.result.emit(results)

        except Exception as e:
            self.error.emit(f"오류 발생: {str(e)}")


class YouTubeHotFinderUnified(QMainWindow):
    def __init__(self):
        super().__init__()
        self.config_file = 'youtube_finder_unified_config.json'
        self.load_config()
        self.init_ui()

    def load_config(self):
        """설정 파일 로드"""
        default_config = {
            'api_keys': [],
            'current_api_key_index': 0,
            'search_mode': 'auto',  # 'api', 'scraper', 'auto'
            'max_results_per_search': 20,
            'min_views_per_hour': 600.0,
            'min_views': 20000,
            'target_country': 'KR',
            'language': 'ko',
            'video_length_filter': 'all',  # 'all', 'shorts', 'long'
            'shorts_max_duration': 60,  # 숏폼 최대 길이 (초)
            'long_min_duration': 600  # 롱폼 최소 길이 (초, 10분)
        }

        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    self.config = {**default_config, **json.load(f)}
            except:
                self.config = default_config
        else:
            self.config = default_config

    def save_config(self):
        """설정 파일 저장"""
        with open(self.config_file, 'w', encoding='utf-8') as f:
            json.dump(self.config, f, ensure_ascii=False, indent=2)

    def init_ui(self):
        """UI 초기화"""
        self.setWindowTitle('YouTube Hot Finder (통합 버전)')
        self.setGeometry(100, 100, 1400, 800)

        # 메인 위젯
        main_widget = QWidget()
        self.setCentralWidget(main_widget)
        layout = QVBoxLayout(main_widget)

        # 라이브러리 상태 표시
        status_text = []
        if GOOGLE_API_AVAILABLE:
            status_text.append("✅ Google API 사용 가능")
        else:
            status_text.append("❌ Google API 미설치 (pip install google-api-python-client)")

        if YT_DLP_AVAILABLE:
            status_text.append("✅ yt-dlp 사용 가능")
        else:
            status_text.append("❌ yt-dlp 미설치 (pip install yt-dlp)")

        status_label = QLabel(" | ".join(status_text))
        status_label.setStyleSheet("background-color: #f0f0f0; padding: 5px; font-size: 10px;")
        layout.addWidget(status_label)

        # 탭 위젯
        self.tabs = QTabWidget()
        layout.addWidget(self.tabs)

        # 각 탭 생성
        self.create_keyword_tab()
        self.create_settings_tab()
        self.create_results_tab()
        self.create_ytdl_tab()
        self.create_free_media_tab()
        self.create_background_removal_tab()

        # 상태바
        self.statusBar().showMessage('준비 (통합 버전)')

    def create_keyword_tab(self):
        """키워드입력 탭"""
        tab = QWidget()
        layout = QVBoxLayout(tab)

        # 검색 예제 선택
        example_group = QGroupBox("🎯 인기 검색 예제 (클릭하여 자동 입력)")
        example_layout = QVBoxLayout()

        # 45개의 검색 예제 (9개 카테고리)
        self.search_examples = {
            "🎮 게임": [
                "스타크래프트 프로게이머",
                "리그오브레전드 하이라이트",
                "마인크래프트 서바이벌",
                "오버워치 플레이",
                "배틀그라운드 꿀팁"
            ],
            "📚 교육": [
                "파이썬 기초 강의",
                "영어회화 공부",
                "주식 투자 초보",
                "포토샵 튜토리얼",
                "엑셀 함수 정리"
            ],
            "🍳 요리": [
                "간단한 요리 레시피",
                "다이어트 식단",
                "백종원 요리",
                "홈베이킹 디저트",
                "한식 요리법"
            ],
            "🎵 음악": [
                "커버곡 노래",
                "버스킹 공연",
                "힙합 랩 메이킹",
                "기타 연주",
                "K-POP 댄스"
            ],
            "💪 운동/건강": [
                "홈트레이닝 루틴",
                "다이어트 운동",
                "요가 스트레칭",
                "헬스 초보 가이드",
                "러닝 마라톤"
            ],
            "💰 재테크": [
                "부동산 투자",
                "코인 비트코인",
                "재테크 노하우",
                "주식 차트 분석",
                "경제 뉴스 해설"
            ],
            "🎬 엔터테인먼트": [
                "예능 클립 모음",
                "영화 리뷰 평론",
                "드라마 명장면",
                "웹예능 콘텐츠",
                "유튜버 브이로그"
            ],
            "🇰🇷 국뽕": [
                "외국인 한국 반응",
                "K-POP 세계 반응",
                "한국 문화 자랑",
                "한국 음식 리뷰",
                "한글날 한국어",
                "해외감동사연",
                "한국 역사"
            ],
            "💡 자기계발/지식": [
                "AI 인공지능",
                "ChatGPT AI",
                "동기부여 스피치",
                "TED 강연",
                "신기술 트렌드",
                "미래 기술",
                "자기계발 성공",
                "생산성 향상"
            ],
            "🔮 초자연 미스테리 외계인": [
                "UFO 목격",
                "외계인 영상",
                "초능력 실험",
                "귀신 영상",
                "괴담 실화",
                "미스터리 사건",
                "미제 사건",
                "도시전설"
            ],
            "🛸 UFO & Mystery (Global)": [
                "UFO sighting",
                "alien footage",
                "psychic powers",
                "ghost caught on camera",
                "paranormal activity",
                "unsolved mystery",
                "conspiracy theory",
                "urban legend",
                "supernatural phenomena"
            ],
            "👴 시니어": [
                "건강 정보 노인",
                "스마트폰 사용법 초보",
                "연금 노후 준비",
                "손자녀 육아팁",
                "시니어 여행 추천"
            ],
            "📱 쇼츠 (한국)": [
                "동물 쇼츠",
                "강아지 쇼츠",
                "고양이 쇼츠",
                "펫 쇼츠",
                "웃긴 동물 영상",
                "동물 먹방 쇼츠",
                "댄스 쇼츠",
                "요리 쇼츠 레시피",
                "로봇 쇼츠",
                "웃긴 순간",
                "만족 영상"
            ],
            "🌍 Shorts (Global)": [
                "animal shorts",
                "cute dog shorts",
                "funny cat shorts",
                "pet compilation",
                "baby animals shorts",
                "dance challenge shorts",
                "cooking shorts recipe",
                "robot shorts",
                "robotics shorts",
                "life hacks shorts",
                "funny moments shorts",
                "satisfying shorts"
            ]
        }

        # 카테고리별 버튼 생성
        for category, keywords in self.search_examples.items():
            category_widget = QWidget()
            category_layout = QHBoxLayout(category_widget)
            category_layout.setContentsMargins(0, 5, 0, 5)

            category_label = QLabel(category)
            category_label.setFixedWidth(150)
            category_label.setStyleSheet("font-weight: bold; font-size: 11px;")
            category_layout.addWidget(category_label)

            for keyword in keywords:
                btn = QPushButton(keyword)
                btn.setMaximumWidth(150)
                btn.setStyleSheet("""
                    QPushButton {
                        background-color: #f0f0f0;
                        border: 1px solid #ccc;
                        border-radius: 4px;
                        padding: 5px 10px;
                        font-size: 10px;
                    }
                    QPushButton:hover {
                        background-color: #e0e0e0;
                        border-color: #999;
                    }
                    QPushButton:pressed {
                        background-color: #d0d0d0;
                    }
                """)
                btn.clicked.connect(lambda checked, k=keyword: self.set_keyword(k))
                category_layout.addWidget(btn)

            category_layout.addStretch()
            example_layout.addWidget(category_widget)

        example_group.setLayout(example_layout)
        layout.addWidget(example_group)

        # 키워드 입력
        input_group = QGroupBox("키워드 검색")
        input_layout = QGridLayout()

        input_layout.addWidget(QLabel("검색 키워드:"), 0, 0)
        self.keyword_input = QLineEdit()
        self.keyword_input.setPlaceholderText("검색할 키워드를 입력하세요 (위 예제 버튼 클릭 또는 직접 입력)")
        input_layout.addWidget(self.keyword_input, 0, 1)

        search_btn = QPushButton("검색 시작")
        search_btn.clicked.connect(self.search_keyword)
        search_btn.setStyleSheet("background-color: #4CAF50; color: white; padding: 8px; font-weight: bold;")
        input_layout.addWidget(search_btn, 0, 2)

        input_group.setLayout(input_layout)
        layout.addWidget(input_group)

        # 진행 상황
        self.progress_bar = QProgressBar()
        self.progress_bar.setVisible(False)
        layout.addWidget(self.progress_bar)

        self.progress_label = QLabel("")
        layout.addWidget(self.progress_label)

        layout.addStretch()

        self.tabs.addTab(tab, "키워드입력")

    def set_keyword(self, keyword):
        """검색 예제 버튼 클릭 시 키워드 설정"""
        self.keyword_input.setText(keyword)
        self.statusBar().showMessage(f"키워드 선택됨: {keyword}")

    def create_settings_tab(self):
        """설정 탭"""
        tab = QWidget()
        layout = QVBoxLayout(tab)

        # 검색 모드 선택
        mode_group = QGroupBox("🔧 검색 방식 선택")
        mode_layout = QVBoxLayout()

        self.mode_button_group = QButtonGroup()

        self.auto_radio = QRadioButton("자동 선택 (API 키가 있으면 API 사용, 없으면 yt-dlp 사용)")
        self.api_radio = QRadioButton("Google API 강제 사용 (빠르지만 할당량 제한)")
        self.scraper_radio = QRadioButton("yt-dlp 강제 사용 (느리지만 무제한)")

        self.mode_button_group.addButton(self.auto_radio, 0)
        self.mode_button_group.addButton(self.api_radio, 1)
        self.mode_button_group.addButton(self.scraper_radio, 2)

        # 현재 설정 불러오기
        if self.config['search_mode'] == 'api':
            self.api_radio.setChecked(True)
        elif self.config['search_mode'] == 'scraper':
            self.scraper_radio.setChecked(True)
        else:
            self.auto_radio.setChecked(True)

        mode_layout.addWidget(self.auto_radio)
        mode_layout.addWidget(self.api_radio)
        mode_layout.addWidget(self.scraper_radio)

        # 라이브러리 상태에 따라 비활성화
        if not GOOGLE_API_AVAILABLE:
            self.api_radio.setEnabled(False)
            self.api_radio.setText(self.api_radio.text() + " [미설치]")

        if not YT_DLP_AVAILABLE:
            self.scraper_radio.setEnabled(False)
            self.scraper_radio.setText(self.scraper_radio.text() + " [미설치]")

        mode_group.setLayout(mode_layout)
        layout.addWidget(mode_group)

        # API 키 설정
        api_group = QGroupBox("🔑 Google API 키 관리 (선택사항)")
        api_layout = QVBoxLayout()

        key_input_layout = QHBoxLayout()
        key_input_layout.addWidget(QLabel("API 키:"))
        self.api_key_input = QLineEdit()
        self.api_key_input.setPlaceholderText("YouTube Data API v3 키 (없으면 yt-dlp 사용)")
        key_input_layout.addWidget(self.api_key_input)

        add_key_btn = QPushButton("추가")
        add_key_btn.clicked.connect(self.add_api_key)
        key_input_layout.addWidget(add_key_btn)

        api_layout.addLayout(key_input_layout)

        self.api_key_list = QTextEdit()
        self.api_key_list.setReadOnly(True)
        self.api_key_list.setMaximumHeight(80)
        api_layout.addWidget(QLabel("등록된 API 키:"))
        api_layout.addWidget(self.api_key_list)
        self.update_api_key_list()

        api_group.setLayout(api_layout)
        layout.addWidget(api_group)

        # 검색 설정
        search_group = QGroupBox("🔍 검색 설정")
        search_layout = QGridLayout()

        row = 0
        search_layout.addWidget(QLabel("최대 검색 결과 수:"), row, 0)
        self.max_results = QSpinBox()
        self.max_results.setRange(1, 50)
        self.max_results.setValue(self.config['max_results_per_search'])
        search_layout.addWidget(self.max_results, row, 1)

        search_layout.addWidget(QLabel("최소 조회수:"), row, 2)
        self.min_views = QSpinBox()
        self.min_views.setRange(0, 10000000)
        self.min_views.setValue(self.config['min_views'])
        search_layout.addWidget(self.min_views, row, 3)

        row += 1
        search_layout.addWidget(QLabel("최소 시간당 조회수:"), row, 0)
        self.min_views_per_hour = QDoubleSpinBox()
        self.min_views_per_hour.setRange(0, 1000000)
        self.min_views_per_hour.setValue(self.config['min_views_per_hour'])
        search_layout.addWidget(self.min_views_per_hour, row, 1)

        search_layout.addWidget(QLabel("대상 국가:"), row, 2)
        self.country_input = QComboBox()
        countries = [
            ('🇰🇷 한국', 'KR'),
            ('🇺🇸 미국', 'US'),
            ('🇯🇵 일본', 'JP'),
            ('🇮🇳 인도', 'IN'),
            ('🇨🇳 중국', 'CN'),
            ('🇬🇧 영국', 'GB'),
            ('🇩🇪 독일', 'DE'),
            ('🇫🇷 프랑스', 'FR'),
            ('🇮🇹 이탈리아', 'IT'),
            ('🇪🇸 스페인', 'ES'),
            ('🇨🇦 캐나다', 'CA'),
            ('🇦🇺 호주', 'AU'),
            ('🇧🇷 브라질', 'BR'),
            ('🇲🇽 멕시코', 'MX'),
            ('🇷🇺 러시아', 'RU'),
            ('🇹🇭 태국', 'TH'),
            ('🇻🇳 베트남', 'VN'),
            ('🇸🇬 싱가포르', 'SG'),
            ('🇹🇼 대만', 'TW')
        ]
        for name, code in countries:
            self.country_input.addItem(name, code)
        # 현재 설정된 국가 선택
        current_idx = self.country_input.findData(self.config['target_country'])
        if current_idx >= 0:
            self.country_input.setCurrentIndex(current_idx)
        search_layout.addWidget(self.country_input, row, 3)

        row += 1
        search_layout.addWidget(QLabel("언어:"), row, 0)
        self.language_input = QComboBox()
        languages = [
            ('한국어', 'ko'),
            ('English', 'en'),
            ('日本語', 'ja'),
            ('中文', 'zh'),
            ('Español', 'es'),
            ('Français', 'fr'),
            ('Deutsch', 'de'),
            ('हिन्दी', 'hi'),
            ('Português', 'pt'),
            ('Русский', 'ru'),
            ('Italiano', 'it'),
            ('العربية', 'ar'),
            ('ไทย', 'th'),
            ('Tiếng Việt', 'vi'),
            ('Bahasa Indonesia', 'id'),
            ('Türkçe', 'tr')
        ]
        for name, code in languages:
            self.language_input.addItem(name, code)
        # 현재 설정된 언어 선택
        lang_idx = self.language_input.findData(self.config['language'])
        if lang_idx >= 0:
            self.language_input.setCurrentIndex(lang_idx)
        search_layout.addWidget(self.language_input, row, 1)

        search_group.setLayout(search_layout)
        layout.addWidget(search_group)

        # 영상 길이 필터 설정
        length_group = QGroupBox("📏 영상 길이 필터")
        length_layout = QGridLayout()

        row = 0
        length_layout.addWidget(QLabel("영상 유형:"), row, 0)
        self.video_length_combo = QComboBox()
        self.video_length_combo.addItems(['전체', '숏폼만 (짧은 영상)', '롱폼만 (긴 영상)'])

        # 현재 설정 불러오기
        if self.config['video_length_filter'] == 'shorts':
            self.video_length_combo.setCurrentIndex(1)
        elif self.config['video_length_filter'] == 'long':
            self.video_length_combo.setCurrentIndex(2)
        else:
            self.video_length_combo.setCurrentIndex(0)

        length_layout.addWidget(self.video_length_combo, row, 1)

        length_layout.addWidget(QLabel("숏폼 최대 길이 (초):"), row, 2)
        self.shorts_duration = QSpinBox()
        self.shorts_duration.setRange(10, 300)
        self.shorts_duration.setValue(self.config['shorts_max_duration'])
        self.shorts_duration.setSuffix("초")
        length_layout.addWidget(self.shorts_duration, row, 3)

        row += 1
        length_layout.addWidget(QLabel("롱폼 최소 길이 (초):"), row, 0)
        self.long_duration = QSpinBox()
        self.long_duration.setRange(60, 3600)
        self.long_duration.setValue(self.config['long_min_duration'])
        self.long_duration.setSuffix("초")
        length_layout.addWidget(self.long_duration, row, 1)

        # 도움말
        help_label = QLabel("💡 숏폼: YouTube 쇼츠 같은 짧은 영상 | 롱폼: 긴 영상 (기본 10분 이상)")
        help_label.setStyleSheet("color: #666; font-size: 10px;")
        length_layout.addWidget(help_label, row, 2, 1, 2)

        length_group.setLayout(length_layout)
        layout.addWidget(length_group)

        # 저장 버튼
        save_layout = QHBoxLayout()
        save_layout.addStretch()

        save_btn = QPushButton("설정 저장")
        save_btn.clicked.connect(self.save_settings)
        save_layout.addWidget(save_btn)

        load_btn = QPushButton("설정 불러오기")
        load_btn.clicked.connect(self.load_settings)
        save_layout.addWidget(load_btn)

        layout.addLayout(save_layout)
        layout.addStretch()

        self.tabs.addTab(tab, "설정")

    def create_results_tab(self):
        """결과 탭"""
        tab = QWidget()
        layout = QVBoxLayout(tab)

        # 결과 테이블
        self.results_table = QTableWidget()
        self.results_table.setColumnCount(12)
        self.results_table.setHorizontalHeaderLabels([
            '채널명', '제목', '업로드일', '조회수', '시간당 조회수',
            '구독자수', '조회수/구독자수', '좋아요', '댓글', 'URL', '바로가기', '다운로드'
        ])

        # 테이블 설정
        header = self.results_table.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeToContents)
        header.setSectionResizeMode(1, QHeaderView.Stretch)
        header.setSectionResizeMode(9, QHeaderView.ResizeToContents)

        self.results_table.setAlternatingRowColors(True)
        self.results_table.setSelectionBehavior(QTableWidget.SelectRows)

        layout.addWidget(self.results_table)

        # 버튼
        btn_layout = QHBoxLayout()

        export_btn = QPushButton("💾 내보내기 (CSV)")
        export_btn.clicked.connect(self.export_results)
        btn_layout.addWidget(export_btn)

        import_btn = QPushButton("📂 불러오기 (CSV)")
        import_btn.clicked.connect(self.import_results)
        btn_layout.addWidget(import_btn)

        clear_results_btn = QPushButton("🗑️ 결과 지우기")
        clear_results_btn.clicked.connect(self.clear_results)
        btn_layout.addWidget(clear_results_btn)

        btn_layout.addStretch()

        # YouTube 링크 직접 다운로드
        btn_layout.addWidget(QLabel("YouTube 링크:"))
        self.download_url_input = QLineEdit()
        self.download_url_input.setPlaceholderText("https://www.youtube.com/watch?v=...")
        self.download_url_input.setFixedWidth(300)
        btn_layout.addWidget(self.download_url_input)

        direct_download_btn = QPushButton("⬇️ 다운로드")
        direct_download_btn.clicked.connect(self.download_from_input)
        btn_layout.addWidget(direct_download_btn)

        layout.addLayout(btn_layout)

        self.tabs.addTab(tab, "결과")

    def search_keyword(self):
        """키워드 검색"""
        keyword = self.keyword_input.text().strip()

        if not keyword:
            QMessageBox.warning(self, "경고", "검색 키워드를 입력하세요")
            return

        # 검색 모드 결정
        search_mode = self.determine_search_mode()

        if search_mode == 'api':
            if not self.config['api_keys']:
                QMessageBox.warning(self, "경고", "API 키를 등록하거나 설정에서 yt-dlp 모드로 변경하세요")
                return
            self.search_with_api(keyword)
        elif search_mode == 'scraper':
            if not YT_DLP_AVAILABLE:
                QMessageBox.critical(self, "오류", "yt-dlp가 설치되어 있지 않습니다.\n\n터미널에서 다음 명령을 실행하세요:\npip install yt-dlp")
                return
            self.search_with_scraper(keyword)
        else:
            QMessageBox.critical(self, "오류", "사용 가능한 검색 방법이 없습니다.\nAPI 키를 등록하거나 yt-dlp를 설치하세요.")

    def determine_search_mode(self):
        """검색 모드 결정"""
        # 수동 선택
        if self.api_radio.isChecked():
            return 'api'
        elif self.scraper_radio.isChecked():
            return 'scraper'

        # 자동 선택
        if self.config['api_keys'] and GOOGLE_API_AVAILABLE:
            return 'api'
        elif YT_DLP_AVAILABLE:
            return 'scraper'
        else:
            return None

    def search_with_api(self, keyword):
        """Google API로 검색"""
        search_params = {
            'query': keyword,
            'max_results': self.max_results.value(),
            'order': 'relevance',
            'region': self.country_input.currentData(),
            'language': self.language_input.currentData(),
            'min_views': self.min_views.value(),
            'min_views_per_hour': self.min_views_per_hour.value()
        }

        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 0)
        self.statusBar().showMessage(f"'{keyword}' 검색 중... (Google API 사용)")

        api_key = self.config['api_keys'][self.config['current_api_key_index']]
        self.worker = YouTubeAPIWorker(api_key, search_params)
        self.worker.progress.connect(self.on_progress)
        self.worker.result.connect(self.on_search_complete)
        self.worker.error.connect(self.on_search_error)
        self.worker.start()

    def search_with_scraper(self, keyword):
        """yt-dlp로 검색"""
        search_params = {
            'query': keyword,
            'max_results': self.max_results.value(),
            'min_views': self.min_views.value(),
            'min_views_per_hour': self.min_views_per_hour.value(),
            'video_length_filter': self.config['video_length_filter'],
            'shorts_max_duration': self.config['shorts_max_duration'],
            'long_min_duration': self.config['long_min_duration']
        }

        self.progress_bar.setVisible(True)
        self.progress_bar.setRange(0, 0)
        self.statusBar().showMessage(f"'{keyword}' 검색 중... (yt-dlp 사용)")

        self.worker = YouTubeScraperWorker(search_params)
        self.worker.progress.connect(self.on_progress)
        self.worker.result.connect(self.on_search_complete)
        self.worker.error.connect(self.on_search_error)
        self.worker.start()

    def on_progress(self, message):
        """진행 상황 업데이트"""
        self.progress_label.setText(message)
        self.statusBar().showMessage(message)

    def on_search_complete(self, results):
        """검색 완료"""
        self.progress_bar.setVisible(False)
        self.progress_label.setText("")

        if not results:
            QMessageBox.information(self, "알림", "검색 결과가 없습니다")
            self.statusBar().showMessage("검색 완료 - 결과 없음")
            return

        self.display_results(results)
        self.statusBar().showMessage(f"검색 완료 - {len(results)}개 결과")
        self.tabs.setCurrentIndex(2)

    def on_search_error(self, error_msg):
        """검색 오류"""
        self.progress_bar.setVisible(False)
        self.progress_label.setText("")
        QMessageBox.critical(self, "오류", error_msg)
        self.statusBar().showMessage("검색 실패")

    def display_results(self, results):
        """결과를 테이블에 표시"""
        self.results_table.setRowCount(len(results))

        for row, result in enumerate(results):
            self.results_table.setItem(row, 0, QTableWidgetItem(result['channel_name']))
            self.results_table.setItem(row, 1, QTableWidgetItem(result['title']))
            self.results_table.setItem(row, 2, QTableWidgetItem(result['published_at']))
            self.results_table.setItem(row, 3, QTableWidgetItem(f"{result['view_count']:,}"))
            self.results_table.setItem(row, 4, QTableWidgetItem(f"{result['views_per_hour']:.2f}"))
            self.results_table.setItem(row, 5, QTableWidgetItem(f"{result['subscriber_count']:,}"))
            self.results_table.setItem(row, 6, QTableWidgetItem(f"{result['views_per_subscriber']:.4f}"))
            self.results_table.setItem(row, 7, QTableWidgetItem(str(result['like_count'])))
            self.results_table.setItem(row, 8, QTableWidgetItem(str(result['comment_count'])))

            url = f"https://www.youtube.com/watch?v={result['video_id']}"
            self.results_table.setItem(row, 9, QTableWidgetItem(url))

            # 바로가기 버튼 추가
            open_btn = QPushButton("🔗 열기")
            open_btn.clicked.connect(lambda checked, u=url: webbrowser.open(u))
            self.results_table.setCellWidget(row, 10, open_btn)

            # 다운로드 버튼 추가 - YTDL 탭으로 전달
            download_btn = QPushButton("📥 YTDL로")
            download_btn.setToolTip("YTDL 탭으로 URL 전달하여 다운로드")
            download_btn.clicked.connect(lambda checked, u=url: self.send_to_ytdl_tab(u))
            self.results_table.setCellWidget(row, 11, download_btn)

        # 결과가 있으면 자동 저장
        if len(results) > 0:
            self.auto_save_results()

    def auto_save_results(self):
        """결과 자동 저장"""
        try:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f'youtube_results_{timestamp}.csv'

            with open(filename, 'w', encoding='utf-8-sig') as f:
                headers = []
                for col in range(self.results_table.columnCount() - 1):  # 바로가기 버튼 제외
                    headers.append(self.results_table.horizontalHeaderItem(col).text())
                f.write(','.join(headers) + '\n')

                for row in range(self.results_table.rowCount()):
                    row_data = []
                    for col in range(self.results_table.columnCount() - 1):  # 바로가기 버튼 제외
                        item = self.results_table.item(row, col)
                        row_data.append(f'"{item.text()}"' if item else '""')
                    f.write(','.join(row_data) + '\n')

            self.statusBar().showMessage(f"결과가 자동으로 저장되었습니다: {filename}", 3000)
        except Exception as e:
            print(f"자동 저장 중 오류: {str(e)}")

    def add_api_key(self):
        """API 키 추가"""
        api_key = self.api_key_input.text().strip()

        if not api_key:
            QMessageBox.warning(self, "경고", "API 키를 입력하세요")
            return

        if api_key not in self.config['api_keys']:
            self.config['api_keys'].append(api_key)
            self.update_api_key_list()
            self.api_key_input.clear()
            self.statusBar().showMessage("API 키가 추가되었습니다")
        else:
            QMessageBox.information(self, "알림", "이미 등록된 API 키입니다")

    def update_api_key_list(self):
        """API 키 목록 업데이트"""
        if self.config['api_keys']:
            masked_keys = [f"{i+1}. {key[:10]}...{key[-5:]}" for i, key in enumerate(self.config['api_keys'])]
            self.api_key_list.setText('\n'.join(masked_keys))
        else:
            self.api_key_list.setText("등록된 API 키가 없습니다 (yt-dlp 사용)")

    def save_settings(self):
        """설정 저장"""
        if self.auto_radio.isChecked():
            self.config['search_mode'] = 'auto'
        elif self.api_radio.isChecked():
            self.config['search_mode'] = 'api'
        else:
            self.config['search_mode'] = 'scraper'

        self.config['max_results_per_search'] = self.max_results.value()
        self.config['min_views_per_hour'] = self.min_views_per_hour.value()
        self.config['min_views'] = self.min_views.value()
        self.config['target_country'] = self.country_input.currentData()
        self.config['language'] = self.language_input.currentData()

        # 영상 길이 필터 설정
        if self.video_length_combo.currentIndex() == 1:
            self.config['video_length_filter'] = 'shorts'
        elif self.video_length_combo.currentIndex() == 2:
            self.config['video_length_filter'] = 'long'
        else:
            self.config['video_length_filter'] = 'all'

        self.config['shorts_max_duration'] = self.shorts_duration.value()
        self.config['long_min_duration'] = self.long_duration.value()

        self.save_config()
        QMessageBox.information(self, "알림", "설정이 저장되었습니다")
        self.statusBar().showMessage("설정 저장 완료")

    def load_settings(self):
        """설정 불러오기"""
        self.load_config()

        if self.config['search_mode'] == 'api':
            self.api_radio.setChecked(True)
        elif self.config['search_mode'] == 'scraper':
            self.scraper_radio.setChecked(True)
        else:
            self.auto_radio.setChecked(True)

        self.max_results.setValue(self.config['max_results_per_search'])
        self.min_views_per_hour.setValue(self.config['min_views_per_hour'])
        self.min_views.setValue(self.config['min_views'])

        # 국가 선택 설정
        country_idx = self.country_input.findData(self.config['target_country'])
        if country_idx >= 0:
            self.country_input.setCurrentIndex(country_idx)

        # 언어 선택 설정
        lang_idx = self.language_input.findData(self.config['language'])
        if lang_idx >= 0:
            self.language_input.setCurrentIndex(lang_idx)

        # 영상 길이 필터 설정 불러오기
        if self.config['video_length_filter'] == 'shorts':
            self.video_length_combo.setCurrentIndex(1)
        elif self.config['video_length_filter'] == 'long':
            self.video_length_combo.setCurrentIndex(2)
        else:
            self.video_length_combo.setCurrentIndex(0)

        self.shorts_duration.setValue(self.config['shorts_max_duration'])
        self.long_duration.setValue(self.config['long_min_duration'])

        self.update_api_key_list()

        QMessageBox.information(self, "알림", "설정을 불러왔습니다")
        self.statusBar().showMessage("설정 불러오기 완료")

    def export_results(self):
        """결과 내보내기"""
        if self.results_table.rowCount() == 0:
            QMessageBox.warning(self, "경고", "내보낼 결과가 없습니다")
            return

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'youtube_results_{timestamp}.csv'

        try:
            with open(filename, 'w', encoding='utf-8-sig') as f:
                headers = []
                for col in range(self.results_table.columnCount()):
                    headers.append(self.results_table.horizontalHeaderItem(col).text())
                f.write(','.join(headers) + '\n')

                for row in range(self.results_table.rowCount()):
                    row_data = []
                    for col in range(self.results_table.columnCount()):
                        item = self.results_table.item(row, col)
                        row_data.append(f'"{item.text()}"' if item else '""')
                    f.write(','.join(row_data) + '\n')

            QMessageBox.information(self, "알림", f"결과가 {filename}로 저장되었습니다")
            self.statusBar().showMessage(f"결과 내보내기 완료: {filename}")
        except Exception as e:
            QMessageBox.critical(self, "오류", f"파일 저장 중 오류: {str(e)}")

    def clear_results(self):
        """결과 지우기"""
        self.results_table.setRowCount(0)
        self.statusBar().showMessage("결과가 지워졌습니다")

    def download_from_input(self):
        """입력란의 YouTube 링크로 다운로드"""
        url = self.download_url_input.text().strip()

        if not url:
            QMessageBox.warning(self, "경고", "YouTube 링크를 입력하세요")
            return

        if "youtube.com" not in url and "youtu.be" not in url:
            QMessageBox.warning(self, "경고", "유효한 YouTube 링크를 입력하세요")
            return

        self.download_video(url)
        self.download_url_input.clear()

    def download_video(self, url):
        """YouTube 비디오 다운로드"""
        # 다운로드 디렉토리 선택
        download_dir = QFileDialog.getExistingDirectory(
            self,
            "다운로드 폴더 선택",
            os.path.expanduser("~/Downloads")
        )

        if not download_dir:
            return

        try:
            # yt-dlp 명령어 실행
            self.statusBar().showMessage(f"다운로드 중: {url}")

            cmd = [
                'yt-dlp',
                '-o', os.path.join(download_dir, '%(title)s.%(ext)s'),
                url
            ]

            result = subprocess.run(cmd, capture_output=True, text=True)

            if result.returncode == 0:
                QMessageBox.information(self, "성공", f"다운로드 완료!\n폴더: {download_dir}")
                self.statusBar().showMessage("다운로드 완료")
            else:
                QMessageBox.critical(self, "오류", f"다운로드 실패:\n{result.stderr}")
                self.statusBar().showMessage("다운로드 실패")

        except FileNotFoundError:
            QMessageBox.critical(self, "오류", "yt-dlp가 설치되어 있지 않습니다.\n터미널에서 'pip install yt-dlp'를 실행하세요.")
        except Exception as e:
            QMessageBox.critical(self, "오류", f"다운로드 중 오류:\n{str(e)}")

    def import_results(self):
        """결과 불러오기"""
        filename, _ = QFileDialog.getOpenFileName(
            self,
            "결과 파일 불러오기",
            "",
            "CSV Files (*.csv);;All Files (*)"
        )

        if not filename:
            return

        try:
            with open(filename, 'r', encoding='utf-8-sig') as f:
                reader = csv.reader(f)
                headers = next(reader)  # 헤더 읽기

                # 테이블 초기화
                self.results_table.setRowCount(0)

                # 데이터 읽어서 테이블에 추가
                rows = list(reader)
                self.results_table.setRowCount(len(rows))

                for row_idx, row_data in enumerate(rows):
                    # URL 가져오기 (9번째 열)
                    url = row_data[9].strip('"') if len(row_data) > 9 else ""

                    for col_idx, cell_data in enumerate(row_data):
                        if col_idx == 10:  # 바로가기 열
                            open_btn = QPushButton("🔗 열기")
                            open_btn.clicked.connect(lambda checked, u=url: webbrowser.open(u))
                            self.results_table.setCellWidget(row_idx, col_idx, open_btn)
                        elif col_idx == 11:  # 다운로드 열
                            download_btn = QPushButton("📥 YTDL로")
                            download_btn.setToolTip("YTDL 탭으로 URL 전달하여 다운로드")
                            download_btn.clicked.connect(lambda checked, u=url: self.send_to_ytdl_tab(u))
                            self.results_table.setCellWidget(row_idx, col_idx, download_btn)
                        else:
                            # 따옴표 제거
                            clean_data = cell_data.strip('"')
                            self.results_table.setItem(row_idx, col_idx, QTableWidgetItem(clean_data))

                    # CSV에 11번째 열이 없는 경우 다운로드 버튼 추가
                    if len(row_data) <= 11:
                        download_btn = QPushButton("📥 YTDL로")
                        download_btn.setToolTip("YTDL 탭으로 URL 전달하여 다운로드")
                        download_btn.clicked.connect(lambda checked, u=url: self.send_to_ytdl_tab(u))
                        self.results_table.setCellWidget(row_idx, 11, download_btn)

            QMessageBox.information(self, "알림", f"결과를 {filename}에서 불러왔습니다")
            self.statusBar().showMessage(f"결과 불러오기 완료: {filename}")
        except Exception as e:
            QMessageBox.critical(self, "오류", f"파일 불러오기 중 오류: {str(e)}")

    def create_ytdl_tab(self):
        """YTDL 다운로드 탭"""
        tab = QWidget()
        layout = QVBoxLayout(tab)

        # URL 입력 그룹
        url_group = QGroupBox("📥 YouTube 다운로드")
        url_layout = QVBoxLayout()

        # URL 입력
        url_layout.addWidget(QLabel("유튜브 URL (여러 줄 입력 가능):"))
        self.ytdl_urls = QTextEdit()
        self.ytdl_urls.setPlaceholderText("https://www.youtube.com/watch?v=...\nhttps://www.youtube.com/watch?v=...")
        self.ytdl_urls.setMaximumHeight(100)
        url_layout.addWidget(self.ytdl_urls)

        url_group.setLayout(url_layout)
        layout.addWidget(url_group)

        # 다운로드 설정 그룹
        settings_group = QGroupBox("⚙️ 다운로드 설정")
        settings_layout = QGridLayout()

        row = 0
        settings_layout.addWidget(QLabel("저장 폴더:"), row, 0)
        self.ytdl_output_dir = QLineEdit()
        self.ytdl_output_dir.setText(os.path.expanduser("~/Downloads"))
        settings_layout.addWidget(self.ytdl_output_dir, row, 1)

        browse_btn = QPushButton("📁 찾아보기")
        browse_btn.clicked.connect(self.browse_ytdl_directory)
        settings_layout.addWidget(browse_btn, row, 2)

        row += 1
        settings_layout.addWidget(QLabel("자막 언어:"), row, 0)

        # 언어 선택 체크박스
        lang_widget = QWidget()
        lang_layout = QHBoxLayout(lang_widget)
        lang_layout.setContentsMargins(0, 0, 0, 0)

        self.ytdl_lang_ko = QCheckBox("🇰🇷 한국어")
        self.ytdl_lang_ko.setChecked(True)
        lang_layout.addWidget(self.ytdl_lang_ko)

        self.ytdl_lang_en = QCheckBox("🇺🇸 영어")
        self.ytdl_lang_en.setChecked(True)
        lang_layout.addWidget(self.ytdl_lang_en)

        self.ytdl_lang_ja = QCheckBox("🇯🇵 일본어")
        self.ytdl_lang_ja.setChecked(False)
        lang_layout.addWidget(self.ytdl_lang_ja)

        lang_layout.addStretch()
        settings_layout.addWidget(lang_widget, row, 1, 1, 3)

        row += 1
        settings_layout.addWidget(QLabel("자막 형식:"), row, 0)
        self.ytdl_sub_format = QComboBox()
        self.ytdl_sub_format.addItems(['best', 'srt', 'srt/best', 'vtt', 'ass'])
        settings_layout.addWidget(self.ytdl_sub_format, row, 1)

        row += 1
        self.ytdl_download_subs = QCheckBox("자막 다운로드")
        self.ytdl_download_subs.setChecked(True)
        settings_layout.addWidget(self.ytdl_download_subs, row, 0)

        self.ytdl_auto_subs = QCheckBox("자동 생성 자막 포함")
        self.ytdl_auto_subs.setChecked(True)
        settings_layout.addWidget(self.ytdl_auto_subs, row, 1)

        self.ytdl_remove_timestamps = QCheckBox("타임스탬프 제거 (텍스트만)")
        self.ytdl_remove_timestamps.setChecked(False)
        self.ytdl_remove_timestamps.setToolTip("자막에서 타임스탬프를 제거하고 텍스트만 저장합니다")
        settings_layout.addWidget(self.ytdl_remove_timestamps, row, 2)

        row += 1
        self.ytdl_dry_run = QCheckBox("드라이런 (미리보기)")
        settings_layout.addWidget(self.ytdl_dry_run, row, 0)

        settings_group.setLayout(settings_layout)
        layout.addWidget(settings_group)

        # 다운로드 버튼
        btn_layout = QHBoxLayout()
        btn_layout.addStretch()

        start_download_btn = QPushButton("⬇️ 다운로드 시작")
        start_download_btn.setStyleSheet("""
            QPushButton {
                background-color: #4CAF50;
                color: white;
                padding: 10px 20px;
                font-weight: bold;
                font-size: 14px;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #45a049;
            }
        """)
        start_download_btn.clicked.connect(self.start_ytdl_download)
        btn_layout.addWidget(start_download_btn)

        btn_layout.addStretch()
        layout.addLayout(btn_layout)

        # 진행 상황
        self.ytdl_progress_label = QLabel("")
        layout.addWidget(self.ytdl_progress_label)

        # 결과 표시
        self.ytdl_result = QTextEdit()
        self.ytdl_result.setReadOnly(True)
        self.ytdl_result.setMaximumHeight(200)
        layout.addWidget(QLabel("다운로드 결과:"))
        layout.addWidget(self.ytdl_result)

        layout.addStretch()

        self.tabs.addTab(tab, "📥 YTDL 다운로드")

    def browse_ytdl_directory(self):
        """YTDL 저장 폴더 선택"""
        directory = QFileDialog.getExistingDirectory(
            self,
            "저장 폴더 선택",
            self.ytdl_output_dir.text()
        )

        if directory:
            self.ytdl_output_dir.setText(directory)

    def start_ytdl_download(self):
        """YTDL 다운로드 시작"""
        urls_text = self.ytdl_urls.toPlainText().strip()

        if not urls_text:
            QMessageBox.warning(self, "경고", "다운로드할 YouTube URL을 입력하세요")
            return

        # URL 목록 파싱 및 Shorts URL 변환
        urls = [convert_shorts_to_watch_url(url.strip()) for url in urls_text.split('\n') if url.strip()]

        if not urls:
            QMessageBox.warning(self, "경고", "유효한 YouTube URL을 입력하세요")
            return

        # 설정 가져오기
        output_dir = self.ytdl_output_dir.text()

        # 체크박스에서 언어 선택 읽기
        selected_langs = []
        if self.ytdl_lang_ko.isChecked():
            selected_langs.append('ko')
        if self.ytdl_lang_en.isChecked():
            selected_langs.append('en')
        if self.ytdl_lang_ja.isChecked():
            selected_langs.append('ja')

        if not selected_langs:
            QMessageBox.warning(self, "경고", "최소 하나의 자막 언어를 선택하세요")
            return

        sub_langs = ','.join(selected_langs)
        sub_format = self.ytdl_sub_format.currentText()
        download_subs = self.ytdl_download_subs.isChecked()
        auto_subs = self.ytdl_auto_subs.isChecked()
        dry_run = self.ytdl_dry_run.isChecked()
        remove_timestamps = self.ytdl_remove_timestamps.isChecked()

        try:
            # ytdl.py의 download_with_options 함수 사용
            from pathlib import Path

            # 상위 디렉토리의 youtube 폴더를 경로에 추가
            parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            youtube_dir = os.path.join(parent_dir, 'youtube')

            if youtube_dir not in sys.path:
                sys.path.insert(0, youtube_dir)

            try:
                from ytdl import download_with_options
            except ImportError as e:
                QMessageBox.critical(
                    self,
                    "오류",
                    f"ytdl.py 모듈을 찾을 수 없습니다.\n"
                    f"경로: {youtube_dir}\n"
                    f"youtube/ytdl.py 파일이 있는지 확인하세요.\n\n"
                    f"에러: {str(e)}"
                )
                return

            self.ytdl_progress_label.setText("다운로드 중...")
            self.ytdl_result.clear()
            self.statusBar().showMessage("YouTube 다운로드 진행 중...")

            # 다운로드 실행
            downloaded_files = download_with_options(
                urls=urls,
                output_dir=Path(output_dir),
                skip_download=dry_run,
                download_subs=download_subs,
                auto_subs=auto_subs,
                sub_langs=sub_langs,
                sub_format=sub_format
            )

            # 타임스탬프 제거 처리
            text_only_files = []
            if remove_timestamps and not dry_run and download_subs:
                self.ytdl_progress_label.setText("자막 처리 중 (타임스탬프 제거)...")
                for file_path in downloaded_files:
                    # 자막 파일인지 확인 (.srt, .vtt, .ass 등)
                    if file_path.suffix.lower() in ['.srt', '.vtt', '.ass', '.sub']:
                        try:
                            # 자막 파일 읽기
                            with open(file_path, 'r', encoding='utf-8') as f:
                                subtitle_content = f.read()

                            # 타임스탬프 제거
                            text_only = remove_timestamps_from_subtitle(subtitle_content)

                            # 텍스트 파일로 저장 (원본과 같은 디렉토리에 .txt 확장자로)
                            text_file_path = file_path.with_suffix('.txt')
                            with open(text_file_path, 'w', encoding='utf-8') as f:
                                f.write(text_only)

                            text_only_files.append(text_file_path)
                        except Exception as e:
                            print(f"타임스탬프 제거 실패 ({file_path.name}): {e}")

            # 결과 표시
            result_text = []
            if dry_run:
                result_text.append(f"✓ 다운로드 예정 파일: {len(downloaded_files)}개\n")
            else:
                result_text.append(f"✓ 다운로드 완료: {len(downloaded_files)}개 파일\n")
                if text_only_files:
                    result_text.append(f"✓ 텍스트 변환 완료: {len(text_only_files)}개 파일\n")

            result_text.append(f"저장 위치: {output_dir}\n")
            result_text.append(f"자막 언어: {sub_langs}\n")
            if remove_timestamps and text_only_files:
                result_text.append(f"타임스탬프 제거: ✓\n")
            result_text.append("\n파일 목록:\n")

            for file_path in downloaded_files:
                result_text.append(f"  - {file_path.name}\n")

            if text_only_files:
                result_text.append("\n텍스트 파일 (타임스탬프 제거됨):\n")
                for file_path in text_only_files:
                    result_text.append(f"  - {file_path.name}\n")

            self.ytdl_result.setText(''.join(result_text))
            self.ytdl_progress_label.setText("✓ 완료!")

            total_files = len(downloaded_files) + len(text_only_files)
            self.statusBar().showMessage(f"다운로드 완료: {total_files}개 파일")

            completion_msg = f"다운로드 완료!\n{len(downloaded_files)}개 파일"
            if text_only_files:
                completion_msg += f"\n텍스트 변환: {len(text_only_files)}개 파일"
            QMessageBox.information(self, "완료", completion_msg)

        except Exception as e:
            error_msg = f"다운로드 중 오류 발생:\n{str(e)}"
            self.ytdl_result.setText(error_msg)
            self.ytdl_progress_label.setText("❌ 오류 발생")
            self.statusBar().showMessage("다운로드 실패")
            QMessageBox.critical(self, "오류", error_msg)

    def send_to_ytdl_tab(self, url):
        """검색 결과에서 YTDL 탭으로 URL 전달"""
        # YTDL 탭으로 전환
        self.tabs.setCurrentIndex(3)  # YTDL 탭 인덱스

        # 현재 입력된 텍스트 가져오기
        current_text = self.ytdl_urls.toPlainText().strip()

        # URL 추가
        if current_text:
            new_text = current_text + '\n' + url
        else:
            new_text = url

        self.ytdl_urls.setText(new_text)
        self.statusBar().showMessage(f"YTDL 탭에 URL 추가됨: {url}")

    def create_subtitle_extract_tab(self):
        """자막 추출 탭 (API 모듈 사용 안내)"""
        tab = QWidget()
        layout = QVBoxLayout(tab)

        info_label = QLabel(
            "📥 자막 추출 기능\n\n"
            "API 모듈을 사용하여 자막을 추출할 수 있습니다.\n\n"
            "사용 예시:\n"
            "from api import SubtitleExtractor\n"
            "extractor = SubtitleExtractor()\n"
            "extractor.extract_from_url(\n"
            "    url='https://youtube.com/watch?v=XXX',\n"
            "    languages=['ko', 'en'],\n"
            "    subtitle_format='srt',\n"
            "    output_dir='./subtitles'\n"
            ")\n\n"
            "자세한 내용은 README.md를 참고하세요."
        )
        info_label.setWordWrap(True)
        info_label.setStyleSheet("padding: 20px; font-size: 12px; font-family: monospace;")
        layout.addWidget(info_label)

        layout.addStretch()
        self.tabs.addTab(tab, "📥 자막 추출")

    def create_free_media_tab(self):
        """무료 미디어 다운로드 탭"""
        tab = QWidget()
        layout = QVBoxLayout(tab)

        # API 키 설정 그룹
        api_group = QGroupBox("🔑 API 키 설정")
        api_layout = QGridLayout()

        row = 0
        api_layout.addWidget(QLabel("Pixabay API Key:"), row, 0)
        self.pixabay_api_key = QLineEdit()
        self.pixabay_api_key.setPlaceholderText("Pixabay API 키 입력")
        self.pixabay_api_key.setEchoMode(QLineEdit.Password)
        api_layout.addWidget(self.pixabay_api_key, row, 1)

        pixabay_toggle_btn = QPushButton("👁️")
        pixabay_toggle_btn.setMaximumWidth(40)
        pixabay_toggle_btn.setToolTip("API 키 보기/숨기기")
        pixabay_toggle_btn.clicked.connect(lambda: self.toggle_api_key_visibility(self.pixabay_api_key))
        api_layout.addWidget(pixabay_toggle_btn, row, 2)

        row += 1
        api_layout.addWidget(QLabel("Pexels API Key:"), row, 0)
        self.pexels_api_key = QLineEdit()
        self.pexels_api_key.setPlaceholderText("Pexels API 키 입력")
        self.pexels_api_key.setEchoMode(QLineEdit.Password)
        api_layout.addWidget(self.pexels_api_key, row, 1)

        pexels_toggle_btn = QPushButton("👁️")
        pexels_toggle_btn.setMaximumWidth(40)
        pexels_toggle_btn.setToolTip("API 키 보기/숨기기")
        pexels_toggle_btn.clicked.connect(lambda: self.toggle_api_key_visibility(self.pexels_api_key))
        api_layout.addWidget(pexels_toggle_btn, row, 2)

        row += 1
        api_layout.addWidget(QLabel("Google API Key:"), row, 0)
        self.google_api_key = QLineEdit()
        self.google_api_key.setPlaceholderText("Google Custom Search API 키 입력")
        self.google_api_key.setEchoMode(QLineEdit.Password)
        api_layout.addWidget(self.google_api_key, row, 1)

        google_api_toggle_btn = QPushButton("👁️")
        google_api_toggle_btn.setMaximumWidth(40)
        google_api_toggle_btn.setToolTip("API 키 보기/숨기기")
        google_api_toggle_btn.clicked.connect(lambda: self.toggle_api_key_visibility(self.google_api_key))
        api_layout.addWidget(google_api_toggle_btn, row, 2)

        row += 1
        api_layout.addWidget(QLabel("Google Search Engine ID:"), row, 0)
        self.google_search_engine_id = QLineEdit()
        self.google_search_engine_id.setPlaceholderText("Google Search Engine ID 입력")
        self.google_search_engine_id.setEchoMode(QLineEdit.Password)
        api_layout.addWidget(self.google_search_engine_id, row, 1)

        google_se_toggle_btn = QPushButton("👁️")
        google_se_toggle_btn.setMaximumWidth(40)
        google_se_toggle_btn.setToolTip("Search Engine ID 보기/숨기기")
        google_se_toggle_btn.clicked.connect(lambda: self.toggle_api_key_visibility(self.google_search_engine_id))
        api_layout.addWidget(google_se_toggle_btn, row, 2)

        # API 키 저장/불러오기 버튼
        row += 1
        save_api_btn = QPushButton("💾 API 키 저장")
        save_api_btn.clicked.connect(self.save_api_keys)
        api_layout.addWidget(save_api_btn, row, 0)

        load_api_btn = QPushButton("📂 API 키 불러오기")
        load_api_btn.clicked.connect(self.load_api_keys)
        api_layout.addWidget(load_api_btn, row, 1)

        api_group.setLayout(api_layout)
        layout.addWidget(api_group)

        # 앱 시작 시 저장된 API 키 자동 로드
        self.load_api_keys()

        # 다운로드 설정 그룹
        download_group = QGroupBox("⚙️ 다운로드 설정")
        download_layout = QGridLayout()

        row = 0
        download_layout.addWidget(QLabel("키워드:"), row, 0)
        self.media_keyword = QLineEdit()
        self.media_keyword.setPlaceholderText("검색 키워드 (예: sunset, nature)")
        download_layout.addWidget(self.media_keyword, row, 1, 1, 2)

        row += 1
        download_layout.addWidget(QLabel("미디어 타입:"), row, 0)
        self.media_type = QComboBox()
        self.media_type.addItems(['이미지', '영상'])
        download_layout.addWidget(self.media_type, row, 1)

        row += 1
        download_layout.addWidget(QLabel("API 선택:"), row, 0)

        # API 선택 체크박스
        api_checkbox_widget = QWidget()
        api_checkbox_layout = QHBoxLayout(api_checkbox_widget)
        api_checkbox_layout.setContentsMargins(0, 0, 0, 0)

        self.use_pixabay = QCheckBox("Pixabay")
        self.use_pixabay.setChecked(True)
        api_checkbox_layout.addWidget(self.use_pixabay)

        self.use_pexels = QCheckBox("Pexels")
        self.use_pexels.setChecked(False)
        api_checkbox_layout.addWidget(self.use_pexels)

        self.use_google = QCheckBox("Google")
        self.use_google.setChecked(False)
        api_checkbox_layout.addWidget(self.use_google)

        api_checkbox_layout.addStretch()
        download_layout.addWidget(api_checkbox_widget, row, 1, 1, 2)

        row += 1
        download_layout.addWidget(QLabel("다운로드 개수:"), row, 0)
        self.media_count = QSpinBox()
        self.media_count.setMinimum(1)
        self.media_count.setMaximum(50)
        self.media_count.setValue(5)
        download_layout.addWidget(self.media_count, row, 1)

        row += 1
        download_layout.addWidget(QLabel("저장 폴더:"), row, 0)
        self.media_output_dir = QLineEdit()
        self.media_output_dir.setText(os.path.expanduser("~/Downloads/free_media"))
        download_layout.addWidget(self.media_output_dir, row, 1)

        browse_media_btn = QPushButton("📁 찾아보기")
        browse_media_btn.clicked.connect(self.browse_media_directory)
        download_layout.addWidget(browse_media_btn, row, 2)

        download_group.setLayout(download_layout)
        layout.addWidget(download_group)

        # 다운로드 버튼
        btn_layout = QHBoxLayout()
        btn_layout.addStretch()

        start_media_download_btn = QPushButton("⬇️ 다운로드 시작")
        start_media_download_btn.setStyleSheet("""
            QPushButton {
                background-color: #FF6B6B;
                color: white;
                padding: 10px 20px;
                font-weight: bold;
                font-size: 14px;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #FF5252;
            }
        """)
        start_media_download_btn.clicked.connect(self.start_media_download)
        btn_layout.addWidget(start_media_download_btn)

        btn_layout.addStretch()
        layout.addLayout(btn_layout)

        # 진행 상황
        self.media_progress_label = QLabel("")
        layout.addWidget(self.media_progress_label)

        self.media_progress_bar = QProgressBar()
        self.media_progress_bar.setVisible(False)
        layout.addWidget(self.media_progress_bar)

        # 결과 표시
        self.media_result = QTextEdit()
        self.media_result.setReadOnly(True)
        self.media_result.setMaximumHeight(200)
        layout.addWidget(QLabel("다운로드 결과:"))
        layout.addWidget(self.media_result)

        layout.addStretch()

        self.tabs.addTab(tab, "🎨 무료 미디어")

    def browse_media_directory(self):
        """무료 미디어 저장 폴더 선택"""
        directory = QFileDialog.getExistingDirectory(
            self,
            "저장 폴더 선택",
            self.media_output_dir.text()
        )

        if directory:
            self.media_output_dir.setText(directory)

    def start_media_download(self):
        """무료 미디어 다운로드 시작"""
        keyword = self.media_keyword.text().strip()

        if not keyword:
            QMessageBox.warning(self, "경고", "키워드를 입력하세요")
            return

        # API 선택 확인
        use_apis = []
        if self.use_pixabay.isChecked():
            use_apis.append('pixabay')
        if self.use_pexels.isChecked():
            use_apis.append('pexels')
        if self.use_google.isChecked():
            use_apis.append('google')

        if not use_apis:
            QMessageBox.warning(self, "경고", "최소 하나의 API를 선택하세요")
            return

        # 설정 가져오기
        output_dir = self.media_output_dir.text()
        count = self.media_count.value()
        media_type = self.media_type.currentText()
        is_video = (media_type == '영상')

        # 저장 폴더 생성
        os.makedirs(output_dir, exist_ok=True)

        # 진행 상황 초기화
        self.media_progress_label.setText("다운로드 중...")
        self.media_progress_bar.setVisible(True)
        self.media_progress_bar.setMaximum(count * len(use_apis))
        self.media_progress_bar.setValue(0)
        self.media_result.clear()
        self.statusBar().showMessage("무료 미디어 다운로드 진행 중...")

        result_text = []
        total_success = 0
        current_progress = 0

        try:
            # Pixabay 다운로드
            if 'pixabay' in use_apis:
                pixabay_key = self.pixabay_api_key.text().strip()
                if not pixabay_key:
                    result_text.append("⚠️ Pixabay: API 키가 입력되지 않았습니다.\n")
                else:
                    try:
                        from api.media_downloader import PixabayDownloader
                        downloader = PixabayDownloader(pixabay_key)

                        def progress_callback(current, total, message=None):
                            nonlocal current_progress
                            current_progress += 1
                            self.media_progress_bar.setValue(current_progress)
                            if message:
                                self.media_result.append(message)

                        if is_video:
                            success, error = downloader.download_videos(
                                keyword, count, output_dir, progress_callback
                            )
                        else:
                            success, error = downloader.download_images(
                                keyword, count, output_dir, progress_callback
                            )

                        if error:
                            result_text.append(f"Pixabay: {error}\n")
                        else:
                            result_text.append(f"✓ Pixabay: {success}개 다운로드 완료\n")
                            total_success += success

                    except Exception as e:
                        result_text.append(f"❌ Pixabay 오류: {str(e)}\n")

            # Pexels 다운로드
            if 'pexels' in use_apis:
                pexels_key = self.pexels_api_key.text().strip()
                if not pexels_key:
                    result_text.append("⚠️ Pexels: API 키가 입력되지 않았습니다.\n")
                else:
                    try:
                        from api.media_downloader import PexelsDownloader
                        downloader = PexelsDownloader(pexels_key)

                        def progress_callback(current, total, message=None):
                            nonlocal current_progress
                            current_progress += 1
                            self.media_progress_bar.setValue(current_progress)
                            if message:
                                self.media_result.append(message)

                        if is_video:
                            success, error = downloader.download_videos(
                                keyword, count, output_dir, progress_callback
                            )
                        else:
                            success, error = downloader.download_images(
                                keyword, count, output_dir, progress_callback
                            )

                        if error:
                            result_text.append(f"Pexels: {error}\n")
                        else:
                            result_text.append(f"✓ Pexels: {success}개 다운로드 완료\n")
                            total_success += success

                    except Exception as e:
                        result_text.append(f"❌ Pexels 오류: {str(e)}\n")

            # Google 다운로드
            if 'google' in use_apis:
                google_key = self.google_api_key.text().strip()
                search_engine_id = self.google_search_engine_id.text().strip()

                if not google_key or not search_engine_id:
                    result_text.append("⚠️ Google: API 키 또는 Search Engine ID가 입력되지 않았습니다.\n")
                else:
                    try:
                        from api.media_downloader import GoogleDownloader
                        downloader = GoogleDownloader(google_key, search_engine_id)

                        def progress_callback(current, total, message=None):
                            nonlocal current_progress
                            current_progress += 1
                            self.media_progress_bar.setValue(current_progress)
                            if message:
                                self.media_result.append(message)

                        if is_video:
                            success, error = downloader.download_youtube_videos(
                                keyword, count, output_dir, progress_callback
                            )
                        else:
                            success, error = downloader.download_images(
                                keyword, count, output_dir, progress_callback
                            )

                        if error:
                            result_text.append(f"Google: {error}\n")
                        else:
                            result_text.append(f"✓ Google: {success}개 다운로드 완료\n")
                            total_success += success

                    except Exception as e:
                        result_text.append(f"❌ Google 오류: {str(e)}\n")

            # 최종 결과
            result_text.append(f"\n{'='*50}\n")
            result_text.append(f"총 {total_success}개 파일 다운로드 완료\n")
            result_text.append(f"저장 위치: {output_dir}\n")

            self.media_result.setText(''.join(result_text))
            self.media_progress_label.setText("✓ 완료!")
            self.media_progress_bar.setVisible(False)
            self.statusBar().showMessage(f"다운로드 완료: {total_success}개 파일")

            QMessageBox.information(self, "완료", f"다운로드 완료!\n{total_success}개 파일")

        except Exception as e:
            error_msg = f"다운로드 중 오류 발생:\n{str(e)}"
            self.media_result.setText(error_msg)
            self.media_progress_label.setText("❌ 오류 발생")
            self.media_progress_bar.setVisible(False)
            self.statusBar().showMessage("다운로드 실패")
            QMessageBox.critical(self, "오류", error_msg)

    def toggle_api_key_visibility(self, line_edit):
        """API 키 보기/숨기기 토글"""
        if line_edit.echoMode() == QLineEdit.Password:
            line_edit.setEchoMode(QLineEdit.Normal)
        else:
            line_edit.setEchoMode(QLineEdit.Password)

    def save_api_keys(self):
        """API 키 저장"""
        try:
            api_keys = {
                'pixabay_api_key': self.pixabay_api_key.text(),
                'pexels_api_key': self.pexels_api_key.text(),
                'google_api_key': self.google_api_key.text(),
                'google_search_engine_id': self.google_search_engine_id.text()
            }

            # 설정 파일에 저장
            config_file = 'api_keys_config.json'
            with open(config_file, 'w', encoding='utf-8') as f:
                json.dump(api_keys, f, ensure_ascii=False, indent=2)

            QMessageBox.information(self, "저장 완료", "API 키가 안전하게 저장되었습니다.")
            self.statusBar().showMessage("API 키 저장 완료")

        except Exception as e:
            QMessageBox.critical(self, "오류", f"API 키 저장 중 오류:\n{str(e)}")

    def load_api_keys(self):
        """API 키 불러오기"""
        try:
            config_file = 'api_keys_config.json'
            if os.path.exists(config_file):
                with open(config_file, 'r', encoding='utf-8') as f:
                    api_keys = json.load(f)

                self.pixabay_api_key.setText(api_keys.get('pixabay_api_key', ''))
                self.pexels_api_key.setText(api_keys.get('pexels_api_key', ''))
                self.google_api_key.setText(api_keys.get('google_api_key', ''))
                self.google_search_engine_id.setText(api_keys.get('google_search_engine_id', ''))

                if any(api_keys.values()):
                    self.statusBar().showMessage("저장된 API 키를 불러왔습니다")

        except Exception as e:
            # 파일이 없거나 오류가 있어도 조용히 무시 (첫 실행 시)
            pass

    def create_background_removal_tab(self):
        """이미지 배경 제거 탭"""
        tab = QWidget()
        layout = QVBoxLayout(tab)

        # 라이브러리 상태 체크
        if not REMBG_AVAILABLE:
            status_label = QLabel(
                "⚠️ rembg 라이브러리가 설치되지 않았습니다.\n\n"
                "설치 방법:\n"
                "pip install rembg pillow\n\n"
                "설치 후 애플리케이션을 재시작하세요."
            )
            status_label.setStyleSheet("padding: 20px; font-size: 12px; color: red;")
            status_label.setWordWrap(True)
            layout.addWidget(status_label)
            layout.addStretch()
            self.tabs.addTab(tab, "🖼️ 배경 제거")
            return

        # 이미지 선택 그룹
        input_group = QGroupBox("📂 이미지 선택")
        input_layout = QVBoxLayout()

        # 파일 선택 버튼
        file_select_layout = QHBoxLayout()
        file_select_layout.addWidget(QLabel("이미지 파일:"))
        self.bg_removal_file_path = QLineEdit()
        self.bg_removal_file_path.setPlaceholderText("이미지 파일을 선택하세요 (PNG, JPG, JPEG, WEBP, BMP, GIF)")
        self.bg_removal_file_path.setReadOnly(True)
        file_select_layout.addWidget(self.bg_removal_file_path)

        browse_image_btn = QPushButton("📁 파일 선택")
        browse_image_btn.clicked.connect(self.select_image_for_removal)
        file_select_layout.addWidget(browse_image_btn)

        input_layout.addLayout(file_select_layout)
        input_group.setLayout(input_layout)
        layout.addWidget(input_group)

        # 설정 그룹
        settings_group = QGroupBox("⚙️ 배경 제거 설정")
        settings_layout = QGridLayout()

        row = 0
        settings_layout.addWidget(QLabel("AI 모델:"), row, 0)
        self.bg_removal_model = QComboBox()
        self.bg_removal_model.addItems([
            'u2net (기본, 범용)',
            'u2netp (빠른 처리)',
            'u2net_human_seg (사람 특화)',
            'isnet-general-use (고품질)',
            'isnet-anime (애니메이션/일러스트)',
            'silueta (실루엣)'
        ])
        self.bg_removal_model.setToolTip(
            "u2net: 일반적인 용도, 균형잡힌 성능\n"
            "u2netp: 빠른 처리, 낮은 품질\n"
            "u2net_human_seg: 사람 사진에 최적화\n"
            "isnet-general-use: 가장 높은 품질\n"
            "isnet-anime: 애니메이션/만화/일러스트\n"
            "silueta: 실루엣 추출"
        )
        settings_layout.addWidget(self.bg_removal_model, row, 1, 1, 2)

        row += 1
        settings_layout.addWidget(QLabel("출력 폴더:"), row, 0)
        self.bg_removal_output_dir = QLineEdit()
        self.bg_removal_output_dir.setText(os.path.expanduser("~/Downloads/background_removed"))
        settings_layout.addWidget(self.bg_removal_output_dir, row, 1)

        browse_output_btn = QPushButton("📁 찾아보기")
        browse_output_btn.clicked.connect(self.browse_bg_removal_directory)
        settings_layout.addWidget(browse_output_btn, row, 2)

        row += 1
        settings_layout.addWidget(QLabel("출력 형식:"), row, 0)
        self.bg_removal_format = QComboBox()
        self.bg_removal_format.addItems(['PNG (투명 배경)', 'JPG (흰색 배경)'])
        settings_layout.addWidget(self.bg_removal_format, row, 1)

        settings_group.setLayout(settings_layout)
        layout.addWidget(settings_group)

        # 미리보기 영역
        preview_group = QGroupBox("👁️ 미리보기")
        preview_layout = QHBoxLayout()

        # 원본 이미지
        original_widget = QWidget()
        original_layout = QVBoxLayout(original_widget)

        # 원본 이미지 헤더 (제목 + 삭제 버튼)
        original_header = QHBoxLayout()
        original_header.addWidget(QLabel("원본 이미지:"))
        original_header.addStretch()

        clear_btn = QPushButton("🗑️ 삭제")
        clear_btn.setStyleSheet("""
            QPushButton {
                background-color: #f44336;
                color: white;
                padding: 5px 10px;
                font-size: 11px;
                border-radius: 3px;
            }
            QPushButton:hover {
                background-color: #d32f2f;
            }
        """)
        clear_btn.clicked.connect(self.clear_selected_image)
        original_header.addWidget(clear_btn)
        original_layout.addLayout(original_header)

        self.bg_removal_original_label = QLabel("이미지를 선택하세요")
        self.bg_removal_original_label.setAlignment(Qt.AlignCenter)
        self.bg_removal_original_label.setStyleSheet("border: 2px dashed #ccc; background-color: #f5f5f5;")
        self.bg_removal_original_label.setScaledContents(False)
        self.bg_removal_original_label.setFixedSize(500, 500)
        original_layout.addWidget(self.bg_removal_original_label)
        preview_layout.addWidget(original_widget)

        # 처리된 이미지
        processed_widget = QWidget()
        processed_layout = QVBoxLayout(processed_widget)
        processed_layout.addWidget(QLabel("배경 제거 후:"))
        self.bg_removal_processed_label = QLabel("처리 대기 중")
        self.bg_removal_processed_label.setAlignment(Qt.AlignCenter)
        self.bg_removal_processed_label.setStyleSheet("border: 2px dashed #ccc; background-color: #f5f5f5;")
        self.bg_removal_processed_label.setScaledContents(False)
        self.bg_removal_processed_label.setFixedSize(500, 500)
        processed_layout.addWidget(self.bg_removal_processed_label)
        preview_layout.addWidget(processed_widget)

        preview_group.setLayout(preview_layout)
        layout.addWidget(preview_group)

        # 실행 버튼
        btn_layout = QHBoxLayout()
        btn_layout.addStretch()

        process_btn = QPushButton("✨ 배경 제거")
        process_btn.setStyleSheet("""
            QPushButton {
                background-color: #9C27B0;
                color: white;
                padding: 10px 20px;
                font-weight: bold;
                font-size: 14px;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #7B1FA2;
            }
        """)
        process_btn.clicked.connect(self.process_background_removal)
        btn_layout.addWidget(process_btn)

        save_btn = QPushButton("💾 저장")
        save_btn.setStyleSheet("""
            QPushButton {
                background-color: #4CAF50;
                color: white;
                padding: 10px 20px;
                font-weight: bold;
                font-size: 14px;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #45a049;
            }
        """)
        save_btn.clicked.connect(self.save_background_removed_image)
        btn_layout.addWidget(save_btn)

        btn_layout.addStretch()
        layout.addLayout(btn_layout)

        # 진행 상황
        self.bg_removal_progress_label = QLabel("")
        layout.addWidget(self.bg_removal_progress_label)

        self.tabs.addTab(tab, "🖼️ 배경 제거")

        # 처리된 이미지를 저장할 변수
        self.processed_image = None

    def select_image_for_removal(self):
        """배경 제거할 이미지 선택"""
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "이미지 파일 선택",
            os.path.expanduser("~"),
            "Image Files (*.png *.jpg *.jpeg *.webp *.bmp *.gif);;All Files (*)"
        )

        if file_path:
            self.bg_removal_file_path.setText(file_path)

            # 원본 이미지 미리보기
            try:
                from PyQt5.QtGui import QPixmap
                from PyQt5.QtCore import QSize
                pixmap = QPixmap(file_path)

                # 500x500 크기로 스케일링 (비율 유지)
                scaled_pixmap = pixmap.scaled(
                    QSize(500, 500),
                    Qt.KeepAspectRatio,
                    Qt.SmoothTransformation
                )
                self.bg_removal_original_label.setPixmap(scaled_pixmap)
                self.bg_removal_processed_label.clear()
                self.bg_removal_processed_label.setText("처리 대기 중")
                self.processed_image = None
                self.statusBar().showMessage(f"이미지 선택됨: {os.path.basename(file_path)}")
            except Exception as e:
                QMessageBox.critical(self, "오류", f"이미지 로드 실패:\n{str(e)}")

    def browse_bg_removal_directory(self):
        """배경 제거 출력 폴더 선택"""
        directory = QFileDialog.getExistingDirectory(
            self,
            "출력 폴더 선택",
            self.bg_removal_output_dir.text()
        )

        if directory:
            self.bg_removal_output_dir.setText(directory)

    def process_background_removal(self):
        """배경 제거 처리"""
        image_path = self.bg_removal_file_path.text().strip()

        if not image_path:
            QMessageBox.warning(self, "경고", "이미지 파일을 선택하세요")
            return

        if not os.path.exists(image_path):
            QMessageBox.warning(self, "경고", "선택한 파일이 존재하지 않습니다")
            return

        try:
            self.bg_removal_progress_label.setText("배경 제거 처리 중...")
            self.statusBar().showMessage("배경 제거 중...")

            # 선택된 모델 가져오기
            model_index = self.bg_removal_model.currentIndex()
            model_names = ['u2net', 'u2netp', 'u2net_human_seg', 'isnet-general-use', 'isnet-anime', 'silueta']
            selected_model = model_names[model_index]

            self.bg_removal_progress_label.setText(f"모델 로딩 중 ({selected_model})...")

            # 세션 생성 (모델 로드)
            session = new_session(selected_model)

            # 이미지 로드
            with open(image_path, 'rb') as f:
                input_image = f.read()

            self.bg_removal_progress_label.setText(f"배경 제거 중 ({selected_model})...")

            # 배경 제거 (세션 사용)
            output_image = remove(input_image, session=session)

            # PIL Image로 변환
            from io import BytesIO
            self.processed_image = Image.open(BytesIO(output_image))

            # 미리보기 표시
            self.display_processed_image()

            self.bg_removal_progress_label.setText(f"✓ 배경 제거 완료! (모델: {selected_model})")
            self.statusBar().showMessage("배경 제거 완료")
            QMessageBox.information(
                self,
                "완료",
                f"배경 제거가 완료되었습니다!\n\n사용된 모델: {selected_model}\n저장 버튼을 눌러 파일로 저장하세요."
            )

        except Exception as e:
            error_msg = f"배경 제거 중 오류 발생:\n{str(e)}\n\n다른 모델을 선택해보세요."
            self.bg_removal_progress_label.setText("❌ 오류 발생")
            self.statusBar().showMessage("배경 제거 실패")
            QMessageBox.critical(self, "오류", error_msg)

    def display_processed_image(self):
        """처리된 이미지를 미리보기에 표시"""
        if self.processed_image is None:
            return

        try:
            from PyQt5.QtGui import QPixmap, QImage
            from PyQt5.QtCore import QSize
            from io import BytesIO

            # PIL Image를 QPixmap으로 변환
            buffer = BytesIO()
            self.processed_image.save(buffer, format='PNG')
            buffer.seek(0)

            qimage = QImage()
            qimage.loadFromData(buffer.read())
            pixmap = QPixmap.fromImage(qimage)

            # 500x500 크기로 스케일링 (비율 유지)
            scaled_pixmap = pixmap.scaled(
                QSize(500, 500),
                Qt.KeepAspectRatio,
                Qt.SmoothTransformation
            )
            self.bg_removal_processed_label.setPixmap(scaled_pixmap)

        except Exception as e:
            QMessageBox.critical(self, "오류", f"이미지 표시 실패:\n{str(e)}")

    def save_background_removed_image(self):
        """배경 제거된 이미지 저장"""
        if self.processed_image is None:
            QMessageBox.warning(self, "경고", "먼저 배경 제거를 실행하세요")
            return

        try:
            output_dir = self.bg_removal_output_dir.text()
            os.makedirs(output_dir, exist_ok=True)

            # 원본 파일명 가져오기
            original_path = self.bg_removal_file_path.text()
            original_name = os.path.splitext(os.path.basename(original_path))[0]

            # 출력 형식 결정
            if self.bg_removal_format.currentIndex() == 0:
                # PNG (투명 배경)
                output_filename = f"{original_name}_no_bg.png"
                output_path = os.path.join(output_dir, output_filename)
                self.processed_image.save(output_path, 'PNG')
            else:
                # JPG (흰색 배경)
                output_filename = f"{original_name}_no_bg.jpg"
                output_path = os.path.join(output_dir, output_filename)

                # RGBA를 RGB로 변환 (흰색 배경)
                if self.processed_image.mode == 'RGBA':
                    white_bg = Image.new('RGB', self.processed_image.size, (255, 255, 255))
                    white_bg.paste(self.processed_image, mask=self.processed_image.split()[3])
                    white_bg.save(output_path, 'JPEG', quality=95)
                else:
                    self.processed_image.convert('RGB').save(output_path, 'JPEG', quality=95)

            self.statusBar().showMessage(f"저장 완료: {output_filename}")
            QMessageBox.information(
                self,
                "저장 완료",
                f"이미지가 저장되었습니다!\n\n파일명: {output_filename}\n위치: {output_dir}"
            )

        except Exception as e:
            error_msg = f"이미지 저장 중 오류 발생:\n{str(e)}"
            self.statusBar().showMessage("저장 실패")
            QMessageBox.critical(self, "오류", error_msg)

    def clear_selected_image(self):
        """선택한 이미지 초기화"""
        # 파일 경로 초기화
        self.bg_removal_file_path.clear()

        # 원본 이미지 미리보기 초기화
        self.bg_removal_original_label.clear()
        self.bg_removal_original_label.setText("이미지를 선택하세요")

        # 처리된 이미지 미리보기 초기화
        self.bg_removal_processed_label.clear()
        self.bg_removal_processed_label.setText("처리 대기 중")

        # 처리된 이미지 데이터 초기화
        self.processed_image = None

        # 진행 상황 라벨 초기화
        self.bg_removal_progress_label.setText("")

        # 상태바 메시지
        self.statusBar().showMessage("이미지 선택이 취소되었습니다")


def main():
    app = QApplication(sys.argv)

    # 폰트 설정
    font = QFont("맑은 고딕", 9)
    app.setFont(font)

    window = YouTubeHotFinderUnified()
    window.show()

    sys.exit(app.exec_())


if __name__ == '__main__':
    main()
