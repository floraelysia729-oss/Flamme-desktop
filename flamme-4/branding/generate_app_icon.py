"""从 branding/logo-source.jpg 生成任务栏方图与应用内 logo。"""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "logo-source.jpg"
PUBLIC_LOGO = ROOT.parent / "public" / "branding" / "logo-full.jpg"
PUBLIC_ICON = ROOT.parent / "public" / "branding" / "app-icon.png"
OUT = ROOT / "app-icon-square.png"
SIZE = 1024
BG = (245, 240, 235, 255)


def crop_to_content(img: Image.Image, threshold: int = 18) -> Image.Image:
    """裁掉源图四周的留白（纸纹底仍视为背景）。"""
    rgb = img.convert("RGB")
    bg = rgb.getpixel((0, 0))
    diff = ImageChops.difference(rgb, Image.new("RGB", rgb.size, bg))
    mask = diff.convert("L").point(lambda p: 255 if p > threshold else 0)
    bbox = mask.getbbox()
    return rgb.crop(bbox) if bbox else rgb


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"缺少源图：{SRC}")

    PUBLIC_LOGO.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SRC, PUBLIC_LOGO)

    img = crop_to_content(Image.open(SRC)).convert("RGBA")
    w, h = img.size

    # 裁切后按高度铺满，上下仅留极小边距
    pad_y = int(SIZE * 0.012)
    target_h = SIZE - 2 * pad_y
    scale = target_h / h
    nw = max(1, int(w * scale))
    nh = max(1, int(h * scale))
    scaled = img.resize((nw, nh), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (SIZE, SIZE), BG)
    ox = (SIZE - nw) // 2
    oy = (SIZE - nh) // 2
    canvas.paste(scaled, (ox, oy))
    canvas.save(OUT, "PNG")
    shutil.copy2(OUT, PUBLIC_ICON)
    print("wrote", OUT, PUBLIC_LOGO, PUBLIC_ICON)


if __name__ == "__main__":
    main()
