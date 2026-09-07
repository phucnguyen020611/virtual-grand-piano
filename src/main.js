import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import "./style.css";

import { createMaterials } from "./piano/materials.js";
import { createPiano } from "./piano/createPiano.js";
import { createStage } from "./scene/stage.js";
import { createLighting } from "./scene/lighting.js";
import { createReflectionEnvironment } from "./scene/environment.js";
import { createAudioEngine } from "./audio/pianoAudio.js";
import { createMechanics } from "./piano/mechanics.js";
import { createPerformanceController } from "./performance/performanceController.js";
import { createComputerKeyboard } from "./performance/computerKeyboard.js";
import { createMidiInput } from "./performance/midiInput.js";
import { createPerformanceRecorder } from "./performance/performanceRecorder.js";
import { createInspection } from "./interaction/inspection.js";
import {
  createExplodedView,
  NORMAL_DEFAULT_CAMERA_POSITION,
  NORMAL_DEFAULT_TARGET,
} from "./interaction/explodedView.js";

// --- Renderer / scene / camera ---------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050506);
scene.fog = new THREE.FogExp2(0x050506, 0.007);

const camera = new THREE.PerspectiveCamera(
  38,
  innerWidth / innerHeight,
  0.1,
  80,
);
camera.position.copy(NORMAL_DEFAULT_CAMERA_POSITION);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.96;
document.querySelector("#scene").appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
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
const lighting = createLighting(scene);

const piano = createPiano(mats, stageTopY);
scene.add(piano.group);
const { midiToKey, lidPivot, prop } = piano;

