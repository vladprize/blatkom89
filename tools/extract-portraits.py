#!/usr/bin/env python3
"""Extracts the in-game portrait panels («ПОРТРЕТ В ИГРЕ») from the reference character sheets.

The reference sheets in /references were supplied by the product owner as the art direction for the
characters; their portrait panels are explicitly designed as in-game portraits, so they are reused
as UI portraits (character select, HUD, scoreboard). Requires Pillow + numpy.

The first four sheets share one fixed 120×120 panel. On the later sheets the panel is larger and
moves by a few pixels, so its frame (thin light line) is located per sheet and the largest centred
square inside it is scaled to 120×120.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'apps/web/public/assets/portraits'
FIXED = {
    'petya': '03-petya-komendant.png',
    'valuta': '04-valuta-farcovshik.png',
    'uchastkovy': '05-uchastkovy.png',
    'mihalych': '06-mihalych-dembel.png',
}
DETECT = {
    'vorona': '08-voron-informator.png',
    'zmeya': '09-zmeya-iskusitelnica.png',
    'akula': '10-akula-biznesmen.png',
    'varan': '11-varan-tehnar.png',
    'leopard': '12-leopard-naemnik.png',
    'slon': '13-slon-krysha.png',
    'popugay': '14-popugay-svyaznoy.png',
    'lobster': '15-lobster-baryga.png',
    'piranya': '16-piranya-bezumec.png',
}
# Inner area of the portrait panel on the first four 1536x1024 sheets (inside the dashed frame).
BOX = (1340, 74, 1460, 194)


def frame_box(img: Image.Image) -> tuple[int, int, int, int]:
    """Square crop inside the portrait frame of a 1536×1024 sheet."""
    a = np.asarray(img).astype(int)
    lum = a[..., 0] * 0.3 + a[..., 1] * 0.59 + a[..., 2] * 0.11
    sat = a.max(-1) - a.min(-1)
    line = ((lum > 110) & (sat < 90)).astype(int)

    def col(xa: int, xb: int) -> int:
        return xa + int(np.argmax(line[80:200, xa:xb].sum(0)))

    def row(ya: int, yb: int) -> int:
        return ya + int(np.argmax(line[ya:yb, 1335:1475].sum(1)))

    left, right = col(1316, 1332), col(1478, 1496)
    top, bottom = row(60, 76), row(206, 224)
    x0, x1, y0, y1 = left + 4, right - 3, top + 4, bottom - 3
    side = min(x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    return (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)


def save(cid: str, crop: Image.Image) -> None:
    big = crop if crop.size == (120, 120) else crop.resize((120, 120), Image.Resampling.LANCZOS)
    big.save(OUT / f'{cid}.png', optimize=True)
    crop.resize((48, 48), Image.Resampling.LANCZOS if crop.size != (120, 120) else Image.Resampling.BOX).save(OUT / f'{cid}_small.png', optimize=True)
    print('portrait', cid, crop.size)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for cid, name in FIXED.items():
        sheet = Image.open(ROOT / 'references' / name).convert('RGB')
        assert sheet.size == (1536, 1024), f'unexpected sheet size {sheet.size} for {name}'
        save(cid, sheet.crop(BOX))
    for cid, name in DETECT.items():
        sheet = Image.open(ROOT / 'references' / name).convert('RGB')
        assert sheet.size == (1536, 1024), f'unexpected sheet size {sheet.size} for {name}'
        save(cid, sheet.crop(frame_box(sheet)))


if __name__ == '__main__':
    main()
