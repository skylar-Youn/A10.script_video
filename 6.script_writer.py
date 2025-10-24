#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script Writer - 글 작성하기 & 대본 만들기
- OpenAI API를 사용한 대본 생성 (API 모드)
- ChatGPT 웹 창을 열어서 작업 (ChatGPT 창 모드 - API 키 불필요)
- 파트별 대본 생성 (1~5부, 1~10분)
- 이미지/영상 프롬프트 생성
- 대본 편집 및 저장 기능
"""

import sys
import json
import os
import webbrowser
import urllib.parse
from datetime import datetime
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout,
                             QHBoxLayout, QLabel, QLineEdit, QPushButton,
                             QTextEdit, QComboBox, QSpinBox, QGroupBox,
                             QGridLayout, QMessageBox, QProgressBar, QTabWidget,
                             QRadioButton, QButtonGroup, QListWidget, QListWidgetItem,
                             QScrollArea, QDialog, QDialogButtonBox, QFileDialog)
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QFont

# OpenAI 라이브러리 가용성 확인
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

# Anthropic Claude 라이브러리 가용성 확인
try:
    from anthropic import Anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

# 자막 추출 기능 임포트
SUBTITLE_EXTRACTOR_AVAILABLE = False
try:
    # 현재 스크립트의 디렉토리 경로를 sys.path에 추가
    current_dir = os.path.dirname(os.path.abspath(__file__))
    subtitle_module_path = os.path.join(current_dir, '5_youtubefinder_unified')
    if os.path.exists(subtitle_module_path):
        sys.path.insert(0, subtitle_module_path)
        from api.subtitle_extractor import SubtitleExtractor
        from utils.helpers import convert_shorts_to_watch_url, remove_timestamps_from_subtitle
        SUBTITLE_EXTRACTOR_AVAILABLE = True
except ImportError as e:
    print(f"자막 추출 모듈 로드 실패: {e}")
    SUBTITLE_EXTRACTOR_AVAILABLE = False


class ScriptGeneratorWorker(QThread):
    """대본 생성을 별도 스레드에서 처리"""
    progress = pyqtSignal(str)
    result = pyqtSignal(dict)
    error = pyqtSignal(str)

    def __init__(self, api_key, topic, language, part_number, part_duration):
        super().__init__()
        self.api_key = api_key
        self.topic = topic
        self.language = language
        self.part_number = part_number
        self.part_duration = part_duration

    def run(self):
        try:
            client = OpenAI(api_key=self.api_key)

            # 언어별 프롬프트
            language_map = {
                "ko": "한국어",
                "en": "영어",
                "ja": "일본어"
            }
            lang_name = language_map.get(self.language, "한국어")

            self.progress.emit(f"{self.topic}에 대한 {self.part_number}부 대본 생성 중...")

            # 대본 생성 프롬프트
            prompt = f"""다음 주제에 대한 {lang_name} 영상 대본을 작성해주세요.

주제: {self.topic}
파트: {self.part_number}부
길이: 약 {self.part_duration}분

요구사항:
1. {lang_name}로 작성
2. 시청자가 이해하기 쉬운 대본
3. 각 장면은 이모지(🎬, ⚛️, 🧘 등)로 시작
4. 장면별로 명확하게 구분
5. 약 {self.part_duration}분 분량의 내용

형식:
🎬 [장면 제목]
대본 내용...

⚛️ [다음 장면 제목]
대본 내용...
"""

            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "당신은 전문 영상 대본 작가입니다. 시청자가 이해하기 쉽고 흥미로운 대본을 작성합니다."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=2000
            )

            script_content = response.choices[0].message.content.strip()

            self.result.emit({
                "topic": self.topic,
                "language": self.language,
                "part_number": self.part_number,
                "part_duration": self.part_duration,
                "content": script_content
            })

        except Exception as e:
            self.error.emit(f"대본 생성 중 오류: {str(e)}")


class MediaPromptsWorker(QThread):
    """이미지/영상 프롬프트 생성을 별도 스레드에서 처리"""
    progress = pyqtSignal(str)
    result = pyqtSignal(list)
    error = pyqtSignal(str)

    def __init__(self, api_key, script_content, topic):
        super().__init__()
        self.api_key = api_key
        self.script_content = script_content
        self.topic = topic

    def run(self):
        try:
            client = OpenAI(api_key=self.api_key)

            # 대본을 장면별로 파싱
            self.progress.emit("대본을 장면별로 분석 중...")
            scenes = self._parse_scenes(self.script_content)

            scene_prompts = []
            total_scenes = len(scenes)

            for idx, scene in enumerate(scenes):
                scene_num = idx + 1
                self.progress.emit(f"장면 {scene_num}/{total_scenes} 프롬프트 생성 중...")

                scene_title = scene["title"]
                scene_content = scene["content"]

                # 이미지 프롬프트 생성
                image_prompt = self._generate_image_prompt(client, scene_title, scene_content)

                # 영상 프롬프트 생성
                video_prompt = self._generate_video_prompt(client, scene_title, scene_content)

                scene_prompts.append({
                    "scene_number": scene_num,
                    "scene_title": scene_title,
                    "scene_content": scene_content[:200] + ("..." if len(scene_content) > 200 else ""),
                    "image_prompt": image_prompt,
                    "video_prompt": video_prompt
                })

            self.result.emit(scene_prompts)

        except Exception as e:
            self.error.emit(f"프롬프트 생성 중 오류: {str(e)}")

    def _parse_scenes(self, script_content):
        """대본을 장면별로 파싱"""
        scenes = []
        current_scene = {"title": "", "content": ""}

        lines = script_content.split('\n')
        for line in lines:
            line = line.strip()
            if not line:
                if current_scene["content"]:
                    scenes.append(current_scene)
                    current_scene = {"title": "", "content": ""}
                continue

            # 장면 제목 감지
            if any(emoji in line for emoji in ['🎧', '🎬', '⚛️', '🧘', '🧠', '🌌', '🧑‍🔬', '🧩', '🌠', '📹', '✍️']):
                if current_scene["content"]:
                    scenes.append(current_scene)
                current_scene = {"title": line, "content": ""}
            else:
                current_scene["content"] += line + "\n"

        if current_scene["content"]:
            scenes.append(current_scene)

        return scenes

    def _generate_image_prompt(self, client, scene_title, scene_content):
        """이미지 생성 프롬프트 생성"""
        try:
            prompt = f"""Based on this scene, create a detailed English image generation prompt suitable for AI tools like Midjourney, DALL-E, Stable Diffusion.

Scene: {scene_title}
Content: {scene_content[:500]}

Requirements:
- English only
- Specific visual elements, lighting, colors, composition, mood
- Under 150 words
- Suitable for image generation AI

Just provide the prompt text."""

            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a professional image prompt generator."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=300
            )

            return response.choices[0].message.content.strip()
        except Exception:
            return f"Scene: {scene_title}"

    def _generate_video_prompt(self, client, scene_title, scene_content):
        """영상 생성 프롬프트 생성"""
        try:
            prompt = f"""Based on this scene, create a detailed English video generation prompt suitable for AI tools like Sora, Runway, Kling AI.

Scene: {scene_title}
Content: {scene_content[:500]}

Requirements:
- English only
- Camera movements, transitions, actions, motion
- Atmosphere, mood, pacing
- Under 150 words
- Suitable for video generation AI

