#!/usr/bin/env python3
"""«Стрелка» (блатняк 90-х) — «Районные дела» as a 90s Russian blatnoy / restaurant-chanson instrumental,
made for the owner to hear (5 Nov 2026); not in the game. Every sound is synthesised here — the band of a
90s keyboard workstation on a worn cassette: a drum machine (a gated-reverb snare, a tambourine, toms), a
synth bass playing bass-and-chord under the seven-string guitar's off-beat strums (Karplus–Strong), the
accordion with three detuned reeds playing the theme, a «synth sax» for the verse, a DX-style electric
piano, a string pad and brass stabs. No recordings, no samples.

124 BPM, A minor with the harmonic minor's G♯; the last chorus a semitone up (B♭ minor), the way 90s
songs did it. 84 bars (2:44):
  0–7    intro — the guitar's fingerpicking, then the accordion's climb, a fill
  8–23   chorus — the theme on the accordion (Am – F – Dm – E), the second time with the strings
  24–39  verse — the circle of fifths (Am – Dm – G – C – F – Dm – E7 – Am), the sax's tune, the accordion's
         answers, the electric piano
  40–55  chorus — fuller: the strings an octave under the accordion, brass stabs, the tambourine
  56–63  bridge — an Odessa polka in double time, the accordion's runs; F7 turns the key
  64–79  the last chorus in B♭ minor
  80–83  the ending: «та-да-дам», a roll, «пам!»

Usage: python3 tools/music/compose_blatnyak.py [out.wav]   — deterministic: the same file every run.
"""
import os
import sys
import wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve, lfilter, resample_poly
from scipy.ndimage import minimum_filter1d

SR = 44100
BPM = 124.0
BEAT = 60.0 / BPM
STEP = BEAT / 4
BAR = BEAT * 4
BARS = 84
PRE = 0.7  # the cassette's click and hiss before the music
LEN = int(round((PRE + BARS * BAR) * SR))
TAIL = int(3.5 * SR)
N = LEN + TAIL
MASTER_DRIVE = 0.9
LEVEL = dict(kick=1.0, snare=0.5, hat=1.1, tamb=0.63, tom=0.45, crash=0.3, bass=0.6, gtr=0.62, acc=0.7, fill=1.05, sax=0.24,
             ep=0.125, str=0.63, brass=1.6, fx=0.5)
rng = np.random.default_rng(901989)


# ── helpers ─────────────────────────────────────────────────────────────────
def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def lp(x, f, order=2):
    return sosfilt(butter(order, min(f, SR / 2 - 300) / (SR / 2), 'low', output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f / (SR / 2), 'high', output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo / (SR / 2), min(hi, SR / 2 - 300) / (SR / 2)], 'band', output='sos'), x)


def sweep(x, curve, kind='low', block=128):
    y = np.empty_like(x)
    zi = np.zeros((1, 2))
    for i in range(0, len(x), block):
        f = float(np.clip(curve[i], 25, SR / 2 - 400))
        y[i:i + block], zi = sosfilt(butter(2, f / (SR / 2), kind, output='sos'), x[i:i + block], zi=zi)
    return y


def place(buf, x, t):
    i = int(round(t * SR))
    if i < 0:
        x = x[-i:]
        i = 0
    if i >= len(buf):
        return
    j = min(len(buf), i + len(x))
    buf[i:j] += x[: j - i]


def T(bar, step=0.0):
    return PRE + bar * BAR + step * STEP


def noise(n):
    return rng.standard_normal(n)


def saw(f, tt, phase=0.0):
    return 2 * ((f * tt + phase) % 1.0) - 1


# ── chords ──────────────────────────────────────────────────────────────────
PC = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}
QUAL = {'': (0, 4, 7), 'm': (0, 3, 7), '7': (0, 4, 7, 10)}


def parse(ch):
    root, q = (ch[:2], ch[2:]) if len(ch) > 1 and ch[1] == 'b' else (ch[:1], ch[1:])
    return PC[root], QUAL[q]


def tones(ch, tr, lo, hi):
    r, iv = parse(ch)
    pcs = {(r + i + tr) % 12 for i in iv}
    return [n for n in range(lo, hi + 1) if n % 12 in pcs]


def bass_root(ch, tr=0):
    return 33 + ((parse(ch)[0] + tr - 9) % 12)  # A1 … G♯2


def gtr_bass(ch, tr=0):
    return 38 + ((parse(ch)[0] + tr - 2) % 12)  # the seven-string's D2 … C♯3


