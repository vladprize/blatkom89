#!/usr/bin/env python3
"""«MONTAGEM BLATKOM» — a hard Brazilian phonk (funk mandelão / automotivo), made for the owner to hear
(5 Nov 2026); not in the game. Nothing Soviet in it: a synthesised choir chopped like a montagem, a high
«agudo» lead with its «pew», the phonk cowbell, tamborzão toms, a distorted 808 sliding under the funk
kick, claps, Memphis hat rolls, tuim whistles, a siren, a crowd's «HEY!». Every sound is synthesised here:
no samples, no recordings.

130 BPM, G phrygian (Gm – Gm – A♭ – Fm; D to lead home), 72 bars (2:13), loopable:
  0–7    the montagem: the choir opening up, the agudo, a riser, a gap, the shout
  8–23   drop 1 — the 808 on the funk kick, claps, tamborzão toms, the cowbell riff; the chopped choir joins
  24–31  the switch — half time, the choir slowed an octave down, 808 slides, an HP-swept build into a gap
  32–47  drop 2 — the agudo lead over the drop, tuims, extra kicks; the cowbell an octave up joins
  48–55  the break — the choir and the sub, then the choir stuttering up into the gap
  56–71  drop 3 — everything, a siren; a tape stop at the end
Usage: python3 tools/music/compose_funk.py [out.wav]   — deterministic: the same file every run.
"""
import os
import sys
import wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve, resample_poly
from scipy.ndimage import minimum_filter1d

SR = 44100
BPM = 130.0
BEAT = 60.0 / BPM
STEP = BEAT / 4
BAR = BEAT * 4
BARS = 72
LEN = int(round(BARS * BAR * SR))
TAIL = int(4.0 * SR)
N = LEN + TAIL
MASTER_DRIVE = 2.0  # how hard the master hits the clipper (sets the loudness)
LEVEL = dict(kick=0.85, bass=0.65, clap=0.6, tom=0.42, roll=0.42, hat=1.1, bell=1.0, agudo=0.18, choir=1.25, fx=0.6)
rng = np.random.default_rng(55130)


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


# ── the map ─────────────────────────────────────────────────────────────────
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


CYCLE = ['Gm', 'Gm', 'Ab', 'Fm']
SWITCH = ['Gm', 'Gm', 'Ab', 'Ab', 'Fm', 'Fm', 'D', 'D']
ROOT = {'Gm': 31, 'Ab': 32, 'Fm': 29, 'D': 38}  # G1 A♭1 F1 D2
UP = {'Gm': 43, 'Ab': 44, 'Fm': 41, 'D': 50}  # where the 808 slides to on the off-beats
CHORD = {'Gm': (67, 70, 74), 'Ab': (68, 72, 75), 'Fm': (65, 68, 72), 'D': (66, 69, 74)}  # the choir's voicing


def chord_at(bar):
    s = section(bar)
    if s == 'switch':
        return SWITCH[bar - 24]
    if s == 'break' and bar >= 54:
        return 'D'
    return CYCLE[bar % 4]


bus = {k: np.zeros(N) for k in ('kick', 'clap', 'tom', 'roll', 'hat', 'bell', 'agudo', 'choir', 'fx')}
kick_times = []
bass_notes = []  # (time, midi, level, slide, decay)
bass_cuts = []


# ── drums ───────────────────────────────────────────────────────────────────
def kick(t, amp=1.0):
    n = int(0.25 * SR)
    tt = np.arange(n) / SR
    f = 52 + 210 * np.exp(-tt / 0.02)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.08)
    click = hp(noise(n) * np.exp(-tt / 0.0025), 1800) * 0.6
    place(bus['kick'], amp * np.tanh(3.5 * (body + click)), t)
    kick_times.append(t)


