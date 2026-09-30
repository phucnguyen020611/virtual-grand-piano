import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { createMaterials, makeCanvasTexture } from "./piano/materials.js";
import { DIM } from "./piano/geometry.js";
import { createPiano } from "./piano/createPiano.js";
import { createBench } from "./scene/bench.js";
import { createStage } from "./scene/stage.js";
import { createLighting } from "./scene/lighting.js";
import { createReflectionEnvironment } from "./scene/environment.js";
import { createAudioEngine } from "./audio/pianoAudio.js";
import { createMechanics } from "./piano/mechanics.js";
import { createPerformanceController } from "./performance/performanceController.js";
import { createComputerKeyboard } from "./performance/computerKeyboard.js";
import { createMidiInput } from "./performance/midiInput.js";
import { createPerformanceRecorder } from "./performance/performanceRecorder.js";
import { scoreEvents } from "./performance/furElise.js";
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
scene.fog = new THREE.FogExp2(0x050506, 0.007);

const camera = new THREE.PerspectiveCamera(
  38,
  innerWidth / innerHeight,
  0.1,
  80,
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
controls.dampingFactor = 0.055;
controls.target.copy(NORMAL_DEFAULT_TARGET);
controls.minDistance = 4;
controls.maxDistance = 26;
controls.maxPolarAngle = Math.PI * 0.49;

// --- World -----------------------------------------------------------------
const environment = createReflectionEnvironment(renderer);
scene.environment = environment.texture;
const mats = createMaterials(renderer.capabilities.getMaxAnisotropy());
const { stageTopY } = createStage(scene, mats);
const bench = createBench(mats, stageTopY);
scene.add(bench);
const lighting = createLighting(scene);
lighting.lamp.visible = camera.aspect >= 0.9;

const piano = createPiano(mats, stageTopY);
scene.add(piano.group);
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
    lighting,
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
const explodedView = createExplodedView({ piano, camera, controls });
if (import.meta.env.DEV) window.__vgp.explodedView = explodedView;

// --- Für Elise autoplay, read from the engraved score -----------------------
const songEvents = scoreEvents(0.2);
const LEAD_IN = 2.2; // seconds for the first light columns to fall
const songLength = Math.max(...songEvents.map((e) => e.time + e.duration));
const noteEffects = createNoteEffects(scene, piano, renderer, camera);
let autoplay = false,
  autoTimers = [],
  songStart = 0;
const autoBtn = document.querySelector("#autoBtn"),
  progressEl = document.querySelector("#songProgress");

function stopAutoplay() {
  autoplay = false;
  autoTimers.forEach(clearTimeout);
  autoTimers = [];
  autoBtn.textContent = "Play Für Elise";
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
  autoBtn.textContent = "Stop Für Elise";
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
  lighting.setExploded(exploded);
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
document.querySelector("#resetBtn").onclick = () => {
  explodedView.cancelCameraAssist();
  explodedView.resetCamera();
};
lidBtn.onclick = () => {
  lidOpen = !lidOpen;
  lidBtn.textContent = lidOpen ? "Close lid" : "Open lid";
  lidBtn.setAttribute("aria-pressed", String(lidOpen));
};
document.querySelector("#enterBtn").onclick = async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Preparing piano…";
  prepareAudio();
  await audio.warmFallbacks();
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
  controls.update();

  explodedView.update(dt, reducedMotion.matches);
  lighting.update(reducedMotion.matches ? 100 : dt);
  // Keep the decorative fixture out of the entire exploded transition.
  lighting.lamp.visible =
    camera.aspect >= 0.9 &&
    !explodedView.exploded &&
    !explodedView.isTransitioning;

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
  lighting.lamp.visible = camera.aspect >= 0.9;
  explodedView.handleResize();
});
