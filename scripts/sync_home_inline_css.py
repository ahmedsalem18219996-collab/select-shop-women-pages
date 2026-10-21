#!/usr/bin/env python3
"""Synchronize embedded homepage CSS with the canonical stylesheet.

Only the public WOMEN homepage is changed. Use --check in CI to prevent
silent drift when the linked stylesheet is edited by future storefront work.
"""
import argparse
from pathlib import Path

MARKER = '<style id="women-inline-base-css">\n'
CLOSER = '</style>'
OLD_LINK = '<link rel="stylesheet" href="css/styles.css">'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("html", type=Path)
    parser.add_argument("css", type=Path)
    args = parser.parse_args()
    html = args.html.read_text(encoding="utf-8")
    css = args.css.read_text(encoding="utf-8")
    if CLOSER in css:
        raise SystemExit("STOP: CSS contains closing style tag")
    if html.count(MARKER) == 1:
        before, rest = html.split(MARKER, 1)
        if CLOSER not in rest:
            raise SystemExit("STOP: embedded style not closed")
        _, after = rest.split(CLOSER, 1)
        target = before + MARKER + css + CLOSER + after
    elif html.count(OLD_LINK) == 1 and MARKER not in html:
        target = html.replace(OLD_LINK, MARKER + css + CLOSER)
    else:
        raise SystemExit("STOP: unexpected CSS marker or stylesheet link")
    if OLD_LINK in target:
        raise SystemExit("STOP: duplicate render-blocking stylesheet link")
    if args.check:
        if html != target:
            raise SystemExit("FAIL: inline CSS differs from canonical css/styles.css")
        print("PASS: inline CSS exactly matches canonical stylesheet")
    elif html != target:
        args.html.write_text(target, encoding="utf-8")
        print("Synced homepage inline CSS")
    else:
        print("Already synchronized")


if __name__ == "__main__":
    main()
