#!/usr/bin/env python3
"""
v0.2.23: the fighter cards' full-height art (docs/ART_DIRECTION.md §6).

The owner's pictures (1024×1536, generated from each character's portrait with docs/FULLBODY_PROMPTS.md) have a thin
red frame line near their edges; the card draws its own frame, so the line is cut off here. The result is a JPEG of
600 px wide (about 600×914) in apps/web/public/assets/fullbody/<id>.jpg — what the cards draw (a 340 px poster at
2× still has enough), about 100–200 KB. A copy of each original (JPEG, quality 92) goes to references/fullbody/.

Usage: python3 tools/make-fullbody.py <id>=<picture> [<id>=<picture> …]
Then list the ids in apps/web/src/ui/fullbody.ts (FULLBODY).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'apps/web/public/assets/fullbody'
REF = ROOT / 'references/fullbody'
WIDTH = 600
RATIO = 1.5233  # height / width once the frame is off (1488 / 976 on a 1024×1536 picture)


def frame_inset(redness: np.ndarray) -> int:
    """How many pixels from this edge the frame line ends: the reddest run within 32 px (not a red floor's glow)."""
    head = redness[:32]
    peak = int(np.argmax(head))
    if head[peak] < 40:
        return 0
    end = peak
    while end + 1 < len(redness) and redness[end + 1] > head[peak] * 0.5:
        end += 1
    return end + 4


def process(cid: str, src: Path) -> None:
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.int32)
    h, w, _ = a.shape
    red = a[..., 0] - (a[..., 1] + a[..., 2]) / 2
    mid_rows = red[h // 5 : h - h // 5]
    mid_cols = red[:, w // 5 : w - w // 5]
    left = frame_inset(mid_rows.mean(axis=0))
    right = frame_inset(mid_rows.mean(axis=0)[::-1])
    top = frame_inset(mid_cols.mean(axis=1))
    bottom = frame_inset(mid_cols.mean(axis=1)[::-1])
    box = [left, top, w - right, h - bottom]
    # the same proportions for every picture: trim the longer side evenly
    bw, bh = box[2] - box[0], box[3] - box[1]
    want_h = round(bw * RATIO)
    if bh > want_h:
        cut = bh - want_h
        box[1] += cut // 2
        box[3] -= cut - cut // 2
    elif bh < want_h:
        want_w = round(bh / RATIO)
        cut = bw - want_w
        box[0] += cut // 2
        box[2] -= cut - cut // 2
    art = im.crop(tuple(box)).resize((WIDTH, round(WIDTH * RATIO)), Image.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    REF.mkdir(parents=True, exist_ok=True)
    out = OUT / f'{cid}.jpg'
    art.save(out, 'JPEG', quality=84, optimize=True, progressive=True)
    im.save(REF / f'{cid}.jpg', 'JPEG', quality=92, optimize=True)
    print(f'{cid}: frame {left}/{top}/{right}/{bottom} → {art.size[0]}×{art.size[1]}, {out.stat().st_size // 1024} KB')


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    for arg in sys.argv[1:]:
        cid, _, path = arg.partition('=')
        if not cid or not path:
            sys.exit(f'bad argument: {arg} (want <id>=<picture>)')
        process(cid, Path(path))


if __name__ == '__main__':
    main()
