#!/usr/bin/env python3
"""«Районные дела» — the menu soundtrack of BLATKOM ’89 (v0.2.18 part 3), composed and rendered by this
script: no samples, no loops from anywhere, every sound synthesised here (numpy + scipy). It replaces the
track supplied before («Hurt»), so the game's music belongs to the game.

A dark phonk / Brazilian-funk beat at 128 BPM in A minor with the harmonic minor's G♯ (Am – F – Dm – E):
a «tamborzão» kick, claps, hats, an 808 bass with slides, the cowbell riff phonk is known for, a detuned
pad, a «Soviet synth» lead with vibrato in the second half, tape hiss and a little VHS wow. 64 bars (2:00),
looped by the game; the last bar's tail is folded onto the start so the loop has no seam.

Usage: python3 tools/music/compose.py [out.wav]   (then ffmpeg → apps/web/public/assets/audio/theme.mp3,
see tools/music/README.md). Deterministic: the same file every run.
"""
import sys
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
BPM = 128.0
BEAT = 60.0 / BPM
STEP = BEAT / 4  # a 16th
BAR = BEAT * 4
BARS = 64
LEN = int(round(BARS * BAR * SR))
TAIL = int(3.0 * SR)
N = LEN + TAIL
rng = np.random.default_rng(1989)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def lp(x, f, order=2):
    return sosfilt(butter(order, min(f, SR / 2 - 100) / (SR / 2), 'low', output='sos'), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f / (SR / 2), 'high', output='sos'), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo / (SR / 2), hi / (SR / 2)], 'band', output='sos'), x)


def env_ad(n, a, d):
    """Attack (s) then exponential decay with time constant d (s)."""
    t = np.arange(n) / SR
    e = np.exp(-np.maximum(t - a, 0) / d)
    if a > 0:
        e = np.where(t < a, t / a, e)
    return e


def place(buf, x, start):
    i = int(round(start * SR))
    if i >= len(buf):
        return
    j = min(len(buf), i + len(x))
    buf[i:j] += x[: j - i]


def stepT(bar, step):
    return bar * BAR + step * STEP


# ── the song's map ──────────────────────────────────────────────────────────
# intro 0–7 · drop A 8–23 · B 24–39 · break 40–47 · drop A' 48–63
def section(bar):
    if bar < 8:
        return 'intro'
    if bar < 24:
        return 'a'
    if bar < 40:
        return 'b'
    if bar < 48:
        return 'break'
    return 'a2'


# chords, one per bar: Am – F – Dm – E (the E major's G♯ is the harmonic minor's colour)
CHORDS = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]]
ROOTS = [45, 41, 38, 40]  # A2 F2 D2 E2

# ── drums ───────────────────────────────────────────────────────────────────
kick_bus = np.zeros(N)
snare_bus = np.zeros(N)
hat_bus = np.zeros(N)
kick_times = []


def kick(t, amp=1.0):
    n = int(0.42 * SR)
    tt = np.arange(n) / SR
    f = 46 + 110 * np.exp(-tt / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-tt / 0.16)
    click = lp(rng.standard_normal(n) * np.exp(-tt / 0.004), 4000) * 0.35
    place(kick_bus, amp * np.tanh(1.6 * (body + click)), t)
    kick_times.append(t)


def clap(t, amp=1.0):
    n = int(0.3 * SR)
    tt = np.arange(n) / SR
    noise = rng.standard_normal(n)
    # three quick bursts and a tail, like hands
    e = np.zeros(n)
    for k, off in enumerate([0.0, 0.009, 0.018]):
        e += np.exp(-np.maximum(tt - off, 0) / 0.006) * (tt >= off) * (0.8 if k < 2 else 1.0)
    e += 0.6 * np.exp(-tt / 0.07)
    x = bp(noise * e, 900, 5000)
    body = np.sin(2 * np.pi * 185 * tt) * np.exp(-tt / 0.03) * 0.4
    place(snare_bus, amp * (x * 0.9 + body), t)


def hat(t, amp=1.0, open_=False):
    n = int((0.35 if open_ else 0.06) * SR)
    tt = np.arange(n) / SR
    x = hp(rng.standard_normal(n), 7000, 4) * np.exp(-tt / (0.12 if open_ else 0.012))
    place(hat_bus, amp * x * 0.5, t)


for bar in range(BARS):
    s = section(bar)
    if s == 'intro':
        if bar == 7:  # a clap roll into the drop
            for k in range(8, 16):
                clap(stepT(bar, k), 0.25 + 0.06 * (k - 8))
        continue
    if s == 'break':
        kick(stepT(bar, 0), 0.6)
        if bar == 47:
            for k in range(0, 16, 2):
                clap(stepT(bar, 8 + k / 2), 0.2 + 0.05 * k)
        continue
    kicks = [0, 3, 6, 10] + ([13] if (s in ('b', 'a2') and bar % 2 == 1) else [])
    for k in kicks:
        kick(stepT(bar, k), 1.0 if k == 0 else 0.86)
    for k in (4, 12):
        clap(stepT(bar, k))
    for k in range(0, 16, 2):
        hat(stepT(bar, k), 0.75 if k % 4 == 0 else 0.5)
    hat(stepT(bar, 14), 0.4, open_=True)
    if bar % 4 == 3:  # a 16th roll at the end of every phrase
        for k in range(12, 16):
            hat(stepT(bar, k + 0.5), 0.35)

