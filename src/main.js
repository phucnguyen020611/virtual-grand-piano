import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { createMaterials, makeCanvasTexture } from "./piano/materials.js";
import { DIM, STAGE_YAW, onStage } from "./piano/geometry.js";
import { createPiano } from "./piano/createPiano.js";
import { createBench } from "./scene/bench.js";
import { createHall } from "./scene/hall.js";
import { createReflectionEnvironment } from "./scene/environment.js";
import { createAudioEngine } from "./audio/pianoAudio.js";
import { createMechanics } from "./piano/mechanics.js";
import { createPerformanceController } from "./performance/performanceController.js";
import { createComputerKeyboard } from "./performance/computerKeyboard.js";
import { createMidiInput } from "./performance/midiInput.js";
import { createPerformanceRecorder } from "./performance/performanceRecorder.js";
import { SONGS, scoreEvents, scorePedal } from "./performance/songs.js";
import { parseMidiFile } from "./performance/midiFile.js";
import { createNoteEffects } from "./scene/noteEffects.js";
import { enhanceSelect } from "./interaction/dropdown.js";
import { createInspection } from "./interaction/inspection.js";
import { createCinematic } from "./interaction/cinematic.js";
import {
  createExplodedView,
  NORMAL_DEFAULT_CAMERA_POSITION,
  NORMAL_DEFAULT_TARGET,
} from "./interaction/explodedView.js";

// --- Renderer / scene / camera ---------------------------------------------
const scene = new THREE.Scene();
// Warm, low glow behind the instrument so the black case reads against the room.
scene.background = makeCanvasTexture(
  (g, w, h) => {
    const glow = g.createRadialGradient(
      w / 2,
      h * 0.46,
      0,
      w / 2,
      h * 0.46,
      w * 0.62,
    );
    glow.addColorStop(0, "#3a2d22");
    glow.addColorStop(0.45, "#1d1712");
    glow.addColorStop(1, "#0b0a0a");
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
  },
  512,
  512,
);
scene.fog = new THREE.FogExp2(0x0a0807, 0.009);

const camera = new THREE.PerspectiveCamera(
  38,
  innerWidth / innerHeight,
  0.1,
  320,
);
camera.position.copy(NORMAL_DEFAULT_CAMERA_POSITION);
// Include the forward bench in portrait without resetting a user’s orbit.
camera.zoom = Math.min(1, camera.aspect / 1.6);
camera.updateProjectionMatrix();
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
// Graphics quality: render resolution, shadows, and the hall's costliest
// lights and glows. High is the original look and the default.
const handheld = () =>
  matchMedia("(pointer: coarse)").matches || innerWidth < 768;
const QUALITY = {
  low: {
    pixelRatio: () => 0.75,
    shadow: 0,
    areaLights: false,
    glassGlow: false,
    sunbeams: false,
    crowd: false,
  },
  medium: {
    pixelRatio: () => 1,
    shadow: 1024,
    areaLights: true,
    glassGlow: true,
    sunbeams: false,
    crowd: false, // ~0.8 M triangles: High and up, or by the Audience button
  },
  high: {
    pixelRatio: () => (handheld() ? 1.5 : 2),
    shadow: 2048,
    areaLights: true,
    glassGlow: true,
    sunbeams: true,
    crowd: true,
  },
  ultra: {
    pixelRatio: () => 3,
    shadow: 4096,
    areaLights: true,
    glassGlow: true,
    sunbeams: true,
    crowd: true,
  },
};
let quality = "high";
try {
  if (localStorage.getItem("vgp.quality") in QUALITY)
    quality = localStorage.getItem("vgp.quality");
} catch {
  // Storage blocked: keep the default.
}
const renderPixelRatio = () =>
  Math.min(devicePixelRatio, QUALITY[quality].pixelRatio());

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(renderPixelRatio());
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute("aria-label", "Piano performance surface");
renderer.domElement.setAttribute("aria-describedby", "playHelp");
renderer.domElement.addEventListener(
  "pointerdown",
  () => renderer.domElement.focus({ preventScroll: true }),
  { capture: true },
);
document.querySelector("#scene").appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = !reducedMotion.matches;
reducedMotion.addEventListener("change", () => {
  controls.enableDamping = !reducedMotion.matches;
});
// Free viewing: soft inertia, zoom toward the cursor, screen-space panning,
// and enough reach to take in the whole hall from the back.
controls.dampingFactor = 0.075;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 1.15;
controls.panSpeed = 0.9;
controls.zoomToCursor = true;
controls.screenSpacePanning = true;
controls.target.copy(NORMAL_DEFAULT_TARGET);
controls.minDistance = 1.2;
controls.maxDistance = 140;
controls.maxPolarAngle = Math.PI * 0.495;

// --- World -----------------------------------------------------------------
const environment = createReflectionEnvironment(renderer);
scene.environment = environment.texture;
const mats = createMaterials(renderer.capabilities.getMaxAnisotropy());
const hall = createHall(scene, mats);
const { stageTopY } = hall;
const bench = createBench(mats, stageTopY);
const piano = createPiano(mats, stageTopY);
// Side-on to the audience, as at a recital (see STAGE_YAW).
const stageSet = new THREE.Group();
stageSet.name = "stage-set";
stageSet.rotation.y = STAGE_YAW;
stageSet.add(piano.group, bench);
scene.add(stageSet);
scene.updateMatrixWorld(true);
const { midiToKey, lidPivot } = piano;

