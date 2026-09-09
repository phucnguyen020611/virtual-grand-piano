const frame = document.querySelector("iframe");
const output = document.querySelector("#results");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function log(name, evidence) {
  results.push({ name, ...evidence });
  document.querySelector("#summary").textContent =
    name + (evidence.error ? `: ${evidence.error}` : "");
  output.textContent = JSON.stringify(results, null, 2);
}

async function run() {
  results.length = 0;
  const w = frame.contentWindow;
  const d = w.document;
  const p = w.__vgp;
  assert(p, "Wait for the piano to load first.");
  const c = p.performance,
    a = p.audio;
  const canvas = d.querySelector("canvas");
  const click = (id) => d.querySelector(`#${id}`).click();
  const key = (type, code, options = {}) =>
    canvas.dispatchEvent(
      new w.KeyboardEvent(type, {
        code,
        bubbles: true,
        cancelable: true,
        ...options,
      }),
    );
  click("enterBtn");
  for (
    let n = 0;
    n < 100 && !d.querySelector("#audioGate").classList.contains("hidden");
    n++
  )
    await wait(50);
  assert(
    d.querySelector("#audioGate").classList.contains("hidden"),
    "entry didn't finish",
  );
  const rim = p.piano.explodedComponents.find((x) => x.id === "rim").object;
  const desk = p.piano.explodedComponents.find(
    (x) => x.id === "musicDesk",
  ).object;
  let fallboard;
  rim.traverse((o) => {
    if (o.userData.partName === "Fallboard") fallboard = o;
  });
  const board = desk.children.find((o) => o.children.length === 2);
  p.scene.updateMatrixWorld(true);
  const boardTop = board.localToWorld(new p.THREE.Vector3(0, 0.6, 0));
  const boardBottom = board.localToWorld(new p.THREE.Vector3(0, -0.6, 0));
  assert(boardTop.z < boardBottom.z, "music desk leans toward player");
  const railBounds = new p.THREE.Box3().setFromObject(fallboard);
  assert(boardBottom.y > railBounds.max.y, "rack base intersects fallboard");
  for (const page of board.children) {
    const pageBounds = new p.THREE.Box3().setFromObject(page);
    assert(pageBounds.min.y > railBounds.max.y, "fallboard hides lower score");
  }
  key("keydown", "KeyZ");
  await wait(5000);
  const heldKey = p.piano.midiToKey.get(48);
  const keyBounds = new p.THREE.Box3().setFromObject(heldKey);
  assert(keyBounds.min.y > 1.4, "held key sinks into case");
  key("keyup", "KeyZ");
  log(
    "rack leans backward; score clears fallboard; five-second held key clears bed",
    { pass: true },
  );

  const cold = {};
  for (const midi of [21, 108, 48]) {
    let t = performance.now();
    c.noteOn(midi, 0.72, `test:${midi}`, "test");
    cold[midi] = +(performance.now() - t).toFixed(2);
    c.noteOff(midi, `test:${midi}`);
  }
  log("cold note call duration, ms (not output latency)", cold);
  await a.whenReady();
  await wait(1200);
  log("initial outer-register residency", {
    A0: a.sampleForMidi(21),
    C8: a.sampleForMidi(108),
    cache: a.cacheStats(),
  });
  for (const midi of [21, 108]) {
    c.noteOn(midi, 0.72, `test:lazy:${midi}`, "test");
    c.noteOff(midi, `test:lazy:${midi}`);
    for (let n = 0; n < 100 && a.cacheStats().pendingLoads; n++)
      await wait(100);
    assert(a.sampleForMidi(midi).recordedReady, `${midi} lazy load failed`);
  }
  const misses = a.cacheStats().misses;
  for (let i = 0; i < 3; i++)
    for (const midi of [21, 108]) {
      c.noteOn(midi, 0.72, `test:outer:${midi}`, "test");
      c.noteOff(midi, `test:outer:${midi}`);
    }
  assert(
    a.cacheStats().misses === misses,
    "alternating A0/C8 churns recorded cache",
  );
  log("core + A0/C8 decoded; alternating extremes makes no new requests", {
    cache: a.cacheStats(),
  });
  const warmStart = performance.now();
  c.noteOn(60, 0.72, "test:warm", "test");
  log("warm note call duration, ms", {
    duration: +(performance.now() - warmStart).toFixed(2),
  });
  c.stopAll();
  for (let i = 0; i < 12; i++) {
    key("keydown", "KeyZ");
    key("keyup", "KeyZ");
  }
  assert(!c.physicallyHeldNotes.size, "repeated keyboard note stuck");
  key("keydown", "KeyZ");
  const held = [...c.physicallyHeldNotes][0];
  click("octaveUpBtn");
  key("keyup", "KeyZ");
  assert(!c.physicallyHeldNotes.size, "octave release stuck");
  click("octaveDownBtn");
  key("keydown", "Space");
  c.setSustainForSource("midi:test:cc64", true, "midi:test");
  key("keyup", "Space");
  assert(c.sustain, "Space stole MIDI sustain");
  c.releaseSource("midi:test");
  assert(!c.sustain, "MIDI pedal remained held");
  log("keyboard repeat, octave, sustain ownership", { pass: true });

  // Synthetic pointer gestures still use the real raycaster and controller.
  // Capture APIs need real hardware pointer IDs, so only those APIs are stubbed.
  const capture = canvas.setPointerCapture,
    release = canvas.releasePointerCapture;
  canvas.setPointerCapture = canvas.releasePointerCapture = () => {};
  const point = (object, offset) => {
    p.scene.updateMatrixWorld(true);
    p.camera.updateMatrixWorld(true);
    const v = object
      .localToWorld(
        offset ??
          new p.THREE.Vector3(
            0,
            object.geometry.parameters.height / 2 + 0.001,
            object.geometry.parameters.depth * 0.35,
          ),
      )
      .project(p.camera);
    const rect = canvas.getBoundingClientRect();
    return {
      clientX: rect.left + ((v.x + 1) * rect.width) / 2,
      clientY: rect.top + ((1 - v.y) * rect.height) / 2,
    };
  };
  const pointer = (type, id, pos) =>
    canvas.dispatchEvent(
      new w.PointerEvent(type, {
        ...pos,
        pointerId: id,
        pointerType: "touch",
        pressure: 0.5,
        button: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
  const key1 = point(p.piano.midiToKey.get(held)),
    key2 = point(p.piano.midiToKey.get(held + 2));
  pointer("pointerdown", 1, key1);
  assert(c.physicallyHeldNotes.has(held), "raycast key miss");
  key("keydown", "KeyZ");
  pointer("pointerup", 1, key1);
  assert(c.physicallyHeldNotes.has(held), "pointer stole computer note");
  key("keyup", "KeyZ");
  pointer("pointerdown", 1, key1);
  pointer("pointermove", 1, key2);
  assert(!c.physicallyHeldNotes.has(held), "glissando held old key");
  assert(c.physicallyHeldNotes.size === 1, "glissando missing next key");
  pointer("pointerdown", 2, key1);
  assert(c.physicallyHeldNotes.size === 2, "two touch notes missing");
  pointer("pointerup", 1, key2);
  assert(!p.controls.enabled, "orbit resumed while touch held");
  pointer("pointerup", 2, key1);
  assert(p.controls.enabled, "orbit stuck disabled");
  const pedal = point(
    p.piano.pedalPivots.get("sustain").children[1],
    new p.THREE.Vector3(),
  );
  pointer("pointerdown", 3, pedal);
  assert(c.sustain, "pedal raycast miss");
  pointer("pointerdown", 4, key1);
  pointer("pointerup", 3, pedal);
  assert(!c.sustain, "pedal stuck");
  assert(!p.controls.enabled, "pedal restored orbit during held key");
  pointer("pointerup", 4, key1);
  assert(p.controls.enabled, "orbit stuck after pedal+key");
  pointer("pointerdown", 3, pedal);
  pointer("pointerdown", 4, pedal);
  pointer("pointerup", 3, pedal);
  assert(c.sustain, "second pedal pointer lost ownership");
  pointer("pointerup", 4, pedal);
  assert(!c.sustain, "pedal didn't release");
  pointer("pointerdown", 1, key1);
  key("keydown", "Space");
  w.dispatchEvent(new w.Event("blur"));
  assert(
    !c.physicallyHeldNotes.size && !c.sustain && p.controls.enabled,
    "blur cleanup failed",
  );
  canvas.setPointerCapture = capture;
  canvas.releasePointerCapture = release;
  log(
    "raycast glissando, two pointers, same-note overlap, pedal+key, two pedal pointers, blur",
    { pass: true, hardware: false },
  );

  click("recordBtn");
  key("keydown", "KeyZ");
  await wait(80);
  key("keyup", "KeyZ");
  assert(
    d.querySelector("#playRecordingBtn").disabled,
    "play enabled during record",
  );
  click("recordBtn");
  key("keydown", "KeyZ");
  click("playRecordingBtn");
  await wait(40);
  click("playRecordingBtn");
  assert(c.physicallyHeldNotes.has(held), "recording stop stole live note");
  key("keyup", "KeyZ");
  for (let i = 0; i < 8; i++) {
    click("autoBtn");
    await wait(30);
    click("autoBtn");
  }
  await wait(300);
  assert(!c.physicallyHeldNotes.size, "autoplay stop left notes");
  key("keydown", "KeyP");
  click("autoBtn");
  await wait(100);
  click("autoBtn");
  assert(c.physicallyHeldNotes.has(76), "autoplay stole manual E5");
  key("keyup", "KeyP");
  log("record/play/stop overlap and repeated autoplay stops", { pass: true });

  click("explodeBtn");
  await wait(2500);
  assert(!p.lighting.lamp.visible, "fixture collides with exploded assembly");
  c.noteOn(60, 0.8, "test:resonance", "test");
  await wait(40);
  assert(
    p.resonance.poolUsage > 0 && p.resonance.poolUsage <= 20,
    "resonance pool invalid",
  );
  assert(
    p.resonance.group.parent ===
      p.piano.explodedComponents.find((x) => x.id === "strings").object,
    "overlay detached",
  );
  c.noteOff(60, "test:resonance");
  click("lidBtn");
  await wait(1000);
  assert(p.piano.lidPivot.rotation.z < 0.01, "lid failed to close");
  click("lidBtn");
  click("normalBtn");
  await wait(2500);
  click("resetBtn");
  assert(p.lighting.lamp.visible, "normal fixture not restored");
  log("Normal/Exploded, resonance parenting, lid, reset", { pass: true });

  p.explodedView.setExploded(true);
  p.explodedView.update(1 / 60, true);
  assert(
    !p.explodedView.isTransitioning,
    "reduced-motion assembly did not snap",
  );
  p.explodedView.setExploded(false);
  p.explodedView.update(1 / 60, true);
  assert(!p.explodedView.isTransitioning, "reduced-motion return did not snap");
  log("reduced-motion assembly/camera update", {
    pass: true,
    preference: "injected method argument",
  });

  // Real audio nodes with a bounded logical voice budget; observe cleanup too.
  c.setSustain(true);
  for (let round = 0; round < 4; round++)
    for (let midi = 48; midi < 84; midi++) {
      c.noteOn(midi, 0.95, `stress:${midi}`, "stress");
      c.noteOff(midi, `stress:${midi}`);
    }
  assert(a.activeVoiceCount <= 64, "logical voice limit exceeded");
  await wait(150);
  const dense = a.voiceStats();
  const peak = a.peakLevel();
  c.setSustain(false);
  c.stopAll();
  await wait(1200);
  assert(a.activeVoiceCount === 0, "dense voices didn't release");
  assert(a.voiceStats().physicalSources === 0, "physical sources leaked");
  assert(
    a.cacheStats().decodedBytes <= a.cacheStats().cacheLimitBytes,
    "cache exceeded bound",
  );
  log("144 strikes under sustain, cleanup, cache", {
    dense,
    peak,
    after: a.voiceStats(),
  });

  const widths = [
    [390, 844],
    [844, 390],
    [768, 1024],
    [1024, 768],
    [1280, 720],
    [1366, 768],
    [1440, 900],
    [1920, 1080],
    [881, 768],
    [900, 768],
    [960, 768],
    [1024, 600],
    [720, 450],
    [360, 225],
    [320, 180],
  ];
  for (const [width, height] of widths) {
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
    await wait(100);
    assert(
      w.innerWidth === width && w.innerHeight === height,
      "viewport mismatch",
    );
    const details = d.querySelector("details");
    details.open = true;
    await wait(20);
    const hidden = [];
    for (const e of d.querySelectorAll("#pianoControls button")) {
      if (e.disabled) continue;
      e.focus();
      e.scrollIntoView({ block: "nearest", inline: "nearest" });
      const r = e.getBoundingClientRect();
      const x = Math.min(width - 1, Math.max(1, r.left + r.width / 2)),
        y = Math.min(height - 1, Math.max(1, r.top + r.height / 2));
      if (
        r.left < -0.5 ||
        r.right > width + 0.5 ||
        r.top < -0.5 ||
        r.bottom > height + 0.5 ||
        !e.contains(d.elementFromPoint(x, y))
      )
        hidden.push(e.id);
    }
    assert(
      !hidden.length,
      `${width}×${height} obscured controls: ${hidden.join(",")}`,
    );
    log(`controls reachable ${width}×${height}`, { pass: true });
    details.open = width > 1180;
  }
  frame.style.width = "1440px";
  frame.style.height = "900px";
  await wait(100);
  click("resetBtn");
  let meshes = 0,
    shadowCasters = 0;
  const geometries = new Set(),
    materials = new Set();
  p.scene.traverse((o) => {
    if (o.isMesh) meshes++;
    if (o.castShadow) shadowCasters++;
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) materials.add(o.material);
  });
  log("scene diagnostics", {
    meshes,
    shadowCasters,
    geometries: geometries.size,
    materials: materials.size,
    render: p.renderer.info.render,
    pixelRatio: p.renderer.getPixelRatio(),
    cache: a.cacheStats(),
  });
  log("COMPLETE", { pass: true });
}
document.querySelector("#run").onclick = () =>
  run().catch((error) => log("FAIL", { error: error.stack }));

document.querySelector("#soak").onclick = async () => {
  results.length = 0;
  const p = frame.contentWindow.__vgp;
  const d = frame.contentDocument;
  try {
    assert(p, "Wait for the piano to load first.");
    log("Session running", {});
    d.querySelector("#enterBtn").click();
    await p.audio.warmFallbacks();
    await p.audio.whenReady();
    let cycles = 0;
    const start = performance.now();
    while (performance.now() - start < 180000) {
      p.input.recorder.start();
      p.performance.setSustainForSource("computer:space", true, "computer");
      for (let i = 0; i < 12; i++) {
        const midi = 48 + ((cycles + i * 3) % 36);
        p.performance.noteOn(midi, 0.72, `computer:soak:${i}`, "computer");
        p.performance.noteOff(midi, `computer:soak:${i}`);
      }
      await wait(100);
      p.performance.setSustainForSource("computer:space", false, "computer");
      p.input.recorder.stop();
      p.input.recorder.play();
      d.querySelector("#autoBtn").click();
      await wait(200);
      d.querySelector("#autoBtn").click();
      p.input.recorder.stopPlayback();
      p.performance.stopAll();
      await wait(800);
      assert(!p.performance.physicallyHeldNotes.size, "soak held notes leaked");
      assert(p.audio.activeVoiceCount <= 64, "soak voice budget exceeded");
      assert(
        p.audio.cacheStats().decodedBytes <=
          p.audio.cacheStats().cacheLimitBytes,
        "soak cache exceeded",
      );
      cycles++;
      if (cycles % 20 === 0)
        document.querySelector("#summary").textContent =
          `Session: ${cycles} cycles`;
    }
    await wait(1500);
    assert(
      p.audio.voiceStats().physicalSources === 0,
      "soak physical sources leaked",
    );
    log("PASS 3-minute session", {
      cycles,
      strikes: cycles * 12,
      cache: p.audio.cacheStats(),
      voices: p.audio.voiceStats(),
    });
  } catch (error) {
    log("FAIL", { error: error.stack });
  }
};

// Repeatable close-up views for the geometry reported in the model review.
for (const button of document.querySelectorAll("[data-view]")) {
  button.onclick = () => {
    const p = frame.contentWindow.__vgp;
    if (!p) return;
    p.explodedView.cancelCameraAssist();
    const views = {
      side: [
        [8, 2.7, 5],
        [0, 1.5, 2],
      ],
      keys: [
        [1.5, 6, 5],
        [0, 1.5, 2.3],
      ],
      hinge: [
        [-7, 4, -5],
        [-1, 1.6, -0.8],
      ],
      pedals: [
        [1.7, 0.85, 5],
        [0, 0.45, 2.45],
      ],
    };
    const [position, target] = views[button.dataset.view];
    p.camera.position.set(...position);
    p.controls.target.set(...target);
    p.controls.update();
  };
}
