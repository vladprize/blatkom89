#!/usr/bin/env python3
"""BLAT DROP banners (v0.2.17): the owner's two designs made live.

  references/60-blat-drop-banner-menu.png     → the main menu's banner («ANNOUNCE DATE IN»)
  references/61-blat-drop-banner-section.png  → the $BLAT section's banner («COMING SOON…»)

Each design has its countdown painted in (107 / 12 / 34 / 56). The script cuts the banner out of the
mock-up (the menu one sits under a mock navigation bar), wipes the painted digits off the four screens
and saves the clean picture and a strip of the design's own digits, 0–9, cut from the pictures (both
designs together have 0–8; a 9 is the 6 turned over, as in a seven-segment face). The game draws the live
countdown with those digits over the screens (ui/dropBanner.ts), so it looks exactly like the design.

Writes apps/web/public/assets/ui/banners/drop_{menu,section}.jpg and drop_{menu,section}_digits.png and
prints the layout the component uses (the screens' centres, the digits' cell) in the output's pixels.

Also: the Solana and Phantom logos for the $BLAT section (assets/ui/logos/{solana,phantom}.png).
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / 'references'
OUT = ROOT / 'apps/web/public/assets/ui/banners'
LOGOS = ROOT / 'apps/web/public/assets/ui/logos'
WIDTH = 1200

# Where the parts are in the designs (source pixels; measured with a red-digit mask, see the docstring)
MENU = {
    'src': '60-blat-drop-banner-menu.png',
    'crop': (20, 124, 1652, 902),  # the banner without the mock-up's navigation bar and frame
    'digit_y': (521, 578),  # the painted digits' top and bottom
    'groups': [(149, 271), (352, 428), (521, 603), (683, 764)],  # days, hours, minutes, seconds
    # the painted digits, their columns: 1 0 7 | 1 2 | 3 4 | 5 6
    'glyphs': {'1': (149, 179), '0': (189, 225), '7': (234, 271), '2': (392, 428), '3': (521, 557), '4': (566, 603), '5': (683, 720), '6': (728, 764)},
    'cell': (44, 76),
}
SECTION = {
    'src': '61-blat-drop-banner-section.png',
    'crop': (18, 84, 1524, 878),
    'digit_y': (534, 589),
    'groups': [(114, 225), (292, 358), (438, 510), (586, 657)],
    'glyphs': {'1': (114, 142), '8': (152, 185), '0': (193, 225), '2': (326, 358), '3': (438, 470), '4': (476, 510), '5': (586, 618), '6': (626, 657)},
    'cell': (42, 74),
}


def glyph(a: np.ndarray, spec: dict, x0: int, x1: int) -> Image.Image:
    """One digit with its glow: a cell centred on the digit's columns, the digits' rows in the middle."""
    cw, ch = spec['cell']
    cx = (x0 + x1) / 2
    top, bottom = spec['digit_y']
    cy = (top + bottom) / 2
    box = (int(round(cx - cw / 2)), int(round(cy - ch / 2)), int(round(cx - cw / 2)) + cw, int(round(cy - ch / 2)) + ch)
    return Image.fromarray(a[box[1]:box[3], box[0]:box[2]].astype(np.uint8))


def red_light(g: Image.Image) -> Image.Image:
    """The digit's red light alone: opacity from how much redder than the screen a pixel is."""
    a = np.asarray(g.convert('RGB')).astype(float)
    r, gg, b = a[..., 0], a[..., 1], a[..., 2]
    alpha = np.clip((r - np.maximum(gg, b) - 40) / 150, 0, 1) ** 0.8
    rgba = np.dstack([np.clip(r * 1.05, 0, 255), gg, b, alpha * 255]).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')