Just provide the prompt text."""

            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You are a professional video prompt generator."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.7,
                max_tokens=300
            )

            return response.choices[0].message.content.strip()
        except Exception:
            return f"Scene: {scene_title}"


class ScriptWriter(QMainWindow):
    def __init__(self):
        super().__init__()
        self.config_file = 'script_writer_config.json'
        self.scripts_dir = 'saved_scripts'
        self.prompts_dir = 'saved_prompts'
        os.makedirs(self.scripts_dir, exist_ok=True)
        os.makedirs(self.prompts_dir, exist_ok=True)
        self.load_config()
        self.init_ui()

    def load_config(self):
        """설정 파일 로드"""
        default_config = {
            'openai_api_key': '',
            'default_language': 'ko',
            'default_part_duration': 2,
            'mode': 'chatgpt'  # 'api' or 'chatgpt'
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
        self.setWindowTitle('Script Writer - 글 작성하기 & 대본 만들기')
        self.setGeometry(100, 100, 1200, 800)

        # 메인 위젯
        main_widget = QWidget()
        self.setCentralWidget(main_widget)
        layout = QVBoxLayout(main_widget)

        # OpenAI 상태 표시
        status_text = "✅ OpenAI 사용 가능" if OPENAI_AVAILABLE else "⚠️ OpenAI 미설치 (API 모드 사용 불가, ChatGPT 창 모드는 사용 가능)"
        status_label = QLabel(status_text)
        status_label.setStyleSheet("background-color: #f0f0f0; padding: 5px; font-size: 10px;")
        layout.addWidget(status_label)

        # 탭 위젯
        self.tabs = QTabWidget()
        layout.addWidget(self.tabs)

        # 각 탭 생성
        self.create_script_tab()
        self.create_prompts_tab()
        self.create_saved_tab()
        self.create_script_tab2()  # 대본 작성2
        self.create_script_tab3()  # 대본 작성3 - Claude
        self.create_settings_tab()

        # 상태바
        self.statusBar().showMessage('준비 - ChatGPT 창 모드는 API 키 없이 사용 가능합니다')

    def create_script_tab(self):
        """대본 작성 탭"""
        tab = QWidget()
        layout = QVBoxLayout(tab)

        # 모드 선택
        mode_group = QGroupBox("🔧 실행 모드 선택")
        mode_layout = QVBoxLayout()

        self.mode_button_group = QButtonGroup()

        self.chatgpt_radio = QRadioButton("ChatGPT 창 모드 (API 키 불필요, 브라우저에서 ChatGPT 열기)")
        self.api_radio = QRadioButton("API 모드 (서버에서 직접 처리, API 키 필요)")

        self.mode_button_group.addButton(self.chatgpt_radio, 0)
        self.mode_button_group.addButton(self.api_radio, 1)

        # 현재 설정 불러오기
        if self.config.get('mode') == 'api':
            self.api_radio.setChecked(True)
        else:
            self.chatgpt_radio.setChecked(True)

        # OpenAI가 없으면 API 모드 비활성화
        if not OPENAI_AVAILABLE:
            self.api_radio.setEnabled(False)
            self.api_radio.setText(self.api_radio.text() + " [OpenAI 미설치]")

        mode_layout.addWidget(self.chatgpt_radio)
        mode_layout.addWidget(self.api_radio)

        help_label = QLabel("💡 ChatGPT 창 모드: API 키 없이 브라우저에서 ChatGPT를 열어 작업할 수 있습니다.")
        help_label.setStyleSheet("color: #666; font-size: 10px;")
        help_label.setWordWrap(True)
        mode_layout.addWidget(help_label)

        mode_group.setLayout(mode_layout)
        layout.addWidget(mode_group)

        # 주제 입력
        input_group = QGroupBox("📝 대본 생성")
        input_layout = QGridLayout()

        row = 0
        input_layout.addWidget(QLabel("콘텐츠 주제:"), row, 0)
        self.topic_input = QLineEdit()
        self.topic_input.setPlaceholderText("예: 인공지능 트렌드 요약")
        input_layout.addWidget(self.topic_input, row, 1, 1, 2)

        row += 1
        input_layout.addWidget(QLabel("언어:"), row, 0)
        self.language_combo = QComboBox()
        self.language_combo.addItems(['한국어', 'English', '日本語'])
        input_layout.addWidget(self.language_combo, row, 1)

        input_layout.addWidget(QLabel("파트 선택:"), row, 2)
        self.part_number = QSpinBox()
        self.part_number.setRange(1, 5)
        self.part_number.setValue(1)
        self.part_number.setSuffix("부")
        input_layout.addWidget(self.part_number, row, 3)

        row += 1
        input_layout.addWidget(QLabel("파트 길이:"), row, 0)
        self.part_duration = QComboBox()
        self.part_duration.addItems(['1분', '2분', '3분', '5분', '10분'])
        self.part_duration.setCurrentIndex(1)  # 2분 기본
        input_layout.addWidget(self.part_duration, row, 1)

        row += 1
        generate_btn = QPushButton("🎬 선택한 파트 생성 (대본)")
        generate_btn.clicked.connect(self.generate_script)
        generate_btn.setStyleSheet("background-color: #4CAF50; color: white; padding: 10px; font-weight: bold; font-size: 12px;")
        input_layout.addWidget(generate_btn, row, 0, 1, 4)

        input_group.setLayout(input_layout)
        layout.addWidget(input_group)

        # 진행 상황
        self.script_progress_bar = QProgressBar()
        self.script_progress_bar.setVisible(False)
        layout.addWidget(self.script_progress_bar)

        self.script_progress_label = QLabel("")
        layout.addWidget(self.script_progress_label)

        # ChatGPT 프롬프트 미리보기 (ChatGPT 창 모드용)
        self.chatgpt_prompt_group = QGroupBox("📋 ChatGPT에 붙여넣을 프롬프트")
        chatgpt_prompt_layout = QVBoxLayout()

        self.chatgpt_prompt_text = QTextEdit()
        self.chatgpt_prompt_text.setReadOnly(True)
        self.chatgpt_prompt_text.setMaximumHeight(150)
        self.chatgpt_prompt_text.setPlaceholderText("'선택한 파트 생성' 버튼을 누르면 ChatGPT에 붙여넣을 프롬프트가 여기에 표시됩니다.")
        chatgpt_prompt_layout.addWidget(self.chatgpt_prompt_text)

        chatgpt_btn_layout = QHBoxLayout()
        copy_prompt_btn = QPushButton("📋 프롬프트 복사")
        copy_prompt_btn.clicked.connect(self.copy_chatgpt_prompt)
        chatgpt_btn_layout.addWidget(copy_prompt_btn)

        open_chatgpt_btn = QPushButton("🌐 ChatGPT 열기")
        open_chatgpt_btn.clicked.connect(self.open_chatgpt)
        open_chatgpt_btn.setStyleSheet("background-color: #10A37F; color: white; padding: 8px;")
        chatgpt_btn_layout.addWidget(open_chatgpt_btn)

        chatgpt_btn_layout.addStretch()
        chatgpt_prompt_layout.addLayout(chatgpt_btn_layout)

        self.chatgpt_prompt_group.setLayout(chatgpt_prompt_layout)
        self.chatgpt_prompt_group.setVisible(False)
        layout.addWidget(self.chatgpt_prompt_group)

        # ChatGPT 결과 붙여넣기 영역
        self.chatgpt_result_group = QGroupBox("✨ ChatGPT 결과 붙여넣기")
        chatgpt_result_layout = QVBoxLayout()

        help_text = QLabel("ChatGPT에서 생성된 대본을 아래 입력창에 붙여넣고 '결과 반영' 버튼을 누르세요.")
        help_text.setStyleSheet("color: #666; font-size: 10px;")
        help_text.setWordWrap(True)
        chatgpt_result_layout.addWidget(help_text)

        self.chatgpt_result_text = QTextEdit()
        self.chatgpt_result_text.setMaximumHeight(150)
        self.chatgpt_result_text.setPlaceholderText("ChatGPT에서 생성한 대본을 여기에 붙여넣으세요...")
        chatgpt_result_layout.addWidget(self.chatgpt_result_text)

        chatgpt_result_btn_layout = QHBoxLayout()
        apply_result_btn = QPushButton("✅ 결과 반영 (대본 편집 공간으로)")
        apply_result_btn.clicked.connect(self.apply_chatgpt_result)
        apply_result_btn.setStyleSheet("background-color: #2196F3; color: white; padding: 8px;")
        chatgpt_result_btn_layout.addWidget(apply_result_btn)

        clear_result_btn = QPushButton("🗑️ 초기화")
        clear_result_btn.clicked.connect(self.clear_chatgpt_result)
        chatgpt_result_btn_layout.addWidget(clear_result_btn)

        chatgpt_result_btn_layout.addStretch()
        chatgpt_result_layout.addLayout(chatgpt_result_btn_layout)

        self.chatgpt_result_group.setLayout(chatgpt_result_layout)
        self.chatgpt_result_group.setVisible(False)
        layout.addWidget(self.chatgpt_result_group)

        # 대본 편집 공간
        editor_group = QGroupBox("✍️ 대본 편집 공간")
        editor_layout = QVBoxLayout()

        self.script_editor = QTextEdit()
        self.script_editor.setPlaceholderText("여기에 대본을 작성하거나 붙여넣으세요.\n\n[ChatGPT 창 모드] 위에서 주제를 입력하고 '선택한 파트 생성' 버튼을 누르면 ChatGPT 프롬프트가 생성됩니다.\n[API 모드] AI가 자동으로 대본을 생성하여 여기에 표시합니다.")
        editor_layout.addWidget(self.script_editor)

        # 대본 관리 버튼
        btn_layout = QHBoxLayout()

        copy_btn = QPushButton("📋 대본 복사")
        copy_btn.clicked.connect(self.copy_script)
        btn_layout.addWidget(copy_btn)

        clear_btn = QPushButton("🗑️ 대본 지우기")
        clear_btn.clicked.connect(self.clear_script)
        btn_layout.addWidget(clear_btn)

        save_btn = QPushButton("💾 대본 저장")
        save_btn.clicked.connect(self.save_script)
        save_btn.setStyleSheet("background-color: #2196F3; color: white; padding: 8px;")
        btn_layout.addWidget(save_btn)

        btn_layout.addStretch()

        editor_layout.addLayout(btn_layout)
        editor_group.setLayout(editor_layout)
        layout.addWidget(editor_group)

        self.tabs.addTab(tab, "대본 작성1")

        # 모드 변경 시 UI 업데이트
        self.chatgpt_radio.toggled.connect(self.update_mode_ui)

    def update_mode_ui(self):
        """모드에 따라 UI 업데이트"""
        is_chatgpt_mode = self.chatgpt_radio.isChecked()
        self.chatgpt_prompt_group.setVisible(is_chatgpt_mode)
        self.chatgpt_result_group.setVisible(is_chatgpt_mode)

    def generate_chatgpt_prompt(self, topic, language, part_number, part_duration):
        """ChatGPT용 프롬프트 생성"""
        language_map = {
            "ko": "한국어",
            "en": "영어",
            "ja": "일본어"
        }
        lang_name = language_map.get(language, "한국어")

        prompt = f"""다음 주제에 대한 {lang_name} 영상 대본을 작성해주세요.

주제: {topic}
파트: {part_number}부
길이: 약 {part_duration}분

요구사항:
1. {lang_name}로 작성
2. 시청자가 이해하기 쉬운 대본
3. 각 장면은 이모지(🎬, ⚛️, 🧘 등)로 시작
4. 장면별로 명확하게 구분
5. 약 {part_duration}분 분량의 내용

형식:
🎬 [장면 제목]
대본 내용...