def clap(t, amp=1.0):
    n = int(0.3 * SR)
    tt = np.arange(n) / SR
    e = np.zeros(n)
    for off in (0.0, 0.007, 0.014, 0.021):
        e += np.exp(-np.maximum(tt - off, 0) / 0.005) * (tt >= off)
    e += 0.6 * np.exp(-tt / 0.055)
    x = bp(noise(n) * e, 1100, 9000) + np.sin(2 * np.pi * 215 * tt) * np.exp(-tt / 0.03) * 0.45
    snap = hp(noise(n) * np.exp(-tt / 0.0015), 4000) * 0.8  # a finger snap on top
    place(bus['clap'], amp * np.tanh(2.6 * (x + snap)), t)


def tambor(t, hi=True, amp=1.0):
    """The tamborzão: a short pitched tom with a slap."""
    n = int(0.2 * SR)
    tt = np.arange(n) / SR
    f = (245 if hi else 168) * (1 + 0.6 * np.exp(-tt / 0.012))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.065) + bp(noise(n), 500, 3000) * np.exp(-tt / 0.008) * 0.5
    place(bus['tom'], amp * np.tanh(2.8 * x), t)


def snare(t, amp=1.0, pitch=200.0):
    n = int(0.16 * SR)
    tt = np.arange(n) / SR
    body = np.sin(2 * np.pi * pitch * tt) * np.exp(-tt / 0.04)
    nz = bp(noise(n), 1500, 8000) * np.exp(-tt / 0.045)
    place(bus['roll'], amp * np.tanh(1.8 * (0.6 * body + nz)), t)


def hat(t, amp=1.0, open_=False):
    n = int((0.28 if open_ else 0.05) * SR)
    tt = np.arange(n) / SR
    x = hp(noise(n), 7000, 4) + 0.15 * hp(np.sign(np.sin(2 * np.pi * 3270 * tt)) * np.sign(np.sin(2 * np.pi * 4730 * tt)), 6000)
    place(bus['hat'], amp * 0.5 * x * np.exp(-tt / (0.1 if open_ else 0.016)), t)


def roll(bar0, bars=2):
    """A snare roll that speeds up into a gap at the last beat: 8ths, 16ths, 32nds."""
    seq = []
    if bars == 2:
        seq += [T(bar0, s) for s in range(0, 16, 2)]
        bar0 += 1
    seq += [T(bar0, s) for s in range(0, 8)]
    seq += [T(bar0, 8 + k / 2) for k in range(8)]
    for i, t in enumerate(seq):
        p = i / max(1, len(seq) - 1)
        snare(t, 0.25 + 0.6 * p, 180 + 260 * p)


K_A = [0, 3, 6, 10, 13]
K_B = [0, 3, 6, 8, 11, 14]
TOMS_A = [(2, True), (5, False), (8, True), (11, False), (14, True)]
TOMS_B = [(2, True), (5, False), (9, True), (13, False), (15, True)]


def drop_bar(bar, extra=False):
    ch = chord_at(bar)
    odd = bar % 2 == 1
    steps = K_B if odd else K_A
    for s in steps:
        a = 1.0 if s == 0 else 0.9
        kick(T(bar, s), a)
        if s in (6, 8):
            note, lvl = UP[ch], 0.6
        else:
            note, lvl = ROOT[ch], 1.0
        bass_notes.append((T(bar, s), note, a * lvl, s in (6, 8, 10, 11), 0.3))
    if extra and odd:
        kick(T(bar, 15), 0.65)
    for s in (4, 12):
        clap(T(bar, s))
    if bar % 4 == 3:
        clap(T(bar, 15), 0.5)
    for s, hi in (TOMS_B if odd else TOMS_A):
        tambor(T(bar, s), hi, 0.85 if hi else 1.0)
    for s in range(0, 16, 2):
        hat(T(bar, s), 0.8 if s % 4 == 2 else 0.5)
    if odd:  # a Memphis roll: triplet 16ths over beat 4
        for k in range(6):
            hat(T(bar, 12) + k * BEAT / 6, 0.35 + 0.08 * k)
    else:
        hat(T(bar, 14), 0.45, open_=True)
    if extra and bar % 4 == 1:  # a 32nd rattle on beat 2
        for k in range(8):
            hat(T(bar, 4 + k / 2), 0.3 + 0.05 * k)


