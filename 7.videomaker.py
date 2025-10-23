#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Video Maker - 영상 편집 & 자막 생성 & AI 분석 통합 도구
- 영상 편집 (자르기, 합치기, 효과 추가)
- 자막 생성 및 편집 (AI 기반, 수동 편집)
- AI 분석 (프레임 분석, 자막 분석, 최적화)
- FFmpeg 기반 영상 처리
"""

import sys
import json
import os
import subprocess
import tempfile
import base64
import re
from pathlib import Path
from datetime import datetime, timedelta
from PyQt5.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QLineEdit, QPushButton, QTextEdit, QComboBox, QSpinBox,
    QGroupBox, QGridLayout, QMessageBox, QProgressBar, QTabWidget,
    QFileDialog, QListWidget, QListWidgetItem, QScrollArea, QCheckBox,
    QSlider, QDoubleSpinBox, QTableWidget, QTableWidgetItem, QHeaderView,
    QSplitter
)
from PyQt5.QtCore import Qt, QThread, pyqtSignal, QTimer
from PyQt5.QtGui import QFont, QPixmap, QImage

# AI 라이브러리 가용성 확인
try:
    from anthropic import Anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False


class VideoProcessWorker(QThread):
    """영상 처리를 별도 스레드에서 처리"""
    progress = pyqtSignal(str)
    result = pyqtSignal(dict)
    error = pyqtSignal(str)

    def __init__(self, task_type, **kwargs):
        super().__init__()
        self.task_type = task_type
        self.kwargs = kwargs

    def run(self):
        try:
            if self.task_type == "cut_video":
                self.cut_video()
            elif self.task_type == "merge_videos":
                self.merge_videos()
            elif self.task_type == "extract_frames":
                self.extract_frames()
            elif self.task_type == "add_subtitle":
                self.add_subtitle()
        except Exception as e:
            self.error.emit(str(e))

    def cut_video(self):
        """영상 자르기"""
        video_path = self.kwargs['video_path']
        start_time = self.kwargs['start_time']
        end_time = self.kwargs['end_time']
        output_path = self.kwargs['output_path']

        self.progress.emit(f"영상 자르기 시작: {start_time} ~ {end_time}")

        cmd = [
            'ffmpeg', '-y',
            '-i', video_path,
            '-ss', start_time,
            '-to', end_time,
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-preset', 'fast',
            output_path
        ]

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )

        _, stderr = process.communicate()

        if process.returncode == 0:
            self.result.emit({
                'success': True,
                'output_path': output_path,
                'message': '영상 자르기 완료'
            })
        else:
            raise Exception(f"FFmpeg 오류: {stderr}")

    def merge_videos(self):
        """영상 합치기"""
        video_paths = self.kwargs['video_paths']
        output_path = self.kwargs['output_path']

        self.progress.emit(f"{len(video_paths)}개 영상 합치기 시작")

        # 임시 파일 목록 생성
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            for video_path in video_paths:
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

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True
            )

            _, stderr = process.communicate()

            if process.returncode == 0:
                self.result.emit({
                    'success': True,
                    'output_path': output_path,
                    'message': '영상 합치기 완료'
                })
            else:
                raise Exception(f"FFmpeg 오류: {stderr}")
        finally:
            os.unlink(list_file)

    def extract_frames(self):
        """프레임 추출"""
        video_path = self.kwargs['video_path']
        output_dir = self.kwargs['output_dir']
        interval = self.kwargs.get('interval', 1)  # 초 단위

        self.progress.emit(f"{interval}초 간격으로 프레임 추출 시작")

        os.makedirs(output_dir, exist_ok=True)

        cmd = [
            'ffmpeg', '-y',
            '-i', video_path,
            '-vf', f'fps=1/{interval}',
            os.path.join(output_dir, 'frame_%04d.png')
        ]

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )

        _, stderr = process.communicate()

        if process.returncode == 0:
            frames = sorted(Path(output_dir).glob('frame_*.png'))
            self.result.emit({
                'success': True,
                'frames': [str(f) for f in frames],
                'count': len(frames),
                'message': f'{len(frames)}개 프레임 추출 완료'
            })
        else:
            raise Exception(f"FFmpeg 오류: {stderr}")

    def add_subtitle(self):
        """자막 추가"""
        video_path = self.kwargs['video_path']
        subtitle_path = self.kwargs['subtitle_path']
        output_path = self.kwargs['output_path']

        self.progress.emit("자막 추가 시작")

        cmd = [
            'ffmpeg', '-y',
            '-i', video_path,
            '-vf', f"subtitles={subtitle_path}",
            '-c:a', 'copy',
            output_path
        ]

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            universal_newlines=True
        )

        _, stderr = process.communicate()

        if process.returncode == 0:
            self.result.emit({
                'success': True,
                'output_path': output_path,
                'message': '자막 추가 완료'
            })
        else:
            raise Exception(f"FFmpeg 오류: {stderr}")


class AIAnalysisWorker(QThread):
    """AI 분석을 별도 스레드에서 처리"""
    progress = pyqtSignal(str)
    result = pyqtSignal(dict)
    error = pyqtSignal(str)

    def __init__(self, api_key, analysis_type, model_type, **kwargs):
        super().__init__()
        self.api_key = api_key
        self.analysis_type = analysis_type
        self.model_type = model_type  # 'claude' or 'openai'
        self.kwargs = kwargs

    def run(self):
        try:
            if self.analysis_type == "analyze_frames":
                self.analyze_frames()
            elif self.analysis_type == "analyze_subtitle":
                self.analyze_subtitle()
            elif self.analysis_type == "generate_subtitle":
                self.generate_subtitle()
        except Exception as e:
            self.error.emit(str(e))

    def analyze_frames(self):
        """프레임 분석"""
        frame_paths = self.kwargs['frame_paths']
        prompt = self.kwargs.get('prompt', '이 이미지들을 분석하여 영상의 주요 장면을 설명해주세요.')

        self.progress.emit(f"{len(frame_paths)}개 프레임 분석 중...")

        # 이미지를 base64로 인코딩
        images_base64 = []
        for frame_path in frame_paths[:10]:  # 최대 10개
            with open(frame_path, 'rb') as f:
                image_data = base64.b64encode(f.read()).decode('utf-8')
                images_base64.append(image_data)

        if self.model_type == 'claude':
            if not ANTHROPIC_AVAILABLE:
                raise Exception("Anthropic 라이브러리가 설치되지 않았습니다.")

            client = Anthropic(api_key=self.api_key)

            # 메시지 구성
            content = [{"type": "text", "text": prompt}]
            for img_b64 in images_base64:
                content.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": img_b64
                    }
                })

            response = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=2048,
                messages=[{"role": "user", "content": content}]
            )

            analysis_text = response.content[0].text

        elif self.model_type == 'openai':
            if not OPENAI_AVAILABLE:
                raise Exception("OpenAI 라이브러리가 설치되지 않았습니다.")

            client = OpenAI(api_key=self.api_key)

            # 메시지 구성
            content = [{"type": "text", "text": prompt}]
            for img_b64 in images_base64:
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{img_b64}"}
                })

            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": content}],
                max_tokens=2048
            )

            analysis_text = response.choices[0].message.content

        else:
            raise Exception(f"지원하지 않는 모델: {self.model_type}")

        self.result.emit({
            'success': True,
            'analysis': analysis_text,
            'frame_count': len(images_base64)
        })

    def analyze_subtitle(self):
        """자막 분석"""
        subtitle_text = self.kwargs['subtitle_text']
        analysis_goal = self.kwargs.get('analysis_goal', 'general')

        self.progress.emit("자막 분석 중...")

        # 분석 목적에 따른 프롬프트
        prompts = {
            'general': '이 자막을 분석하여 주요 내용을 요약해주세요.',
            'shorts': '이 자막을 분석하여 쇼츠에 적합한 하이라이트 구간을 추천해주세요. 각 구간의 시작/끝 시간과 이유를 설명해주세요.',
            'education': '이 자막을 분석하여 교육 콘텐츠로 재구성할 방법을 제안해주세요.',
            'summary': '이 자막의 핵심 내용을 3-5개의 bullet point로 요약해주세요.'
        }

        prompt = f"{prompts.get(analysis_goal, prompts['general'])}\n\n자막 내용:\n{subtitle_text}"

        if self.model_type == 'claude':
            if not ANTHROPIC_AVAILABLE:
                raise Exception("Anthropic 라이브러리가 설치되지 않았습니다.")

            client = Anthropic(api_key=self.api_key)
            response = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}]
            )
            analysis_text = response.content[0].text

        elif self.model_type == 'openai':
            if not OPENAI_AVAILABLE:
                raise Exception("OpenAI 라이브러리가 설치되지 않았습니다.")

            client = OpenAI(api_key=self.api_key)
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=2048
            )
            analysis_text = response.choices[0].message.content

        else:
            raise Exception(f"지원하지 않는 모델: {self.model_type}")

        self.result.emit({
            'success': True,
            'analysis': analysis_text,
            'goal': analysis_goal
        })

    def generate_subtitle(self):
        """자막 생성 (영상 프레임 기반)"""
        frame_paths = self.kwargs['frame_paths']
        language = self.kwargs.get('language', 'ko')

        self.progress.emit(f"{len(frame_paths)}개 프레임 기반 자막 생성 중...")

        # 프레임 분석 후 자막 생성
        images_base64 = []
        for frame_path in frame_paths[:20]:  # 최대 20개
            with open(frame_path, 'rb') as f:
                image_data = base64.b64encode(f.read()).decode('utf-8')
                images_base64.append(image_data)

        language_map = {
            'ko': '한국어',
            'en': '영어',
            'ja': '일본어'
        }
        lang_name = language_map.get(language, '한국어')

        prompt = f"""이 영상 프레임들을 분석하여 {lang_name} 자막을 생성해주세요.

