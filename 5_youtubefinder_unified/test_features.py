#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YTDL 다운로드 기능 테스트 스크립트
"""

from app import convert_shorts_to_watch_url, remove_timestamps_from_subtitle

def test_shorts_conversion():
    """YouTube Shorts URL 변환 테스트"""
    print("=" * 60)
    print("1. YouTube Shorts URL 변환 테스트")
    print("=" * 60)

    test_cases = [
        ("https://youtube.com/shorts/ABC123", "https://www.youtube.com/watch?v=ABC123"),
        ("https://www.youtube.com/shorts/XYZ789", "https://www.youtube.com/watch?v=XYZ789"),
        ("https://youtu.be/shorts/TEST456", "https://www.youtube.com/watch?v=TEST456"),
        ("https://www.youtube.com/watch?v=NORMAL", "https://www.youtube.com/watch?v=NORMAL"),
        ("", ""),  # 빈 문자열
    ]

    all_passed = True
    for input_url, expected in test_cases:
        result = convert_shorts_to_watch_url(input_url)
        passed = result == expected
        all_passed &= passed

        status = "✓" if passed else "✗"
        print(f"{status} 입력: {input_url or '(빈 문자열)'}")
        print(f"  결과: {result or '(빈 문자열)'}")
        print(f"  예상: {expected or '(빈 문자열)'}")
        print()

    print(f"결과: {'모든 테스트 통과 ✓' if all_passed else '일부 실패 ✗'}\n\n")
    return all_passed


def test_timestamp_removal():
    """타임스탬프 제거 테스트"""
    print("=" * 60)
    print("2. 타임스탬프 제거 테스트")
    print("=" * 60)

    # SRT 형식 자막
    srt_content = """1
00:00:00,000 --> 00:00:02,000
안녕하세요

2
00:00:02,000 --> 00:00:05,000
이것은 테스트 자막입니다

3
00:00:05,000 --> 00:00:08,000
타임스탬프가 제거됩니다
"""

    # VTT 형식 자막
    vtt_content = """WEBVTT

NOTE
Created for testing

00:00:00.000 --> 00:00:02.000
안녕하세요

00:00:02.000 --> 00:00:05.000
이것은 테스트 자막입니다
"""

    print("테스트 1: SRT 형식")
    print("-" * 40)
    result_srt = remove_timestamps_from_subtitle(srt_content)
    print("원본:")
    print(srt_content[:100] + "...")
    print("\n결과:")
    print(result_srt)

    print("\n\n테스트 2: VTT 형식")
    print("-" * 40)
    result_vtt = remove_timestamps_from_subtitle(vtt_content)
    print("원본:")
    print(vtt_content[:100] + "...")
    print("\n결과:")
    print(result_vtt)

    # 검증: 타임스탬프가 제거되었는지 확인
    has_timestamp = '-->' in result_srt or '-->' in result_vtt
    has_numbers_only = any(line.strip().isdigit() for line in result_srt.split('\n'))

    passed = not has_timestamp and not has_numbers_only
    print("\n\n검증:")
    print(f"  타임스탬프 제거됨: {'✓' if not has_timestamp else '✗'}")
    print(f"  번호 라인 제거됨: {'✓' if not has_numbers_only else '✗'}")
    print(f"\n결과: {'테스트 통과 ✓' if passed else '테스트 실패 ✗'}\n\n")

    return passed


def test_language_selection():
    """언어 선택 로직 테스트"""
    print("=" * 60)
    print("3. 언어 선택 로직 테스트")
    print("=" * 60)

    # 체크박스 상태 시뮬레이션
    test_cases = [
        ({'ko': True, 'en': True, 'ja': False}, "ko,en"),
        ({'ko': True, 'en': False, 'ja': True}, "ko,ja"),
        ({'ko': True, 'en': True, 'ja': True}, "ko,en,ja"),
        ({'ko': False, 'en': True, 'ja': False}, "en"),
    ]

    all_passed = True
    for selections, expected in test_cases:
        selected_langs = []
        if selections['ko']:
            selected_langs.append('ko')
        if selections['en']:
            selected_langs.append('en')
        if selections['ja']:
            selected_langs.append('ja')

        result = ','.join(selected_langs)
        passed = result == expected
        all_passed &= passed

        status = "✓" if passed else "✗"
        print(f"{status} 선택: 한국어={selections['ko']}, 영어={selections['en']}, 일본어={selections['ja']}")
        print(f"  결과: {result}")
        print(f"  예상: {expected}")
        print()

    print(f"결과: {'모든 테스트 통과 ✓' if all_passed else '일부 실패 ✗'}\n\n")
    return all_passed


def main():
    """전체 테스트 실행"""
    print("\n")
    print("╔" + "=" * 58 + "╗")
    print("║" + " " * 10 + "YTDL 다운로드 기능 테스트" + " " * 22 + "║")
    print("╚" + "=" * 58 + "╝")
    print("\n")

    results = []
    results.append(("Shorts URL 변환", test_shorts_conversion()))
    results.append(("타임스탬프 제거", test_timestamp_removal()))
    results.append(("언어 선택 로직", test_language_selection()))

    print("=" * 60)
    print("전체 테스트 결과")
    print("=" * 60)

    for name, passed in results:
        status = "✓ 통과" if passed else "✗ 실패"
        print(f"{name:20} : {status}")

    all_passed = all(passed for _, passed in results)
    print("\n" + ("=" * 60))
    print(f"최종 결과: {'모든 테스트 통과! ✓' if all_passed else '일부 테스트 실패 ✗'}")
    print("=" * 60 + "\n")


if __name__ == '__main__':
    main()
