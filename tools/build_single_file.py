#!/usr/bin/env python3
"""Fold app/ into one self-contained HTML file.

For preview hosts that serve a single page and block external requests. The
real deploy target is EdgeOne Pages serving app/ as a directory, which this
does not replace; see DEPLOY.md.

Everything is inlined as data URIs, and three things are rewritten because a
single file cannot do what a directory can:

- Google Fonts are dropped. A strict CSP blocks the request, and the CSS font
  stack already falls back to Georgia and system-ui.
- The service worker registration is stripped. There is no separate sw.js to
  register, and leaving it in only produces a console error.
- Plant sprite paths are built at runtime from the seed and growth state, so
  a plain find-and-replace cannot reach them. The lookup is redirected
  through an injected map instead.

The source files are never modified; every rewrite happens on a copy.

Usage:  python3 tools/build_single_file.py [--out dist/garden-of-life.html]
"""

import argparse
import base64
import os
import re
import sys

APP = "app"


def data_uri(path):
    ext = os.path.splitext(path)[1].lower()
    mime = {".png": "image/png", ".jpg": "image/jpeg",
            ".svg": "image/svg+xml"}.get(ext, "application/octet-stream")
    with open(path, "rb") as fh:
        return "data:%s;base64,%s" % (mime, base64.b64encode(fh.read()).decode())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="dist/garden-of-life.html")
    ap.add_argument("--fragment", action="store_true",
                    help="emit body content only, for hosts that supply their "
                         "own document skeleton")
    args = ap.parse_args()

    for name in ("index.html", "styles.css", "game.js"):
        if not os.path.exists(os.path.join(APP, name)):
            print("MISSING " + name, file=sys.stderr)
            return 1

    html = open(os.path.join(APP, "index.html"), encoding="utf-8").read()
    css = open(os.path.join(APP, "styles.css"), encoding="utf-8").read()
    js = open(os.path.join(APP, "game.js"), encoding="utf-8").read()

    # Every png under app/, keyed by the path the app asks for.
    art = {}
    for root, _dirs, files in os.walk(os.path.join(APP, "art")):
        for f in files:
            if f.lower().endswith(".png"):
                full = os.path.join(root, f)
                key = os.path.relpath(full, APP).replace(os.sep, "/")
                art[key] = data_uri(full)

    # CSS: url("art/...") -> url(data:...)
    def css_sub(m):
        key = m.group(1)
        return "url(%s)" % art[key] if key in art else m.group(0)
    css = re.sub(r'url\(["\']?(art/[^"\')]+)["\']?\)', css_sub, css)

    # JS: the one runtime-built path, redirected through the injected map.
    before = js
    js = js.replace(
        "  return `art/plants/${plant.seedId}-${state}.png`;",
        "  return __ART__[`art/plants/${plant.seedId}-${state}.png`] "
        "|| `art/plants/${plant.seedId}-${state}.png`;")
    if js == before:
        print("plant sprite path not found; the source shape changed",
              file=sys.stderr)
        return 1

    # Visitors resolve the same way, so their sprites work the moment the art
    # lands without this script needing another edit.
    js = js.replace(
        'return `<img class="visitor-art" src="art/visitors/${v.id}.png"',
        'return `<img class="visitor-art" '
        'src="${__ART__[`art/visitors/${v.id}.png`] '
        '|| `art/visitors/${v.id}.png`}"')

    # JS: drop the service worker block, there is no file to register.
    js = re.sub(r"if \('serviceWorker' in navigator\) \{.*?\n\}\n?",
                "/* service worker removed for the single-file build */\n",
                js, flags=re.S)

    art_js = "const __ART__=%s;\n" % (
        "{" + ",".join('"%s":"%s"' % (k, v) for k, v in sorted(art.items())) + "}")

    # HTML: drop external fonts and the manifest, inline the rest.
    html = re.sub(r'\s*<link rel="preconnect"[^>]*>', "", html)
    html = re.sub(r'\s*<link href="https://fonts\.googleapis\.com[^>]*>', "", html)
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', "", html)
    html = re.sub(r'\s*<link rel="stylesheet" href="styles\.css">',
                  "\n<style>\n" + css + "\n</style>", html)
    for tag in ("icon", "apple-touch-icon"):
        html = re.sub(r'(<link rel="%s" href=")(icons/[^"]+)(")' % tag,
                      lambda m: m.group(1) + data_uri(os.path.join(APP, m.group(2)))
                      + m.group(3), html)
    html = html.replace('<script src="game.js"></script>',
                        "<script>\n" + art_js + js + "\n</script>")

    if args.fragment:
        """Some hosts wrap the file in their own doctype, head and body. A
        second full document nested inside that one does not render, so keep
        the title and everything between the body tags and drop the rest."""
        title = re.search(r"<title>(.*?)</title>", html, re.S)
        style = re.search(r"<style>.*?</style>", html, re.S)
        body = re.search(r"<body[^>]*>(.*?)</body>", html, re.S)
        if not (style and body):
            print("could not split the document for --fragment", file=sys.stderr)
            return 1
        html = ("<title>%s</title>\n%s\n%s"
                % (title.group(1) if title else "Garden of Life",
                   style.group(0), body.group(1)))

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(html)

    size = os.path.getsize(args.out)
    print("%s  %.0f KB  (%d sprites inlined)" % (args.out, size / 1024, len(art)))
    if 'src="game.js"' in html or 'href="styles.css"' in html:
        print("WARNING: an external reference survived", file=sys.stderr)
        return 1
    # Only url() and src/href count. The __ART__ keys are supposed to look
    # like paths, so matching bare "art/..." anywhere flagged the map itself.
    # Only url() and src/href count, and anything still holding a ${} is a
    # template literal inside the script rather than a real reference.
    left = [r for r in (re.findall(r'url\((?!data:)([^\)]+)\)', html)
                        + re.findall(r'(?:src|href)="(?!data:|#)([^"]+)"', html))
            if "${" not in r]
    if left:
        print("WARNING: unresolved references: %s" % sorted(set(left))[:5],
              file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