# ── the cowbell riff and the agudo ──────────────────────────────────────────
RIFF = [(0, 67), (3, 67), (6, 70), (8, 67), (10, 68), (12, 67), (14, 65), (16, 67), (19, 67), (22, 74), (24, 72), (26, 70), (28, 68), (30, 67)]
AGUDO = [(0, 86, 3), (3, 86, 3), (6, 84, 2), (8, 82, 4), (12, 79, 4),
         (16, 82, 3), (19, 82, 3), (22, 80, 2), (24, 79, 8),
         (32, 87, 3), (35, 87, 3), (38, 86, 2), (40, 84, 4), (44, 80, 4),
         (48, 84, 3), (51, 84, 3), (54, 82, 2), (56, 80, 4), (60, 79, 4)]  # four bars over Gm Gm A♭ Fm


def cowbell(t, note, amp=1.0):
    n = int(0.3 * SR)
    tt = np.arange(n) / SR
    f = midi(note)
    sq = np.sign(np.sin(2 * np.pi * f * tt)) + 0.7 * np.sign(np.sin(2 * np.pi * f * 1.4983 * tt))
    x = bp(sq, f * 0.8, min(f * 6, 9000)) * (0.65 * np.exp(-tt / 0.02) + 0.35 * np.exp(-tt / 0.13))
    place(bus['bell'], amp * 0.4 * np.tanh(2.4 * x), t)


def riff(bar, up=0, amp=1.0, half=False):
    for st, note in RIFF:
        cowbell(T(bar, st * (2 if half else 1)), note + up, amp)


def agudo(t, note, dur_steps, amp=1.0):
    """The agudo: a piercing FM lead that drops a semitone into each note (the «pew»)."""
    dur = dur_steps * STEP * 0.9
    n = int((dur + 0.3) * SR)
    tt = np.arange(n) / SR
    f = midi(note) * 2 ** (100 * np.exp(-tt / 0.022) / 1200)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph + (2.0 * np.exp(-tt / 0.15) + 0.6) * np.sin(ph)) + 0.35 * np.sign(np.sin(ph))
    env = np.minimum(1, tt / 0.002) * (0.55 + 0.45 * np.exp(-tt / 0.2)) * np.where(tt < dur, 1.0, np.exp(-(tt - dur) / 0.05))
    place(bus['agudo'], amp * lp(np.tanh(1.8 * y * env), 9000), t)


def agudo_bars(bar, amp=1.0, up=0):
    for st, note, d in AGUDO:
        agudo(T(bar, st), note + up, d, amp)


# ── the choir: «aah», a few voices a note, through a vowel's formants ───────
FORMANTS_A = ((800, 90, 1.0), (1150, 100, 0.55), (2900, 140, 0.28), (3900, 160, 0.12))


def choir(t0, notes, dur, amp=1.0, attack=0.08, voices=4):
    n = int((dur + 0.35) * SR)
    tt = np.arange(n) / SR
    src = np.zeros(n)
    for note in notes:
        for v in range(voices):
            f = midi(note) * (1 + rng.uniform(-0.006, 0.006))
            vib = 1 + 0.004 * np.sin(2 * np.pi * rng.uniform(4.6, 5.6) * tt + rng.uniform(0, 6.3))
            src += 2 * ((np.cumsum(f * vib) / SR + rng.uniform()) % 1.0) - 1
    src = lp(src / (len(notes) * voices), 6000) + 0.04 * noise(n)
    y = np.zeros(n)
    for F, bw, g in FORMANTS_A:
        y += g * bp(src, F - bw, F + bw)
    env = np.minimum(1, tt / attack) * np.where(tt < dur, 1.0, np.exp(-(tt - dur) / 0.12))
    place(bus['choir'], amp * 3.0 * y * env, t0)


GATE = [0, 2, 3, 6, 8, 9, 12, 14]  # the montagem: where the chopped choir sounds in a bar
choir_gate = np.ones(N)


def gate_bar(bar):
    i0, i1 = int(T(bar) * SR), int(T(bar + 1) * SR)
    g = np.zeros(i1 - i0)
    f = int(0.003 * SR)
    for s in GATE:
        a = int(s * STEP * SR)
        b = min(len(g), a + int(0.85 * STEP * SR))
        g[a:b] = 1.0
        g[a:a + f] *= np.linspace(0, 1, f)
        g[b - f:b] *= np.linspace(1, 0, f)
    choir_gate[i0:i1] = g


