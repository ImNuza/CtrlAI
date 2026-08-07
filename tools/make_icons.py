#!/usr/bin/env python3
"""Garden of Life — app icon generator (maskable-safe)."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "icons")
BG     = (68, 87, 61)      # --foliage-shadow #44573D
CREAM  = (234, 226, 208)   # --bg-deep       #EAE2D0
SAGE   = (177, 184, 161)   # --foliage-highlight #B1B8A1

SS = 4          # supersample factor for clean edges
D  = 512        # design space


def leaf(layer, dir_, y, length, width, tilt, fill):
    """Ellipse rotated so the outer tip lifts upward."""
    pad = length * 3
    tile = Image.new("RGBA", (int(pad * 2), int(pad * 2)), (0, 0, 0, 0))
    td = ImageDraw.Draw(tile)
    cx = pad + dir_ * length * 0.55
    td.ellipse([cx - length, pad - width, cx + length, pad + width], fill=fill)
    tile = tile.rotate(dir_ * tilt, resample=Image.BICUBIC, center=(pad, pad))
    layer.alpha_composite(tile, (int(D / 2 + 0 - pad), int(D / 2 + y - pad)))


def build(size):
    S = D * SS
    img = Image.new("RGBA", (S, S), BG + (255,))
    art = Image.new("RGBA", (D, D), (0, 0, 0, 0))
    d = ImageDraw.Draw(art)
    cx, cy = D / 2, D / 2

    # Pot body (tapered)
    d.polygon([
        (cx - 88, cy + 96), (cx + 88, cy + 96),
        (cx + 66, cy + 212), (cx + 38, cy + 228),
        (cx - 38, cy + 228), (cx - 66, cy + 212),
    ], fill=CREAM)
    # Pot rim
    d.rounded_rectangle([cx - 100, cy + 62, cx + 100, cy + 108], radius=16, fill=SAGE)
    # Stem
    d.line([(cx, cy + 70), (cx, cy - 150)], fill=CREAM, width=20)
    d.ellipse([cx - 10, cy - 160, cx + 10, cy - 140], fill=CREAM)

    # Leaves: lower pair wide, upper pair smaller
    leaf(art, -1,  -20, 78, 37, 23, CREAM)
    leaf(art,  1,  -20, 78, 37, 23, SAGE)
    leaf(art, -1, -112, 58, 28, 30, SAGE)
    leaf(art,  1, -112, 58, 28, 30, CREAM)

    # Bud
    d = ImageDraw.Draw(art)
    d.ellipse([cx - 30, cy - 206, cx + 30, cy - 146], fill=CREAM)
    d.ellipse([cx - 11, cy - 187, cx + 11, cy - 165], fill=BG)

    img.alpha_composite(art.resize((S, S), Image.NEAREST))
    return img.resize((size, size), Image.LANCZOS).convert("RGB")


os.makedirs(OUT, exist_ok=True)
for name, size in [("icon-192.png", 192), ("icon-512.png", 512),
                   ("apple-touch-icon.png", 180), ("favicon-32.png", 32)]:
    p = os.path.join(OUT, name)
    build(size).save(p, "PNG", optimize=True)
    print(f"{name:24} {size:>4}px  {os.path.getsize(p):>7,} bytes")
