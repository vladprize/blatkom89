#!/usr/bin/env python3
"""Extracts the in-game portrait panels («ПОРТРЕТ В ИГРЕ») from the reference character sheets.

The reference sheets in /references were supplied by the product owner as the art direction for the
characters; their portrait panels are explicitly designed as in-game portraits, so they are reused
as UI portraits (character select, HUD, scoreboard). Requires Pillow: pip install pillow
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'apps/web/public/assets/portraits'
SHEETS = {
    'petya': '03-petya-komendant.png',
    'valuta': '04-valuta-farcovshik.png',
    'uchastkovy': '05-uchastkovy.png',
    'mihalych': '06-mihalych-dembel.png',
}
# Inner area of the portrait panel on the 1536x1024 sheets (inside the dashed frame).
BOX = (1340, 74, 1460, 194)

def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for cid, name in SHEETS.items():
        sheet = Image.open(ROOT / 'references' / name).convert('RGB')
        assert sheet.size == (1536, 1024), f'unexpected sheet size {sheet.size} for {name}'
        crop = sheet.crop(BOX)
        crop.save(OUT / f'{cid}.png', optimize=True)
        crop.resize((48, 48), Image.Resampling.BOX).save(OUT / f'{cid}_small.png', optimize=True)
        print('portrait', cid, crop.size)

if __name__ == '__main__':
    main()