⚛️ [다음 장면 제목]
대본 내용...
"""
        return prompt

    def generate_script(self):
        """대본 생성"""
        topic = self.topic_input.text().strip()

        if not topic:
            QMessageBox.warning(self, "경고", "콘텐츠 주제를 입력하세요")
            return

        # 언어 코드 매핑
        language_map = {
            '한국어': 'ko',
            'English': 'en',
            '日本語': 'ja'
        }
        language = language_map.get(self.language_combo.currentText(), 'ko')

        # 파트 길이 숫자로 변환
        part_duration_text = self.part_duration.currentText()
        part_duration = int(part_duration_text.replace('분', ''))

        # 모드에 따라 다르게 처리
        if self.chatgpt_radio.isChecked():
            # ChatGPT 창 모드
            self.generate_chatgpt_mode(topic, language, self.part_number.value(), part_duration)
        else:
            # API 모드
            self.generate_api_mode(topic, language, self.part_number.value(), part_duration)

    def generate_chatgpt_mode(self, topic, language, part_number, part_duration):
        """ChatGPT 창 모드로 프롬프트 생성"""
        prompt = self.generate_chatgpt_prompt(topic, language, part_number, part_duration)
        self.chatgpt_prompt_text.setPlainText(prompt)
        self.chatgpt_prompt_group.setVisible(True)
        self.chatgpt_result_group.setVisible(True)
        self.statusBar().showMessage("ChatGPT 프롬프트가 생성되었습니다. 복사하거나 'ChatGPT 열기' 버튼을 누르세요.")
        QMessageBox.information(self, "안내",
            "ChatGPT 프롬프트가 생성되었습니다.\n\n"
            "1. '프롬프트 복사' 버튼을 누르거나\n"
            "2. 'ChatGPT 열기' 버튼을 눌러서 바로 ChatGPT로 이동하세요.\n"
            "3. ChatGPT에서 생성된 결과를 아래 '결과 붙여넣기' 영역에 붙여넣으세요.")

    def generate_api_mode(self, topic, language, part_number, part_duration):
        """API 모드로 대본 생성"""
        if not self.config.get('openai_api_key'):
            QMessageBox.warning(self, "경고", "설정 탭에서 OpenAI API 키를 입력하세요")
            return

        if not OPENAI_AVAILABLE:
            QMessageBox.critical(self, "오류", "OpenAI 라이브러리가 설치되어 있지 않습니다.\n\n터미널에서 다음 명령을 실행하세요:\npip install openai")
            return

        self.script_progress_bar.setVisible(True)
        self.script_progress_bar.setRange(0, 0)
        self.statusBar().showMessage(f"'{topic}' 대본 생성 중...")

        self.worker = ScriptGeneratorWorker(
            self.config['openai_api_key'],
            topic,
            language,
            part_number,
            part_duration
        )
        self.worker.progress.connect(self.on_script_progress)
        self.worker.result.connect(self.on_script_complete)
        self.worker.error.connect(self.on_script_error)
        self.worker.start()

    def copy_chatgpt_prompt(self):
        """ChatGPT 프롬프트 복사"""
        prompt = self.chatgpt_prompt_text.toPlainText()
        if not prompt:
            QMessageBox.warning(self, "경고", "복사할 프롬프트가 없습니다")
            return

        clipboard = QApplication.clipboard()
        clipboard.setText(prompt)
        self.statusBar().showMessage("프롬프트가 클립보드에 복사되었습니다. ChatGPT에 붙여넣으세요!")
        QMessageBox.information(self, "완료", "프롬프트가 클립보드에 복사되었습니다.\n\nChatGPT(https://chatgpt.com)에 접속하여 붙여넣으세요.")

    def open_chatgpt(self):
        """ChatGPT 웹사이트 열기"""
        prompt = self.chatgpt_prompt_text.toPlainText()
        if not prompt:
            # 프롬프트가 없으면 그냥 ChatGPT 열기
            webbrowser.open("https://chatgpt.com")
            self.statusBar().showMessage("ChatGPT가 새 창에서 열렸습니다.")
        else:
            # 프롬프트를 URL 파라미터로 전달 (제한적 지원)
            webbrowser.open("https://chatgpt.com")
            clipboard = QApplication.clipboard()
            clipboard.setText(prompt)
            self.statusBar().showMessage("ChatGPT가 열렸고, 프롬프트가 클립보드에 복사되었습니다. 붙여넣기(Ctrl+V)하세요!")
            QMessageBox.information(self, "안내",
                "ChatGPT가 새 창에서 열렸습니다.\n\n"
                "프롬프트가 클립보드에 복사되었으니,\n"
                "ChatGPT 입력창에 붙여넣기(Ctrl+V 또는 Cmd+V)하세요!")

    def apply_chatgpt_result(self):
        """ChatGPT 결과를 대본 편집 공간에 반영"""
        result = self.chatgpt_result_text.toPlainText().strip()
        if not result:
            QMessageBox.warning(self, "경고", "ChatGPT 결과를 먼저 붙여넣으세요")
            return

        self.script_editor.setPlainText(result)
        self.statusBar().showMessage("ChatGPT 결과가 대본 편집 공간에 반영되었습니다")
        QMessageBox.information(self, "완료", "ChatGPT 결과가 대본 편집 공간에 반영되었습니다!")

    def clear_chatgpt_result(self):
        """ChatGPT 결과 초기화"""
        self.chatgpt_result_text.clear()
        self.statusBar().showMessage("ChatGPT 결과 영역이 초기화되었습니다")

    def on_script_progress(self, message):
        """대본 생성 진행 상황 업데이트"""
        self.script_progress_label.setText(message)
        self.statusBar().showMessage(message)

    def on_script_complete(self, result):
        """대본 생성 완료"""
        self.script_progress_bar.setVisible(False)
        self.script_progress_label.setText("")

        # 대본을 에디터에 표시
        self.script_editor.setPlainText(result['content'])

        self.statusBar().showMessage(f"대본 생성 완료: {result['topic']}")
        QMessageBox.information(self, "완료", f"{result['topic']}의 {result['part_number']}부 대본이 생성되었습니다.")

    def on_script_error(self, error_msg):
        """대본 생성 오류"""
        self.script_progress_bar.setVisible(False)
        self.script_progress_label.setText("")
        QMessageBox.critical(self, "오류", error_msg)
        self.statusBar().showMessage("대본 생성 실패")

    def copy_script(self):
        """대본 복사"""
        script_content = self.script_editor.toPlainText()
        if not script_content:
            QMessageBox.warning(self, "경고", "복사할 대본이 없습니다")
            return

        clipboard = QApplication.clipboard()
        clipboard.setText(script_content)
        self.statusBar().showMessage("대본이 클립보드에 복사되었습니다")

    def clear_script(self):
        """대본 지우기"""
        reply = QMessageBox.question(self, "확인", "대본을 지우시겠습니까?",
                                    QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
        if reply == QMessageBox.Yes:
            self.script_editor.clear()
            self.statusBar().showMessage("대본이 지워졌습니다")

    def save_script(self):
        """대본 저장"""
        script_content = self.script_editor.toPlainText()
        if not script_content:
            QMessageBox.warning(self, "경고", "저장할 대본이 없습니다")
            return

        topic = self.topic_input.text().strip() or "대본"
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{topic}_{timestamp}.txt"
        filepath = os.path.join(self.scripts_dir, filename)

        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(script_content)

            self.statusBar().showMessage(f"대본 저장 완료: {filename}")
            QMessageBox.information(self, "완료", f"대본이 저장되었습니다:\n{filename}")
            self.refresh_saved_scripts()
        except Exception as e:
            QMessageBox.critical(self, "오류", f"저장 중 오류 발생:\n{str(e)}")

    def create_prompts_tab(self):
        """프롬프트 생성 탭"""
        tab = QWidget()
        layout = QVBoxLayout(tab)

        # 설명
        info_label = QLabel("대본 작성 탭에서 작성한 대본을 기반으로 이미지/영상 생성 프롬프트를 자동 생성합니다.")
        info_label.setStyleSheet("background-color: #e3f2fd; padding: 10px; border-radius: 5px;")
        info_label.setWordWrap(True)
        layout.addWidget(info_label)

        # 모드 선택
        prompts_mode_group = QGroupBox("🔧 실행 모드 선택")
        prompts_mode_layout = QVBoxLayout()

        self.prompts_mode_button_group = QButtonGroup()

        self.prompts_chatgpt_radio = QRadioButton("ChatGPT 창 모드 (API 키 불필요, 브라우저에서 ChatGPT 열기)")
        self.prompts_api_radio = QRadioButton("API 모드 (서버에서 직접 처리, API 키 필요)")

        self.prompts_mode_button_group.addButton(self.prompts_chatgpt_radio, 0)
        self.prompts_mode_button_group.addButton(self.prompts_api_radio, 1)

        # 기본값: ChatGPT 창 모드
        self.prompts_chatgpt_radio.setChecked(True)

        # OpenAI가 없으면 API 모드 비활성화
        if not OPENAI_AVAILABLE:
            self.prompts_api_radio.setEnabled(False)
            self.prompts_api_radio.setText(self.prompts_api_radio.text() + " [OpenAI 미설치]")

        prompts_mode_layout.addWidget(self.prompts_chatgpt_radio)
        prompts_mode_layout.addWidget(self.prompts_api_radio)

        help_label = QLabel("💡 ChatGPT 창 모드: API 키 없이 브라우저에서 ChatGPT를 열어 프롬프트를 생성할 수 있습니다.")
        help_label.setStyleSheet("color: #666; font-size: 10px;")
        help_label.setWordWrap(True)
        prompts_mode_layout.addWidget(help_label)

        prompts_mode_group.setLayout(prompts_mode_layout)
        layout.addWidget(prompts_mode_group)

        # 프롬프트 생성 버튼
        generate_prompts_btn = QPushButton("🎨 이미지/영상 프롬프트 생성")
        generate_prompts_btn.clicked.connect(self.generate_media_prompts)
        generate_prompts_btn.setStyleSheet("background-color: #FF9800; color: white; padding: 12px; font-weight: bold; font-size: 13px;")
        layout.addWidget(generate_prompts_btn)

        # 진행 상황
        self.prompts_progress_bar = QProgressBar()
        self.prompts_progress_bar.setVisible(False)
        layout.addWidget(self.prompts_progress_bar)

        self.prompts_progress_label = QLabel("")
        layout.addWidget(self.prompts_progress_label)

        # ChatGPT 프롬프트 미리보기 (ChatGPT 창 모드용)
        self.prompts_chatgpt_prompt_group = QGroupBox("📋 ChatGPT에 붙여넣을 프롬프트")
        prompts_chatgpt_prompt_layout = QVBoxLayout()

        self.prompts_chatgpt_prompt_text = QTextEdit()
        self.prompts_chatgpt_prompt_text.setReadOnly(True)
        self.prompts_chatgpt_prompt_text.setMaximumHeight(200)
        self.prompts_chatgpt_prompt_text.setPlaceholderText("'이미지/영상 프롬프트 생성' 버튼을 누르면 ChatGPT에 붙여넣을 프롬프트가 여기에 표시됩니다.")
        prompts_chatgpt_prompt_layout.addWidget(self.prompts_chatgpt_prompt_text)

        prompts_chatgpt_btn_layout = QHBoxLayout()
        copy_prompt_btn = QPushButton("📋 프롬프트 복사")
        copy_prompt_btn.clicked.connect(self.copy_prompts_chatgpt_prompt)
        prompts_chatgpt_btn_layout.addWidget(copy_prompt_btn)

        open_chatgpt_btn = QPushButton("🌐 ChatGPT 열기")
        open_chatgpt_btn.clicked.connect(self.open_prompts_chatgpt)
        open_chatgpt_btn.setStyleSheet("background-color: #10A37F; color: white; padding: 8px;")
        prompts_chatgpt_btn_layout.addWidget(open_chatgpt_btn)

        prompts_chatgpt_btn_layout.addStretch()
        prompts_chatgpt_prompt_layout.addLayout(prompts_chatgpt_btn_layout)

        self.prompts_chatgpt_prompt_group.setLayout(prompts_chatgpt_prompt_layout)
        self.prompts_chatgpt_prompt_group.setVisible(False)
        layout.addWidget(self.prompts_chatgpt_prompt_group)

        # ChatGPT 결과 붙여넣기 영역
        self.prompts_chatgpt_result_group = QGroupBox("✨ ChatGPT 결과 붙여넣기")
        prompts_chatgpt_result_layout = QVBoxLayout()

        help_text = QLabel("ChatGPT에서 생성된 프롬프트들을 아래 입력창에 붙여넣고 '결과 반영' 버튼을 누르세요.")
        help_text.setStyleSheet("color: #666; font-size: 10px;")
        help_text.setWordWrap(True)
        prompts_chatgpt_result_layout.addWidget(help_text)

        self.prompts_chatgpt_result_text = QTextEdit()
        self.prompts_chatgpt_result_text.setMaximumHeight(200)
        self.prompts_chatgpt_result_text.setPlaceholderText("ChatGPT에서 생성한 프롬프트들을 여기에 붙여넣으세요...")
        prompts_chatgpt_result_layout.addWidget(self.prompts_chatgpt_result_text)

        prompts_chatgpt_result_btn_layout = QHBoxLayout()
        apply_result_btn = QPushButton("✅ 결과 반영 (프롬프트 결과 영역으로)")
        apply_result_btn.clicked.connect(self.apply_prompts_chatgpt_result)
        apply_result_btn.setStyleSheet("background-color: #2196F3; color: white; padding: 8px;")
        prompts_chatgpt_result_btn_layout.addWidget(apply_result_btn)

        clear_result_btn = QPushButton("🗑️ 초기화")
        clear_result_btn.clicked.connect(self.clear_prompts_chatgpt_result)
        prompts_chatgpt_result_btn_layout.addWidget(clear_result_btn)

        prompts_chatgpt_result_btn_layout.addStretch()
        prompts_chatgpt_result_layout.addLayout(prompts_chatgpt_result_btn_layout)

        self.prompts_chatgpt_result_group.setLayout(prompts_chatgpt_result_layout)
        self.prompts_chatgpt_result_group.setVisible(False)
        layout.addWidget(self.prompts_chatgpt_result_group)

        # 프롬프트 결과
        result_group = QGroupBox("📄 생성된 프롬프트")
        result_layout = QVBoxLayout()

        self.prompts_result = QTextEdit()
        self.prompts_result.setReadOnly(True)
        self.prompts_result.setPlaceholderText("프롬프트 생성 결과가 여기에 표시됩니다.")
        result_layout.addWidget(self.prompts_result)

        # 버튼들
        prompts_btn_layout = QHBoxLayout()

        copy_prompts_btn = QPushButton("📋 프롬프트 복사")
        copy_prompts_btn.clicked.connect(self.copy_prompts)
        prompts_btn_layout.addWidget(copy_prompts_btn)

        save_prompts_btn = QPushButton("💾 프롬프트 저장")
        save_prompts_btn.clicked.connect(self.save_prompts)
        save_prompts_btn.setStyleSheet("background-color: #2196F3; color: white; padding: 8px;")
        prompts_btn_layout.addWidget(save_prompts_btn)

        prompts_btn_layout.addStretch()

        result_layout.addLayout(prompts_btn_layout)

        result_group.setLayout(result_layout)
        layout.addWidget(result_group)

        # 저장된 프롬프트 목록
        saved_prompts_group = QGroupBox("💾 저장된 프롬프트 목록")
        saved_prompts_layout = QVBoxLayout()

        self.saved_prompts_list = QListWidget()
        self.saved_prompts_list.setAlternatingRowColors(True)
        self.saved_prompts_list.setMaximumHeight(150)
        self.saved_prompts_list.itemDoubleClicked.connect(self.load_prompt_from_item)
        self.saved_prompts_list.itemClicked.connect(self.preview_prompt)
        saved_prompts_layout.addWidget(self.saved_prompts_list)

        # 저장된 프롬프트 버튼
        saved_prompts_btn_layout = QHBoxLayout()

        load_prompt_btn = QPushButton("📥 불러오기")
        load_prompt_btn.clicked.connect(self.load_selected_prompt)
        load_prompt_btn.setStyleSheet("background-color: #4CAF50; color: white; padding: 8px;")
        saved_prompts_btn_layout.addWidget(load_prompt_btn)

        delete_prompt_btn = QPushButton("🗑️ 삭제")
        delete_prompt_btn.clicked.connect(self.delete_selected_prompt)
        delete_prompt_btn.setStyleSheet("background-color: #f44336; color: white; padding: 8px;")
        saved_prompts_btn_layout.addWidget(delete_prompt_btn)

        refresh_prompts_btn = QPushButton("🔄 새로고침")
        refresh_prompts_btn.clicked.connect(self.refresh_saved_prompts)
        saved_prompts_btn_layout.addWidget(refresh_prompts_btn)

        saved_prompts_btn_layout.addStretch()

        saved_prompts_layout.addLayout(saved_prompts_btn_layout)

        saved_prompts_group.setLayout(saved_prompts_layout)
        layout.addWidget(saved_prompts_group)

        self.tabs.addTab(tab, "프롬프트 생성1")

        # 초기 프롬프트 목록 로드
        self.refresh_saved_prompts()

        # 모드 변경 시 UI 업데이트
        self.prompts_chatgpt_radio.toggled.connect(self.update_prompts_mode_ui)

    def update_prompts_mode_ui(self):
        """프롬프트 모드에 따라 UI 업데이트"""
        is_chatgpt_mode = self.prompts_chatgpt_radio.isChecked()
        self.prompts_chatgpt_prompt_group.setVisible(is_chatgpt_mode)
        self.prompts_chatgpt_result_group.setVisible(is_chatgpt_mode)

    def generate_prompts_chatgpt_prompt(self, script_content):
        """ChatGPT용 프롬프트 생성 프롬프트 생성"""
        prompt = f"""다음 영상 대본을 장면별로 분석하여, 각 장면마다 이미지 생성 프롬프트와 영상 생성 프롬프트를 작성해주세요.

