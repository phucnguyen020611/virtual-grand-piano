# Phase 9 — comprehensive excellence pass

Starting `main`: **efaa36687e0eb0d47629fc2afb30141d84e019b3**, fetched from
`phucnguyen020611/virtual-grand-piano` before implementation. No newer commit
existed at that time; the working tree was clean. This report covers the source
changes and local validation. The delivery record supplies the final commit and
exact-SHA CI/Pages results after publication.

## Architecture reviewed

Computer keyboard / pointer / Web MIDI / autoplay / recording playback →
`performanceController` source tokens and sustain owners → key/action/damper
mechanics + string-course resonance + audio voices. Input adapters never own the
shared acoustic note lifetime. Transport stops remain scoped to their source.

Native HTML controls → small state variables in `main.js` → inspection mode,
exploded transforms/camera, lid, lighting, transport and status. The recorder
observes user-source controller events and replays through that same controller.
Audio maps MIDI to a nearest recorded root and velocity blend, then routes voices
through shared room/resonance buses, compression and a safety ceiling.

Reviewed all source modules, package manifest and lockfile, workflows, Vite base
configuration, HTML/CSS, README/contribution/security documentation, SVG and all
48 encoded audio assets and their attribution. No framework or runtime dependency
was added. The committed lockfile remains authoritative.

## Ranked audit and ten highest-value findings

| Rank    | Finding / why it matters                                                                                                       | Resolution and evidence                                                                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BLOCKER | Fixed normal camera framing cropped much of the piano at 390×844.                                                              | Aspect-aware camera zoom preserves the whole silhouette; exploded fitting uses effective FOV. User orbit is preserved on resize.                                                                |
| BLOCKER | A WebGL constructor error left an unusable Enter button.                                                                       | Bootstrap catches scene startup failures and presents a readable retry screen; forced WebGL failure tested.                                                                                     |
| HIGH    | Shared pointer pedal state could be overwritten by another pointer; blur had no pointer cleanup.                               | Pedals use per-pointer ownership; controls restore only after the last playing pointer; real raycaster tests cover key/pedal overlap, two pedal pointers, glissando, cancellation and blur.     |
| HIGH    | Safari cold A0 generation blocked a note call for 115 ms in one observation.                                                   | Entry prepares the first computer root and A0/C8 forte fallbacks, yielding between buffers. Subsequent first attacks observed at 1–2 ms in Safari; synthesis is moved to entry, not eliminated. |
| HIGH    | C3 maps to A2, which was missing from the advertised core warmup. Entire soft core was also pinned.                            | A2 joins warmup; only medium/forte core captures are pinned. Alternating warm A0/C8 no longer causes repeated recorded requests in the regression.                                              |
| HIGH    | Desktop control layout overlapped the title near 900px; expanding compact controls and short/zoomed views could hide controls. | Compact layout extends through 1180px; popup stacking and scrollable short-height controls keep buttons reachable at 15 tested dimensions.                                                      |
| HIGH    | Score planes intersected their tilted backing board; the lid prop did not follow its attachment points.                        | Pages are children of the desk in local coordinates; the prop is positioned and scaled between its base and rotating lid attachment. Screenshot comparison confirms full pages and seated prop. |
| HIGH    | Native disclosure Space and modified browser shortcuts could trigger performance input.                                        | Summary/form focus, Control/Command/Alt, IME and the entry gate are respected. Pointer interaction focuses the performance surface; native keyboard navigation remains available.               |
| HIGH    | Playback could start against a recording event array still being appended.                                                     | Both API and UI disallow playback during recording; repeated Start no longer erases a take; dispose clears transport timers.                                                                    |
| HIGH    | Hundreds of subpixel action shafts/capstans cast individual shadows; reduced motion affected only CSS.                         | Remove 251 tiny shadow casters, retain keys/hammer heads/body shadows; snap camera/assembly/lid under reduced motion.                                                                           |

Other findings: permanent failed-load suppression now has a 30-second cooldown
and requests time out after 15 seconds. MIDI channel matching now includes the
complete device prefix, avoiding accidental matches inside device IDs. Static
label priority sorting moved out of the frame loop. Help dismisses when focus
leaves it. Documentation no longer advertises a nonexistent check command or
lists already-implemented mechanics/resonance as future work.

## Product and presentation decisions

The existing restrained material palette, typography, lights, stage and grand
silhouette are appropriate. Retain their values and the default desktop camera
position. No rim, key, leg or string proportions were rewritten. The portrait
camera shows the entire instrument, so individual touch targets remain small;
users can zoom/orbit to play a register. The decorative overhead fixture is
hidden in portrait to keep attention on the piano; its illumination is unchanged.

First-use hints replace the existing inspector placeholder: “Try Z X C · Space
sustains,” with instructions for touch and returning focus after controls. The
entry button briefly says “Preparing piano…” during fallback preparation.
Advanced controls stay secondary. No permanent additional panel was introduced.

