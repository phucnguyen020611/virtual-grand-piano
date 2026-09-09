<div align="center">
  <img src="public/logo.svg" alt="Virtual Grand Piano logo" width="132" height="132" />

# Virtual Grand Piano

**An interactive 3D concert grand piano for playing, exploring, and inspecting the instrument from the inside out.**

[![CI](https://github.com/phucnguyen020611/virtual-grand-piano/actions/workflows/ci.yml/badge.svg)](https://github.com/phucnguyen020611/virtual-grand-piano/actions/workflows/ci.yml)
[![Deploy](https://github.com/phucnguyen020611/virtual-grand-piano/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/phucnguyen020611/virtual-grand-piano/actions/workflows/deploy-pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2ea44f.svg)](LICENSE)
[![Three.js](https://img.shields.io/badge/Three.js-0.185.1-black?logo=threedotjs)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-8.1.5-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
</div>

## Overview

Virtual Grand Piano is a browser-based 3D instrument experience focused on two ideas: the expressive feel of a concert grand and the engineering hidden inside it. The first release provides a playable procedural grand piano, a free inspection camera, an exploded anatomy view, a modeled music desk and score, and a cinematic wooden-stage presentation.

The current model is procedural and intentionally lightweight. Future releases can replace or extend individual systems with higher-fidelity meshes, physically based textures, sampled audio, mechanical animation, and more accurate piano-action behavior without changing the overall product concept.

## Features

- Interactive 3D concert grand piano rendered in real time
- Full 88-key keyboard geometry
- Mouse/touch key interaction
- Computer-keyboard performance controls
- Recorded acoustic piano samples with a bounded generated fallback
- Autoplay demonstration using the opening theme of _Für Elise_
- Free orbit, zoom, and pan inspection camera
- Normal inspection mode
- Exploded-parts inspection mode
- Individually modeled major systems:
  - lacquered rim and case
  - lid and prop
  - soundboard and ribs
  - cast-iron plate / harp
  - bass and treble string fields
  - bridge and tuning details
  - hammer action and felt rail
  - 88-key keyboard
  - legs and brass casters
  - pedal lyre and three pedals
  - music desk and 3D score
- Wooden concert stage with a focused overhead lamp
- Soft shadows, glossy reflections, fog, and ACES tone mapping
- Responsive desktop and mobile interface

## Controls

| Action                  | Control                                          |
| ----------------------- | ------------------------------------------------ |
| Orbit camera            | Left-drag / one-finger drag                      |
| Zoom                    | Mouse wheel / pinch                              |
| Pan                     | Right-drag / two-finger drag                     |
| Play visible key        | Press, tap, or drag across piano keys            |
| Play mapped notes       | `Z–/`, `Q–[`, and nearby number-row black keys   |
| Shift keyboard range    | `←` / `→` or **Oct −** / **Oct +**               |
| Sustain                 | `Space` (when a UI control is not focused)       |
| MIDI input              | **Connect MIDI**, then choose an input if needed |
| Record performance      | **Record**, then **Play recording**              |
| Inspect component       | Click a piano component                          |
| Separate systems        | **Exploded**                                     |
| Restore assembled piano | **Normal**                                       |
| Toggle lid              | **Open Lid / Close Lid**                         |
| Autoplay                | **Für Elise**                                    |
| Restore camera          | **Reset View**                                   |

## Tech stack

| Layer              | Technology     | Purpose                                                                 |
| ------------------ | -------------- | ----------------------------------------------------------------------- |
| 3D / WebGL         | Three.js       | Scene graph, geometry, materials, lighting, raycasting, camera controls |
| Build tooling      | Vite           | Fast local development and optimized production builds                  |
| Audio              | Web Audio API  | Recorded-sample piano playback, acoustic buses, and autoplay            |
| UI                 | HTML + CSS     | Responsive controls and inspector overlays                              |
| CI                 | GitHub Actions | Build verification on pushes and pull requests                          |
| Deployment         | GitHub Pages   | Static production hosting from the `main` branch                        |
| Dependency updates | Dependabot     | Scheduled npm and GitHub Actions update pull requests                   |

## Project structure

```text
virtual-grand-piano/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── deploy-pages.yml
│   └── dependabot.yml
├── public/
│   └── logo.svg
├── src/
│   ├── main.js                # scene/renderer/camera bootstrap + wiring + render loop
│   ├── piano/
│   │   ├── createPiano.js      # assembles the instrument + exploded-view layout
│   │   ├── anatomy.js          # rim/case, soundboard, plate, strings, action, legs, pedals, lid, desk
│   │   ├── keyboard.js         # 88-key geometry + MIDI lookups
│   │   ├── geometry.js         # dimension table, footprint shapes, mesh helpers
│   │   └── materials.js        # material palette + procedural canvas textures
│   ├── scene/
│   │   ├── stage.js            # wooden concert stage
│   │   └── lighting.js         # overhead lamp + key/fill/rim/hemisphere lights
│   ├── audio/
│   │   ├── pianoAudio.js       # sampler voices, buses, reverb, sustain, pedal noise
│   │   └── pianoSamples.js     # sample manifest + offline sample/IR rendering
│   ├── performance/
│   │   ├── computerKeyboard.js # physical-key layout, octave shift, focus safety
│   │   ├── midiInput.js        # selected Web MIDI input + CC64 handling
│   │   └── performanceRecorder.js # in-memory musical event recording/playback
│   ├── interaction/
│   │   └── inspection.js       # raycasting selection, labels, mode switching
│   └── style.css
├── .editorconfig
├── .gitignore
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── SECURITY.md
├── index.html
├── package.json
└── vite.config.js
```

## Getting started

### Requirements

- Node.js 22.12 or newer
- npm 10 or newer recommended
- A modern browser with WebGL support

### Install

```bash
npm ci
```

The committed lockfile keeps local, CI, and deployment installs reproducible.

### Run locally

```bash
npm run dev
```

Vite will print the local development URL in the terminal.

### Production build

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

## Scripts

| Command                | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| `npm run dev`          | Start the Vite development server                     |
| `npm run build`        | Build optimized static assets into `dist/`            |
| `npm run preview`      | Serve the production build locally                    |
| `npm test`             | Run dependency-free input/ownership regression checks |
| `npm run format:check` | Check formatting                                      |

## Architecture

The implementation is split into focused modules so each system can evolve independently:

1. **Scene and renderer** (`main.js`, `scene/`) establish the WebGL environment, camera, stage, lighting, fog, tone mapping, and shadows.
2. **Procedural piano** (`piano/`) builds the instrument from a shared dimension table. The case is a **hollow curved rim** (an extruded outer contour with an inner cavity hole) rather than a solid plate; the soundboard, cast plate, strings, and action stack in a physically believable vertical order below the rim top so the internal anatomy stays visible. Each major part is a separate, individually selectable Three.js group.
3. **Interaction** (`interaction/inspection.js`) uses raycasting for mouse/touch selection, drives the exploded-view labels, and manages `OrbitControls` for free inspection.
4. **Audio** (`audio/`) is a recorded-sample piano engine with a generated PCM fallback. `pianoSamples.js` owns the manifest and fallback renderer; `pianoAudio.js` owns the voice manager and shared output bus. See [Audio engine](#audio-engine).
5. **Performance input** (`performance/`) maps computer keys, pointer/touch gestures, Web MIDI, and event-recording playback through the same ownership-aware controller.
6. **Animation** (`main.js` render loop) interpolates key travel, lid movement, component separation, labels, and autoplay state.

## Performance input

The computer keyboard exposes roughly 2½ octaves at once, beginning at C3 by
default. Lower-row `Z–/` and upper-row `Q–[` provide the white-key layout;
nearby number/letter keys fill the black keys. Arrow keys or the compact octave
buttons move the range in 12-semitone steps without changing notes already held.
At either physical-range boundary the unavailable octave control is disabled,
so the range never makes a partial, non-octave shift.
Space is the sustain pedal unless a focused button, disclosure, link, or form control owns
that key. Browser focus loss and MIDI disconnects perform normal musical
releases, while the Autoplay and Recording Stop controls intentionally use
source-scoped force-stop behavior.

Pointer and touch keys use pointer capture: releasing, cancelling, or losing
capture releases only that pointer's token. A held pointer can glide across
keys, and independent touch pointers can form chords. Pen/touch pressure is
used conservatively when available; mouse clicks use a stable velocity.

Click the piano surface or Tab back to it after using controls. Browser shortcuts
with Control, Command, or Alt and IME composition are never used as piano input.
Pointer notes and pedals release on blur or page hiding, including simultaneous
key/pedal gestures.

Web MIDI is requested only from **Connect MIDI**, without SysEx. The selected
input supports all channels, note-on velocity 1–127, both standard note-off
forms, CC64 sustain, and channel-scoped CC120/CC123 held-note cleanup. Unsupported
browsers show an unavailable state; denied permission leaves the instrument
fully playable. MIDI messages and recordings stay in the browser and are never
sent anywhere.

**Recording** stores a small in-memory JSON-like event sequence (`version`,
`durationMs`, note on/off IDs, velocity, and sustain transitions), not audio.
It records computer, pointer, and MIDI performance only—never autoplay or its
own playback. Playback uses the regular `recording` source, so it coexists with
live performance and can be stopped without affecting other sources. Recordings
are intentionally not persisted across page reloads. Playback is disabled while
recording so the event list stays immutable during playback.

The geometry is intentionally procedural; higher-fidelity glTF meshes and PBR textures can replace individual modules without changing the overall product concept.

## Audio engine

The default backend is recorded acoustic piano playback, with generated additive
PCM reserved for a cold load or a failed recorded asset.

|                    |                                                         |
| ------------------ | ------------------------------------------------------- |
| Source             | Salamander Grand Piano V3 — Yamaha C5 recordings        |
| Licence            | CC BY 3.0 (Alexander Holm; attribution below)           |
| Root samples       | 16, from A0 through C8                                  |
| Velocity layers    | 3 real captures (original layers 4 / 9 / 14) = 48 files |
| Shipped asset size | 3.56 MiB Ogg/Opus, mono 48 kHz                          |
| Decoded cache      | 56 MiB bounded working set (about 37 MiB pinned)        |
| Polyphony          | 64 voices                                               |

**Attribution.** “Salamander Grand Piano V3 by Alexander Holm, licensed under
CC BY 3.0.” The compact local Ogg/Opus assets are format/channel/bitrate
conversions of the source recordings. See [third-party audio attribution](THIRD_PARTY_AUDIO.md)
for source URLs, licence details, source velocity layers, and modifications.
The repository's MIT licence covers this project's code; the included recorded
sample derivatives remain available under their CC BY 3.0 attribution terms.

**Mapping.** Each MIDI note picks its nearest root and plays it at
`2^((midi - rootMidi) / 12)`. The measured full-range transposition bound is
**+3 / -2 semitones** (never more than ±3). Soft↔medium blends continuously
from velocity 0.30–0.46; medium↔forte does the same from 0.64–0.80. The blend
uses equal-power gains, so it is one logical voice even when it has two sample
source nodes.

**Lazy decode and cache.** The data-driven manifest uses public assets beneath
`${import.meta.env.BASE_URL}audio/salamander/`, which works under both local
development and the GitHub Pages repository base path. The C3–C6 mapped range
(roots A2 through A5, all three layers) is decoded first. A2 is required
because C3 maps down three semitones to that root. The context uses 48 kHz
and an interactive latency hint. Medium/forte captures in that range are
pinned (about 37 MiB); soft captures are evictable. This leaves space for
bass and high-register playing without permanently pinning the entire warmup. Bass and high-register captures load only when
played. Recorded and fallback buffers share a 56 MiB LRU-like decoded cache:
unpinned recordings and generated fallbacks are evicted by last use, while an
active `AudioBufferSourceNode` continues safely after its cache entry is gone.
Concurrent requests for one root/layer share one fetch/decode promise. Failed
requests have a 15-second network timeout and a 30-second retry cooldown; a
later attack can recover after a transient failure without a request storm.

**Fallback.** Entry briefly prepares generated forte fallbacks for the first
computer key (C3’s A2 root), A0 and C8, yielding between buffers. This moves
that synthesis cost before performance; other cold roots and velocity layers
can still incur synchronous synthesis. If a recording fails to load, or no recording has reached the
requested note yet during cold load, the engine immediately generates an
additive PCM fallback for that attack and queues the recording for a later
attack. It never crossfades synthetic and recorded layers in one note. Once a
recording is ready it wins for future notes and replaces its fallback cache
entry. The DEV audio hook offers side-effect-free `sampleForMidi()`, bounded
cache `cacheStats()`, plus `voiceStats()`, `resonanceStats()`, and
`pedalStats()` diagnostics before or after audio initialization.

## Operations

### Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests. The workflow installs the pinned project dependencies, checks formatting, runs the
input/ownership regression checks, and verifies the production build.

### GitHub Pages deployment

`.github/workflows/deploy-pages.yml` builds and deploys `dist/` whenever `main` changes. The Vite base path is configured for this repository name.

For the first deployment, repository administrators should confirm **Settings → Pages → Build and deployment → Source → GitHub Actions**.

Expected Pages URL:

```text
https://phucnguyen020611.github.io/virtual-grand-piano/
```

### Dependency maintenance

Dependabot checks npm packages and GitHub Actions weekly. Update pull requests should be reviewed and validated by CI before merging.

## Release readiness

### QA matrix

Record each release candidate with the result categories **PASS**, **FAIL**,
**PARTIAL**, or **NOT AVAILABLE**. Do not infer hardware coverage from browser
emulation.

| Area              | Release-candidate coverage                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Desktop           | Chromium/Chrome-class; Firefox; Safari/WebKit where available                                                          |
| Mobile and tablet | iOS/WebKit, Android/Chromium, and responsive portrait/landscape checks                                                 |
| Input             | Mouse, computer keyboard, touch, multi-touch, and Web MIDI hardware where available                                    |
| Core flows        | Audio unlock/warmup/fallback, sustain, autoplay, recording/playback, inspection, lid, camera, help, and responsive HUD |
| Production        | Console, asset/base-path requests, CI, Pages, and deployed smoke test                                                  |

### Browser and device support

- **Recommended:** current Chromium-based browsers. Release-candidate desktop
  smoke testing covers audio unlock, recorded-sample warmup, keyboard input,
  recording/playback, autoplay, inspection, and the responsive HUD.
- **Firefox and Safari/WebKit:** supported targets that require a release-candidate
  smoke test on the intended browser before broad compatibility is claimed.
  Ogg/Opus requires Safari 18.4 on macOS 15.4 / iOS 18.4 or newer, as
  [documented by WebKit](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/).
  Older Safari/OS combinations may use generated fallback audio. No alternate
  encoded sample library is downloaded or decoded.
- **Touch:** pointer-based touch interaction is supported. Verify multi-touch and
  orientation behavior on representative hardware for each release.
- **Web MIDI:** optional and browser/device-dependent. The piano remains fully
  playable without it; a denied or unavailable MIDI request is surfaced in the
  HUD.
- **Audio:** a user gesture is required to start audio. During a cold load or a
  failed sample request, a generated fallback responds while local
  recorded samples warm up.

### Release checklist

- Run `npm ci --no-audit --no-fund`, `npm run format:check`, `npm run build`,
  `npm test`, and `npm run preview` from the committed lockfile.
- With `npm run dev` running, open `/virtual-grand-piano/tests/browser.html`
  for renderer/audio/input/layout checks and a three-minute session soak.
  Open `/virtual-grand-piano/tests/failures.html` for simulated network, decoder,
  AudioContext and WebGL failures. These test pages are excluded from the build.
- Confirm CI and GitHub Pages succeed for the exact release SHA.
- Smoke-test the deployed Pages URL, including audio unlock, one keyboard note,
  recording/playback, autoplay, inspection, and browser console/network errors.
- Check keyboard focus, help dismissal, reduced motion, and responsive layouts
  at desktop, tablet, and mobile dimensions.
- Confirm audio attribution remains in [THIRD_PARTY_AUDIO.md](THIRD_PARTY_AUDIO.md)
  when audio assets change.

### Performance guidance

When adding production assets:

- Prefer glTF/GLB for complex meshes.
- Compress geometry where practical.
- Use GPU-friendly PBR texture sizes and modern compressed texture formats when supported.
- Lazy-load large audio and model resources.
- Keep render-loop allocations minimal.
- Measure frame time on integrated GPUs and mobile devices before increasing polygon or shadow-map budgets.

## Quality and known limits

Portrait framing and a 1.5 DPR cap on narrow/coarse-pointer devices keep the
full piano visible at a lower pixel cost. The lamp fixture is hidden in portrait;
its lights still illuminate the piano. Controls collapse below 1181px and become
scrollable at short heights. Reduced motion snaps camera/assembly transitions
and lid movement while retaining musical key/action feedback.

The model is an educational representation: 36 representative string courses
serve 88 key actions; soft and sostenuto pedals animate but do not affect audio.
The score texture is illustrative sheet music. No guided tour, extra song,
presentation mode or graphics menu is included in this pass.

See [the Phase 9 audit](docs/PHASE9_AUDIT.md) for evidence, decisions and
regression coverage. Hardware MIDI, real mobile/touch behavior, listening tests
and prolonged multi-hour sessions still require human/device validation.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Contributors

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/phucnguyen020611">
        <img src="https://avatars.githubusercontent.com/u/305672451?v=4" width="88" height="88" alt="Techfis-PhucNguyen" /><br />
        <sub><b>Techfis-PhucNguyen</b></sub>
      </a><br />
      <sub>Creator & Maintainer</sub>
    </td>
  </tr>
</table>

See the repository's [contributors graph](https://github.com/phucnguyen020611/virtual-grand-piano/graphs/contributors) as the project grows.

## License

Project code is licensed under the [MIT License](LICENSE). The Salamander
recording derivatives remain CC BY 3.0; see [audio attribution](THIRD_PARTY_AUDIO.md).

## Trademark notice

This is an independent educational and experimental 3D project. Any referenced piano brand names or marks remain the property of their respective owners. This project is not endorsed by or affiliated with Steinway & Sons or any other piano manufacturer.
