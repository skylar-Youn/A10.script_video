#!/usr/bin/env python3
"""Shazam-only audio checker for YouTube videos."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Optional

import ytcopyrightinspector as inspector


def positive_float(value: str) -> float:
    try:
        v = float(value)
    except ValueError as exc:  # pragma: no cover - CLI guard
        raise argparse.ArgumentTypeError(str(exc)) from exc
    if v <= 0:
        raise argparse.ArgumentTypeError("value must be greater than zero")
    return v


def positive_int(value: str) -> int:
    try:
        v = int(value)
    except ValueError as exc:  # pragma: no cover - CLI guard
        raise argparse.ArgumentTypeError(str(exc)) from exc
    if v <= 0:
        raise argparse.ArgumentTypeError("value must be greater than zero")
    return v


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="Run Shazam-based audio-only copyright inspection.",
    )
    ap.add_argument("--video", required=True, help="Input video path")
    ap.add_argument(
        "--report-dir",
        default="./reports",
        help="Directory to save JSON summary (default: ./reports)",
    )
    ap.add_argument(
        "--export-frames",
        action="store_true",
        help="Export representative frames for manual Google Lens/Yandex search",
    )
    ap.add_argument(
        "--frame-export-dir",
        default=None,
        help="Directory to save exported frames (default: <report>/<video>_frames)",
    )
    ap.add_argument(
        "--frame-export-fps",
        type=positive_float,
        default=0.2,

        help="Frame sampling fps for export (default: 0.2 ~= every 5s)",
    )
    ap.add_argument(
        "--frame-export-max",
        type=positive_int,
        default=40,
        help="Maximum frames to export (default: 40)",
    )
    ap.add_argument(
        "--no-progress",
        action="store_true",
        help="Disable progress bars",
    )
    return ap.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)

    video_path = Path(args.video).expanduser().resolve()
    if not video_path.exists():
        print(f"Video not found: {video_path}")
        return 1

    report_dir = Path(args.report_dir).expanduser().resolve()
    frame_dir = (
        Path(args.frame_export_dir).expanduser().resolve()
        if args.frame_export_dir
        else None
    )

    payload = inspector.run_precheck(
        video_path,
        reference_dir=None,
        fps=1.0,
        hash_name="phash",
        hamming_th=12,
        resize=(256, 256),
        max_frames=None,
        high_th=0.30,
        med_th=0.15,
        audio_only=True,
        video_backend="imagehash",
        audio_provider="shazam",
        export_frames=args.export_frames,
        frame_export_dir=frame_dir,
        frame_export_fps=args.frame_export_fps,
        frame_export_max=args.frame_export_max,
        report_dir=report_dir,
        show_progress=not args.no_progress,
    )

    result = payload["result"]
    audio = result.get("audio", {})

    print("\n==== Audio-Only Summary ====")
    print(f"Video: {video_path.name}")
    if audio.get("hit"):
        title = audio.get("title")
        artists = audio.get("artists")
        print(f"- Match: HIT via Shazam")
        if title or artists:
            print(f"- Track: {title or 'Unknown'} — {artists or 'Unknown'}")
        score = audio.get("score")
        if score is not None:
            print(f"- Confidence: {score}")
    else:
        print("- Match: None detected (Shazam)")
        if audio.get("error"):
            print(f"- Error: {audio['error']}")

    frame_meta = result.get("frame_export", {})
    if frame_meta.get("enabled"):
        if frame_meta.get("count"):
            print(f"- Exported frames: {frame_meta['count']} saved to {frame_meta.get('directory')}")
        elif frame_meta.get("error"):
            print(f"- Frame export error: {frame_meta['error']}")

    report_json = payload.get("report_json")
    if report_json:
        print(f"- JSON report: {report_json}")
    wav_tmp = payload.get("temp_audio")
    if wav_tmp:
        print(f"- Temp audio: {wav_tmp}")
    print("============================\n")

    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
