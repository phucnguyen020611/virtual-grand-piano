import assert from "node:assert/strict";
import { createPerformanceController } from "../src/performance/performanceController.js";
import { createPerformanceRecorder } from "../src/performance/performanceRecorder.js";
import { createMidiInput } from "../src/performance/midiInput.js";
import { createComputerKeyboard } from "../src/performance/computerKeyboard.js";
import {
  createSampleManifest,
  validateSampleCoverage,
  velocityLayerWeights,
} from "../src/audio/pianoSamples.js";

const calls = [];
const audio = {
  activeVoices: new Map(),
  noteOn: (...a) => calls.push(["on", ...a]),
  noteOff: (...a) => calls.push(["off", ...a]),
  setSustain() {},
};
const visuals = {
  damperCutoffMidi: 95,
  setNoteHeld() {},
  setDamperLifted() {},
  strike() {},
  setDamperOpen() {},
  setSustain() {},
  update() {},
};
const controller = createPerformanceController(audio, visuals, visuals);
let passed = 0;
function check(name, fn) {
  controller.stopAll();
  calls.length = 0;
  fn();
  passed++;
  console.log(`PASS ${name}`);
}

check("single, repeated and nine-note ownership", () => {
  for (let i = 0; i < 9; i++) controller.noteOn(60 + i, 0.7, `key:${i}`);
  assert.equal(controller.physicallyHeldNotes.size, 9);
  controller.noteOn(60, 0.8, "key:0");
  assert.equal(controller.activeSourceTokensByMidi.get(60).size, 1);
  for (let i = 0; i < 9; i++) controller.noteOff(60 + i, `key:${i}`);
  assert.equal(controller.physicallyHeldNotes.size, 0);
  assert.equal(calls.filter(([type]) => type === "on").length, 10);
});
for (const other of ["pointer", "autoplay", "recording"]) {
  check(`computer + ${other}: release/stop preserves held note`, () => {
    controller.noteOn(60, 0.7, "computer:z", "computer");
    controller.noteOn(60, 0.8, `${other}:1`, other);
    controller.stopSource(other);
    assert(controller.physicallyHeldNotes.has(60));
    assert.equal(calls.filter(([type]) => type === "off").length, 0);
    controller.noteOff(60, "computer:z");
    assert.equal(calls.filter(([type]) => type === "off").length, 1);
  });
}
check("Space + MIDI sustain ownership and disconnect", () => {
  controller.setSustainForSource("computer:space", true, "computer");
  controller.setSustainForSource("midi:device:1:cc64", true, "midi:device");
  controller.noteOn(60, 0.7, "midi:device:1:60", "midi:device");
  controller.releaseSource("midi:device");
  assert(controller.sustain);
  assert(controller.sustainedReleasedNotes.has(60));
  controller.setSustainForSource("computer:space", false, "computer");
  assert(!controller.sustain);
  assert.equal(controller.sustainedReleasedNotes.size, 0);
});

// Native EventTarget is enough to exercise the keyboard adapter; no DOM package.
globalThis.Element = class {
  constructor(tag) {
    this.tag = tag;
  }
  closest(selector) {
    return selector.split(", ").includes(this.tag) ? this : null;
  }
};
globalThis.window = new EventTarget();
globalThis.document = new EventTarget();
let enabled = true;
const keyboard = createComputerKeyboard({
  controller,
  isEnabled: () => enabled,
});
function key(type, code, fields = {}, target = window) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, { code, ...fields });
  if (target !== window) Object.defineProperty(e, "target", { value: target });
  window.dispatchEvent(e);
  return e;
}
check("octave shifts keep held tokens; blur releases", () => {
  key("keydown", "KeyZ");
  keyboard.shiftOctave(1);
  key("keyup", "KeyZ");
  assert.equal(controller.physicallyHeldNotes.size, 0);
  key("keydown", "KeyX");
  key("keydown", "Space");
  window.dispatchEvent(new Event("blur"));
  assert.equal(controller.physicallyHeldNotes.size, 0);
  assert(!controller.sustain);
});
check("gate, native controls, IME and browser shortcuts are respected", () => {
  enabled = false;
  key("keydown", "KeyZ");
  enabled = true;
  for (const field of ["ctrlKey", "metaKey", "altKey", "isComposing"]) {
    assert(!key("keydown", "KeyZ", { [field]: true }).defaultPrevented);
  }
  for (const tag of ["button", "select", "summary", "input", "textarea", "a"]) {
    assert(!key("keydown", "Space", {}, new Element(tag)).defaultPrevented);
  }
  assert.equal(controller.physicallyHeldNotes.size, 0);
  assert(!controller.sustain);
});
check("recording transport cannot play a changing event list", () => {
  const recorder = createPerformanceRecorder(controller);
  recorder.start();
  controller.noteOn(60, 0.7, "computer:z", "computer");
  assert.equal(recorder.play(), false);
  recorder.start(); // Does not erase the current take.
  assert.equal(recorder.state().eventCount, 1);
  recorder.stop();
  assert.equal(recorder.data.events.at(-1).type, "noteOff");
  assert(recorder.play());
  recorder.stopPlayback();
  assert(controller.physicallyHeldNotes.has(60));
  recorder.dispose();
  assert(!recorder.state().playback);
});

const device = {
  id: "test:1:device",
  name: "Synthetic MIDI input",
  state: "connected",
  type: "input",
};
const access = { inputs: new Map([[device.id, device]]) };
Object.defineProperty(globalThis, "navigator", {
  value: { requestMIDIAccess: async () => access },
  configurable: true,
});
const midi = createMidiInput({ controller });
await midi.connect();
const message = (...data) => device.onmidimessage({ data });
check("MIDI velocity, both note-offs, CC64, CC123, CC120, hot unplug", () => {
  message(0x90, 60, 64);
  assert.equal(calls.at(-1)[2], 64 / 127);
  message(0x90, 60, 0);
  assert(!controller.physicallyHeldNotes.has(60));
  message(0x90, 61, 90);
  message(0x80, 61, 0);
  assert(!controller.physicallyHeldNotes.has(61));
  message(0xb0, 64, 127);
  message(0x90, 60, 90);
  message(0xb0, 123, 0);
  assert(controller.sustainedReleasedNotes.has(60));
  message(0xb0, 64, 0);
  assert(!controller.sustain);
  message(0x90, 62, 127);
  message(0x91, 63, 100);
  message(0xb0, 120, 0);
  assert(!controller.physicallyHeldNotes.has(62));
  assert(controller.physicallyHeldNotes.has(63));
  device.state = "disconnected";
  access.onstatechange({ port: device });
  assert.equal(controller.physicallyHeldNotes.size, 0);
});
check("sample coverage and equal-power velocity blends", () => {
  const manifest = createSampleManifest();
  assert.equal(manifest.length, 48);
  const coverage = validateSampleCoverage(manifest);
  assert.equal(coverage.maximumPositive, 3);
  assert.equal(coverage.maximumNegative, -2);
  for (let v = 0; v <= 1; v += 0.01)
    assert(
      Math.abs(
        velocityLayerWeights(v).reduce((sum, l) => sum + l.weight ** 2, 0) - 1,
      ) < 1e-10,
    );
});
controller.stopAll();
console.log(`${passed} regression checks passed`);
