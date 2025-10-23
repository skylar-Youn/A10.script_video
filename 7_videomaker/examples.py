#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
7_videomaker 사용 예제

API를 직접 사용하는 다양한 예제를 제공합니다.
"""

import sys
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from 7_videomaker.api import VideoAPI, SubtitleAPI, AIAPI
from 7_videomaker.config import Config


def example_1_cut_video():
    """예제 1: 비디오 자르기"""
    print("\n" + "=" * 60)
    print("예제 1: 비디오 자르기")
    print("=" * 60)

    config = Config()
    video_api = VideoAPI(output_dir=config.output_dir)

    # 비디오 경로 (실제 파일 경로로 변경 필요)
    input_path = '/path/to/your/video.mp4'

    print(f"입력: {input_path}")
    print("시작: 00:00:10")
    print("종료: 00:00:20")

    success, output_path, message = video_api.cut_video(
        input_path=input_path,
        start_time='00:00:10',
        end_time='00:00:20'
    )

    if success:
        print(f"✅ 성공: {output_path}")
        print(f"   {message}")
    else:
        print(f"❌ 실패: {message}")


def example_2_merge_videos():
    """예제 2: 비디오 합치기"""
    print("\n" + "=" * 60)
    print("예제 2: 비디오 합치기")
    print("=" * 60)

    config = Config()
    video_api = VideoAPI(output_dir=config.output_dir)

    # 비디오 경로 (실제 파일 경로로 변경 필요)
    input_paths = [
        '/path/to/video1.mp4',
        '/path/to/video2.mp4',
        '/path/to/video3.mp4'
    ]

    print("입력 비디오:")
    for i, path in enumerate(input_paths, 1):
        print(f"  {i}. {path}")

    success, output_path, message = video_api.merge_videos(
        input_paths=input_paths
    )

    if success:
        print(f"✅ 성공: {output_path}")
        print(f"   {message}")
    else:
        print(f"❌ 실패: {message}")


def example_3_extract_frames():
    """예제 3: 프레임 추출"""
    print("\n" + "=" * 60)
    print("예제 3: 프레임 추출")
    print("=" * 60)

    config = Config()
    video_api = VideoAPI(output_dir=config.output_dir)

    # 비디오 경로 (실제 파일 경로로 변경 필요)
    input_path = '/path/to/your/video.mp4'

    print(f"입력: {input_path}")
    print("간격: 5초")

    success, frame_paths, message = video_api.extract_frames(
        input_path=input_path,
        interval=5
    )

    if success:
        print(f"✅ 성공: {len(frame_paths)}개 프레임 추출")
        print(f"   {message}")
        print("   프레임 목록:")
        for i, frame in enumerate(frame_paths[:5], 1):
            print(f"     {i}. {frame}")
        if len(frame_paths) > 5:
            print(f"     ... 외 {len(frame_paths) - 5}개")
    else:
        print(f"❌ 실패: {message}")


def example_4_generate_subtitle():
    """예제 4: AI 자막 생성"""
    print("\n" + "=" * 60)
    print("예제 4: AI 자막 생성")
    print("=" * 60)

    config = Config()
    video_api = VideoAPI(output_dir=config.output_dir)
    ai_api = AIAPI(
        anthropic_key=config.anthropic_api_key,
        openai_key=config.openai_api_key
    )

    # 비디오 경로 (실제 파일 경로로 변경 필요)
    input_path = '/path/to/your/video.mp4'

    print(f"입력: {input_path}")
    print("단계 1: 프레임 추출...")

    # 1. 프레임 추출
    success, frame_paths, message = video_api.extract_frames(
        input_path=input_path,
        interval=5
    )

    if not success:
        print(f"❌ 프레임 추출 실패: {message}")
        return

    print(f"✅ {len(frame_paths)}개 프레임 추출 완료")
    print("단계 2: AI 자막 생성...")

    # 2. AI 자막 생성
    success, subtitle_text, message = ai_api.generate_subtitle_from_frames(
        frame_paths=frame_paths,
        language='ko',
        model_type='claude'
    )

    if success:
        print(f"✅ 자막 생성 완료")
        print(f"   {message}")
        print("\n생성된 자막 (처음 10줄):")
        lines = subtitle_text.split('\n')
        for line in lines[:10]:
            print(f"   {line}")
        if len(lines) > 10:
            print(f"   ... 외 {len(lines) - 10}줄")
    else:
        print(f"❌ 실패: {message}")


def example_5_analyze_frames():
    """예제 5: 프레임 분석"""
    print("\n" + "=" * 60)
    print("예제 5: 프레임 분석")
    print("=" * 60)

    config = Config()
    ai_api = AIAPI(
        anthropic_key=config.anthropic_api_key,
        openai_key=config.openai_api_key
    )

    # 프레임 경로 (실제 파일 경로로 변경 필요)
    frame_paths = [
        '/path/to/frame_0001.png',
        '/path/to/frame_0002.png',
        '/path/to/frame_0003.png'
    ]

    print("입력 프레임:")
    for i, path in enumerate(frame_paths, 1):
        print(f"  {i}. {path}")

    prompt = "이 이미지들을 분석하여 영상의 주요 장면과 내용을 설명해주세요."
    print(f"\n프롬프트: {prompt}")

    success, analysis, message = ai_api.analyze_frames(
        frame_paths=frame_paths,
        prompt=prompt,
        model_type='claude'
    )

    if success:
        print(f"✅ 분석 완료")
        print(f"\n분석 결과:")
        print(analysis)
    else:
        print(f"❌ 실패: {message}")


def example_6_add_subtitle():
    """예제 6: 영상에 자막 추가"""
    print("\n" + "=" * 60)
    print("예제 6: 영상에 자막 추가")
    print("=" * 60)

    config = Config()
    subtitle_api = SubtitleAPI(output_dir=config.output_dir)

    # 비디오 경로 (실제 파일 경로로 변경 필요)
    video_path = '/path/to/your/video.mp4'

    # 자막 내용 (SRT 형식)
    subtitle_content = """1