# ── effects ─────────────────────────────────────────────────────────────────
def tuim(t, amp=1.0):
    n = int(0.18 * SR)
    tt = np.arange(n) / SR
    f = 1250 + 1250 * np.exp(-tt / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    place(bus['fx'], amp * (np.sin(ph) + 0.25 * np.sin(2 * ph)) * np.minimum(1, tt / 0.003) * np.exp(-tt / 0.07), t)


def riser(bar0, bars=2, amp=1.0):
    n = int(bars * BAR * SR)
    tt = np.arange(n) / SR
    p = tt / tt[-1]
    nz = sweep(noise(n), 300 * (8000 / 300) ** p, 'high') * p ** 2
    tone = lp(2 * ((np.cumsum(196 * 4 ** p) / SR) % 1.0) - 1, 3000) * p ** 2 * 0.3
    place(bus['fx'], amp * 0.12 * (nz + tone), T(bar0))


def siren(bar0, bars=2, amp=1.0):
    n = int(bars * BAR * SR)
    tt = np.arange(n) / SR
    f = 900 + 350 * np.sin(2 * np.pi * (BPM / 60 / 2) * tt)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, tt / 0.3) * np.minimum(1, (tt[-1] - tt) / 0.4)
    place(bus['fx'], amp * 0.2 * np.tanh(1.5 * x), T(bar0))


# ═══ the parts, bar by bar ══════════════════════════════════════════════════════════════════════
for bar in range(BARS):
    s = section(bar)
    ch = chord_at(bar)
    if s == 'intro':
        choir(T(bar), CHORD[ch], BAR, 0.8)
        if bar >= 4 and bar % 4 == 0:
            agudo_bars(bar, 0.5)
        continue
    if s == 'drop1':
        drop_bar(bar)
        if bar % 2 == 0:
            riff(bar, 0, 1.0)
        if bar >= 16:
            choir(T(bar), CHORD[ch], BAR, 0.75)
            gate_bar(bar)
        if bar % 4 == 3:
            tuim(T(bar, 15), 0.45)
        continue
    if s == 'switch':
        kick(T(bar, 0), 0.95)
        if bar % 2 == 1 and bar < 30:
            kick(T(bar, 10), 0.75)
        if bar % 2 == 0:
            bass_notes.append((T(bar, 0), ROOT[ch], 1.0, True, 0.9))
        if bar < 30:
            clap(T(bar, 8), 0.95)
            for k in range(12):
                hat(T(bar) + k * BAR / 12, 0.45 if k % 3 == 0 else 0.3)
            hat(T(bar, 6), 0.35, open_=True)
            if bar % 2 == 1:
                tambor(T(bar, 14), True, 0.7)
        choir(T(bar), [n - 12 for n in CHORD[ch]], BAR, 0.9, attack=0.25)  # slowed: an octave down
        if bar % 4 == 0 and bar < 30:
            riff(bar, -12, 0.45, half=True)
        continue
    if s == 'drop2':
        drop_bar(bar, extra=True)
        if bar % 4 == 0:
            agudo_bars(bar, 1.0)
        if bar >= 40 and bar % 2 == 0:
            riff(bar, 12, 0.55)
        choir(T(bar), CHORD[ch], BAR, 0.5)
        gate_bar(bar)
        if bar % 2 == 0:
            tuim(T(bar, 7), 0.5)
        continue
    if s == 'break':
        i = bar - 48
        if i < 6:
            choir(T(bar), CHORD[ch], BAR, 0.85, attack=0.15)
        if i < 6 and i % 2 == 0:
            bass_notes.append((T(bar, 0), ROOT[ch], 0.4, True, 1.6))
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
            riff(bar, 0, 0.85)
            riff(bar, 12, 0.35)
        if bar % 4 == 0:
            agudo_bars(bar, 0.9)
        choir(T(bar), CHORD[ch], BAR, 0.55)
        gate_bar(bar)
        if bar % 4 == 2:
            tuim(T(bar, 7), 0.45)
        if bar % 4 == 3:
            tuim(T(bar, 15), 0.45)