// Dev-only inspection hook for geometry validation (stripped from production).
if (import.meta.env.DEV) {
  window.__vgp = {
    THREE,
    renderer,
    camera,
    controls,
    scene,
    piano,
    stageTopY,
    bench,
    stageSet,
    hall,
    mats,
    environment,
  };
}

// --- Audio and mechanical performance --------------------------------------
const audio = createAudioEngine();
const mechanics = createMechanics(piano);
const pianoPerformance = createPerformanceController(
  audio,
  mechanics,
  piano.resonance,
);
const recorder = createPerformanceRecorder(pianoPerformance);
if (import.meta.env.DEV)
  Object.assign(window.__vgp, {
    mechanics,
    performance: pianoPerformance,
    resonance: piano.resonance,
    audio,
  });

// --- Inspection / interaction ----------------------------------------------
const dom = {
  partName: document.querySelector("#partName"),
  partText: document.querySelector("#partText"),
  partMeta: document.querySelector("#partMeta"),
  labelRoot: document.querySelector("#labels"),
};
const inspection = createInspection(
  renderer,
  camera,
  piano,
  dom,
  (midi, pointerId, velocity) =>
    pianoPerformance.noteOn(midi, velocity, `pointer:${pointerId}`, "pointer"),
  (pointerId) => {
    const token = `pointer:${pointerId}`;
    for (const [midi, owners] of pianoPerformance.activeSourceTokensByMidi) {
      if (owners.has(token)) pianoPerformance.noteOff(midi, token);
    }
  },
  (type, down) => {
    if (type === "sustain")
      pianoPerformance.setSustainForSource("pointer:pedal", down, "pointer");
    else pianoPerformance.setPedal(type, down);
  },
  controls,
);
inspection.addPickable(bench);
const explodedView = createExplodedView({ piano, camera, controls });
if (import.meta.env.DEV) window.__vgp.explodedView = explodedView;

// --- Autoplay and practice, from an engraved score or a MIDI file -----------
// A playhead runs with the render loop, so the tempo can change and practice
// can stop it: it holds at each chord of the hands being practised until the
// player strikes every note of it, the light columns resting on those keys.
const LEAD_IN = 3; // the chime rings and the first light columns fall
const noteEffects = createNoteEffects(scene, piano, renderer, camera);
let song = SONGS[0];
let songEvents = scoreEvents(song);
let songPedal = scorePedal(song);
const lengthOf = (events) =>
  events.reduce((end, e) => Math.max(end, e.time + e.duration), 0);
let songLength = lengthOf(songEvents);
let midiPiece = null; // the last file opened, offered with the pieces
let autoplay = false;
let playhead = 0; // seconds into the piece; negative during the lead-in
let cursor = 0;
let pedalCursor = 0;
let waiting = null; // practice: the notes still to be struck
let tempo = 1;
let practice = "listen";
const autoBtn = document.querySelector("#autoBtn"),
  songSelect = document.querySelector("#songSelect"),
  progressEl = document.querySelector("#songProgress"),
  practiceSelect = document.querySelector("#practiceSelect"),
  tempoSelect = document.querySelector("#tempoSelect"),
  midiFileInput = document.querySelector("#midiFileInput");
// Every HUD dropdown gets the styled listbox; the native select stays behind it.
document.querySelectorAll("#pianoControls select").forEach(enhanceSelect);
for (const piece of SONGS)
  songSelect.add(
    new Option(
      `${piece.title} — ${piece.composer.split(" ").at(-1)}`,
      piece.id,
    ),
  );

function setPiece(piece) {
  if (autoplay) stopAutoplay();
  song = piece;
  songEvents = piece.midi?.events ?? scoreEvents(piece);
  songPedal = piece.midi?.pedal ?? scorePedal(piece);
  songLength = lengthOf(songEvents);
  // Only the engraved pieces are printed; a file opens the book at its
  // blank manuscript.
  if (piece.midi) piano.scoreBook.turnTo(2);
  else {
    piano.scoreBook.setSong(piece);
    piano.scoreBook.turnTo(1);
  }
}
songSelect.addEventListener("change", () =>
  setPiece(
    songSelect.value === "midi"
      ? midiPiece
      : SONGS.find((piece) => piece.id === songSelect.value),
  ),
);
practiceSelect.addEventListener("change", () => {
  practice = practiceSelect.value;
  waiting = null;
});
tempoSelect.addEventListener("change", () => (tempo = +tempoSelect.value));

async function openMidi(file) {
  try {
    const { name, events, pedal } = parseMidiFile(await file.arrayBuffer());
    const title = name || file.name.replace(/\.midi?$/i, "");
    midiPiece = {
      id: `midi:${title}`,
      title,
      composer: "Your MIDI file",
      midi: { events, pedal },
    };
    let option = songSelect.querySelector('option[value="midi"]');
    if (!option) songSelect.add((option = new Option("", "midi")));
    option.textContent = `${title} — MIDI`;
    songSelect.value = "midi";
    setPiece(midiPiece);
    setStatus(`Opened ${title}: ${events.length} notes`);
  } catch (error) {
    setStatus(`Can't read ${file.name}: ${error.message}`);
  }
}
document.querySelector("#midiFileBtn").onclick = () => midiFileInput.click();
midiFileInput.onchange = () => {
  if (midiFileInput.files[0]) openMidi(midiFileInput.files[0]);
  midiFileInput.value = "";
};
// …or drop one anywhere on the page.
addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  setStatus("Drop a MIDI file to play it");
});
addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files[0];
  if (!file) return;
  event.preventDefault();
  openMidi(file);
});

