#!/usr/bin/env python3
"""Package approved card exports as a small, image-per-page slideshow."""
from pathlib import Path
from PIL import Image
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
cards = json.loads((ROOT / 'content/cards.json').read_text())
DIST.mkdir(exist_ok=True)
(DIST / 'slides').mkdir(exist_ok=True)
slides = []
digest = hashlib.sha256()
for card in cards:
    source = ROOT / 'assets/consistent/png' / f'{card["id"]}.png'
    original_bytes = source.read_bytes()
    image_hash = hashlib.sha256(original_bytes).hexdigest()[:12]
    digest.update(original_bytes)
    name = f'{card["id"]}.{image_hash}.webp'
    target = DIST / 'slides' / name
    with Image.open(source) as im:
        assert im.size == (1671, 941), (source, im.size)
        if not target.exists():
            # Lossless encoding preserves every text and engraving pixel.
            im.convert('RGB').save(target, 'WEBP', lossless=True, method=6)
    title = card.get('title') or ('A Field Guide for the Newly Rich' if card['id'] == '00-cover' else 'Dedication')
    slides.append({'id': card['id'], 'title': title, 'image': f'/slides/{name}', 'width': 1671, 'height': 941})
manifest = {'revision': 'deck-' + digest.hexdigest()[:16], 'slides': slides}
(DIST / 'slides.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
for source in (ROOT / 'site').iterdir():
    if source.is_file(): shutil.copy2(source, DIST / source.name)
print(f'Built {len(slides)} lossless slide images, revision {manifest["revision"]}.')