def clean(a: np.ndarray, spec: dict) -> np.ndarray:
    """Wipes the painted digits: each screen's digit area is filled column by column from the screen just
    above it to the screen just below it, with the screen's faint scan lines put back."""
    out = a.copy().astype(float)
    top, bottom = spec['digit_y']
    y0, y1 = top - 9, bottom + 10
    for gx0, gx1 in spec['groups']:
        x0, x1 = gx0 - 10, gx1 + 11
        above = out[y0 - 3:y0, x0:x1].mean(axis=0)
        below = out[y1:y1 + 3, x0:x1].mean(axis=0)
        n = y1 - y0
        for i in range(n):
            t = i / max(1, n - 1)
            row = above * (1 - t) + below * t
            out[y0 + i, x0:x1] = row * (0.9 if (y0 + i) % 2 else 1.0)
    return out.clip(0, 255)


def make(spec: dict, name: str, extra: dict) -> None:
    src = np.asarray(Image.open(REF / spec['src']).convert('RGB')).astype(float)
    glyphs = {d: glyph(src, spec, *cols) for d, cols in spec['glyphs'].items()}
    for d, g in extra.items():
        glyphs.setdefault(d, g)
    if '9' not in glyphs:
        glyphs['9'] = glyphs['6'].rotate(180)
    cleaned = clean(src, spec)
    x0, y0, x1, y1 = spec['crop']
    banner = Image.fromarray(cleaned[y0:y1, x0:x1].astype(np.uint8))
    scale = WIDTH / banner.width
    banner = banner.resize((WIDTH, round(banner.height * scale)), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    banner.save(OUT / f'drop_{name}.jpg', quality=86, optimize=True, progressive=True)
    cw, ch = spec['cell']
    sw, sh = round(cw * scale), round(ch * scale)
    strip = Image.new('RGBA', (sw * 10, sh), (0, 0, 0, 0))
    for d in range(10):
        g = glyphs[str(d)]
        if g.size != (cw, ch):
            g = g.resize((cw, ch), Image.LANCZOS)
        strip.paste(red_light(g.resize((sw, sh), Image.LANCZOS)), (d * sw, 0))
    strip.save(OUT / f'drop_{name}_digits.png', optimize=True)
    top, bottom = spec['digit_y']
    centres = [round(((gx0 + gx1) / 2 - x0) * scale, 1) for gx0, gx1 in spec['groups']]
    cy = round(((top + bottom) / 2 - y0) * scale, 1)
    pitch = round((spec['glyphs']['0'][0] - spec['glyphs']['1'][0]) * scale, 1)
    print(f"[{name}] {banner.width}x{banner.height}  cell {sw}x{sh}  centres {centres}  y {cy}  pitch {pitch}")
    return glyphs


def logos() -> None:
    LOGOS.mkdir(parents=True, exist_ok=True)
    sol = Image.open(REF / '62-solana-logo.png').convert('RGBA')
    sol.resize((96, 96), Image.LANCZOS).save(LOGOS / 'solana.png', optimize=True)
    ph = Image.open(REF / '63-phantom-logo.jpg').convert('RGB')
    side = min(ph.size)
    ph = ph.crop((0, 0, side, side)).resize((96, 96), Image.LANCZOS)
    # the app-icon look: rounded corners
    mask = Image.new('L', (96 * 4, 96 * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 96 * 4 - 1, 96 * 4 - 1), radius=22 * 4, fill=255)
    out = ph.convert('RGBA')
    out.putalpha(mask.resize((96, 96), Image.LANCZOS))
    out.save(LOGOS / 'phantom.png', optimize=True)
    print('[logos] solana.png, phantom.png')


if __name__ == '__main__':
    menu_src = np.asarray(Image.open(REF / MENU['src']).convert('RGB')).astype(float)
    section_src = np.asarray(Image.open(REF / SECTION['src']).convert('RGB')).astype(float)
    # the digits one design lacks come from the other one
    eight = glyph(section_src, SECTION, *SECTION['glyphs']['8'])
    seven = glyph(menu_src, MENU, *MENU['glyphs']['7'])
    make(MENU, 'menu', {'8': eight})
    make(SECTION, 'section', {'7': seven})
    logos()