// Dev-only inspection hook for geometry validation (stripped from production).
if (import.meta.env.DEV) {
  window.__vgp = {
    THREE,
    scene,
    piano,
    stageTopY,
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

// --- Für Elise autoplay (public-domain composition, simplified) ------------
const furElise = [
  [76, 0.25],
  [75, 0.25],
  [76, 0.25],
  [75, 0.25],
  [76, 0.25],
  [71, 0.25],
  [74, 0.25],
  [72, 0.25],
  [69, 0.52],
  [60, 0.25],
  [64, 0.25],
  [69, 0.25],
  [71, 0.52],
  [64, 0.25],
  [68, 0.25],
  [71, 0.25],
  [72, 0.52],
  [64, 0.25],
  [76, 0.25],
  [75, 0.25],
  [76, 0.25],
  [75, 0.25],
  [76, 0.25],
  [71, 0.25],
  [74, 0.25],
  [72, 0.25],
  [69, 0.52],
  [60, 0.25],
  [64, 0.25],
  [69, 0.25],
  [71, 0.52],
  [64, 0.25],
  [72, 0.25],
  [71, 0.25],
  [69, 0.64],
  [71, 0.25],
  [72, 0.25],
  [74, 0.25],
  [76, 0.5],
  [67, 0.25],
  [77, 0.25],
  [76, 0.25],
  [74, 0.5],
  [65, 0.25],
  [76, 0.25],
  [74, 0.25],
  [72, 0.5],
];
let autoplay = false,
  autoTimers = [],
  songStart = 0,
  songLength = 0;
const autoBtn = document.querySelector("#autoBtn"),
  progressEl = document.querySelector("#songProgress");

function stopAutoplay() {
  autoplay = false;
  autoTimers.forEach(clearTimeout);
  autoTimers = [];
  autoBtn.textContent = "▶ Für Elise";
  pianoPerformance.stopSource("autoplay");
  progressEl.style.width = "0%";
}
function startAutoplay() {
  if (autoplay) {
    stopAutoplay();
    return;
  }
  audio.ensureAudio();
  autoplay = true;
  autoBtn.textContent = "■ Stop";
  const tempo = 0.9;
  let t = 0;
  songLength = furElise.reduce((a, n) => a + n[1] * tempo, 0);
  songStart = performance.now();
  furElise.forEach(([m, d]) => {
    autoTimers.push(
      setTimeout(() => {
        if (!autoplay) return;
        pianoPerformance.playMidi(m, d * tempo * 0.92, 0.68, "autoplay");
        inspection.selectPart(midiToKey.get(m));
      }, t * 1000),
    );
    t += d * tempo;
  });
  autoTimers.push(setTimeout(() => stopAutoplay(), (t + 0.35) * 1000));
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
let lidOpen = true;

const computerKeyboard = createComputerKeyboard({
  controller: pianoPerformance,
  onRangeChange: ({ minMidi, maxMidi }) => {
    octaveLabel.textContent = `MIDI ${minMidi}–${maxMidi}`;
  },
});
const midiInput = createMidiInput({
  controller: pianoPerformance,
  onStatus: ({ status, supported, selectedId, selectedName, inputs }) => {
    midiSelect.replaceChildren();
    for (const input of inputs) {
      const option = document.createElement("option");
      option.value = input.id;
      option.textContent = input.name;
      option.selected = input.id === selectedId;
      midiSelect.appendChild(option);
    }
    midiSelect.hidden = inputs.length < 2;
    midiBtn.textContent =
      status === "connected"
        ? `MIDI: ${selectedName}`
        : status === "no-devices"
          ? "MIDI: No devices"
          : status === "denied"
            ? "MIDI: Denied"
            : supported
              ? "MIDI: Connect"
              : "MIDI: Unavailable";
  },
});

function updateRecordingUi() {
  const { recording, playback, eventCount } = recorder.state();
  recordBtn.textContent = recording ? "■ Stop Recording" : "● Record";
  recordBtn.classList.toggle("active", recording);
  playRecordingBtn.disabled = !eventCount && !playback;
  playRecordingBtn.textContent = playback
    ? "■ Stop Recording"
    : "Play Recording";
}
recorder.subscribe(updateRecordingUi);

function setExplodedMode(exploded) {
  inspection.setMode(exploded, { normalBtn, explodeBtn });
  explodedView.setExploded(exploded);
  lighting.setExploded(exploded);
}
normalBtn.onclick = () => setExplodedMode(false);
explodeBtn.onclick = () => setExplodedMode(true);
autoBtn.onclick = startAutoplay;
octaveDownBtn.onclick = () => computerKeyboard.shiftOctave(-1);
octaveUpBtn.onclick = () => computerKeyboard.shiftOctave(1);
midiBtn.onclick = () => midiInput.connect();
midiSelect.onchange = () => midiInput.select(midiSelect.value);
recordBtn.onclick = () => {
  if (recorder.state().recording) recorder.stop();
  else recorder.start();
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
  lidBtn.textContent = lidOpen ? "Close Lid" : "Open Lid";
};
document.querySelector("#enterBtn").onclick = () => {
  audio.ensureAudio();
  document.querySelector("#audioGate").classList.add("hidden");
  document.querySelector("#statusText").textContent = "Audio enabled · 88 keys";
};
updateRecordingUi();
if (import.meta.env.DEV)
  Object.assign(window.__vgp, {
    input: { computerKeyboard, midi: midiInput, recorder },
  });

// --- Animation loop ---------------------------------------------------------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.035);
  controls.update();

  explodedView.update(dt);
  lighting.update(dt);

  const targetLid = lidOpen ? 0.32 : 0;
  lidPivot.rotation.z = THREE.MathUtils.damp(
    lidPivot.rotation.z,
    targetLid,
    5.5,
    dt,
  );
  prop.scale.y = THREE.MathUtils.damp(prop.scale.y, lidOpen ? 1 : 0.06, 6, dt);
  prop.visible = prop.scale.y > 0.08;

  pianoPerformance.update(dt);

  if (autoplay) {
    const elapsed = (performance.now() - songStart) / 1000;
    progressEl.style.width = Math.min(1, elapsed / songLength) * 100 + "%";
  }
  if (explodedView.exploded || explodedView.isTransitioning)
    inspection.updateLabels();

  renderer.render(scene, camera);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  explodedView.handleResize();
});
