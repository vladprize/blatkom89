#!/usr/bin/env python3
"""«Стрелка» — a hard Brazilian phonk on «Районные дела» (the game's own theme, tools/music/compose.py),
made for the owner to hear (4 Nov 2026); not in the game. Every sound is synthesised here, the «found
cassette» it samples too: a 90s restaurant-chanson take on the theme — an accordion with three detuned
reeds over a seven-string guitar playing bass-and-chord (Karplus–Strong strings) — aged like a worn tape,
then chopped, pitched and screwed the way Brazilian phonk treats its samples. No recordings and no samples
from anywhere: the music belongs to the game, like «Районные дела».

130 BPM, A minor with the harmonic minor's G♯ (Am – F – Dm – E), 72 bars (2:13), loopable:
  0–7    the cassette, opening up from a telephone band; the cowbell creeps in; a riser, a gap, a shout
  8–23   drop 1 — mandelão: a distorted 808 with slides on the tamborzão kick, claps, Memphis hat rolls,
         the theme's cowbell riff; the cassette's chops join halfway; a stutter fill; a tape stop
  24–31  the switch — the cassette screwed an octave down, half-time drums, an HP-swept build, a gap
  32–47  drop 2 — the cassette chopped an octave up (agudo), tuim whistles, then the theme's «Soviet synth»
         lead; a stutter fill; a tape stop
  48–55  the break — the cassette again over an 808 pedal, then a stutter build that climbs, a gap
  56–71  drop 3 — everything, orchestra hits; a tape stop back into the cassette (the loop)

Usage: python3 tools/music/compose_phonk.py [out.wav]   — deterministic: the same file every run.
Then: ffmpeg -i out.wav -c:a libmp3lame -b:a 320k strelka.mp3 (see tools/music/README.md).
"""
import os
import sys
import wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve, lfilter, resample_poly
from scipy.ndimage import minimum_filter1d

SR = 44100
BPM = 130.0
BEAT = 60.0 / BPM
STEP = BEAT / 4  # a 16th
BAR = BEAT * 4
BARS = 72
LEN = int(round(BARS * BAR * SR))
TAIL = int(4.0 * SR)
N = LEN + TAIL
MASTER_DRIVE = 1.15  # how hard the master is pushed into the clipper (sets the loudness)
# the mix: each part's level
LEVEL = dict(kick=0.85, bass=0.5, clap=0.45, roll=0.42, hat=0.9, bell=1.1, chop=1.7, lead=0.75, hit=0.5, fx=0.6, cas=0.72, pad=0.42)
rng = np.random.default_rng(1301989)


# ── helpers ─────────────────────────────────────────────────────────────────
def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def lp(x, f, order=2):
    return sosfilt(butter(order, min(f, SR / 2 - 300) / (SR / 2), 'low', output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f / (SR / 2), 'high', output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo / (SR / 2), min(hi, SR / 2 - 300) / (SR / 2)], 'band', output='sos'), x)


def sweep(x, curve, kind='low', block=256):
    """A 2-pole filter whose cutoff follows `curve` (Hz, one value per sample), redesigned every block."""
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
    return bar * BAR + step * STEP


def fades(x, a=0.002, r=0.008):
    y = x.copy()
    na, nr = min(len(y), int(a * SR)), min(len(y), int(r * SR))
    if na:
        y[:na] *= np.linspace(0, 1, na)
    if nr:
        y[len(y) - nr:] *= np.linspace(1, 0, nr)
    return y


def noise(n):
    return rng.standard_normal(n)


# ═══ 1. the cassette: a 90s restaurant-chanson take on the theme, to be sampled ═══════════════
S_BARS = 8
S_N = int(S_BARS * BAR * SR) + int(1.5 * SR)

# (step, midi, length in 16ths) over 8 bars; chords Am F Dm E Am F Dm|E Am — the theme's line, ornamented
CAS_MELODY = [
    (0, 69, 6), (6, 71, 2), (8, 72, 4), (12, 71, 1), (13, 72, 1), (14, 76, 2),  # Am
    (16, 77, 6), (22, 76, 2), (24, 77, 2), (26, 76, 2), (28, 74, 2), (30, 72, 2),  # F
    (32, 74, 6), (38, 72, 2), (40, 74, 4), (44, 77, 4),  # Dm
    (48, 76, 0.5), (48.5, 77, 0.5), (49, 76, 7), (56, 74, 2), (58, 72, 2), (60, 71, 2), (62, 68, 2),  # E
    (64, 69, 4), (68, 72, 2), (70, 76, 2), (72, 81, 6), (78, 80, 2),  # Am, the climb
    (80, 81, 4), (84, 77, 4), (88, 76, 4), (92, 74, 2), (94, 76, 2),  # F
    (96, 77, 4), (100, 76, 2), (102, 74, 2), (104, 71, 2), (106, 72, 2), (108, 71, 2), (110, 68, 2),  # Dm | E
    (112, 69, 10), (124, 64, 2), (126, 68, 2),  # Am, and the pickup back to the top
]
GRACE = [(16, 76), (72, 80), (96, 76)]  # a quick note just before these steps
CAS_CHORDS = ['Am', 'F', 'Dm', 'E', 'Am', 'F', 'Dm|E', 'Am']
# the guitar: the bass on 1, the bass on 3, the chord (a seven-string's middle voicing)
GTR = {'Am': (45, 40, (57, 60, 64)), 'F': (41, 48, (57, 60, 65)), 'Dm': (38, 45, (57, 62, 65)), 'E': (40, 47, (56, 59, 64))}


