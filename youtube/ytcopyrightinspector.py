#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import asyncio
import os
import sys
import json
import csv
import time
import base64
import hmac
import hashlib
import argparse
import subprocess
from contextlib import suppress
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional

import cv2
import numpy as np
from PIL import Image
import imagehash
import requests
from tqdm import tqdm

try:
    from videohash import VideoHash  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    VideoHash = None

try:
    from shazamio import Shazam  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    Shazam = None

# ----------------------------
# Utility
# ----------------------------
def ensure_dir(p: Path):
    p.mkdir(parents=True, exist_ok=True)

def run_ffmpeg_extract_audio(video_path: Path, out_wav: Path, sr: int = 16000) -> bool:
    """Extract mono WAV audio using ffmpeg CLI."""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vn",
        "-acodec", "pcm_s16le",
        "-ac", "1",
        "-ar", str(sr),
        str(out_wav),
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return out_wav.exists() and out_wav.stat().st_size > 0
    except Exception as e:
        print(f"[ffmpeg] audio extraction failed: {e}")
        return False

def hamming_distance(hash1: imagehash.ImageHash, hash2: imagehash.ImageHash) -> int:
    return hash1 - hash2

# ----------------------------
# Video pHash Fingerprinting
# ----------------------------
def video_phashes(video_path: Path, fps: float = 1.0,
                  hash_func=imagehash.phash,
                  resize=(256, 256),
                  max_frames=None,
                  show_progress: bool = True) -> List[str]:
    """Sample frames at target fps, compute perceptual hash per frame."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    orig_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_interval = max(1, int(round(orig_fps / max(fps, 0.0001))))
    hashes: List[str] = []

    idx = 0
    taken = 0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    with tqdm(total=total_frames,
              desc=f"pHash {video_path.name}",
              unit="f",
              disable=(not show_progress)) as pbar:
        while True:
            ret, frame = cap.read()
            if not ret: break
            if idx % frame_interval == 0:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pil = Image.fromarray(rgb).resize(resize, Image.LANCZOS)
                h = hash_func(pil)
                hashes.append(h.__str__())
                taken += 1
                if max_frames and taken >= max_frames:
                    break
            idx += 1
            pbar.update(1)
    cap.release()
    return hashes


def export_frames_for_search(
    video_path: Path,
    out_dir: Path,
    fps: float,
    max_frames: Optional[int] = None,
    show_progress: bool = True,
) -> List[str]:
    """Export representative frames to disk to aid manual reverse searches."""
    ensure_dir(out_dir)
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    video_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, int(round(video_fps / max(fps, 1e-6))))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

    exported: List[str] = []
    idx = 0
    taken = 0

    with tqdm(total=total_frames,
              desc=f"frames {video_path.name}",
              unit="f",
              disable=(not show_progress)) as pbar:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if idx % step == 0:
                name = f"frame_{idx:06d}.jpg"
                out_path = out_dir / name
                cv2.imwrite(str(out_path), frame)
                exported.append(str(out_path))
                taken += 1
                if max_frames and taken >= max_frames:
                    break
            idx += 1
            pbar.update(1)

    cap.release()
    return exported

def compare_hash_sets(hashes_a: List[str], hashes_b: List[str], hamming_th: int = 12) -> Tuple[float, Dict[str, Any]]:
    """Approximate set similarity based on near-duplicate hash matches."""
    if not hashes_a or not hashes_b:
        return 0.0, {"matches": 0, "pairs": []}

    a_objs = [imagehash.hex_to_hash(h) for h in hashes_a]
    b_objs = [imagehash.hex_to_hash(h) for h in hashes_b]

    matched_a = set()
    matched_b = set()
    pairs = []

    for i, ha in enumerate(a_objs):
        best_j, best_d = None, 1e9
        for j, hb in enumerate(b_objs):
            d = hamming_distance(ha, hb)
            if d < best_d:
                best_d, best_j = d, j
        if best_d <= hamming_th:
            matched_a.add(i)
            matched_b.add(best_j)
            pairs.append((i, best_j, int(best_d)))

    match_ratio = (len(matched_a) + len(matched_b)) / (len(a_objs) + len(b_objs))
    details = {"matches": len(pairs), "pairs": pairs,
               "matched_a": len(matched_a), "matched_b": len(matched_b)}
    return match_ratio, details


def video_videohash(
    video_path: Path,
    fps: float,
    storage_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """Compute VideoHash fingerprint; requires optional videohash package."""
    if VideoHash is None:
        raise RuntimeError("videohash package not installed; run `pip install videohash`.")

    storage_arg = None
    if storage_dir is not None:
        ensure_dir(storage_dir)
        storage_arg = str(storage_dir)

    frame_interval = max(fps, 1e-3)
    vh = VideoHash(path=str(video_path), frame_interval=frame_interval, storage_path=storage_arg)
    info = {
        "hash": vh.hash,
        "hash_hex": vh.hash_hex,
        "video_duration": getattr(vh, "video_duration", None),
        "storage_path": getattr(vh, "storage_path", storage_arg),
    }
    with suppress(Exception):
        vh.delete_storage_path()
    return info


def videohash_similarity(hash_a: str, hash_b: str) -> Tuple[float, int]:
    """Compute similarity ratio and Hamming distance between two VideoHash bitstrings."""
    bits_a = hash_a[2:] if hash_a.startswith("0b") else hash_a
    bits_b = hash_b[2:] if hash_b.startswith("0b") else hash_b
    length = max(len(bits_a), len(bits_b))
    if length == 0:
        return 0.0, 0

    bits_a = bits_a.ljust(length, "0")
    bits_b = bits_b.ljust(length, "0")
    distance = sum(ch1 != ch2 for ch1, ch2 in zip(bits_a, bits_b))
    similarity = 1.0 - (distance / length)
    return similarity, distance

# ----------------------------
# ACRCloud Audio Recognition
# ----------------------------
def acrcloud_recognize(wav_path: Path,
                       host=None, access_key=None, access_secret=None,
                       timeout: int = 10) -> Dict[str, Any] | None:
    """Minimal ACRCloud recognition."""
    host = host or os.getenv("ACRCLOUD_HOST")
    access_key = access_key or os.getenv("ACRCLOUD_ACCESS_KEY")
    access_secret = access_secret or os.getenv("ACRCLOUD_ACCESS_SECRET")
    if not (host and access_key and access_secret):
        print("[ACRCloud] Missing credentials; skipping audio check.")
        return None

    url = f"https://{host}/v1/identify"
    http_method = "POST"
    http_uri = "/v1/identify"
    data_type = "audio"
    signature_version = "1"
    timestamp = str(int(time.time()))

    string_to_sign = "\n".join([http_method, http_uri, access_key, data_type, signature_version, timestamp])
    sign = base64.b64encode(
        hmac.new(access_secret.encode("utf-8"),
                 string_to_sign.encode("utf-8"),
                 digestmod=hashlib.sha1).digest()
    ).decode("utf-8")

    files = {"sample": (wav_path.name, open(wav_path, "rb"), "audio/wav")}
    data = {
        "access_key": access_key,
        "data_type": data_type,
        "signature_version": signature_version,
        "signature": sign,
        "sample_bytes": str(wav_path.stat().st_size),
        "timestamp": timestamp
    }

    try:
        r = requests.post(url, files=files, data=data, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[ACRCloud] request failed: {e}")
        return None

def parse_acr_result(res: Dict[str, Any] | None) -> Dict[str, Any]:
    out = {"hit": False, "title": None, "artists": None,
           "score": None, "acrid": None, "metadata_raw": res}
    if not res: return out
    try:
        status = res.get("status", {})
        if status.get("code") == 0:
            music = res.get("metadata", {}).get("music", [])
            if music:
                top = music[0]
                out["hit"] = True
                out["title"] = top.get("title")
                out["artists"] = ", ".join([a.get("name") for a in top.get("artists", []) if a.get("name")])
                out["score"] = top.get("score")
                out["acrid"] = top.get("acrid")
    except Exception:
        pass
    return out

# ----------------------------
# Shazam (Unofficial) Audio Recognition
# ----------------------------
def shazam_recognize(wav_path: Path, timeout: int = 30) -> Dict[str, Any] | None:
    """Recognize audio via the unofficial Shazam API wrapper."""
    if Shazam is None:
        print("[Shazam] shazamio not installed; skipping audio check.")
        return {"_error": "shazamio not installed"}

    async def _recognize() -> Dict[str, Any] | None:
        shazam = Shazam()
        try:
            return await asyncio.wait_for(shazam.recognize_song(str(wav_path)), timeout=timeout)
        except asyncio.TimeoutError:
            print("[Shazam] recognition timed out.")
            return {"_error": "timeout"}

    try:
        return asyncio.run(_recognize())
    except RuntimeError as exc:
        if "asyncio.run()" in str(exc):
            loop = asyncio.new_event_loop()
            try:
                asyncio.set_event_loop(loop)
                return loop.run_until_complete(_recognize())
            finally:
                asyncio.set_event_loop(None)
                loop.close()
        print(f"[Shazam] runtime error: {exc}")
        return {"_error": str(exc)}
    except Exception as exc:  # pragma: no cover - network failures are non-deterministic
        print(f"[Shazam] request failed: {exc}")
        return {"_error": str(exc)}
    return None


def parse_shazam_result(res: Dict[str, Any] | None) -> Dict[str, Any]:
    out = {"hit": False, "title": None, "artists": None,
           "score": None, "track_id": None, "metadata_raw": res,
           "error": None}
    if not res:
        return out

    if isinstance(res, dict) and res.get("_error"):
        out["error"] = res.get("_error")
        return out

    try:
        matches = res.get("matches") or []
        track = res.get("track") or {}
        if matches:
            out["hit"] = True
            out["score"] = matches[0].get("score")
        title = track.get("title")
        subtitle = track.get("subtitle")
        if title or subtitle:
            out["title"] = title
            out["artists"] = subtitle
            # Shazam sometimes omits matches when confidence is high but metadata exists.
            out["hit"] = out["hit"] or bool(title or subtitle)
        out["track_id"] = track.get("key") or track.get("hub", {}).get("trackid")
    except Exception:
        pass
    return out

# ----------------------------
# Reference DB build/compare
# ----------------------------
def build_reference_fingerprints(ref_dir: Path,
                                 fps: float,
                                 hfunc,
                                 resize: Tuple[int, int],
                                 max_frames=None,
                                 show_progress: bool = True) -> Dict[str, List[str]]:
    db = {}
    if not ref_dir.exists():
        print(f"[ref] directory not found: {ref_dir}")
        return db
    for p in sorted(ref_dir.rglob("*")):
        if p.suffix.lower() in {".mp4", ".mov", ".mkv", ".avi", ".webm"}:
            try:
                hashes = video_phashes(
                    p,
                    fps=fps,
                    hash_func=hfunc,
                    resize=resize,
                    max_frames=max_frames,
                    show_progress=show_progress,
                )
                db[p.name] = hashes
            except Exception as e:
                print(f"[ref] failed {p.name}: {e}")
    return db

# ----------------------------
# Risk scoring
# ----------------------------
def risk_level(audio_hit: bool, match_ratio: float, high_th: float, med_th: float) -> str:
    if audio_hit: return "HIGH"
    if match_ratio >= high_th: return "HIGH"
    if match_ratio >= med_th: return "MEDIUM"
    return "LOW"


# ----------------------------
# Programmatic entrypoint
# ----------------------------
def run_precheck(
    video_path: Path,
    reference_dir: Optional[Path] = None,
    *,
    fps: float = 1.0,
    hash_name: str = "phash",
    hamming_th: int = 12,
    resize: Tuple[int, int] = (256, 256),
    max_frames: Optional[int] = None,
    high_th: float = 0.30,
    med_th: float = 0.15,
    audio_only: bool = False,
    video_backend: str = "imagehash",
    audio_provider: str = "auto",
    export_frames: bool = False,
    frame_export_dir: Optional[Path] = None,
    frame_export_fps: float = 0.2,
    frame_export_max: Optional[int] = 40,
    report_dir: Optional[Path] = None,
    show_progress: bool = True,
) -> Dict[str, Any]:
    """Run the inspector logic and return results with metadata."""

    if fps <= 0:
        raise ValueError("fps must be greater than 0")
    if hamming_th < 0:
        raise ValueError("hamming_th must be non-negative")
    if high_th < 0 or med_th < 0:
        raise ValueError("risk thresholds must be non-negative")
    if len(resize) != 2:
        raise ValueError("resize must be a (width, height) tuple")
    if frame_export_fps <= 0:
        raise ValueError("frame_export_fps must be greater than 0")
    if frame_export_max is not None and frame_export_max <= 0:
        raise ValueError("frame_export_max must be positive when provided")
    audio_provider_opts = {"auto", "shazam", "acrcloud"}
    if audio_provider not in audio_provider_opts:
        raise ValueError(f"Unsupported audio_provider: {audio_provider}")

    video_backend_opts = {"imagehash", "videohash", "pyvideohash"}
    if video_backend not in video_backend_opts:
        raise ValueError(f"Unsupported video_backend: {video_backend}")
    normalized_backend = "videohash" if video_backend in {"videohash", "pyvideohash"} else video_backend
    if normalized_backend == "videohash" and VideoHash is None:
        raise RuntimeError("videohash backend requested but package not installed")

    video_backend = normalized_backend

    hash_funcs = {
        "phash": imagehash.phash,
        "ahash": imagehash.average_hash,
        "dhash": imagehash.dhash,
    }
    hfunc = None
    if normalized_backend == "imagehash":
        try:
            hfunc = hash_funcs[hash_name]
        except KeyError as exc:
            raise ValueError(f"Unsupported hash function: {hash_name}") from exc

    video_path = video_path.expanduser().resolve()
    if not video_path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    ref_dir: Optional[Path] = None
    if reference_dir is not None:
        ref_dir = reference_dir.expanduser().resolve()

    target_report_dir = (report_dir or Path("./reports")).expanduser().resolve()
    ensure_dir(target_report_dir)

    base = video_path.stem
    json_path = target_report_dir / f"{base}_report.json"
    csv_path = target_report_dir / f"{base}_matches.csv"
    tmp_wav = target_report_dir / f"{base}_mono16k.wav"
    export_target_dir: Optional[Path] = None
    if export_frames:
        export_target_dir = (frame_export_dir or (target_report_dir / f"{base}_frames")).expanduser().resolve()

    result: Dict[str, Any] = {
        "video": str(video_path),
        "audio": {},
        "video_hash": {},
        "reference_compare": {},
        "frame_export": {},
        "risk": "LOW",
        "params": {
            "video": str(video_path),
            "reference_dir": str(ref_dir) if ref_dir else None,
            "fps": fps,
            "hash": hash_name,
            "hamming_th": hamming_th,
            "resize": f"{resize[0]}x{resize[1]}",
            "max_frames": max_frames,
            "high_th": high_th,
            "med_th": med_th,
            "audio_only": audio_only,
            "video_backend": video_backend,
            "audio_provider": audio_provider,
            "export_frames": export_frames,
            "frame_export_dir": str(export_target_dir) if export_target_dir else None,
            "frame_export_fps": frame_export_fps,
            "frame_export_max": frame_export_max,
            "report_dir": str(target_report_dir),
        },
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    audio_hit = False
    ok = run_ffmpeg_extract_audio(video_path, tmp_wav, sr=16000)
    if ok:
        provider_order: List[str]
        if audio_provider == "acrcloud":
            provider_order = ["acrcloud"]
        elif audio_provider == "shazam":
            provider_order = ["shazam"]
        else:
            provider_order = ["shazam", "acrcloud"]

        provider_results: Dict[str, Dict[str, Any]] = {}
        best_provider: Optional[str] = None
        best_payload: Optional[Dict[str, Any]] = None

        for provider_name in provider_order:
            if provider_name == "acrcloud":
                raw = acrcloud_recognize(tmp_wav)
                parsed = parse_acr_result(raw)
                if raw is None:
                    parsed = {**parsed, "error": "ACRCloud credentials missing or request failed"}
                provider_results[provider_name] = parsed
            elif provider_name == "shazam":
                raw = shazam_recognize(tmp_wav)
                parsed = parse_shazam_result(raw)
                provider_results[provider_name] = parsed
            else:
                continue

            if best_payload is None:
                best_provider = provider_name
                best_payload = parsed

            if parsed.get("hit"):
                best_provider = provider_name
                best_payload = parsed
                audio_hit = True
                break

        if best_payload is None and provider_results:
            best_provider = next(iter(provider_results))
            best_payload = provider_results[best_provider]

        summary: Dict[str, Any] = {
            "provider": best_provider,
            "providers": provider_results,
            "provider_order": provider_order,
            "hit": bool(best_payload and best_payload.get("hit")),
            "title": best_payload.get("title") if best_payload else None,
            "artists": best_payload.get("artists") if best_payload else None,
            "score": best_payload.get("score") if best_payload else None,
        }
        if best_payload and "track_id" in best_payload:
            summary["track_id"] = best_payload.get("track_id")
        if best_payload and "acrid" in best_payload:
            summary["acrid"] = best_payload.get("acrid")
        if best_payload and best_payload.get("metadata_raw") is not None:
            summary["metadata_raw"] = best_payload.get("metadata_raw")
        if best_payload and best_payload.get("error"):
            summary["error"] = best_payload.get("error")
        result["audio"] = summary
        audio_hit = summary["hit"]
    else:
        result["audio"] = {"hit": False, "error": "ffmpeg extract failed"}

    match_ratio = 0.0
    hashes_in: List[str] = []
    videohash_info: Optional[Dict[str, Any]] = None
    video_hash_meta = result["video_hash"]
    video_hash_meta["backend"] = video_backend
    video_hash_meta["enabled"] = not audio_only

    if not audio_only:
        try:
            if video_backend == "imagehash":
                hashes_in = video_phashes(
                    video_path,
                    fps=fps,
                    hash_func=hfunc,
                    resize=resize,
                    max_frames=max_frames,
                    show_progress=show_progress,
                )
                video_hash_meta["frames"] = len(hashes_in)
            elif video_backend == "videohash":
                videohash_info = video_videohash(
                    video_path,
                    fps=fps,
                    storage_dir=None,
                )
                video_hash_meta.update({
                    "hash": videohash_info.get("hash"),
                    "hash_hex": videohash_info.get("hash_hex"),
                })
                if videohash_info.get("video_duration") is not None:
                    video_hash_meta["video_duration"] = videohash_info["video_duration"]
        except Exception as exc:  # pylint: disable=broad-except
            video_hash_meta["error"] = str(exc)

        if ref_dir:
            reference_compare: Dict[str, Any] = {"backend": video_backend}

            if video_backend == "imagehash" and hashes_in and hfunc:
                ref_db = build_reference_fingerprints(
                    ref_dir,
                    fps=fps,
                    hfunc=hfunc,
                    resize=resize,
                    max_frames=max_frames,
                    show_progress=show_progress,
                )
                rows = []
                best = {"ref": None, "ratio": 0.0}

                for ref_name, ref_hashes in ref_db.items():
                    ratio, det = compare_hash_sets(hashes_in, ref_hashes, hamming_th=hamming_th)
                    rows.append([
                        ref_name,
                        f"{ratio:.4f}",
                        det.get("matches", 0),
                        det.get("matched_a", 0),
                        det.get("matched_b", 0),
                    ])
                    if ratio > best["ratio"]:
                        best = {"ref": ref_name, "ratio": ratio}

                reference_compare["best_match"] = best
                reference_compare["total_refs"] = len(ref_db)

                if rows:
                    with open(csv_path, "w", newline="", encoding="utf-8") as f:
                        writer = csv.writer(f)
                        writer.writerow([
                            "reference_video",
                            "match_ratio",
                            "matched_pairs",
                            "matched_input_frames",
                            "matched_ref_frames",
                        ])
                        writer.writerows(rows)
                else:
                    if csv_path.exists():
                        csv_path.unlink()

                match_ratio = float(best["ratio"])

            elif video_backend == "videohash" and videohash_info and videohash_info.get("hash"):
                rows = []
                best = {"ref": None, "ratio": 0.0, "hamming": None}
                input_hash = videohash_info["hash"]
                processed = 0
                failed: List[Tuple[str, str]] = []

                for ref_path in sorted(ref_dir.rglob("*")):
                    if ref_path.suffix.lower() not in {".mp4", ".mov", ".mkv", ".avi", ".webm"}:
                        continue
                    processed += 1
                    try:
                        ref_info = video_videohash(ref_path, fps=fps, storage_dir=None)
                    except Exception as exc:  # pragma: no cover - file specific failures
                        failed.append((ref_path.name, str(exc)))
                        continue

                    similarity, distance = videohash_similarity(input_hash, ref_info.get("hash", ""))
                    rows.append([
                        ref_path.name,
                        f"{similarity:.4f}",
                        distance,
                        ref_info.get("hash_hex"),
                    ])
                    if similarity > best["ratio"]:
                        best = {"ref": ref_path.name, "ratio": similarity, "hamming": distance}

                reference_compare["best_match"] = best
                reference_compare["total_refs"] = processed
                if failed:
                    reference_compare["failures"] = failed

                if rows:
                    with open(csv_path, "w", newline="", encoding="utf-8") as f:
                        writer = csv.writer(f)
                        writer.writerow([
                            "reference_video",
                            "similarity",
                            "hamming_distance",
                            "hash_hex",
                        ])
                        writer.writerows(rows)
                else:
                    if csv_path.exists():
                        csv_path.unlink()

                match_ratio = float(best["ratio"])

            else:
                reference_compare["note"] = "Video hashing failed; no comparison performed."

            result["reference_compare"] = reference_compare
        else:
            result["reference_compare"] = {
                "note": "No reference_dir provided; only audio check performed.",
                "backend": video_backend,
            }
    else:
        result["reference_compare"] = {
            "note": "Audio-only mode; video comparison skipped.",
            "backend": video_backend,
        }

    frame_meta: Dict[str, Any] = result["frame_export"]
    frame_meta.update({
        "enabled": export_frames,
        "fps": frame_export_fps,
        "max_frames": frame_export_max,
        "directory": str(export_target_dir) if export_target_dir else None,
    })
    if export_frames and export_target_dir:
        try:
            exported = export_frames_for_search(
                video_path,
                export_target_dir,
                fps=frame_export_fps,
                max_frames=frame_export_max,
                show_progress=show_progress,
            )
            frame_meta["count"] = len(exported)
            frame_meta["files"] = exported
        except Exception as exc:  # pragma: no cover - file specific failures
            frame_meta["error"] = str(exc)

    result["risk"] = risk_level(audio_hit, match_ratio, high_th=high_th, med_th=med_th)

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    payload: Dict[str, Any] = {
        "result": result,
        "report_json": str(json_path),
        "matches_csv": str(csv_path) if csv_path.exists() else None,
        "temp_audio": str(tmp_wav) if tmp_wav.exists() else None,
        "match_ratio": match_ratio,
        "video_path": str(video_path),
        "reference_dir": str(ref_dir) if ref_dir else None,
        "report_dir": str(target_report_dir),
        "frame_export_dir": str(export_target_dir) if export_target_dir else None,
    }
    return payload


# ----------------------------
# Main
# ----------------------------
def main():
    ap = argparse.ArgumentParser(description="YouTube Shorts pre-check (audio + video).")
    ap.add_argument("--video", required=True, help="Input video path")
    ap.add_argument("--reference-dir", default=None, help="Directory of reference videos to compare")
    ap.add_argument("--fps", type=float, default=1.0, help="Frame sampling fps for hashing")
    ap.add_argument("--hash", default="phash", choices=["phash","ahash","dhash"], help="Hash function")
    ap.add_argument("--hamming-th", type=int, default=12, help="Hamming distance threshold for frame match")
    ap.add_argument("--resize", default="256x256", help="Resize for hashing, e.g., 256x256")
    ap.add_argument("--max-frames", type=int, default=None, help="Limit frames per video for hashing")
    ap.add_argument("--high-th", type=float, default=0.30, help="High risk threshold")
    ap.add_argument("--med-th", type=float, default=0.15, help="Medium risk threshold")
    ap.add_argument("--audio-only", action="store_true", help="Only run audio check")
    ap.add_argument(
        "--audio-provider",
        default="auto",
        choices=["auto", "shazam", "acrcloud"],
        help="Audio recognition backend (default: auto)",
    )
    ap.add_argument(
        "--video-backend",
        default="imagehash",
        choices=["imagehash", "videohash", "pyvideohash"],
        help="Video comparison backend (default: imagehash)",
    )
    ap.add_argument("--export-frames", action="store_true", help="Export frames for manual Google Lens/Yandex search")
    ap.add_argument("--frame-export-dir", default=None, help="Directory to save exported frames (default: reports/<video>_frames)")
    ap.add_argument("--frame-export-fps", type=float, default=0.2, help="Frame sampling fps for export (default: 0.2 => every 5s)")
    ap.add_argument("--frame-export-max", type=int, default=40, help="Maximum frames to export (default: 40)")
    ap.add_argument("--report-dir", default="./reports", help="Where to save reports")
    args = ap.parse_args()

    video_path = Path(args.video).expanduser().resolve()
    if not video_path.exists():
        print(f"Video not found: {video_path}")
        sys.exit(1)

    resize_wh = tuple(map(int, args.resize.lower().split("x")))
    ref_dir = Path(args.reference_dir).expanduser().resolve() if args.reference_dir else None

    payload = run_precheck(
        video_path,
        ref_dir,
        fps=args.fps,
        hash_name=args.hash,
        hamming_th=args.hamming_th,
        resize=resize_wh,
        max_frames=args.max_frames,
        high_th=args.high_th,
        med_th=args.med_th,
        audio_only=args.audio_only,
        video_backend=args.video_backend,
        audio_provider=args.audio_provider,
        export_frames=args.export_frames,
        frame_export_dir=Path(args.frame_export_dir).expanduser().resolve() if args.frame_export_dir else None,
        frame_export_fps=args.frame_export_fps,
        frame_export_max=args.frame_export_max,
        report_dir=Path(args.report_dir),
        show_progress=True,
    )

    result = payload["result"]
    audio_hit = bool(result.get("audio", {}).get("hit"))
    match_ratio = float(payload.get("match_ratio", 0.0))
    json_path = payload.get("report_json")
    csv_path = payload.get("matches_csv")

    print("\n==== Pre-Check Summary ====")
    print(f"Video: {video_path.name}")
    if not args.audio_only:
        print(f"- Video backend: {args.video_backend}")
    audio_provider_used = result.get("audio", {}).get("provider")
    audio_title = result.get("audio", {}).get("title")
    if audio_hit:
        extra = f" via {audio_provider_used}" if audio_provider_used else ""
        title_part = f" ({audio_title})" if audio_title else ""
        print(f"- Audio match: HIT{extra}{title_part}")
    else:
        tried = result.get("audio", {}).get("provider_order")
        tried_str = f" via {', '.join(tried)}" if tried else ""
        print(f"- Audio match: None{tried_str}")
    ref_compare = result.get("reference_compare", {})
    if not args.audio_only and ref_dir:
        best = ref_compare.get("best_match")
        note = ref_compare.get("note")
        meaningful_best = bool(best and (best.get("ref") or best.get("ratio", 0.0) > 0))
        if meaningful_best:
            print(f"- Best video match: {best}")
            print(f"- Match ratio: {match_ratio:.4f} (HIGH>={args.high_th}, MED>={args.med_th})")
        elif note:
            print(f"- Video note: {note}")
        if csv_path and meaningful_best:
            print(f"- CSV: {csv_path}")
        failures = ref_compare.get("failures")
        if failures:
            print(f"- Video failures: {len(failures)} reference videos errored")
    elif not args.audio_only:
        note = ref_compare.get("note")
        if note:
            print(f"- Video note: {note}")
    print(f"- Risk: {result['risk']}")
    if json_path:
        print(f"- JSON: {json_path}")
    frame_meta = result.get("frame_export", {})
    if frame_meta.get("enabled"):
        if frame_meta.get("count"):
            print(f"- Exported frames: {frame_meta['count']} saved to {frame_meta.get('directory')}")
        elif frame_meta.get("error"):
            print(f"- Export frames error: {frame_meta['error']}")
        else:
            print(f"- Export frames: requested but none saved")
    print("===========================\n")

if __name__ == "__main__":
    main()
