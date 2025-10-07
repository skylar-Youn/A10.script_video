#!/usr/bin/env python3
"""Utility for removing fixed-position text overlays from a video via inpainting.

Usage examples:
    python scripts/remove_text_from_video.py --input input.mp4 --output output.mp4 --region @120,420,250,70
    python scripts/remove_text_from_video.py --config configs/remove_text.json --overwrite

Region spec syntax:
    [start-end@]x,y,width,height[:radius][:method][:dilation]

    start/end  Seconds (floats). Use an empty value before or after '-' to indicate the
               beginning or end of the clip (e.g. "-5" means the first 5 seconds,
               "3-" means from 3 seconds to the end). When the time portion is omitted,
               the region is applied across the full clip.
    radius     Inpainting radius in pixels (default: 3).
    method     Either "telea" (default) or "ns".
    dilation   Optional mask dilation radius in pixels to slightly expand the area.

Config file format (JSON):
{
    "input": "input.mp4",
    "output": "cleaned.mp4",
    "regions": [
        {"start": 0.0, "end": 5.0, "x": 120, "y": 420, "width": 250, "height": 70,
         "radius": 4, "method": "telea", "dilation": 2}
    ]
}
"""

from __future__ import annotations

import argparse
import json
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple

import cv2
import numpy as np


@dataclass
class Region:
    start: float = 0.0
    end: Optional[float] = None
    x: int = 0
    y: int = 0
    width: int = 0
    height: int = 0
    radius: float = 3.0
    method: str = "telea"
    dilation: int = 0

    def applies(self, timestamp: float) -> bool:
        if timestamp < self.start:
            return False
        if self.end is not None and timestamp > self.end:
            return False
        return True

    def bounds(self, frame_width: int, frame_height: int) -> Optional[Tuple[int, int, int, int]]:
        x1 = max(0, min(frame_width, self.x))
        y1 = max(0, min(frame_height, self.y))
        x2 = max(0, min(frame_width, self.x + self.width))
        y2 = max(0, min(frame_height, self.y + self.height))
        if x2 <= x1 or y2 <= y1:
            return None
        return x1, y1, x2, y2

    def cv_method(self) -> int:
        if self.method.lower() == "ns":
            return cv2.INPAINT_NS
        return cv2.INPAINT_TELEA


class ConfigurationError(Exception):
    pass


def parse_region_spec(raw: str) -> Region:
    time_part = ""
    coord_part = raw
    if "@" in raw:
        time_part, coord_part = raw.split("@", 1)
    time_part = time_part.strip()
    coord_part = coord_part.strip()

    start = 0.0
    end: Optional[float] = None
    if time_part:
        if "-" not in time_part:
            raise ConfigurationError(
                f"Invalid time window '{time_part}'. Expected 'start-end' or '-end' or 'start-'."
            )
        start_str, end_str = time_part.split("-", 1)
        start = float(start_str) if start_str else 0.0
        end = float(end_str) if end_str else None
        if end is not None and end < start:
            raise ConfigurationError(f"End time {end} must be >= start time {start} in '{raw}'.")

    tokens = coord_part.split(":")
    if not tokens or not tokens[0]:
        raise ConfigurationError(f"Missing coordinate section in region spec '{raw}'.")

    xywh = tokens[0]
    try:
        x_str, y_str, w_str, h_str = xywh.split(",")
        x = int(x_str)
        y = int(y_str)
        width = int(w_str)
        height = int(h_str)
        if width <= 0 or height <= 0:
            raise ValueError
    except ValueError as err:
        raise ConfigurationError(
            f"Invalid coordinate specification '{xywh}'. Expected four integers x,y,width,height."
        ) from err

    radius = 3.0
    method = "telea"
    dilation = 0

    if len(tokens) > 1 and tokens[1]:
        try:
            radius = float(tokens[1])
            if radius <= 0:
                raise ValueError
        except ValueError as err:
            raise ConfigurationError(
                f"Radius in region '{raw}' must be a positive number."
            ) from err
    if len(tokens) > 2 and tokens[2]:
        method = tokens[2].strip().lower()
        if method not in {"telea", "ns"}:
            raise ConfigurationError(
                f"Unsupported method '{method}' in '{raw}'. Use 'telea' or 'ns'."
            )
    if len(tokens) > 3 and tokens[3]:
        try:
            dilation = int(tokens[3])
            if dilation < 0:
                raise ValueError
        except ValueError as err:
            raise ConfigurationError(
                f"Dilation in region '{raw}' must be a non-negative integer."
            ) from err

    return Region(
        start=start,
        end=end,
        x=x,
        y=y,
        width=width,
        height=height,
        radius=radius,
        method=method,
        dilation=dilation,
    )


