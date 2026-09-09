import { createAudioEngine } from "../src/audio/pianoAudio.js";
const results = document.querySelector("#results");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const lines = [];
const log = (text) => {
  lines.push(text);
  results.textContent = lines.join("\n");
};
const assert = (value, message) => {
  if (!value) throw new Error(message);
};
document.querySelector("#run").onclick = async () => {
  const originalFetch = window.fetch;
  const originalAudio = window.AudioContext;
  const originalWebkitAudio = window.webkitAudioContext;
  let engine;
  try {
    let requests = 0;
    window.fetch = async () => {
      requests++;
      throw new TypeError("Simulated offline");
    };
    engine = createAudioEngine();
    engine.ensureAudio();
    await engine.warmFallbacks();
    await engine.whenReady();
    engine.noteOn(21, 0.72);
    assert(
      engine.voiceStats().fallback > 0,
      "no generated fallback after failed request",
    );
    await wait(30);
    const count = requests;
    engine.noteOn(21, 0.72);
    engine.noteOn(21, 0.72);
    await wait(30);
    assert(requests === count, "failed request storm");
    log(
      "PASS offline notes use fallback; repeated attacks do not retry immediately",
    );
    window.fetch = originalFetch;
    const html = await (await fetch("../index.html")).text();
    const setup = `<script>const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return kind.startsWith('webgl')?null:original.call(this,kind,...args)};<\/script>`;
    const frame = document.querySelector("iframe");
    frame.srcdoc = html.replace("<head>", "<head>" + setup);
    await wait(2000);
    assert(
      frame.contentDocument.querySelector("#enterBtn").textContent ===
        "Retry piano",
      "WebGL failure has no retry screen",
    );
    log(
      "PASS WebGL unavailable: readable recovery screen and Retry piano button",
    );
    window.AudioContext = window.webkitAudioContext = class {
      constructor() {
        throw new Error("Simulated unavailable audio");
      }
    };
    const unavailable = createAudioEngine();
    assert(unavailable.noteOn(60) === null, "unavailable audio throws on note");
    window.AudioContext = originalAudio;
    window.webkitAudioContext = originalWebkitAudio;
    log("PASS unavailable AudioContext does not throw on note input");
    await wait(31000);
    engine.noteOn(21, 0.72);
    for (let n = 0; n < 100 && engine.cacheStats().pendingLoads; n++)
      await wait(100);
    assert(
      engine.sampleForMidi(21).recordedReady,
      "failed sample never recovered",
    );
    log("PASS request retry recovers real A0 samples after cooldown");
    engine.dispose();
    // A successful HTTP response with invalid audio must also fall back safely.
    window.fetch = async () =>
      new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    engine = createAudioEngine();
    engine.ensureAudio();
    await engine.whenReady();
    engine.noteOn(108, 0.72);
    assert(engine.voiceStats().fallback > 0, "decode failure has no fallback");
    log("PASS invalid encoded audio uses generated fallback");
    log("COMPLETE: all failure recovery checks passed");
  } catch (error) {
    log(`FAIL ${error.stack}`);
  } finally {
    engine?.dispose();
    window.fetch = originalFetch;
    window.AudioContext = originalAudio;
    window.webkitAudioContext = originalWebkitAudio;
  }
};