요구사항:
1. 각 프레임은 순서대로 시간 흐름을 나타냅니다
2. 자연스럽고 이해하기 쉬운 {lang_name}로 작성
3. SRT 형식으로 출력
4. 각 자막은 2-4초 길이로 설정

형식:
1
00:00:00,000 --> 00:00:02,000
첫 번째 자막 내용

2
00:00:02,000 --> 00:00:04,000
두 번째 자막 내용
"""

        if self.model_type == 'claude':
            if not ANTHROPIC_AVAILABLE:
                raise Exception("Anthropic 라이브러리가 설치되지 않았습니다.")

            client = Anthropic(api_key=self.api_key)

            content = [{"type": "text", "text": prompt}]
            for img_b64 in images_base64:
                content.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/png",
                        "data": img_b64
                    }
                })

            response = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=4096,
                messages=[{"role": "user", "content": content}]
            )

            subtitle_text = response.content[0].text

        elif self.model_type == 'openai':
            if not OPENAI_AVAILABLE:
                raise Exception("OpenAI 라이브러리가 설치되지 않았습니다.")

            client = OpenAI(api_key=self.api_key)

            content = [{"type": "text", "text": prompt}]
            for img_b64 in images_base64:
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{img_b64}"}
                })

            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": content}],
                max_tokens=4096
            )

            subtitle_text = response.choices[0].message.content

        else:
            raise Exception(f"지원하지 않는 모델: {self.model_type}")

        self.result.emit({
            'success': True,
            'subtitle_text': subtitle_text,
            'language': language,
            'frame_count': len(images_base64)
        })


class VideoMaker(QMainWindow):
    """Video Maker 메인 윈도우"""

    def __init__(self):
        super().__init__()
        self.config = self.load_config()
        self.current_video_path = None
        self.current_subtitle_path = None
        self.extracted_frames = []

        self.init_ui()

    def init_ui(self):
        """UI 초기화"""
        self.setWindowTitle('Video Maker - 영상 편집 & 자막 & AI 분석')
        self.setGeometry(100, 100, 1200, 800)

        # 메인 위젯
        main_widget = QWidget()
        self.setCentralWidget(main_widget)
        layout = QVBoxLayout(main_widget)

        # 탭 위젯
        self.tabs = QTabWidget()
        layout.addWidget(self.tabs)

        # 탭 생성
        self.create_video_edit_tab()
        self.create_subtitle_tab()
        self.create_ai_analysis_tab()
        self.create_settings_tab()

        # 상태바
        self.statusBar().showMessage('준비 완료')

    def create_video_edit_tab(self):
        """영상 편집 탭"""
        tab = QWidget()
        layout = QVBoxLayout(tab)

        # 영상 선택
        video_group = QGroupBox("영상 선택")
        video_layout = QGridLayout()

        self.video_path_input = QLineEdit()
        self.video_path_input.setPlaceholderText("영상 파일 경로")
        video_browse_btn = QPushButton("찾아보기")
        video_browse_btn.clicked.connect(self.browse_video)

        video_layout.addWidget(QLabel("영상 파일:"), 0, 0)
        video_layout.addWidget(self.video_path_input, 0, 1)
        video_layout.addWidget(video_browse_btn, 0, 2)

        video_group.setLayout(video_layout)
        layout.addWidget(video_group)

        # 영상 자르기
        cut_group = QGroupBox("영상 자르기")
        cut_layout = QGridLayout()

        self.start_time_input = QLineEdit("00:00:00")
        self.start_time_input.setPlaceholderText("HH:MM:SS")
        self.end_time_input = QLineEdit("00:00:10")
        self.end_time_input.setPlaceholderText("HH:MM:SS")

        cut_btn = QPushButton("자르기 실행")
        cut_btn.clicked.connect(self.cut_video)

        cut_layout.addWidget(QLabel("시작 시간:"), 0, 0)
        cut_layout.addWidget(self.start_time_input, 0, 1)
        cut_layout.addWidget(QLabel("종료 시간:"), 1, 0)
        cut_layout.addWidget(self.end_time_input, 1, 1)
        cut_layout.addWidget(cut_btn, 2, 0, 1, 2)

        cut_group.setLayout(cut_layout)
        layout.addWidget(cut_group)

        # 영상 합치기
        merge_group = QGroupBox("영상 합치기")
        merge_layout = QVBoxLayout()

        self.merge_list = QListWidget()
        merge_list_buttons = QHBoxLayout()

        add_merge_btn = QPushButton("영상 추가")
        add_merge_btn.clicked.connect(self.add_merge_video)
        remove_merge_btn = QPushButton("선택 삭제")
        remove_merge_btn.clicked.connect(self.remove_merge_video)
        merge_btn = QPushButton("합치기 실행")
        merge_btn.clicked.connect(self.merge_videos)

        merge_list_buttons.addWidget(add_merge_btn)
        merge_list_buttons.addWidget(remove_merge_btn)
        merge_list_buttons.addWidget(merge_btn)

        merge_layout.addWidget(self.merge_list)
        merge_layout.addLayout(merge_list_buttons)

        merge_group.setLayout(merge_layout)
        layout.addWidget(merge_group)

        # 프레임 추출
        frame_group = QGroupBox("프레임 추출")
        frame_layout = QGridLayout()

        self.frame_interval_spin = QSpinBox()
        self.frame_interval_spin.setRange(1, 60)
        self.frame_interval_spin.setValue(5)
        self.frame_interval_spin.setSuffix("초")

        extract_frame_btn = QPushButton("프레임 추출")
        extract_frame_btn.clicked.connect(self.extract_frames)

        frame_layout.addWidget(QLabel("추출 간격:"), 0, 0)
        frame_layout.addWidget(self.frame_interval_spin, 0, 1)
        frame_layout.addWidget(extract_frame_btn, 0, 2)

        frame_group.setLayout(frame_layout)
        layout.addWidget(frame_group)

        # 진행률
        self.video_progress_bar = QProgressBar()
        self.video_progress_bar.setVisible(False)
        layout.addWidget(self.video_progress_bar)

        # 결과 표시
        self.video_result_text = QTextEdit()
        self.video_result_text.setReadOnly(True)
        self.video_result_text.setMaximumHeight(150)
        layout.addWidget(QLabel("처리 결과:"))
        layout.addWidget(self.video_result_text)

        layout.addStretch()
        self.tabs.addTab(tab, "영상 편집")

    def create_subtitle_tab(self):
        """자막 생성/편집 탭"""
        tab = QWidget()
        layout = QVBoxLayout(tab)

        # 자막 파일 선택
        subtitle_file_group = QGroupBox("자막 파일")
        subtitle_file_layout = QGridLayout()

        self.subtitle_path_input = QLineEdit()
        self.subtitle_path_input.setPlaceholderText("자막 파일 경로 (선택사항)")
        subtitle_browse_btn = QPushButton("찾아보기")
        subtitle_browse_btn.clicked.connect(self.browse_subtitle)

        subtitle_file_layout.addWidget(QLabel("자막 파일:"), 0, 0)
        subtitle_file_layout.addWidget(self.subtitle_path_input, 0, 1)
        subtitle_file_layout.addWidget(subtitle_browse_btn, 0, 2)

        subtitle_file_group.setLayout(subtitle_file_layout)
        layout.addWidget(subtitle_file_group)

        # AI 자막 생성
        ai_subtitle_group = QGroupBox("AI 자막 생성")
        ai_subtitle_layout = QGridLayout()

        self.subtitle_language_combo = QComboBox()
        self.subtitle_language_combo.addItems(['한국어', 'English', '日本語'])

        generate_subtitle_btn = QPushButton("프레임 기반 자막 생성")
        generate_subtitle_btn.clicked.connect(self.generate_subtitle_from_frames)

        ai_subtitle_layout.addWidget(QLabel("언어:"), 0, 0)
        ai_subtitle_layout.addWidget(self.subtitle_language_combo, 0, 1)
        ai_subtitle_layout.addWidget(generate_subtitle_btn, 1, 0, 1, 2)

        ai_subtitle_group.setLayout(ai_subtitle_layout)
        layout.addWidget(ai_subtitle_group)

        # 자막 편집기
        editor_group = QGroupBox("자막 편집")
        editor_layout = QVBoxLayout()

        self.subtitle_editor = QTextEdit()
        self.subtitle_editor.setPlaceholderText("자막 내용 (SRT 형식)")

        editor_buttons = QHBoxLayout()
        load_subtitle_btn = QPushButton("자막 불러오기")
        load_subtitle_btn.clicked.connect(self.load_subtitle)
        save_subtitle_btn = QPushButton("자막 저장")
        save_subtitle_btn.clicked.connect(self.save_subtitle)

        editor_buttons.addWidget(load_subtitle_btn)
        editor_buttons.addWidget(save_subtitle_btn)

        editor_layout.addWidget(self.subtitle_editor)
        editor_layout.addLayout(editor_buttons)

        editor_group.setLayout(editor_layout)
        layout.addWidget(editor_group)

        # 자막 추가 (영상에)
        add_subtitle_group = QGroupBox("영상에 자막 추가")
        add_subtitle_layout = QHBoxLayout()

        add_subtitle_btn = QPushButton("자막 추가하여 새 영상 생성")
        add_subtitle_btn.clicked.connect(self.add_subtitle_to_video)

        add_subtitle_layout.addWidget(add_subtitle_btn)

        add_subtitle_group.setLayout(add_subtitle_layout)
        layout.addWidget(add_subtitle_group)

        # 진행률
        self.subtitle_progress_bar = QProgressBar()
        self.subtitle_progress_bar.setVisible(False)
        layout.addWidget(self.subtitle_progress_bar)

        layout.addStretch()
        self.tabs.addTab(tab, "자막")

    def create_ai_analysis_tab(self):
        """AI 분석 탭"""
        tab = QWidget()
        layout = QVBoxLayout(tab)

        # 분석 유형 선택
        analysis_type_group = QGroupBox("분석 유형")
        analysis_type_layout = QGridLayout()

        self.analysis_type_combo = QComboBox()
        self.analysis_type_combo.addItems([
            '프레임 분석 (일반)',
            '자막 분석 (요약)',
            '자막 분석 (쇼츠 최적화)',
            '자막 분석 (교육 콘텐츠)'
        ])

        self.ai_model_combo = QComboBox()
        self.ai_model_combo.addItems(['Claude (Anthropic)', 'GPT-4o (OpenAI)'])

        analysis_type_layout.addWidget(QLabel("분석 유형:"), 0, 0)
        analysis_type_layout.addWidget(self.analysis_type_combo, 0, 1)
        analysis_type_layout.addWidget(QLabel("AI 모델:"), 1, 0)
        analysis_type_layout.addWidget(self.ai_model_combo, 1, 1)

        analysis_type_group.setLayout(analysis_type_layout)
        layout.addWidget(analysis_type_group)

        # 분석 실행
        analyze_btn = QPushButton("분석 시작")
        analyze_btn.clicked.connect(self.run_ai_analysis)
        layout.addWidget(analyze_btn)

        # 진행률
        self.ai_progress_bar = QProgressBar()
        self.ai_progress_bar.setVisible(False)
        layout.addWidget(self.ai_progress_bar)

        # 분석 결과
        result_group = QGroupBox("분석 결과")
        result_layout = QVBoxLayout()

        self.ai_result_text = QTextEdit()
        self.ai_result_text.setReadOnly(True)

        result_buttons = QHBoxLayout()
        copy_result_btn = QPushButton("결과 복사")
        copy_result_btn.clicked.connect(self.copy_ai_result)
        save_result_btn = QPushButton("결과 저장")
        save_result_btn.clicked.connect(self.save_ai_result)

        result_buttons.addWidget(copy_result_btn)
        result_buttons.addWidget(save_result_btn)

        result_layout.addWidget(self.ai_result_text)
        result_layout.addLayout(result_buttons)

        result_group.setLayout(result_layout)
        layout.addWidget(result_group)

        layout.addStretch()
        self.tabs.addTab(tab, "AI 분석")

    def create_settings_tab(self):
        """설정 탭"""
        tab = QWidget()
        layout = QVBoxLayout(tab)

        # API 키 설정
        api_group = QGroupBox("API 설정")
        api_layout = QGridLayout()

        self.anthropic_key_input = QLineEdit()
        self.anthropic_key_input.setEchoMode(QLineEdit.Password)
        self.anthropic_key_input.setPlaceholderText("sk-ant-...")
        self.anthropic_key_input.setText(self.config.get('anthropic_api_key', ''))

        self.openai_key_input = QLineEdit()
        self.openai_key_input.setEchoMode(QLineEdit.Password)
        self.openai_key_input.setPlaceholderText("sk-...")
        self.openai_key_input.setText(self.config.get('openai_api_key', ''))

        api_layout.addWidget(QLabel("Anthropic API Key:"), 0, 0)
        api_layout.addWidget(self.anthropic_key_input, 0, 1)
        api_layout.addWidget(QLabel("OpenAI API Key:"), 1, 0)
        api_layout.addWidget(self.openai_key_input, 1, 1)

        api_group.setLayout(api_layout)
        layout.addWidget(api_group)

        # 출력 디렉토리 설정
        output_group = QGroupBox("출력 설정")
        output_layout = QGridLayout()

        self.output_dir_input = QLineEdit()
        self.output_dir_input.setText(self.config.get('output_dir', str(Path.home() / 'Videos' / 'videomaker_output')))
        output_browse_btn = QPushButton("찾아보기")
        output_browse_btn.clicked.connect(self.browse_output_dir)

        output_layout.addWidget(QLabel("출력 디렉토리:"), 0, 0)
        output_layout.addWidget(self.output_dir_input, 0, 1)
        output_layout.addWidget(output_browse_btn, 0, 2)

        output_group.setLayout(output_layout)
        layout.addWidget(output_group)

        # 저장 버튼
        save_settings_btn = QPushButton("설정 저장")
        save_settings_btn.clicked.connect(self.save_settings)
        layout.addWidget(save_settings_btn)

        layout.addStretch()
        self.tabs.addTab(tab, "설정")

    # ===== 설정 관련 메서드 =====

    def load_config(self):
        """설정 파일 로드"""
        config_path = Path.home() / '.videomaker_config.json'
        if config_path.exists():
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {}

    def save_settings(self):
        """설정 저장"""
        self.config['anthropic_api_key'] = self.anthropic_key_input.text().strip()
        self.config['openai_api_key'] = self.openai_key_input.text().strip()
        self.config['output_dir'] = self.output_dir_input.text().strip()

        config_path = Path.home() / '.videomaker_config.json'
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(self.config, f, ensure_ascii=False, indent=2)

        QMessageBox.information(self, "저장 완료", "설정이 저장되었습니다.")
        self.statusBar().showMessage('설정 저장 완료')

    def browse_output_dir(self):
        """출력 디렉토리 선택"""
        directory = QFileDialog.getExistingDirectory(self, "출력 디렉토리 선택")
        if directory:
            self.output_dir_input.setText(directory)

    # ===== 영상 편집 관련 메서드 =====

    def browse_video(self):
        """영상 파일 선택"""
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "영상 파일 선택",
            "",
            "Video Files (*.mp4 *.mkv *.avi *.mov *.webm);;All Files (*)"
        )
        if file_path:
            self.video_path_input.setText(file_path)
            self.current_video_path = file_path

    def cut_video(self):
        """영상 자르기"""
        video_path = self.video_path_input.text().strip()
        if not video_path or not Path(video_path).exists():
            QMessageBox.warning(self, "경고", "유효한 영상 파일을 선택하세요")
            return

        start_time = self.start_time_input.text().strip()
        end_time = self.end_time_input.text().strip()

        # 출력 경로
        output_dir = Path(self.config.get('output_dir', Path.home() / 'Videos' / 'videomaker_output'))
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_path = output_dir / f'cut_{timestamp}.mp4'

        self.video_progress_bar.setVisible(True)
        self.video_progress_bar.setRange(0, 0)

        self.worker = VideoProcessWorker(
            'cut_video',
            video_path=video_path,
            start_time=start_time,
            end_time=end_time,
            output_path=str(output_path)
        )
        self.worker.progress.connect(self.on_video_progress)
        self.worker.result.connect(self.on_video_result)
        self.worker.error.connect(self.on_video_error)
        self.worker.start()

    def add_merge_video(self):
        """합칠 영상 추가"""
        file_paths, _ = QFileDialog.getOpenFileNames(
            self,
            "영상 파일 선택",
            "",
            "Video Files (*.mp4 *.mkv *.avi *.mov *.webm);;All Files (*)"
        )
        for file_path in file_paths:
            self.merge_list.addItem(file_path)

    def remove_merge_video(self):
        """선택된 영상 삭제"""
        current_row = self.merge_list.currentRow()
        if current_row >= 0:
            self.merge_list.takeItem(current_row)

    def merge_videos(self):
        """영상 합치기"""
        if self.merge_list.count() < 2:
            QMessageBox.warning(self, "경고", "최소 2개의 영상을 추가하세요")
            return

        video_paths = [self.merge_list.item(i).text() for i in range(self.merge_list.count())]

        # 출력 경로
        output_dir = Path(self.config.get('output_dir', Path.home() / 'Videos' / 'videomaker_output'))
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_path = output_dir / f'merged_{timestamp}.mp4'

        self.video_progress_bar.setVisible(True)
        self.video_progress_bar.setRange(0, 0)

        self.worker = VideoProcessWorker(
            'merge_videos',
            video_paths=video_paths,
            output_path=str(output_path)
        )
        self.worker.progress.connect(self.on_video_progress)
        self.worker.result.connect(self.on_video_result)
        self.worker.error.connect(self.on_video_error)
        self.worker.start()

    def extract_frames(self):
        """프레임 추출"""
        video_path = self.video_path_input.text().strip()
        if not video_path or not Path(video_path).exists():
            QMessageBox.warning(self, "경고", "유효한 영상 파일을 선택하세요")
            return

        interval = self.frame_interval_spin.value()

        # 출력 디렉토리
        output_dir = Path(self.config.get('output_dir', Path.home() / 'Videos' / 'videomaker_output'))
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        frames_dir = output_dir / f'frames_{timestamp}'

        self.video_progress_bar.setVisible(True)
        self.video_progress_bar.setRange(0, 0)

        self.worker = VideoProcessWorker(
            'extract_frames',
            video_path=video_path,
            output_dir=str(frames_dir),
            interval=interval
        )
        self.worker.progress.connect(self.on_video_progress)
        self.worker.result.connect(self.on_frames_extracted)
        self.worker.error.connect(self.on_video_error)
        self.worker.start()

    def on_frames_extracted(self, result):
        """프레임 추출 완료"""
        self.video_progress_bar.setVisible(False)
        self.extracted_frames = result['frames']

        self.video_result_text.append(f"\n✅ {result['message']}")
        self.video_result_text.append(f"   출력 디렉토리: {Path(result['frames'][0]).parent}")

        QMessageBox.information(self, "완료", result['message'])
        self.statusBar().showMessage(result['message'])

    def on_video_progress(self, message):
        """진행 상태 업데이트"""
        self.statusBar().showMessage(message)

    def on_video_result(self, result):
        """영상 처리 완료"""
        self.video_progress_bar.setVisible(False)

        if result.get('success'):
            self.video_result_text.append(f"\n✅ {result['message']}")
            self.video_result_text.append(f"   출력 파일: {result['output_path']}")

            QMessageBox.information(self, "완료", result['message'])
            self.statusBar().showMessage(result['message'])

    def on_video_error(self, error):
        """영상 처리 오류"""
        self.video_progress_bar.setVisible(False)
        self.video_result_text.append(f"\n❌ 오류: {error}")

        QMessageBox.critical(self, "오류", f"처리 중 오류가 발생했습니다:\n{error}")
        self.statusBar().showMessage(f'오류: {error}')

    # ===== 자막 관련 메서드 =====

    def browse_subtitle(self):
        """자막 파일 선택"""
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "자막 파일 선택",
            "",
            "Subtitle Files (*.srt *.vtt *.ass);;All Files (*)"
        )
        if file_path:
            self.subtitle_path_input.setText(file_path)
            self.current_subtitle_path = file_path

    def load_subtitle(self):
        """자막 불러오기"""
        subtitle_path = self.subtitle_path_input.text().strip()
        if subtitle_path and Path(subtitle_path).exists():
            with open(subtitle_path, 'r', encoding='utf-8') as f:
                content = f.read()
                self.subtitle_editor.setPlainText(content)
        else:
            QMessageBox.warning(self, "경고", "유효한 자막 파일을 선택하세요")

    def save_subtitle(self):
        """자막 저장"""
        content = self.subtitle_editor.toPlainText()
        if not content:
            QMessageBox.warning(self, "경고", "저장할 자막이 없습니다")
            return

        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "자막 저장",
            "",
            "SRT Files (*.srt);;All Files (*)"
        )

        if file_path:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)

            self.subtitle_path_input.setText(file_path)
            self.current_subtitle_path = file_path

            QMessageBox.information(self, "저장 완료", f"자막이 저장되었습니다:\n{file_path}")

    def generate_subtitle_from_frames(self):
        """프레임 기반 자막 생성"""
        if not self.extracted_frames:
            QMessageBox.warning(self, "경고", "먼저 프레임을 추출하세요 (영상 편집 탭)")
            return

        # API 키 확인
        model_type = 'claude' if 'Claude' in self.ai_model_combo.currentText() else 'openai'
        api_key = self.config.get('anthropic_api_key' if model_type == 'claude' else 'openai_api_key', '')

        if not api_key:
            QMessageBox.warning(self, "경고", f"설정 탭에서 {model_type.upper()} API 키를 입력하세요")
            return

        # 언어 매핑
        language_map = {
            '한국어': 'ko',
            'English': 'en',
            '日本語': 'ja'
        }
        language = language_map.get(self.subtitle_language_combo.currentText(), 'ko')

        self.subtitle_progress_bar.setVisible(True)
        self.subtitle_progress_bar.setRange(0, 0)

        self.worker = AIAnalysisWorker(
            api_key,
            'generate_subtitle',
            model_type,
            frame_paths=self.extracted_frames,
            language=language
        )
        self.worker.progress.connect(self.on_subtitle_progress)
        self.worker.result.connect(self.on_subtitle_generated)
        self.worker.error.connect(self.on_subtitle_error)
        self.worker.start()

    def on_subtitle_progress(self, message):
        """자막 생성 진행 상태"""
        self.statusBar().showMessage(message)

    def on_subtitle_generated(self, result):
        """자막 생성 완료"""
        self.subtitle_progress_bar.setVisible(False)

        if result.get('success'):
            subtitle_text = result['subtitle_text']

            # SRT 블록 추출
            srt_match = re.search(r'```(?:srt)?\s*\n(.*?)\n```', subtitle_text, re.DOTALL)
            if srt_match:
                subtitle_text = srt_match.group(1).strip()

            self.subtitle_editor.setPlainText(subtitle_text)

            QMessageBox.information(
                self,
                "완료",
                f"자막 생성 완료\n언어: {result['language']}\n프레임: {result['frame_count']}개"
            )
            self.statusBar().showMessage('자막 생성 완료')

    def on_subtitle_error(self, error):
        """자막 처리 오류"""
        self.subtitle_progress_bar.setVisible(False)

        QMessageBox.critical(self, "오류", f"자막 생성 중 오류가 발생했습니다:\n{error}")
        self.statusBar().showMessage(f'오류: {error}')

    def add_subtitle_to_video(self):
        """영상에 자막 추가"""
        video_path = self.video_path_input.text().strip()
        if not video_path or not Path(video_path).exists():
            QMessageBox.warning(self, "경고", "유효한 영상 파일을 선택하세요 (영상 편집 탭)")
            return

        # 자막 저장 (임시 파일)
        subtitle_content = self.subtitle_editor.toPlainText()
        if not subtitle_content:
            QMessageBox.warning(self, "경고", "자막 내용이 없습니다")
            return

        temp_srt = tempfile.NamedTemporaryFile(mode='w', suffix='.srt', delete=False, encoding='utf-8')
        temp_srt.write(subtitle_content)
        temp_srt.close()

        # 출력 경로
        output_dir = Path(self.config.get('output_dir', Path.home() / 'Videos' / 'videomaker_output'))
        output_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        output_path = output_dir / f'with_subtitle_{timestamp}.mp4'

        self.subtitle_progress_bar.setVisible(True)
        self.subtitle_progress_bar.setRange(0, 0)

        self.worker = VideoProcessWorker(
            'add_subtitle',
            video_path=video_path,
            subtitle_path=temp_srt.name,
            output_path=str(output_path)
        )
        self.worker.progress.connect(self.on_subtitle_progress)
        self.worker.result.connect(lambda r: self.on_subtitle_added(r, temp_srt.name))
        self.worker.error.connect(self.on_subtitle_error)
        self.worker.start()

    def on_subtitle_added(self, result, temp_file):
        """자막 추가 완료"""
        self.subtitle_progress_bar.setVisible(False)

        # 임시 파일 삭제
        try:
            os.unlink(temp_file)
        except:
            pass

        if result.get('success'):
            QMessageBox.information(
                self,
                "완료",
                f"{result['message']}\n\n출력 파일:\n{result['output_path']}"
            )
            self.statusBar().showMessage(result['message'])

    # ===== AI 분석 관련 메서드 =====

    def run_ai_analysis(self):
        """AI 분석 실행"""
        analysis_type = self.analysis_type_combo.currentText()
        model_type = 'claude' if 'Claude' in self.ai_model_combo.currentText() else 'openai'

        api_key = self.config.get('anthropic_api_key' if model_type == 'claude' else 'openai_api_key', '')

        if not api_key:
            QMessageBox.warning(self, "경고", f"설정 탭에서 {model_type.upper()} API 키를 입력하세요")
            return

        if '프레임 분석' in analysis_type:
            if not self.extracted_frames:
                QMessageBox.warning(self, "경고", "먼저 프레임을 추출하세요 (영상 편집 탭)")
                return

            self.analyze_frames(api_key, model_type)

        elif '자막 분석' in analysis_type:
            subtitle_content = self.subtitle_editor.toPlainText()
            if not subtitle_content:
                QMessageBox.warning(self, "경고", "먼저 자막을 불러오거나 생성하세요 (자막 탭)")
                return

            # 분석 목적 결정
            if '요약' in analysis_type:
                goal = 'summary'
            elif '쇼츠' in analysis_type:
                goal = 'shorts'
            elif '교육' in analysis_type:
                goal = 'education'
            else:
                goal = 'general'

            self.analyze_subtitle(api_key, model_type, subtitle_content, goal)

    def analyze_frames(self, api_key, model_type):
        """프레임 분석"""
        self.ai_progress_bar.setVisible(True)
        self.ai_progress_bar.setRange(0, 0)

        self.worker = AIAnalysisWorker(
            api_key,
            'analyze_frames',
            model_type,
            frame_paths=self.extracted_frames[:10]  # 최대 10개
        )
        self.worker.progress.connect(self.on_ai_progress)
        self.worker.result.connect(self.on_ai_result)
        self.worker.error.connect(self.on_ai_error)
        self.worker.start()

    def analyze_subtitle(self, api_key, model_type, subtitle_text, goal):
        """자막 분석"""
        self.ai_progress_bar.setVisible(True)
        self.ai_progress_bar.setRange(0, 0)

        self.worker = AIAnalysisWorker(
            api_key,
            'analyze_subtitle',
            model_type,
            subtitle_text=subtitle_text,
            analysis_goal=goal
        )
        self.worker.progress.connect(self.on_ai_progress)
        self.worker.result.connect(self.on_ai_result)
        self.worker.error.connect(self.on_ai_error)
        self.worker.start()

    def on_ai_progress(self, message):
        """AI 분석 진행 상태"""
        self.statusBar().showMessage(message)

    def on_ai_result(self, result):
        """AI 분석 완료"""
        self.ai_progress_bar.setVisible(False)

        if result.get('success'):
            analysis = result['analysis']
            self.ai_result_text.setPlainText(analysis)

            QMessageBox.information(self, "완료", "AI 분석이 완료되었습니다")
            self.statusBar().showMessage('AI 분석 완료')

    def on_ai_error(self, error):
        """AI 분석 오류"""
        self.ai_progress_bar.setVisible(False)

        QMessageBox.critical(self, "오류", f"AI 분석 중 오류가 발생했습니다:\n{error}")
        self.statusBar().showMessage(f'오류: {error}')

    def copy_ai_result(self):
        """AI 결과 복사"""
        result = self.ai_result_text.toPlainText()
        if result:
            clipboard = QApplication.clipboard()
            clipboard.setText(result)
            QMessageBox.information(self, "완료", "결과가 클립보드에 복사되었습니다")

    def save_ai_result(self):
        """AI 결과 저장"""
        result = self.ai_result_text.toPlainText()
        if not result:
            QMessageBox.warning(self, "경고", "저장할 결과가 없습니다")
            return

        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "분석 결과 저장",
            "",
            "Text Files (*.txt);;Markdown Files (*.md);;All Files (*)"
        )

        if file_path:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(result)

            QMessageBox.information(self, "저장 완료", f"분석 결과가 저장되었습니다:\n{file_path}")


def main():
    """메인 함수"""
    app = QApplication(sys.argv)

    # 폰트 설정
    font = QFont()
    font.setPointSize(10)
    app.setFont(font)

    window = VideoMaker()
    window.show()

    sys.exit(app.exec_())


if __name__ == '__main__':
    main()
