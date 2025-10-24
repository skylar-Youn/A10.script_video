#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
9.PyMaker - Python 기반 Canva 스타일 비디오 편집기
PyQt5 + FastAPI 기반 데스크톱 비디오 편집 애플리케이션
"""

import sys
import os
import subprocess
import time
from pathlib import Path

# GStreamer 환경 변수 설정 (segfault 방지)
os.environ['QT_GSTREAMER_PLAYBIN_AUDIOSINK'] = 'autoaudiosink'
os.environ['QT_GSTREAMER_PLAYBIN_VIDEOSINK'] = 'autovideosink'

# VLC 라이브러리 경로 설정 (APT 버전 사용, Snap 버전 회피)
os.environ['VLC_PLUGIN_PATH'] = '/usr/lib/x86_64-linux-gnu/vlc/plugins'

from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QPushButton, QSplitter, QMessageBox, QFileDialog,
    QListWidget, QListWidgetItem, QGroupBox, QTextEdit,
    QProgressBar, QStatusBar, QFrame
)
from PyQt5.QtCore import Qt, QTimer, QThread, pyqtSignal, QUrl, QSize
from PyQt5.QtGui import QFont, QColor, QPalette, QPixmap, QIcon
from PyQt5.QtWebEngineWidgets import QWebEngineView, QWebEnginePage

# 상대 경로로 모듈 임포트
sys.path.insert(0, str(Path(__file__).parent))
from utils.api_client import APIClient
from utils.video_utils import extract_thumbnail, get_video_info


class BackendServerThread(QThread):
    """백엔드 서버를 별도 스레드에서 실행"""
    server_started = pyqtSignal(bool)

    def __init__(self, backend_path):
        super().__init__()
        self.backend_path = backend_path
        self.process = None

    def run(self):
        """서버 시작"""
        try:
            server_file = self.backend_path / "server.py"
            self.process = subprocess.Popen(
                [sys.executable, str(server_file)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            # 서버가 시작될 때까지 대기 (3초로 증가)
            time.sleep(3)
            self.server_started.emit(True)
            print("📡 백엔드 서버 시작 완료")
        except Exception as e:
            print(f"❌ 서버 시작 실패: {e}")
            self.server_started.emit(False)

    def stop(self):
        """서버 종료"""
        if self.process:
            self.process.terminate()
            self.process.wait()


class MediaLibraryWidget(QWidget):
    """미디어 라이브러리 위젯"""
    file_selected = pyqtSignal(str, str)  # filename, url

    def __init__(self, api_client):
        super().__init__()
        self.api_client = api_client
        self.init_ui()

    def init_ui(self):
        """UI 초기화"""
        layout = QVBoxLayout()

        # 타이틀
        title = QLabel("📁 미디어 라이브러리")
        title.setStyleSheet("font-size: 16px; font-weight: bold; color: #fff;")
        layout.addWidget(title)

        # 업로드 버튼들
        upload_group = QGroupBox("파일 업로드")
        upload_layout = QVBoxLayout()

        self.upload_video_btn = QPushButton("📹 비디오 업로드")
        self.upload_video_btn.clicked.connect(lambda: self.upload_file('video'))
        upload_layout.addWidget(self.upload_video_btn)

        self.upload_audio_btn = QPushButton("🎵 오디오 업로드")
        self.upload_audio_btn.clicked.connect(lambda: self.upload_file('audio'))
        upload_layout.addWidget(self.upload_audio_btn)

        self.upload_subtitle_btn = QPushButton("💬 자막 업로드")
        self.upload_subtitle_btn.clicked.connect(lambda: self.upload_file('subtitle'))
        upload_layout.addWidget(self.upload_subtitle_btn)

        upload_group.setLayout(upload_layout)
        layout.addWidget(upload_group)

        # 파일 목록
        files_label = QLabel("파일 목록:")
        layout.addWidget(files_label)

        self.file_list = QListWidget()
        self.file_list.itemDoubleClicked.connect(self.on_file_double_clicked)
        layout.addWidget(self.file_list)

        # 새로고침 버튼
        refresh_btn = QPushButton("🔄 새로고침")
        refresh_btn.clicked.connect(self.refresh_file_list)
        layout.addWidget(refresh_btn)

        # 삭제 버튼
        delete_btn = QPushButton("🗑️ 선택 삭제")
        delete_btn.clicked.connect(self.delete_selected_file)
        layout.addWidget(delete_btn)

        self.setLayout(layout)

        # 스타일 적용
        self.setStyleSheet("""
            QWidget {
                background-color: #1e1e1e;
                color: #fff;
            }
            QPushButton {
                background-color: #4A90E2;
                color: white;
                border: none;
                padding: 8px;
                border-radius: 4px;
                font-size: 13px;
            }
            QPushButton:hover {
                background-color: #5AA0F2;
            }
            QListWidget {
                background-color: #252525;
                border: 1px solid #333;
                border-radius: 4px;
            }
            QListWidget::item {
                padding: 8px;
            }
            QListWidget::item:hover {
                background-color: #333;
            }
            QListWidget::item:selected {
                background-color: #4A90E2;
            }
            QGroupBox {
                border: 1px solid #333;
                border-radius: 4px;
                margin-top: 10px;
                padding-top: 10px;
            }
            QGroupBox::title {
                color: #aaa;
            }
        """)

    def upload_file(self, file_type):
        """파일 업로드"""
        # 파일 다이얼로그
        filters = {
            'video': "비디오 파일 (*.mp4 *.mov *.avi *.webm *.mkv)",
            'audio': "오디오 파일 (*.mp3 *.wav *.m4a *.aac *.ogg)",
            'subtitle': "자막 파일 (*.srt *.vtt *.ass *.ssa *.sub)"
        }

        file_path, _ = QFileDialog.getOpenFileName(
            self,
            f"{file_type} 파일 선택",
            "",
            filters.get(file_type, "모든 파일 (*.*)")
        )

        if not file_path:
            return

        # API로 업로드
        try:
            if file_type == 'video':
                result = self.api_client.upload_video(file_path)
            elif file_type == 'audio':
                result = self.api_client.upload_audio(file_path)
            elif file_type == 'subtitle':
                result = self.api_client.upload_subtitle(file_path)

            if result.get('success'):
                QMessageBox.information(
                    self,
                    "업로드 완료",
                    f"'{result['original_filename']}'이(가) 업로드되었습니다."
                )
                self.refresh_file_list()
            else:
                QMessageBox.warning(
                    self,
                    "업로드 실패",
                    f"업로드 실패: {result.get('error', '알 수 없는 오류')}"
                )
        except Exception as e:
            QMessageBox.critical(self, "오류", f"업로드 중 오류 발생: {str(e)}")

    def refresh_file_list(self):
        """파일 목록 새로고침"""
        try:
            result = self.api_client.list_files()
            self.file_list.clear()

            if result.get('success'):
                for file_info in result.get('files', []):
                    # 파일 아이콘 결정
                    filename = file_info['filename']
                    if filename.startswith('video_'):
                        icon = '📹'
                    elif filename.startswith('audio_'):
                        icon = '🎵'
                    elif filename.startswith('subtitle_'):
                        icon = '💬'
                    else:
                        icon = '📄'

                    # 파일 크기 표시
                    size_mb = file_info['size'] / (1024 * 1024)
                    item_text = f"{icon} {filename} ({size_mb:.1f}MB)"

                    item = QListWidgetItem(item_text)
                    item.setData(Qt.UserRole, file_info)
                    self.file_list.addItem(item)
        except Exception as e:
            print(f"파일 목록 새로고침 실패: {e}")

    def delete_selected_file(self):
        """선택된 파일 삭제"""
        current_item = self.file_list.currentItem()
        if not current_item:
            QMessageBox.warning(self, "경고", "삭제할 파일을 선택하세요.")
            return

        file_info = current_item.data(Qt.UserRole)
        filename = file_info['filename']

        reply = QMessageBox.question(
            self,
            "파일 삭제",
            f"'{filename}'을(를) 삭제하시겠습니까?",
            QMessageBox.Yes | QMessageBox.No
        )

        if reply == QMessageBox.Yes:
            try:
                result = self.api_client.delete_file(filename)
                if result.get('success'):
                    QMessageBox.information(self, "성공", "파일이 삭제되었습니다.")
                    self.refresh_file_list()
                else:
                    QMessageBox.warning(self, "실패", f"삭제 실패: {result.get('error')}")
            except Exception as e:
                QMessageBox.critical(self, "오류", f"삭제 중 오류 발생: {str(e)}")

    def on_file_double_clicked(self, item):
        """파일 더블클릭 시"""
        file_info = item.data(Qt.UserRole)
        self.file_selected.emit(file_info['filename'], file_info['url'])


class VideoPlayerWidget(QWidget):
    """HTML5 WebEngine 기반 비디오 플레이어 위젯"""

    def __init__(self, api_client):
        super().__init__()
        self.api_client = api_client

        # 비디오 정보
        self.current_video = None
        self.current_filename = None

        self.init_ui()

    def init_ui(self):
        """UI 초기화"""
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)

        # WebEngineView로 비디오 플레이어
        self.web_view = QWebEngineView()
        self.web_view.setMinimumSize(640, 480)

        # HTML 파일 로드
        html_path = Path(__file__).parent / "ui" / "templates" / "video_player.html"
        self.web_view.setUrl(QUrl.fromLocalFile(str(html_path.absolute())))

        layout.addWidget(self.web_view)

        # 재생 컨트롤
        controls_layout = QHBoxLayout()

        self.play_btn = QPushButton("▶️ 재생")
        self.play_btn.clicked.connect(self.play_video)
        self.play_btn.setEnabled(False)
        controls_layout.addWidget(self.play_btn)

        self.pause_btn = QPushButton("⏸️ 일시정지")
        self.pause_btn.clicked.connect(self.pause_video)
        self.pause_btn.setEnabled(False)
        controls_layout.addWidget(self.pause_btn)

        self.stop_btn = QPushButton("⏹️ 정지")
        self.stop_btn.clicked.connect(self.stop_video)
        self.stop_btn.setEnabled(False)
        controls_layout.addWidget(self.stop_btn)

        controls_layout.addStretch()

        layout.addLayout(controls_layout)
        self.setLayout(layout)

        # 스타일
        self.setStyleSheet("""
            QPushButton {
                background-color: #4A90E2;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                font-size: 13px;
            }
            QPushButton:hover {
                background-color: #5AA0F2;
            }
            QPushButton:disabled {
                background-color: #666;
            }
        """)

    def load_video(self, filename, url):
        """비디오 로드"""
        self.current_filename = filename
        print(f"📹 비디오 로드: {filename}")

        # 백엔드 서버 URL 구성
        video_url = f"http://localhost:8009/uploads/{filename}"

        # JavaScript 호출하여 비디오 로드
        # QWebEngineView가 완전히 로드된 후 실행
        js_code = f"loadVideo('{video_url}');"
        self.web_view.page().runJavaScript(js_code)

        # 컨트롤 버튼 활성화
        self.play_btn.setEnabled(True)
        self.pause_btn.setEnabled(True)
        self.stop_btn.setEnabled(True)

        print(f"✅ 비디오 로드 완료: {video_url}")

    def play_video(self):
        """비디오 재생"""
        self.web_view.page().runJavaScript("playVideo();")
        print("▶️  재생")

    def pause_video(self):
        """비디오 일시정지"""
        self.web_view.page().runJavaScript("pauseVideo();")
        print("⏸️  일시정지")

    def stop_video(self):
        """비디오 정지"""
        self.web_view.page().runJavaScript("stopVideo();")
        print("⏹️  정지")


class TimelineWidget(QWidget):
    """타임라인 위젯"""

    def __init__(self):
        super().__init__()
        self.clips = []  # 클립 목록 저장
        self.init_ui()

    def init_ui(self):
        """UI 초기화"""
        layout = QVBoxLayout()

        # 타이틀 및 컨트롤
        header_layout = QHBoxLayout()
        title = QLabel("⏱️ 타임라인")
        title.setStyleSheet("font-size: 16px; font-weight: bold; color: #fff;")
        header_layout.addWidget(title)

        header_layout.addStretch()

        # 클리어 버튼
        self.clear_btn = QPushButton("🗑️ 전체 삭제")
        self.clear_btn.clicked.connect(self.clear_timeline)
        self.clear_btn.setMaximumWidth(120)
        header_layout.addWidget(self.clear_btn)

        layout.addLayout(header_layout)

        # 트랙 레이블
        tracks_layout = QVBoxLayout()

        # 비디오 트랙
        video_track_label = QLabel("📹 비디오 트랙")
        video_track_label.setStyleSheet("color: #4A90E2; font-size: 13px; font-weight: bold;")
        tracks_layout.addWidget(video_track_label)

        self.video_clips_list = QListWidget()
        self.video_clips_list.setMaximumHeight(120)
        self.video_clips_list.setIconSize(QSize(80, 60))  # 썸네일 크기
        self.video_clips_list.setViewMode(QListWidget.ListMode)
        tracks_layout.addWidget(self.video_clips_list)

        # 오디오 트랙
        audio_track_label = QLabel("🎵 오디오 트랙")
        audio_track_label.setStyleSheet("color: #50E3C2; font-size: 13px; font-weight: bold;")
        tracks_layout.addWidget(audio_track_label)

        self.audio_clips_list = QListWidget()
        self.audio_clips_list.setMaximumHeight(80)
        tracks_layout.addWidget(self.audio_clips_list)

        # 자막 트랙
        subtitle_track_label = QLabel("💬 자막 트랙")
        subtitle_track_label.setStyleSheet("color: #9013FE; font-size: 13px; font-weight: bold;")
        tracks_layout.addWidget(subtitle_track_label)

        self.subtitle_clips_list = QListWidget()
        self.subtitle_clips_list.setMaximumHeight(80)
        tracks_layout.addWidget(self.subtitle_clips_list)

        layout.addLayout(tracks_layout)

        # 안내 메시지
        info_label = QLabel("💡 미디어 라이브러리에서 파일을 더블클릭하면 타임라인에 추가됩니다")
        info_label.setStyleSheet("color: #666; font-size: 12px; font-style: italic;")
        info_label.setAlignment(Qt.AlignCenter)
        layout.addWidget(info_label)

        self.setLayout(layout)

        # 스타일
        self.setStyleSheet("""
            QWidget {
                background-color: #1a1a1a;
                color: #fff;
            }
            QListWidget {
                background-color: #252525;
                border: 1px solid #333;
                border-radius: 4px;
                padding: 4px;
            }
            QListWidget::item {
                padding: 6px;
                border-radius: 3px;
                margin: 2px;
            }
            QListWidget::item:hover {
                background-color: #333;
            }
            QListWidget::item:selected {
                background-color: #4A90E2;
            }
            QPushButton {
                background-color: #ff3b30;
                color: white;
                border: none;
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 12px;
            }
            QPushButton:hover {
                background-color: #ff5247;
            }
        """)

    def add_clip(self, filename, file_type='video'):
        """클립 추가"""
        # 파일 타입 결정
        if filename.startswith('video_'):
            file_type = 'video'
            icon = '📹'
            target_list = self.video_clips_list
        elif filename.startswith('audio_'):
            file_type = 'audio'
            icon = '🎵'
            target_list = self.audio_clips_list
        elif filename.startswith('subtitle_'):
            file_type = 'subtitle'
            icon = '💬'
            target_list = self.subtitle_clips_list
        else:
            # 확장자로 판단
            if any(filename.endswith(ext) for ext in ['.mp4', '.mov', '.avi', '.webm', '.mkv']):
                file_type = 'video'
                icon = '📹'
                target_list = self.video_clips_list
            elif any(filename.endswith(ext) for ext in ['.mp3', '.wav', '.m4a', '.aac', '.ogg']):
                file_type = 'audio'
                icon = '🎵'
                target_list = self.audio_clips_list
            else:
                file_type = 'subtitle'
                icon = '💬'
                target_list = self.subtitle_clips_list

        # 클립 추가
        clip_info = {
            'filename': filename,
            'type': file_type
        }
        self.clips.append(clip_info)

        # UI에 표시
        item_text = f"{icon} {filename}"
        item = QListWidgetItem(item_text)
        item.setData(Qt.UserRole, clip_info)

        # 비디오 파일인 경우 썸네일 생성 및 표시
        if file_type == 'video':
            backend_path = Path(__file__).parent / "backend" / "uploads"
            video_path = backend_path / filename

            if video_path.exists():
                # 썸네일 디렉토리 생성
                thumbnail_dir = backend_path / ".thumbnails"
                thumbnail_dir.mkdir(exist_ok=True)

                # 썸네일 파일 경로
                thumb_filename = f"{Path(filename).stem}_timeline_thumb.jpg"
                thumbnail_path = thumbnail_dir / thumb_filename

                # 썸네일 추출 (비디오 중간 지점, 작은 크기)
                video_info = get_video_info(str(video_path))
                if video_info:
                    timestamp = video_info['duration'] / 2
                    if extract_thumbnail(str(video_path), str(thumbnail_path), timestamp, width=160):
                        # 썸네일을 아이콘으로 설정
                        pixmap = QPixmap(str(thumbnail_path))
                        if not pixmap.isNull():
                            item.setIcon(QIcon(pixmap))
                            print(f"✅ 타임라인 썸네일 생성: {thumb_filename}")

        target_list.addItem(item)

    def clear_timeline(self):
        """타임라인 전체 삭제"""
        self.clips.clear()
        self.video_clips_list.clear()
        self.audio_clips_list.clear()
        self.subtitle_clips_list.clear()

    def get_clips(self):
        """클립 목록 반환"""
        return self.clips


class PyMakerMainWindow(QMainWindow):
    """메인 윈도우"""

    def __init__(self):
        super().__init__()
        self.api_client = APIClient()
        self.backend_thread = None
        self.health_check_retry_count = 0
        self.max_health_check_retries = 5
        self.init_ui()
        self.start_backend_server()

    def init_ui(self):
        """UI 초기화"""
        self.setWindowTitle("🎬 9.PyMaker - Python 비디오 편집기")
        self.setGeometry(100, 100, 1400, 900)

        # 중앙 위젯
        central_widget = QWidget()
        self.setCentralWidget(central_widget)

        # 메인 레이아웃
        main_layout = QVBoxLayout()

        # 헤더
        header = self.create_header()
        main_layout.addWidget(header)

        # 메인 콘텐츠 (3분할: 왼쪽 사이드바, 중앙, 오른쪽 사이드바)
        content_splitter = QSplitter(Qt.Horizontal)

        # 왼쪽: 미디어 라이브러리
        self.media_library = MediaLibraryWidget(self.api_client)
        self.media_library.file_selected.connect(self.on_file_selected)
        content_splitter.addWidget(self.media_library)

        # 중앙: 비디오 프리뷰 + 타임라인
        center_widget = QWidget()
        center_layout = QVBoxLayout()

        self.video_player = VideoPlayerWidget(self.api_client)
        center_layout.addWidget(self.video_player, 3)

        self.timeline = TimelineWidget()
        center_layout.addWidget(self.timeline, 2)

        center_widget.setLayout(center_layout)
        content_splitter.addWidget(center_widget)

        # 오른쪽: 속성 패널
        properties_panel = self.create_properties_panel()
        content_splitter.addWidget(properties_panel)

        # 비율 설정 (왼쪽:중앙:오른쪽 = 1:3:1)
        content_splitter.setStretchFactor(0, 1)
        content_splitter.setStretchFactor(1, 3)
        content_splitter.setStretchFactor(2, 1)

        main_layout.addWidget(content_splitter)

        central_widget.setLayout(main_layout)

        # 상태바
        self.statusBar = QStatusBar()
        self.setStatusBar(self.statusBar)
        self.statusBar.showMessage("준비됨")

        # 전체 스타일
        self.setStyleSheet("""
            QMainWindow {
                background-color: #1a1a1a;
            }
            QLabel {
                color: #fff;
            }
        """)

    def create_header(self):
        """헤더 생성"""
        header = QWidget()
        header.setFixedHeight(60)
        header.setStyleSheet("background-color: #252525; border-bottom: 1px solid #333;")

        layout = QHBoxLayout()

        # 타이틀
        title = QLabel("🎬 9.PyMaker")
        title.setStyleSheet("font-size: 20px; font-weight: bold; color: #fff;")
        layout.addWidget(title)

        layout.addStretch()

        # 서버 상태 표시
        self.server_status_label = QLabel("🟡 서버 연결 확인 중...")
        self.server_status_label.setStyleSheet(
            "background-color: rgba(234, 179, 8, 0.2); "
            "color: #eab308; "
            "padding: 6px 12px; "
            "border-radius: 4px; "
            "font-size: 12px;"
        )
        layout.addWidget(self.server_status_label)

        header.setLayout(layout)
        return header

    def create_properties_panel(self):
        """속성 패널 생성"""
        panel = QWidget()
        panel.setStyleSheet("background-color: #1e1e1e;")

        layout = QVBoxLayout()

        title = QLabel("⚙️ 속성")
        title.setStyleSheet("font-size: 18px; font-weight: bold; color: #fff;")
        layout.addWidget(title)

        # 안내 메시지
        info_label = QLabel("✨\n\n클립을 선택하면\n속성 편집 패널이 여기에 표시됩니다")
        info_label.setAlignment(Qt.AlignCenter)
        info_label.setStyleSheet("color: #666; font-size: 14px;")
        layout.addWidget(info_label)

        layout.addStretch()

        # 프로젝트 정보
        project_info = QGroupBox("프로젝트 정보")
        project_layout = QVBoxLayout()

        info_text = QTextEdit()
        info_text.setReadOnly(True)
        info_text.setMaximumHeight(100)
        info_text.setText(
            "해상도: 1920 × 1080\n"
            "프레임: 30 fps\n"
            "길이: 60초"
        )
        project_layout.addWidget(info_text)

        project_info.setLayout(project_layout)
        layout.addWidget(project_info)

        panel.setLayout(layout)
        return panel

    def start_backend_server(self):
        """백엔드 서버 시작"""
        backend_path = Path(__file__).parent / "backend"
        self.backend_thread = BackendServerThread(backend_path)
        self.backend_thread.server_started.connect(self.on_server_started)
        self.backend_thread.start()

    def on_server_started(self, success):
        """서버 시작 완료"""
        if success:
            # 헬스 체크
            QTimer.singleShot(1000, self.check_server_health)
        else:
            self.server_status_label.setText("🔴 서버 시작 실패")
            self.server_status_label.setStyleSheet(
                "background-color: rgba(239, 68, 68, 0.2); "
                "color: #ef4444; "
                "padding: 6px 12px; "
                "border-radius: 4px; "
                "font-size: 12px;"
            )

    def check_server_health(self):
        """서버 헬스 체크 (재시도 포함)"""
        result = self.api_client.health_check()
        if result.get('status') == 'ok':
            self.server_status_label.setText("🟢 서버 연결됨")
            self.server_status_label.setStyleSheet(
                "background-color: rgba(34, 197, 94, 0.2); "
                "color: #22c55e; "
                "padding: 6px 12px; "
                "border-radius: 4px; "
                "font-size: 12px;"
            )
            # 파일 목록 로드
            self.media_library.refresh_file_list()
            self.health_check_retry_count = 0  # 재시도 카운트 초기화
            print(f"✅ 백엔드 서버 연결 성공!")
        else:
            self.health_check_retry_count += 1
            if self.health_check_retry_count < self.max_health_check_retries:
                # 재시도
                retry_delay = 1000 * self.health_check_retry_count  # 점진적 지연
                print(f"🔄 서버 연결 재시도 중... ({self.health_check_retry_count}/{self.max_health_check_retries})")
                self.server_status_label.setText(f"🟡 서버 연결 중... ({self.health_check_retry_count}/{self.max_health_check_retries})")
                self.server_status_label.setStyleSheet(
                    "background-color: rgba(234, 179, 8, 0.2); "
                    "color: #eab308; "
                    "padding: 6px 12px; "
                    "border-radius: 4px; "
                    "font-size: 12px;"
                )
                QTimer.singleShot(retry_delay, self.check_server_health)
            else:
                # 최종 실패
                print(f"❌ 백엔드 서버 연결 실패 (최대 재시도 횟수 초과)")
                self.server_status_label.setText("🔴 서버 연결 안됨")
                self.server_status_label.setStyleSheet(
                    "background-color: rgba(239, 68, 68, 0.2); "
                    "color: #ef4444; "
                    "padding: 6px 12px; "
                    "border-radius: 4px; "
                    "font-size: 12px;"
                )

    def on_file_selected(self, filename, url):
        """파일 선택 시"""
        # 타임라인에 클립 추가
        self.timeline.add_clip(filename)

        # 비디오 파일이면 플레이어에 로드
        if filename.startswith('video_'):
            self.video_player.load_video(filename, url)
            self.statusBar.showMessage(f"✅ 타임라인에 추가 및 비디오 로드됨: {filename}")
        elif filename.startswith('audio_'):
            self.statusBar.showMessage(f"✅ 타임라인에 오디오 추가됨: {filename}")
        elif filename.startswith('subtitle_'):
            self.statusBar.showMessage(f"✅ 타임라인에 자막 추가됨: {filename}")
        else:
            self.statusBar.showMessage(f"✅ 타임라인에 추가됨: {filename}")

    def closeEvent(self, event):
        """윈도우 닫기 이벤트"""
        # 백엔드 서버 종료
        if self.backend_thread:
            self.backend_thread.stop()
            self.backend_thread.wait()
        event.accept()


def check_vlc():
    """VLC 설치 확인"""
    try:
        # VLC 실행 파일 확인
        result = subprocess.run(
            ['vlc', '--version'],
            capture_output=True,
            timeout=5
        )
        if result.returncode == 0:
            print(f"✅ VLC가 설치되어 있습니다.")
            return True
        else:
            print("⚠️  VLC가 설치되지 않았습니다.")
            return False
    except (subprocess.TimeoutExpired, FileNotFoundError):
        print("⚠️  VLC를 확인할 수 없습니다.")
        return False


def main():
    """메인 함수"""
    # VLC 설치 확인
    has_vlc = check_vlc()

    app = QApplication(sys.argv)

    # 다크 테마 적용
    app.setStyle("Fusion")

    # VLC가 없으면 경고 표시
    if not has_vlc:
        msg_box = QMessageBox()
        msg_box.setIcon(QMessageBox.Warning)
        msg_box.setWindowTitle("⚠️  VLC 설치 필요")
        msg_box.setText("VLC 미디어 플레이어가 설치되지 않았습니다")
        msg_box.setInformativeText(
            "비디오 재생 기능이 작동하지 않습니다.\n\n"
            "다음 명령어로 VLC를 설치하세요:\n\n"
            "sudo apt-get install vlc\n\n"
            "설치 후 애플리케이션을 다시 시작하세요.\n\n"
            "지금 애플리케이션을 시작하시겠습니까?\n"
            "(비디오 재생은 불가능하지만 타임라인 편집은 가능합니다)"
        )
        msg_box.setStandardButtons(QMessageBox.Yes | QMessageBox.No)
        msg_box.setStyleSheet("""
            QMessageBox {
                background-color: #2D2D2D;
                color: #FFFFFF;
            }
            QMessageBox QLabel {
                color: #FFFFFF;
                font-size: 13px;
            }
            QMessageBox QPushButton {
                background-color: #4A90E2;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                font-size: 13px;
                min-width: 80px;
            }
            QMessageBox QPushButton:hover {
                background-color: #5AA0F2;
            }
        """)

        reply = msg_box.exec_()
        if reply == QMessageBox.No:
            print("애플리케이션 시작 취소됨")
            return

    window = PyMakerMainWindow()
    window.show()

    sys.exit(app.exec_())


if __name__ == "__main__":
    main()
