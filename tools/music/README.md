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