# the intro: hats and toms creep in, a riser and a roll
for st in range(0, 16, 2):
    hat(T(6, st), 0.25 + 0.02 * st)
    hat(T(7, st), 0.4)
for bar in (6, 7):
    for st, hi in TOMS_A:
        tambor(T(bar, st), hi, 0.4 if bar == 6 else 0.6)
kick(T(7, 0), 0.7)
kick(T(7, 6), 0.6)
roll(6, 2)
riser(6, 2, 1.0)
# the switch's build
roll(30, 2)
riser(30, 2, 1.1)
bass_notes.append((T(30, 0), ROOT['D'], 1.0, True, 1.6))
# the break's build: the choir on D, stuttering up
for k in range(4):
    choir(T(54) + k * BEAT, CHORD['D'], BEAT * 0.8, 0.8, attack=0.01)
for k in range(2):
    choir(T(55) + k * BEAT / 2, [n + 1 for n in CHORD['D']], BEAT * 0.4, 0.85, attack=0.005)
for k in range(4):
    choir(T(55, 4) + k * STEP, [n + 2 for n in CHORD['D']], STEP * 0.8, 0.9, attack=0.004)
for k in range(8):
    choir(T(55, 8) + k * STEP / 2, [n + 3 for n in CHORD['D']], STEP * 0.4, 0.95, attack=0.003)
bass_notes.append((T(54, 0), ROOT['D'], 0.55, True, 2.5))
roll(54, 2)
riser(54, 2, 1.1)
siren(56, 2, 1.0)

# the choir's filters: the intro and the break open up from a dark low-pass
for b0, b1, f0, f1 in ((0, 7, 450, 9000), (48, 52, 600, 8000)):
    i0, i1 = int(T(b0) * SR), int(T(b1) * SR)
    bus['choir'][i0:i1] = sweep(bus['choir'][i0:i1], np.geomspace(f0, f1, i1 - i0), 'low')
i0, i1 = int(T(4) * SR), int(T(8) * SR)
bus['agudo'][i0:i1] = sweep(bus['agudo'][i0:i1], np.geomspace(1200, 12000, i1 - i0), 'low')
bus['choir'] *= choir_gate
del choir_gate

bass_cuts += [T(7, 12), T(23, 12), T(31, 12), T(47, 12), T(55, 12), T(71, 12)]


# ── the 808 ─────────────────────────────────────────────────────────────────
def render_808():
    notes = sorted(bass_notes)
    cuts = sorted(bass_cuts)
    freq = np.full(N, midi(31))
    amp = np.zeros(N)
    prev_f, prev_level, prev_end = midi(31), 0.0, -100
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
        f = ft + (f0 - ft) * np.exp(-tt / (0.045 if slide else 0.004))
        if not slide:
            f = f * (1 + 0.5 * np.exp(-tt / 0.008))
        lv0 = prev_level if legato else 0.0
        att = np.minimum(1, tt / 0.003)
        env = lv0 * (1 - att) + a * np.exp(-tt / decay) * att
        if t1 < nxt - 1e-6:
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
    dist = lp(hp(np.tanh(6.0 * (sub + 0.15 * sub ** 2)), 25), 3500)
    dist -= 0.4 * bp(dist, 90, 220)
    return 0.34 * dist + 0.6 * sub


bass_bus = render_808()

# ── the shout: a crowd's «HEY!» (formant synthesis) ─────────────────────────
FORM = {'e': (530, 1840, 2480), 'i': (290, 2250, 2900)}
FORM_BW = (100, 120, 170)
FORM_GAIN = (1.0, 0.9, 0.6)


