"""Utilities for video text removal using Stable Diffusion inpainting."""
from __future__ import annotations

import subprocess
import os
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Dict, Iterable, Optional, Sequence, Tuple

import numpy as np
from PIL import Image

os.environ.setdefault("TRANSFORMERS_NO_TF", "1")
os.environ.setdefault("TRANSFORMERS_NO_FLAX", "1")

try:  # pragma: no cover - optional dependency check
    import cv2
    CV2_IMPORT_ERROR: Optional[Exception] = None
except ImportError as exc:  # pragma: no cover - handled at runtime
    cv2 = None  # type: ignore[assignment]
    CV2_IMPORT_ERROR = exc

try:  # pragma: no cover - optional dependency
    import av
    AV_IMPORT_ERROR: Optional[Exception] = None
    _pyav_error = getattr(av, "AVError", None) or getattr(av, "FFmpegError", None)
except ImportError as exc:  # pragma: no cover - handled at runtime
    av = None  # type: ignore[assignment]
    AV_IMPORT_ERROR = exc
    _pyav_error = None

PyAVError = _pyav_error if _pyav_error is not None else Exception


@dataclass
class RemovalConfig:
    """Configuration payload for the text-removal pipeline."""

    video_path: Path
    output_path: Path
    boxes: Sequence[Tuple[float, float, float, float]]
    model_id: str
    prompt: str
    negative_prompt: str
    strength: float
    guidance_scale: float
    num_inference_steps: int
    dilate_radius: int
    device: str = "cuda"
    dtype: str = "float16"
    seed: Optional[int] = None
    codec: str = "mp4v"
    fps_override: Optional[float] = None
    max_frames: Optional[int] = None


@dataclass
class BackgroundFillConfig:
    """Configuration for fast background fill using OpenCV inpaint."""

    video_path: Path
    output_path: Path
    boxes: Sequence[Tuple[float, float, float, float]]
    dilate_radius: int = 0
    codec: str = "mp4v"
    fps_override: Optional[float] = None
    max_frames: Optional[int] = None


class TrackerUnavailableError(RuntimeError):
    """Raised when the OpenCV tracker API is missing."""


class DiffusionUnavailableError(RuntimeError):
    """Raised when diffusers/torch dependencies are missing."""


def trim_video_clip(
    source_path: Path,
    target_path: Path,
    duration: float = 4.0,
    start: float = 0.0,
) -> Tuple[Path, Path]:
    """Create a re-encoded clip limited to the desired duration.

    Returns:
        A tuple of (trimmed_path, effective_source_path). The effective source path
        reflects the input file actually used for trimming (may differ from
        ``source_path`` if a fallback transcode was required).
    """

    if duration <= 0:
        raise ValueError("duration must be greater than zero.")
    if start < 0:
        raise ValueError("start must be zero or positive.")
    if not source_path.exists():
        raise FileNotFoundError(f"원본 영상을 찾을 수 없습니다: {source_path}")

    target_path.parent.mkdir(parents=True, exist_ok=True)
    if target_path.exists():
        target_path.unlink()

    effective_source = source_path
    alt_source: Optional[Path] = None

    def _build_cmd(input_path: Path) -> Sequence[str]:
        return [
            "ffmpeg",
            "-y",
            "-ss",
            str(round(start, 3)),
            "-i",
            str(input_path),
            "-t",
            str(duration),
            "-vf",
            "scale='if(gt(iw,ih),min(1080,iw),-2)':'if(gt(ih,iw),min(1080,ih),-2)',format=yuv420p",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-profile:v",
            "high",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-ac",
            "2",
            "-ar",
            "44100",
            "-movflags",
            "+faststart",
            str(target_path),
        ]

    for attempt in range(2):
        cmd = _build_cmd(effective_source)
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode == 0 and target_path.exists() and target_path.stat().st_size > 0:
            return target_path, effective_source

        stderr = proc.stderr.strip() or proc.stdout.strip() or "ffmpeg 트리밍에 실패했습니다."
        lower_err = stderr.lower()
        needs_av1_fallback = (
            "av1" in lower_err
            or "no decoder" in lower_err
            or "codec av1" in lower_err
        )
        no_video_stream = "does not contain any stream" in lower_err or "input file does not contain" in lower_err

        if no_video_stream:
            raise RuntimeError(
                "영상 파일에서 비디오 스트림을 찾을 수 없습니다. 파일이 손상되었거나 영상이 포함되어 있지 않습니다."
            )

        if attempt == 0 and needs_av1_fallback:
            if av is None:
                raise RuntimeError(
                    "AV1 코덱을 디코드할 수 없습니다. 'av' 패키지가 설치되어 있어야 합니다."
                ) from AV_IMPORT_ERROR
            alt_source = source_path.parent / f"{source_path.stem}_h264.mp4"
            try:
                _transcode_with_av(source_path, alt_source)
            except Exception as exc:  # pragma: no cover - propagate detailed error
                raise RuntimeError(str(exc)) from exc
            effective_source = alt_source
            continue

        raise RuntimeError(stderr)

    raise RuntimeError("트리밍 과정에서 알 수 없는 오류가 발생했습니다.")