대본:
{script_content[:2000]}{"..." if len(script_content) > 2000 else ""}

요구사항:
1. 대본을 장면별로 구분 (이모지로 시작하는 부분)
2. 각 장면마다 다음을 생성:
   - 장면 번호 및 제목
   - 이미지 생성 프롬프트 (영문, Midjourney/DALL-E/Stable Diffusion용)
   - 영상 생성 프롬프트 (영문, Sora/Runway/Kling AI용)

출력 형식:
📌 장면 1: [장면 제목]
내용: [장면 내용 요약]

🖼️ 이미지 프롬프트:
[영문으로 시각적 요소, 조명, 색상, 구도, 분위기를 상세히 설명]

🎥 영상 프롬프트:
[영문으로 카메라 움직임, 전환, 동작, 분위기, 페이싱 설명]

================================================================================

📌 장면 2: [장면 제목]
...
"""
        return prompt

    def copy_prompts_chatgpt_prompt(self):
        """ChatGPT 프롬프트 복사 (프롬프트 생성용)"""
        prompt = self.prompts_chatgpt_prompt_text.toPlainText()
        if not prompt:
            QMessageBox.warning(self, "경고", "복사할 프롬프트가 없습니다")
            return

        clipboard = QApplication.clipboard()
        clipboard.setText(prompt)
        self.statusBar().showMessage("프롬프트가 클립보드에 복사되었습니다. ChatGPT에 붙여넣으세요!")
        QMessageBox.information(self, "완료", "프롬프트가 클립보드에 복사되었습니다.\n\nChatGPT(https://chatgpt.com)에 접속하여 붙여넣으세요.")

    def open_prompts_chatgpt(self):
        """ChatGPT 웹사이트 열기 (프롬프트 생성용)"""
        prompt = self.prompts_chatgpt_prompt_text.toPlainText()
        webbrowser.open("https://chatgpt.com")
        if prompt:
            clipboard = QApplication.clipboard()
            clipboard.setText(prompt)
            self.statusBar().showMessage("ChatGPT가 열렸고, 프롬프트가 클립보드에 복사되었습니다. 붙여넣기(Ctrl+V)하세요!")
            QMessageBox.information(self, "안내",
                "ChatGPT가 새 창에서 열렸습니다.\n\n"
                "프롬프트가 클립보드에 복사되었으니,\n"
                "ChatGPT 입력창에 붙여넣기(Ctrl+V 또는 Cmd+V)하세요!")
        else:
            self.statusBar().showMessage("ChatGPT가 새 창에서 열렸습니다.")

    def apply_prompts_chatgpt_result(self):
        """ChatGPT 결과를 프롬프트 결과 영역에 반영"""
        result = self.prompts_chatgpt_result_text.toPlainText().strip()
        if not result:
            QMessageBox.warning(self, "경고", "ChatGPT 결과를 먼저 붙여넣으세요")
            return

        self.prompts_result.setPlainText(result)
        self.statusBar().showMessage("ChatGPT 결과가 프롬프트 결과 영역에 반영되었습니다")
        QMessageBox.information(self, "완료", "ChatGPT 결과가 프롬프트 결과 영역에 반영되었습니다!")

    def clear_prompts_chatgpt_result(self):
        """ChatGPT 결과 초기화 (프롬프트 생성용)"""
        self.prompts_chatgpt_result_text.clear()
        self.statusBar().showMessage("ChatGPT 결과 영역이 초기화되었습니다")

    def generate_media_prompts(self):
        """이미지/영상 프롬프트 생성"""
        script_content = self.script_editor.toPlainText()
        if not script_content:
            QMessageBox.warning(self, "경고", "대본이 없습니다. 먼저 대본을 작성하세요.")
            return

        # 모드에 따라 다르게 처리
        if self.prompts_chatgpt_radio.isChecked():
            # ChatGPT 창 모드
            self.generate_prompts_chatgpt_mode(script_content)
        else:
            # API 모드
            self.generate_prompts_api_mode(script_content)

    def generate_prompts_chatgpt_mode(self, script_content):
        """ChatGPT 창 모드로 프롬프트 생성"""
        prompt = self.generate_prompts_chatgpt_prompt(script_content)
        self.prompts_chatgpt_prompt_text.setPlainText(prompt)
        self.prompts_chatgpt_prompt_group.setVisible(True)
        self.prompts_chatgpt_result_group.setVisible(True)
        self.statusBar().showMessage("ChatGPT 프롬프트가 생성되었습니다. 복사하거나 'ChatGPT 열기' 버튼을 누르세요.")
        QMessageBox.information(self, "안내",
            "ChatGPT 프롬프트가 생성되었습니다.\n\n"
            "1. '프롬프트 복사' 버튼을 누르거나\n"
            "2. 'ChatGPT 열기' 버튼을 눌러서 바로 ChatGPT로 이동하세요.\n"
            "3. ChatGPT에서 생성된 결과를 아래 '결과 붙여넣기' 영역에 붙여넣으세요.")

    def generate_prompts_api_mode(self, script_content):
        """API 모드로 프롬프트 생성"""
        if not self.config.get('openai_api_key'):
            QMessageBox.warning(self, "경고", "설정 탭에서 OpenAI API 키를 입력하세요")
            return

        if not OPENAI_AVAILABLE:
            QMessageBox.critical(self, "오류", "OpenAI 라이브러리가 설치되어 있지 않습니다.")
            return

        topic = self.topic_input.text().strip() or "콘텐츠"

        self.prompts_progress_bar.setVisible(True)
        self.prompts_progress_bar.setRange(0, 0)
        self.statusBar().showMessage("프롬프트 생성 중...")

        self.prompts_worker = MediaPromptsWorker(
            self.config['openai_api_key'],
            script_content,
            topic
        )
        self.prompts_worker.progress.connect(self.on_prompts_progress)
        self.prompts_worker.result.connect(self.on_prompts_complete)
        self.prompts_worker.error.connect(self.on_prompts_error)
        self.prompts_worker.start()

    def on_prompts_progress(self, message):
        """프롬프트 생성 진행 상황"""
        self.prompts_progress_label.setText(message)
        self.statusBar().showMessage(message)

    def on_prompts_complete(self, prompts):
        """프롬프트 생성 완료"""
        self.prompts_progress_bar.setVisible(False)
        self.prompts_progress_label.setText("")

        # 결과 표시
        result_text = f"총 {len(prompts)}개 장면의 프롬프트가 생성되었습니다.\n\n"
        result_text += "=" * 80 + "\n\n"

        for prompt in prompts:
            result_text += f"📌 장면 {prompt['scene_number']}: {prompt['scene_title']}\n"
            result_text += f"내용: {prompt['scene_content']}\n\n"
            result_text += f"🖼️ 이미지 프롬프트:\n{prompt['image_prompt']}\n\n"
            result_text += f"🎥 영상 프롬프트:\n{prompt['video_prompt']}\n\n"
            result_text += "=" * 80 + "\n\n"

        self.prompts_result.setPlainText(result_text)
        self.tabs.setCurrentIndex(1)  # 프롬프트 탭으로 전환

        self.statusBar().showMessage(f"프롬프트 생성 완료 - {len(prompts)}개 장면")
        QMessageBox.information(self, "완료", f"{len(prompts)}개 장면의 프롬프트가 생성되었습니다.")

    def on_prompts_error(self, error_msg):
        """프롬프트 생성 오류"""
        self.prompts_progress_bar.setVisible(False)
        self.prompts_progress_label.setText("")
        QMessageBox.critical(self, "오류", error_msg)
        self.statusBar().showMessage("프롬프트 생성 실패")

    def copy_prompts(self):
        """프롬프트 복사"""
        prompts_content = self.prompts_result.toPlainText()
        if not prompts_content or prompts_content == "프롬프트 생성 결과가 여기에 표시됩니다.":
            QMessageBox.warning(self, "경고", "복사할 프롬프트가 없습니다")
            return

        clipboard = QApplication.clipboard()
        clipboard.setText(prompts_content)
        self.statusBar().showMessage("프롬프트가 클립보드에 복사되었습니다")

    def save_prompts(self):
        """프롬프트 저장"""
        prompts_content = self.prompts_result.toPlainText()
        if not prompts_content or prompts_content == "프롬프트 생성 결과가 여기에 표시됩니다.":
            QMessageBox.warning(self, "경고", "저장할 프롬프트가 없습니다")
            return

        topic = self.topic_input.text().strip() or "프롬프트"
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"{topic}_prompts_{timestamp}.txt"
        filepath = os.path.join(self.prompts_dir, filename)

        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(prompts_content)

            self.statusBar().showMessage(f"프롬프트 저장 완료: {filename}")
            QMessageBox.information(self, "완료", f"프롬프트가 저장되었습니다:\n{filename}")
            self.refresh_saved_prompts()
        except Exception as e:
            QMessageBox.critical(self, "오류", f"저장 중 오류 발생:\n{str(e)}")

    def refresh_saved_prompts(self):
        """저장된 프롬프트 목록 새로고침"""
        self.saved_prompts_list.clear()

        if not os.path.exists(self.prompts_dir):
            return

        files = [f for f in os.listdir(self.prompts_dir) if f.endswith('.txt')]

        if not files:
            return

        # 최신순으로 정렬
        files.sort(key=lambda x: os.path.getmtime(os.path.join(self.prompts_dir, x)), reverse=True)

        for filename in files:
            filepath = os.path.join(self.prompts_dir, filename)
            file_size = os.path.getsize(filepath)
            modified_time = datetime.fromtimestamp(os.path.getmtime(filepath))

            # 리스트 아이템 생성
            display_text = f"{filename}  |  {file_size:,} bytes  |  {modified_time.strftime('%Y-%m-%d %H:%M:%S')}"
            item = QListWidgetItem(display_text)
            item.setData(Qt.UserRole, filepath)  # 파일 경로를 데이터로 저장
            self.saved_prompts_list.addItem(item)

    def preview_prompt(self, item):
        """선택한 프롬프트 미리보기 (상태바에 표시)"""
        filepath = item.data(Qt.UserRole)
        filename = os.path.basename(filepath)
        self.statusBar().showMessage(f"선택된 파일: {filename}")

    def load_selected_prompt(self):
        """선택한 프롬프트 불러오기"""
        current_item = self.saved_prompts_list.currentItem()
        if not current_item:
            QMessageBox.warning(self, "경고", "불러올 파일을 선택하세요")
            return

        filepath = current_item.data(Qt.UserRole)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                self.prompts_result.setPlainText(content)

            filename = os.path.basename(filepath)
            self.statusBar().showMessage(f"프롬프트가 로드되었습니다: {filename}")
            QMessageBox.information(self, "완료", f"프롬프트가 로드되었습니다!\n\n파일: {filename}")
        except Exception as e:
            QMessageBox.critical(self, "오류", f"파일 로드 중 오류:\n{str(e)}")

    def load_prompt_from_item(self, item):
        """리스트 아이템 더블클릭으로 프롬프트 불러오기"""
        self.load_selected_prompt()

    def delete_selected_prompt(self):
        """선택한 프롬프트 삭제"""
        current_item = self.saved_prompts_list.currentItem()
        if not current_item:
            QMessageBox.warning(self, "경고", "삭제할 파일을 선택하세요")
            return

        filepath = current_item.data(Qt.UserRole)
        filename = os.path.basename(filepath)

        reply = QMessageBox.question(
            self,
            "삭제 확인",
            f"정말로 이 프롬프트를 삭제하시겠습니까?\n\n{filename}\n\n이 작업은 되돌릴 수 없습니다.",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )

        if reply == QMessageBox.Yes:
            try:
                os.remove(filepath)
                self.refresh_saved_prompts()
                self.statusBar().showMessage(f"파일이 삭제되었습니다: {filename}")
                QMessageBox.information(self, "완료", f"파일이 삭제되었습니다:\n{filename}")
            except Exception as e:
                QMessageBox.critical(self, "오류", f"파일 삭제 중 오류:\n{str(e)}")

    def create_saved_tab(self):
        """저장된 대본 탭"""
        tab = QWidget()
        layout = QVBoxLayout(tab)

        # 설명
        info_label = QLabel("💾 저장된 대본 목록 - 파일을 선택하고 불러오기 버튼을 누르세요")
        info_label.setStyleSheet("background-color: #e3f2fd; padding: 10px; border-radius: 5px; font-weight: bold;")
        layout.addWidget(info_label)

        # 저장된 대본 목록 (ListWidget 사용)
        self.saved_scripts_list = QListWidget()
        self.saved_scripts_list.setAlternatingRowColors(True)
        self.saved_scripts_list.itemDoubleClicked.connect(self.load_script_from_item)
        layout.addWidget(self.saved_scripts_list)

        # 미리보기 영역
        preview_group = QGroupBox("📄 파일 미리보기")
        preview_layout = QVBoxLayout()

        self.script_preview = QTextEdit()
        self.script_preview.setReadOnly(True)
        self.script_preview.setMaximumHeight(200)
        self.script_preview.setPlaceholderText("파일을 선택하면 미리보기가 여기에 표시됩니다.")
        preview_layout.addWidget(self.script_preview)

        preview_group.setLayout(preview_layout)
        layout.addWidget(preview_group)

        # 버튼
        btn_layout = QHBoxLayout()

        load_btn = QPushButton("📥 불러오기 (대본 편집 공간으로)")
        load_btn.clicked.connect(self.load_selected_script)
        load_btn.setStyleSheet("background-color: #4CAF50; color: white; padding: 10px; font-weight: bold;")
        btn_layout.addWidget(load_btn)

        delete_btn = QPushButton("🗑️ 삭제")
        delete_btn.clicked.connect(self.delete_selected_script)
        delete_btn.setStyleSheet("background-color: #f44336; color: white; padding: 10px;")
        btn_layout.addWidget(delete_btn)

        refresh_btn = QPushButton("🔄 새로고침")
        refresh_btn.clicked.connect(self.refresh_saved_scripts)
        btn_layout.addWidget(refresh_btn)

        open_folder_btn = QPushButton("📁 폴더 열기")
        open_folder_btn.clicked.connect(self.open_scripts_folder)
        btn_layout.addWidget(open_folder_btn)

        btn_layout.addStretch()

        layout.addLayout(btn_layout)

        self.tabs.addTab(tab, "저장된 대본1")

        # 파일 선택 시 미리보기 표시
        self.saved_scripts_list.itemClicked.connect(self.preview_script)

        # 초기 목록 로드
        self.refresh_saved_scripts()

    def refresh_saved_scripts(self):
        """저장된 대본 목록 새로고침"""
        self.saved_scripts_list.clear()
        self.script_preview.clear()

        if not os.path.exists(self.scripts_dir):
            self.statusBar().showMessage("저장된 대본이 없습니다")
            return

        files = [f for f in os.listdir(self.scripts_dir) if f.endswith('.txt')]

        if not files:
            self.statusBar().showMessage("저장된 대본이 없습니다")
            return

        # 최신순으로 정렬
        files.sort(key=lambda x: os.path.getmtime(os.path.join(self.scripts_dir, x)), reverse=True)

        for filename in files:
            filepath = os.path.join(self.scripts_dir, filename)
            file_size = os.path.getsize(filepath)
            modified_time = datetime.fromtimestamp(os.path.getmtime(filepath))

            # 리스트 아이템 생성
            display_text = f"{filename}  |  {file_size:,} bytes  |  {modified_time.strftime('%Y-%m-%d %H:%M:%S')}"
            item = QListWidgetItem(display_text)
            item.setData(Qt.UserRole, filepath)  # 파일 경로를 데이터로 저장
            self.saved_scripts_list.addItem(item)

        self.statusBar().showMessage(f"저장된 대본 {len(files)}개")

    def preview_script(self, item):
        """선택한 대본 미리보기"""
        filepath = item.data(Qt.UserRole)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                # 처음 500자만 미리보기
                preview_content = content[:500]
                if len(content) > 500:
                    preview_content += "\n\n... (미리보기는 처음 500자만 표시됩니다)"
                self.script_preview.setPlainText(preview_content)
        except Exception as e:
            self.script_preview.setPlainText(f"미리보기 로드 실패: {str(e)}")

    def load_selected_script(self):
        """선택한 대본 불러오기"""
        current_item = self.saved_scripts_list.currentItem()
        if not current_item:
            QMessageBox.warning(self, "경고", "불러올 파일을 선택하세요")
            return

        filepath = current_item.data(Qt.UserRole)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
                self.script_editor.setPlainText(content)

            # 대본 작성 탭으로 전환
            self.tabs.setCurrentIndex(0)

            filename = os.path.basename(filepath)
            self.statusBar().showMessage(f"대본이 로드되었습니다: {filename}")
            QMessageBox.information(self, "완료", f"대본이 로드되었습니다!\n\n파일: {filename}\n\n'대본 작성' 탭에서 확인하세요.")
        except Exception as e:
            QMessageBox.critical(self, "오류", f"파일 로드 중 오류:\n{str(e)}")

    def load_script_from_item(self, item):
        """리스트 아이템 더블클릭으로 대본 불러오기"""
        self.load_selected_script()

    def delete_selected_script(self):
        """선택한 대본 삭제"""
        current_item = self.saved_scripts_list.currentItem()
        if not current_item:
            QMessageBox.warning(self, "경고", "삭제할 파일을 선택하세요")
            return

        filepath = current_item.data(Qt.UserRole)
        filename = os.path.basename(filepath)

        reply = QMessageBox.question(
            self,
            "삭제 확인",
            f"정말로 이 대본을 삭제하시겠습니까?\n\n{filename}\n\n이 작업은 되돌릴 수 없습니다.",
            QMessageBox.Yes | QMessageBox.No,
            QMessageBox.No
        )

        if reply == QMessageBox.Yes:
            try:
                os.remove(filepath)
                self.refresh_saved_scripts()
                self.statusBar().showMessage(f"파일이 삭제되었습니다: {filename}")
                QMessageBox.information(self, "완료", f"파일이 삭제되었습니다:\n{filename}")
            except Exception as e:
                QMessageBox.critical(self, "오류", f"파일 삭제 중 오류:\n{str(e)}")

    def open_scripts_folder(self):
        """대본 폴더 열기"""
        import subprocess
        import platform

        scripts_path = os.path.abspath(self.scripts_dir)

        try:
            if platform.system() == 'Windows':
                os.startfile(scripts_path)
            elif platform.system() == 'Darwin':  # macOS
                subprocess.run(['open', scripts_path])
            else:  # Linux
                subprocess.run(['xdg-open', scripts_path])
            self.statusBar().showMessage(f"폴더 열림: {scripts_path}")
        except Exception as e:
            QMessageBox.warning(self, "경고", f"폴더를 열 수 없습니다:\n{str(e)}")

    def create_script_tab2(self):
        """대본 작성2 - ChatGPT, Claude, Google FX 워크플로우"""
        tab = QWidget()
        main_layout = QVBoxLayout(tab)

        # 스크롤 영역 추가
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll_content = QWidget()
        layout = QVBoxLayout(scroll_content)

        # === 1. ChatGPT 대본 분석 섹션 ===
        analysis_group = QGroupBox("📝 1단계: ChatGPT에게 대본 분석 요청")
        analysis_layout = QVBoxLayout()

        # 입력 영역
        input_label_layout = QHBoxLayout()
        input_label_layout.addWidget(QLabel("대본 입력:"))

        # 자막 불러오기 버튼
        find_subtitle_btn = QPushButton("📂 자막 불러오기")
        find_subtitle_btn.clicked.connect(self.load_subtitle_file)
        find_subtitle_btn.setStyleSheet("background-color: #2196F3; color: white; padding: 4px 12px;")
        find_subtitle_btn.setMaximumWidth(140)
        input_label_layout.addWidget(find_subtitle_btn)
        input_label_layout.addStretch()

        analysis_layout.addLayout(input_label_layout)

        self.analysis_input = QTextEdit()
        self.analysis_input.setPlaceholderText("분석할 대본을 입력하거나 붙여넣으세요...")
        self.analysis_input.setMaximumHeight(150)
        analysis_layout.addWidget(self.analysis_input)

        # 버튼
        analysis_btn_layout = QHBoxLayout()
        analysis_generate_btn = QPushButton("🔄 ChatGPT 프롬프트 생성")
        analysis_generate_btn.clicked.connect(self.generate_analysis_prompt)
        analysis_generate_btn.setStyleSheet("background-color: #4CAF50; color: white; padding: 8px;")
        analysis_btn_layout.addWidget(analysis_generate_btn)

        analysis_open_btn = QPushButton("🌐 ChatGPT 열기")
        analysis_open_btn.clicked.connect(self.open_chatgpt_for_analysis)
        analysis_open_btn.setStyleSheet("background-color: #00A67E; color: white; padding: 8px;")
        analysis_btn_layout.addWidget(analysis_open_btn)

        analysis_copy_btn = QPushButton("📋 프롬프트 복사")
        analysis_copy_btn.clicked.connect(lambda: self.copy_to_clipboard(self.analysis_prompt.toPlainText()))
        analysis_copy_btn.setStyleSheet("background-color: #FF9800; color: white; padding: 8px;")
        analysis_btn_layout.addWidget(analysis_copy_btn)

        analysis_layout.addLayout(analysis_btn_layout)

        # 생성된 프롬프트
        analysis_layout.addWidget(QLabel("생성된 ChatGPT 프롬프트:"))
        self.analysis_prompt = QTextEdit()
        self.analysis_prompt.setPlaceholderText("프롬프트가 여기에 생성됩니다...")
        self.analysis_prompt.setMaximumHeight(120)
        analysis_layout.addWidget(self.analysis_prompt)

        # 결과 붙여넣기
        analysis_layout.addWidget(QLabel("ChatGPT 분석 결과:"))
        self.analysis_result = QTextEdit()
        self.analysis_result.setPlaceholderText("ChatGPT의 분석 결과를 여기에 붙여넣으세요...")
        self.analysis_result.setMaximumHeight(150)
        analysis_layout.addWidget(self.analysis_result)

        analysis_group.setLayout(analysis_layout)
        layout.addWidget(analysis_group)

        # === 2. ChatGPT 창작 섹션 ===
        creative_group = QGroupBox("✨ 2단계: ChatGPT에게 새롭게 창작 요청")
        creative_layout = QVBoxLayout()

        # 입력 영역
        creative_layout.addWidget(QLabel("창작 주제 및 요구사항:"))
        self.creative_input = QTextEdit()
        self.creative_input.setPlaceholderText("창작할 주제나 아이디어를 입력하세요...\n예: '미래 도시의 하루', '감동적인 가족 이야기' 등")
        self.creative_input.setMaximumHeight(120)
        creative_layout.addWidget(self.creative_input)

        # 버튼
        creative_btn_layout = QHBoxLayout()
        creative_generate_btn = QPushButton("🔄 ChatGPT 프롬프트 생성")
        creative_generate_btn.clicked.connect(self.generate_creative_prompt)
        creative_generate_btn.setStyleSheet("background-color: #4CAF50; color: white; padding: 8px;")
        creative_btn_layout.addWidget(creative_generate_btn)

        creative_open_btn = QPushButton("🌐 ChatGPT 열기")
        creative_open_btn.clicked.connect(self.open_chatgpt_for_creative)
        creative_open_btn.setStyleSheet("background-color: #00A67E; color: white; padding: 8px;")
        creative_btn_layout.addWidget(creative_open_btn)

        creative_copy_btn = QPushButton("📋 프롬프트 복사")
        creative_copy_btn.clicked.connect(lambda: self.copy_to_clipboard(self.creative_prompt.toPlainText()))
        creative_copy_btn.setStyleSheet("background-color: #FF9800; color: white; padding: 8px;")
        creative_btn_layout.addWidget(creative_copy_btn)

        creative_layout.addLayout(creative_btn_layout)

        # 생성된 프롬프트
        creative_layout.addWidget(QLabel("생성된 ChatGPT 프롬프트:"))
        self.creative_prompt = QTextEdit()
        self.creative_prompt.setPlaceholderText("프롬프트가 여기에 생성됩니다...")
        self.creative_prompt.setMaximumHeight(120)
        creative_layout.addWidget(self.creative_prompt)

        # 결과 붙여넣기
        creative_layout.addWidget(QLabel("ChatGPT 창작 결과:"))
        self.creative_result = QTextEdit()
        self.creative_result.setPlaceholderText("ChatGPT의 창작 결과를 여기에 붙여넣으세요...")
        self.creative_result.setMaximumHeight(150)
        creative_layout.addWidget(self.creative_result)

        creative_group.setLayout(creative_layout)
        layout.addWidget(creative_group)

        # === 3. Claude 유튜브 대본 섹션 ===
        claude_group = QGroupBox("🤖 3단계: Claude에게 유튜브 대본 작성 요청")
        claude_layout = QVBoxLayout()

        # 자동 전달 버튼
        claude_auto_btn = QPushButton("⬇️ 위 창작 결과를 Claude 입력으로 전달")
        claude_auto_btn.clicked.connect(self.transfer_creative_to_claude)
        claude_auto_btn.setStyleSheet("background-color: #9C27B0; color: white; padding: 8px;")
        claude_layout.addWidget(claude_auto_btn)

        # 입력 영역
        claude_layout.addWidget(QLabel("Claude에게 전달할 창작물:"))
        self.claude_input = QTextEdit()
        self.claude_input.setPlaceholderText("ChatGPT의 창작 결과를 여기에 입력하세요...\n또는 위 버튼을 클릭하여 자동으로 전달하세요.")
        self.claude_input.setMaximumHeight(120)
        claude_layout.addWidget(self.claude_input)

        # 버튼
        claude_btn_layout = QHBoxLayout()
        claude_generate_btn = QPushButton("🔄 Claude 프롬프트 생성")
        claude_generate_btn.clicked.connect(self.generate_claude_prompt)
        claude_generate_btn.setStyleSheet("background-color: #4CAF50; color: white; padding: 8px;")
        claude_btn_layout.addWidget(claude_generate_btn)

        claude_open_btn = QPushButton("🌐 Claude 열기")
        claude_open_btn.clicked.connect(self.open_claude)
        claude_open_btn.setStyleSheet("background-color: #D97757; color: white; padding: 8px;")
        claude_btn_layout.addWidget(claude_open_btn)

        claude_copy_btn = QPushButton("📋 프롬프트 복사")
        claude_copy_btn.clicked.connect(lambda: self.copy_to_clipboard(self.claude_prompt.toPlainText()))
        claude_copy_btn.setStyleSheet("background-color: #FF9800; color: white; padding: 8px;")
        claude_btn_layout.addWidget(claude_copy_btn)

        claude_layout.addLayout(claude_btn_layout)

        # 생성된 프롬프트
        claude_layout.addWidget(QLabel("생성된 Claude 프롬프트:"))
        self.claude_prompt = QTextEdit()
        self.claude_prompt.setPlaceholderText("프롬프트가 여기에 생성됩니다...")
        self.claude_prompt.setMaximumHeight(120)
        claude_layout.addWidget(self.claude_prompt)

        # 결과 붙여넣기
        claude_layout.addWidget(QLabel("Claude 대본 작성 결과:"))
        self.claude_result = QTextEdit()
        self.claude_result.setPlaceholderText("Claude의 유튜브 대본을 여기에 붙여넣으세요...")
        self.claude_result.setMaximumHeight(150)
        claude_layout.addWidget(self.claude_result)

        claude_group.setLayout(claude_layout)
        layout.addWidget(claude_group)

        # === 4. Google FX 이미지 생성 섹션 ===
        googlefx_group = QGroupBox("🎨 4단계: Google FX로 대표 이미지 생성")
        googlefx_layout = QVBoxLayout()

        # 자동 전달 버튼
        googlefx_auto_btn = QPushButton("⬇️ Claude 대본을 Google FX 입력으로 전달")
        googlefx_auto_btn.clicked.connect(self.transfer_claude_to_googlefx)
        googlefx_auto_btn.setStyleSheet("background-color: #9C27B0; color: white; padding: 8px;")
        googlefx_layout.addWidget(googlefx_auto_btn)

        # 입력 영역
        googlefx_layout.addWidget(QLabel("이미지 생성을 위한 대본:"))
        self.googlefx_input = QTextEdit()
        self.googlefx_input.setPlaceholderText("Claude의 대본을 여기에 입력하세요...\n또는 위 버튼을 클릭하여 자동으로 전달하세요.")
        self.googlefx_input.setMaximumHeight(120)
        googlefx_layout.addWidget(self.googlefx_input)

        # 버튼
        googlefx_btn_layout = QHBoxLayout()
        googlefx_generate_btn = QPushButton("🔄 이미지 프롬프트 생성")
        googlefx_generate_btn.clicked.connect(self.generate_googlefx_prompt)
        googlefx_generate_btn.setStyleSheet("background-color: #4CAF50; color: white; padding: 8px;")
        googlefx_btn_layout.addWidget(googlefx_generate_btn)

        googlefx_open_btn = QPushButton("🌐 Google FX 열기")
        googlefx_open_btn.clicked.connect(self.open_google_fx)
        googlefx_open_btn.setStyleSheet("background-color: #4285F4; color: white; padding: 8px;")
        googlefx_btn_layout.addWidget(googlefx_open_btn)

        googlefx_copy_btn = QPushButton("📋 프롬프트 복사")
        googlefx_copy_btn.clicked.connect(lambda: self.copy_to_clipboard(self.googlefx_prompt.toPlainText()))
        googlefx_copy_btn.setStyleSheet("background-color: #FF9800; color: white; padding: 8px;")
        googlefx_btn_layout.addWidget(googlefx_copy_btn)

        googlefx_layout.addLayout(googlefx_btn_layout)

        # 생성된 프롬프트
        googlefx_layout.addWidget(QLabel("생성된 이미지 프롬프트:"))
        self.googlefx_prompt = QTextEdit()
        self.googlefx_prompt.setPlaceholderText("이미지 생성 프롬프트가 여기에 생성됩니다...")
        self.googlefx_prompt.setMaximumHeight(120)
        googlefx_layout.addWidget(self.googlefx_prompt)

        googlefx_group.setLayout(googlefx_layout)
        layout.addWidget(googlefx_group)

        # 최종 저장 버튼
        save_workflow_btn = QPushButton("💾 전체 워크플로우 저장")
        save_workflow_btn.clicked.connect(self.save_workflow)
        save_workflow_btn.setStyleSheet("background-color: #2196F3; color: white; padding: 10px; font-weight: bold;")
        layout.addWidget(save_workflow_btn)

        layout.addStretch()

        scroll.setWidget(scroll_content)
        main_layout.addWidget(scroll)

        self.tabs.addTab(tab, "대본 작성2")

    def create_script_tab3(self):
        """대본 작성3 - Claude API를 활용한 자막 개선"""
        tab = QWidget()
        main_layout = QVBoxLayout(tab)

        # 스크롤 영역
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll_content = QWidget()
        layout = QVBoxLayout(scroll_content)

        # === 1. 자막 불러오기 섹션 ===
        subtitle_group = QGroupBox("📂 1단계: 자막 파일 불러오기")
        subtitle_layout = QVBoxLayout()

        # 자막 불러오기 버튼
        load_btn_layout = QHBoxLayout()
        load_subtitle_btn = QPushButton("📂 자막 파일 선택")
        load_subtitle_btn.clicked.connect(self.load_subtitle_for_claude)
        load_subtitle_btn.setStyleSheet("background-color: #2196F3; color: white; padding: 10px; font-weight: bold;")
        load_btn_layout.addWidget(load_subtitle_btn)

        clear_btn = QPushButton("🗑️ 지우기")
        clear_btn.clicked.connect(lambda: self.claude_subtitle_input.clear())
        clear_btn.setStyleSheet("background-color: #757575; color: white; padding: 10px;")
        load_btn_layout.addWidget(clear_btn)

        subtitle_layout.addLayout(load_btn_layout)

        # 불러온 자막 표시
        subtitle_layout.addWidget(QLabel("불러온 자막:"))
        self.claude_subtitle_input = QTextEdit()
        self.claude_subtitle_input.setPlaceholderText("자막 파일을 불러오거나 직접 입력하세요...")
        self.claude_subtitle_input.setMinimumHeight(200)
        subtitle_layout.addWidget(self.claude_subtitle_input)

        subtitle_group.setLayout(subtitle_layout)
        layout.addWidget(subtitle_group)

        # === 2. Claude에게 재요청 섹션 ===
        claude_group = QGroupBox("🤖 2단계: Claude에게 대본 개선 요청")
        claude_layout = QVBoxLayout()

        # 요청 옵션
        option_layout = QGridLayout()

        option_layout.addWidget(QLabel("개선 방향:"), 0, 0)
        self.claude_improvement_type = QComboBox()
        self.claude_improvement_type.addItems([
            "전체적으로 다듬기",
            "문법 및 맞춤법 교정",
            "가독성 향상",
            "전문적인 톤으로 변경",
            "친근한 톤으로 변경",
            "요약하기",
            "확장하기",
            "커스텀 (직접 입력)"
        ])
        option_layout.addWidget(self.claude_improvement_type, 0, 1)

        option_layout.addWidget(QLabel("목표 언어:"), 0, 2)
        self.claude_target_language = QComboBox()
        self.claude_target_language.addItems(["원문 유지", "한국어", "영어", "일본어", "중국어", "스페인어"])
        option_layout.addWidget(self.claude_target_language, 0, 3)

        claude_layout.addLayout(option_layout)

        # 커스텀 요청사항
        claude_layout.addWidget(QLabel("추가 요청사항 (선택):"))
        self.claude_custom_request = QTextEdit()
        self.claude_custom_request.setPlaceholderText("예: '영상 자막으로 사용하기 좋게 짧고 명확하게 만들어주세요'\n또는 '유튜브 쇼츠용으로 각 문장을 2초 분량으로 나눠주세요'")
        self.claude_custom_request.setMaximumHeight(80)
        claude_layout.addWidget(self.claude_custom_request)

        # Claude 요청 버튼
        claude_btn_layout = QHBoxLayout()

        request_btn = QPushButton("🚀 Claude에게 요청하기")
        request_btn.clicked.connect(self.request_claude_improvement)
        request_btn.setStyleSheet("background-color: #10A37F; color: white; padding: 10px; font-weight: bold;")
        claude_btn_layout.addWidget(request_btn)

        claude_layout.addLayout(claude_btn_layout)

        # 진행 상태
        self.claude_progress = QProgressBar()
        self.claude_progress.setVisible(False)
        claude_layout.addWidget(self.claude_progress)

        claude_group.setLayout(claude_layout)
        layout.addWidget(claude_group)

        # === 3. Claude 결과 섹션 ===
        result_group = QGroupBox("✨ 3단계: Claude 개선 결과")
        result_layout = QVBoxLayout()

        result_layout.addWidget(QLabel("개선된 대본:"))
        self.claude_result_text = QTextEdit()
        self.claude_result_text.setPlaceholderText("Claude의 개선 결과가 여기에 표시됩니다...")
        self.claude_result_text.setMinimumHeight(250)
        result_layout.addWidget(self.claude_result_text)

        # 결과 버튼
        result_btn_layout = QHBoxLayout()

        copy_result_btn = QPushButton("📋 결과 복사")
        copy_result_btn.clicked.connect(lambda: self.copy_to_clipboard(self.claude_result_text.toPlainText()))
        copy_result_btn.setStyleSheet("background-color: #FF9800; color: white; padding: 8px;")
        result_btn_layout.addWidget(copy_result_btn)

        save_result_btn = QPushButton("💾 결과 저장")
        save_result_btn.clicked.connect(self.save_claude_result)
        save_result_btn.setStyleSheet("background-color: #2196F3; color: white; padding: 8px;")
        result_btn_layout.addWidget(save_result_btn)

        result_layout.addLayout(result_btn_layout)

        result_group.setLayout(result_layout)
        layout.addWidget(result_group)

        layout.addStretch()

        scroll.setWidget(scroll_content)
        main_layout.addWidget(scroll)

        self.tabs.addTab(tab, "대본 작성3")

    def create_settings_tab(self):
        """설정 탭"""
        tab = QWidget()
        layout = QVBoxLayout(tab)

        # API 키 설정
        api_group = QGroupBox("🔑 OpenAI API 키 설정 (선택사항)")
        api_layout = QVBoxLayout()

        info_label = QLabel("💡 ChatGPT 창 모드를 사용하면 API 키 없이도 대본을 생성할 수 있습니다.\nAPI 모드와 프롬프트 생성 기능을 사용하려면 API 키가 필요합니다.")
        info_label.setStyleSheet("background-color: #fff3cd; padding: 8px; border-radius: 4px; font-size: 10px;")
        info_label.setWordWrap(True)
        api_layout.addWidget(info_label)

        key_layout = QHBoxLayout()
        key_layout.addWidget(QLabel("API 키:"))
        self.api_key_input = QLineEdit()
        self.api_key_input.setPlaceholderText("OpenAI API 키를 입력하세요 (선택사항)")
        self.api_key_input.setEchoMode(QLineEdit.Password)
        if self.config.get('openai_api_key'):
            self.api_key_input.setText(self.config['openai_api_key'])
        key_layout.addWidget(self.api_key_input)

        show_key_btn = QPushButton("👁️ 보기")
        show_key_btn.clicked.connect(self.toggle_api_key_visibility)
        key_layout.addWidget(show_key_btn)

        api_layout.addLayout(key_layout)

        help_label = QLabel("OpenAI API 키는 https://platform.openai.com/api-keys 에서 생성할 수 있습니다.")
        help_label.setStyleSheet("color: #666; font-size: 10px;")
        help_label.setWordWrap(True)
        api_layout.addWidget(help_label)

        api_group.setLayout(api_layout)
        layout.addWidget(api_group)

        # Claude API 키 설정
        claude_api_group = QGroupBox("🔑 Anthropic Claude API 키 설정 (선택사항)")
        claude_api_layout = QVBoxLayout()

        claude_info_label = QLabel("💡 대본 작성3 탭에서 Claude를 사용하여 자막을 개선할 수 있습니다.\nClaude API 키가 필요합니다.")
        claude_info_label.setStyleSheet("background-color: #e8f5e9; padding: 8px; border-radius: 4px; font-size: 10px;")
        claude_info_label.setWordWrap(True)
        claude_api_layout.addWidget(claude_info_label)

        claude_key_layout = QHBoxLayout()
        claude_key_layout.addWidget(QLabel("Claude API 키:"))
        self.claude_api_key_input = QLineEdit()
        self.claude_api_key_input.setPlaceholderText("Anthropic Claude API 키를 입력하세요 (선택사항)")
        self.claude_api_key_input.setEchoMode(QLineEdit.Password)
        if self.config.get('claude_api_key'):
            self.claude_api_key_input.setText(self.config['claude_api_key'])
        claude_key_layout.addWidget(self.claude_api_key_input)

        show_claude_key_btn = QPushButton("👁️ 보기")
        show_claude_key_btn.clicked.connect(self.toggle_claude_api_key_visibility)
        claude_key_layout.addWidget(show_claude_key_btn)

        claude_api_layout.addLayout(claude_key_layout)

        claude_help_label = QLabel("Claude API 키는 https://console.anthropic.com/settings/keys 에서 생성할 수 있습니다.")
        claude_help_label.setStyleSheet("color: #666; font-size: 10px;")
        claude_help_label.setWordWrap(True)
        claude_api_layout.addWidget(claude_help_label)

        claude_api_group.setLayout(claude_api_layout)
        layout.addWidget(claude_api_group)

        # 기본 설정
        default_group = QGroupBox("⚙️ 기본 설정")
        default_layout = QGridLayout()

        default_layout.addWidget(QLabel("기본 언어:"), 0, 0)
        self.default_language = QComboBox()
        self.default_language.addItems(['한국어', 'English', '日本語'])
        default_layout.addWidget(self.default_language, 0, 1)

        default_group.setLayout(default_layout)
        layout.addWidget(default_group)

        # 저장 버튼
        save_layout = QHBoxLayout()
        save_layout.addStretch()

        save_settings_btn = QPushButton("설정 저장")
        save_settings_btn.clicked.connect(self.save_settings)
        save_settings_btn.setStyleSheet("background-color: #4CAF50; color: white; padding: 10px;")
        save_layout.addWidget(save_settings_btn)

        layout.addLayout(save_layout)
        layout.addStretch()

        self.tabs.addTab(tab, "설정")

    def toggle_api_key_visibility(self):
        """API 키 표시/숨김 토글"""
        if self.api_key_input.echoMode() == QLineEdit.Password:
            self.api_key_input.setEchoMode(QLineEdit.Normal)
        else:
            self.api_key_input.setEchoMode(QLineEdit.Password)

    def save_settings(self):
        """설정 저장"""
        self.config['openai_api_key'] = self.api_key_input.text().strip()
        self.config['claude_api_key'] = self.claude_api_key_input.text().strip()

        language_map = {
            '한국어': 'ko',
            'English': 'en',
            '日本語': 'ja'
        }
        self.config['default_language'] = language_map.get(self.default_language.currentText(), 'ko')

        # 현재 선택된 모드 저장
        self.config['mode'] = 'chatgpt' if self.chatgpt_radio.isChecked() else 'api'

        self.save_config()
        QMessageBox.information(self, "알림", "설정이 저장되었습니다")
        self.statusBar().showMessage("설정 저장 완료")

    # ========== 대본 작성2 탭 관련 함수들 ==========

    def generate_analysis_prompt(self):
        """ChatGPT 대본 분석 프롬프트 생성"""
        script_content = self.analysis_input.toPlainText().strip()
        if not script_content:
            QMessageBox.warning(self, "경고", "분석할 대본을 입력하세요")
            return

        prompt = f"""다음 대본을 상세하게 분석해주세요.

