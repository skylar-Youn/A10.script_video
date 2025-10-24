import ffmpeg
import os
from typing import List
from backend.models.subtitle import SubtitleItem


class VideoProcessor:
    """비디오 처리 클래스"""

    @staticmethod
    def split_video_by_subtitles(video_path: str, subtitles: List[SubtitleItem], temp_dir: str) -> List[str]:
        """자막 구간별로 비디오 분할"""
        os.makedirs(temp_dir, exist_ok=True)
        clip_paths = []

        for sub in subtitles:
            output_path = os.path.join(temp_dir, f"clip_{sub.id:04d}.mp4")

            try:
                (
                    ffmpeg
                    .input(video_path, ss=sub.start, t=sub.end - sub.start)
                    .output(
                        output_path,
                        vcodec='libx264',
                        acodec='aac',
                        preset='ultrafast',
                        crf=23,
                        video_bitrate='2M',
                        audio_bitrate='128k'
                    )
                    .overwrite_output()
                    .run(capture_stdout=True, capture_stderr=True, quiet=True)
                )
                clip_paths.append(output_path)
            except ffmpeg.Error as e:
                print(f"Error processing clip {sub.id}: {e.stderr.decode()}")
                raise

        return clip_paths

    @staticmethod
    def merge_clips(clip_paths: List[str], output_path: str):
        """분할된 클립들을 병합"""
        if not clip_paths:
            raise ValueError("No clips to merge")

        # concat 파일 생성
        concat_file = os.path.join(os.path.dirname(clip_paths[0]), "concat_list.txt")
        with open(concat_file, 'w') as f:
            for clip in clip_paths:
                # FFmpeg concat 형식: file 'path'
                f.write(f"file '{os.path.abspath(clip)}'\n")

        try:
            (
                ffmpeg
                .input(concat_file, format='concat', safe=0)
                .output(
                    output_path,
                    c='copy'
                )
                .overwrite_output()
                .run(capture_stdout=True, capture_stderr=True, quiet=True)
            )
        except ffmpeg.Error as e:
            print(f"Error merging clips: {e.stderr.decode()}")
            raise
        finally:
            # concat 파일 삭제
            if os.path.exists(concat_file):
                os.remove(concat_file)

    @staticmethod
    def get_video_info(video_path: str) -> dict:
        """비디오 정보 추출"""
        try:
            probe = ffmpeg.probe(video_path)
            video_info = next(s for s in probe['streams'] if s['codec_type'] == 'video')

            return {
                'duration': float(probe['format']['duration']),
                'width': int(video_info['width']),
                'height': int(video_info['height']),
                'fps': eval(video_info['r_frame_rate'])
            }
        except Exception as e:
            print(f"Error getting video info: {e}")
            return {}
