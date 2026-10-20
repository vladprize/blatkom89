#!/usr/bin/env python3
"""Crops the big character illustrations («hero art») from the reference character sheets for the
Arsenal dressing room and the character screen: head and torso from the left side of every sheet,
3:4, with the sheet's logo, title and side panels left out. Requires Pillow.

The sheets in /references are the product owner's art for the characters (see
tools/extract-portraits.py, which takes the in-game portrait panels from the same sheets).
"""
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'apps/web/public/assets/heroes'
SIZE = (360, 480)

# sheet, crop box (x0, y0, x1, y1) in the 1536×1024 sheet — 3:4, below the tagline, left of the title
SHEETS = {
    'petya': ('03-petya-komendant.png', (0, 152, 330, 592)),
    'valuta': ('04-valuta-farcovshik.png', (0, 150, 330, 590)),
    'uchastkovy': ('05-uchastkovy.png', (0, 150, 330, 590)),
    'mihalych': ('06-mihalych-dembel.png', (0, 152, 330, 592)),
    'vorona': ('08-voron-informator.png', (8, 136, 338, 576)),
    'zmeya': ('09-zmeya-iskusitelnica.png', (8, 136, 338, 576)),
    'akula': ('10-akula-biznesmen.png', (22, 136, 352, 576)),
    'varan': ('11-varan-tehnar.png', (10, 136, 340, 576)),
    'leopard': ('12-leopard-naemnik.png', (8, 136, 338, 576)),
    'slon': ('13-slon-krysha.png', (8, 136, 338, 576)),
    'popugay': ('14-popugay-svyaznoy.png', (8, 136, 338, 576)),
    'lobster': ('15-lobster-baryga.png', (8, 136, 338, 576)),
    'piranya': ('16-piranya-bezumec.png', (8, 136, 338, 576)),
    'oryol': ('18-oryol-pendos.png', (70, 136, 400, 576)),
    # v0.23
    'koshka': ('27-koshka-murka.png', (8, 124, 338, 564)),
    'golub': ('28-golub-sizy.png', (8, 136, 338, 576)),
    'tarakan': ('29-tarakan-prusak.png', (8, 130, 338, 570)),
    'krysa': ('30-krysa-sery.png', (8, 136, 338, 576)),
    'lev': ('31-lev-arkadich.png', (8, 136, 338, 576)),
    'buyvol': ('32-buyvol-bugai.png', (8, 136, 338, 576)),
    'nosorog': ('33-nosorog-rogov.png', (8, 136, 338, 576)),
    'gorilla': ('34-gorilla-samson.png', (8, 136, 338, 576)),
    'svinya': ('35-svinya-borka.png', (8, 136, 338, 576)),
    'lisa': ('36-lisa-alisa.png', (8, 112, 338, 552)),
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for cid, (name, box) in SHEETS.items():
        sheet = Image.open(ROOT / 'references' / name).convert('RGB')
        assert sheet.size == (1536, 1024), f'unexpected sheet size {sheet.size} for {name}'
        x0, y0, x1, y1 = box
        assert abs((x1 - x0) * 4 - (y1 - y0) * 3) <= 4, f'{cid}: crop is not 3:4'
        img = sheet.crop(box).resize(SIZE, Image.Resampling.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=2))
        img.save(OUT / f'{cid}.jpg', quality=86, optimize=True, progressive=True)
        print('hero', cid, box)


if __name__ == '__main__':
    main()