대본:
{script_content}

분석 항목:
1. 전체 구조 및 흐름
2. 주요 메시지 및 핵심 포인트
3. 대상 시청자층
4. 감정적 톤 및 분위기
5. 강점과 개선점
6. 시청자 참여도를 높이기 위한 제안

각 항목별로 구체적이고 실용적인 분석을 제공해주세요."""

        self.analysis_prompt.setPlainText(prompt)
        self.statusBar().showMessage("ChatGPT 대본 분석 프롬프트가 생성되었습니다")

    def open_chatgpt_for_analysis(self):
        """ChatGPT를 열어서 분석 프롬프트 사용"""
        prompt = self.analysis_prompt.toPlainText().strip()
        if not prompt:
            QMessageBox.warning(self, "경고", "먼저 프롬프트를 생성하세요")
            return

        # ChatGPT URL에 프롬프트 포함
        encoded_prompt = urllib.parse.quote(prompt)
        url = f"https://chat.openai.com/?q={encoded_prompt}"

        webbrowser.open(url)
        self.statusBar().showMessage("ChatGPT가 열렸습니다. 프롬프트를 확인하고 결과를 붙여넣으세요")
        QMessageBox.information(self, "안내", "ChatGPT가 브라우저에서 열렸습니다.\n\n1. 프롬프트를 확인하세요\n2. 결과를 복사하세요\n3. '분석 결과' 영역에 붙여넣으세요")

    def copy_to_clipboard(self, text):
        """클립보드에 텍스트 복사"""
        if not text:
            QMessageBox.warning(self, "경고", "복사할 내용이 없습니다")
            return

        clipboard = QApplication.clipboard()
        clipboard.setText(text)
        self.statusBar().showMessage("클립보드에 복사되었습니다")
        QMessageBox.information(self, "완료", "클립보드에 복사되었습니다!")

    def generate_creative_prompt(self):
        """ChatGPT 창작 프롬프트 생성"""
        topic = self.creative_input.toPlainText().strip()
        if not topic:
            QMessageBox.warning(self, "경고", "창작 주제를 입력하세요")
            return

        prompt = f"""다음 주제로 창의적이고 매력적인 콘텐츠를 창작해주세요.

