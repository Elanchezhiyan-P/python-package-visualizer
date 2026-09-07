"""Compose README GIFs from captured PNG frames."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "media" / "screenshots"
FRAMES = OUT / "frames"


def resize_to_width(img: Image.Image, width: int) -> Image.Image:
    ratio = width / img.width
    height = max(1, int(img.height * ratio))
    return img.resize((width, height), Image.Resampling.LANCZOS)


def save_gif(
    frames: list[Path],
    dest: Path,
    *,
    width: int = 960,
    duration: int = 1400,
) -> None:
    images = [
        resize_to_width(Image.open(p).convert("RGB"), width)
        for p in frames
    ]
    h = max(im.height for im in images)
    padded = []
    for im in images:
        canvas = Image.new("RGB", (width, h), (30, 30, 30))
        canvas.paste(im, (0, 0))
        padded.append(canvas)
    padded[0].save(
        dest,
        save_all=True,
        append_images=padded[1:],
        duration=duration,
        loop=0,
        optimize=True,
    )
    print(f"  OK {dest.name} ({len(padded)} frames)")


def main() -> None:
    FRAMES.mkdir(parents=True, exist_ok=True)

    save_gif(
        [FRAMES / "package-list-1.png", FRAMES / "package-list-2.png"],
        OUT / "package-list.gif",
        width=1000,
        duration=1800,
    )
    save_gif(
        [OUT / "dashboard.png", FRAMES / "package-list-1.png"],
        OUT / "hero.gif",
        width=1100,
        duration=2000,
    )
    save_gif(
        [FRAMES / "import-annotations.png"],
        OUT / "import-annotations.gif",
        width=780,
        duration=1200,
    )
    save_gif(
        [FRAMES / "code-insights.png"],
        OUT / "code-insights.gif",
        width=820,
        duration=1200,
    )


if __name__ == "__main__":
    main()
