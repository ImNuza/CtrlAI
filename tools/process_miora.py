#!/usr/bin/env python3
"""Turn the raw Miora plates into game sprites.

The plates arrive as 1024x1024 PNGs on an opaque warm-parchment background,
about 2MB each. The field they have to sit on is green grass, so the parchment
has to go, and 2MB a sprite would put roughly 70MB on a phone that currently
loads the whole app in well under a megabyte.

Background removal is a flood fill inward from the edges, not a colour
threshold. A threshold keyed on "near the parchment colour" also erases the
white Sampaguita bloom and the pale roots on every plate. Filling only what is
reachable from the border leaves interior light pixels alone.

Usage:  python3 tools/process_miora.py [--src DIR] [--size PX]
"""

from PIL import Image, ImageFilter
from collections import deque
import argparse
import os
import sys

# Verified by eye against contact sheets of every plate. The folder names in
# the drop are not reliable: "bloom/" holds the Wild Orchid and "wilt/" holds
# the Sampaguita, so both are mapped by content rather than by folder.
PLANTS = {
    "orchid": ("bloom", {
        "seed": "Vq9Sh6YyG8336PYk", "sprout": "vazg2J76Uo9rfFWV",
        "grown": "rQ4lzA5tzkHCWgM8", "bloom": "C51ACBFvPvqjx_Gq",
        "wilt": "WLsr1e397eUN5HUD"}),
    "fern": ("fern", {
        "seed": "HrCFbqzQRLZDDEoj", "sprout": "V9qIClxnjybHVWBs",
        "grown": "o-A7OdGFNC-oBrPs", "bloom": "r5JybFCpR9ujiePB",
        "wilt": "jmnxhwaXE1bJVJg1"}),
    "hibiscus": ("hibiscus", {
        "seed": "POX50LiTvNa5ahKI", "sprout": "DgL6KleraCrmwdqw",
        "grown": "2Pgt89tMwK2eHaqx", "bloom": "rXu-VpdeBn-9AlOZ",
        "wilt": "Zqm08juLbYkOZPXT"}),
    "kopi": ("kopi", {
        "seed": "Qfn9mpC_HTGDo3q1", "sprout": "mHyWKCz38w4C49yn",
        "grown": "yPZ1_QbFZAGqmS9X", "bloom": "ebTCxKnIdACwiKuT",
        "wilt": "7m_Ybl3e7mR6Sh9d"}),
    "passion": ("passion-seed", {
        "seed": "XwVeJ0e92x9aQ2IK", "sprout": "tQNR_rLn7gEuvtVc",
        "grown": "u_DvvoFSAxdVY2UK", "bloom": "5nf1-kLMPwxC16To",
        "wilt": "QWf0F9qK2BovhCvx"}),
    "sampaguita": ("wilt", {
        "seed": "aPZY5s4JYXrJw-y6", "sprout": "2l2LqdM-AMElZijK",
        "grown": "-q4jU4AATozeXoHQ", "bloom": "qHGko89k_j0fvrgm",
        "wilt": "JlI_ITXJmPEsD8Az"}),
}

# Tileable grass, and the three patch surfaces the field draws.
LAND = {
    "grass": ("soil and land assets", "-TJpPbTHDhbN0G8w"),
    "patch-bare": ("soil and land assets", "9DK601GoWngra0p9"),
    "patch-tilled": ("soil and land assets", "Y3JanKEs6l80dS-c"),
    "patch-planted": ("soil and land assets", "tqv26Zo8cV1zMX58"),
}

TOLERANCE = 26      # per-channel distance still counted as background
FEATHER = 0.6       # alpha blur radius, kills the stair-stepped cutout edge