HOOK = ['Am', 'F', 'Dm', 'E', 'Am', 'F', 'Dm|E', 'Am']
VERSE1 = ['Am', 'Dm', 'G', 'C', 'F', 'Dm', 'E7', 'Am']
VERSE2 = ['Am|A7', 'Dm', 'G', 'C', 'F', 'Dm', 'E7', 'Am']
BRIDGE = ['Am', 'E7', 'E7', 'Am', 'Dm', 'Am', 'E7', 'F7']
OUTRO = ['Dm|E', 'Am', 'Am', 'Am']
SECTIONS = [(0, 'intro', HOOK, 0), (8, 'chorus1', HOOK + HOOK, 0), (24, 'verse', VERSE1 + VERSE2, 0), (40, 'chorus2', HOOK + HOOK, 0),
            (56, 'bridge', BRIDGE, 0), (64, 'chorus3', HOOK + HOOK, 1), (80, 'outro', OUTRO, 1)]


def where(bar):
    for b0, name, chords, tr in reversed(SECTIONS):
        if bar >= b0:
            return name, bar - b0, chords[bar - b0], tr
    raise ValueError(bar)


def halves(chord):
    """[(first step, chord)] — one chord a bar, or two half-bar ones («Dm|E»)."""
    parts = chord.split('|')
    return [(0, parts[0])] if len(parts) == 1 else [(0, parts[0]), (8, parts[1])]


# ── the tunes ───────────────────────────────────────────────────────────────
# the theme (from «Районные дела»), 8 bars over HOOK: (step, midi, length in 16ths)
HOOK_MEL = [
    (0, 69, 6), (6, 71, 2), (8, 72, 4), (12, 71, 1), (13, 72, 1), (14, 76, 2),
    (16, 77, 6), (22, 76, 2), (24, 77, 2), (26, 76, 2), (28, 74, 2), (30, 72, 2),
    (32, 74, 6), (38, 72, 2), (40, 74, 4), (44, 77, 4),
    (48, 76, 0.5), (48.5, 77, 0.5), (49, 76, 7), (56, 74, 2), (58, 72, 2), (60, 71, 2), (62, 68, 2),
    (64, 69, 4), (68, 72, 2), (70, 76, 2), (72, 81, 6), (78, 80, 2),
    (80, 81, 4), (84, 77, 4), (88, 76, 4), (92, 74, 2), (94, 76, 2),
    (96, 77, 4), (100, 76, 2), (102, 74, 2), (104, 71, 2), (106, 72, 2), (108, 71, 2), (110, 68, 2),
    (112, 69, 10), (124, 64, 2), (126, 68, 2),
]
HOOK_GRACE = [(16, 76), (72, 80), (96, 76)]
# the verse's tune for the sax, 8 bars over VERSE1/VERSE2 — a phrase and its sequence a step down
VERSE_MEL = [
    (0, 76, 4), (4, 69, 2), (6, 71, 2), (8, 72, 4), (12, 71, 2), (14, 69, 2),
    (16, 77, 6), (22, 76, 2), (24, 74, 8),
    (32, 74, 4), (36, 67, 2), (38, 69, 2), (40, 71, 4), (44, 69, 2), (46, 67, 2),
    (48, 76, 6), (54, 74, 2), (56, 72, 8),
    (64, 72, 4), (68, 65, 2), (70, 67, 2), (72, 69, 4), (76, 72, 4),
    (80, 74, 4), (84, 77, 4), (88, 81, 4), (92, 79, 2), (94, 77, 2),
    (96, 76, 8), (104, 74, 2), (106, 72, 2), (108, 71, 2), (110, 68, 2),
    (112, 69, 10), (124, 64, 4),
]
VERSE_GRACE = [(16, 76), (48, 74), (88, 79)]
# the accordion answers where the sax holds a note
ACC_FILLS = [(24, 69, 2), (26, 74, 2), (28, 77, 2), (30, 74, 2), (56, 67, 2), (58, 72, 2), (60, 76, 2), (62, 72, 2),
             (116, 76, 2), (118, 72, 2), (120, 69, 2), (122, 64, 2)]
# the bridge: the accordion's 16ths, a bar each
FIG = {
    'Am': [69, 72, 76, 81, 80, 81, 76, 72, 69, 72, 76, 81, 83, 81, 80, 81],
    'E7': [68, 71, 74, 77, 76, 74, 71, 68, 64, 68, 71, 74, 77, 76, 74, 71],
    'E7b': [80, 77, 74, 71, 74, 77, 80, 83, 86, 83, 80, 77, 74, 71, 68, 64],
    'Am2': [81, 76, 72, 69, 72, 76, 81, 84, 83, 81, 80, 81, 76, 72, 69, 64],
    'Dm': [74, 77, 81, 86, 84, 81, 77, 74, 72, 74, 77, 81, 80, 81, 77, 74],
}
BRIDGE_FIGS = ['Am', 'E7', 'E7b', 'Am2', 'Dm', 'Am', 'E7', None]
F7_RUN = [65, 69, 72, 75, 77, 81, 84, 87, 84, 81, 77, 75]  # beats 2–4 of the F7 bar: up to the new key

# ── buses ───────────────────────────────────────────────────────────────────
B = {k: np.zeros(N) for k in ('kick', 'snare', 'hat', 'tamb', 'tom', 'crash', 'bass', 'gtr', 'acc', 'fill', 'sax', 'ep', 'str', 'brass', 'fx')}


