# The menu soundtrack — «Районные дела»

**Not in the game since v0.2.19**: the owner chose the phonk «Hurt» again; this track stays here, ready to
re-render, should «Hurt»'s licence for a game not be had.

The game's own music (v0.2.18 part 3), replacing the track supplied earlier («Hurt»). Everything is
synthesised by `compose.py` — the drums, the 808 bass, the cowbell riff, the pad, the lead, the tape hiss —
so the music belongs to the game like the code does: no samples, no recordings, no licence to keep.

- 128 BPM, A minor with the harmonic minor's G♯ (Am – F – Dm – E), 64 bars = 2:00, looped by the game
  (the last bar's tail is folded onto the start).
- intro (8 bars, filtered) · drop (16) · second part with the lead (16) · break (8) · last drop (16).

Render and encode (needs Python 3 with numpy and scipy, and ffmpeg):

```sh
python3 tools/music/compose.py /tmp/theme.wav
ffmpeg -i /tmp/theme.wav -af loudnorm=I=-14:TP=-1.5:LRA=11 -ar 44100 -c:a libmp3lame -b:a 128k \
  -metadata title="Районные дела (BLATKOM ’89 theme)" -metadata artist="BLATKOM ’89" \
  apps/web/public/assets/audio/theme.mp3
```

The output is the same on every run (fixed random seed). To change the music, change the patterns at the
top of each instrument's block (`RIFF_A`, `RIFF_B`, `MELODY`, the kick steps, `CHORDS`) and render again.

## «Стрелка» — a hard Brazilian-phonk version (not in the game)

`compose_phonk.py` (4 Nov 2026, made for the owner to hear): «Районные дела» as a hard Brazilian phonk at
130 BPM, 72 bars = 2:13, loopable. Its «sample» is synthesised too: a 90s restaurant-chanson cassette of the
theme (an accordion with three detuned reeds over a seven-string guitar's bass-and-chord, Karplus–Strong
strings, aged with wow, flutter, hiss and a cheap deck's band), then chopped, pitched (an octave up for the
agudo chops) and screwed (half speed in the switch). The 808 slides on a tamborzão kick; the theme's cowbell
riff and lead; drops with gaps, a crowd's «ХЭЙ!» (formant synthesis), tape stops and stutter fills. No
recordings and no samples from anywhere. Mastered to about −10 LUFS, −1 dBTP.

```sh
python3 tools/music/compose_phonk.py /tmp/strelka.wav     # STEMS=<dir> also writes each part as .npy
ffmpeg -i /tmp/strelka.wav -c:a libmp3lame -b:a 320k /tmp/strelka.mp3
```

For the game it would be re-encoded like the theme (loudnorm, 96–128 kbps) and named in the credits.

## «Стрелка» in 90s blatnyak (not in the game)

`compose_blatnyak.py` (5 Nov 2026, the owner asked for the 90s blatnoy style instead of phonk): «Районные дела»
as a 90s restaurant-chanson instrumental, 124 BPM, 84 bars = 2:47 with its ending (not a loop). The band of a
90s keyboard workstation on a worn cassette, all synthesised: a drum machine (a gated-reverb snare, a
tambourine, toms), a synth bass in bass-and-chord under the seven-string guitar's off-beat strums, the accordion
with the theme, a «synth sax» for the verse (the circle of fifths), a DX-style electric piano, a string pad,
brass stabs; an Odessa polka in the bridge, F7 into the last chorus a semitone up, a «та-да-дам… пам!» ending.
About −11 LUFS, −1.7 dBTP.

```sh
python3 tools/music/compose_blatnyak.py /tmp/strelka_blatnyak.wav    # STEMS=<dir> writes each part as .npy
ffmpeg -i /tmp/strelka_blatnyak.wav -c:a libmp3lame -b:a 320k /tmp/strelka_blatnyak.mp3
```

## «MONTAGEM BLATKOM» — a hard Brazilian phonk, the dark cut (not in the game)

`compose_funk.py` (5 Nov 2026, the owner asked for hard Brazilian phonk with nothing Soviet in it): 130 BPM,
G phrygian (Gm – Gm – A♭ – Fm, D to lead home), 72 bars = 2:13, loopable. A synthesised «aah» choir chopped
like a montagem, an agudo FM lead with its pitch drop, the phonk cowbell, tamborzão toms, a heavily distorted
808 sliding under the funk kick, claps with a snap, Memphis hat rolls, tuim whistles, a siren, a formant-synth
crowd «HEY!»; a half-time switch with the choir slowed an octave down, stutter fills, gaps and tape stops.
Mastered loud like the genre: about −7.5 LUFS, −0.7 dBTP after MP3.

The dark cut (the owner's «сделай его более мрачным», same night) is what the script renders now: Gm – Gm –
A♭ – G° with the 808 sliding up the tritone, the riff and the lead on D♭ and the raised seventh, the lead an
octave down and darker, the choir low on «o» with an octave under it, a church bell's toll, a drone under the
intro, the switch and the break, an air-raid siren, a lower gang shout, no tuim whistles, the top rolled off,
a longer, darker reverb. About −7 LUFS, −0.9 dBTP after MP3. The first cut is in git (c8ba6d6).

```sh
python3 tools/music/compose_funk.py /tmp/montagem.wav     # STEMS=<dir> writes each part as .npy
ffmpeg -i /tmp/montagem.wav -c:a libmp3lame -b:a 320k /tmp/montagem.mp3
```
