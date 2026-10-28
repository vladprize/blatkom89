#!/usr/bin/env python3
"""Crops the big character illustrations («hero art») from the reference character sheets for the
Arsenal dressing room, the character screen, the dossier and the story's pages: head and shoulders from
the left side of every sheet, 3:4, the head in the middle of the card.

v0.2.17 — the owner: the cards must be symmetric («лиса не по центру и с текстом, слон не по центру —
проверь все 24»). The old crops took the left 330 px of every sheet: the characters look to the right, so
their heads sat in the right third of the card, and the fox's crop caught the sheet's tagline. Now every
crop is 270×360, set so the head (between the middle of the head and the face, measured on every sheet) is
in the middle, and starts under the tagline.

On every sheet the title, the three label boxes («РОЛЬ», «ХАРАКТЕР», «ЦИТАТА») and the КАРТОЧКА paper sit
right of the art, close to the head, so a centred crop reaches into them. There the text is painted over
with the sheet's own dark: right of the line where the text starts (measured on every sheet: the title and
its subtitle down to their last row, the boxes, the paper from its first row) everything that is not the
character turns into the dark of the sheet's panel, with a soft edge; the character himself (a snout, a
cigar, a hand) stays. A background-removal model tells the character from the rest (ISNet «general use»,
ONNX, run with onnxruntime — https://github.com/danielgatis/rembg/releases, isnet-general-use.onnx).

  python3 tools/extract-heroes.py --model <path to isnet-general-use.onnx>

The sheets in /references are the product owner's art for the characters (see
tools/extract-portraits.py, which takes the in-game portrait panels from the same sheets). Requires
Pillow, numpy and onnxruntime.
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'apps/web/public/assets/heroes'
SIZE = (360, 480)

# sheet; crop box (x0, y0, x1, y1) in the 1536×1024 sheet, 3:4; where the sheet's text starts:
# the title with its subtitle (left x, last row), the label boxes (left x), the КАРТОЧКА paper (left x, first row)
SHEETS = {
    'petya': ('03-petya-komendant.png', (95, 142, 365, 502), (361, 278), 379, (358, 535)),
    'valuta': ('04-valuta-farcovshik.png', (69, 143, 339, 503), (324, 278), 381, (386, 508)),
    'uchastkovy': ('05-uchastkovy.png', (107, 138, 377, 498), (343, 252), 385, (386, 508)),
    'mihalych': ('06-mihalych-dembel.png', (72, 144, 342, 504), (321, 262), 383, (380, 530)),
    'vorona': ('08-voron-informator.png', (105, 129, 375, 489), (359, 235), 368, (324, 483)),
    'zmeya': ('09-zmeya-iskusitelnica.png', (123, 140, 393, 500), (369, 235), 371, (326, 488)),
    'akula': ('10-akula-biznesmen.png', (73, 136, 343, 496), (368, 235), 371, (347, 475)),
    'varan': ('11-varan-tehnar.png', (123, 108, 393, 468), (370, 235), 370, (328, 488)),
    'leopard': ('12-leopard-naemnik.png', (98, 133, 368, 493), (363, 225), 371, (346, 501)),
    'slon': ('13-slon-krysha.png', (113, 136, 383, 496), (418, 225), 389, (347, 501)),
    'popugay': ('14-popugay-svyaznoy.png', (103, 135, 373, 495), (353, 235), 369, (349, 501)),
    'lobster': ('15-lobster-baryga.png', (115, 133, 385, 493), (368, 235), 369, (346, 501)),
    'piranya': ('16-piranya-bezumec.png', (86, 156, 356, 516), (351, 235), 369, (346, 475)),
    'oryol': ('18-oryol-pendos.png', (111, 133, 381, 493), (434, 225), 389, (400, 505)),
    # v0.23
    'koshka': ('27-koshka-murka.png', (81, 120, 351, 480), (371, 235), 369, (326, 481)),
    'golub': ('28-golub-sizy.png', (113, 142, 383, 502), (343, 235), 369, (327, 485)),
    'tarakan': ('29-tarakan-prusak.png', (113, 131, 383, 491), (356, 235), 369, (329, 485)),
    'krysa': ('30-krysa-sery.png', (153, 129, 423, 489), (373, 235), 383, (346, 491)),
    'lev': ('31-lev-arkadich.png', (115, 132, 385, 492), (393, 235), 379, (346, 481)),
    'buyvol': ('32-buyvol-bugai.png', (117, 131, 387, 491), (359, 235), 373, (346, 478)),
    'nosorog': ('33-nosorog-rogov.png', (114, 134, 384, 494), (361, 235), 376, (353, 481)),
    'gorilla': ('34-gorilla-samson.png', (119, 131, 389, 491), (365, 235), 373, (346, 485)),
    'svinya': ('35-svinya-borka.png', (126, 134, 396, 494), (376, 235), 379, (349, 481)),
    'lisa': ('36-lisa-alisa.png', (129, 132, 399, 492), (376, 235), 376, (339, 488)),
}

ART = (0, 100, 560, 700)  # the part of the sheet the model looks at: the art and the text next to it
MARGIN = 10  # rows above and below a line of text that are cleared with it
DARK = (15, 8, 8)  # the sheet's panel


def figure_mask(sheet: Image.Image, sess) -> np.ndarray:
    """The character, 0…1, over the whole sheet (ISNet general use: 1024², mean .5, std 1)."""
    art = sheet.crop(ART)
    im = np.asarray(art.resize((1024, 1024), Image.LANCZOS)).astype(np.float32) / 255.0
    x = ((im - 0.5) / 1.0).transpose(2, 0, 1)[None].astype(np.float32)
    pred = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
    pred = (pred - pred.min()) / max(1e-6, pred.max() - pred.min())
    m = np.asarray(Image.fromarray((pred * 255).astype(np.uint8), 'L').resize(art.size, Image.LANCZOS)).astype(np.float32) / 255
    full = np.zeros((sheet.size[1], sheet.size[0]), np.float32)
    full[ART[1]:ART[3], ART[0]:ART[2]] = m
    return full


def text_edge(title: tuple, boxes: int, card: tuple, y: int) -> int:
    """Where the sheet's text starts in row y."""
    if y >= card[1] - MARGIN:
        return min(boxes, card[0])
    edge = boxes
    if y <= title[1] + MARGIN:
        edge = min(edge, title[0])
    return edge