# ── instruments ─────────────────────────────────────────────────────────────
def pluck(f, dur, t60=2.0, bright=0.55, damp_after=None):
    """A plucked steel string (Karplus–Strong, an all-pass for exact tuning)."""
    n = int(dur * SR)
    P = SR / f
    L = int(np.floor(P - 0.5))
    frac = P - 0.5 - L
    if frac < 0.15:
        L -= 1
        frac += 1.0
    c = (1 - frac) / (1 + frac)
    g = 10 ** (-3 / (f * t60))
    a = np.zeros(L + 3)
    a[0] = 1.0
    a[1] += c
    a[L] -= g * 0.5 * c
    a[L + 1] -= g * 0.5 * (1 + c)
    a[L + 2] -= g * 0.5
    m = int(P)
    k = 1 - bright
    exc = lfilter([1 - k], [1, -k], rng.uniform(-1, 1, m))
    sh = max(1, int(0.12 * P))
    exc[sh:] -= 0.9 * exc[:-sh]
    x = np.zeros(n)
    x[:m] = exc
    y = lfilter([1.0, c], a, x)
    if damp_after is not None and damp_after * SR < n:
        i = int(damp_after * SR)
        y[i:] *= np.exp(-np.arange(n - i) / SR / 0.03)
    return y


def strum(t, notes, amp=1.0, up=False, damp=0.16):
    order = notes[::-1] if up else notes
    for i, nn in enumerate(order):
        x = pluck(midi(nn), damp + 0.25, t60=1.4, bright=0.62 if up else 0.58, damp_after=damp)
        place(B['gtr'], x * amp * (0.55 if up else 0.8), t + i * (0.007 if up else 0.011))


def reed(f, dur, amp=1.0):
    """An accordion note: three reeds a few cents apart (the musette's beating), a bellows swell."""
    n = int((dur + 0.09) * SR)
    t = np.arange(n) / SR
    ks = np.arange(1, max(2, int(7000 / f)) + 1)
    ak = ks ** -0.75 * (1 + 1.3 * np.exp(-(((ks * f) - 1400) / 800) ** 2))
    y = np.zeros(n)
    for det, w in ((-6.0, 0.8), (0.0, 1.0), (6.5, 0.8)):
        base = 2 * np.pi * f * 2 ** (det / 1200) * t + rng.uniform(0, 2 * np.pi)
        for kk, a_ in zip(ks, ak):
            y += w * a_ * np.sin(kk * base + 0.3 * kk)
    y /= ak.sum() * 2.6
    env = np.minimum(1, t / 0.02) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.03))
    env *= 1 + 0.035 * np.sin(2 * np.pi * 5.2 * t)
    return y * env * amp


def play(bus, mel, bar0, tr=0, amp=1.0, lo=0, hi=1e9, grace=(), voice=None, shift=0):
    """Lays a tune (steps from `bar0`'s start), only its notes with lo <= step < hi."""
    voice = voice or reed
    for st, note, ln in mel:
        if lo <= st < hi:
            acc = 1.0 if st % 16 == 0 else (0.92 if st % 4 == 0 else 0.85)
            place(bus, voice(midi(note + tr + shift), ln * STEP * 0.96, amp * acc), T(bar0, st - lo))
    for st, note in grace:
        if lo <= st < hi:
            place(bus, voice(midi(note + tr + shift), 0.035, amp * 0.6), T(bar0, st - lo) - 0.04)


def sax(f, dur, amp=1.0):
    """A 90s keyboard's sax: a scoop up into the note, vibrato that comes late, the horn's formants, breath."""
    n = int((dur + 0.12) * SR)
    t = np.arange(n) / SR
    cents = -55 * np.exp(-t / 0.035) + 22 * np.sin(2 * np.pi * 5.3 * t) * np.clip((t - 0.22) / 0.3, 0, 1)
    ph = np.cumsum(f * 2 ** (cents / 1200)) / SR
    src = np.zeros(n)
    for kk in range(1, int(7500 / f) + 1):
        src += np.sin(2 * np.pi * kk * ph) / kk
    x = bp(src, 380, 750) * 1.2 + bp(src, 1100, 1900) * 0.9 + bp(src, 2400, 3600) * 0.35 + 0.12 * src
    x = np.tanh(1.6 * x)
    env = np.minimum(1, t / 0.045) * np.where(t < dur, 1.0 - 0.15 * np.minimum(1, t / max(dur, 0.01)), np.exp(-(t - dur) / 0.07))
    breath = bp(noise(n), 1800, 6500) * 0.06 * env
    return (x * env + breath) * amp


def ep(f, dur, amp=1.0):
    """A DX-style electric piano (two-operator FM and a tine)."""
    n = int((dur + 0.6) * SR)
    t = np.arange(n) / SR
    i1 = 1.8 * np.exp(-t / 0.4) + 0.25
    i2 = 1.1 * np.exp(-t / 0.018)
    y = np.sin(2 * np.pi * f * t + i1 * np.sin(2 * np.pi * f * t) + i2 * np.sin(2 * np.pi * 14 * f * t))
    env = np.minimum(1, t / 0.002) * np.exp(-t / 1.4) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.12))
    return y * env * amp


