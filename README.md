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
- Simplified synthesized piano audio
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

| Action                  | Control                             |
| ----------------------- | ----------------------------------- |
| Orbit camera            | Left-drag / one-finger drag         |
| Zoom                    | Mouse wheel / pinch                 |
| Pan                     | Right-drag / two-finger drag        |
| Play visible key        | Click / tap a piano key             |
| Play mapped notes       | `A W S E D F T G Y H U J K O L P ;` |
| Inspect component       | Click a piano component             |
| Separate systems        | **Exploded Parts**                  |
| Restore assembled piano | **Normal Inspect**                  |
| Toggle lid              | **Open Lid / Close Lid**            |
| Autoplay                | **Für Elise**                       |
| Restore camera          | **Reset View**                      |

## Tech stack

| Layer              | Technology     | Purpose                                                                 |
| ------------------ | -------------- | ----------------------------------------------------------------------- |
| 3D / WebGL         | Three.js       | Scene graph, geometry, materials, lighting, raycasting, camera controls |
| Build tooling      | Vite           | Fast local development and optimized production builds                  |
| Audio              | Web Audio API  | Lightweight synthesized note playback and autoplay                      |
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
│   │   └── pianoAudio.js       # Web Audio synthesizer engine
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
npm install
```

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

| Command           | Description                                |
| ----------------- | ------------------------------------------ |
| `npm run dev`     | Start the Vite development server          |
| `npm run build`   | Build optimized static assets into `dist/` |
| `npm run preview` | Serve the production build locally         |
| `npm run check`   | Run the current project validation command |

## Architecture

The implementation is split into focused modules so each system can evolve independently:

1. **Scene and renderer** (`main.js`, `scene/`) establish the WebGL environment, camera, stage, lighting, fog, tone mapping, and shadows.
2. **Procedural piano** (`piano/`) builds the instrument from a shared dimension table. The case is a **hollow curved rim** (an extruded outer contour with an inner cavity hole) rather than a solid plate; the soundboard, cast plate, strings, and action stack in a physically believable vertical order below the rim top so the internal anatomy stays visible. Each major part is a separate, individually selectable Three.js group.
3. **Interaction** (`interaction/inspection.js`) uses raycasting for mouse/touch selection, drives the exploded-view labels, and manages `OrbitControls` for free inspection.
4. **Audio** (`audio/pianoAudio.js`) uses the Web Audio API and MIDI note numbers to synthesize lightweight playable tones without external audio files.
5. **Animation** (`main.js` render loop) interpolates key travel, lid movement, component separation, labels, and autoplay state.

The geometry is intentionally procedural; higher-fidelity glTF meshes and PBR textures can replace individual modules without changing the overall product concept.

## Operations

### Continuous integration

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests. The workflow installs the pinned project dependencies and verifies that the production build succeeds.

### GitHub Pages deployment

`.github/workflows/deploy-pages.yml` builds and deploys `dist/` whenever `main` changes. The Vite base path is configured for this repository name.

For the first deployment, repository administrators should confirm **Settings → Pages → Build and deployment → Source → GitHub Actions**.

Expected Pages URL:

```text
https://phucnguyen020611.github.io/virtual-grand-piano/
```

### Dependency maintenance

Dependabot checks npm packages and GitHub Actions weekly. Update pull requests should be reviewed and validated by CI before merging.

### Performance guidance

When adding production assets:

- Prefer glTF/GLB for complex meshes.
- Compress geometry where practical.
- Use GPU-friendly PBR texture sizes and modern compressed texture formats when supported.
- Lazy-load large audio and model resources.
- Keep render-loop allocations minimal.
- Measure frame time on integrated GPUs and mobile devices before increasing polygon or shadow-map budgets.

## Roadmap

- [ ] High-fidelity grand piano GLB model
- [ ] PBR lacquer, wood, felt, steel, brass, and cast-plate textures
- [ ] Real multi-sampled piano recordings across all 88 keys
- [ ] Sustain, sostenuto, and soft pedal behavior
- [ ] Animated dampers, hammers, repetition levers, and key action
- [ ] Visible string vibration and resonance feedback
- [ ] More accurate duplex scaling, agraffes, tuning pins, and bridge geometry
- [ ] Multiple classical autoplay pieces
- [ ] MIDI input support
- [ ] Optional guided anatomy tour
- [ ] Performance quality presets for desktop and mobile GPUs

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

This project is licensed under the [MIT License](LICENSE).

## Trademark notice

This is an independent educational and experimental 3D project. Any referenced piano brand names or marks remain the property of their respective owners. This project is not endorsed by or affiliated with Steinway & Sons or any other piano manufacturer.