def resonator(x, F, bw):
    r = np.exp(-np.pi * bw / SR)
    c1 = 2 * r * np.cos(2 * np.pi * F / SR)
    c2 = r * r
    g = (1 - r) * 2 * np.sin(2 * np.pi * F / SR)
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
    kh_n = int(0.05 * SR)
    out[:kh_n] += bp(noise(kh_n), 900, 3800) * np.sin(np.pi * np.arange(kh_n) / kh_n) ** 0.7 * 0.2
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
    vs = int(0.03 * SR)
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
    L, R = hp(np.tanh(2.2 * L), 140), hp(np.tanh(2.2 * R), 140)
    m = max(np.abs(L).max(), np.abs(R).max())
    return L / m, R / m


HEY_L, HEY_R = crowd_hey()

# ═══ the mix ════════════════════════════════════════════════════════════════════════════════════
V = LEVEL
if os.environ.get('STEMS'):
    for k, x in list(bus.items()) + [('bass', bass_bus)]:
        np.save(os.path.join(os.environ['STEMS'], k + '.npy'), (x * V[k]).astype(np.float32))

duck = np.ones(N)
for t in kick_times:
    i = int(t * SR)
    j = min(N, i + int(0.24 * SR))
    tt = np.arange(j - i) / SR
    duck[i:j] = np.minimum(duck[i:j], 1 - 0.6 * np.exp(-tt / 0.1))

_irn = int(2.0 * SR)
_tt = np.arange(_irn) / SR
irL = lp(noise(_irn) * np.exp(-_tt / 0.42), 6000)
irR = lp(noise(_irn) * np.exp(-_tt / 0.42), 6000)
irL[: int(0.012 * SR)] = 0
irR[: int(0.017 * SR)] = 0
irL /= np.sqrt(np.sum(irL ** 2))
irR /= np.sqrt(np.sum(irR ** 2))

# the cowbell's and the agudo's echoes: a dotted 8th left, a quarter right
echo_src = bus['bell'] * V['bell'] + bus['agudo'] * V['agudo'] * 0.8
d3, d4 = int(3 * STEP * SR), int(4 * STEP * SR)
echoL = np.zeros(N)
echoR = np.zeros(N)
echoL[d3:] = echo_src[:-d3] * 0.3
echoR[d4:] = echo_src[:-d4] * 0.24
del echo_src

send = (bus['clap'] * V['clap'] * 0.45 + bus['roll'] * V['roll'] * 0.3 + bus['bell'] * V['bell'] * 0.45 + bus['agudo'] * V['agudo'] * 0.55
        + bus['choir'] * V['choir'] * 0.5 + bus['fx'] * V['fx'] * 0.5 + bus['tom'] * V['tom'] * 0.2)
wetL = fftconvolve(send, irL)[:N] * 0.42
wetR = fftconvolve(send, irR)[:N] * 0.42
del send

drums = bus['kick'] * V['kick'] + bus['clap'] * V['clap'] + bus['roll'] * V['roll'] + bus['tom'] * V['tom']
music = (bus['bell'] * V['bell'] + bus['agudo'] * V['agudo'] + bus['fx'] * V['fx']) * duck
cho = bus['choir'] * V['choir'] * duck
choD = np.zeros(N)
choD[int(0.013 * SR):] = cho[: -int(0.013 * SR)]
L = drums + bass_bus * V['bass'] + music + cho + echoL * duck + bus['hat'] * V['hat'] * 0.85 + wetL
R = drums + bass_bus * V['bass'] + music + cho * 0.55 + choD * 0.5 + echoR * duck + bus['hat'] * V['hat'] * 1.15 + wetR
del drums, music, cho, choD, wetL, wetR, echoL, echoR


# ── the master's moves: stutters, sweeps, tape stops, gaps ──────────────────
def m_stutter(t0, parts):
    t = t0
    for length, count in parts:
        n = int(length * SR)
        i = int(t * SR)
        for ch_ in (L, R):
            piece = fades(ch_[i:i + n].copy(), 0.001, 0.004)
            for k in range(count):
                ch_[i + k * n:i + (k + 1) * n] = piece
        t += length * count


def m_sweep(t0, t1, f0, f1, kind):
    i0, i1 = int(t0 * SR), int(t1 * SR)
    curve = np.geomspace(f0, f1, i1 - i0)
    for ch_ in (L, R):
        ch_[i0:i1] = sweep(ch_[i0:i1], curve, kind)