The score remains illustrative rather than an engraved playable transcription.
The model deliberately has 36 representative string courses for 88 actions.
Soft and sostenuto pedals remain visual-only. These limitations are documented
instead of expanding the musical engine during a quality pass.

Key travel, hammer/damper timing, high-treble undamped behavior, source ownership,
string routing, sympathetic visual excitation, 20-course overlay pool, lacquer,
wood/metal/felt values, light intensities, shadow resolution and audio dynamics
are unchanged. No perceptual audio improvement is claimed: actual listening was
not available to this agent. Runtime sample playback and output levels were
verified through Web Audio diagnostics.

## Audio, memory and performance evidence

| Measurement                       | Before                                                          | After / interpretation                                                                                |
| --------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Encoded audio                     | 3,734,953 bytes, 48 Ogg/Opus files                              | Unchanged; no additional downloads or licenses                                                        |
| Nearest-root range                | +3 / −2 semitones, three velocity captures                      | Unchanged; equal-power layer checks pass                                                              |
| Decoded cache ceiling             | 56 MiB; all six core roots pinned                               | 56 MiB; seven roots warmed, medium/forte pinned                                                       |
| Pinned core at 48 kHz             | About 45.69 MiB                                                 | About 36.90 MiB, despite including A2                                                                 |
| Initial warmup at 48 kHz          | About 45.69 MiB                                                 | About 54.54 MiB; soft entries are evictable                                                           |
| Device sample rate                | Default output rate; pinned bytes grew at high rates            | Requested 48 kHz, interactive latency hint; prevents a 96 kHz pinned floor exceeding the cache budget |
| First A0 note call                | Chromium observations about 21–34 ms; Safari observation 115 ms | After entry warmup, Chromium 0.7 ms; Safari 1–2 ms observed                                           |
| First C3 / C8 note calls          | Chromium about 19–26 / 6–11 ms observed                         | After entry warmup, Chromium 0.1 / 0.2 ms; Safari 1 / 0 ms at its timer resolution                    |
| Warm C4 note call                 | Not captured before                                             | About 0.2 ms observed                                                                                 |
| Shadow-casting objects            | 663                                                             | 412, 251 fewer (37.9%)                                                                                |
| Mesh / geometry / material counts | 668 / 102 / 42                                                  | Unchanged in comparable diagnostics                                                                   |
| Render calls                      | Baseline draw-call metric not captured                          | 1,077 at the tested normal desktop view; shadow caster reduction is measured, not an FPS claim        |
| DPR policy                        | Max 2 everywhere                                                | Max 1.5 for coarse pointers or width below 768px, otherwise 2                                         |
| Pixel work at capped DPR          | 4 physical pixels per CSS pixel                                 | 2.25 on affected devices: 43.75% fewer pixels, not a measured FPS increase                            |
| Dense performance                 | Existing 64 logical voice budget                                | 144 strikes under sustain retain that limit; physical sources return to zero after release            |
| Output peak                       | Not measured for an identical baseline run                      | One observed dense block peaked at 0.89; not an exhaustive loudness/clipping proof                    |

Timing observations are single-machine measurements, not end-to-end input to
speaker latency or controlled statistical benchmarks. Entry preparation moves
work earlier and adds a short loading state. Other cold roots/velocity layers
can still require synchronous generation. Soft core samples may reload after
wide-register use. Active audio sources retain evicted buffers until they end,
so the cache ceiling is not a ceiling on total browser audio memory.

