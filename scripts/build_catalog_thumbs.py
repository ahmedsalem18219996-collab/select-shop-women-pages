#!/usr/bin/env python3
"""Build safe, static WOMEN catalog thumbnails (no Supabase writes or secrets)."""
import io
import json
import re
import urllib.request
from pathlib import Path
from PIL import Image, ImageOps, UnidentifiedImageError

CATALOG = "https://byluoipdunralsurwebt.supabase.co/functions/v1/women-store-bridge/catalog"
IMAGE_BASE = "https://byluoipdunralsurwebt.supabase.co/storage/v1/object/public/product-media/media/"
ALLOWED = re.compile(r"^[0-9a-f]{32}\.(?:jpg|png|webp)$")
OUT = Path("assets/catalog-thumbs")
MANIFEST = Path("js/catalog-thumbs.js")
Image.MAX_IMAGE_PIXELS = 25_000_000

def get(url, limit):
    request = urllib.request.Request(url, headers={"Accept": "application/json" if url == CATALOG else "image/*", "User-Agent": "SELECT-SHOP-WOMEN-static-thumbnail-builder/1.0"})
    with urllib.request.urlopen(request, timeout=25) as response:
        content = response.read(limit + 1)
    if len(content) > limit:
        raise ValueError("Download exceeded size limit")
    return content

def main():
    response = json.loads(get(CATALOG, 3_000_000))
    items = response.get("items")
    if not isinstance(items, list):
        raise ValueError("Public catalog is not an item list")
    names = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        url = item.get("image")
        if not isinstance(url, str) or not url.startswith(IMAGE_BASE):
            continue
        name = url[len(IMAGE_BASE):]
        if ALLOWED.fullmatch(name):
            names.add(name)
    if not names:
        raise ValueError("No valid public photos; existing manifest will not be replaced")
    OUT.mkdir(parents=True, exist_ok=True)
    success = []
    total_in = total_out = 0
    for name in sorted(names):
        source = IMAGE_BASE + name
        destination = OUT / (name + ".webp")
        try:
            raw = get(source, 8_000_000)
            with Image.open(io.BytesIO(raw)) as original:
                corrected = ImageOps.exif_transpose(original)
                corrected.thumbnail((560, 746), Image.Resampling.LANCZOS)
                converted = corrected.convert("RGBA" if "A" in corrected.getbands() else "RGB")
                converted.save(str(destination) + ".tmp", "WEBP", quality=76, method=6)
            Path(str(destination) + ".tmp").replace(destination)
            total_in += len(raw)
            total_out += destination.stat().st_size
            success.append(name)
        except (OSError, ValueError, UnidentifiedImageError) as exc:
            print(f"SKIP {name}: {type(exc).__name__}: {exc}")
    if not success:
        raise ValueError("All thumbnails failed; manifest unchanged")
    MANIFEST.write_text("/* Generated from WOMEN public catalog, no private data. */\nwindow.SELECT_THUMBNAILS = Object.freeze(" + json.dumps(sorted(success), ensure_ascii=True, separators=(",", ":")) + ");\n", encoding="utf-8")
    print(f"Optimized {len(success)}/{len(names)} public images; source bytes={total_in}, webp bytes={total_out}, reduction={100*(1-total_out/max(total_in,1)):.1f}%")
    if len(success) != len(names):
        raise ValueError("Some images failed; see logs. Generated files exist locally but job must not commit incomplete set.")

if __name__ == "__main__":
    main()
