import pysrt
from typing import List
from backend.models.subtitle import SubtitleItem


class SubtitleParser:
    """자막 파일 파싱 클래스"""

    @staticmethod
    def parse_srt(file_path: str) -> List[SubtitleItem]:
        """SRT 파일을 파싱하여 SubtitleItem 리스트로 반환"""
        subs = pysrt.open(file_path, encoding='utf-8')

        subtitle_items = []
        for idx, sub in enumerate(subs):
            start_seconds = (
                sub.start.hours * 3600 +
                sub.start.minutes * 60 +
                sub.start.seconds +
                sub.start.milliseconds / 1000
            )
            end_seconds = (
                sub.end.hours * 3600 +
                sub.end.minutes * 60 +
                sub.end.seconds +
                sub.end.milliseconds / 1000
            )

            subtitle_items.append(SubtitleItem(
                id=idx,
                start=start_seconds,
                end=end_seconds,
                text=sub.text.replace('\n', ' ')
            ))

        return subtitle_items

    @staticmethod
    def create_srt_from_items(items: List[SubtitleItem], output_path: str):
        """SubtitleItem 리스트로부터 SRT 파일 생성"""
        subs = pysrt.SubRipFile()

        for idx, item in enumerate(items):
            start_ms = int(item.start * 1000)
            end_ms = int(item.end * 1000)

            sub = pysrt.SubRipItem(
                index=idx + 1,
                start=pysrt.SubRipTime(milliseconds=start_ms),
                end=pysrt.SubRipTime(milliseconds=end_ms),
                text=item.text
            )
            subs.append(sub)

        subs.save(output_path, encoding='utf-8')
