#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os, csv, argparse, math
from pathlib import Path
from typing import List, Tuple, Dict, Any

import cv2
import numpy as np
from PIL import Image
import imagehash
from tqdm import tqdm

# ------------------------
# Utils
# ------------------------
def parse_resize(s: str) -> Tuple[int,int]:
    try:
        w,h = s.lower().split("x")
        return (int(w), int(h))
    except Exception:
        return (320,320)

def ensure_dir(p: Path):
    p.parent.mkdir(parents=True, exist_ok=True)

def psnr(a: np.ndarray, b: np.ndarray) -> float:
    # a, b: uint8 BGR images of same shape
    mse = np.mean((a.astype(np.float32) - b.astype(np.float32)) ** 2)
    if mse <= 1e-8:
        return 100.0
    return 20 * math.log10(255.0 / math.sqrt(mse))

def hist_corr(a: np.ndarray, b: np.ndarray) -> float:
    # HSV hist, 50x60 bins for H,S (ignore V)
    ahsv = cv2.cvtColor(a, cv2.COLOR_BGR2HSV)
    bhsv = cv2.cvtColor(b, cv2.COLOR_BGR2HSV)
    ah = cv2.calcHist([ahsv],[0,1],None,[50,60],[0,180,0,256])
    bh = cv2.calcHist([bhsv],[0,1],None,[50,60],[0,180,0,256])
    cv2.normalize(ah, ah)
    cv2.normalize(bh, bh)
    v = cv2.compareHist(ah, bh, cv2.HISTCMP_CORREL)  # [-1,1]
    return float((v + 1.0) / 2.0)  # map to [0,1]

def phash_hex(img_bgr: np.ndarray, size=(256,256)) -> str:
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(rgb).resize(size, Image.LANCZOS)
    return str(imagehash.phash(pil))

def hamming(a_hex: str, b_hex: str) -> int:
    return imagehash.hex_to_hash(a_hex) - imagehash.hex_to_hash(b_hex)

def orb_match_score(a_gray: np.ndarray, b_gray: np.ndarray) -> float:
    # return ratio in [0,1] of good matches over keypoints
    orb = cv2.ORB_create(nfeatures=2000)
    kp1, des1 = orb.detectAndCompute(a_gray, None)
    kp2, des2 = orb.detectAndCompute(b_gray, None)
    if des1 is None or des2 is None or len(kp1)==0 or len(kp2)==0:
        return 0.0
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    matches = bf.match(des1, des2)
    if not matches:
        return 0.0
    # good matches: distance below 70 (heuristic)
    good = [m for m in matches if m.distance < 70]
    denom = max(len(kp1), len(kp2))
    return float(len(good)) / float(denom)

# ------------------------
# Frame sampling
# ------------------------
def sample_frames(video_path: Path, fps: float, resize: Tuple[int,int], max_frames: int|None) -> List[np.ndarray]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")
    orig_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, int(round(orig_fps / max(fps, 0.0001))))
    frames = []
    idx = 0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    with tqdm(total=total, desc=f"Load {video_path.name}", unit="f") as pbar:
        while True:
            ret, frame = cap.read()
            if not ret: break
            if idx % step == 0:
                frame = cv2.resize(frame, resize, interpolation=cv2.INTER_AREA)
                frames.append(frame)
                if max_frames and len(frames) >= max_frames:
                    break
            idx += 1
            pbar.update(1)
    cap.release()
    return frames

# ------------------------
# Similarity metrics
# ------------------------
def similarity_scores(frames_a: List[np.ndarray], frames_b: List[np.ndarray], phash_th: int) -> Dict[str,float]:
    n = min(len(frames_a), len(frames_b))
    if n == 0:
        return {"phash":0.0, "orb":0.0, "hist":0.0, "psnr":0.0}
    # pair frames by index
    phash_matches = 0
    orb_scores = []
    hist_scores = []
    psnr_scores = []
    for i in range(n):
        a = frames_a[i]
        b = frames_b[i]
        # pHash
        ha = phash_hex(a)
        hb = phash_hex(b)
        if hamming(ha, hb) <= phash_th:
            phash_matches += 1
        # ORB
        orb_scores.append(orb_match_score(cv2.cvtColor(a, cv2.COLOR_BGR2GRAY),
                                          cv2.cvtColor(b, cv2.COLOR_BGR2GRAY)))
        # hist correlation
        hist_scores.append(hist_corr(a,b))
        # psnr
        psnr_scores.append(psnr(a,b))
    phash_ratio = phash_matches / float(n)
    orb_mean = float(np.mean(orb_scores)) if orb_scores else 0.0
    hist_mean = float(np.mean(hist_scores)) if hist_scores else 0.0
    psnr_mean = float(np.mean(psnr_scores)) if psnr_scores else 0.0
    # normalize PSNR to [0,1] by mapping 20~50 dB -> 0~1
    psnr_norm = float(np.clip((psnr_mean - 20.0) / 30.0, 0.0, 1.0))
    return {"phash": phash_ratio, "orb": orb_mean, "hist": hist_mean, "psnr": psnr_norm, "psnr_db": psnr_mean}

def weighted_score(scores: Dict[str,float], weights: Tuple[float,float,float,float]) -> float:
    w_ph, w_orb, w_hist, w_psnr = weights
    return (scores["phash"]*w_ph + scores["orb"]*w_orb + scores["hist"]*w_hist + scores["psnr"]*w_psnr) / max(sum(weights),1e-8)

