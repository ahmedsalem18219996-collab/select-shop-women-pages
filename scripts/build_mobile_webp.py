#!/usr/bin/env python3
"""Build mobile-focused responsive WebP derivatives from already checked-in public thumbs."""
import json
from pathlib import Path
from PIL import Image, ImageOps

root = Path("assets/catalog-thumbs")
manifest = Path("js/catalog-thumbs.js").read_text(encoding="utf-8")
names = json.loads(manifest.split("Object.freeze(", 1)[1].split(");", 1)[0])
assert len(names) >= 30 and len(names) == len(set(names))
total_source = total_small = 0
for name in names:
    original = root / (name + ".webp")
    dest = root / (name + ".w400.webp")
    if not original.is_file():
        raise FileNotFoundError(original)
    with Image.open(original) as img:
        corrected = ImageOps.exif_transpose(img)
        corrected.thumbnail((400, 534), Image.Resampling.LANCZOS)
        corrected.save(dest, "WEBP", quality=70, method=6)
    with open(dest, "rb") as f:
        assert f.read(4) == b"RIFF", str(dest)
    total_source += original.stat().st_size
    total_small += dest.stat().st_size
assert total_small < total_source, "responsive derivatives were not smaller"
print(f"PASS {len(names)} w400 images; 560w={total_source} bytes; 400w={total_small} bytes; saved={100*(1-total_small/total_source):.1f}%")
