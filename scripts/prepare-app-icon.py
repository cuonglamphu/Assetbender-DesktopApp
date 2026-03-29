"""Crop Master-Mouse logo to a square PNG for `tauri icon` (must be square)."""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError as e:
    print("Install Pillow: pip install Pillow", file=sys.stderr)
    raise SystemExit(1) from e

ROOT = Path(__file__).resolve().parent.parent
# PNG misnamed as .jpeg (signature 89 50 …)
SOURCE = ROOT.parent / "Master-Mouse" / "assets" / "icon-png" / "logo-assetblender.jpeg"
OUT = ROOT / "src-tauri" / "app-icon.png"
TARGET = 1024


def main() -> None:
    if not SOURCE.is_file():
        print(f"Source not found: {SOURCE}", file=sys.stderr)
        raise SystemExit(1)
    img = Image.open(SOURCE).convert("RGBA")
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    square = img.crop((left, top, left + side, top + side))
    if side != TARGET:
        square = square.resize((TARGET, TARGET), Image.Resampling.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    square.save(OUT, "PNG")
    print(f"Wrote {OUT} ({TARGET}x{TARGET})")


if __name__ == "__main__":
    main()