def load_config(path: Path) -> Tuple[Optional[str], Optional[str], List[Region]]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except json.JSONDecodeError as err:
        raise ConfigurationError(f"Failed to parse JSON config '{path}': {err}")

    input_path = data.get("input")
    output_path = data.get("output")

    raw_regions = data.get("regions")
    if raw_regions is None:
        raise ConfigurationError("Config file must include a 'regions' list.")

    regions: List[Region] = []
    for idx, raw_region in enumerate(raw_regions):
        try:
            region = Region(
                start=float(raw_region.get("start", 0.0)),
                end=(
                    float(raw_region["end"])
                    if raw_region.get("end") is not None
                    else None
                ),
                x=int(raw_region["x"]),
                y=int(raw_region["y"]),
                width=int(raw_region["width"]),
                height=int(raw_region["height"]),
                radius=float(raw_region.get("radius", 3.0)),
                method=str(raw_region.get("method", "telea")),
                dilation=int(raw_region.get("dilation", 0)),
            )
        except KeyError as err:
            raise ConfigurationError(
                f"Region entry #{idx} is missing required key {err}."
            ) from err
        except ValueError as err:
            raise ConfigurationError(
                f"Region entry #{idx} contains invalid numeric values: {err}."
            ) from err

        if region.end is not None and region.end < region.start:
            raise ConfigurationError(
                f"Region entry #{idx} has end < start ({region.end} < {region.start})."
            )
        if region.method.lower() not in {"telea", "ns"}:
            raise ConfigurationError(
                f"Region entry #{idx} uses unsupported method '{region.method}'."
            )
        if region.width <= 0 or region.height <= 0:
            raise ConfigurationError(
                f"Region entry #{idx} must have positive width/height."
            )
        if region.radius <= 0:
            raise ConfigurationError(
                f"Region entry #{idx} must have radius > 0."
            )
        if region.dilation < 0:
            raise ConfigurationError(
                f"Region entry #{idx} must have dilation >= 0."
            )

        regions.append(region)

    return input_path, output_path, regions


def build_region_mask(
    frame_shape: Tuple[int, int, int],
    region: Region,
) -> Optional[np.ndarray]:
    height, width = frame_shape[:2]
    bounds = region.bounds(width, height)
    if bounds is None:
        return None

    x1, y1, x2, y2 = bounds
    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.rectangle(mask, (x1, y1), (x2 - 1, y2 - 1), 255, thickness=-1)

    if region.dilation > 0:
        kernel_size = region.dilation * 2 + 1
        kernel = np.ones((kernel_size, kernel_size), dtype=np.uint8)
        mask = cv2.dilate(mask, kernel, iterations=1)

    return mask


def inpaint_frame(frame: np.ndarray, regions: Sequence[Region]) -> np.ndarray:
    result = frame
    for region in regions:
        mask = build_region_mask(result.shape, region)
        if mask is None:
            continue
        method_flag = region.cv_method()
        radius = float(region.radius)
        result = cv2.inpaint(result, mask, radius, method_flag)
    return result