def strings(t0, notes, dur, amp=1.0, attack=0.22):
    """A string-machine chord: seven detuned saws a note, a slow swell."""
    n = int((dur + 0.5) * SR)
    tt = np.arange(n) / SR
    x = np.zeros(n)
    for nn in notes:
        for d in (-0.009, -0.006, -0.003, 0.0, 0.003, 0.006, 0.009):
            x += saw(midi(nn) * (1 + d), tt, rng.uniform())
    env = np.minimum(1, tt / attack) * np.where(tt < dur, 1.0, np.exp(-(tt - dur) / 0.25))
    place(B['str'], lp(x / 7, 3800) * env * amp * 0.25, t0)


def brass(t0, notes, dur=0.22, amp=1.0):
    """A brass stab: saws through a filter that opens and closes."""
    n = int((dur + 0.2) * SR)
    tt = np.arange(n) / SR
    x = np.zeros(n)
    for nn in notes:
        for d in (-0.004, 0.0, 0.004):
            x += saw(midi(nn) * (1 + d), tt, rng.uniform())
    cut = 700 + 3800 * np.exp(-tt / 0.07) * np.minimum(1, tt / 0.012)
    env = np.minimum(1, tt / 0.01) * np.where(tt < dur, 1.0 - 0.3 * tt / dur, np.exp(-(tt - dur) / 0.06))
    place(B['brass'], np.tanh(1.3 * sweep(x / (3 * len(notes)) * env, cut, 'low')) * amp, t0)


def sbass(t0, note, dur, amp=1.0):
    """A 90s synth bass: saw, square and a sine under them, a filter that closes after the pluck."""
    n = int((dur + 0.06) * SR)
    tt = np.arange(n) / SR
    f = midi(note)
    x = 0.6 * saw(f, tt) + 0.4 * np.sign(np.sin(2 * np.pi * f * tt)) + 0.7 * np.sin(2 * np.pi * f * tt)
    x = sweep(x, 450 + 2000 * np.exp(-tt / 0.06), 'low')
    env = np.minimum(1, tt / 0.003) * (0.75 + 0.25 * np.exp(-tt / 0.12)) * np.where(tt < dur, 1.0, np.exp(-(tt - dur) / 0.02))
    place(B['bass'], np.tanh(1.3 * x * env) * amp, t0)


# ── the drum machine ────────────────────────────────────────────────────────
def kick(t, amp=1.0):
    n = int(0.32 * SR)
    tt = np.arange(n) / SR
    f = 48 + 115 * np.exp(-tt / 0.028)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.15)
    click = hp(noise(n) * np.exp(-tt / 0.002), 2500) * 0.3
    place(B['kick'], amp * np.tanh(1.6 * (body + click)), t)


def snare(t, amp=1.0):
    n = int(0.3 * SR)
    tt = np.arange(n) / SR
    tone = (np.sin(2 * np.pi * 185 * tt) + 0.6 * np.sin(2 * np.pi * 330 * tt)) * np.exp(-tt / 0.05)
    nz = bp(noise(n), 1200, 9000) * np.exp(-tt / 0.1)
    place(B['snare'], amp * np.tanh(1.5 * (0.6 * tone + nz)), t)


def hat(t, amp=1.0, open_=False):
    n = int((0.25 if open_ else 0.05) * SR)
    tt = np.arange(n) / SR
    place(B['hat'], amp * 0.45 * hp(noise(n), 8000, 4) * np.exp(-tt / (0.09 if open_ else 0.014)), t)


def tamb(t, amp=1.0):
    n = int(0.14 * SR)
    tt = np.arange(n) / SR
    x = np.zeros(n)
    for k in range(4):  # the jingles, a few ms apart
        off = 0.005 * k
        x += bp(noise(n), 6500, 13000) * np.exp(-np.maximum(tt - off, 0) / 0.03) * (tt >= off)
    place(B['tamb'], amp * 0.3 * x, t)


def tom(t, f0, amp=1.0):
    n = int(0.45 * SR)
    tt = np.arange(n) / SR
    f = f0 * (1 + 0.45 * np.exp(-tt / 0.02)) * (1 - 0.2 * tt / 0.45)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.17) + bp(noise(n), 300, 3000) * np.exp(-tt / 0.02) * 0.3
    place(B['tom'], amp * np.tanh(1.4 * x), t)


_cn = int(2.4 * SR)
_ct = np.arange(_cn) / SR
CRASH = hp(noise(_cn), 4000) * np.exp(-_ct / 0.7)
for _k, _fq in enumerate((3310.0, 4820.0, 6170.0, 7590.0)):
    CRASH += 0.05 * np.sin(2 * np.pi * _fq * _ct + _k) * np.exp(-_ct / 0.5)


