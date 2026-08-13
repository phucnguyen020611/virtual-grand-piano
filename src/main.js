import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import "./style.css";

import { createMaterials } from "./piano/materials.js";
import { createPiano } from "./piano/createPiano.js";
import { createStage } from "./scene/stage.js";
import { createLighting } from "./scene/lighting.js";
import { createAudioEngine } from "./audio/pianoAudio.js";
import { createInspection } from "./interaction/inspection.js";

// --- Renderer / scene / camera ---------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050506);
scene.fog = new THREE.FogExp2(0x050506, 0.018);

const camera = new THREE.PerspectiveCamera(
  38,
  innerWidth / innerHeight,
  0.1,
  80,
);
camera.position.set(9.2, 6.4, 11.5);

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
renderer.toneMappingExposure = 1.05;
document.querySelector("#scene").appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.target.set(0, 1.25, -0.4);
controls.minDistance = 4;
controls.maxDistance = 26;
controls.maxPolarAngle = Math.PI * 0.49;

// --- World -----------------------------------------------------------------
const mats = createMaterials(renderer.capabilities.getMaxAnisotropy());
const { stageTopY } = createStage(scene, mats);
createLighting(scene);

const piano = createPiano(mats, stageTopY);
scene.add(piano.group);
const { keyMeshes, midiToKey, lidPivot, prop, explodeItems } = piano;

// Dev-only inspection hook for geometry validation (stripped from production).
if (import.meta.env.DEV) {
  window.__vgp = { THREE, scene, piano, stageTopY };
}

// --- Audio -----------------------------------------------------------------
function keyVisual(midi, on) {
  const k = midiToKey.get(midi);
  if (k) k.userData.pressed = on;
}
const audio = createAudioEngine(keyVisual);

// --- Inspection / interaction ----------------------------------------------
const dom = {
  partName: document.querySelector("#partName"),
  partText: document.querySelector("#partText"),
  partMeta: document.querySelector("#partMeta"),
  labelRoot: document.querySelector("#labels"),
};
const inspection = createInspection(renderer, camera, piano, dom, (midi) =>
  audio.playMidi(midi, 0.8),
);

// --- Computer-keyboard performance -----------------------------------------
const keyboardMap = {
  KeyA: 60,
  KeyW: 61,
  KeyS: 62,
  KeyE: 63,
  KeyD: 64,
  KeyF: 65,
  KeyT: 66,
  KeyG: 67,
  KeyY: 68,
  KeyH: 69,
  KeyU: 70,
  KeyJ: 71,
  KeyK: 72,
  KeyO: 73,
  KeyL: 74,
  KeyP: 75,
  Semicolon: 76,
  Quote: 77,
};
const held = new Set();
addEventListener("keydown", (e) => {
  if (e.repeat || !keyboardMap[e.code] || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  held.add(e.code);
  audio.noteOn(keyboardMap[e.code], 0.72);
});
addEventListener("keyup", (e) => {
  if (!keyboardMap[e.code]) return;
  held.delete(e.code);
  audio.noteOff(keyboardMap[e.code], 0.45);
});

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
  for (const [m] of audio.activeVoices) audio.noteOff(m, 0.25);
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
        audio.playMidi(m, d * tempo * 0.92, 0.68);
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
let lidOpen = true;

normalBtn.onclick = () => inspection.setMode(false, { normalBtn, explodeBtn });
explodeBtn.onclick = () => inspection.setMode(true, { normalBtn, explodeBtn });
autoBtn.onclick = startAutoplay;
document.querySelector("#resetBtn").onclick = () => {
  camera.position.set(9.2, 6.4, 11.5);
  controls.target.set(0, 1.25, -0.4);
  controls.update();
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

// --- Animation loop ---------------------------------------------------------
const clock = new THREE.Clock();
let explodeMix = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.035);
  controls.update();

  explodeMix = THREE.MathUtils.damp(
    explodeMix,
    inspection.exploded ? 1 : 0,
    4.2,
    dt,
  );
  for (const [g] of explodeItems) {
    const base = g.userData.base,
      off = g.userData.offset;
    g.position.set(
      base.x + off.x * explodeMix,
      base.y + off.y * explodeMix,
      base.z + off.z * explodeMix,
    );
  }

  const targetLid = lidOpen ? 0.32 : 0;
  lidPivot.rotation.z = THREE.MathUtils.damp(
    lidPivot.rotation.z,
    targetLid,
    5.5,
    dt,
  );
  prop.scale.y = THREE.MathUtils.damp(prop.scale.y, lidOpen ? 1 : 0.06, 6, dt);
  prop.visible = prop.scale.y > 0.08;

  for (const k of keyMeshes) {
    const ty = k.userData.restY + (k.userData.pressed ? -0.05 : 0);
    k.position.y = THREE.MathUtils.damp(k.position.y, ty, 22, dt);
    const targetRot = k.userData.pressed ? -0.018 : 0;
    k.rotation.x = THREE.MathUtils.damp(k.rotation.x, targetRot, 22, dt);
  }

  if (autoplay) {
    const elapsed = (performance.now() - songStart) / 1000;
    progressEl.style.width = Math.min(1, elapsed / songLength) * 100 + "%";
  }
  if (inspection.exploded) inspection.updateLabels();

  renderer.render(scene, camera);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});
