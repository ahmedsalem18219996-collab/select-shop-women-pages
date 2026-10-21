#!/usr/bin/env python3
"""Rebuild/check homepage inline font faces from the canonical fonts.css.

Relative font URLs are translated to paths relative to index.html so the
home page works on both the custom domain and GitHub Pages subpaths.
"""
import argparse
from pathlib import Path

MARKER = '<style id="women-inline-fonts-css">\n'
CLOSER = '</style>'
LINK = '<link rel="stylesheet" href="css/fonts.css">'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("html", type=Path)
    parser.add_argument("fonts", type=Path)
    args = parser.parse_args()
    original = args.html.read_text(encoding="utf-8")
    fonts = args.fonts.read_text(encoding="utf-8")
    if CLOSER in fonts or "../assets/fonts/" not in fonts:
        raise SystemExit("STOP: unexpected canonical font stylesheet")
    inline = fonts.replace("../assets/fonts/", "assets/fonts/")
    block = MARKER + inline + CLOSER
    if original.count(MARKER) == 1:
        before, after = original.split(MARKER, 1)
        if CLOSER not in after:
            raise SystemExit("STOP: unclosed font style")
        _, suffix = after.split(CLOSER, 1)
        target = before + block + suffix
    elif original.count(LINK) == 1 and MARKER not in original:
        target = original.replace(LINK, block)
    else:
        raise SystemExit("STOP: unknown font stylesheet layout")
    if LINK in target or target.count(MARKER) != 1:
        raise SystemExit("STOP: duplicate or missing font declarations")
    if args.check:
        if original != target:
            raise SystemExit("FAIL: inline fonts differ from canonical fonts.css")
        print("PASS: homepage embedded font declarations match canonical source")
    elif original != target:
        args.html.write_text(target, encoding="utf-8")
        print("Synced homepage fonts")
    else:
        print("Already synchronized")


if __name__ == "__main__":
    main()