def _create_tracker() -> cv2.Tracker:
    if cv2 is None:  # pragma: no cover - depends on optional dependency
        raise TrackerUnavailableError(
            "OpenCV (opencv-contrib-python) 패키지가 필요합니다."
        ) from CV2_IMPORT_ERROR
    if hasattr(cv2, "legacy") and hasattr(cv2.legacy, "TrackerCSRT_create"):
        return cv2.legacy.TrackerCSRT_create()
    if hasattr(cv2, "TrackerCSRT_create"):
        return cv2.TrackerCSRT_create()
    raise TrackerUnavailableError(
        "OpenCV CSRT tracker가 필요합니다. 'opencv-contrib-python' 패키지를 설치하세요."
    )


def _create_multitracker() -> cv2.MultiTracker:
    if cv2 is None:  # pragma: no cover - depends on optional dependency
        raise TrackerUnavailableError(
            "OpenCV (opencv-contrib-python) 패키지가 필요합니다."
        ) from CV2_IMPORT_ERROR
    if hasattr(cv2, "legacy") and hasattr(cv2.legacy, "MultiTracker_create"):
        return cv2.legacy.MultiTracker_create()
    if hasattr(cv2, "MultiTracker_create"):
        return cv2.MultiTracker_create()
    raise TrackerUnavailableError(
        "OpenCV MultiTracker가 필요합니다. 'opencv-contrib-python' 패키지를 설치하세요."
    )


def _build_mask(
    frame_shape: Tuple[int, int, int],
    boxes: Iterable[Tuple[float, float, float, float]],
    dilate_radius: int,
) -> np.ndarray:
    mask = np.zeros(frame_shape[:2], dtype=np.uint8)
    height, width = mask.shape

    for x, y, w, h in boxes:
        if w <= 0 or h <= 0:
            continue
        x0 = max(int(round(x)), 0)
        y0 = max(int(round(y)), 0)
        x1 = min(int(round(x + w)), width - 1)
        y1 = min(int(round(y + h)), height - 1)
        if x1 <= x0 or y1 <= y0:
            continue
        mask[y0:y1, x0:x1] = 255

    if dilate_radius > 0:
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (dilate_radius * 2 + 1, dilate_radius * 2 + 1)
        )
        mask = cv2.dilate(mask, kernel)
    return mask