def pluck(f, dur, t60=2.0, bright=0.55, damp_after=None):
    """A plucked steel string (Karplus–Strong with an all-pass for exact tuning)."""
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
    sh = max(1, int(0.12 * P))  # where the string is picked
    exc[sh:] -= 0.9 * exc[:-sh]
    x = np.zeros(n)
    x[:m] = exc
    y = lfilter([1.0, c], a, x)
    if damp_after is not None and damp_after * SR < n:
        i = int(damp_after * SR)
        y[i:] *= np.exp(-np.arange(n - i) / SR / 0.03)
    return y


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
    env = np.minimum(1, t / 0.025) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.03))
    env *= 1 + 0.035 * np.sin(2 * np.pi * 5.2 * t)
    return y * env * amp


def tape(x):
    """A worn cassette: wow and flutter, saturation, the band of a cheap deck, hiss, a wobbling level."""
    n = len(x)
    t = np.arange(n) / SR
    d = (0.0016 * np.sin(2 * np.pi * 0.47 * t + 0.8) + 0.0005 * np.sin(2 * np.pi * 1.3 * t) + 0.0002 * np.sin(2 * np.pi * 7.1 * t)) * SR + 0.003 * SR
    idx = np.clip(np.arange(n) - d, 0, n - 1)
    i0 = np.floor(idx).astype(int)
    fr = idx - i0
    i1 = np.minimum(i0 + 1, n - 1)
    y = x[i0] * (1 - fr) + x[i1] * fr
    y = np.tanh(1.8 * y) / np.tanh(1.8)
    y = bp(y, 110, 6800)
    y *= 1 + 0.05 * np.sin(2 * np.pi * 0.21 * t) - 0.03 * np.sin(2 * np.pi * 0.07 * t)
    return y + lp(hp(noise(n), 2000), 9000) * 0.01


cas_gtr = np.zeros(S_N)
cas_acc = np.zeros(S_N)
for b, ch in enumerate(CAS_CHORDS):
    halves = ch.split('|')
    if len(halves) == 1:
        bass1, bass2, chord = GTR[ch]
        hits = [(0, 'bass', bass1, None), (4, 'chord', None, chord), (8, 'bass', bass2, None), (12, 'chord', None, chord), (14, 'up', None, chord)]
    else:
        c1, c2 = GTR[halves[0]], GTR[halves[1]]
        hits = [(0, 'bass', c1[0], None), (4, 'chord', None, c1[2]), (8, 'bass', c2[0], None), (12, 'chord', None, c2[2]), (14, 'up', None, c2[2])]
    for st, kind, bn, chord in hits:
        t0 = T(b, st)
        if kind == 'bass':
            place(cas_gtr, pluck(midi(bn), 1.2, t60=2.4, bright=0.45, damp_after=2 * BEAT - 0.02) * 0.9, t0)
        elif kind == 'chord':
            for i, nn in enumerate(chord):  # a downstroke, low to high
                place(cas_gtr, pluck(midi(nn), 0.5, t60=1.3, bright=0.6, damp_after=0.17) * (0.55 + 0.05 * i), t0 + 0.011 * i)
        else:
            for i, nn in enumerate(chord[::-1][:2]):  # a light upstroke
                place(cas_gtr, pluck(midi(nn), 0.3, t60=1.0, bright=0.6, damp_after=0.08) * 0.3, t0 + 0.009 * i)
for st, note, ln in CAS_MELODY:
    accent = 1.0 if st % 16 == 0 else (0.9 if st % 4 == 0 else 0.82)
    place(cas_acc, reed(midi(note), ln * STEP * 0.96, accent), st * STEP)
for st, note in GRACE:
    place(cas_acc, reed(midi(note), 0.035, 0.6), st * STEP - 0.04)
cas_gtr = lp(cas_gtr, 5200) + 0.35 * bp(cas_gtr, 85, 240)  # the guitar's body
cas_dry = cas_acc * 0.62 + cas_gtr * 0.5
# a small restaurant hall
_irn = int(0.7 * SR)
_tt = np.arange(_irn) / SR
_ir = lp(noise(_irn) * np.exp(-_tt / 0.16), 4500)
_ir /= np.sqrt(np.sum(_ir ** 2))
cas_dry = cas_dry + 0.22 * fftconvolve(cas_dry, _ir)[:S_N]
cassette = tape(cas_dry)
cassette /= np.abs(cassette).max() / 0.9


def slice_(t0, length, rate=1.0):
    """`length` seconds of the cassette from `t0`, played at `rate` (2 = an octave up, like a sampler)."""
    n = int(length * SR)
    pos = t0 * SR + np.arange(n) * rate
    return np.interp(pos, np.arange(len(cassette)), cassette, right=0.0)


# ═══ 2. the arrangement ═════════════════════════════════════════════════════════════════════════
def section(bar):
    if bar < 8:
        return 'intro'
    if bar < 24:
        return 'drop1'
    if bar < 32:
        return 'switch'
    if bar < 48:
        return 'drop2'
    if bar < 56:
        return 'break'
    return 'drop3'