def flood_background(img, tolerance=TOLERANCE):
    """Alpha-out every pixel reachable from the border that still looks like
    the parchment. Returns a new RGBA image."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()

    # Sample the corners rather than assuming a colour; plates vary slightly.
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    base = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    def is_bg(p):
        return (abs(p[0] - base[0]) <= tolerance
                and abs(p[1] - base[1]) <= tolerance
                and abs(p[2] - base[2]) <= tolerance)

    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not seen[y * w + x] and is_bg(px[x, y]):
                seen[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[y * w + x] and is_bg(px[x, y]):
                seen[y * w + x] = 1
                q.append((x, y))

    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                if is_bg(px[nx, ny]):
                    seen[ny * w + nx] = 1
                    q.append((nx, ny))

    alpha = Image.frombytes("L", (w, h),
                            bytes(0 if s else 255 for s in seen))
    alpha = alpha.filter(ImageFilter.GaussianBlur(FEATHER))
    img.putalpha(alpha)
    return img


def trim_and_fit(img, size):
    """Crop to what is actually drawn, then letterbox square so every sprite
    shares one baseline and plants do not jump between growth states."""
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    w, h = img.size
    scale = (size * 0.94) / max(w, h)
    img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))),
                     Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # Horizontally centred, sitting on the bottom: these are plants in soil.
    out.paste(img, ((size - img.size[0]) // 2, size - img.size[1]), img)
    return out


def save_rgb(img, path, colors=128):
    """Land textures carry no alpha, so a plain palette is enough."""
    q = img.convert("RGB").quantize(colors=colors, method=Image.FASTOCTREE,
                                    dither=Image.NONE)
    q.save(path, "PNG", optimize=True)
    return os.path.getsize(path)


def save_cutout(img, path, colors=192):
    """Palette PNG with one index reserved for transparency.

    Botanical washes sit in a narrow palette, so 8-bit costs nothing you can
    see at the size a patch actually renders, and it takes a sprite from about
    73KB to about 17KB. Quantising RGBA directly does not work: Pillow drops
    the alpha and every sprite comes back on a black square, so the alpha is
    thresholded and written back as a reserved palette index by hand.

    The cost is a hard cutout edge rather than a feathered one. At the size
    these draw, downscaled by the browser, it is not visible."""
    alpha = img.getchannel("A").point(lambda v: 255 if v > 128 else 0)
    last = colors - 1
    q = img.convert("RGB").quantize(colors=last, method=Image.FASTOCTREE,
                                    dither=Image.NONE)
    q.putpalette(q.getpalette()[:3 * last] + [0, 0, 0])
    idx, a = q.load(), alpha.load()
    w, h = q.size
    for y in range(h):
        for x in range(w):
            if a[x, y] == 0:
                idx[x, y] = last
    q.info["transparency"] = last
    q.save(path, "PNG", optimize=True)
    return os.path.getsize(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="/Users/matth/Documents/assets")
    ap.add_argument("--size", type=int, default=256)
    ap.add_argument("--land-size", type=int, default=256)
    ap.add_argument("--out", default="app/art")
    args = ap.parse_args()

    plants_dir = os.path.join(args.out, "plants")
    land_dir = os.path.join(args.out, "land")
    os.makedirs(plants_dir, exist_ok=True)
    os.makedirs(land_dir, exist_ok=True)

    total = 0
    count = 0
    for seed, (folder, states) in PLANTS.items():
        for state, stem in states.items():
            src = os.path.join(args.src, folder, stem + ".png")
            if not os.path.exists(src):
                print("MISSING " + src, file=sys.stderr)
                continue
            img = flood_background(Image.open(src))
            img = trim_and_fit(img, args.size)
            dst = os.path.join(plants_dir, "%s-%s.png" % (seed, state))
            n = save_cutout(img, dst)
            total += n
            count += 1
            print("%-28s %6.1f KB" % (os.path.basename(dst), n / 1024))

    # Land keeps its background: it IS the ground, so nothing is cut out.
    for name, (folder, stem) in LAND.items():
        src = os.path.join(args.src, folder, stem + ".png")
        if not os.path.exists(src):
            print("MISSING " + src, file=sys.stderr)
            continue
        img = Image.open(src).convert("RGB").resize(
            (args.land_size, args.land_size), Image.LANCZOS)
        dst = os.path.join(land_dir, name + ".png")
        n = save_rgb(img, dst)
        total += n
        count += 1
        print("%-28s %6.1f KB" % (os.path.basename(dst), n / 1024))

    print("\n%d files, %.1f KB total" % (count, total / 1024))


if __name__ == "__main__":
    main()
