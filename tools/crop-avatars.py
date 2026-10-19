#!/usr/bin/env python3
"""Cuts the 24 profile avatars out of the product owner's sheet (references/23-avatars.png: round
pixel-art portraits on black, 6 columns × 4 rows) into apps/web/public/assets/avatars/<id>.jpg,
192×192. Each circle is found by its bounds on the black background; the square crop sits a few
pixels inside the circle's edge and the game draws it as a circle (CSS border-radius), so the black
corners never show. Requires Pillow and NumPy.

The ids (and their order) must match AVATAR_IDS in packages/shared/src/game-rules/avatars.ts.
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / 'references/23-avatars.png'
OUT = ROOT / 'apps/web/public/assets/avatars'
SIZE = 192
# row by row, as on the sheet
IDS = [
    'shades', 'tracksuit', 'blonde', 'ushanka', 'flatcap', 'balaclava',
    'bob', 'resort', 'thinker', 'agent', 'smoker', 'dog',
    'veteran', 'hood', 'brick', 'tattoo', 'furcoat', 'panama',
    'militia', 'disco', 'shotgun', 'babushka', 'driver', 'tram',
]


# The circles of neighbouring rows almost touch (rows 3 and 4 overlap by a few pixels), so the rows
# are separated by fixed windows measured on this sheet (1586×992); columns are found automatically.
ROW_WINDOWS = [(5, 258), (258, 505), (505, 742), (740, 990)]


def bands(profile, threshold, min_len=50):
    """Runs of indices where the profile is above the threshold (the circles along one axis)."""
    out, start = [], None
    for i, v in enumerate(profile):
        if v > threshold and start is None:
            start = i
        if v <= threshold and start is not None:
            if i - start >= min_len:
                out.append((start, i - 1))
            start = None
    if start is not None and len(profile) - start >= min_len:
        out.append((start, len(profile) - 1))
    return out


def main():
    im = Image.open(SHEET).convert('RGB')
    ink = np.asarray(im).astype(int).max(axis=2) > 14
    columns = bands(ink.sum(axis=0), 5)
    assert len(columns) == 6, columns
    OUT.mkdir(parents=True, exist_ok=True)
    k = 0
    for y0, y1 in ROW_WINDOWS:
        for x0, x1 in columns:
            sub = ink[y0:y1, max(0, x0 - 12):x1 + 12]
            cols = np.where(sub.sum(axis=0) > 2)[0]
            rows = np.where(sub.sum(axis=1) > 2)[0]
            left, right = max(0, x0 - 12) + cols[0], max(0, x0 - 12) + cols[-1]
            top, bottom = y0 + rows[0], y0 + rows[-1]
            cx, cy = (left + right) / 2, (top + bottom) / 2
            d = max(right - left, bottom - top) - 6  # a little inside the edge
            box = (round(cx - d / 2), round(cy - d / 2), round(cx + d / 2), round(cy + d / 2))
            im.crop(box).resize((SIZE, SIZE), Image.LANCZOS).save(OUT / f'{IDS[k]}.jpg', quality=88, optimize=True, progressive=True)
            print(IDS[k], box)
            k += 1
    assert k == len(IDS)


if __name__ == '__main__':
    main()