# the pump: what ducks under every kick
duck = np.ones(N)
for t in kick_times:
    i = int(t * SR)
    n = int(0.22 * SR)
    j = min(N, i + n)
    tt = np.arange(j - i) / SR
    duck[i:j] = np.minimum(duck[i:j], 1 - 0.6 * np.exp(-tt / 0.09))

# ── the 808 with slides ─────────────────────────────────────────────────────
bass_bus = np.zeros(N)
freq = np.zeros(N)
gate = np.zeros(N)
for bar in range(BARS):
    s = section(bar)
    if s in ('intro',):
        continue
    root = ROOTS[bar % 4]
    if s == 'break':
        pattern = [(0, root, 8)]
    else:
        pattern = [(0, root, 3), (3, root, 3), (6, root + 12 if s != 'a' else root, 4), (10, root + 7, 3), (13, root, 3)]
    for st, note, dur in pattern:
        i = int(stepT(bar, st) * SR)
        j = int(stepT(bar, st + dur) * SR)
        freq[i:j] = midi(note)
        gate[i:j] = 1
# glide: the pitch moves in 35 ms between notes (a one-pole on the frequency curve)
fz = freq.copy()
last = midi(45)
a = np.exp(-1 / (0.035 * SR))
for i in range(N):
    if fz[i] > 0:
        last = a * last + (1 - a) * fz[i]
    fz[i] = last
# the amplitude: each note's decay restarts with its gate
amp = np.zeros(N)
level = 0.0
prev = 0
for i in range(N):
    g = gate[i]
    if g and not prev:
        level = 1.0
    level *= 0.99997 if g else 0.9993
    amp[i] = level if g or level > 1e-4 else 0
    prev = g
ph = 2 * np.pi * np.cumsum(fz) / SR
b808 = np.sin(ph) + 0.18 * np.sin(2 * ph)
bass_bus = np.tanh(2.2 * b808 * amp) * 0.55

# ── the cowbell riff ────────────────────────────────────────────────────────
bell_bus = np.zeros(N)
RIFF_A = [(0, 76), (3, 76), (6, 77), (8, 76), (10, 74), (12, 72), (14, 71), (16, 72), (19, 72), (22, 74), (24, 72), (26, 71), (28, 69), (30, 68)]
RIFF_B = [(0, 74), (3, 74), (6, 76), (8, 77), (10, 76), (12, 74), (14, 72), (16, 71), (19, 71), (22, 72), (24, 71), (26, 68), (28, 64), (30, 68)]


def cowbell(t, note, amp=1.0):
    n = int(0.28 * SR)
    tt = np.arange(n) / SR
    f = midi(note)
    # two detuned squares a fifth-ish apart, band-passed: the classic box's metal
    sq = np.sign(np.sin(2 * np.pi * f * tt)) + 0.7 * np.sign(np.sin(2 * np.pi * f * 1.4983 * tt))
    x = bp(sq, f * 0.8, min(f * 6, 9000)) * (0.65 * np.exp(-tt / 0.02) + 0.35 * np.exp(-tt / 0.12))
    place(bell_bus, amp * x * 0.42, t)


for bar in range(0, BARS, 2):
    s = section(bar)
    riff = RIFF_A if (bar // 2) % 2 == 0 else RIFF_B
    up = 12 if s == 'b' else 0
    a_ = 0.55 if s in ('intro', 'break') else 1.0
    for st, note in riff:
        cowbell(stepT(bar, st), note + up, a_)
# the intro and the break hear it through a closing filter
cut = np.full(N, 9000.0)
for bar in range(BARS):
    s = section(bar)
    i, j = int(bar * BAR * SR), int((bar + 1) * BAR * SR)
    if s == 'intro':
        cut[i:j] = np.linspace(500 + bar * 350, 500 + (bar + 1) * 350, j - i)
    elif s == 'break':
        cut[i:j] = 1400
filtered = np.zeros(N)
for lo, hi, f in [(0, 0, 0)]:
    pass
# a cheap time-varying low-pass: blend two fixed filters by the cutoff
low = lp(bell_bus, 700)
high = bell_bus
w = np.clip((cut - 700) / (9000 - 700), 0, 1)
bell_bus = low * (1 - w) + high * w
# a dotted-eighth echo, stereo
dly = int(3 * STEP * SR)
echoL = np.zeros(N)
echoR = np.zeros(N)
echoL[dly:] = bell_bus[:-dly] * 0.32
echoR[2 * dly:] = bell_bus[: -2 * dly] * 0.22

# ── the pad ─────────────────────────────────────────────────────────────────
padL = np.zeros(N)
padR = np.zeros(N)


def saw(f, n, phase=0.0):
    t = np.arange(n) / SR
    return 2 * ((f * t + phase) % 1.0) - 1


for bar in range(BARS):
    chord = CHORDS[bar % 4]
    n = int(BAR * SR) + int(0.6 * SR)
    tt = np.arange(n) / SR
    e = np.minimum(1, tt / 0.25) * np.exp(-np.maximum(tt - BAR, 0) / 0.18)
    for k, note in enumerate(chord):
        f = midi(note)
        l = saw(f * 1.003, n, 0.1 * k) + saw(f * 0.997, n, 0.37 * k)
        r = saw(f * 1.006, n, 0.23 * k) + saw(f * 0.994, n, 0.71 * k)
        place(padL, l * e * 0.08, bar * BAR)
        place(padR, r * e * 0.08, bar * BAR)
padL = lp(padL, 1800)
padR = lp(padR, 1800)

# ── the lead: a «Soviet synth» with vibrato (B and the last drop) ───────────
lead_bus = np.zeros(N)
MELODY = [(0, 69, 8), (8, 72, 8), (16, 77, 12), (28, 76, 4), (32, 74, 8), (40, 77, 8), (48, 76, 16)]  # 4 bars, steps


def lead_note(t, note, dur_steps, amp=1.0):
    dur = dur_steps * STEP
    n = int((dur + 0.25) * SR)
    tt = np.arange(n) / SR
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.6 * tt) * np.minimum(1, tt / 0.3)
    f = midi(note) * vib
    ph = 2 * np.pi * np.cumsum(f) / SR
    pulse = np.where(np.sin(ph) > 0.3, 1.0, -1.0) * 0.6 + np.sin(ph) * 0.5
    e = np.minimum(1, tt / 0.03) * np.where(tt < dur, 1.0, np.exp(-(tt - dur) / 0.08))
    place(lead_bus, amp * lp(pulse, 3200) * e * 0.22, t)