CYCLE = ['Am', 'F', 'Dm', 'E']
ROOT = {'Am': 33, 'F': 29, 'Dm': 38, 'E': 28}  # A1 F1 D2 E1
UP = {'Am': 45, 'F': 41, 'Dm': 33, 'E': 40}  # where the 808 slides to on the off-beats

kick_bus = np.zeros(N)
clap_bus = np.zeros(N)
roll_bus = np.zeros(N)
hat_bus = np.zeros(N)
bell_bus = np.zeros(N)
chop_bus = np.zeros(N)
cas_bus = np.zeros(N)
lead_bus = np.zeros(N)
fx_bus = np.zeros(N)
hit_bus = np.zeros(N)
kick_times = []
bass_notes = []  # (time, midi, level, slide, decay)
bass_cuts = []  # where the 808 must stop (gaps, tape stops)


# ── drums ───────────────────────────────────────────────────────────────────
def kick(t, amp=1.0):
    n = int(0.26 * SR)
    tt = np.arange(n) / SR
    f = 50 + 190 * np.exp(-tt / 0.022)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.085)
    click = hp(noise(n) * np.exp(-tt / 0.003), 1500) * 0.5
    place(kick_bus, amp * np.tanh(3.0 * (body + click)), t)
    kick_times.append(t)


def clap(t, amp=1.0):
    n = int(0.35 * SR)
    tt = np.arange(n) / SR
    e = np.zeros(n)
    for off in (0.0, 0.008, 0.016, 0.024):
        e += np.exp(-np.maximum(tt - off, 0) / 0.005) * (tt >= off)
    e += 0.7 * np.exp(-tt / 0.065)
    x = bp(noise(n) * e, 1000, 8500) + np.sin(2 * np.pi * 210 * tt) * np.exp(-tt / 0.035) * 0.5
    place(clap_bus, amp * np.tanh(2.2 * x), t)


def snare(t, amp=1.0, pitch=200.0):
    n = int(0.16 * SR)
    tt = np.arange(n) / SR
    body = np.sin(2 * np.pi * pitch * tt) * np.exp(-tt / 0.04)
    nz = bp(noise(n), 1500, 8000) * np.exp(-tt / 0.045)
    place(roll_bus, amp * np.tanh(1.8 * (0.6 * body + nz)), t)


def hat(t, amp=1.0, open_=False):
    n = int((0.3 if open_ else 0.05) * SR)
    tt = np.arange(n) / SR
    x = hp(noise(n), 7000, 4) + 0.15 * hp(np.sign(np.sin(2 * np.pi * 3270 * tt)) * np.sign(np.sin(2 * np.pi * 4730 * tt)), 6000)
    place(hat_bus, amp * 0.5 * x * np.exp(-tt / (0.11 if open_ else 0.016)), t)


def roll(bar0, bars=2):
    """A snare roll that speeds up into a gap at the last beat: 8ths, 16ths, 32nds."""
    seq = []
    if bars == 2:
        seq += [(T(bar0, s), 0) for s in range(0, 16, 2)]
        bar0 += 1
    seq += [(T(bar0, s), 1) for s in range(0, 8)]
    seq += [(T(bar0, 8 + k / 2), 2) for k in range(8)]
    total = len(seq)
    for i, (t, _) in enumerate(seq):
        p = i / max(1, total - 1)
        snare(t, 0.25 + 0.6 * p, 180 + 240 * p)


def drop_bar(bar, extra=False):
    chord = CYCLE[bar % 4]
    steps = [0, 3, 6, 10, 12] if bar % 2 == 0 else [0, 3, 6, 8, 11, 14]
    for s in steps:
        a = 1.0 if s == 0 else 0.88
        kick(T(bar, s), a)
        note = UP[chord] if s in (6, 8) else (32 if chord == 'E' and s == steps[-1] else ROOT[chord])  # G♯1 leads home
        bass_notes.append((T(bar, s), note, a * (0.6 if s in (6, 8) else 1.0), s in (6, 8, 10, 11), 0.32))
    if extra and bar % 2 == 1:
        kick(T(bar, 15), 0.6)
    for s in (4, 12):
        clap(T(bar, s))
    if bar % 4 == 3:
        clap(T(bar, 15), 0.45)
    if extra and bar % 4 == 1:
        clap(T(bar, 7), 0.35)
    for s in range(0, 16, 2):
        hat(T(bar, s), 0.8 if s % 4 == 0 else 0.55)
    if bar % 2 == 1:  # a Memphis roll: triplet 16ths over beat 4
        for k in range(6):
            hat(T(bar, 12) + k * BEAT / 6, 0.35 + 0.08 * k)
    else:
        hat(T(bar, 14), 0.45, open_=True)


# ── the theme's cowbell riff and lead (from «Районные дела») ─────────────────
RIFF_A = [(0, 76), (3, 76), (6, 77), (8, 76), (10, 74), (12, 72), (14, 71), (16, 72), (19, 72), (22, 74), (24, 72), (26, 71), (28, 69), (30, 68)]
RIFF_B = [(0, 74), (3, 74), (6, 76), (8, 77), (10, 76), (12, 74), (14, 72), (16, 71), (19, 71), (22, 72), (24, 71), (26, 68), (28, 64), (30, 68)]
MELODY = [(0, 69, 8), (8, 72, 8), (16, 77, 12), (28, 76, 4), (32, 74, 8), (40, 77, 8), (48, 76, 16)]


