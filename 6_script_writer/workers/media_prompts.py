#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
미디어 프롬프트 생성 Worker 스레드
"""

from PyQt5.QtCore import QThread, pyqtSignal

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False


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
            if any(emoji in line for emoji in ['🎧', '🎬', '⚛️', '🧘', '🧠', '🌌', '🧑\u200d🔬', '🧩', '🌠', '📹', '✍️']):
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