for bar in range(24, BARS, 4):
    s = section(bar)
    if s in ('b', 'break', 'a2'):
        for st, note, d in MELODY:
            lead_note(bar * BAR + st * STEP, note + (12 if s == 'a2' else 0), d, 0.8 if s == 'a2' else 1.0)

# ── reverb (a decaying noise impulse) for the clap, the pad and the lead ────
irn = int(1.6 * SR)
tt = np.arange(irn) / SR
ir = rng.standard_normal(irn) * np.exp(-tt / 0.45)
ir = lp(ir, 5000)
ir /= np.sqrt(np.sum(ir ** 2))


def verb(x):
    return fftconvolve(x, ir)[:N]


wetSend = snare_bus * 0.5 + lead_bus * 0.6 + (padL + padR) * 0.3
wet = verb(wetSend) * 0.35

# ── the mix ─────────────────────────────────────────────────────────────────
# tape hiss, quietly, and a riser before each drop
hiss = lp(hp(rng.standard_normal(N), 600), 6000) * 0.006
riser = np.zeros(N)
for bar in (6, 22, 46):
    n = int(2 * BAR * SR)
    tt = np.arange(n) / SR
    x = rng.standard_normal(n) * (tt / tt[-1]) ** 2
    riser_part = bp(x, 1500, 6000) * 0.05
    place(riser, riser_part, bar * BAR)

drums = kick_bus * 0.95 + snare_bus * 0.42 + hat_bus * 0.3
L = drums + bass_bus * (0.55 + 0.45 * duck) + (bell_bus + echoL) * (0.75 + 0.25 * duck) + padL * duck + lead_bus * 0.9 + wet + hiss + riser
R = drums + bass_bus * (0.55 + 0.45 * duck) + (bell_bus + echoR) * (0.75 + 0.25 * duck) + padR * duck + lead_bus * 0.9 + wet + hiss * 0.9 + riser
# the hats a little to the right
R += hat_bus * 0.08
L -= hat_bus * 0.04

# VHS wow: a slow wobble of the playback speed (a varying delay)
t = np.arange(N) / SR
d = (0.0018 * np.sin(2 * np.pi * 0.43 * t) + 0.0004 * np.sin(2 * np.pi * 5.1 * t)) * SR + 0.003 * SR
idx = np.clip(np.arange(N) - d, 0, N - 1)
i0 = np.floor(idx).astype(int)
fr = idx - i0
i1 = np.minimum(i0 + 1, N - 1)
L = L[i0] * (1 - fr) + L[i1] * fr
R = R[i0] * (1 - fr) + R[i1] * fr

L = hp(L, 28)
R = hp(R, 28)
# fold the tail onto the start: a seamless loop
for ch in (L, R):
    ch[:TAIL] += ch[LEN:LEN + TAIL]
L = L[:LEN]
R = R[:LEN]
# a gentle bus clip and the level
peak = max(np.abs(L).max(), np.abs(R).max())
L = np.tanh(1.3 * L / peak) / np.tanh(1.3)
R = np.tanh(1.3 * R / peak) / np.tanh(1.3)
out = np.stack([L, R], axis=1) * 0.89

path = sys.argv[1] if len(sys.argv) > 1 else 'theme.wav'
import wave
with wave.open(path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(out, -1, 1) * 32767).astype('<i2').tobytes())
print(f'{path}: {LEN / SR:.1f} s, {BARS} bars at {BPM:g} BPM')
