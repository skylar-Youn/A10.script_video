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
                             QRadioButton, QButtonGroup, QListWidget, QListWidgetItem)
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QFont

# OpenAI 라이브러리 가용성 확인
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False


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

        self.tabs.addTab(tab, "대본 작성")

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

        self.tabs.addTab(tab, "프롬프트 생성")

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

        self.tabs.addTab(tab, "저장된 대본")

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