def crash(t, amp=1.0):
    place(B['crash'], CRASH * amp, t)


def tom_fill(bar, start=12):
    for i, (st, f0) in enumerate(((start, 210), (start + 1, 180), (start + 2, 140), (start + 3, 110))):
        tom(T(bar, st), f0, 0.8 + 0.05 * i)


def snare_roll(bar, s0, s1, a0=0.3, a1=1.0, fine_from=None):
    """16ths from s0 to s1 (32nds from `fine_from`), getting louder."""
    pts = []
    s = s0
    while s < s1 - 1e-9:
        pts.append(s)
        s += 0.5 if fine_from is not None and s >= fine_from else 1.0
    for i, s in enumerate(pts):
        snare(T(bar, s), a0 + (a1 - a0) * i / max(1, len(pts) - 1))


# ═══ the song, bar by bar ═══════════════════════════════════════════════════════════════════════
for bar in range(BARS):
    name, i, chord, tr = where(bar)
    hv = halves(chord)
    nxt_tr = where(bar + 1)[3] if bar + 1 < BARS else tr
    full = name in ('chorus2', 'chorus3')

    # ── the guitar ──
    if name == 'intro':
        for k, (s0, ch) in enumerate(hv):
            nt = tones(ch, tr, 57, 71)[:3]
            gb = gtr_bass(ch, tr)
            g5 = gb + 7 if gb + 7 <= 50 else gb - 5
            pat = [gb, nt[0], nt[1], nt[2], g5, nt[2], nt[1], nt[0]] if len(hv) == 1 else [gb, nt[0], nt[1], nt[2]]
            for j, nn in enumerate(pat):
                place(B['gtr'], pluck(midi(nn), 1.4, t60=2.2, bright=0.5) * (0.75 if j == 0 or j == 4 else 0.5), T(bar, s0 + 2 * j))
    elif name == 'bridge':
        if i < 7:
            for st in (2, 6, 10, 14):
                strum(T(bar, st), tones(chord, tr, 55, 68), 0.75, damp=0.07)
    elif name == 'outro' and i >= 2:
        pass
    else:
        amp = (0.5 if i < 8 else 0.62) if name == 'verse' else 0.85
        ch2 = hv[-1][1]
        strum(T(bar, 4), tones(hv[0][1], tr, 55, 68), amp)
        strum(T(bar, 12), tones(ch2, tr, 55, 68), amp)
        strum(T(bar, 14), tones(ch2, tr, 55, 68)[-3:], amp * 0.8, up=True, damp=0.07)

    # ── the bass ──
    if name == 'intro':
        if i == 7:  # a walk up into the chorus
            for st, nn in ((8, 40), (10, 42), (12, 44), (14, 44)):
                sbass(T(bar, st), nn, STEP * 1.8, 0.8)
    elif name == 'bridge':
        if i < 7:
            r = bass_root(chord, tr)
            f5 = r + 7 if r + 7 <= 47 else r - 5
            for st, nn in ((0, r), (4, f5), (8, r), (12, f5)):
                sbass(T(bar, st), nn, STEP * 1.7, 1.0)
        else:
            sbass(T(bar, 0), bass_root('F7', 0), STEP * 3, 1.0)
    elif name == 'outro':
        if i <= 1:
            for s0, ch in hv:
                r = bass_root(ch, tr)
                sbass(T(bar, s0), r, STEP * (3.5 if len(hv) > 1 else 7), 1.0)
        elif i == 2:
            sbass(T(bar, 0), bass_root('Am', tr), STEP * 3, 1.0)
        else:
            sbass(T(bar, 0), bass_root('Am', tr), BEAT * 2.5, 1.0)
    else:
        ba = 0.8 if name == 'verse' and i < 8 else 1.0
        if len(hv) == 1:
            r = bass_root(chord, tr)
            f5 = r + 7 if r + 7 <= 47 else r - 5
            sbass(T(bar, 0), r, STEP * 3.5, ba)
            sbass(T(bar, 8), f5 if not (full and i % 2 == 1) else r + 12 if r + 12 <= 50 else f5, STEP * 3.5, 0.9 * ba)
            nr = bass_root(where(bar + 1)[2].split('|')[0], nxt_tr) if bar + 1 < BARS else r
            if nr != r and (i % 2 == 1 or full):  # a passing note into the next chord
                sbass(T(bar, 14), nr - 1 if nr - 1 > r else nr + 2, STEP * 1.6, 0.8)
        else:
            for s0, ch in hv:
                r = bass_root(ch, tr)
                f5 = r + 7 if r + 7 <= 47 else r - 5
                sbass(T(bar, s0), r, STEP * 3.5, 1.0)
                sbass(T(bar, s0 + 4), f5, STEP * 3.5, 0.85)

    # ── the drums ──
    if name == 'intro':
        if i == 7:
            snare_roll(bar, 8, 16, 0.25, 0.9, fine_from=12)
            kick(T(bar, 0), 0.6)
    elif name == 'bridge':
        if i < 7:
            for st in (0, 4, 8, 12):
                kick(T(bar, st), 0.9)
            for st in (2, 6, 10, 14):
                snare(T(bar, st), 0.62)
                tamb(T(bar, st), 0.9)
            if i == 6:
                tom_fill(bar, 12)
        else:  # the F7 bar: a hit, then the roll up to the new key
            kick(T(bar, 0), 1.0)
            crash(T(bar, 0), 0.8)
            snare_roll(bar, 4, 16, 0.2, 1.0, fine_from=12)
    elif name == 'outro':
        if i == 0:
            for st in (0, 8):
                kick(T(bar, st))
            for st in (4, 12):
                snare(T(bar, st))
            for st in range(2, 16, 4):
                hat(T(bar, st), 0.6)
        elif i == 1:  # «та-да-дам»
            for st in (0, 3, 6):
                kick(T(bar, st), 1.0)
                snare(T(bar, st), 0.9)
            snare_roll(bar, 12, 16, 0.2, 0.6)
        elif i == 2:  # «пам!», then the roll
            kick(T(bar, 0), 1.0)
            crash(T(bar, 0), 1.0)
            snare_roll(bar, 4, 16, 0.15, 1.0, fine_from=8)
        else:  # the last «пам!»
            kick(T(bar, 0), 1.0)
            snare(T(bar, 0), 1.0)
            crash(T(bar, 0), 1.1)
    else:
        light = name == 'verse' and i < 8
        kick(T(bar, 0), 0.75 if light else 1.0)
        kick(T(bar, 8), 0.7 if light else 0.95)
        if i % 4 == 3 and not light:
            kick(T(bar, 6), 0.7)
        for st in (4, 12):
            snare(T(bar, st), 0.75 if light else 1.0)
        for st in range(0, 16, 2):
            hat(T(bar, st), (0.7 if st % 4 == 2 else 0.4) * (0.6 if light else 1.0))
        if full or (name == 'verse' and i >= 8):
            for st in range(2, 16, 4):
                tamb(T(bar, st), 0.8)
        elif name == 'chorus1':
            for st in (4, 12):
                tamb(T(bar, st), 0.7)
        if i % 4 == 3:
            hat(T(bar, 14), 0.5, open_=True)
        if i == 0 and name != 'verse':
            crash(T(bar, 0), 0.8)
        if full and i == 8 or (name == 'chorus3' and i % 4 == 0 and i):
            crash(T(bar, 0), 0.6)

    # ── the accordion, the sax, the piano, the strings, the brass ──
    if name == 'intro':
        if i >= 4:
            play(B['acc'], HOOK_MEL, bar, tr, 0.6, lo=64 + (i - 4) * 16, hi=64 + (i - 3) * 16, grace=HOOK_GRACE)
        if i >= 6:
            for s0, ch in hv:
                strings(T(bar, s0), tones(ch, tr, 60, 76), (16 - s0 if len(hv) == 1 else 8) * STEP, 0.55 + 0.2 * (i - 6))
    elif name in ('chorus1', 'chorus2', 'chorus3'):
        k = i % 8
        lo, hi = k * 16, (k + 1) * 16
        play(B['acc'], HOOK_MEL, bar, tr, 1.0, lo=lo, hi=hi, grace=HOOK_GRACE)
        if name == 'chorus3':
            play(B['acc'], HOOK_MEL, bar, tr, 0.32, lo=lo, hi=hi, shift=12)
        second = name != 'chorus1' or i >= 8
        if second:  # the strings: the chords, and the tune an octave down
            for s0, ch in hv:
                strings(T(bar, s0), tones(ch, tr, 57, 72), (16 - s0 if len(hv) == 1 else 8) * STEP, 0.65)
            for st, note, ln in HOOK_MEL:
                if lo <= st < hi and ln >= 2:
                    strings(T(bar, st - lo), [note + tr - 12], ln * STEP * 0.95, 0.5, attack=0.05)
        if full and (k % 4 == 0 or (name == 'chorus3' and k % 2 == 0)):
            brass(T(bar, 0), tones(hv[0][1], tr, 60, 74) + [tones(hv[0][1], tr, 48, 59)[0]], 0.25, 0.9)
        if name in ('chorus2', 'chorus3') and k == 7 and i == 15:
            # «та-да» into what follows
            nc = where(bar + 1)[2].split('|')[0] if bar + 1 < BARS else 'Am'
            ntr = where(bar + 1)[3] if bar + 1 < BARS else tr
            for st in (10, 12):
                brass(T(bar, st), tones(nc, ntr, 60, 74), 0.12, 0.8)
            tom_fill(bar, 12)
        elif name == 'chorus1' and i == 15:
            tom_fill(bar, 12)
    elif name == 'verse':
        k = i % 8
        lo, hi = k * 16, (k + 1) * 16
        play(B['sax'], VERSE_MEL, bar, tr, 1.0, lo=lo, hi=hi, grace=VERSE_GRACE if i >= 8 else (), voice=sax)
        play(B['fill'], ACC_FILLS, bar, tr, 0.85, lo=lo, hi=hi)
        for s0, ch in hv:  # the piano on the beat and off it
            for st, ln, a in ((s0, 5, 0.7), (s0 + 6, 2, 0.5)) if len(hv) == 1 else ((s0, 3, 0.7), (s0 + 6, 1.5, 0.45)):
                for nn in tones(ch, tr, 60, 72):
                    place(B['ep'], ep(midi(nn), ln * STEP, a), T(bar, st))
            if len(hv) == 1:
                for nn in tones(ch, tr, 60, 72):
                    place(B['ep'], ep(midi(nn), 2 * STEP, 0.45), T(bar, 10))
        if i >= 8:
            for s0, ch in hv:
                strings(T(bar, s0), tones(ch, tr, 60, 76), (16 - s0 if len(hv) == 1 else 8) * STEP, 0.55)
        if i == 15:
            tom_fill(bar, 12)
    elif name == 'bridge':
        if i < 7:
            fig = FIG[BRIDGE_FIGS[i]]
            for st, nn in enumerate(fig):
                place(B['acc'], reed(midi(nn + tr), STEP * 0.85, 0.85 if st % 4 else 1.0), T(bar, st))
        else:
            brass(T(bar, 0), tones('F7', 0, 60, 75) + [41], 0.3, 1.0)
            for j, nn in enumerate(F7_RUN):
                place(B['acc'], reed(midi(nn), STEP * 0.85, 0.8 + 0.02 * j), T(bar, 4 + j))
    elif name == 'outro':
        if i == 0:
            play(B['acc'], HOOK_MEL, bar, tr, 1.0, lo=96, hi=112)
            for s0, ch in hv:
                strings(T(bar, s0), tones(ch, tr, 57, 72), 8 * STEP, 0.65)
        elif i == 1:
            place(B['acc'], reed(midi(69 + tr), BEAT * 1.9, 1.0), T(bar, 0))
            for st in (0, 3, 6):
                brass(T(bar, st), tones('Am', tr, 60, 74) + [tones('Am', tr, 48, 59)[0]], 0.12 if st < 6 else 0.3, 0.9)
            strings(T(bar, 0), tones('Am', tr, 57, 72), BEAT * 2, 0.6)
        elif i == 2:
            brass(T(bar, 0), tones('Am', tr, 60, 74) + [tones('Am', tr, 48, 59)[0]], 0.3, 1.0)
            chord_t = tones('Am', tr, 70, 77)
            for k in range(int(12 * 2)):  # the bellows shaking the chord, 32nds
                place(B['acc'], reed(midi(chord_t[k % len(chord_t)]), STEP * 0.42, 0.5 + 0.4 * k / 24), T(bar, 4 + k * 0.5))
        else:
            brass(T(bar, 0), tones('Am', tr, 60, 77) + [tones('Am', tr, 46, 57)[0]], BEAT * 2, 1.0)
            for nn in tones('Am', tr, 65, 77):
                place(B['acc'], reed(midi(nn), BEAT * 2.2, 0.8), T(bar, 0))
            strings(T(bar, 0), tones('Am', tr, 57, 76), BEAT * 2.5, 0.8)

