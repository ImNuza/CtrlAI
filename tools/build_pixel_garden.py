#!/usr/bin/env python3
"""Turn the pixel-art drop into the garden's plant and ground sprites.

Two sources, both needing work before they can be used.

The plants arrived as 58 separate zips, each holding one 32x32 sprite and a
metadata.json that records the prompt but not which plant or which growth
phase the sprite is. The mapping below was made by eye from a contact sheet
of all 58 and is the only record of it, so it is written out in full rather
than derived.

The ground arrived as one 256x256 sheet holding a 4x4 grid of tiles with
transparent gutters between them. Row 0 is moss overlays with holes in them,
rows 1 to 3 are soil. Nothing in it is a solid grass fill, so the grass is
composited here: moss over a flat base, then mirrored to guarantee it tiles.

Usage:  python3 tools/build_pixel_garden.py
"""

from PIL import Image
import os
import sys

ZIPS = os.environ.get("PLANT_DIR", "")   # set by the caller, holds z*/ dirs
GROUND = ("character/ground assets (need crop yourself)/"
          "pixellab-2D-pixel-art-garden-ground-til-1786212610158.png")

OUT_PLANTS = "app/art/plants"
OUT_LAND = "app/art/land"

# Identified by eye from a contact sheet of all 58. Values are the extracted
# directory names. Seed and sprout sprites are near identical across species
# in the source art, which is botanically fair, so a few are shared.
PLANTS = {
    "pandan":     {"seed": "z24",  "sprout": "z23",  "grown": "z21",
                   "bloom": "z02",  "wilt": "z223"},
    "sampaguita": {"seed": "z218", "sprout": "z26",  "grown": "z234",
                   "bloom": "z227", "wilt": "z233"},
    "fern":       {"seed": "z245", "sprout": "z212", "grown": "z247",
                   "bloom": "z210", "wilt": "z255"},
    "kopi":       {"seed": "z27",  "sprout": "z214", "grown": "z213",
                   "bloom": "z228", "wilt": "z246"},
    # These three reuse a seed mound from above. The drop only contains four
    # true seed sprites, and a seed half-buried in soil looks the same
    # whatever it will grow into, so reuse here costs nothing. Using their
    # own sprouts as seeds, which is what the first pass did, meant the seed
    # phase already had leaves on it.
    "hibiscus":   {"seed": "z24",  "sprout": "z230", "grown": "z211",
                   "bloom": "z250", "wilt": "z226"},
    "orchid":     {"seed": "z218", "sprout": "z232", "grown": "z242",
                   "bloom": "z248", "wilt": "z244"},
    "passion":    {"seed": "z245", "sprout": "z237", "grown": "z231",
                   "bloom": "z240", "wilt": "z225"},
}

# Grid bounds measured off the sheet's alpha channel, not eyeballed.
G_ROWS = [(1, 63), (76, 115), (140, 179), (204, 243)]
G_COLS = [(2, 61), (65, 125), (130, 189), (194, 254)]

# Which cell becomes which surface.
LAND = {
    "patch-bare":    (1, 0),   # pale dry earth
    "patch-tilled":  (2, 0),   # dark furrows
    "patch-planted": (3, 2),   # rich worked soil
}
MOSS_CELL = (0, 3)             # densest of the moss overlays
GRASS_BASE = (203, 214, 180)   # the app's grass green, so the seams vanish
GRASS_TILE = 64
MOSS_STRENGTH = 0.22           # how much of the moss survives onto the base


def cell(sheet, r, c):
    y0, y1 = G_ROWS[r]
    x0, x1 = G_COLS[c]
    return sheet.crop((x0, y0, x1 + 1, y1 + 1))


