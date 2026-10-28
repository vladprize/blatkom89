#!/usr/bin/env python3
"""Arkadich's card for the prologue (v0.2.17): the owner — «Arkadia Development's line is Lev Arkadich's,
with a pixel construction site behind him, the way Petya's card has its own background».

The lion is cut out of his card's source (references/31-lev-arkadich.png, the same crop as
tools/extract-heroes.py) with a background-removal model (ISNet «general use», ONNX, run with
onnxruntime — https://github.com/danielgatis/rembg/releases, isnet-general-use.onnx) and set over the
construction site of the owner's «Стройка» scene (assets/scenes/stroyka.jpg: the cranes, the frame of
the tower, the sunset). Writes apps/web/public/assets/heroes/arkady_stroyka.jpg (360×480, like every card).

  python3 tools/make-arkady-card.py --model <path to isnet-general-use.onnx> [--debug <dir>]
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / 'references/31-lev-arkadich.png'
CROP = (8, 136, 338, 576)  # tools/extract-heroes.py
SCENE = ROOT / 'apps/web/public/assets/scenes/stroyka.jpg'
SCENE_CROP = (612, 0, 1152, 720)  # the crane over his left shoulder, the hanging crate over his right — no people
OUT = ROOT / 'apps/web/public/assets/heroes/arkady_stroyka.jpg'
SIZE = (360, 480)


def mask_of(img: Image.Image, model: str) -> Image.Image:
    """The figure's mask. The general model (ISNet general use: 1024², mean .5, std 1) finds the head, the
    mane and the fur collar against the derricks; under the shoulders the card is all figure (the coat,
    the gun, the money), so the lower part is kept whole."""
    import onnxruntime as ort

    sess = ort.InferenceSession(model, providers=['CPUExecutionProvider'])
    im = np.asarray(img.convert('RGB').resize((1024, 1024), Image.LANCZOS)).astype(np.float32)
    im = im / max(1.0, im.max())
    x = ((im - 0.5) / 1.0).transpose(2, 0, 1)[None].astype(np.float32)
    pred = sess.run(None, {sess.get_inputs()[0].name: x})[0][0, 0]
    pred = (pred - pred.min()) / max(1e-6, pred.max() - pred.min())
    m = np.asarray(Image.fromarray((pred * 255).astype(np.uint8), 'L').resize(img.size, Image.LANCZOS)).astype(np.float32) / 255
    m = np.clip((m - 0.18) / 0.3, 0, 1)
    h = img.size[1]
    rows = np.arange(h, dtype=np.float32)[:, None]
    body = np.clip((rows - h * 0.5) / (h * 0.08), 0, 1)
    m = np.maximum(m, body)
    return Image.fromarray((m * 255).astype(np.uint8), 'L')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True)
    ap.add_argument('--debug')
    a = ap.parse_args()
    card = Image.open(SHEET).convert('RGB').crop(CROP).resize(SIZE, Image.LANCZOS)
    m = mask_of(card, a.model).filter(ImageFilter.GaussianBlur(0.8))
    bg = Image.open(SCENE).convert('RGB').crop(SCENE_CROP).resize(SIZE, Image.LANCZOS)
    # the site as it is in the scene (the sunset and the black cranes read like the old card's derricks),
    # a thin dark edge around the figure so it stands off the sky
    edge = m.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.5)).point(lambda v: int(v * 0.8))
    bg = Image.composite(Image.new('RGB', SIZE, (14, 5, 5)), bg, edge)
    out = Image.composite(card, bg, m)
    # the card's worn frame comes back over the edges (the same scratched border as every card)
    ring = Image.new('L', SIZE, 0)
    rr = np.zeros((SIZE[1], SIZE[0]), np.float32)
    e = 7
    rr[:e, :] = 1
    rr[-e:, :] = 1
    rr[:, :e] = 1
    rr[:, -e:] = 1
    ring = Image.fromarray((rr * 255).astype(np.uint8), 'L').filter(ImageFilter.GaussianBlur(2))
    out = Image.composite(card, out, ring)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, quality=88, optimize=True, progressive=True)
    if a.debug:
        Path(a.debug).mkdir(parents=True, exist_ok=True)
        m.save(Path(a.debug) / 'arkady_mask.png')
    print('[arkady]', OUT.relative_to(ROOT))


if __name__ == '__main__':
    main()