def select_fourcc(output_path: Path) -> int:
    suffix = output_path.suffix.lower()
    if suffix in {".avi"}:
        return cv2.VideoWriter_fourcc(*"XVID")
    if suffix in {".mov", ".m4v", ".mp4"}:
        return cv2.VideoWriter_fourcc(*"mp4v")
    return cv2.VideoWriter_fourcc(*"mp4v")


def process_video(input_path: Path, output_path: Path, regions: Sequence[Region], overwrite: bool) -> None:
    if not input_path.exists():
        raise FileNotFoundError(f"Input video not found: {input_path}")
    if output_path.exists() and not overwrite:
        raise FileExistsError(
            f"Output file {output_path} already exists. Pass --overwrite to replace it."
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)

    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        raise RuntimeError(f"Could not open input video '{input_path}'.")

    fps = capture.get(cv2.CAP_PROP_FPS) or 0.0
    if fps <= 0:
        fps = 30.0

    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_size = (width, height)

    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    total_frames = total_frames if total_frames > 0 else None

    writer = cv2.VideoWriter(
        str(output_path),
        select_fourcc(output_path),
        fps,
        frame_size,
    )
    if not writer.isOpened():
        capture.release()
        raise RuntimeError(f"Failed to create output video '{output_path}'.")

    frame_index = 0
    try:
        while True:
            success, frame = capture.read()
            if not success:
                break

            timestamp = frame_index / fps if fps else 0.0
            active_regions = [region for region in regions if region.applies(timestamp)]

            if active_regions:
                frame = inpaint_frame(frame, active_regions)

            writer.write(frame)
            frame_index += 1

            if frame_index % max(1, int(fps)) == 0:
                _print_progress(frame_index, total_frames)
    finally:
        capture.release()
        writer.release()

    _print_progress(frame_index, total_frames, final=True)


def _print_progress(frame_index: int, total_frames: Optional[int], final: bool = False) -> None:
    if total_frames:
        pct = min(100.0, (frame_index / total_frames) * 100.0)
        message = f"Processed {frame_index}/{total_frames} frames ({pct:5.1f}%)."
    else:
        message = f"Processed {frame_index} frames."
    if final:
        print(message)
    else:
        print(message, end="\r", flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Remove static text overlays from a video using OpenCV inpainting.",
    )
    parser.add_argument("--input", "-i", type=str, help="Path to input video.")
    parser.add_argument("--output", "-o", type=str, help="Path to write the cleaned video.")
    parser.add_argument(
        "--region",
        "-r",
        action="append",
        default=[],
        help="Region specification (can be provided multiple times).",
    )
    parser.add_argument(
        "--config",
        "-c",
        type=str,
        help="Optional JSON config containing input/output/regions definitions.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Allow overwriting the output file if it already exists.",
    )
    return parser.parse_args()


def merge_regions(config_regions: Iterable[Region], cli_regions: Iterable[Region]) -> List[Region]:
    regions = list(config_regions) if config_regions else []
    regions.extend(cli_regions)
    return regions


def main() -> None:
    args = parse_args()

    config_input = None
    config_output = None
    config_regions: List[Region] = []
    if args.config:
        config_path = Path(args.config)
        if not config_path.exists():
            raise FileNotFoundError(f"Config file not found: {config_path}")
        config_input, config_output, config_regions = load_config(config_path)

    cli_regions = [parse_region_spec(raw) for raw in args.region]

    input_path_str = args.input or config_input
    output_path_str = args.output or config_output

    if not input_path_str or not output_path_str:
        raise ConfigurationError("Input and output paths must be supplied via CLI or config file.")

    regions = merge_regions(config_regions, cli_regions)
    if not regions:
        raise ConfigurationError("No regions specified. Use --region or provide them in the config file.")

    input_path = Path(input_path_str)
    output_path = Path(output_path_str)

    process_video(input_path, output_path, regions, overwrite=args.overwrite)


if __name__ == "__main__":
    main()
