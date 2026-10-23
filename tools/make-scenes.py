#!/usr/bin/env python3
"""The big pictures of places (v0.2.14): the owner's illustrations in references/40…50-scene-*.png become
apps/web/public/assets/scenes/<id>.jpg (1600×900, behind the story's comic pages and on a map's loading
screen) and scenes/thumbs/<id>.jpg (640×360, a mission's row in the story hub). A 16:9 centre crop.

Usage: python3 tools/make-scenes.py   (needs Pillow)
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
REFS = ROOT / 'references'
OUT = ROOT / 'apps/web/public/assets/scenes'

# the reference → the scene id used by apps/web/src/story/scenes.ts
SCENES = {
    '40-scene-kladbishche.png': 'cemetery',
    '41-scene-univermag.png': 'univermag',
    '42-scene-krasnaya-ploshchad.png': 'square',
    '43-scene-dk.png': 'dk',
    '44-scene-stroyka.png': 'stroyka',
    '45-scene-bolnica.png': 'hospital',
    '46-scene-dvor.png': 'yard',
    '47-scene-garazhi.png': 'garages',
    '48-scene-prohodnaya.png': 'factory',
    '49-scene-pionerlager.png': 'camp',
    '50-scene-2089.png': 'hall2089',
}


def crop169(im: Image.Image) -> Image.Image:
    w, h = im.size
    tw, th = w, round(w * 9 / 16)
    if th > h:
        th, tw = h, round(h * 16 / 9)
    left, top = (w - tw) // 2, (h - th) // 2
    return im.crop((left, top, left + tw, top + th))


def main() -> None:
    (OUT / 'thumbs').mkdir(parents=True, exist_ok=True)
    for ref, sid in SCENES.items():
        im = crop169(Image.open(REFS / ref).convert('RGB'))
        big = im.resize((1600, 900), Image.LANCZOS)
        big.save(OUT / f'{sid}.jpg', 'JPEG', quality=80, optimize=True, progressive=True)
        big.resize((640, 360), Image.LANCZOS).save(OUT / 'thumbs' / f'{sid}.jpg', 'JPEG', quality=72, optimize=True, progressive=True)
        print(f'{ref} → scenes/{sid}.jpg')


if __name__ == '__main__':
    main()