def run_text_removal(config: RemovalConfig) -> None:
    """Execute the full tracking + inpainting loop."""

    try:
        from diffusers import StableDiffusionInpaintPipeline, AutoPipelineForInpainting
        import torch
    except ImportError as exc:  # pragma: no cover - runtime dependency check
        raise DiffusionUnavailableError(
            f"diffusers 및 torch 패키지가 설치되어 있어야 합니다. (추가 정보: {exc})"
        ) from exc

    boxes = list(config.boxes)
    if not boxes:
        raise ValueError("적어도 한 개 이상의 박스를 지정해야 합니다.")

    if cv2 is None:  # pragma: no cover - optional dependency check
        raise TrackerUnavailableError(
            "OpenCV (opencv-contrib-python) 패키지가 필요합니다."
        ) from CV2_IMPORT_ERROR

    video_path = Path(config.video_path)
    output_path = Path(config.output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"비디오 파일을 열 수 없습니다: {video_path}")

    ret, first_frame = cap.read()
    if not ret:
        cap.release()
        raise RuntimeError("첫 번째 프레임을 읽지 못했습니다.")

    frame_height, frame_width = first_frame.shape[:2]

    def _sanitize_roi(roi_tuple):
        x, y, w, h = [float(value) for value in roi_tuple]
        x0 = max(x, 0.0)
        y0 = max(y, 0.0)
        x1 = min(x0 + w, frame_width - 1.0)
        y1 = min(y0 + h, frame_height - 1.0)
        width = max(x1 - x0, 1.0)
        height = max(y1 - y0, 1.0)
        return x0, y0, width, height

    sanitized_boxes = []
    multi_tracker = _create_multitracker()
    for roi in boxes:
        roi_sanitized = tuple(_sanitize_roi(roi))
        multi_tracker.add(_create_tracker(), first_frame, roi_sanitized)
        sanitized_boxes.append(roi_sanitized)

    if not sanitized_boxes:
        cap.release()
        raise ValueError("적어도 한 개 이상의 유효한 박스를 지정해야 합니다.")

    boxes = sanitized_boxes

    fps = config.fps_override or cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    fourcc = cv2.VideoWriter_fourcc(*config.codec)
    writer = cv2.VideoWriter(str(output_path), fourcc, float(fps), (width, height))
    if not writer.isOpened():
        cap.release()
        raise RuntimeError("VideoWriter 초기화에 실패했습니다. codec/FPS 설정을 확인하세요.")

    requested_device = (config.device or "cuda").lower()
    has_cuda = torch.cuda.is_available()
    if requested_device.startswith("cuda") and not has_cuda:
        torch_device = "cpu"
    else:
        torch_device = requested_device

    if config.dtype == "float16" and torch_device.startswith("cuda"):
        torch_dtype = torch.float16
    else:
        torch_dtype = torch.float32

    # Kandinsky 모델은 AutoPipelineForInpainting 사용
    if "kandinsky" in config.model_id.lower():
        pipe = AutoPipelineForInpainting.from_pretrained(
            config.model_id,
            torch_dtype=torch_dtype,
        )
    else:
        pipe = StableDiffusionInpaintPipeline.from_pretrained(
            config.model_id,
            torch_dtype=torch_dtype,
            safety_checker=None,
            feature_extractor=None,
            low_cpu_mem_usage=False,
        )
        if hasattr(pipe, "safety_checker"):
            pipe.safety_checker = None
        if hasattr(pipe, "feature_extractor"):
            pipe.feature_extractor = None

    pipe = pipe.to(torch_device)
    pipe.enable_attention_slicing()
    if pipe.device.type == "cuda":  # pragma: no branch - optional path
        try:
            pipe.enable_xformers_memory_efficient_attention()
        except Exception:  # pragma: no cover - optional optimisation
            pass

    generator = torch.Generator(device=pipe.device)
    if config.seed is not None:
        generator = generator.manual_seed(int(config.seed))

    frame_index = 0
    current_frame = first_frame
    tracked_boxes = np.array(boxes, dtype=np.float32)

    try:
        while True:
            if config.max_frames is not None and frame_index >= config.max_frames:
                break

            if frame_index == 0:
                tracked_boxes = np.array(boxes, dtype=np.float32)
            else:
                ok, updated_boxes = multi_tracker.update(current_frame)
                if ok:
                    tracked_boxes = np.array(updated_boxes, dtype=np.float32)

            mask = _build_mask(current_frame.shape, tracked_boxes, config.dilate_radius)
            mask_pil = Image.fromarray(mask).convert("L")
            frame_pil = Image.fromarray(cv2.cvtColor(current_frame, cv2.COLOR_BGR2RGB))

            result = pipe(
                prompt=config.prompt,
                negative_prompt=config.negative_prompt,
                image=frame_pil,
                mask_image=mask_pil,
                guidance_scale=config.guidance_scale,
                num_inference_steps=config.num_inference_steps,
                strength=config.strength,
                generator=generator,
            ).images[0]

            restored = cv2.cvtColor(np.array(result), cv2.COLOR_RGB2BGR)

            # Stable Diffusion can occasionally emit non-uint8 or resized frames;
            # normalise them before handing off to the video writer.
            if restored.dtype != np.uint8:
                restored = np.clip(restored, 0, 255).astype(np.uint8)

            if restored.ndim == 2:  # grayscale -> colour
                restored = cv2.cvtColor(restored, cv2.COLOR_GRAY2BGR)
            elif restored.ndim == 3 and restored.shape[2] > 3:
                restored = restored[:, :, :3]

            expected_width = width or current_frame.shape[1]
            expected_height = height or current_frame.shape[0]
            if restored.shape[1] != expected_width or restored.shape[0] != expected_height:
                restored = cv2.resize(
                    restored,
                    (int(expected_width), int(expected_height)),
                    interpolation=cv2.INTER_LANCZOS4,
                )

            writer.write(np.ascontiguousarray(restored))

            ret, next_frame = cap.read()
            if not ret:
                break

            current_frame = next_frame
            frame_index += 1
    finally:
        cap.release()
        writer.release()


