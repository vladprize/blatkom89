#!/usr/bin/env python3
"""The menu's art from the owner's pictures (v0.2.19): the BLATS banner (the owner: «замени на главной странице
баннер BLAT на тот, который я тебе прикрепил» — references/79-blat-banner-ru.png, 80-blat-banner-en.png) and the
Arsenal tile («замени иконку ARSENAL на новую, и на русском и на англ» — 81-arsenal-tile-ru.png, 82-…-en.png).

The owner's banner is 2:1; the menu has a wide strip for it (under the Dossier and the Arsenal, one screen on
a phone and on a laptop), so the same pieces are laid out side by side at 4:1: the pile of coins with its rays
on the left, «ПОКУПАЙ BLAT» / «SHOP BLAT» with its line under it on the right, the skyline along the bottom.
The English line read «SKWNS»: the word is set right from the banner's own letters (the «I» of «EPIC» in the
cream of the line, the «N» of «AND»).

The Arsenal tile is the owner's card as it is, cut out of the picture it came in (the bits of the next cards
at its sides left out).

Writes apps/web/public/assets/ui/blats_banner_{ru,en}.jpg (1600×400), arsenal_tile_{ru,en}.jpg (the card,
1167×977 → 700 px wide) and references/80-blat-banner-en-fixed.png (the owner's English banner with the word
fixed, for the record — not shipped).

  python3 tools/make-menu-art.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / 'references'
OUT = ROOT / 'apps/web/public/assets/ui'
W, H = 1600, 400
BG = (11, 3, 3)


def letters(a: np.ndarray, box: tuple, kind: str) -> list[tuple[np.ndarray, tuple]]:
    """The letters in a box: (mask in the box, bounding box in the image), left to right."""
    x0, y0, x1, y1 = box
    band = a[y0:y1, x0:x1].astype(int)
    r, g, b = band[..., 0], band[..., 1], band[..., 2]
    if kind == 'cream':
        m = (r > 120) & (g > 90) & (b > 50) & (np.abs(r - g) < 90)
    else:  # the purple of «EPIC»
        m = (r > 70) & (b > 70) & (g < 120) & (b > g + 30)
    lab, n = ndimage.label(m)
    out = []
    for i in range(1, n + 1):
        ys, xs = np.where(lab == i)
        if len(xs) < 30:
            continue
        out.append((lab == i, (xs.min() + x0, ys.min() + y0, xs.max() + x0, ys.max() + y0)))
    return sorted(out, key=lambda t: t[1][0])


def fix_skins(en: Image.Image) -> Image.Image:
    """«SKWNS» → «SKINS» from the banner's own glyphs."""
    a = np.asarray(en.convert('RGB')).astype(np.float32)
    out = a.copy()
    band = (555, 620)
    word = letters(a.astype(np.uint8), (1185, band[0], 1372, band[1]), 'cream')  # S, K, the bad «IN», S
    assert len(word) == 4, [b for _, b in word]
    s1, k, bad, s2 = word
    # take the bad pair away (not its neighbours): the band's own black where it was
    x0, y0 = 1185, band[0]
    keep = ndimage.binary_dilation(s1[0] | k[0] | s2[0], iterations=2)
    gone = ndimage.binary_dilation(bad[0], iterations=3) & ~keep
    ys, xs = np.where(gone)
    rng = np.random.default_rng(3)
    out[ys + y0, xs + x0] = np.array(BG, np.float32) + rng.normal(0, 1.2, (len(xs), 3))

    # the cream of the line, row by row (the letters are lighter at the top), measured on the K
    ky, kx = np.where(k[0])
    cream_rows = {}
    for y in np.unique(ky):
        px = a[y + y0, kx[ky == y] + x0]
        bright = px[px.max(axis=1) > 150]
        if len(bright):
            cream_rows[int(y + y0)] = bright.mean(axis=0)

    def cream_at(y: int) -> np.ndarray:
        near = min(cream_rows, key=lambda r: abs(r - y))
        return cream_rows[near]

    def paste(src_mask: np.ndarray, src_box: tuple, at_x: int, recolour: bool) -> None:
        """A glyph (with its soft edge) moved to at_x; recoloured to the line's cream by how bright it is."""
        bx0, by0 = src_box
        m = ndimage.binary_dilation(src_mask, iterations=2)
        ys, xs = np.where(m)
        src = a[ys + by0, xs + bx0]
        dy = 1 if recolour else 0
        ty, tx = ys + by0 + dy, xs + bx0 + (at_x - (bx0 + np.where(src_mask)[1].min()))
        if not recolour:
            out[ty, tx] = np.maximum(out[ty, tx], src)
            return
        lum = src.max(axis=1)
        t = np.clip((lum - 12) / (185 - 12), 0, 1)[:, None]
        col = np.stack([cream_at(int(y)) for y in ty])
        out[ty, tx] = np.maximum(out[ty, tx], np.array(BG, np.float32) * (1 - t) + col * t)

    epic = letters(a.astype(np.uint8), (548, band[0], 690, band[1]), 'purple')
    i_mask, i_box = epic[2][0], (548, band[0])  # E, P, I, C
    and_ = letters(a.astype(np.uint8), (690, band[0], 820, band[1]), 'cream')
    n_mask, n_box = and_[1][0], (690, band[0])  # A, N, D
    k_right = k[1][2]
    paste(i_mask, i_box, k_right - 6, True)
    paste(n_mask, n_box, k_right - 6 + 20, False)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def feather(im: Image.Image, r: int) -> Image.Image:
    """A soft alpha edge, r px wide."""
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rectangle((r, r, im.width - 1 - r, im.height - 1 - r), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(r / 2))
    out = im.convert('RGBA')
    out.putalpha(m)
    return out


