#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
무료 미디어 다운로드 API 모듈
Pixabay, Pexels, Google Custom Search, YouTube
"""

import os
import time
import re
import urllib.request
import urllib.parse

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

try:
    from googleapiclient.discovery import build
    GOOGLE_API_AVAILABLE = True
except ImportError:
    GOOGLE_API_AVAILABLE = False

try:
    import yt_dlp
    YT_DLP_AVAILABLE = True
except ImportError:
    YT_DLP_AVAILABLE = False


class PixabayDownloader:
    """Pixabay API를 사용한 이미지/영상 다운로드"""

    def __init__(self, api_key):
        self.api_key = api_key

    def download_images(self, keyword, count, output_dir, progress_callback=None):
        """Pixabay에서 이미지 다운로드"""
        try:
            url = f"https://pixabay.com/api/?key={self.api_key}&q={urllib.parse.quote(keyword)}&image_type=photo&per_page={count}"
            response = requests.get(url, timeout=10)
            data = response.json()

            if 'hits' not in data or len(data['hits']) == 0:
                return 0, f"⚠️ Pixabay에서 '{keyword}' 이미지를 찾을 수 없습니다."

            hits = data['hits']
            success_count = 0

            for idx, hit in enumerate(hits[:count]):
                try:
                    image_url = hit['largeImageURL']
                    image_id = hit['id']
                    extension = image_url.split('.')[-1].split('?')[0]
                    filename = f"pixabay_img_{keyword}_{image_id}.{extension}"
                    filepath = os.path.join(output_dir, filename)

                    # 이미지 다운로드
                    urllib.request.urlretrieve(image_url, filepath)
                    success_count += 1

                    # 진행률 콜백
                    if progress_callback:
                        progress_callback(idx + 1, count)

                    time.sleep(0.5)  # API 제한 방지

                except Exception as e:
                    if progress_callback:
                        progress_callback(idx + 1, count, f"⚠️ 이미지 다운로드 실패: {str(e)}")

            return success_count, None

        except Exception as e:
            return 0, f"❌ Pixabay 이미지 검색 오류: {str(e)}"

    def download_videos(self, keyword, count, output_dir, progress_callback=None):
        """Pixabay에서 영상 다운로드"""
        try:
            url = f"https://pixabay.com/api/videos/?key={self.api_key}&q={urllib.parse.quote(keyword)}&per_page={count}"
            response = requests.get(url, timeout=10)
            data = response.json()

            if 'hits' not in data or len(data['hits']) == 0:
                return 0, f"⚠️ Pixabay에서 '{keyword}' 영상을 찾을 수 없습니다."

            hits = data['hits']
            success_count = 0

            for idx, hit in enumerate(hits[:count]):
                try:
                    # 가장 작은 크기의 영상 선택 (medium)
                    videos = hit.get('videos', {})
                    if 'medium' in videos:
                        video_url = videos['medium']['url']
                    elif 'small' in videos:
                        video_url = videos['small']['url']
                    elif 'tiny' in videos:
                        video_url = videos['tiny']['url']
                    else:
                        continue

                    video_id = hit['id']
                    filename = f"pixabay_video_{keyword}_{video_id}.mp4"
                    filepath = os.path.join(output_dir, filename)

                    # 영상 다운로드
                    urllib.request.urlretrieve(video_url, filepath)
                    success_count += 1

                    # 진행률 콜백
                    if progress_callback:
                        progress_callback(idx + 1, count)

                    time.sleep(1)  # API 제한 방지

                except Exception as e:
                    if progress_callback:
                        progress_callback(idx + 1, count, f"⚠️ 영상 다운로드 실패: {str(e)}")

            return success_count, None

        except Exception as e:
            return 0, f"❌ Pixabay 영상 검색 오류: {str(e)}"


class PexelsDownloader:
    """Pexels API를 사용한 이미지/영상 다운로드"""

    def __init__(self, api_key):
        self.api_key = api_key

    def download_images(self, keyword, count, output_dir, progress_callback=None):
        """Pexels에서 이미지 다운로드"""
        try:
            url = f"https://api.pexels.com/v1/search?query={urllib.parse.quote(keyword)}&per_page={count}"
            headers = {"Authorization": self.api_key}
            response = requests.get(url, headers=headers, timeout=10)
            data = response.json()

            if 'photos' not in data or len(data['photos']) == 0:
                return 0, f"⚠️ Pexels에서 '{keyword}' 이미지를 찾을 수 없습니다."

            photos = data['photos']
            success_count = 0

            for idx, photo in enumerate(photos[:count]):
                try:
                    image_url = photo['src']['large']
                    photo_id = photo['id']
                    filename = f"pexels_img_{keyword}_{photo_id}.jpg"
                    filepath = os.path.join(output_dir, filename)

                    # 이미지 다운로드
                    urllib.request.urlretrieve(image_url, filepath)
                    success_count += 1

                    # 진행률 콜백
                    if progress_callback:
                        progress_callback(idx + 1, count)

                    time.sleep(0.5)  # API 제한 방지

                except Exception as e:
                    if progress_callback:
                        progress_callback(idx + 1, count, f"⚠️ 이미지 다운로드 실패: {str(e)}")

            return success_count, None

        except Exception as e:
            return 0, f"❌ Pexels 이미지 검색 오류: {str(e)}"

    def download_videos(self, keyword, count, output_dir, progress_callback=None):
        """Pexels에서 영상 다운로드"""
        try:
            url = f"https://api.pexels.com/videos/search?query={urllib.parse.quote(keyword)}&per_page={count}"
            headers = {"Authorization": self.api_key}
            response = requests.get(url, headers=headers, timeout=10)
            data = response.json()

            if 'videos' not in data or len(data['videos']) == 0:
                return 0, f"⚠️ Pexels에서 '{keyword}' 영상을 찾을 수 없습니다."

            videos = data['videos']
            success_count = 0

            for idx, video in enumerate(videos[:count]):
                try:
                    # 중간 화질 선택 (SD)
                    video_files = video.get('video_files', [])
                    sd_video = None
                    for vf in video_files:
                        if vf.get('quality') == 'sd':
                            sd_video = vf
                            break

                    if not sd_video and video_files:
                        sd_video = video_files[0]

                    if not sd_video:
                        continue

                    video_url = sd_video['link']
                    video_id = video['id']
                    filename = f"pexels_video_{keyword}_{video_id}.mp4"
                    filepath = os.path.join(output_dir, filename)

                    # 영상 다운로드
                    urllib.request.urlretrieve(video_url, filepath)
                    success_count += 1

                    # 진행률 콜백
                    if progress_callback:
                        progress_callback(idx + 1, count)

                    time.sleep(1)  # API 제한 방지

                except Exception as e:
                    if progress_callback:
                        progress_callback(idx + 1, count, f"⚠️ 영상 다운로드 실패: {str(e)}")

            return success_count, None

        except Exception as e:
            return 0, f"❌ Pexels 영상 검색 오류: {str(e)}"


class GoogleDownloader:
    """Google Custom Search API를 사용한 이미지 다운로드 및 YouTube 영상 다운로드"""

    def __init__(self, api_key, search_engine_id=None):
        self.api_key = api_key
        self.search_engine_id = search_engine_id

    def download_images(self, keyword, count, output_dir, progress_callback=None):
        """Google Custom Search API로 무료 사용 가능한 이미지 다운로드"""
        try:
            # Google Custom Search API 엔드포인트
            url = "https://www.googleapis.com/customsearch/v1"

            success_count = 0
            # Google API는 한 번에 최대 10개까지만 가져올 수 있음
            pages = (count + 9) // 10  # 필요한 페이지 수

            for page in range(pages):
                start_index = page * 10 + 1
                results_needed = min(10, count - success_count)

                params = {
                    'key': self.api_key,
                    'cx': self.search_engine_id,
                    'q': keyword,
                    'searchType': 'image',
                    'num': results_needed,
                    'start': start_index,
                    'rights': 'cc_publicdomain,cc_attribute,cc_sharealike',  # 무료 사용 가능한 이미지
                    'safe': 'active'
                }

                response = requests.get(url, params=params, timeout=10)
                data = response.json()

                if 'items' not in data or len(data['items']) == 0:
                    if page == 0:
                        return 0, f"⚠️ Google에서 '{keyword}' 무료 이미지를 찾을 수 없습니다."
                    break

                items = data['items']

                for idx, item in enumerate(items):
                    try:
                        image_url = item['link']

                        # 파일 확장자 추출
                        extension = image_url.split('.')[-1].split('?')[0].lower()
                        if extension not in ['jpg', 'jpeg', 'png', 'gif', 'webp']:
                            extension = 'jpg'

                        filename = f"google_img_{keyword}_{start_index + idx}.{extension}"
                        filepath = os.path.join(output_dir, filename)

                        # 이미지 다운로드
                        urllib.request.urlretrieve(image_url, filepath)
                        success_count += 1

                        # 진행률 콜백
                        if progress_callback:
                            progress_callback(success_count, count)

                        time.sleep(0.5)  # API 제한 방지

                    except Exception as e:
                        if progress_callback:
                            progress_callback(success_count, count, f"⚠️ 이미지 다운로드 실패: {str(e)}")

                if success_count >= count:
                    break

                time.sleep(1)  # 페이지 간 대기

            return success_count, None

        except Exception as e:
            return 0, f"❌ Google 이미지 검색 오류: {str(e)}"

    def download_youtube_videos(self, keyword, count, output_dir, progress_callback=None):
        """YouTube Data API로 Creative Commons 라이선스 영상 다운로드"""
        try:
            if not GOOGLE_API_AVAILABLE:
                return 0, "⚠️ google-api-python-client가 설치되어 있지 않습니다."

            if not YT_DLP_AVAILABLE:
                return 0, "⚠️ yt-dlp가 설치되어 있지 않습니다."

            # YouTube Data API 사용
            youtube = build('youtube', 'v3', developerKey=self.api_key)

            # Creative Commons 라이선스가 있는 영상 검색
            search_response = youtube.search().list(
                q=keyword,
                part='id,snippet',
                maxResults=count,
                type='video',
                videoLicense='creativeCommon',  # Creative Commons 라이선스만
                videoDuration='short',  # 짧은 영상 (4분 이하)
                safeSearch='moderate'
            ).execute()

            if 'items' not in search_response or len(search_response['items']) == 0:
                return 0, f"⚠️ YouTube에서 '{keyword}' Creative Commons 영상을 찾을 수 없습니다."

            success_count = 0

            for idx, item in enumerate(search_response['items']):
                try:
                    video_id = item['id']['videoId']
                    video_title = item['snippet']['title']

                    # 안전한 파일명 생성
                    safe_title = re.sub(r'[<>:"/\\|?*]', '', video_title)[:50]
                    video_url = f"https://www.youtube.com/watch?v={video_id}"

                    # yt-dlp로 영상 다운로드
                    filename = f"youtube_{keyword}_{idx + 1}_{safe_title}.mp4"
                    filepath = os.path.join(output_dir, filename)

                    ydl_opts = {
                        'format': 'worst[ext=mp4]',  # 가장 작은 크기의 mp4
                        'outtmpl': filepath.rsplit('.', 1)[0],
                        'quiet': True,
                        'no_warnings': True,
                    }

                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([video_url])

                    success_count += 1

                    # 진행률 콜백
                    if progress_callback:
                        progress_callback(idx + 1, count)

                    time.sleep(1)  # API 제한 방지

                except Exception as e:
                    if progress_callback:
                        progress_callback(idx + 1, count, f"⚠️ 영상 다운로드 실패: {str(e)}")

            return success_count, None

        except Exception as e:
            return 0, f"❌ YouTube 영상 검색 오류: {str(e)}"
