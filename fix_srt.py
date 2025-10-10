#!/usr/bin/env python3
"""
잘못된 SRT 파일을 올바른 형식으로 수정하는 스크립트
"""

import re
import sys
from pathlib import Path


def fix_srt_file(input_path: str, output_path: str = None):
    """
    잘못된 SRT 파일을 올바른 형식으로 수정

    Args:
        input_path: 입력 SRT 파일 경로
        output_path: 출력 SRT 파일 경로 (None이면 원본 백업 후 덮어씀)
    """
    input_file = Path(input_path)

    if not input_file.exists():
        print(f"❌ 파일을 찾을 수 없습니다: {input_path}")
        return False

    # 파일 읽기
    print(f"📖 읽는 중: {input_file.name}")
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # 정규식으로 자막 블록 추출
    subtitle_pattern = r'(\d+)\s*\n(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})\s*\n((?:(?!\d+\s*\n\d{2}:\d{2}:).+\n?)+)'

    matches = re.finditer(subtitle_pattern, content, re.MULTILINE)

    # 올바른 형식으로 재구성
    fixed_content = []
    subtitle_count = 0

    for match in matches:
        subtitle_count += 1
        index = subtitle_count  # 순서대로 다시 번호 매기기
        start = match.group(2)
        end = match.group(3)
        text = match.group(4).strip()

        # 텍스트 정리
        lines = text.split('\n')
        # 단독 숫자만 있는 줄 제거
        lines = [line.strip() for line in lines if line.strip() and not line.strip().isdigit()]
        # 여러 줄은 그대로 유지 (줄바꿈 복원)
        text = '\n'.join(lines)

        if text:  # 빈 텍스트가 아닌 경우만 추가
            # 표준 SRT 형식
            fixed_content.append(f"{index}")
            fixed_content.append(f"{start} --> {end}")
            fixed_content.append(text)
            fixed_content.append("")  # 빈 줄

    # 출력 경로 결정
    if output_path is None:
        # 원본 백업
        backup_path = input_file.parent / f"{input_file.stem}.backup{input_file.suffix}"
        print(f"💾 백업 생성: {backup_path.name}")
        input_file.rename(backup_path)
        output_path = input_path

    output_file = Path(output_path)

    # 수정된 내용 저장
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(fixed_content))

    print(f"✅ 수정 완료!")
    print(f"   📊 자막 수: {subtitle_count}개")
    print(f"   📁 저장 위치: {output_file}")

    return True


def main():
    if len(sys.argv) < 2:
        print("""
사용법: python fix_srt.py <SRT파일> [출력파일]

예시:
  # 원본 파일을 백업하고 수정 (원본은 .backup.srt로 저장됨)
  python fix_srt.py video.srt

  # 새 파일로 저장
  python fix_srt.py video.srt video_fixed.srt

  # 폴더의 모든 SRT 파일 수정
  for f in *.srt; do python fix_srt.py "$f"; done
""")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None

    success = fix_srt_file(input_path, output_path)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
