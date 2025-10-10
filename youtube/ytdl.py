#!/usr/bin/env python3
"""Convenience CLI for downloading YouTube videos with yt-dlp."""
from __future__ import annotations

import argparse
import sys
import time
import logging
from pathlib import Path
from typing import Iterable, List, Sequence

logging.basicConfig(level=logging.INFO)


DEFAULT_DOWNLOAD_DIR = (Path(__file__).resolve().parent / "download").resolve()

try:
    from yt_dlp import YoutubeDL
except ImportError:  # pragma: no cover - handled at runtime
    sys.stderr.write(
        "yt-dlp is required to run this script. Install it with 'pip install yt-dlp'\n"
    )
    sys.exit(1)


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download one or more YouTube videos using yt-dlp.",
    )
    parser.add_argument(
        "url",
        nargs="+",
        help="One or more YouTube video or playlist URLs to download.",
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        default=DEFAULT_DOWNLOAD_DIR,
        help=(
            "Directory where the downloaded files will be saved "
            "(defaults to youtube/download)."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch metadata without downloading the media files.",
    )
    parser.add_argument(
        "--sub-langs",
        default="all",
        help=(
            "Comma-separated list of subtitle language codes to download "
            "(use 'all' to grab every available subtitle)."
        ),
    )
    parser.add_argument(
        "--sub-format",
        default="best",
        help="Preferred subtitle format (passed to yt-dlp --sub-format).",
    )
    parser.add_argument(
        "--no-subs",
        action="store_false",
        dest="download_subs",
        help="Disable subtitle downloads.",
    )
    parser.add_argument(
        "--no-auto-subs",
        action="store_false",
        dest="auto_subs",
        help="Do not download automatically generated subtitles.",
    )
    parser.set_defaults(download_subs=True, auto_subs=True)
    return parser.parse_args(argv)


def _flatten_entries(info: dict | None) -> List[dict]:
    """Expand playlist results into individual entries."""
    if not info:
        return []
    entry_type = info.get("_type")
    if entry_type in {"playlist", "multi_video"}:
        flattened: List[dict] = []
        for entry in info.get("entries") or []:
            flattened.extend(_flatten_entries(entry))
        return flattened
    return [info]


def parse_sub_langs(raw: str) -> List[str]:
    """Normalize comma-separated subtitle language string."""
    if raw.strip().lower() == "all":
        return ["all"]
    langs = [lang.strip() for lang in raw.split(",") if lang.strip()]
    return langs or ["all"]


def prepare_urls(urls: Iterable[str] | str) -> List[str]:
    """Ensure we always work with a non-empty list of URLs."""
    if isinstance(urls, str):
        urls = [urls]
    url_list = [url for url in urls if url]
    if not url_list:
        raise ValueError("At least one URL must be provided")
    return url_list


def download_with_options(
    urls: Iterable[str] | str,
    output_dir: Path | str | None = None,
    *,
    skip_download: bool = False,
    download_subs: bool = True,
    auto_subs: bool = True,
    sub_langs: Iterable[str] | str = ("all",),
    sub_format: str = "best",
    progress_hook=None,
) -> List[Path]:
    """Helper for programmatic usage (web UI, other scripts)."""

    url_list = prepare_urls(urls)
    if isinstance(output_dir, (str, Path)):
        output_path = Path(output_dir).expanduser().resolve()
    else:
        output_path = DEFAULT_DOWNLOAD_DIR

    if isinstance(sub_langs, str):
        languages = parse_sub_langs(sub_langs)
    else:
        languages = [lang.strip() for lang in sub_langs if str(lang).strip()]
        if not languages:
            languages = ["all"]

    return download(
        url_list,
        output_path,
        skip_download=skip_download,
        download_subs=download_subs,
        auto_subs=auto_subs,
        sub_langs=languages,
        sub_format=sub_format,
        progress_hook=progress_hook,
    )


def download(
    urls: Iterable[str],
    output_dir: Path,
    *,
    skip_download: bool,
    download_subs: bool,
    auto_subs: bool,
    sub_langs: List[str],
    sub_format: str,
    progress_hook=None,
) -> List[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    ydl_opts = {
        "outtmpl": str(output_dir / "%(title)s [%(id)s].%(ext)s"),
        "skip_download": skip_download,
        "writesubtitles": download_subs,
        "writeautomaticsub": download_subs and auto_subs,
        "subtitleslangs": sub_langs,
        "subtitlesformat": sub_format,
        # Rate limiting and retry options
        "sleep_interval": 3,  # 각 다운로드 사이에 3초 대기
        "max_sleep_interval": 10,  # 최대 대기 시간
        "sleep_interval_subtitles": 2,  # 자막 다운로드 사이 2초 대기
        "retries": 5,  # 5번 재시도
        "fragment_retries": 5,
        # 브라우저 모방 (Chrome으로 위장)
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
        },
        # 자막 다운로드 실패해도 계속 진행
        "ignoreerrors": True,
        "continuedl": True,
    }

    if progress_hook:
        ydl_opts["progress_hooks"] = [progress_hook]

    downloaded: List[Path] = []
    seen: set[Path] = set()

    with YoutubeDL(ydl_opts) as ydl:
        for idx, url in enumerate(urls):
            # 여러 URL 다운로드 시 사이에 추가 대기
            if idx > 0:
                wait_time = 5
                logging.info(f"다음 다운로드까지 {wait_time}초 대기 중...")
                time.sleep(wait_time)

            try:
                info = ydl.extract_info(url, download=not skip_download)
                for entry in _flatten_entries(info):
                    filepath = Path(ydl.prepare_filename(entry))
                    if filepath not in seen:
                        downloaded.append(filepath)
                        seen.add(filepath)

                    if not download_subs:
                        continue

                    for subtitle in (entry.get("requested_subtitles") or {}).values():
                        sub_path = subtitle.get("filepath")
                        if sub_path:
                            path_obj = Path(sub_path)
                            if path_obj not in seen:
                                downloaded.append(path_obj)
                                seen.add(path_obj)

                    for subtitle_group in (entry.get("automatic_captions") or {}).values():
                        candidates = []
                        if isinstance(subtitle_group, dict):
                            candidates.append(subtitle_group)
                        elif isinstance(subtitle_group, list):
                            candidates.extend(item for item in subtitle_group if isinstance(item, dict))
                        for candidate in candidates:
                            sub_path = candidate.get("filepath")
                            if sub_path:
                                path_obj = Path(sub_path)
                                if path_obj not in seen:
                                    downloaded.append(path_obj)
                                    seen.add(path_obj)

            except Exception as e:
                logging.error(f"'{url}' 다운로드 중 오류 발생: {e}")
                # 자막만 실패한 경우 계속 진행
                if "subtitle" in str(e).lower():
                    logging.warning("자막 다운로드는 실패했지만 영상 다운로드는 계속 진행됩니다.")
                else:
                    # 영상 다운로드 자체가 실패한 경우만 예외 발생
                    raise

    return downloaded


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    output_dir = args.output_dir.expanduser().resolve()
    sub_langs = parse_sub_langs(args.sub_langs)

    try:
        downloaded_files = download(
            args.url,
            output_dir,
            skip_download=args.dry_run,
            download_subs=args.download_subs,
            auto_subs=args.auto_subs,
            sub_langs=sub_langs,
            sub_format=args.sub_format,
        )
    except Exception as exc:  # yt_dlp surfaces DownloadError and others
        sys.stderr.write(f"Download failed: {exc}\n")
        return 1

    if not downloaded_files:
        sys.stderr.write("No files were downloaded.\n")
        return 1

    action = "Planned downloads" if args.dry_run else "Downloaded"
    sys.stdout.write(f"{action}:\n")
    for path in downloaded_files:
        sys.stdout.write(f"  {path}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