def extract_first_frame(video_path: Path) -> Optional[Tuple[np.ndarray, float, int, int, int]]:
    """Read the first frame and basic metadata from a video file."""

    if cv2 is None:  # pragma: no cover - optional dependency check handled earlier
        return None

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        cap.release()
        return None

    try:
        ret, frame = cap.read()
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    finally:
        cap.release()

    if not ret:
        return None

    return frame, fps, frame_count, width, height


def _transcode_with_av(video_path: Path, output_path: Path) -> None:
    """Transcode the given video into H.264 using PyAV."""

    if av is None:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "AV1 디코더가 포함된 ffmpeg 또는 PyAV(av 패키지)가 필요합니다. 'pip install av' 후 다시 시도하세요."
        ) from AV_IMPORT_ERROR

    try:
        with av.open(str(video_path)) as input_container:
            video_stream = next(
                (stream for stream in input_container.streams if stream.type == "video"), None
            )
            if video_stream is None:
                raise RuntimeError("비디오 스트림을 찾지 못했습니다.")

            rate = None
            if video_stream.average_rate:
                rate = Fraction(video_stream.average_rate)
            elif video_stream.codec_context and video_stream.codec_context.framerate:
                rate = Fraction(video_stream.codec_context.framerate)
            elif video_stream.time_base and video_stream.time_base.denominator:
                rate = Fraction(video_stream.time_base.denominator, video_stream.time_base.numerator)
            else:
                rate = Fraction(30, 1)

            width = int(video_stream.codec_context.width or getattr(video_stream, "width", 0) or 0)
            height = int(video_stream.codec_context.height or getattr(video_stream, "height", 0) or 0)
            if width <= 0 or height <= 0:
                raise RuntimeError("영상의 가로·세로 크기를 확인하지 못했습니다.")

            output_path.parent.mkdir(parents=True, exist_ok=True)
            if output_path.exists():
                output_path.unlink()

            with av.open(str(output_path), mode="w") as output_container:
                out_stream = output_container.add_stream("libx264", rate=rate)
                out_stream.pix_fmt = "yuv420p"
                out_stream.width = width
                out_stream.height = height
                if video_stream.time_base:
                    out_stream.time_base = video_stream.time_base

                for frame in input_container.decode(video_stream):
                    frame = frame.reformat(out_stream.width, out_stream.height, format="yuv420p")
                    for packet in out_stream.encode(frame):
                        output_container.mux(packet)

                for packet in out_stream.encode():
                    output_container.mux(packet)
    except PyAVError as exc:  # pragma: no cover - runtime decode failure
        raise RuntimeError(f"PyAV 변환에 실패했습니다: {exc}") from exc
    except Exception as exc:  # pragma: no cover - guarded for unexpected runtime errors
        raise RuntimeError(f"PyAV 변환 중 오류가 발생했습니다: {exc}") from exc


def run_background_fill(config: BackgroundFillConfig) -> None:
    """Fill masked regions using OpenCV inpaint for a fast background cover."""

    if cv2 is None:  # pragma: no cover - optional dependency check
        raise TrackerUnavailableError(
            "OpenCV (opencv-contrib-python) 패키지가 필요합니다."
        ) from CV2_IMPORT_ERROR

    video_path = Path(config.video_path)
    output_path = Path(config.output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"비디오 파일을 열 수 없습니다: {video_path}")

    try:
        fps = float(config.fps_override or cap.get(cv2.CAP_PROP_FPS) or 30.0)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if width <= 0 or height <= 0:
            raise RuntimeError("영상 해상도를 확인하지 못했습니다.")

        frame_shape = (height, width, 3)
        mask = _build_mask(frame_shape, config.boxes, max(int(config.dilate_radius), 0))
        if not np.any(mask):
            raise RuntimeError("가릴 영역이 올바르지 않습니다. 박스 좌표를 확인하세요.")

        fourcc = cv2.VideoWriter_fourcc(*config.codec)
        writer = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))
        if not writer.isOpened():
            raise RuntimeError("출력 비디오를 생성하지 못했습니다. codec/FPS 설정을 확인하세요.")

        try:
            frame_index = 0
            while True:
                if config.max_frames is not None and frame_index >= config.max_frames:
                    break
                ret, frame = cap.read()
                if not ret:
                    break
                inpainted = cv2.inpaint(frame, mask, 3, cv2.INPAINT_TELEA)
                writer.write(inpainted)
                frame_index += 1
        finally:
            writer.release()
    finally:
        cap.release()


