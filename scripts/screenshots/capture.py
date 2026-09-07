#!/usr/bin/env python3
"""Capture README screenshots via headless Chrome/Edge."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image  # type: ignore[import-untyped]

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "media" / "screenshots"
FRAMES = OUT / "frames"
PORT = 8765
BUILD_DEMO = ROOT / "scripts" / "screenshots" / "build-demo.mjs"
MAKE_GIFS = ROOT / "scripts" / "screenshots" / "make-gifs.py"


def run_build_demo() -> None:
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js not found")
    subprocess.run([node, str(BUILD_DEMO)], check=True, cwd=ROOT)


def find_browser() -> list[str]:
    pf = os.environ.get("PROGRAMFILES", "")
    pf86 = os.environ.get("PROGRAMFILES(X86)", "")
    local = os.environ.get("LOCALAPPDATA", "")
    candidates = [
        Path(pf) / "Google/Chrome/Application/chrome.exe",
        Path(pf86) / "Google/Chrome/Application/chrome.exe",
        Path(local) / "Google/Chrome/Application/chrome.exe",
        Path(pf) / "Microsoft/Edge/Application/msedge.exe",
        Path(pf86) / "Microsoft/Edge/Application/msedge.exe",
    ]
    for path in candidates:
        if path.exists():
            return [str(path)]
    exe = (
        shutil.which("chrome")
        or shutil.which("msedge")
        or shutil.which("google-chrome")
    )
    if exe:
        return [exe]
    raise RuntimeError(
        "Chrome or Edge not found — install a Chromium-based browser."
    )


def start_server() -> ThreadingHTTPServer:
    os.chdir(ROOT)
    server = ThreadingHTTPServer(
        ("127.0.0.1", PORT),
        SimpleHTTPRequestHandler,
    )
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    for _ in range(30):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{PORT}/", timeout=1)
            break
        except Exception:
            time.sleep(0.1)
    return server


def shot(
    browser: list[str],
    url: str,
    dest: Path,
    *,
    width: int = 1280,
    height: int = 800,
    delay_ms: int = 1200,
) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp.png")
    if tmp.exists():
        tmp.unlink()
    cmd = [
        *browser,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        f"--window-size={width},{height}",
        f"--screenshot={tmp}",
        f"--virtual-time-budget={delay_ms}",
        url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0 or not tmp.exists():
        raise RuntimeError(
            f"Screenshot failed for {url}\n"
            f"{result.stderr}\n{result.stdout}"
        )
    tmp.replace(dest)
    print(f"  OK {dest.name}")


def crop_settings(src: Path, dest: Path) -> None:
    img = Image.open(src)
    w, h = img.size
    top = int(h * 0.34)
    bottom = min(h, top + 680)
    cropped = img.crop((0, top, w, bottom))
    cropped.save(dest, optimize=True)
    print(f"  OK {dest.name} (cropped)")


def main() -> None:
    run_build_demo()
    FRAMES.mkdir(parents=True, exist_ok=True)
    browser = find_browser()
    server = start_server()
    base = f"http://127.0.0.1:{PORT}/media/screenshots/demo"

    print("\nCapturing webview screens…")
    shot(
        browser,
        f"{base}/webview-list.html",
        FRAMES / "package-list-1.png",
        delay_ms=2500,
    )
    shot(
        browser,
        f"{base}/webview-list-detail.html",
        FRAMES / "package-list-2.png",
        delay_ms=3000,
    )
    shot(
        browser,
        f"{base}/webview-dashboard.html",
        OUT / "dashboard.png",
        delay_ms=2500,
    )
    shot(
        browser,
        f"{base}/webview-graph.html",
        OUT / "dependency-graph.png",
        delay_ms=3500,
    )

    print("\nCapturing sidebar settings…")
    settings_tmp = FRAMES / "settings-full.png"
    shot(
        browser,
        f"{base}/settings.html",
        settings_tmp,
        width=360,
        height=1280,
        delay_ms=800,
    )
    crop_settings(settings_tmp, OUT / "settings-panel.png")

    print("\nCapturing editor mocks…")
    shot(
        browser,
        f"{base}/editor-import-annotations.html",
        FRAMES / "import-annotations.png",
        width=860,
        height=520,
        delay_ms=600,
    )
    shot(
        browser,
        f"{base}/editor-code-insights.html",
        FRAMES / "code-insights.png",
        width=860,
        height=560,
        delay_ms=600,
    )

    server.shutdown()
    print("\nBuilding GIFs…")
    subprocess.run([sys.executable, str(MAKE_GIFS)], check=True)
    print("\nDone — screenshots updated in media/screenshots/\n")


if __name__ == "__main__":
    main()