주제/요구사항:
{topic}

창작 요구사항:
1. 독창적이고 흥미로운 스토리 또는 콘텐츠
2. 시청자의 감정을 자극하는 요소 포함
3. 명확한 메시지 전달
4. 시각적으로 표현 가능한 장면들
5. 약 5-10분 분량의 콘텐츠

자유롭게 창작하되, 위 요구사항을 충족하는 콘텐츠를 만들어주세요."""

        self.creative_prompt.setPlainText(prompt)
        self.statusBar().showMessage("ChatGPT 창작 프롬프트가 생성되었습니다")

    def open_chatgpt_for_creative(self):
        """ChatGPT를 열어서 창작 프롬프트 사용"""
        prompt = self.creative_prompt.toPlainText().strip()
        if not prompt:
            QMessageBox.warning(self, "경고", "먼저 프롬프트를 생성하세요")
            return

        encoded_prompt = urllib.parse.quote(prompt)
        url = f"https://chat.openai.com/?q={encoded_prompt}"

        webbrowser.open(url)
        self.statusBar().showMessage("ChatGPT가 열렸습니다. 프롬프트를 확인하고 결과를 붙여넣으세요")
        QMessageBox.information(self, "안내", "ChatGPT가 브라우저에서 열렸습니다.\n\n1. 프롬프트를 확인하세요\n2. 창작 결과를 복사하세요\n3. '창작 결과' 영역에 붙여넣으세요")

    def transfer_creative_to_claude(self):
        """ChatGPT 창작 결과를 Claude 입력으로 자동 전달"""
        creative_result = self.creative_result.toPlainText().strip()
        if not creative_result:
            QMessageBox.warning(self, "경고", "먼저 ChatGPT 창작 결과를 입력하세요")
            return

        self.claude_input.setPlainText(creative_result)
        self.statusBar().showMessage("창작 결과가 Claude 입력으로 전달되었습니다")
        QMessageBox.information(self, "완료", "창작 결과가 Claude 입력 영역으로 전달되었습니다!")

    def generate_claude_prompt(self):
        """Claude 유튜브 대본 프롬프트 생성"""
        creative_content = self.claude_input.toPlainText().strip()
        if not creative_content:
            QMessageBox.warning(self, "경고", "Claude에게 전달할 창작물을 입력하세요")
            return

        prompt = f"""다음 창작물을 바탕으로 유튜브 쇼츠/릴스용 대본을 작성해주세요.