function stopAutoplay(finished = false) {
  if (!finished) cinematic.stop();
  autoplay = false;
  waiting = null;
  autoBtn.textContent = "Play";
  autoBtn.setAttribute("aria-pressed", "false");
  pianoPerformance.stopSource("autoplay");
  noteEffects.stop();
  hall.showComposer(null);
  hall.setConcert(false);
  progressEl.style.width = "0%";
}
/** The piece played through: the house applauds as the lights come up. */
function finishPiece() {
  stopAutoplay(true);
  cinematic.finale(cinemaShots().applause);
  audio.playEffect("audio/hall/applause.ogg", { gain: 0.55 });
  if (!reducedMotion.matches) hall.audience.applaud(10);
}
function startAutoplay() {
  if (autoplay) {
    stopAutoplay();
    return;
  }
  prepareAudio();
  autoplay = true;
  playhead = -LEAD_IN;
  cursor = pedalCursor = 0;
  waiting = null;
  autoBtn.textContent = "Stop";
  autoBtn.setAttribute("aria-pressed", "true");
  if (!song.midi) piano.scoreBook.turnTo(1); // open at the music
  noteEffects.start(songEvents);
  setCredits(false);
  hall.showComposer(song);
  // The hall's chime, two strokes a third apart, as the house lights go down.
  audio.playEffect("audio/hall/chime.ogg", { gain: 0.45 });
  audio.playEffect("audio/hall/chime.ogg", {
    delay: 0.7,
    rate: 0.84,
    gain: 0.4,
  });
  hall.setConcert(true);
}
// The evening's programme: every piece, a line about it, and a button that
// plays it. Opened from the HUD or by clicking any seat in the hall.
const programme = document.querySelector("#programme");
document.querySelector("#programmeDate").textContent =
  new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
document.querySelector("#programmeList").replaceChildren(
  ...SONGS.map((piece) => {
    const item = document.createElement("li");
    const about = piece.notes.join(" ").split(/(?<=\.)\s/)[0];
    item.innerHTML = `<h3></h3><p class="composer"></p><p class="about"></p>`;
    item.querySelector("h3").textContent = piece.title;
    item.querySelector(".composer").textContent = piece.dates.startsWith("(")
      ? `${piece.composer} ${piece.dates}`
      : `${piece.composer} · ${piece.dates}`;
    item.querySelector(".about").textContent = about;
    const play = document.createElement("button");
    play.value = piece.id;
    play.textContent = "Play";
    play.setAttribute("aria-label", `Play ${piece.title}`);
    item.append(play);
    return item;
  }),
);
const openProgramme = () => programme.open || programme.showModal();
document.querySelector("#programmeBtn").onclick = openProgramme;
programme.addEventListener("close", () => {
  const piece = SONGS.find((p) => p.id === programme.returnValue);
  programme.returnValue = "";
  if (!piece) return;
  songSelect.value = piece.id;
  setPiece(piece);
  startAutoplay();
});
// A click (not a drag) on a seat.
const seatRay = new THREE.Raycaster();
let seatDown = null;
renderer.domElement.addEventListener("pointerdown", (event) => {
  seatDown = [event.clientX, event.clientY];
});
renderer.domElement.addEventListener("click", (event) => {
  if (!seatDown) return;
  const moved = Math.hypot(
    event.clientX - seatDown[0],
    event.clientY - seatDown[1],
  );
  if (moved > 8) return;
  const rect = renderer.domElement.getBoundingClientRect();
  seatRay.setFromCamera(
    new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    ),
    camera,
  );
  const hit = seatRay.intersectObjects([hall.group], true)[0];
  if (hit?.object === hall.seats) openProgramme();
});

// The player's own notes, from any input, answer the chord practice waits on.
pianoPerformance.addObserver((event) => {
  if (waiting && event.type === "noteOn" && event.sourceGroup !== "autoplay")
    waiting.delete(event.midi);
});
const practised = (event) => practice === "both" || practice === event.hand;
function advanceAutoplay(dt) {
  if (!autoplay || waiting?.size) return;
  waiting = null;
  playhead += dt * tempo;
  while (cursor < songEvents.length && songEvents[cursor].time <= playhead) {
    // Notes struck together are one chord.
    const at = songEvents[cursor].time;
    let end = cursor;
    while (end < songEvents.length && songEvents[end].time - at < 0.03) end++;
    const chord = songEvents.slice(cursor, end);
    const mine = practice === "listen" ? [] : chord.filter(practised);
    for (const event of chord)
      if (!mine.includes(event))
        pianoPerformance.playMidi(
          event.midi,
          (event.duration * 0.95) / tempo,
          event.velocity,
          "autoplay",
        );
    cursor = end;
    if (mine.length) {
      waiting = new Set(mine.map((event) => event.midi));
      playhead = at;
      break;
    }
  }
  // Legato pedalling from the score (or the file): the dampers, the
  // sympathetic ring and the pedal's own thump all follow.
  while (
    pedalCursor < songPedal.length &&
    songPedal[pedalCursor].time <= playhead
  )
    pianoPerformance.setSustainForSource(
      "autoplay:pedal",
      songPedal[pedalCursor++].down,
      "autoplay",
    );
  if (playhead > songLength + 1.2) finishPiece();
}