def compose(art: Image.Image) -> Image.Image:
    art = art.convert('RGB')
    c = Image.new('RGB', (W, H), BG)
    # a glow behind the coins, as on the banner
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse((-60, -140, 700, 500), fill=170)
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    c = Image.composite(Image.new('RGB', (W, H), (128, 12, 9)), c, glow)
    # the skyline along the bottom: the banner's blocks of flats without the sun and the arrow, side by side
    # (inside the banner's frame: its red lines run 20 px and 45 px in from every edge)
    left, right = art.crop((56, 636, 704, 838)), art.crop((1070, 636, 1718, 838))
    pw, ph = left.size
    strip = Image.new('RGB', (pw * 4, ph), BG)
    for i, piece in enumerate((left, right, left.transpose(Image.Transpose.FLIP_LEFT_RIGHT), right.transpose(Image.Transpose.FLIP_LEFT_RIGHT))):
        strip.paste(piece, (i * pw, 0))
    sh = 128
    strip = strip.resize((int(strip.width * sh / ph), sh), Image.Resampling.LANCZOS).crop((0, 0, W, sh))
    m = Image.new('L', strip.size, 0)
    ImageDraw.Draw(m).rectangle((0, 22, W, sh), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(14))
    c.paste(strip, (0, H - sh), m)
    # the coins with their rays (the banner's top middle), over the skyline
    coins = art.crop((596, 58, 1136, 378))
    ch = 352
    coins = coins.resize((int(coins.width * ch / coins.height), ch), Image.Resampling.LANCZOS)
    c.paste(feather(coins, 34), (6, 14), feather(coins, 34))
    # the title and its line on the right
    title = art.crop((200, 368, 1560, 552))
    tw = 930
    k = tw / title.width
    title = title.resize((tw, int(title.height * k)), Image.Resampling.LANCZOS)
    tx, ty = 628, 58
    c.paste(feather(title, 8), (tx, ty), feather(title, 8))
    line = art.crop((410, 552, 1370, 616))
    line = line.resize((int(line.width * k), int(line.height * k)), Image.Resampling.LANCZOS)
    c.paste(feather(line, 6), (tx + (tw - line.width) // 2, ty + title.height + 4), feather(line, 6))
    return c


def arsenal_tile(art: Image.Image) -> Image.Image:
    """The card: the red frame and everything in it (the owner's picture shows the next cards' edges at its sides)."""
    card = art.convert('RGB').crop((138, 48, 1305, 1025))
    return card.resize((700, round(700 * card.height / card.width)), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for lang, name in (('ru', '81-arsenal-tile-ru.png'), ('en', '82-arsenal-tile-en.png')):
        arsenal_tile(Image.open(REF / name)).save(OUT / f'arsenal_tile_{lang}.jpg', quality=86, optimize=True, progressive=True)
        print('arsenal tile', lang)
    ru = Image.open(REF / '79-blat-banner-ru.png')
    en = fix_skins(Image.open(REF / '80-blat-banner-en.png'))
    en.save(REF / '80-blat-banner-en-fixed.png', optimize=True)
    for lang, art in (('ru', ru), ('en', en)):
        compose(art).save(OUT / f'blats_banner_{lang}.jpg', quality=86, optimize=True, progressive=True)
        print('banner', lang)


if __name__ == '__main__':
    main()