창작물:
{creative_content[:1000]}{"..." if len(creative_content) > 1000 else ""}

유튜브 대본 작성 요구사항:
1. 시청 시간: 30초 ~ 60초 분량
2. 구성:
   - 오프닝 (처음 3초): 시청자의 주의를 끄는 강력한 후크
   - 본문: 핵심 메시지를 명확하게 전달
   - 엔딩: 행동 유도 (좋아요, 구독, 댓글 등)
3. 각 장면마다 이모지로 시작 (🎬, ⚡, 💡 등)
4. 자막용 대본 형식으로 작성
5. 시각적 요소 설명 포함

매력적이고 바이럴 가능성이 높은 유튜브 대본을 작성해주세요."""

        self.claude_prompt.setPlainText(prompt)
        self.statusBar().showMessage("Claude 프롬프트가 생성되었습니다")

    def open_claude(self):
        """Claude를 열어서 대본 작성 프롬프트 사용"""
        prompt = self.claude_prompt.toPlainText().strip()
        if not prompt:
            QMessageBox.warning(self, "경고", "먼저 프롬프트를 생성하세요")
            return

        # Claude URL 열기
        url = "https://claude.ai/new"
        webbrowser.open(url)

        # 프롬프트를 클립보드에 복사
        clipboard = QApplication.clipboard()
        clipboard.setText(prompt)

        self.statusBar().showMessage("Claude가 열렸습니다. 프롬프트가 클립보드에 복사되었습니다")
        QMessageBox.information(self, "안내", "Claude가 브라우저에서 열렸습니다.\n\n프롬프트가 클립보드에 복사되었습니다.\n\n1. Claude에 프롬프트를 붙여넣으세요 (Ctrl+V)\n2. 결과를 복사하세요\n3. '대본 작성 결과' 영역에 붙여넣으세요")

    def transfer_claude_to_googlefx(self):
        """Claude 대본을 Google FX 입력으로 자동 전달"""
        claude_result = self.claude_result.toPlainText().strip()
        if not claude_result:
            QMessageBox.warning(self, "경고", "먼저 Claude 대본 작성 결과를 입력하세요")
            return

        self.googlefx_input.setPlainText(claude_result)
        self.statusBar().showMessage("Claude 대본이 Google FX 입력으로 전달되었습니다")
        QMessageBox.information(self, "완료", "Claude 대본이 Google FX 입력 영역으로 전달되었습니다!")

    def generate_googlefx_prompt(self):
        """Google FX 이미지 생성 프롬프트 생성"""
        script_content = self.googlefx_input.toPlainText().strip()
        if not script_content:
            QMessageBox.warning(self, "경고", "이미지 생성을 위한 대본을 입력하세요")
            return

        # 대본의 핵심 내용 추출 (처음 500자)
        summary = script_content[:500]

        prompt = f"""Based on this YouTube script, create a compelling thumbnail image:

Script excerpt:
{summary}...

Image requirements:
1. Eye-catching and vibrant colors
2. Clear focal point that represents the main theme
3. High contrast for mobile viewing
4. Emotions: engaging, intriguing
5. Style: modern, cinematic
6. Aspect ratio: 16:9 or 9:16 for shorts

Create a visually stunning thumbnail that will make viewers want to click and watch."""

        self.googlefx_prompt.setPlainText(prompt)
        self.statusBar().showMessage("Google FX 이미지 프롬프트가 생성되었습니다")

    def open_google_fx(self):
        """Google FX를 열어서 이미지 생성"""
        prompt = self.googlefx_prompt.toPlainText().strip()
        if not prompt:
            QMessageBox.warning(self, "경고", "먼저 이미지 프롬프트를 생성하세요")
            return

        # Google FX URL 열기
        url = "https://labs.google/fx/ko"
        webbrowser.open(url)

        # 프롬프트를 클립보드에 복사
        clipboard = QApplication.clipboard()
        clipboard.setText(prompt)

        self.statusBar().showMessage("Google FX가 열렸습니다. 프롬프트가 클립보드에 복사되었습니다")
        QMessageBox.information(self, "안내", "Google FX가 브라우저에서 열렸습니다.\n\n프롬프트가 클립보드에 복사되었습니다.\n\n1. ImageFX를 선택하세요\n2. 프롬프트를 붙여넣으세요 (Ctrl+V)\n3. 이미지를 생성하세요\n4. 마음에 드는 이미지를 다운로드하세요")

    def save_workflow(self):
        """전체 워크플로우 저장"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"workflow_{timestamp}.txt"
        filepath = os.path.join(self.scripts_dir, filename)

        content = f"""=== 대본 작성 워크플로우 ===
생성 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

=== 1. ChatGPT 대본 분석 ===

[입력 대본]
{self.analysis_input.toPlainText()}

[분석 프롬프트]
{self.analysis_prompt.toPlainText()}

[분석 결과]
{self.analysis_result.toPlainText()}

=== 2. ChatGPT 창작 ===

[창작 주제]
{self.creative_input.toPlainText()}

[창작 프롬프트]
{self.creative_prompt.toPlainText()}

[창작 결과]
{self.creative_result.toPlainText()}

=== 3. Claude 유튜브 대본 ===

[Claude 입력]
{self.claude_input.toPlainText()}

[Claude 프롬프트]
{self.claude_prompt.toPlainText()}

[Claude 대본 결과]
{self.claude_result.toPlainText()}

=== 4. Google FX 이미지 프롬프트 ===

[이미지 프롬프트]
{self.googlefx_prompt.toPlainText()}

=== 워크플로우 완료 ===
"""

        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)

            self.statusBar().showMessage(f"워크플로우 저장 완료: {filename}")
            QMessageBox.information(self, "완료", f"전체 워크플로우가 저장되었습니다!\n\n파일: {filename}\n경로: {self.scripts_dir}")
        except Exception as e:
            QMessageBox.critical(self, "오류", f"저장 중 오류 발생:\n{str(e)}")

    # ========== 대본 작성3 탭 (Claude) 관련 함수들 ==========

    def toggle_claude_api_key_visibility(self):
        """Claude API 키 보이기/숨기기 토글"""
        if self.claude_api_key_input.echoMode() == QLineEdit.Password:
            self.claude_api_key_input.setEchoMode(QLineEdit.Normal)
        else:
            self.claude_api_key_input.setEchoMode(QLineEdit.Password)

    def load_subtitle_for_claude(self):
        """대본 작성3용 자막 파일 불러오기"""
        try:
            file_path, _ = QFileDialog.getOpenFileName(
                self,
                "자막 파일 선택",
                "",
                "자막 파일 (*.srt *.vtt *.txt);;모든 파일 (*.*)"
            )

            if not file_path:
                return

            # 파일 읽기
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # 타임스탬프 제거 여부 묻기
            reply = QMessageBox.question(
                self,
                "타임스탬프 제거",
                "타임스탬프를 제거하고 텍스트만 표시하시겠습니까?",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.Yes
            )

            if reply == QMessageBox.Yes:
                text_only = self.remove_subtitle_timestamps(content)
                self.claude_subtitle_input.setPlainText(text_only)
            else:
                self.claude_subtitle_input.setPlainText(content)

            filename = os.path.basename(file_path)
            self.statusBar().showMessage(f"자막 파일 불러오기 완료: {filename}")

        except Exception as e:
            QMessageBox.warning(self, "오류", f"자막 파일을 불러올 수 없습니다:\n{str(e)}")

    def request_claude_improvement(self):
        """Claude에게 자막 개선 요청"""
        if not ANTHROPIC_AVAILABLE:
            QMessageBox.warning(
                self,
                "라이브러리 없음",
                "Anthropic 라이브러리가 설치되어 있지 않습니다.\n\n설치 명령어:\npip install anthropic"
            )
            return

        subtitle_text = self.claude_subtitle_input.toPlainText().strip()
        if not subtitle_text:
            QMessageBox.warning(self, "경고", "자막을 먼저 입력하거나 불러와주세요")
            return

        # API 키 확인
        api_key = self.config.get('claude_api_key', '').strip()
        if not api_key:
            QMessageBox.warning(self, "경고", "설정 탭에서 Claude API 키를 입력하세요")
            return

        # 개선 방향 및 옵션
        improvement_type = self.claude_improvement_type.currentText()
        target_language = self.claude_target_language.currentText()
        custom_request = self.claude_custom_request.toPlainText().strip()

        # 프롬프트 생성
        prompt = self._build_claude_prompt(subtitle_text, improvement_type, target_language, custom_request)

        # 진행 표시
        self.claude_progress.setVisible(True)
        self.claude_progress.setRange(0, 0)  # 무한 프로그레스
        self.statusBar().showMessage("Claude에게 요청 중...")

        try:
            client = Anthropic(api_key=api_key)

            response = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=4096,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )

            result_text = response.content[0].text
            self.claude_result_text.setPlainText(result_text)

            self.claude_progress.setVisible(False)
            self.statusBar().showMessage("Claude 개선 완료!")
            QMessageBox.information(self, "완료", "Claude가 대본을 성공적으로 개선했습니다!")

        except Exception as e:
            self.claude_progress.setVisible(False)
            self.statusBar().showMessage("Claude 요청 실패")
            QMessageBox.critical(self, "오류", f"Claude 요청 중 오류 발생:\n{str(e)}")

    def _build_claude_prompt(self, subtitle_text, improvement_type, target_language, custom_request):
        """Claude 요청용 프롬프트 생성"""
        improvement_instructions = {
            "전체적으로 다듬기": "이 자막을 전체적으로 매끄럽고 자연스럽게 다듬어주세요. 문맥이 어색한 부분을 수정하고, 흐름을 개선해주세요.",
            "문법 및 맞춤법 교정": "이 자막의 문법과 맞춤법 오류를 모두 찾아 교정해주세요.",
            "가독성 향상": "이 자막을 더 읽기 쉽고 이해하기 쉽게 개선해주세요. 복잡한 문장은 간단하게 나누고, 명확하게 표현해주세요.",
            "전문적인 톤으로 변경": "이 자막을 전문적이고 격식 있는 톤으로 바꿔주세요.",
            "친근한 톤으로 변경": "이 자막을 친근하고 부드러운 톤으로 바꿔주세요.",
            "요약하기": "이 자막의 핵심 내용만 간결하게 요약해주세요.",
            "확장하기": "이 자막을 더 자세하고 풍부하게 확장해주세요.",
            "커스텀 (직접 입력)": custom_request if custom_request else "사용자의 요구사항에 맞게 개선해주세요."
        }

        instruction = improvement_instructions.get(improvement_type, improvement_instructions["전체적으로 다듬기"])

        language_instruction = ""
        if target_language != "원문 유지":
            language_instruction = f"\n\n결과는 반드시 {target_language}로 작성해주세요."

        custom_instruction = ""
        if custom_request and improvement_type != "커스텀 (직접 입력)":
            custom_instruction = f"\n\n추가 요청사항: {custom_request}"

        prompt = f"""다음 자막 텍스트를 개선해주세요.

{instruction}{language_instruction}{custom_instruction}

[원본 자막]
{subtitle_text}

[개선 요청사항]
- 원본의 의미와 뉘앙스를 최대한 유지해주세요
- 영상 자막으로 사용하기 적합하게 만들어주세요
- 개선된 자막만 출력하고, 설명은 하지 마세요

개선된 자막:"""

        return prompt

    def save_claude_result(self):
        """Claude 개선 결과 저장"""
        result_text = self.claude_result_text.toPlainText().strip()
        if not result_text:
            QMessageBox.warning(self, "경고", "저장할 결과가 없습니다")
            return

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"claude_improved_{timestamp}.txt"
        filepath = os.path.join(self.scripts_dir, filename)

        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(f"=== Claude 개선 결과 ===\n")
                f.write(f"생성 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write(f"개선 방향: {self.claude_improvement_type.currentText()}\n")
                f.write(f"목표 언어: {self.claude_target_language.currentText()}\n\n")
                f.write(result_text)

            self.statusBar().showMessage(f"결과 저장 완료: {filename}")
            QMessageBox.information(self, "완료", f"결과가 저장되었습니다!\n\n파일: {filename}\n경로: {self.scripts_dir}")

        except Exception as e:
            QMessageBox.critical(self, "오류", f"저장 중 오류 발생:\n{str(e)}")

    def load_subtitle_file(self):
        """로컬 SRT 자막 파일 불러오기"""
        try:
            # 파일 선택 다이얼로그
            file_path, _ = QFileDialog.getOpenFileName(
                self,
                "자막 파일 선택",
                "",
                "자막 파일 (*.srt *.vtt *.txt);;모든 파일 (*.*)"
            )

            if not file_path:
                return

            # 파일 읽기
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()

            # 타임스탬프 제거 여부 묻기
            reply = QMessageBox.question(
                self,
                "타임스탬프 제거",
                "타임스탬프를 제거하고 텍스트만 표시하시겠습니까?",
                QMessageBox.Yes | QMessageBox.No,
                QMessageBox.Yes
            )

            if reply == QMessageBox.Yes:
                # SRT/VTT 타임스탬프 제거
                text_only = self.remove_subtitle_timestamps(content)
                self.analysis_input.setPlainText(text_only)
            else:
                # 원본 그대로 표시
                self.analysis_input.setPlainText(content)

            filename = os.path.basename(file_path)
            self.statusBar().showMessage(f"자막 파일 불러오기 완료: {filename}")

        except Exception as e:
            QMessageBox.warning(self, "오류", f"자막 파일을 불러올 수 없습니다:\n{str(e)}")

    def remove_subtitle_timestamps(self, content):
        """자막에서 타임스탬프 제거하고 텍스트만 추출"""
        import re

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


def main():
    app = QApplication(sys.argv)

    # 폰트 설정
    font = QFont("맑은 고딕", 9)
    app.setFont(font)

    window = ScriptWriter()
    window.show()

    sys.exit(app.exec_())


if __name__ == '__main__':
    main()
