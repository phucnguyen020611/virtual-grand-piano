# Third-party audio attribution

## Salamander Grand Piano V3 subset

The files in `public/audio/salamander/` are derived from **Salamander Grand
Piano V3**, real recordings of a Yamaha C5 grand piano by **Alexander Holm**.

- Source project: <https://github.com/sfzinstruments/SalamanderGrandPiano>
- Original release: <https://archive.org/details/SalamanderGrandPianoV3>
- Licence: [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/)
- Required attribution: “Salamander Grand Piano V3 by Alexander Holm, licensed
  under CC BY 3.0.” This project includes that attribution here and in the
  README. No endorsement by Alexander Holm is implied.

This repository uses all 30 Salamander roots — `A0`, then `C`, `D#`, `F#` and
`A` in every octave from `C1` through `A7`, and `C8` — at original Salamander
velocity layers 4, 9, and 14. The original FLAC recordings were downmixed to
mono, resampled to 48 kHz, and encoded as Ogg/Opus at 48 kb/s for web delivery.
No musical content was added or edited; this is a format/channel/bitrate
conversion of the cited recordings.

The original project includes the full CC BY 3.0 legal code in its `LICENSE`
file; the canonical licence text is available at the licence URL above.

## Hall sounds

The chime that calls the audience in and the applause at the end of a piece
are short excerpts of recordings from Wikimedia Commons, trimmed, faded,
downmixed to mono and encoded as Ogg/Opus at 48 kHz.

| File                             | Excerpt                              | Source file on Wikimedia Commons                                                                                                                                         | Licence |
| -------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `public/audio/hall/chime.ogg`    | The tubular-bell stroke (4.0–6.7 s)  | [415061 gsb1039 clock-chime-tubebells-handbells-vibes.wav](https://commons.wikimedia.org/wiki/File:415061_gsb1039_clock-chime-tubebells-handbells-vibes.wav), by gsb1039 | CC0     |
| `public/audio/hall/applause.ogg` | The first 12 s, faded out from 8.5 s | [Sound Effects - Applause after a concert.ogg](https://commons.wikimedia.org/wiki/File:Sound_Effects_-_Applause_after_a_concert.ogg), by Amada44                         | CC0     |

The app plays the chime twice, the second a minor third lower, for the
familiar two-note call.