def cowbell(t, note, amp=1.0, bus=None):
    n = int(0.3 * SR)
    tt = np.arange(n) / SR
    f = midi(note)
    sq = np.sign(np.sin(2 * np.pi * f * tt)) + 0.7 * np.sign(np.sin(2 * np.pi * f * 1.4983 * tt))
    x = bp(sq, f * 0.8, min(f * 6, 9000)) * (0.65 * np.exp(-tt / 0.02) + 0.35 * np.exp(-tt / 0.13))
    place(bell_bus if bus is None else bus, amp * 0.4 * np.tanh(2.0 * x), t)


def riff(bar, up=0, amp=1.0, bus=None, half=False):
    """The riff from `bar` (two bars long, or four at half speed)."""
    r = RIFF_A if (bar // (4 if half else 2)) % 2 == 0 else RIFF_B
    for st, note in r:
        cowbell(T(bar, st * (2 if half else 1)), note + up, amp, bus)


def lead_note(t, note, dur_steps, amp=1.0):
    dur = dur_steps * STEP
    n = int((dur + 0.25) * SR)
    tt = np.arange(n) / SR
    f = midi(note) * (1 + 0.006 * np.sin(2 * np.pi * 5.6 * tt) * np.minimum(1, tt / 0.3))
    ph = 2 * np.pi * np.cumsum(f) / SR
    pulse = np.where(np.sin(ph) > 0.3, 1.0, -1.0) * 0.6 + np.sin(ph) * 0.5
    e = np.minimum(1, tt / 0.03) * np.where(tt < dur, 1.0, np.exp(-(tt - dur) / 0.08))
    place(lead_bus, amp * lp(pulse, 3200) * e * 0.22, t)


def melody(bar, amp=1.0):
    for st, note, d in MELODY:
        lead_note(T(bar, st), note, d, amp)


pad_bus = np.zeros(N)
PAD = {'Am': (57, 60, 64), 'F': (53, 57, 60), 'Dm': (50, 53, 57), 'E': (52, 56, 59)}


def pad_bar(bar, amp=1.0):
    """A dark chord of detuned saws under a bar (the theme's pad)."""
    n = int(BAR * SR) + int(0.5 * SR)
    tt = np.arange(n) / SR
    e = np.minimum(1, tt / 0.2) * np.exp(-np.maximum(tt - BAR, 0) / 0.15)
    x = np.zeros(n)
    for k, note in enumerate(PAD[CYCLE[bar % 4]]):
        for det in (0.996, 1.004):
            x += 2 * ((midi(note) * det * tt + 0.31 * k) % 1.0) - 1
    place(pad_bus, amp * 0.12 * x * e, T(bar))


# ── chops: the cassette cut into 16ths and played back in a rhythm ──────────
CHOP_A = [0, 2, 3, 6, 8, 10, 11, 14]
CHOP_B = [0, 1, 2, 3, 6, 8, 9, 10, 11, 14, 15]


def chops(bar, src_bars, rate=1.0, amp=1.0, pattern=None):
    sb = src_bars[bar % 4]
    for s in pattern or (CHOP_A if bar % 2 == 0 else CHOP_B):
        place(chop_bus, fades(slice_(T(sb, s), STEP * 0.85, rate), 0.002, 0.012) * amp, T(bar, s))


def stutter_into(bus, t_out, src_t, slice_len, count, rate=1.0, amp=1.0):
    piece = fades(slice_(src_t, slice_len, rate), 0.002, 0.006) * amp
    for k in range(count):
        place(bus, piece, t_out + k * slice_len)


# ── effects ─────────────────────────────────────────────────────────────────
def tuim(t, amp=1.0):
    """Funk's whistle: a sine dropping an octave."""
    n = int(0.18 * SR)
    tt = np.arange(n) / SR
    f = 1250 + 1250 * np.exp(-tt / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    place(fx_bus, amp * (np.sin(ph) + 0.25 * np.sin(2 * ph)) * np.minimum(1, tt / 0.003) * np.exp(-tt / 0.07), t)


def riser(bar0, bars=2, amp=1.0):
    n = int(bars * BAR * SR)
    tt = np.arange(n) / SR
    p = tt / tt[-1]
    nz = sweep(noise(n), 300 * (8000 / 300) ** p, 'high') * p ** 2
    f = 220 * 4 ** p
    tone = lp(2 * ((np.cumsum(f) / SR) % 1.0) - 1, 3000) * p ** 2 * 0.3
    place(fx_bus, amp * 0.12 * (nz + tone), T(bar0))


def orch_hit(t, amp=1.0):
    """A 90s orchestra hit on A minor."""
    n = int(0.8 * SR)
    tt = np.arange(n) / SR
    x = np.zeros(n)
    for note in (45, 52, 57, 60, 64, 69, 72):
        for det in (-0.004, 0.004):
            x += 2 * ((midi(note) * (1 + det) * tt + rng.uniform()) % 1.0) - 1
    x = lp(x / 14, 5500) * (np.minimum(1, tt / 0.004) * np.exp(-tt / 0.2))
    x += bp(noise(n), 2000, 8000) * np.exp(-tt / 0.03) * 0.5
    x += np.sin(2 * np.pi * np.cumsum(60 + 40 * np.exp(-tt / 0.05)) / SR) * np.exp(-tt / 0.25) * 0.6
    place(hit_bus, amp * np.tanh(1.5 * x), t)


# ═══ 3. the parts, bar by bar ═══════════════════════════════════════════════════════════════════
# the cassette: as it is in the intro, screwed in the switch, again in the break
place(cas_bus, cassette[: int(8 * BAR * SR)], T(0))
_n = int(8 * BAR * SR)
place(cas_bus, hp(np.interp(np.arange(_n) * 0.5, np.arange(len(cassette)), cassette), 170) * 1.1, T(24))
place(cas_bus, cassette[: int(6 * BAR * SR)], T(48))

for bar in range(BARS):
    s = section(bar)
    chord = CYCLE[bar % 4]
    if s == 'intro':
        continue  # the intro's parts are laid below
    if s == 'drop1':
        drop_bar(bar)
        if bar % 2 == 0:
            riff(bar, 0, 1.0)
        if bar >= 16:
            chops(bar, [0, 1, 2, 3], 1.0, 0.5)
            pad_bar(bar, 0.6)
        continue
    if s == 'switch':
        kick(T(bar, 0), 0.95)
        if bar % 2 == 1 and bar < 30:
            kick(T(bar, 10), 0.75)
        if bar % 2 == 0:
            bass_notes.append((T(bar, 0), ROOT[CYCLE[(bar - 24) // 2]], 1.0, True, 0.9))
        if bar < 30:
            clap(T(bar, 8), 0.95)
            for k in range(12):  # 8th triplets
                hat(T(bar) + k * BAR / 12, 0.45 if k % 3 == 0 else 0.3)
            hat(T(bar, 6), 0.35, open_=True)
        if bar % 4 == 0:
            riff(bar, -12, 0.45, half=True)
        continue
    if s == 'drop2':
        drop_bar(bar, extra=True)
        chops(bar, [4, 5, 2, 3], 2.0, 0.42)
        if bar >= 40:
            if bar % 4 == 0:
                melody(bar, 1.0)
            if bar % 2 == 0:
                riff(bar, 0, 0.45)
        if bar % 2 == 0:
            tuim(T(bar, 7), 0.5)
        if bar % 4 == 3:
            tuim(T(bar, 15), 0.45)
        pad_bar(bar, 0.8 if bar < 40 else 1.0)
        continue
    if s == 'break':
        i = bar - 48
        if i < 6:
            bass_notes.append((T(bar, 0), ROOT[CAS_CHORDS[i].split('|')[0]], 0.35, True, 1.2))
        elif i == 6:
            bass_notes.append((T(bar, 0), 28, 0.45, True, 2.5))
        if i >= 2:
            clap(T(bar, 8), 0.4 + 0.08 * (i - 2))
        if i in (4, 5):
            kick(T(bar, 0), 0.7)
            kick(T(bar, 8), 0.6)
            for st in range(0, 16, 2):
                hat(T(bar, st), 0.35)
        if i in (6, 7):
            for st in (0, 4, 8, 12):
                kick(T(bar, st), 0.55 + 0.05 * st / 4)
        continue
    if s == 'drop3':
        drop_bar(bar, extra=True)
        if bar % 2 == 0:
            riff(bar, 0, 0.9)
            riff(bar, 12, 0.35)
        chops(bar, [4, 5, 2, 3], 2.0, 0.36)
        chops(bar, [0, 1, 2, 3], 1.0, 0.22, CHOP_A)
        if bar % 4 == 0:
            melody(bar, 0.85)
        if bar % 8 == 0:
            orch_hit(T(bar, 0), 1.0)
        if bar % 4 == 2:
            tuim(T(bar, 7), 0.45)
        pad_bar(bar, 1.0)

# the intro: the cowbell riff creeps in through a filter, then hats and a kick; a riser and a roll
intro_bell = np.zeros(N)
for bar in (4, 6):  # riff A both times: its second bar's G♯ leads into the drop's Am
    for st, note in RIFF_A:
        cowbell(T(bar, st), note, 0.55, intro_bell)
_i0, _i1 = int(T(4) * SR), int(T(8) * SR)
intro_bell[_i0:_i1] = sweep(intro_bell[_i0:_i1], np.geomspace(450, 7000, _i1 - _i0), 'low')
bell_bus += intro_bell
del intro_bell
for st in range(0, 16, 2):
    hat(T(6, st), 0.25 + 0.02 * st)
    hat(T(7, st), 0.4)
kick(T(6, 0), 0.7)
kick(T(6, 10), 0.55)
kick(T(7, 0), 0.75)
kick(T(7, 6), 0.6)
roll(6, 2)
riser(6, 2, 1.0)
# the intro's cassette: the last beat-and-a-half stuttered into the gap
_a, _b = int(T(7, 8) * SR), int(T(8) * SR)
cas_bus[_a:_b] = 0
stutter_into(cas_bus, T(7, 8), T(7, 8), STEP / 2, 8)

# the switch: its build
roll(30, 2)
riser(30, 2, 1.1)
bass_notes.append((T(30, 0), 28, 1.0, True, 1.6))  # E1 under the build
# the break: the stutter build from the cassette's E bar, climbing
stutter_into(cas_bus, T(54), T(3), BEAT, 4, 1.0)
stutter_into(cas_bus, T(55, 0), T(3), BEAT / 2, 2, 1.06)
stutter_into(cas_bus, T(55, 4), T(3), STEP, 4, 1.12)
stutter_into(cas_bus, T(55, 8), T(3), STEP / 2, 8, 1.19)
roll(54, 2)
riser(54, 2, 1.1)

# the radio band on the cassette, opening up: the intro over six bars, the break over four
for b0, b1 in ((0, 6), (48, 52)):
    i0, i1 = int(T(b0) * SR), int(T(b1) * SR)
    seg = cas_bus[i0:i1]
    seg = sweep(seg, np.geomspace(420, 90, i1 - i0), 'high')
    cas_bus[i0:i1] = sweep(seg, np.geomspace(2600, 15000, i1 - i0), 'low')

# vinyl-like crackle under the cassette parts
crackle = np.zeros(N)
for b0, b1 in ((0, 8), (24, 32), (48, 56)):
    t = T(b0)
    while t < T(b1):
        t += rng.exponential(1 / 14)
        n = int(0.002 * SR)
        place(crackle, rng.uniform(-1, 1) * np.exp(-np.arange(n) / (0.0004 * SR)), t)
crackle = hp(crackle, 1200) * 0.05

bass_cuts += [T(7, 12), T(23, 12), T(31, 12), T(47, 12), T(55, 12), T(71, 12), T(24) - 0.001]

# ── the 808 ─────────────────────────────────────────────────────────────────
def render_808():
    notes = sorted(bass_notes)
    cuts = sorted(bass_cuts)
    freq = np.full(N, midi(33))
    amp = np.zeros(N)
    prev_f, prev_level, prev_end = midi(33), 0.0, -100
    for k, (t0, note, a, slide, decay) in enumerate(notes):
        nxt = notes[k + 1][0] if k + 1 < len(notes) else t0 + 4.0
        cut = next((c for c in cuts if c > t0 + 1e-6), 1e9)
        t1 = min(nxt, cut)
        i0, i1 = int(t0 * SR), min(N, int(t1 * SR))
        if i1 <= i0:
            continue
        tt = np.arange(i1 - i0) / SR
        ft = midi(note)
        legato = abs(i0 - prev_end) < 10
        f0 = prev_f if legato else ft
        tau = 0.045 if slide else 0.004
        f = ft + (f0 - ft) * np.exp(-tt / tau)
        if not slide:
            f = f * (1 + 0.5 * np.exp(-tt / 0.008))  # the knock
        lv0 = prev_level if legato else 0.0
        att = np.minimum(1, tt / 0.003)
        env = lv0 * (1 - att) + a * np.exp(-tt / decay) * att
        if t1 < nxt - 1e-6:  # stopped by a cut: a short release
            r = min(len(env), int(0.02 * SR))
            env[-r:] *= np.linspace(1, 0, r)
            prev_level = 0.0
        else:
            prev_level = env[-1]
        freq[i0:i1] = f
        amp[i0:i1] = env
        prev_f, prev_end = ft, i1
    ph = 2 * np.pi * np.cumsum(freq) / SR
    sub = np.sin(ph) * amp
    dist = lp(hp(np.tanh(5.0 * (sub + 0.12 * sub ** 2)), 25), 3200)
    dist -= 0.5 * bp(dist, 90, 220)  # keep the growl above the sub, not on top of it
    return 0.3 * dist + 0.6 * sub


bass_bus = render_808()
bass_bus -= 0.3 * bp(bass_bus, 72, 150)  # a dip where the kick's body and the octave-up notes pile up

# ── the shout: a crowd's «ХЭЙ!» (formant synthesis) ─────────────────────────
FORM = {'e': (530, 1840, 2480), 'i': (290, 2250, 2900)}
FORM_BW = (100, 120, 170)
FORM_GAIN = (1.0, 0.9, 0.6)


def resonator(x, F, bw):
    r = np.exp(-np.pi * bw / SR)
    c1 = 2 * r * np.cos(2 * np.pi * F / SR)
    c2 = r * r
    g = (1 - r) * 2 * np.sin(2 * np.pi * F / SR)  # about unity gain at the formant, whatever its height
    y = np.zeros(len(x))
    y1 = y2 = 0.0
    for i in range(len(x)):
        v = g[i] * x[i] + c1[i] * y1 - c2 * y2
        y[i] = v
        y2, y1 = y1, v
    return y


def hey_voice(f0, dur=0.3, glide=0.55):
    n = int((dur + 0.1) * SR)
    out = np.zeros(n)
    kh_n = int(0.06 * SR)
    out[:kh_n] += bp(noise(kh_n), 900, 3800) * np.sin(np.pi * np.arange(kh_n) / kh_n) ** 0.7 * 0.25
    tv = np.arange(int(dur * SR)) / SR
    f = f0 * (1 - 0.14 * tv / dur) * (1 + 0.006 * np.sin(2 * np.pi * 7 * tv))
    src = lp(2 * ((np.cumsum(f) / SR) % 1.0) - 1, 4200) + 0.06 * noise(len(tv))
    k = np.clip((tv / dur - glide) / (1 - glide), 0, 1)
    k = k * k * (3 - 2 * k)
    v = np.zeros(len(tv))
    for j in range(3):
        F = FORM['e'][j] + (FORM['i'][j] - FORM['e'][j]) * k
        v += resonator(src, F, FORM_BW[j]) * FORM_GAIN[j]
    v *= np.minimum(1, tv / 0.025) * np.minimum(1, (dur - tv) / 0.07)
    v /= np.abs(v).max() + 1e-9
    vs = int(0.035 * SR)
    out[vs:vs + len(v)] += v
    return out


def crowd_hey():
    n = int(0.55 * SR)
    L, R = np.zeros(n), np.zeros(n)
    for f0, off, pan in ((205, 0.0, 0.5), (232, 0.012, 0.2), (250, 0.006, 0.8), (218, 0.02, 0.35), (241, 0.016, 0.65)):
        v = hey_voice(f0 * rng.uniform(0.98, 1.02))
        i = int(off * SR)
        m = min(len(v), n - i)
        L[i:i + m] += v[:m] * np.cos(pan * np.pi / 2)
        R[i:i + m] += v[:m] * np.sin(pan * np.pi / 2)
    L, R = hp(np.tanh(2.0 * L), 140), hp(np.tanh(2.0 * R), 140)
    m = max(np.abs(L).max(), np.abs(R).max())
    return L / m, R / m


HEY_L, HEY_R = crowd_hey()

# ═══ 4. the mix ═════════════════════════════════════════════════════════════════════════════════
duck = np.ones(N)
for t in kick_times:
    i = int(t * SR)
    j = min(N, i + int(0.24 * SR))
    tt = np.arange(j - i) / SR
    duck[i:j] = np.minimum(duck[i:j], 1 - 0.55 * np.exp(-tt / 0.1))

# the reverb: two decorrelated noise tails
_irn = int(2.0 * SR)
_tt = np.arange(_irn) / SR
irL = lp(noise(_irn) * np.exp(-_tt / 0.42), 6000)
irR = lp(noise(_irn) * np.exp(-_tt / 0.42), 6000)
irL[: int(0.012 * SR)] = 0
irR[: int(0.017 * SR)] = 0
irL /= np.sqrt(np.sum(irL ** 2))
irR /= np.sqrt(np.sum(irR ** 2))

# the cowbell's echo: a dotted 8th left, a quarter right
dly = int(3 * STEP * SR)
echoL = np.zeros(N)
echoR = np.zeros(N)
echoL[dly:] = bell_bus[:-dly] * 0.3
echoR[int(4 * STEP * SR):] = bell_bus[: -int(4 * STEP * SR)] * 0.22

V = LEVEL
if os.environ.get('STEMS'):  # each part as it goes into the mix, for checking the balance
    for name, bus, lv in (('kick', kick_bus, 'kick'), ('bass', bass_bus, 'bass'), ('clap', clap_bus, 'clap'), ('roll', roll_bus, 'roll'), ('hat', hat_bus, 'hat'), ('bell', bell_bus, 'bell'), ('chop', chop_bus, 'chop'), ('lead', lead_bus, 'lead'), ('hit', hit_bus, 'hit'), ('fx', fx_bus, 'fx'), ('cas', cas_bus, 'cas'), ('pad', lp(pad_bus, 1700), 'pad')):
        np.save(os.path.join(os.environ['STEMS'], name + '.npy'), (bus * V[lv]).astype(np.float32))
send = clap_bus * V['clap'] * 0.5 + roll_bus * V['roll'] * 0.3 + chop_bus * V['chop'] * 0.35 + bell_bus * V['bell'] * 0.5 + lead_bus * V['lead'] * 0.7 + cas_bus * V['cas'] * 0.2 + hit_bus * V['hit'] * 0.6 + fx_bus * V['fx'] * 0.5
wetL = fftconvolve(send, irL)[:N] * 0.4
wetR = fftconvolve(send, irR)[:N] * 0.4
del send

pad_bus = lp(pad_bus, 1700)
drums = kick_bus * V['kick'] + clap_bus * V['clap'] + roll_bus * V['roll']
music = (bell_bus * V['bell'] + lead_bus * V['lead'] + hit_bus * V['hit'] + fx_bus * V['fx'] + pad_bus * V['pad']) * duck
chop = chop_bus * V['chop'] * duck
chopD = np.zeros(N)  # the chops a little wider: a 14 ms copy on the right
chopD[int(0.014 * SR):] = chop[: -int(0.014 * SR)]
cas_mix = cas_bus * V['cas'] + crackle
L = drums + bass_bus * V['bass'] + music + chop + echoL * V['bell'] * 0.9 * duck + cas_mix + hat_bus * V['hat'] * 0.85 + wetL
R = drums + bass_bus * V['bass'] + music + chop * 0.6 + chopD * 0.45 + echoR * V['bell'] * 0.9 * duck + cas_mix + hat_bus * V['hat'] * 1.15 + wetR
del drums, music, chop, chopD, wetL, wetR


# ── the master's moves: stutters, sweeps, tape stops, gaps ──────────────────
def m_stutter(t0, parts):
    t = t0
    for length, count in parts:
        n = int(length * SR)
        i = int(t * SR)
        for ch in (L, R):
            piece = fades(ch[i:i + n].copy(), 0.001, 0.004)
            for k in range(count):
                ch[i + k * n:i + (k + 1) * n] = piece
        t += length * count


def m_sweep(t0, t1, f0, f1, kind):
    i0, i1 = int(t0 * SR), int(t1 * SR)
    curve = np.geomspace(f0, f1, i1 - i0)
    for ch in (L, R):
        ch[i0:i1] = sweep(ch[i0:i1], curve, kind)


def m_tapestop(t0, dur):
    i0, n = int(t0 * SR), int(dur * SR)
    tau = np.arange(n) / n
    pos = i0 + np.cumsum((1 - tau) ** 1.6)
    for ch in (L, R):
        seg = np.interp(pos, np.arange(len(ch)), ch) * np.minimum(1, (1 - tau) * 10)
        ch[i0:i0 + n] = seg


def m_gap(t0, t1):
    i0, i1 = int(t0 * SR), int(t1 * SR)
    f = int(0.004 * SR)
    for ch in (L, R):
        ch[i0:i0 + f] *= np.linspace(1, 0, f)
        ch[i0 + f:i1] = 0


FILL = [(STEP, 2), (STEP / 2, 4)]
m_stutter(T(15, 12), FILL)
m_stutter(T(39, 12), FILL)
m_stutter(T(63, 12), FILL)
m_sweep(T(23, 0), T(23, 12), 16000, 700, 'low')
m_tapestop(T(23, 12), BEAT)
m_tapestop(T(47, 12), BEAT)
m_sweep(T(30, 0), T(31, 12), 30, 650, 'high')
m_sweep(T(54, 0), T(55, 12), 30, 500, 'high')
m_sweep(T(71, 0), T(71, 12), 16000, 700, 'low')
m_tapestop(T(71, 12), BEAT)
for b in (7, 31, 55):
    m_gap(T(b, 12), T(b + 1))
for ch in (L, R):
    ch[LEN:] = 0  # the tape has stopped: nothing rings past the end

# ── after the cuts: the shouts and the drops' accents ───────────────────────
postL = np.zeros(N)
postR = np.zeros(N)


def post(xL, xR, t, amp=1.0):
    place(postL, xL * amp, t)
    place(postR, (xL if xR is None else xR) * amp, t)


_n = int(2.2 * SR)
_tt = np.arange(_n) / SR
CRASH = hp(noise(_n), 3500) * np.exp(-_tt / 0.55)
for k, fq in enumerate((3120.0, 4470.0, 5830.0, 7260.0)):
    CRASH += 0.06 * np.sin(2 * np.pi * fq * _tt + k) * np.exp(-_tt / 0.4)
_n = int(1.0 * SR)
_tt = np.arange(_n) / SR
BOOM = np.tanh(1.5 * np.sin(2 * np.pi * np.cumsum(32 + 60 * np.exp(-_tt / 0.12)) / SR) * np.exp(-_tt / 0.45))
REV = fftconvolve(CRASH[: int(BEAT * SR)], irL)[: int(BEAT * SR * 1.2)][::-1]
REV /= np.abs(REV).max()
REV *= np.linspace(0, 1, len(REV)) ** 2
for b in (8, 32, 56):
    post(CRASH, None, T(b), 0.24)
    post(BOOM, None, T(b), 0.62)
    post(REV, None, T(b) - len(REV) / SR, 0.3)
    post(HEY_L, HEY_R, T(b - 1, 12.5), 0.55)
post(BOOM, None, T(24), 0.5)
post(CRASH, None, T(48), 0.14)
for b, st in ((19, 12), (44, 12), (60, 12), (68, 12)):
    post(HEY_L, HEY_R, T(b, st), 0.38)
heyWet = fftconvolve(postL * 0.3, irR)[:N] * 0.3
L += postL + heyWet
R += postR + heyWet
del postL, postR, heyWet

# ── the master: the loop, a clipper, a limiter ──────────────────────────────
L = hp(L, 25)
R = hp(R, 25)
for ch in (L, R):
    ch[:TAIL] += ch[LEN:LEN + TAIL]
L, R = L[:LEN], R[:LEN]
ref = np.percentile(np.abs(np.concatenate([L[int(T(8) * SR):int(T(23) * SR)], R[int(T(8) * SR):int(T(23) * SR)]])), 99.5)
L *= MASTER_DRIVE / ref
R *= MASTER_DRIVE / ref
# the clipper at 4× the rate, so its edges don't alias or overshoot between samples
L = resample_poly(np.tanh(resample_poly(L, 4, 1)), 1, 4)
R = resample_poly(np.tanh(resample_poly(R, 4, 1)), 1, 4)


def limiter(L, R, ceiling=0.79, release=0.06, look=0.003):  # −2 dBFS: room for the MP3 encoder's overshoot
    # the peaks between the samples too: the loudest of four interpolated points around each sample
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
out = np.stack([L, R], axis=1)
path = sys.argv[1] if len(sys.argv) > 1 else 'strelka.wav'
with wave.open(path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(out, -1, 1) * 32767).astype('<i2').tobytes())
print(f'{path}: {LEN / SR:.1f} s, {BARS} bars at {BPM:g} BPM')
