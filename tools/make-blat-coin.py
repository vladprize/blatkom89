#!/usr/bin/env python3
"""The BLATS coin (v0.2.19, the owner: «токен BLAT меняем на такой, который на новом баннере»): a red
octagonal gem-coin with facets, lit from the top left, a dark rim and a glint — the coin of the owner's
banner (references/79-blat-banner-*.png) drawn as pixel art for the interface.

Two drawings: 16 px (for the small sizes) and 32 px (for 32 and up); the bigger files are exact 2× / 4×
copies of the 32 px one, so `blatsCoin()` (apps/web/src/ui/coin.ts) always scales a file by a whole number
and every pixel stays square. Writes apps/web/public/assets/ui/blat_coin_{16,32,64,128}.png.

  python3 tools/make-blat-coin.py [out_dir]
"""
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'apps/web/public/assets/ui'

OUTLINE = (30, 3, 3, 255)
GLINT = (255, 246, 232, 255)
# light from the top left: the side of the octagon (clockwise from the top) → how lit it is, 0…1
LIT = [0.82, 0.55, 0.3, 0.12, 0.05, 0.2, 0.5, 1.0]


def mix(a: tuple, b: tuple, t: float) -> tuple:
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3)) + (255,)


DARK_RED, MID_RED, LIGHT_RED = (92, 8, 6), (196, 26, 20), (255, 112, 88)


def shade(t: float, lo=DARK_RED, mid=MID_RED, hi=LIGHT_RED) -> tuple:
    return mix(lo, mid, t / 0.5) if t < 0.5 else mix(mid, hi, (t - 0.5) / 0.5)


def octagon(c: float, r: float) -> list[tuple[float, float]]:
    """Eight corners, the flat sides at the top, the right, the bottom and the left (clockwise from the top left)."""
    k = r * math.tan(math.radians(22.5))
    return [(c - k, c - r), (c + k, c - r), (c + r, c - k), (c + r, c + k), (c + k, c + r), (c - k, c + r), (c - r, c + k), (c - r, c - k)]


def ring(draw: ImageDraw.ImageDraw, outer, inner, colours) -> None:
    """The band between two octagons, one quad per side."""
    for i in range(8):
        j = (i + 1) % 8
        draw.polygon([outer[i], outer[j], inner[j], inner[i]], fill=colours[i])


def coin(size: int) -> Image.Image:
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = (size - 1) / 2
    r0 = size / 2 - 0.5
    small = size <= 16
    r_rim = r0 - (1.0 if small else 1.6)
    r_face = r_rim - (1.6 if small else 3.2)
    r_table = r_face * (0.5 if small else 0.55)
    d.polygon(octagon(c, r0), fill=OUTLINE)
    # the bevelled rim: bright where the light falls, deep red in the shade
    ring(d, octagon(c, r_rim), octagon(c, r_face), [shade(0.25 + 0.75 * t, lo=(70, 6, 5), mid=(170, 22, 17), hi=(255, 92, 70)) for t in LIT])
    # the crown: eight facets from the face's edge to the table, lit the other way round (a cut gem)
    ring(d, octagon(c, r_face), octagon(c - 0.4, r_table), [shade(1.0 - 0.8 * t) for t in LIT])
    # the table, and the light on it
    d.polygon(octagon(c - 0.4, r_table), fill=(234, 44, 34, 255))
    if not small:
        hl = octagon(c - size * 0.07, r_table * 0.45)
        d.polygon(hl, fill=(255, 132, 106, 255))
    else:
        im.putpixel((round(c) - 2, round(c) - 2), (255, 132, 106, 255))
    # the glint at the top right
    gx, gy = round(size * 0.72), round(size * 0.22)
    arm = 1 if small else 3
    for k in range(-arm, arm + 1):
        a = 255 if abs(k) <= 1 else 170
        for x, y in [(gx + k, gy), (gx, gy + k)]:
            if 0 <= x < size and 0 <= y < size:
                im.putpixel((x, y), GLINT[:3] + (a,))
    return im


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    small = coin(16)
    big = coin(32)
    small.save(OUT / 'blat_coin_16.png', optimize=True)
    big.save(OUT / 'blat_coin_32.png', optimize=True)
    big.resize((64, 64), Image.Resampling.NEAREST).save(OUT / 'blat_coin_64.png', optimize=True)
    big.resize((128, 128), Image.Resampling.NEAREST).save(OUT / 'blat_coin_128.png', optimize=True)
    print('blat coin →', OUT)


if __name__ == '__main__':
    main()
