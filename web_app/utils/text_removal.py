"""Utilities for video text removal using Stable Diffusion inpainting."""
from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional, Sequence, Tuple

import numpy as np
from PIL import Image

try:  # pragma: no cover - optional dependency check
    import cv2
    CV2_IMPORT_ERROR: Optional[Exception] = None
except ImportError as exc:  # pragma: no cover - handled at runtime
    cv2 = None  # type: ignore[assignment]
    CV2_IMPORT_ERROR = exc


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


class TrackerUnavailableError(RuntimeError):
    """Raised when the OpenCV tracker API is missing."""


class DiffusionUnavailableError(RuntimeError):
    """Raised when diffusers/torch dependencies are missing."""


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
        from diffusers import StableDiffusionInpaintPipeline
        import torch
    except ImportError as exc:  # pragma: no cover - runtime dependency check
        raise DiffusionUnavailableError(
            "diffusers 및 torch 패키지가 설치되어 있어야 합니다."
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

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"비디오 파일을 열 수 없습니다: {video_path}")

    ret, first_frame = cap.read()
    if not ret:
        cap.release()
        raise RuntimeError("첫 번째 프레임을 읽지 못했습니다.")

    multi_tracker = _create_multitracker()
    for roi in boxes:
        multi_tracker.add(_create_tracker(), first_frame, tuple(map(float, roi)))

    fps = config.fps_override or cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    fourcc = cv2.VideoWriter_fourcc(*config.codec)
    writer = cv2.VideoWriter(str(output_path), fourcc, float(fps), (width, height))
    if not writer.isOpened():
        cap.release()
        raise RuntimeError("VideoWriter 초기화에 실패했습니다. codec/FPS 설정을 확인하세요.")

    torch_device = config.device or "cuda"
    torch_dtype = (
        torch.float16
        if config.dtype == "float16" and torch_device.startswith("cuda")
        else torch.float32
    )

    pipe = StableDiffusionInpaintPipeline.from_pretrained(
        config.model_id,
        torch_dtype=torch_dtype,
    )
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
            writer.write(restored)

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
    if proc.returncode != 0:
        stderr = proc.stderr.strip() or proc.stdout.strip() or "ffmpeg 변환에 실패했습니다."
        if "Decoder (codec av1) not found" in stderr or "Unknown decoder 'libdav1d'" in stderr:
            raise RuntimeError(
                "이 ffmpeg 빌드는 AV1 영상을 디코딩할 수 없습니다. AV1 지원이 포함된 ffmpeg(예: conda-forge ffmpeg>=5 또는 독립 실행형 ffmpeg 6.x)를 설치한 뒤 다시 시도하세요."
            )
        raise RuntimeError(stderr)

    result = extract_first_frame(transcoded_path)
    if result is None:
        raise RuntimeError("영상 첫 프레임을 읽지 못했습니다. 변환 후에도 실패했습니다.")

    frame, fps, frame_count, width, height = result
    return frame, fps, frame_count, width, height, video_path, transcoded_path