Current Safari supports Ogg/Opus on the OS versions listed in
[WebKit's Safari 18.4 release notes](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/).
Native Safari 27 on macOS 27 decoded these assets in this run. No MP3/AAC fallback
library was added for the current-browser target. Older Safari/OS combinations
can use generated audio; they are not claimed to have recorded-sample parity.
Mono captures, three layers, filter curves, stereo room/resonance buses, pedal
noise, release shaping, voice stealing and velocity dynamics remain unchanged.

## Verification and reproducibility

`npm test` runs native Node assertions without a test dependency. CI now runs
those checks and formatting before the build. Browser checks live in
`tests/browser.html`; error-injection checks in `tests/failures.html`. Run these
through the Vite development server. These pages are not production entrypoints
and are excluded from `dist`.

| Regression                                           | Coverage                                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Single note, repeated note, 8+ note chord            | Controller assertions and real Web Audio stress                                                      |
| Sustain, Space + MIDI pedal ownership                | Controller, synthetic MIDI parser and browser events                                                 |
| Computer + pointer same note                         | Real scene raycasting with synthetic pointer events                                                  |
| Manual + autoplay / recording same note              | Browser transport overlap and scoped-stop checks                                                     |
| MIDI disconnect, velocity, CC64, CC120, CC123        | Synthetic adapter/controller tests; physical hardware unavailable                                    |
| Pointer glissando, multi-touch, pedal + key          | Synthetic events with real raycasting; capture APIs stubbed for synthetic IDs                        |
| Octave shift, blur cleanup                           | Adapter tests and browser events                                                                     |
| Record start/stop/play, repeated autoplay start/stop | Browser suite; mixed-session soak                                                                    |
| Normal/Exploded, lid, camera reset                   | Real Three.js scene checks and screenshots                                                           |
| Cold/warm audio, A0/C8 lazy loading                  | Real fetch/decode/cache and call-duration diagnostics                                                |
| Failed network / invalid decoder data                | Isolated injected-failure suite; generated fallback and delayed retry checked                        |
| WebGL / AudioContext failure                         | Forced constructor/context failure; usable fallback UI / safe note input                             |
| 390×844, 844×390, 768×1024, 1024×768                 | Responsive emulation, not real devices                                                               |
| 1280×720, 1366×768, 1440×900, 1920×1080              | Control reachability and occlusion checks                                                            |
| 881, 900, 960 and 1024px intermediate widths         | Control reachability and occlusion checks                                                            |
| 720×450, 360×225, 320×180                            | Reflow-equivalent 200%/400% and short viewport checks; native browser zoom NOT AVAILABLE in this run |
| Chromium-based in-app browser                        | Full regression and failure-injection suites passed                                                  |
| Safari 27 / macOS 27                                 | Full browser regression passed with native Ogg decoding                                              |
| Firefox                                              | NOT AVAILABLE in the installed browsers                                                              |
| Real mobile, physical Web MIDI, multi-touch hardware | NOT AVAILABLE                                                                                        |
| Listening, screen-reader speech, multi-hour sessions | NOT AVAILABLE / not claimed                                                                          |

Screenshot inspection covers desktop, portrait, compact controls and exploded
presentation. Test-only injected failures intentionally produce development
console messages; those are distinct from a production smoke-test console.

## Work intentionally deferred

Keep the controller and procedural architecture; neither needs a framework or
large refactor. A geometry instancing rewrite would complicate per-key mechanics
and inspection without a demonstrated need after selective shadow reduction.
Full label bounds caching and adaptive FPS policies would add invalidation logic;
only static sorting and the simple DPR cap are justified here. Autoplay uses
fixed-origin timeouts; no evidence justified an AudioWorklet or scheduler rewrite.

Physical string count/action mapping, more velocity layers, closer roots, stereo
recordings, bass winding meshes and advanced pedals require separate listening
or mechanical validation. Growing the library or exaggerating resonance would
increase cost without established perceptual benefit. CC120 stops held channel
tokens; already-released notes sustained by shared pedal ownership retain the
controller's existing behavior. Recordings are in-memory and currently unbounded;
no DAW-style event editing, persistent storage or arbitrary capture cutoff was
added. Context-loss recovery after successful startup still relies on browser
restoration or reload; the new retry UI covers startup failure.

## Optional features considered

Scores are judgment estimates on a 1–5 scale; higher value/wow is better, higher
risk/cost is worse.

| Candidate                            | User value | Wow | Risk | Performance cost | UI complexity | Maintenance | Decision                                                   |
| ------------------------------------ | ---------- | --- | ---- | ---------------- | ------------- | ----------- | ---------------------------------------------------------- |
| Guided anatomy tour                  | 3          | 4   | 3    | 2                | 3             | 3           | Defer; camera/label guidance needs a separate product pass |
| Presentation / hide-UI mode          | 3          | 3   | 2    | 1                | 2             | 2           | Defer; fix the existing hierarchy first                    |
| Shareable view                       | 2          | 2   | 2    | 1                | 1             | 2           | Defer; no demonstrated sharing need                        |
| Live note display                    | 3          | 2   | 2    | 1                | 2             | 2           | Defer; would add persistent UI                             |
| First-use hint in existing inspector | 4          | 1   | 1    | 1                | 1             | 1           | Adopt as copy correction; no new feature surface           |

No optional side feature was shipped. Improvements address observed quality
problems. Verdict: **CLEAR IMPROVEMENT**, with explicit startup, cache and device
coverage tradeoffs above.

Native browser 200%/400% zoom was not reliably controllable with the available
automation. Equivalent viewport reflow was tested; those results do not establish
full native zoom or OS accessibility preference coverage. Reduced-motion assembly
and camera snapping passed an injected-method check; the CSS preference rule was
inspected. The initial lid angle now matches its open control state so exploded
bounds include the raised lid.

## Final local build

Clean `npm ci --no-audit --no-fund` installed 18 packages; the lockfile was
unchanged. Automatic command review rejected an explicit `rm -rf node_modules`;
`npm ci` itself removed and recreated the tree, as described in the
[npm documentation](https://docs.npmjs.com/cli/commands/npm-ci/). Formatting, all
10 Node regression checks, production build and preview passed.

JavaScript increased from about 906.08 kB / 279.99 kB gzip to 909.72 kB /
281.47 kB gzip across the bootstrap and scene chunks. CSS increased from
9.48 kB / 2.98 kB gzip to 10.16 kB / 3.13 kB gzip. The small dynamic bootstrap
adds a module request to provide a recoverable scene-load boundary. The existing
large Three.js chunk warning remains; no duplicate Three.js library or new
dependency was introduced. Audio assets remain byte-for-byte unchanged.
