#!/usr/bin/env python3
"""Pack the 8-direction walk GIFs into one sprite sheet.

The source is nine GIFs: eight 4-frame walk cycles, one per compass
direction, plus an idle rotation. They are not used directly. A GIF animates
on its own schedule and cannot be paused, so a gardener standing still would
keep marching on the spot, and nine files is nine requests for something that
fits in one image.

Output is a single PNG, 4 columns by 8 rows, which CSS drives with
background-position for the direction and a steps(4) animation for the walk.
Frame 0 of each row is a standing pose, so idle is just the animation paused
at the first column.

Row order is the compass order the game maps its movement angle onto:
east, south-east, south, south-west, west, north-west, north, north-east.

Usage:  python3 tools/build_character_sheet.py
"""

from PIL import Image, ImageSequence
import os
import sys

SRC = "character"
OUT = "app/art/characters/gardener-walk.png"

# Screen-space clockwise from east, because +y is down in the field.
ROWS = [
    "east", "south-east", "south", "south-west",
    "west", "north-west", "north", "north-east",
]
FRAMES = 4


def main():
    grid = []
    size = None
    for name in ROWS:
        path = os.path.join(SRC, "Idle_walking-4-frames_%s.gif" % name)
        if not os.path.exists(path):
            print("MISSING " + path, file=sys.stderr)
            return 1
        im = Image.open(path)
        frames = [f.convert("RGBA") for f in ImageSequence.Iterator(im)]
        if len(frames) != FRAMES:
            print("%s has %d frames, expected %d" % (name, len(frames), FRAMES),
                  file=sys.stderr)
            return 1
        if size is None:
            size = frames[0].size
        elif frames[0].size != size:
            print("%s is %s, expected %s" % (name, frames[0].size, size),
                  file=sys.stderr)
            return 1
        grid.append(frames)

    w, h = size
    sheet = Image.new("RGBA", (w * FRAMES, h * len(ROWS)), (0, 0, 0, 0))
    for r, frames in enumerate(grid):
        for c, frame in enumerate(frames):
            sheet.paste(frame, (c * w, r * h), frame)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    # Pixel art in a narrow palette. Quantising keeps the hard edges the style
    # depends on, and dithering would destroy them, so it stays off.
    alpha = sheet.getchannel("A").point(lambda v: 255 if v > 128 else 0)
    q = sheet.convert("RGB").quantize(colors=63, method=Image.FASTOCTREE,
                                      dither=Image.NONE)
    q.putpalette(q.getpalette()[:3 * 63] + [0, 0, 0])
    idx, a = q.load(), alpha.load()
    for y in range(q.size[1]):
        for x in range(q.size[0]):
            if a[x, y] == 0:
                idx[x, y] = 63
    q.info["transparency"] = 63
    q.save(OUT, "PNG", optimize=True)

    print("%s  %dx%d  %d frames (%d dirs x %d)  %.1f KB"
          % (OUT, sheet.size[0], sheet.size[1], FRAMES * len(ROWS),
             len(ROWS), FRAMES, os.path.getsize(OUT) / 1024))
    print("cell %dx%d" % (w, h))
    return 0


if __name__ == "__main__":
    sys.exit(main())