00:00:00,000 --> 00:00:02,000
안녕하세요

2
00:00:02,000 --> 00:00:04,000
비디오 메이커입니다

3
00:00:04,000 --> 00:00:06,000
AI 기반 자막 생성
"""

    print(f"입력: {video_path}")
    print("자막:")
    print(subtitle_content)

    success, output_path, message = subtitle_api.add_subtitle_to_video(
        video_path=video_path,
        subtitle_content=subtitle_content
    )

    if success:
        print(f"✅ 성공: {output_path}")
        print(f"   {message}")
    else:
        print(f"❌ 실패: {message}")


def example_7_check_ffmpeg():
    """예제 7: FFmpeg 설치 확인"""
    print("\n" + "=" * 60)
    print("예제 7: FFmpeg 설치 확인")
    print("=" * 60)

    from 7_videomaker.utils.ffmpeg import FFmpegUtils

    if FFmpegUtils.check_installed():
        print("✅ FFmpeg가 설치되어 있습니다")

        # 버전 정보 출력
        import subprocess
        result = subprocess.run(
            ['ffmpeg', '-version'],
            capture_output=True,
            text=True
        )
        first_line = result.stdout.split('\n')[0]
        print(f"   {first_line}")
    else:
        print("❌ FFmpeg가 설치되어 있지 않습니다")
        print("\n설치 방법:")
        print("  Ubuntu/Debian: sudo apt-get install ffmpeg")
        print("  macOS:         brew install ffmpeg")


def main():
    """메인 함수"""
    print("\n" + "=" * 60)
    print("7_videomaker 사용 예제")
    print("=" * 60)
    print("\n사용 가능한 예제:")
    print("  1. 비디오 자르기")
    print("  2. 비디오 합치기")
    print("  3. 프레임 추출")
    print("  4. AI 자막 생성")
    print("  5. 프레임 분석")
    print("  6. 영상에 자막 추가")
    print("  7. FFmpeg 설치 확인")
    print("  0. 모두 실행")
    print()

    choice = input("실행할 예제 번호를 선택하세요 (0-7): ").strip()

    if choice == '0':
        example_7_check_ffmpeg()  # FFmpeg 확인 먼저
        print("\n⚠️  주의: 다른 예제는 실제 파일 경로가 필요합니다.")
        print("examples.py 파일을 열어 경로를 수정해주세요.")
    elif choice == '1':
        example_1_cut_video()
    elif choice == '2':
        example_2_merge_videos()
    elif choice == '3':
        example_3_extract_frames()
    elif choice == '4':
        example_4_generate_subtitle()
    elif choice == '5':
        example_5_analyze_frames()
    elif choice == '6':
        example_6_add_subtitle()
    elif choice == '7':
        example_7_check_ffmpeg()
    else:
        print("❌ 잘못된 선택입니다.")


if __name__ == '__main__':
    main()
