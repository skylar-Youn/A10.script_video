#!/usr/bin/env python3
"""
Scan existing downloaded files and generate ytdl_history.json
"""
import json
import re
from pathlib import Path
from datetime import datetime
from collections import defaultdict

# Paths
DOWNLOAD_DIR = Path("/home/sk/ws/youtubeanalysis/youtube/download")
HISTORY_PATH = Path("/home/sk/ws/youtubeanalysis/web_app/ytdl_history.json")

def extract_video_id(filename: str) -> str | None:
    """Extract YouTube video ID from filename (format: [VIDEO_ID].ext)"""
    match = re.search(r'\[([A-Za-z0-9_-]{11})\]', filename)
    return match.group(1) if match else None

def scan_downloads():
    """Scan download directory and group files by video ID and timestamp"""
    if not DOWNLOAD_DIR.exists():
        print(f"Download directory not found: {DOWNLOAD_DIR}")
        return []

    # Group files by video ID
    video_groups = defaultdict(list)

    for file_path in DOWNLOAD_DIR.iterdir():
        if file_path.is_file() and not file_path.name.startswith('.'):
            video_id = extract_video_id(file_path.name)
            if video_id:
                stat = file_path.stat()
                video_groups[video_id].append({
                    'path': file_path,
                    'mtime': stat.st_mtime
                })

    # Create history records
    history = []

    for video_id, files in video_groups.items():
        # Use the earliest modification time as the download timestamp
        earliest_mtime = min(f['mtime'] for f in files)
        timestamp = datetime.fromtimestamp(earliest_mtime).isoformat()

        # Collect all file paths for this video
        file_paths = [str(f['path']) for f in files]

        # Create a pseudo URL (we don't know the actual URL, but we can construct one)
        pseudo_url = f"https://www.youtube.com/watch?v={video_id}"

        record = {
            "timestamp": timestamp,
            "urls": [pseudo_url],
            "files": file_paths,
            "settings": {
                "output_dir": str(DOWNLOAD_DIR),
                "sub_langs": "ko",
                "sub_format": "srt/best",
                "download_subs": True,
                "auto_subs": True,
                "dry_run": False
            }
        }

        history.append(record)

    # Sort by timestamp (newest first)
    history.sort(key=lambda x: x['timestamp'], reverse=True)

    return history

def main():
    print("Scanning download directory for existing files...")
    history = scan_downloads()

    if not history:
        print("No files found with YouTube video IDs.")
        return

    print(f"Found {len(history)} video downloads with {sum(len(r['files']) for r in history)} total files.")

    # Save to history file
    HISTORY_PATH.write_text(
        json.dumps(history, ensure_ascii=False, indent=2),
        encoding='utf-8'
    )

    print(f"✓ History file created: {HISTORY_PATH}")
    print(f"  Total records: {len(history)}")
    print(f"  Total files: {sum(len(r['files']) for r in history)}")

if __name__ == "__main__":
    main()