// --- UI wiring --------------------------------------------------------------
const normalBtn = document.querySelector("#normalBtn");
const explodeBtn = document.querySelector("#explodeBtn");
const lidBtn = document.querySelector("#lidBtn");
const octaveLabel = document.querySelector("#octaveLabel");
const octaveDownBtn = document.querySelector("#octaveDownBtn");
const octaveUpBtn = document.querySelector("#octaveUpBtn");
const midiBtn = document.querySelector("#midiBtn");
const midiSelect = document.querySelector("#midiSelect");
const recordBtn = document.querySelector("#recordBtn");
const playRecordingBtn = document.querySelector("#playRecordingBtn");
const statusText = document.querySelector("#statusText");
const audioGate = document.querySelector("#audioGate");
const helpBtn = document.querySelector("#helpBtn");
const helpPanel = document.querySelector("#helpPanel");
const helpCloseBtn = document.querySelector("#helpCloseBtn");
const secondaryControls = document.querySelector("#secondaryControls");
const secondarySummary = secondaryControls.querySelector("summary");
const gatedInterface = document.querySelectorAll(
  "#app, .topbar, #pianoControls, #inspector",
);
let lidOpen = true;
let fallboardOpen = true;
let fallboardClosure = 0; // 0 open … 1 covering the keys
let audioStatus = "Ready";
let midiStatus = "";
let recordingStartedAt = 0;
let recordingTimer = null;

function setStatus(message) {
  if (statusText.textContent !== message) statusText.textContent = message;
}

function updateStatus() {
  const { recording, playback } = recorder.state();
  if (recording) setStatus("Recording");
  else if (playback) setStatus("Playing recording");
  else if (audioStatus === "Loading piano…") setStatus(audioStatus);
  else setStatus(midiStatus || audioStatus);
}

function prepareAudio() {
  try {
    audio.ensureAudio();
    if (audio.ready) {
      audioStatus = "Piano ready";
      updateStatus();
    } else if (audioStatus !== "Loading piano…") {
      audioStatus = "Loading piano…";
      updateStatus();
      audio.whenReady().then(() => {
        audioStatus = audio.ready
          ? "Piano ready"
          : "Piano ready · fallback audio";
        updateStatus();
      });
    }
  } catch {
    audioStatus = "Audio could not start";
    updateStatus();
  }
}

