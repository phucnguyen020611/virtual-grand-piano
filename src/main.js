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
import { SONGS, scoreEvents } from "./performance/songs.js";
import { createNoteEffects } from "./scene/noteEffects.js";
import { createInspection } from "./interaction/inspection.js";
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
const renderPixelRatio = () =>
  Math.min(
    devicePixelRatio,
    matchMedia("(pointer: coarse)").matches || innerWidth < 768 ? 1.5 : 2,
  );

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
    else mechanics.setPedal(type, down);
  },
  controls,
);
inspection.addPickable(bench);
const explodedView = createExplodedView({ piano, camera, controls });
if (import.meta.env.DEV) window.__vgp.explodedView = explodedView;

// --- Autoplay, read from the engraved score ---------------------------------
const LEAD_IN = 2.2; // seconds for the first light columns to fall
const noteEffects = createNoteEffects(scene, piano, renderer, camera);
let song = SONGS[0];
let songEvents = scoreEvents(song);
let songLength = Math.max(...songEvents.map((e) => e.time + e.duration));
let autoplay = false,
  autoTimers = [],
  songStart = 0;
const autoBtn = document.querySelector("#autoBtn"),
  songSelect = document.querySelector("#songSelect"),
  progressEl = document.querySelector("#songProgress");
for (const piece of SONGS)
  songSelect.add(
    new Option(
      `${piece.title} — ${piece.composer.split(" ").at(-1)}`,
      piece.id,
    ),
  );
songSelect.addEventListener("change", () => {
  if (autoplay) stopAutoplay();
  song = SONGS.find((piece) => piece.id === songSelect.value);
  songEvents = scoreEvents(song);
  songLength = Math.max(...songEvents.map((e) => e.time + e.duration));
  piano.scoreBook.setSong(song);
  piano.scoreBook.turnTo(1);
});

function stopAutoplay() {
  autoplay = false;
  autoTimers.forEach(clearTimeout);
  autoTimers = [];
  autoBtn.textContent = "Play";
  autoBtn.setAttribute("aria-pressed", "false");
  pianoPerformance.stopSource("autoplay");
  noteEffects.stop();
  progressEl.style.width = "0%";
}
function startAutoplay() {
  if (autoplay) {
    stopAutoplay();
    return;
  }
  prepareAudio();
  autoplay = true;
  autoBtn.textContent = "Stop";
  autoBtn.setAttribute("aria-pressed", "true");
  piano.scoreBook.turnTo(1); // open at the music
  songStart = performance.now() + LEAD_IN * 1000;
  noteEffects.start(songEvents);
  for (const event of songEvents) {
    autoTimers.push(
      setTimeout(
        () => {
          if (!autoplay) return;
          pianoPerformance.playMidi(
            event.midi,
            event.duration * 0.95,
            event.velocity,
            "autoplay",
          );
        },
        (LEAD_IN + event.time) * 1000,
      ),
    );
  }
  autoTimers.push(
    setTimeout(() => stopAutoplay(), (LEAD_IN + songLength + 0.6) * 1000),
  );
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
const WALK_SPEED = 9; // units per second
const TURN_SPEED = 1.5; // radians per second
freeCamBtn.onclick = () => {
  freeCam.on = !freeCam.on;
  freeCamBtn.setAttribute("aria-pressed", String(freeCam.on));
  if (!freeCam.on) return;
  flight.t = 1;
  explodedView.cancelCameraAssist();
  // Pull the orbit point close so a drag turns the head, not the world.
  const ahead = controls.target.clone().sub(camera.position).setLength(1.5);
  controls.target.copy(camera.position).add(ahead);
  dom.partMeta.textContent = "Free cam";
  dom.partName.textContent = "↑ ↓ walk · ← → turn";
  dom.partText.textContent =
    "Hold Shift with ↑ ↓ to rise and descend (or PageUp / PageDown), Shift with ← → to step sideways. Drag to look around.";
  renderer.domElement.focus({ preventScroll: true });
};
addEventListener("keydown", (event) => {
  // Read Shift from every event: its own keydown may land elsewhere.
  freeCam.shift = event.shiftKey;
  if (!freeCam.on || !FREE_CAM_KEYS.test(event.code)) return;
  if (event.target.closest?.("input, select, textarea")) return;
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

  pianoPerformance.update(dt);
  piano.scoreBook.update(dt, reducedMotion.matches);

  const songTime = autoplay ? (performance.now() - songStart) / 1000 : null;
  if (autoplay)
    progressEl.style.width =
      THREE.MathUtils.clamp(songTime / songLength, 0, 1) * 100 + "%";
  noteEffects.update(dt, songTime, reducedMotion.matches);
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
