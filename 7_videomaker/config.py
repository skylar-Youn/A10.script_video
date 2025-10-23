#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
설정 관리 모듈
사용자 설정을 로드, 저장, 관리합니다.
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional


class Config:
    """설정 관리 클래스"""

    DEFAULT_CONFIG = {
        'anthropic_api_key': '',
        'openai_api_key': '',
        'output_dir': str(Path.home() / 'Videos' / 'videomaker_output'),
        'default_language': 'ko',
        'default_interval': 5,
        'default_model': 'claude',
    }

    def __init__(self, config_path: Optional[Path] = None):
        """
        Args:
            config_path: 설정 파일 경로 (기본값: ~/.videomaker_config.json)
        """
        if config_path is None:
            config_path = Path.home() / '.videomaker_config.json'

        self.config_path = config_path
        self._data = self._load()

    def _load(self) -> Dict[str, Any]:
        """설정 파일 로드"""
        if self.config_path.exists():
            try:
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    # 기본값과 병합
                    return {**self.DEFAULT_CONFIG, **data}
            except Exception as e:
                print(f"설정 파일 로드 실패: {e}")
                return self.DEFAULT_CONFIG.copy()
        return self.DEFAULT_CONFIG.copy()

    def save(self) -> bool:
        """설정 파일 저장"""
        try:
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump(self._data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"설정 파일 저장 실패: {e}")
            return False

    def get(self, key: str, default: Any = None) -> Any:
        """설정 값 조회"""
        return self._data.get(key, default)

    def set(self, key: str, value: Any) -> None:
        """설정 값 변경"""
        self._data[key] = value

    def update(self, data: Dict[str, Any]) -> None:
        """여러 설정 값 한 번에 변경"""
        self._data.update(data)

    def get_all(self) -> Dict[str, Any]:
        """모든 설정 조회"""
        return self._data.copy()

    def reset(self) -> None:
        """설정 초기화"""
        self._data = self.DEFAULT_CONFIG.copy()

    @property
    def anthropic_api_key(self) -> str:
        """Anthropic API 키"""
        return self.get('anthropic_api_key', '')

    @anthropic_api_key.setter
    def anthropic_api_key(self, value: str):
        self.set('anthropic_api_key', value)

    @property
    def openai_api_key(self) -> str:
        """OpenAI API 키"""
        return self.get('openai_api_key', '')

    @openai_api_key.setter
    def openai_api_key(self, value: str):
        self.set('openai_api_key', value)

    @property
    def output_dir(self) -> Path:
        """출력 디렉토리"""
        return Path(self.get('output_dir', self.DEFAULT_CONFIG['output_dir']))

    @output_dir.setter
    def output_dir(self, value: str):
        self.set('output_dir', str(value))