# the cassette: the click of the play key, the hiss
_n = int(0.06 * SR)
_t = np.arange(_n) / SR
place(B['fx'], hp(noise(_n) * np.exp(-_t / 0.004), 1500) * 0.4 + np.sin(2 * np.pi * 110 * _t) * np.exp(-_t / 0.02) * 0.5, 0.08)

# ═══ the mix ════════════════════════════════════════════════════════════════════════════════════
V = LEVEL
if os.environ.get('STEMS'):
    for k, x in B.items():
        np.save(os.path.join(os.environ['STEMS'], k + '.npy'), (x * V[k]).astype(np.float32))


def pan(x, p):
    a = (p + 1) * np.pi / 4
    return x * np.cos(a) * 1.414, x * np.sin(a) * 1.414


def chorus(x, base=0.014, depth=0.0025, rate=0.7, phase=0.0):
    n = len(x)
    t = np.arange(n) / SR
    idx = np.clip(np.arange(n) - (base + depth * np.sin(2 * np.pi * rate * t + phase)) * SR, 0, n - 1)
    i0 = np.floor(idx).astype(int)
    fr = idx - i0
    i1 = np.minimum(i0 + 1, n - 1)
    return x[i0] * (1 - fr) + x[i1] * fr


# reverbs: a hall (two decorrelated tails) and the snare's gated plate
def tail(sec, tau, lo=6000):
    n = int(sec * SR)
    tt = np.arange(n) / SR
    ir = lp(noise(n) * np.exp(-tt / tau), lo)
    return ir / np.sqrt(np.sum(ir ** 2))