def card_of(sheet: Image.Image, box: tuple, title: tuple, boxes: int, card: tuple, sess) -> Image.Image:
    a = np.asarray(sheet).astype(np.float32)
    h, w = a.shape[:2]
    fig = np.clip((figure_mask(sheet, sess) - 0.3) / 0.4, 0, 1)
    x0, y0, x1, y1 = box
    xs = np.arange(w, dtype=np.float32)
    soft = np.zeros((h, w), np.float32)  # the background darkens over 16 px before the text
    hard = np.zeros((h, w), np.float32)  # from 4 px before the text everything goes, the model's mask too
    for y in range(max(0, y0 - 12), min(h, y1 + 12)):
        e = text_edge(title, boxes, card, y)
        soft[y] = np.clip((xs - (e - 22)) / 16, 0, 1)
        hard[y] = (xs >= e - 4).astype(np.float32)
    soft = np.asarray(Image.fromarray((soft * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2))).astype(np.float32) / 255
    hard = np.asarray(Image.fromarray((hard * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1))).astype(np.float32) / 255
    k = np.maximum(soft * (1 - fig), hard)[..., None]
    dark = np.empty_like(a)
    dark[...] = DARK
    dark += np.random.default_rng(7).normal(0, 3.5, dark.shape)  # the panel's grain
    out = Image.fromarray(np.clip(a * (1 - k) + dark * k, 0, 255).astype(np.uint8))
    return out.crop(box).resize(SIZE, Image.Resampling.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=2))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True, help='isnet-general-use.onnx')
    ap.add_argument('--only', help='comma-separated character ids')
    a = ap.parse_args()
    import onnxruntime as ort

    sess = ort.InferenceSession(a.model, providers=['CPUExecutionProvider'])
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(a.only.split(',')) if a.only else None
    for cid, (name, box, title, boxes, card) in SHEETS.items():
        if only and cid not in only:
            continue
        sheet = Image.open(ROOT / 'references' / name).convert('RGB')
        assert sheet.size == (1536, 1024), f'unexpected sheet size {sheet.size} for {name}'
        x0, y0, x1, y1 = box
        assert abs((x1 - x0) * 4 - (y1 - y0) * 3) <= 4, f'{cid}: crop is not 3:4'
        card_of(sheet, box, title, boxes, card, sess).save(OUT / f'{cid}.jpg', quality=86, optimize=True, progressive=True)
        print('hero', cid, box)


if __name__ == '__main__':
    main()