function midiToNoteName(midi) {
  const names = [
    "C",
    "C♯",
    "D",
    "D♯",
    "E",
    "F",
    "F♯",
    "G",
    "G♯",
    "A",
    "A♯",
    "B",
  ];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function formatRecordingTime(elapsedMs) {
  const seconds = Math.floor(elapsedMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function updateRecordingTimer(recording) {
  if (recording && !recordingTimer) {
    recordingTimer = setInterval(updateRecordingUi, 250);
  } else if (!recording && recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
}

const compactControls = matchMedia("(max-width: 1180px)");
function syncSecondaryControls() {
  secondaryControls.open = !compactControls.matches;
  secondarySummary.setAttribute(
    "aria-hidden",
    String(!compactControls.matches),
  );
}
compactControls.addEventListener("change", syncSecondaryControls);
syncSecondaryControls();

const computerKeyboard = createComputerKeyboard({
  controller: pianoPerformance,
  isEnabled: () => audioGate.classList.contains("hidden"),
  arrowsShiftOctave: () => !freeCam.on,
  onRangeChange: ({ minMidi, maxMidi, canShiftDown, canShiftUp }) => {
    octaveLabel.textContent = `${midiToNoteName(minMidi)}–${midiToNoteName(maxMidi)}`;
    octaveDownBtn.disabled = !canShiftDown;
    octaveUpBtn.disabled = !canShiftUp;
  },
});
const midiInput = createMidiInput({
  controller: pianoPerformance,
  onStatus: ({ status, supported, selectedId, selectedName, inputs }) => {
    midiSelect.replaceChildren();
    if (inputs.length > 1 && !selectedId) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select MIDI input…";
      placeholder.disabled = true;
      placeholder.selected = true;
      midiSelect.appendChild(placeholder);
    }
    for (const input of inputs) {
      const option = document.createElement("option");
      option.value = input.id;
      option.textContent = input.name;
      option.title = input.name;
      option.selected = input.id === selectedId;
      midiSelect.appendChild(option);
    }
    midiSelect.hidden = inputs.length < 2;
    midiBtn.textContent =
      status === "connected"
        ? `MIDI: ${selectedName}`
        : status === "no-devices"
          ? "No MIDI devices"
          : status === "select-device"
            ? "Select MIDI device"
            : status === "denied"
              ? "MIDI permission denied"
              : supported
                ? "Connect MIDI"
                : "MIDI unavailable";
    midiBtn.disabled = !supported;
    midiBtn.title = selectedName || "";
    midiStatus =
      status === "connected"
        ? `MIDI: ${selectedName}`
        : status === "denied"
          ? "MIDI permission denied"
          : status === "unavailable"
            ? "MIDI unavailable"
            : "";
    updateStatus();
  },
});

function updateRecordingUi() {
  const { recording, playback, eventCount } = recorder.state();
  const elapsed = recording ? performance.now() - recordingStartedAt : 0;
  recordBtn.textContent = recording
    ? `Recording ${formatRecordingTime(elapsed)}`
    : "Record";
  recordBtn.setAttribute(
    "aria-label",
    recording
      ? `Stop recording, ${formatRecordingTime(elapsed)}`
      : "Start recording",
  );
  recordBtn.setAttribute("aria-pressed", String(recording));
  playRecordingBtn.disabled = recording || (!eventCount && !playback);
  playRecordingBtn.textContent = playback ? "Stop playback" : "Play recording";
  playRecordingBtn.setAttribute("aria-pressed", String(playback));
  updateRecordingTimer(recording);
  updateStatus();
}
recorder.subscribe(updateRecordingUi);

// Every take is also captured as sound, as it is heard, so it can be saved:
// a few seconds' ring-out after the last note, then the file is ready.
const saveAudioBtn = document.querySelector("#saveAudioBtn");
const AUDIO_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];
let takeRecorder = null;
let lastTake = null;
let wasRecording = false;
saveAudioBtn.hidden = !globalThis.MediaRecorder;
recorder.subscribe(() => {
  const { recording } = recorder.state();
  if (recording === wasRecording || saveAudioBtn.hidden) return;
  wasRecording = recording;
  if (recording) {
    const mimeType = AUDIO_TYPES.find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    const take = new MediaRecorder(
      audio.captureStream(),
      mimeType ? { mimeType } : {},
    );
    const chunks = [];
    take.ondataavailable = (event) =>
      event.data.size && chunks.push(event.data);
    take.onstop = () => {
      lastTake = new Blob(chunks, { type: take.mimeType });
      saveAudioBtn.disabled = false;
    };
    take.start();
    takeRecorder = take;
    saveAudioBtn.disabled = true;
  } else {
    const take = takeRecorder;
    takeRecorder = null;
    setTimeout(() => take?.state === "recording" && take.stop(), 2000);
  }
});
saveAudioBtn.onclick = () => {
  if (!lastTake) return;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(lastTake);
  const local = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  const stamp = local.toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const ext = lastTake.type.includes("mp4") ? "m4a" : "webm";
  link.download = `virtual-grand-piano-${stamp}.${ext}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
};

function setExplodedMode(exploded) {
  inspection.setMode(exploded, { normalBtn, explodeBtn });
  explodedView.setExploded(exploded);
  hall.setExploded(exploded);
  normalBtn.setAttribute("aria-pressed", String(!exploded));
  explodeBtn.setAttribute("aria-pressed", String(exploded));
}
normalBtn.onclick = () => setExplodedMode(false);
explodeBtn.onclick = () => setExplodedMode(true);
autoBtn.onclick = startAutoplay;
octaveDownBtn.onclick = () => computerKeyboard.shiftOctave(-1);
octaveUpBtn.onclick = () => computerKeyboard.shiftOctave(1);
midiBtn.onclick = () => midiInput.connect();
midiSelect.onchange = () => {
  if (midiSelect.value) midiInput.select(midiSelect.value);
};
recordBtn.onclick = () => {
  if (recorder.state().recording) recorder.stop();
  else {
    recordingStartedAt = performance.now();
    recorder.start();
  }
  updateRecordingUi();
};
playRecordingBtn.onclick = () => {
  if (recorder.state().playback) recorder.stopPlayback();
  else recorder.play();
  updateRecordingUi();
};
// --- Camera flights: presets, double-click focus, part labels ----------------
const flight = {
  fromPosition: new THREE.Vector3(),
  fromTarget: new THREE.Vector3(),
  toPosition: new THREE.Vector3(),
  toTarget: new THREE.Vector3(),
  t: 1,
  seconds: 1.2,
};
function flyTo(position, target, seconds = 1.2) {
  explodedView.cancelCameraAssist();
  flight.fromPosition.copy(camera.position);
  flight.fromTarget.copy(controls.target);
  flight.toPosition.copy(position);
  flight.toTarget.copy(target);
  flight.seconds = seconds;
  flight.t = reducedMotion.matches ? 1 : 0;
  if (flight.t === 1) {
    camera.position.copy(position);
    controls.target.copy(target);
  }
}
function updateFlight(dt) {
  if (flight.t >= 1) return;
  flight.t = Math.min(1, flight.t + dt / flight.seconds);
  const e =
    flight.t < 0.5 ? 4 * flight.t ** 3 : 1 - (-2 * flight.t + 2) ** 3 / 2;
  camera.position.lerpVectors(flight.fromPosition, flight.toPosition, e);
  controls.target.lerpVectors(flight.fromTarget, flight.toTarget, e);
}
// Any drag, wheel or pinch hands the camera straight back to the viewer.
controls.addEventListener("start", () => (flight.t = 1));

/** Frame an object's bounds from the current viewing direction. */
function flyToObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(0.4, box.getSize(new THREE.Vector3()).length() / 2);
  const fov = THREE.MathUtils.degToRad(camera.getEffectiveFOV());
  const distance = (radius / Math.sin(fov / 2)) * 1.1;
  const direction = camera.position.clone().sub(controls.target).normalize();
  flyTo(center.clone().addScaledVector(direction, distance), center);
}
inspection.onLabelPick = (component) => flyToObject(component.object);

const viewSelect = document.querySelector("#viewSelect");
const views = {
  pianist: {
    position: NORMAL_DEFAULT_CAMERA_POSITION,
    target: NORMAL_DEFAULT_TARGET,
  },
  keys: {
    position: onStage(0.6, 3.4, 5.4),
    target: onStage(0.2, 1.5, 2.5),
  },
  ...hall.views,
};
viewSelect.addEventListener("change", () => {
  const view = views[viewSelect.value];
  flyTo(view.position, view.target);
});

// Double-click a spot to orbit around it, drawing closer if far away.
const focusRay = new THREE.Raycaster();
renderer.domElement.addEventListener("dblclick", (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  focusRay.setFromCamera(
    new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    ),
    camera,
  );
  const hit = focusRay.intersectObjects([stageSet, hall.group], true)[0];
  if (!hit) return;
  const offset = camera.position.clone().sub(controls.target);
  offset.setLength(Math.min(offset.length(), 14));
  flyTo(hit.point.clone().add(offset), hit.point, 0.8);
});

// Free cam: the arrow keys walk and turn the viewer through the hall; Shift
// (or PageUp / PageDown) flies. Dragging still looks around a point just ahead.
const freeCamBtn = document.querySelector("#freeCamBtn");
const freeCam = {
  on: false,
  held: new Set(),
  released: new Set(), // let up only after a frame, so quick taps still move
  shift: false,
  velocity: new THREE.Vector3(),
  turn: 0,
};
const FREE_CAM_KEYS = /^(Arrow|Page(Up|Down))/;
const WALK_SPEED = 24; // units per second: the stalls' length in ~3 s
const TURN_SPEED = 2.2; // radians per second
freeCamBtn.onclick = () => {
  freeCam.on = !freeCam.on;
  freeCamBtn.setAttribute("aria-pressed", String(freeCam.on));
  if (!freeCam.on) return;
  flight.t = 1;
  explodedView.cancelCameraAssist();
  // Pull the orbit point close so a drag turns the head, not the world.
  const ahead = controls.target.clone().sub(camera.position).setLength(1.5);
  controls.target.copy(camera.position).add(ahead);
  dom.partMeta.textContent = "Camera";
  dom.partName.textContent = "Free cam";
  dom.partText.textContent =
    "↑ ↓ walk, ← → turn. Hold Shift with ↑ ↓ to rise and descend (or PageUp / PageDown), with ← → to step sideways. Drag to look around.";
  renderer.domElement.focus({ preventScroll: true });
};
addEventListener("keydown", (event) => {
  // Read Shift from every event: its own keydown may land elsewhere.
  freeCam.shift = event.shiftKey;
  if (!freeCam.on || !FREE_CAM_KEYS.test(event.code)) return;
  if (event.target.closest?.("input, select, textarea, [role=combobox]"))
    return;
  event.preventDefault();
  freeCam.held.add(event.code);
  freeCam.released.delete(event.code);
  flight.t = 1;
});
addEventListener("keyup", (event) => {
  freeCam.shift = event.shiftKey;
  if (freeCam.held.has(event.code)) freeCam.released.add(event.code);
});
addEventListener("blur", () => {
  freeCam.held.clear();
  freeCam.released.clear();
  freeCam.shift = false;
});

const UP = new THREE.Vector3(0, 1, 0);
function updateFreeCam(dt) {
  const held = (code) => (freeCam.on && freeCam.held.has(code) ? 1 : 0);
  const fly = freeCam.shift;
  const ahead = held("ArrowUp") - held("ArrowDown");
  const side = held("ArrowRight") - held("ArrowLeft");
  const rise = (fly ? ahead : 0) + held("PageUp") - held("PageDown");
  for (const code of freeCam.released) freeCam.held.delete(code);
  freeCam.released.clear();
  const look = controls.target.clone().sub(camera.position);
  const forward = look.clone().setY(0);
  if (forward.lengthSq() < 1e-6) camera.getWorldDirection(forward).setY(0);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, UP);
  const wish = fly ? right.multiplyScalar(side) : forward.multiplyScalar(ahead);
  wish.y = rise;
  // Ease in and out of every move and turn.
  const ease = 1 - Math.exp(-8 * dt);
  freeCam.velocity.lerp(wish.multiplyScalar(WALK_SPEED), ease);
  freeCam.turn += ((fly ? 0 : -side * TURN_SPEED) - freeCam.turn) * ease;
  if (freeCam.velocity.lengthSq() < 1e-6 && Math.abs(freeCam.turn) < 1e-4)
    return;
  camera.position.addScaledVector(freeCam.velocity, dt);
  hall.keepInside(camera.position, 0.8);
  look.applyAxisAngle(UP, freeCam.turn * dt);
  controls.target.copy(camera.position).add(look);
}

document.querySelector("#resetBtn").onclick = () => {
  flight.t = 1;
  viewSelect.value = "pianist";
  explodedView.cancelCameraAssist();
  explodedView.resetCamera();
};
lidBtn.onclick = () => {
  lidOpen = !lidOpen;
  lidBtn.textContent = lidOpen ? "Close lid" : "Open lid";
  lidBtn.setAttribute("aria-pressed", String(lidOpen));
};
const fallBtn = document.querySelector("#fallBtn");
fallBtn.onclick = () => {
  fallboardOpen = !fallboardOpen;
  fallBtn.textContent = fallboardOpen ? "Close fallboard" : "Open fallboard";
  fallBtn.setAttribute("aria-pressed", String(fallboardOpen));
};
const hudBtn = document.querySelector("#hudBtn");
hudBtn.onclick = () => {
  const hidden = document.body.classList.toggle("hudHidden");
  hudBtn.textContent = hidden ? "Show HUD" : "Hide HUD";
  hudBtn.setAttribute("aria-pressed", String(hidden));
};
// Credits roll up the lantern's disc on the rear wall; the camera turns to it.
// Cinema mode: the piece plays as a film of the hall. The director cuts
// between moves over the stalls, the keyboard, the glass, the balconies and
// the lantern's beam, and closes on the audience's applause.
const cinemaBtn = document.querySelector("#cinemaBtn");
const cinemaReturn = {
  position: new THREE.Vector3(),
  target: new THREE.Vector3(),
};
const cinematic = createCinematic({
  camera,
  controls,
  onEnd() {
    cinemaBtn.setAttribute("aria-pressed", "false");
    flyTo(cinemaReturn.position, cinemaReturn.target, 1.6);
  },
});
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function cinemaShots() {
  const book = new THREE.Vector3().setFromMatrixPosition(
    piano.scoreBook.group.matrixWorld,
  );
  const facing = new THREE.Vector3(0, 0, 1).transformDirection(
    piano.scoreBook.group.matrixWorld,
  );
  const shot = (from, to, seconds, via) => ({ from, to, seconds, via });
  return {
    film: [
      // From the back of the hall, high, settling toward the stage.
      shot([V(0, 44, 96), V(0, 6, 0)], [V(0, 30, 56), V(0, 5, 0)], 9),
      // Past the chandeliers and down to the piano.
      shot([V(-16, 46, 82), V(0, 54, 58)], [V(-11, 38, 30), V(0, 7, 0)], 8),
      // Along the keys.
      shot(
        [onStage(-2.8, 3.6, 4.6), onStage(-1.6, 1.4, 1.4)],
        [onStage(2.8, 3.6, 4.6), onStage(1.6, 1.4, 1.4)],
        8,
      ),
      // Round the piano.
      shot(
        [onStage(-13, 7, 9), onStage(0, 2, 0)],
        [onStage(13, 7, 9), onStage(0, 2, 0)],
        10,
        onStage(0, 8, 17),
      ),
      // The score on the desk, the bar being played.
      shot(
        [
          book
            .clone()
            .addScaledVector(facing, 3.4)
            .add(V(0, 0.6, 0)),
          book,
        ],
        [
          book
            .clone()
            .addScaledVector(facing, 2.2)
            .add(V(0, 0.2, 0)),
          book,
        ],
        7,
      ),
      // The house, from the stage.
      shot([V(10, 9, 6), V(0, 7, 44)], [V(-10, 9, 6), V(0, 7, 44)], 8),
      // The stained glass and its light, from across the stalls.
      shot([V(2, 24, 18), V(34, 40, 28)], [V(4, 26, 58), V(34, 40, 68)], 9),
      // From the balcony.
      shot([V(-28, 31, 74), V(0, 4, 0)], [V(-27, 31, 44), V(0, 4, 0)], 8),
      // Along the lantern's beam to the portrait on the rear wall.
      shot([V(6, 36, 24), V(0, 40, 100)], [V(0, 31, 54), V(0, 40, 100)], 8),
    ],
    applause: shot([V(7, 9, 7), V(0, 7, 42)], [V(-7, 10, 9), V(0, 7, 42)], 7),
  };
}
function startCinema() {
  cinemaReturn.position.copy(camera.position);
  cinemaReturn.target.copy(controls.target);
  flight.t = 1;
  cinemaBtn.setAttribute("aria-pressed", "true");
  if (!autoplay) startAutoplay();
  cinematic.start(cinemaShots().film, `${song.title} — ${song.composer}`);
}
if (import.meta.env.DEV) window.__vgp.cinematic = cinematic;
cinemaBtn.onclick = () => (cinematic.active ? cinematic.stop() : startCinema());
document.querySelector("#cinemaExitBtn").onclick = () => cinematic.stop();
addEventListener("keydown", (event) => {
  if (event.key === "Escape" && cinematic.active) cinematic.stop();
});

const creditsBtn = document.querySelector("#creditsBtn");
let credits = false;
function setCredits(on) {
  credits = on;
  creditsBtn.setAttribute("aria-pressed", String(on));
}
creditsBtn.onclick = () => {
  if (credits) {
    setCredits(false);
    hall.showComposer(null);
    return;
  }
  if (autoplay) stopAutoplay();
  setCredits(true);
  hall.rollCredits();
  flyTo(hall.views.projection.position, hall.views.projection.target, 2);
};
// The audience: present by default (not at Low), and yours to dismiss.
const crowdBtn = document.querySelector("#crowdBtn");
crowdBtn.onclick = () => {
  hall.audience.visible = !hall.audience.visible;
  crowdBtn.setAttribute("aria-pressed", String(hall.audience.visible));
};
const qualitySelect = document.querySelector("#qualitySelect");
function applyQuality(level) {
  quality = level;
  qualitySelect.value = level;
  renderer.setPixelRatio(renderPixelRatio());
  hall.setQuality(QUALITY[level]);
  crowdBtn.setAttribute("aria-pressed", String(hall.audience.visible));
  try {
    localStorage.setItem("vgp.quality", level);
  } catch {
    // Storage blocked: the choice lasts for this visit.
  }
}
qualitySelect.addEventListener("change", () =>
  applyQuality(qualitySelect.value),
);
applyQuality(quality);

// The sky outside the stained glass, by choice or by the visitor's clock:
// day from 7 to 17, sunset either side of it, night otherwise.
const skySelect = document.querySelector("#skySelect");
const clockSky = (hour = new Date().getHours()) =>
  hour >= 7 && hour < 17
    ? "day"
    : (hour >= 5 && hour < 7) || (hour >= 17 && hour < 19)
      ? "sunset"
      : "night";
function applySky(choice) {
  skySelect.value = choice;
  hall.setSky(choice === "auto" ? clockSky() : choice);
  try {
    localStorage.setItem("vgp.sky", choice);
  } catch {
    // Storage blocked: the choice lasts for this visit.
  }
}
skySelect.addEventListener("change", () => applySky(skySelect.value));
setInterval(() => skySelect.value === "auto" && applySky("auto"), 60000);
let savedSky = "auto";
try {
  savedSky = localStorage.getItem("vgp.sky") ?? "auto";
} catch {
  // Storage blocked: follow the clock.
}
applySky(
  [...skySelect.options].some((o) => o.value === savedSky) ? savedSky : "auto",
);
const curtainBtn = document.querySelector("#curtainBtn");
curtainBtn.onclick = () => {
  const open = !hall.curtainOpen;
  hall.setCurtainOpen(open);
  curtainBtn.textContent = open ? "Close curtain" : "Open curtain";
  curtainBtn.setAttribute("aria-pressed", String(open));
};
document.querySelector("#enterBtn").onclick = async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Preparing piano…";
  prepareAudio();
  // Compile every shader now, behind "Preparing piano…", so the first
  // orbit across the hall or first exploded frame does not stall.
  await Promise.all([
    audio.warmFallbacks(),
    renderer.compileAsync?.(scene, camera).catch(() => {}),
  ]);
  audioGate.classList.add("hidden");
  audioGate.setAttribute("aria-hidden", "true");
  gatedInterface.forEach((element) => element.removeAttribute("inert"));
  requestAnimationFrame(() =>
    renderer.domElement.focus({ preventScroll: true }),
  );
};

function setHelpOpen(open, { restoreFocus = true } = {}) {
  helpPanel.hidden = !open;
  helpBtn.setAttribute("aria-expanded", String(open));
  if (open) helpCloseBtn.focus();
  else if (restoreFocus) helpBtn.focus();
}

document.addEventListener("focusin", (event) => {
  if (
    !helpPanel.hidden &&
    !helpPanel.contains(event.target) &&
    event.target !== helpBtn
  )
    setHelpOpen(false, { restoreFocus: false });
});
helpBtn.onclick = () => setHelpOpen(helpPanel.hidden);
helpCloseBtn.onclick = () => setHelpOpen(false);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !helpPanel.hidden) setHelpOpen(false);
});
document.addEventListener("click", (event) => {
  if (
    !helpPanel.hidden &&
    !helpPanel.contains(event.target) &&
    event.target !== helpBtn
  )
    setHelpOpen(false, { restoreFocus: false });
});
updateRecordingUi();
if (import.meta.env.DEV)
  Object.assign(window.__vgp, {
    input: { computerKeyboard, midi: midiInput, recorder },
  });

// --- Animation loop ---------------------------------------------------------
const timer = new THREE.Timer();
// The ear goes where the camera goes: near and dry at the keyboard, distant
// and reverberant at the back of the hall, panned to the piano's side.
const SOUNDBOARD = onStage(0, 1.2, 0);
const toPiano = new THREE.Vector3();
const earRight = new THREE.Vector3();
timer.connect(document);

function animate(timestamp) {
  requestAnimationFrame(animate);
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.035);
  updateFlight(dt);
  updateFreeCam(dt);
  controls.update();
  // Never pass through a wall, the ceiling or a floor.
  hall.keepInside(camera.position, 0.8);
  hall.keepInside(controls.target, 0.2);
  cinematic.update(dt, reducedMotion.matches);

  explodedView.update(dt, reducedMotion.matches);
  hall.update(reducedMotion.matches ? 100 : dt);
  bench.userData.update(reducedMotion.matches ? 100 : dt);

  const targetLid = lidOpen ? DIM.lidOpenAngle : 0;
  piano.setLidAngle(
    THREE.MathUtils.damp(
      lidPivot.rotation.z,
      targetLid,
      5.5,
      reducedMotion.matches ? 100 : dt,
    ),
  );

  fallboardClosure = THREE.MathUtils.damp(
    fallboardClosure,
    fallboardOpen ? 0 : 1,
    3,
    reducedMotion.matches ? 100 : dt,
  );
  piano.setFallboard(fallboardClosure);

  pianoPerformance.update(dt);
  piano.scoreBook.update(dt, reducedMotion.matches);

  advanceAutoplay(dt);
  hall.audience.update(dt, autoplay && !reducedMotion.matches);
  const songTime = autoplay ? playhead : null;
  if (autoplay)
    progressEl.style.width =
      THREE.MathUtils.clamp(songTime / songLength, 0, 1) * 100 + "%";
  noteEffects.update(dt, songTime, reducedMotion.matches);
  piano.scoreBook.follow(song.midi ? null : songTime);
  toPiano.subVectors(SOUNDBOARD, camera.position);
  earRight.setFromMatrixColumn(camera.matrixWorld, 0);
  audio.setListener(toPiano.length(), toPiano.normalize().dot(earRight));
  if (explodedView.exploded || explodedView.isTransitioning)
    inspection.updateLabels();

  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.zoom = Math.min(1, camera.aspect / 1.6);
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(renderPixelRatio());
  explodedView.handleResize();
});