# ------------------------
# Main comparisons
# ------------------------
def compare_two(a: Path, b: Path, fps: float, resize: Tuple[int,int], max_frames: int|None, phash_th: int, weights: Tuple[float,float,float,float]) -> Dict[str,Any]:
    fa = sample_frames(a, fps, resize, max_frames)
    fb = sample_frames(b, fps, resize, max_frames)
    sc = similarity_scores(fa, fb, phash_th=phash_th)
    sc["weighted"] = weighted_score(sc, weights)
    sc["frames_used"] = min(len(fa), len(fb))
    return sc

def compare_dir(a: Path, ref_dir: Path, fps: float, resize: Tuple[int,int], max_frames: int|None, phash_th: int, weights: Tuple[float,float,float,float]) -> List[Tuple[str, Dict[str,Any]]]:
    results = []
    for p in sorted(ref_dir.rglob("*")):
        if p.suffix.lower() in {".mp4",".mov",".mkv",".avi",".webm"} and p.is_file():
            try:
                sc = compare_two(a, p, fps, resize, max_frames, phash_th, weights)
                results.append((p.name, sc))
            except Exception as e:
                results.append((p.name, {"error": str(e)}))
    results.sort(key=lambda x: x[1].get("weighted", 0.0), reverse=True)
    return results

def main():
    ap = argparse.ArgumentParser(description="Video Similarity Checker")
    ap.add_argument("--a", required=True, help="video A path")
    ap.add_argument("--b", help="video B path (for pairwise mode)")
    ap.add_argument("--dir", help="reference directory (for ranking mode)")
    ap.add_argument("--fps", type=float, default=1.0, help="sampling fps")
    ap.add_argument("--resize", default="320x320", help="resize WxH before comparison")
    ap.add_argument("--max-frames", type=int, default=200, help="limit sampled frames")
    ap.add_argument("--phash-th", type=int, default=12, help="pHash Hamming threshold")
    ap.add_argument("--weights", nargs=4, type=float, default=[0.25,0.25,0.25,0.25], help="weights for (pHash, ORB, Hist, PSNR_norm)")
    ap.add_argument("--out", help="write JSON report (pairwise mode)")
    ap.add_argument("--csv", help="write CSV ranking (dir mode)")
    args = ap.parse_args()

    a = Path(args.a).expanduser().resolve()
    if not a.exists():
        print(f"[ERR] Not found: {a}")
        return

    resize = parse_resize(args.resize)
    weights = tuple(args.weights)

    if args.b and args.dir:
        print("[ERR] Choose either --b or --dir, not both.")
        return

    if args.b:
        b = Path(args.b).expanduser().resolve()
        if not b.exists():
            print(f"[ERR] Not found: {b}")
            return
        sc = compare_two(a, b, args.fps, resize, args.max_frames, args.phash_th, weights)
        print(f"\n== Similarity {a.name} vs {b.name} ==")
        print(f"frames_used: {sc['frames_used']}")
        print(f"pHash: {sc['phash']:.4f}")
        print(f"ORB:   {sc['orb']:.4f}")
        print(f"Hist:  {sc['hist']:.4f}")
        print(f"PSNR:  {sc['psnr']:.4f} (norm)  / {sc['psnr_db']:.2f} dB")
        print(f"Weighted Score: {sc['weighted']:.4f}\n")
        if args.out:
            ensure_dir(Path(args.out))
            import json
            with open(args.out, "w", encoding="utf-8") as f:
                json.dump({"a": str(a), "b": str(b), "scores": sc, "params": vars(args)}, f, ensure_ascii=False, indent=2)
            print(f"[OK] JSON report saved: {args.out}")
        return

    if args.dir:
        ref = Path(args.dir).expanduser().resolve()
        if not ref.exists():
            print(f"[ERR] Not found: {ref}")
            return
        results = compare_dir(a, ref, args.fps, resize, args.max_frames, args.phash_th, weights)
        # print top-5
        print(f"\n== Ranking for {a.name} in {ref} ==")
        for i,(name,sc) in enumerate(results[:5], start=1):
            if "error" in sc:
                print(f"{i:2d}. {name} -> ERROR: {sc['error']}")
            else:
                print(f"{i:2d}. {name} -> {sc['weighted']:.4f} (pHash {sc['phash']:.2f}, ORB {sc['orb']:.2f}, Hist {sc['hist']:.2f}, PSNR {sc['psnr']:.2f}/{sc['psnr_db']:.1f}dB)")
        if args.csv:
            from csv import writer
            with open(args.csv, "w", newline="", encoding="utf-8") as f:
                w = writer(f)
                w.writerow(["reference_video","weighted","phash","orb","hist","psnr_norm","psnr_db","frames_used","error"])
                for name,sc in results:
                    if "error" in sc:
                        w.writerow([name,"", "", "", "", "", "", "", sc["error"]])
                    else:
                        w.writerow([name, f"{sc['weighted']:.6f}", f"{sc['phash']:.6f}", f"{sc['orb']:.6f}", f"{sc['hist']:.6f}", f"{sc['psnr']:.6f}", f"{sc['psnr_db']:.2f}", sc["frames_used"], ""])
            print(f"[OK] CSV saved: {args.csv}")
        return

    print("[ERR] Provide either --b (pairwise) or --dir (ranking). See --help.")

if __name__ == "__main__":
    main()