def save_indexed(img, path, colors=63):
    """Palette PNG with a reserved transparent index. Pixel art has few
    colours and hard edges, so dithering stays off: it would scatter the
    edges this style depends on."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if img.mode == "RGBA":
        alpha = img.getchannel("A").point(lambda v: 255 if v > 128 else 0)
        last = colors
        q = img.convert("RGB").quantize(colors=last, method=Image.FASTOCTREE,
                                        dither=Image.NONE)
        q.putpalette(q.getpalette()[:3 * last] + [0, 0, 0])
        idx, a = q.load(), alpha.load()
        for y in range(q.size[1]):
            for x in range(q.size[0]):
                if a[x, y] == 0:
                    idx[x, y] = last
        q.info["transparency"] = last
        q.save(path, "PNG", optimize=True)
    else:
        img.convert("RGB").quantize(colors=colors, method=Image.FASTOCTREE,
                                    dither=Image.NONE
                                    ).save(path, "PNG", optimize=True)
    return os.path.getsize(path)


def make_grass(sheet):
    """Moss over a flat base, then mirrored into a 2x2 block.

    A mirrored tile meets itself on every edge, so it repeats without a seam.
    Diffusion output never tiles cleanly on its own and a visible seam every
    64px across the whole field is far worse than the slight symmetry that
    mirroring introduces at this scale.

    The moss goes on faint. At full strength it read as patterned wallpaper:
    high contrast, obviously repeating, and competing with the patches and
    the text over it. This is a background, and a background's job is to be
    a surface rather than a thing to look at."""
    moss = cell(sheet, *MOSS_CELL)
    q = GRASS_TILE // 2
    moss = moss.resize((q, q), Image.NEAREST)
    faded = moss.copy()
    faded.putalpha(moss.getchannel("A").point(lambda v: int(v * MOSS_STRENGTH)))
    base = Image.new("RGBA", (q, q), GRASS_BASE + (255,))
    base.alpha_composite(faded)

    tile = Image.new("RGBA", (GRASS_TILE, GRASS_TILE))
    tile.paste(base, (0, 0))
    tile.paste(base.transpose(Image.FLIP_LEFT_RIGHT), (q, 0))
    tile.paste(base.transpose(Image.FLIP_TOP_BOTTOM), (0, q))
    tile.paste(base.transpose(Image.FLIP_LEFT_RIGHT)
                   .transpose(Image.FLIP_TOP_BOTTOM), (q, q))
    return tile.convert("RGB")


def main():
    if not ZIPS or not os.path.isdir(ZIPS):
        print("set PLANT_DIR to the folder holding the extracted z*/ dirs",
              file=sys.stderr)
        return 1
    if not os.path.exists(GROUND):
        print("MISSING " + GROUND, file=sys.stderr)
        return 1

    total = 0
    missing = []
    for plant, phases in PLANTS.items():
        for phase, tag in phases.items():
            src = os.path.join(ZIPS, tag, "base", "rotations", "unknown.png")
            if not os.path.exists(src):
                missing.append("%s %s -> %s" % (plant, phase, tag))
                continue
            im = Image.open(src).convert("RGBA")
            dst = os.path.join(OUT_PLANTS, "%s-%s.png" % (plant, phase))
            total += save_indexed(im, dst)

    if missing:
        print("MISSING SOURCES:\n  " + "\n  ".join(missing), file=sys.stderr)
        return 1

    sheet = Image.open(GROUND).convert("RGBA")
    for name, (r, c) in LAND.items():
        total += save_indexed(cell(sheet, r, c),
                              os.path.join(OUT_LAND, name + ".png"))
    total += save_indexed(make_grass(sheet),
                          os.path.join(OUT_LAND, "grass.png"), colors=32)

    n = len(PLANTS) * 5 + len(LAND) + 1
    print("%d files, %.1f KB total" % (n, total / 1024))
    print("plants %dx%d, patches %dx%d, grass %dx%d"
          % (32, 32, G_COLS[0][1] - G_COLS[0][0] + 1,
             G_ROWS[1][1] - G_ROWS[1][0] + 1, GRASS_TILE, GRASS_TILE))
    return 0


if __name__ == "__main__":
    sys.exit(main())