def split_media_components(video_path: Path, session_dir: Path) -> Dict[str, Path]:
    """Split audio, muted video, and subtitles from the source video if available."""

    outputs: Dict[str, Path] = {}

    if not video_path.exists():
        raise RuntimeError(f"영상 파일을 찾을 수 없습니다: {video_path}")

    session_dir.mkdir(parents=True, exist_ok=True)

    audio_m4a = session_dir / "audio_track.m4a"
    audio_wav = session_dir / "audio_track.wav"
    video_only = session_dir / "video_without_audio.mp4"
    subtitles_srt = session_dir / "subtitles.srt"

    def _run_ffmpeg(cmd: Sequence[str]) -> subprocess.CompletedProcess[str]:
        return subprocess.run(cmd, capture_output=True, text=True)

    # Extract audio (try copy first, fallback to PCM WAV)
    if audio_m4a.exists():
        audio_m4a.unlink()
    cmd_audio_copy = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-acodec",
        "copy",
        str(audio_m4a),
    ]
    proc_audio = _run_ffmpeg(cmd_audio_copy)
    if proc_audio.returncode == 0 and audio_m4a.exists():
        outputs["audio"] = audio_m4a
    else:
        if audio_m4a.exists():
            audio_m4a.unlink()
        if audio_wav.exists():
            audio_wav.unlink()
        cmd_audio_wav = [
            "ffmpeg",
            "-y",
            "-i",
            str(video_path),
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "44100",
            str(audio_wav),
        ]
        proc_audio = _run_ffmpeg(cmd_audio_wav)
        if proc_audio.returncode == 0 and audio_wav.exists():
            outputs["audio"] = audio_wav

    # Extract video without audio
    if video_only.exists():
        video_only.unlink()
    cmd_video = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-an",
        "-c:v",
        "copy",
        str(video_only),
    ]
    proc_video = _run_ffmpeg(cmd_video)
    if proc_video.returncode == 0 and video_only.exists():
        outputs["video"] = video_only

    # Extract first subtitle track if present
    if subtitles_srt.exists():
        subtitles_srt.unlink()
    cmd_sub = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-map",
        "0:s:0",
        str(subtitles_srt),
    ]
    proc_sub = _run_ffmpeg(cmd_sub)
    if proc_sub.returncode == 0 and subtitles_srt.exists():
        outputs["subtitle"] = subtitles_srt
    elif subtitles_srt.exists():
        subtitles_srt.unlink()

    if not outputs:
        raise RuntimeError("분리 가능한 음성, 영상, 자막 트랙을 찾지 못했습니다.")

    return outputs


def prepare_video_preview(video_path: Path, session_dir: Path) -> Tuple[np.ndarray, float, int, int, int, Path, Path]:
    """Return the preview frame and metadata, transcoding to H.264 if needed."""

    if cv2 is None:  # pragma: no cover - upstream should guard this case
        raise TrackerUnavailableError(
            "OpenCV (opencv-contrib-python) 패키지가 필요합니다."
        ) from CV2_IMPORT_ERROR

    result = extract_first_frame(video_path)
    if result is not None:
        frame, fps, frame_count, width, height = result
        return frame, fps, frame_count, width, height, video_path, video_path

    transcoded_path = session_dir / "input_h264.mp4"
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        str(transcoded_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0 or not transcoded_path.exists() or transcoded_path.stat().st_size == 0:
        stderr = proc.stderr.strip() or proc.stdout.strip() or "ffmpeg 변환에 실패했습니다."
        lower_err = stderr.lower()
        needs_av1 = "av1" in lower_err or "libdav1d" in lower_err or "libaom" in lower_err
        no_stream = "does not contain any stream" in lower_err or "input file does not contain" in lower_err
        if transcoded_path.exists() and transcoded_path.stat().st_size == 0:
            transcoded_path.unlink()
        if no_stream:
            raise RuntimeError(
                "영상 파일에서 비디오 스트림을 찾을 수 없습니다. 파일이 손상되었거나 영상이 포함되어 있지 않습니다."
            )
        if needs_av1:
            try:
                _transcode_with_av(video_path, transcoded_path)
            except RuntimeError as av_exc:
                raise RuntimeError(str(av_exc)) from av_exc
        else:
            raise RuntimeError(stderr)

    result = extract_first_frame(transcoded_path)
    if result is None:
        raise RuntimeError("영상 첫 프레임을 읽지 못했습니다. 변환 후에도 실패했습니다.")

    frame, fps, frame_count, width, height = result
    return frame, fps, frame_count, width, height, video_path, transcoded_path