hallL, hallR = tail(2.2, 0.5), tail(2.2, 0.5)
hallL[: int(0.02 * SR)] = 0
hallR[: int(0.027 * SR)] = 0
gate = tail(0.3, 0.6, 8000)
gate *= np.where(np.arange(len(gate)) < int(0.26 * SR), 1.0, np.exp(-(np.arange(len(gate)) - int(0.26 * SR)) / (0.01 * SR)))

L = np.zeros(N)
R = np.zeros(N)
for k, p in (('kick', 0.0), ('snare', 0.0), ('hat', 0.3), ('tamb', -0.35), ('crash', 0.15), ('bass', 0.0), ('gtr', -0.35), ('acc', 0.05), ('fill', -0.45), ('sax', 0.12), ('brass', 0.0), ('fx', 0.0)):
    l, r = pan(B[k] * V[k], p)
    L += l
    R += r
# the toms across, high to low; the piano and the strings wide through a chorus
toms = B['tom'] * V['tom']
L += toms * 1.1
R += chorus(toms, 0.004, 0.0, 0.1) * 0.9
for k in ('ep', 'str'):
    x = B[k] * V[k]
    L += chorus(x, 0.012, 0.0025, 0.6, 0.0)
    R += chorus(x, 0.017, 0.0025, 0.6, 2.1)
