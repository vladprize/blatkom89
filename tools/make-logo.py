#!/usr/bin/env python3
"""Renders the БЛАТКОМ ’89 wordmark (distressed red condensed letters, star with brass knuckles,
'89 in marker) following the poster reference (references/01-poster.png). Requires Pillow."""
import math
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

ROOT = Path(__file__).resolve().parent.parent
FONTS = Path('/home/claude/vendor-src/gfonts')
OUT = ROOT / 'apps/web/public/assets/ui'
RED = (196, 44, 36, 255)
BEIGE = (226, 214, 186, 255)

def star(draw, cx, cy, r, fill):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.42
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    draw.polygon(pts, fill=fill)

def distress(img, seed, amount=0.16):
    rnd = random.Random(seed)
    w, h = img.size
    mask = Image.new('L', (w, h), 255)
    d = ImageDraw.Draw(mask)
    for _ in range(int(w * h * amount / 900)):
        x, y = rnd.randrange(w), rnd.randrange(h)
        r = rnd.choice([1, 1, 2, 2, 3, 5])
        d.ellipse([x - r, y - r, x + r, y + r], fill=0)
    for _ in range(int(w / 9)):
        x, y = rnd.randrange(w), rnd.randrange(h)
        pts = [(x, y)]
        for _ in range(rnd.randint(4, 12)):
            x += rnd.randint(-9, 9)
            y += rnd.randint(-5, 5)
            pts.append((x, y))
        d.line(pts, fill=0, width=rnd.choice([1, 1, 2]))
    a = img.getchannel('A')
    img.putalpha(ImageChops.multiply(a, mask))
    return img

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    W, H = 1500, 640
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    # wordmark
    f = ImageFont.truetype(str(FONTS / 'ofl/oswald/Oswald[wght].ttf'), 250)
    try:
        f.set_variation_by_axes([700])
    except Exception:
        pass
    word = 'БЛАТКОМ'
    tw = ImageDraw.Draw(img).textbbox((0, 0), word, font=f)
    text = Image.new('RGBA', (tw[2] + 40, tw[3] + 40), (0, 0, 0, 0))
    ImageDraw.Draw(text).text((20, 0), word, font=f, fill=RED)
    text = text.resize((int(text.width * 1.06), int(text.height * 1.22)), Image.Resampling.LANCZOS)
    # drips
    rnd = random.Random(89)
    dd = ImageDraw.Draw(text)
    bbox = text.getbbox()
    for _ in range(9):
        x = rnd.randint(bbox[0] + 30, bbox[2] - 30)
        col = [y for y in range(bbox[3] - 1, bbox[1], -1) if text.getpixel((x, y))[3] > 200]
        if col:
            y0 = col[0]
            L = rnd.randint(8, 38)
            dd.rectangle([x - 2, y0, x + 2, y0 + L], fill=RED)
            dd.ellipse([x - 4, y0 + L - 3, x + 4, y0 + L + 5], fill=RED)
    text = distress(text, 7, 0.22)
    text = text.crop(text.getbbox())
    # dark shadow
    shadow = Image.new('RGBA', text.size, (0, 0, 0, 0))
    shadow.putalpha(text.getchannel('A').point(lambda a: int(a * 0.85)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(3))
    ox, oy = 40, 104
    img.alpha_composite(shadow, (ox + 8, oy + 10))
    img.alpha_composite(text, (ox, oy))
    # '89
    fm = ImageFont.truetype(str(FONTS / 'apache/permanentmarker/PermanentMarker-Regular.ttf'), 132)
    n = Image.new('RGBA', (420, 260), (0, 0, 0, 0))
    ImageDraw.Draw(n).text((10, 10), '’89', font=fm, fill=BEIGE)
    n = distress(n.rotate(4, resample=Image.Resampling.BICUBIC), 11, 0.12)
    img.alpha_composite(n, (ox + text.width - 26, 60))
    # star with brass knuckles + wings
    d = ImageDraw.Draw(img)
    cx = ox + text.width // 2 - 10
    for s in (-1, 1):
        d.polygon([(cx + s * 60, 58), (cx + s * 330, 70), (cx + s * 60, 70)], fill=(150, 30, 26, 255))
        d.line([(cx + s * 70, 82), (cx + s * 300, 86)], fill=(150, 30, 26, 255), width=3)
    star(d, cx, 58, 56, RED)
    for i in range(4):
        x = cx - 27 + i * 18
        d.ellipse([x - 9, 52, x + 9, 70], outline=(20, 14, 12, 255), width=5)
        d.ellipse([x - 6, 55, x + 6, 67], outline=BEIGE, width=2)
    d.rounded_rectangle([cx - 36, 66, cx + 36, 80], radius=6, fill=(20, 14, 12, 255))
    d.rounded_rectangle([cx - 33, 68, cx + 33, 77], radius=5, fill=BEIGE)
    # tagline band
    band_y = oy + text.height + 4
    d.rectangle([ox + 30, band_y, ox + text.width - 20, band_y + 52], fill=(12, 10, 9, 235))
    ft = ImageFont.truetype(str(FONTS / 'ofl/oswald/Oswald[wght].ttf'), 34)
    try:
        ft.set_variation_by_axes([500])
    except Exception:
        pass
    tag = 'Р А Й О Н Н Ы Е   Д Е Л А  —  С Е Р Ь Ё З Н Ы Е   Д Е Л А'
    tb = d.textbbox((0, 0), tag, font=ft)
    d.text((ox + 30 + (text.width - 50 - (tb[2] - tb[0])) / 2, band_y + 4), tag, font=ft, fill=BEIGE)
    bbox = img.getbbox()
    img = img.crop((max(0, bbox[0] - 8), max(0, bbox[1] - 8), min(W, bbox[2] + 8), min(H, bbox[3] + 8)))
    img.save(OUT / 'logo.png', optimize=True)
    small = img.resize((img.width // 2, img.height // 2), Image.Resampling.LANCZOS)
    small.save(OUT / 'logo_small.png', optimize=True)
    print('logo', img.size)

if __name__ == '__main__':
    main()
