#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
API 클라이언트 유틸리티
FastAPI 백엔드와 통신하는 클라이언트
"""

import requests
from pathlib import Path
from typing import List, Dict, Optional


class APIClient:
    """FastAPI 백엔드와 통신하는 클라이언트"""

    def __init__(self, base_url: str = "http://localhost:8009"):
        """
        Args:
            base_url: API 서버 URL
        """
        self.base_url = base_url

    def health_check(self) -> Dict:
        """
        서버 헬스 체크

        Returns:
            헬스 체크 응답
        """
        try:
            response = requests.get(f"{self.base_url}/health", timeout=5)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def upload_video(self, file_path: str) -> Dict:
        """
        비디오 파일 업로드

        Args:
            file_path: 업로드할 파일 경로

        Returns:
            업로드 응답
        """
        try:
            with open(file_path, 'rb') as f:
                files = {'file': (Path(file_path).name, f)}
                response = requests.post(
                    f"{self.base_url}/api/upload/video",
                    files=files,
                    timeout=60
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            return {"success": False, "error": str(e)}

    def upload_audio(self, file_path: str) -> Dict:
        """
        오디오 파일 업로드

        Args:
            file_path: 업로드할 파일 경로

        Returns:
            업로드 응답
        """
        try:
            with open(file_path, 'rb') as f:
                files = {'file': (Path(file_path).name, f)}
                response = requests.post(
                    f"{self.base_url}/api/upload/audio",
                    files=files,
                    timeout=60
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            return {"success": False, "error": str(e)}

    def upload_subtitle(self, file_path: str) -> Dict:
        """
        자막 파일 업로드

        Args:
            file_path: 업로드할 파일 경로

        Returns:
            업로드 응답
        """
        try:
            with open(file_path, 'rb') as f:
                files = {'file': (Path(file_path).name, f)}
                response = requests.post(
                    f"{self.base_url}/api/upload/subtitle",
                    files=files,
                    timeout=60
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            return {"success": False, "error": str(e)}

    def list_files(self) -> Dict:
        """
        파일 목록 조회

        Returns:
            파일 목록 응답
        """
        try:
            response = requests.get(f"{self.base_url}/api/files", timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"success": False, "error": str(e), "files": []}

    def delete_file(self, filename: str) -> Dict:
        """
        파일 삭제

        Args:
            filename: 삭제할 파일명

        Returns:
            삭제 응답
        """
        try:
            response = requests.delete(
                f"{self.base_url}/api/files/{filename}",
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_file_url(self, filename: str) -> str:
        """
        파일 URL 생성

        Args:
            filename: 파일명

        Returns:
            파일 전체 URL
        """
        return f"{self.base_url}/uploads/{filename}"
