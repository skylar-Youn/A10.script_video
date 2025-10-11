"""Executable module for running the FastAPI app with sensible defaults."""
from __future__ import annotations

import os
import socket

import uvicorn


def _should_reload() -> bool:
    """Read reload preference from environment (defaults to True)."""
    value = os.getenv("WEB_APP_RELOAD", "true").strip().lower()
    return value in {"1", "true", "yes", "on"}


def get_local_ip() -> str:
    """Get the local IP address of the machine."""
    try:
        # Create a socket to determine the local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Connect to a public DNS server (doesn't actually send data)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        return local_ip
    except Exception:
        return "N/A"


def main() -> None:
    host = os.getenv("WEB_APP_HOST", "0.0.0.0")
    port = int(os.getenv("WEB_APP_PORT", os.getenv("PORT", "8001")))

    # Print access URLs
    print("\n" + "=" * 60)
    print("🚀 서버가 시작되었습니다!")
    print("=" * 60)
    print(f"\n📍 로컬 접근:      http://127.0.0.1:{port}/tools")

    local_ip = get_local_ip()
    if local_ip != "N/A":
        print(f"📍 네트워크 접근:  http://{local_ip}:{port}/tools")

    print("\n" + "=" * 60 + "\n")

    uvicorn.run("web_app.app:app", host=host, port=port, reload=_should_reload())


if __name__ == "__main__":
    main()