def m_tapestop(t0, dur):
    i0, n = int(t0 * SR), int(dur * SR)
    tau = np.arange(n) / n
    pos = i0 + np.cumsum((1 - tau) ** 1.6)
    for ch_ in (L, R):
        ch_[i0:i0 + n] = np.interp(pos, np.arange(len(ch_)), ch_) * np.minimum(1, (1 - tau) * 10)


def m_gap(t0, t1):
    i0, i1 = int(t0 * SR), int(t1 * SR)
    f = int(0.004 * SR)
    for ch_ in (L, R):
        ch_[i0:i0 + f] *= np.linspace(1, 0, f)
        ch_[i0 + f:i1] = 0


FILL = [(STEP, 2), (STEP / 2, 4)]
m_stutter(T(15, 12), FILL)
m_stutter(T(39, 12), FILL)
m_stutter(T(63, 12), FILL)
m_stutter(T(67, 14), [(STEP / 2, 4)])
m_sweep(T(23, 0), T(23, 12), 16000, 700, 'low')
m_tapestop(T(23, 12), BEAT)
m_tapestop(T(47, 12), BEAT)
m_sweep(T(30, 0), T(31, 12), 30, 650, 'high')
m_sweep(T(54, 0), T(55, 12), 30, 500, 'high')
m_sweep(T(71, 0), T(71, 12), 16000, 700, 'low')
m_tapestop(T(71, 12), BEAT)
for b in (7, 31, 55):
    m_gap(T(b, 12), T(b + 1))
for ch_ in (L, R):
    ch_[LEN:] = 0

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
BOOM = np.tanh(1.6 * np.sin(2 * np.pi * np.cumsum(30 + 60 * np.exp(-_tt / 0.12)) / SR) * np.exp(-_tt / 0.45))
REV = fftconvolve(CRASH[: int(BEAT * SR)], irL)[: int(BEAT * SR * 1.2)][::-1]
REV /= np.abs(REV).max()
REV *= np.linspace(0, 1, len(REV)) ** 2
for b in (8, 32, 56):
    post(CRASH, None, T(b), 0.24)
    post(BOOM, None, T(b), 0.65)
    post(REV, None, T(b) - len(REV) / SR, 0.3)
    post(HEY_L, HEY_R, T(b - 1, 12.5), 0.6)
post(BOOM, None, T(24), 0.5)
post(CRASH, None, T(48), 0.14)
for b, st in ((19, 12), (27, 8), (44, 12), (60, 12), (68, 12)):
    post(HEY_L, HEY_R, T(b, st), 0.4)
heyWet = fftconvolve(postL * 0.3, irR)[:N] * 0.3
L += postL + heyWet
R += postR + heyWet
del postL, postR, heyWet

# ── the master: the loop, a clipper at 4× the rate, a limiter that watches the peaks between samples ──
L = hp(L, 25)
R = hp(R, 25)
L += 0.25 * bp(L, 2000, 5000)  # a little more bite where the ear is keenest
R += 0.25 * bp(R, 2000, 5000)
for ch_ in (L, R):
    ch_[:TAIL] += ch_[LEN:LEN + TAIL]
L, R = L[:LEN], R[:LEN]
ref = np.percentile(np.abs(np.concatenate([L[int(T(8) * SR):int(T(23) * SR)], R[int(T(8) * SR):int(T(23) * SR)]])), 99.5)
L *= MASTER_DRIVE / ref
R *= MASTER_DRIVE / ref
L = resample_poly(np.tanh(resample_poly(L, 4, 1)), 1, 4)
R = resample_poly(np.tanh(resample_poly(R, 4, 1)), 1, 4)


def limiter(L, R, ceiling=0.79, release=0.06, look=0.003):  # −2 dBFS: room for the MP3 encoder's overshoot
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
path = sys.argv[1] if len(sys.argv) > 1 else 'montagem_blatkom.wav'
with wave.open(path, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(out, -1, 1) * 32767).astype('<i2').tobytes())
print(f'{path}: {LEN / SR:.1f} s, {BARS} bars at {BPM:g} BPM')
