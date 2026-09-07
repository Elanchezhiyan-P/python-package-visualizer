"""Generate extension icon.png matching the in-app header (package emoji on gradient tile)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "media" / "icon.png"
SIZE = 128
RADIUS = 28
MARGIN = 8
EMOJI = "\U0001F4E6"
FONT_CANDIDATES = [
    Path(r"C:\Windows\Fonts\seguiemj.ttf"),
    Path("/System/Library/Fonts/Apple Color Emoji.ttc"),
    Path("/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"),
]


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def rounded_gradient_tile() -> Image.Image:
    box = (MARGIN, MARGIN, SIZE - MARGIN, SIZE - MARGIN)
    top = (14, 99, 156)
    bottom = (74, 158, 255)

    gradient = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(gradient)
    x0, y0, x1, y1 = box
    for y in range(y0, y1):
        t = (y - y0) / max(1, y1 - y0 - 1)
        color = (
            lerp(top[0], bottom[0], t),
            lerp(top[1], bottom[1], t),
            lerp(top[2], bottom[2], t),
            255,
        )
        draw.line([(x0, y), (x1, y)], fill=color)

    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=RADIUS, fill=255)

    tile = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    tile.paste(gradient, (0, 0), mask)
    return tile


def load_emoji_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def main() -> None:
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (MARGIN + 2, MARGIN + 4, SIZE - MARGIN + 2, SIZE - MARGIN + 4),
        radius=RADIUS,
        fill=(0, 0, 0, 40),
    )
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(rounded_gradient_tile())

    draw = ImageDraw.Draw(canvas)
    font = load_emoji_font(72)
    bbox = draw.textbbox((0, 0), EMOJI, font=font, embedded_color=True)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (SIZE - tw) / 2 - bbox[0]
    ty = (SIZE - th) / 2 - bbox[1] - 2
    draw.text((tx, ty), EMOJI, font=font, embedded_color=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, format="PNG", optimize=True)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
