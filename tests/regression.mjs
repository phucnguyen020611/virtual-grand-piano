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
import {
  SONGS,
  parsePitch,
  scoreEvents,
  scorePedal,
} from "../src/performance/songs.js";
import { parseMidiFile } from "../src/performance/midiFile.js";

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
  setPedal() {},
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
  assert.equal(manifest.length, 90);
  const coverage = validateSampleCoverage(manifest);
  assert.equal(coverage.maximumPositive, 1);
  assert.equal(coverage.maximumNegative, -1);
  for (let v = 0; v <= 1; v += 0.01)
    assert(
      Math.abs(
        velocityLayerWeights(v).reduce((sum, l) => sum + l.weight ** 2, 0) - 1,
      ) < 1e-10,
    );
});
check("repertoire: bars fill their metre, pages hold every bar once", () => {
  for (const song of SONGS) {
    const barLength = (16 * song.time[0]) / song.time[1];
    song.measures.forEach((measure, index) => {
      if (!measure.pickup)
        assert.equal(measure.length, barLength, `${song.id} bar ${index}`);
      for (const note of [...measure.rh, ...measure.lh]) {
        const { midi } = parsePitch(note.pitch);
        assert(midi >= 21 && midi <= 108, `${song.id} ${note.pitch}`);
        assert(
          note.pos >= 0 && note.pos + note.dur <= measure.length,
          `${song.id} bar ${index} overflows at ${note.pitch}`,
        );
      }
    });
    const printed = song.pages.flat(2).sort((a, b) => a - b);
    assert.deepEqual(
      printed,
      song.measures.map((_, i) => i),
      `${song.id} pages`,
    );
    assert(song.pages.length <= 2, `${song.id} needs more than two pages`);
    assert(scoreEvents(song).length > 20, `${song.id} events`);
    // Pedalled from start to finish, lifted at the end, never out of order.
    const pedal = scorePedal(song);
    assert(
      pedal.length > 10 && pedal.at(-1).down === false,
      `${song.id} pedal`,
    );
    const notes = scoreEvents(song);
    assert(
      pedal.at(-1).time > notes.at(-1).time,
      `${song.id} pedal lifts early`,
    );
    pedal.forEach((change, i) =>
      assert(!i || change.time >= pedal[i - 1].time, `${song.id} pedal order`),
    );
  }
});
check("sostenuto holds only the notes down when it was pressed", () => {
  const offs = () => calls.filter(([kind]) => kind === "off").map(([, m]) => m);
  controller.noteOn(60, 0.7, "computer:a", "computer");
  controller.setPedal("sostenuto", true);
  controller.noteOff(60, "computer:a");
  controller.noteOn(64, 0.7, "computer:b", "computer");
  controller.noteOff(64, "computer:b");
  assert.deepEqual(offs(), [64], "the caught C rings, the later E is damped");
  controller.setPedal("sostenuto", false);
  assert.deepEqual(offs(), [64, 60], "lifting the pedal damps the C");
});
check("MIDI files read into timed events", () => {
  // Format 1, 96 ticks a quarter: a tempo track (120, then 60 bpm at beat 2)
  // and a piano track with running status, a pedal and a drum hit.
  const track = (body) => [
    ...[0x4d, 0x54, 0x72, 0x6b],
    ...[0, 0, (body.length >> 8) & 0xff, body.length & 0xff],
    ...body,
  ];
  const file = new Uint8Array([
    ...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, 0, 96],
    ...track([
      ...[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20], // 120 bpm
      ...[0x81, 0x40, 0xff, 0x51, 3, 0x0f, 0x42, 0x40], // 60 bpm at tick 192
      ...[0, 0xff, 0x2f, 0],
    ]),
    ...track([
      ...[0, 0xff, 0x03, 4, 0x54, 0x65, 0x73, 0x74], // "Test"
      ...[0, 0xb0, 64, 127], // pedal down
      ...[0, 0x90, 60, 100], // C4 on…
      ...[0, 48, 80], // …and E3, running status
      ...[0, 0x99, 36, 100], // a kick drum: dropped
      ...[0x81, 0x40, 0x80, 60, 0], // C4 off at tick 192
      ...[0x60, 0x90, 48, 0], // E3 off (velocity 0) at tick 288
      ...[0, 0xff, 0x2f, 0],
    ]),
  ]);
  const { name, events, pedal } = parseMidiFile(file.buffer);
  assert.equal(name, "Test");
  assert.equal(events.length, 2);
  const [low, high] = [...events].sort((a, b) => a.midi - b.midi);
  assert.equal(high.midi, 60);
  assert.equal(high.hand, "right");
  assert.equal(low.hand, "left");
  assert(Math.abs(high.duration - 1) < 1e-9, "two beats at 120 bpm");
  assert(Math.abs(low.duration - 2) < 1e-9, "then a beat at 60 bpm");
  assert(Math.abs(high.velocity - 100 / 127) < 1e-9);
  assert.deepEqual(pedal, [{ time: 0, down: true }]);
  assert.throws(() => parseMidiFile(new Uint8Array(20).buffer));
});
controller.stopAll();
console.log(`${passed} regression checks passed`);

await import("./geometry.mjs");