send = (B['snare'] * V['snare'] * 0.3 + B['gtr'] * V['gtr'] * 0.25 + B['acc'] * V['acc'] * 0.3 + B['fill'] * V['fill'] * 0.35 + B['sax'] * V['sax'] * 0.4
        + B['ep'] * V['ep'] * 0.3 + B['str'] * V['str'] * 0.4 + B['brass'] * V['brass'] * 0.3 + B['tom'] * V['tom'] * 0.2 + B['tamb'] * V['tamb'] * 0.15)
L += fftconvolve(send, hallL)[:N] * 0.5
R += fftconvolve(send, hallR)[:N] * 0.5
g = fftconvolve(B['snare'] * V['snare'], gate)[:N] * 0.55
L += g
R += g
del send, g, toms, B

# the cassette: a little wow, a cheap deck's top, its saturation and hiss
t = np.arange(N) / SR
d = (0.0007 * np.sin(2 * np.pi * 0.5 * t + 0.4) + 0.00015 * np.sin(2 * np.pi * 6.7 * t)) * SR + 0.002 * SR
idx = np.clip(np.arange(N) - d, 0, N - 1)
i0 = np.floor(idx).astype(int)
fr = idx - i0
i1 = np.minimum(i0 + 1, N - 1)
L = L[i0] * (1 - fr) + L[i1] * fr
R = R[i0] * (1 - fr) + R[i1] * fr
del t, d, idx, i0, i1, fr
L = lp(hp(L, 30), 14500)
R = lp(hp(R, 30), 14500)
hiss = lp(hp(noise(N), 3000), 12000) * 0.0025
hiss *= np.minimum(1, np.arange(N) / (0.06 * SR))
L += hiss
R += lp(hp(noise(N), 3000), 12000) * 0.0025 * np.minimum(1, np.arange(N) / (0.06 * SR))

# ── the master: the clipper (4× the rate) and a limiter that watches the peaks between samples ──
ref = np.percentile(np.abs(np.concatenate([L[int(T(40) * SR):int(T(56) * SR)], R[int(T(40) * SR):int(T(56) * SR)]])), 99.5)
L *= MASTER_DRIVE / ref
R *= MASTER_DRIVE / ref
L = resample_poly(np.tanh(resample_poly(L, 4, 1)), 1, 4)
R = resample_poly(np.tanh(resample_poly(R, 4, 1)), 1, 4)


def limiter(L, R, ceiling=0.79, release=0.08, look=0.003):
    peak = np.maximum(np.abs(resample_poly(L, 4, 1)).reshape(-1, 4).max(1), np.abs(resample_poly(R, 4, 1)).reshape(-1, 4).max(1))[: len(L)]
    g = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    la = int(look * SR)
    g = minimum_filter1d(g, size=2 * la + 1)
    a = np.exp(-1 / (release * SR))
    out = np.empty_like(g)
    cur = 1.0
    for i in range(len(g)):
        gi = g[i]
        cur = gi if gi < cur else a * cur + (1 - a) * gi
        out[i] = cur
    out = np.convolve(out, np.ones(la) / la, mode='same')
    return np.clip(L * out, -ceiling, ceiling), np.clip(R * out, -ceiling, ceiling)


L, R = limiter(L, R)
fade = np.ones(N)
fade[-int(1.2 * SR):] = np.linspace(1, 0, int(1.2 * SR)) ** 2
out = np.stack([L * fade, R * fade], axis=1)
path = sys.argv[1] if len(sys.argv) > 1 else 'strelka_blatnyak.wav'
with wave.open(path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(out, -1, 1) * 32767).astype('<i2').tobytes())
print(f'{path}: {N / SR:.1f} s, {BARS} bars at {BPM:g} BPM')
