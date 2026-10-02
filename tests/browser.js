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
  const board = desk.getObjectByName("music-desk-board");
  p.scene.updateMatrixWorld(true);
  const inPiano = (v) => p.piano.group.worldToLocal(v);
  const boardTop = inPiano(board.localToWorld(new p.THREE.Vector3(0, 0.6, 0)));
  const boardBottom = inPiano(
    board.localToWorld(new p.THREE.Vector3(0, -0.6, 0)),
  );
  assert(boardTop.z < boardBottom.z, "music desk leans toward player");
  const railBounds = new p.THREE.Box3().setFromObject(fallboard);
  assert(
    boardBottom.y > railBounds.max.y - p.piano.group.position.y,
    "rack base intersects fallboard",
  );
  for (const page of board.getObjectByName("score-book").children) {
    const pageBounds = new p.THREE.Box3().setFromObject(page);
    assert(pageBounds.min.y > railBounds.max.y, "fallboard hides lower score");
  }
  const logo = rim.getObjectByName("fallboard-logo");
  const logoBounds = new p.THREE.Box3().setFromObject(logo);
  const blackTop = Math.max(
    ...p.piano.keyMeshes
      .filter((k) => k.userData.isBlack)
      .map((k) => new p.THREE.Box3().setFromObject(k).max.y),
  );
  assert(logoBounds.min.y > blackTop + 0.02, "logo hidden behind black keys");
  const ray = new p.THREE.Raycaster();
  for (const origin of [
    [0, 2.2, 6],
    [8, 2.7, 5],
    [1.5, 6, 5],
  ]) {
    for (const x of [-0.35, 0, 0.35]) {
      const target = logo.localToWorld(new p.THREE.Vector3(x, -0.08, 0));
      // Review angles are given in the piano's own frame.
      const eye = p.piano.group.localToWorld(new p.THREE.Vector3(...origin));
      ray.set(eye, target.sub(eye).normalize());
      assert(
        ray.intersectObject(p.piano.group, true)[0]?.object === logo,
        "brand lettering occluded from review angle",
      );
    }
  }
  const benchBounds = new p.THREE.Box3().setFromObject(p.bench);
  assert(
    Math.abs(benchBounds.min.y - p.stageTopY) < 1e-6,
    "bench feet off floor",
  );
  assert(
    benchBounds.max.y <
      new p.THREE.Box3().setFromObject(p.piano.midiToKey.get(48)).max.y,
    "bench seat above keyboard",
  );
  log("logo lettering visible from three review angles; bench grounded", {
    pass: true,
  });

  key("keydown", "KeyZ");
  await wait(5000);
  const heldKey = p.piano.midiToKey.get(48);
  const keyBounds = new p.THREE.Box3().setFromObject(heldKey);
  assert(
    keyBounds.min.y - p.piano.group.position.y > 1.4,
    "held key sinks into case",
  );
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
  // C6's own root is cold here; the pinned A5 neighbour must play, not PCM.
  assert(
    a.sampleForMidi(84).backendIfPlayedNow === "recorded-neighbour",
    "cold root should report a warm neighbour",
  );
  // Earlier cold strikes may still be ringing as PCM; compare the delta.
  const before = a.voiceStats();
  c.noteOn(84, 0.72, "test:neighbour", "test");
  const after = a.voiceStats();
  c.noteOff(84, "test:neighbour");
  assert(
    after.sampled > before.sampled && after.fallback === before.fallback,
    "cold root fell back to generated PCM",
  );
  log("cold root plays a recorded neighbour", { pass: true });
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
  for (const component of p.piano.explodedComponents) {
    assert(
      !benchBounds.intersectsBox(
        new p.THREE.Box3().setFromObject(component.object),
      ),
      "bench intersects exploded component",
    );
  }
  c.noteOn(60, 0.8, "test:resonance", "test");
  // A few frames, not a fixed 40 ms: a slow frame must not fail the check.
  for (let n = 0; n < 20 && !p.resonance.poolUsage; n++) await wait(25);
  assert(
    p.resonance.poolUsage > 0 && p.resonance.poolUsage <= 20,
    `resonance pool invalid (${p.resonance.poolUsage} in use, ${p.resonance.activeCourses} active)`,
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
  log("Normal/Exploded, resonance parenting, lid, reset", { pass: true });

  // The fallboard slides clear of the keys, then its flap drops over them.
  {
    let board;
    p.piano.group.traverse((o) => {
      if (o.userData.partName === "Fallboard") board = o;
    });
    const keyBox = new p.THREE.Box3();
    for (const k of p.piano.keyMeshes) keyBox.expandByObject(k);
    const fall = new p.THREE.Box3();
    for (let t = 0; t <= 0.7; t += 0.05) {
      p.piano.setFallboard(t);
      p.piano.group.updateMatrixWorld(true);
      fall.setFromObject(board.parent);
      assert(fall.min.y > keyBox.max.y, "fallboard sweeps through the keys");
    }
    // The flap swings up and over the front, not down through the keys.
    const flap = board.parent.children.find((o) => o !== board);
    for (let t = 0.7; t <= 1; t += 0.02) {
      p.piano.setFallboard(t);
      p.piano.group.updateMatrixWorld(true);
      assert(
        !fall.setFromObject(flap).intersectsBox(keyBox),
        `fallboard flap cuts the keys at ${t.toFixed(2)}`,
      );
    }
    click("fallBtn");
    await wait(3000);
    fall.setFromObject(board.parent);
    assert(
      fall.min.z < keyBox.min.z + 0.05 &&
        fall.max.z > keyBox.max.z &&
        fall.min.y < keyBox.max.y,
      "closed fallboard leaves keys bare",
    );
    // Nor can the keys be seen past the cheeks, looking down from either side
    // through the slot under the fallboard.
    const side = new p.THREE.Raycaster();
    const keys = new Set(p.piano.keyMeshes);
    for (const x of [-8, 8])
      for (const y of [1.7, 1.75, 1.8])
        for (const z of [2.5, 2.8, 3.0]) {
          const from = p.piano.group.localToWorld(new p.THREE.Vector3(x, y, z));
          const to = p.piano.group.localToWorld(new p.THREE.Vector3(0, 1.5, z));
          side.set(from, to.sub(from).normalize());
          const hit = side.intersectObject(p.piano.group, true)[0];
          assert(
            !keys.has(hit?.object),
            `keys show past the cheek from ${x}, ${y}, ${z}`,
          );
        }
    click("fallBtn");
    await wait(3000);
    log("fallboard slides out and covers the keys", { pass: true });
  }

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
    if (height > width) {
      p.camera.updateMatrixWorld(true);
      for (const x of [benchBounds.min.x, benchBounds.max.x]) {
        for (const y of [benchBounds.min.y, benchBounds.max.y]) {
          for (const z of [benchBounds.min.z, benchBounds.max.z]) {
            const screen = new p.THREE.Vector3(x, y, z).project(p.camera);
            assert(
              Math.abs(screen.x) <= 1,
              "portrait clips bench horizontally",
            );
          }
        }
      }
    }
    const details = d.querySelector("details");
    details.open = true;
    await wait(20);
    const hidden = [];
    for (const e of d.querySelectorAll("#pianoControls button, #hudBtn")) {
      if (e.disabled || e.closest("[hidden]")) continue;
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

  // Free cam: arrows walk the viewer instead of shifting octaves.
  const octave = d.querySelector("#octaveLabel").textContent;
  const startedAt = p.camera.position.clone();
  click("freeCamBtn");
  key("keydown", "ArrowUp");
  await wait(400);
  key("keyup", "ArrowUp");
  await wait(200);
  const walked = p.camera.position.distanceTo(startedAt);
  // Shift arrives only as a flag on the arrow event, as from a held key.
  const groundY = p.camera.position.y;
  key("keydown", "ArrowUp", { shiftKey: true });
  await wait(400);
  key("keyup", "ArrowUp", { shiftKey: true });
  await wait(200);
  const rose = p.camera.position.y - groundY;
  click("freeCamBtn");
  assert(rose > 1, `free cam rose only ${rose.toFixed(2)}`);
  assert(walked > 1, `free cam walked only ${walked.toFixed(2)}`);
  assert(
    d.querySelector("#octaveLabel").textContent === octave,
    "free cam arrows shifted the octave",
  );
  log("free cam walks and flies on arrow keys", { pass: true, walked, rose });

  // Curtain: closing darkens the house down to the ghost light, opening
  // restores it.
  const ghost = p.scene.getObjectByName("ghost-light");
  click("curtainBtn");
  p.hall.update(100);
  const dark = p.hall.key.intensity === 0 && p.scene.environmentIntensity < 0.2;
  assert(dark && ghost.visible, "closed curtain left the house lit");
  click("curtainBtn");
  p.hall.update(100);
  assert(
    p.hall.key.intensity > 1 &&
      p.scene.environmentIntensity === 1 &&
      !ghost.visible,
    "opened curtain did not restore the lights",
  );
  log("curtain dims and restores the house", { pass: true });

  // Graphics presets trade resolution, shadows and glows for speed.
  {
    const select = d.querySelector("#qualitySelect");
    const pick = (value) => {
      select.value = value;
      select.dispatchEvent(new w.Event("change"));
    };
    let glow;
    p.scene.traverse((o) => (glow ??= o.material?.userData?.glassGlow));
    const beams = [];
    p.scene.traverse(
      (o) => o.material?.fragmentShader?.includes("Motes") && beams.push(o),
    );
    pick("low");
    assert(
      p.renderer.getPixelRatio() === Math.min(w.devicePixelRatio, 0.75) &&
        !p.hall.key.castShadow &&
        glow.value === 0 &&
        beams.length === 10 &&
        beams.every((o) => !o.visible),
      "Low quality kept its costly extras",
    );
    pick("medium");
    assert(
      glow.value === 1 && beams.every((o) => !o.visible),
      "Medium quality should light the walls but skip the sunbeams",
    );
    pick("high");
    assert(
      p.hall.key.castShadow &&
        glow.value === 1 &&
        beams.every((o) => o.visible),
      "High quality lost the shadow or the glass light",
    );
    log("graphics quality presets", { pass: true });
  }

  // Autoplay projects the composer on the rear wall, and takes it away.
  {
    const disc = p.scene.getObjectByName("composer-projection");
    const settle = () => {
      for (let i = 0; i < 3; i++) p.hall.update(100);
    };
    click("autoBtn");
    // The slide waits for its portrait before it is shown.
    for (let i = 0; i < 50 && !disc.visible; i++) {
      await wait(100);
      settle();
    }
    assert(
      disc.visible && disc.material.uniforms.fade.value === 1,
      "autoplay did not project its composer",
    );
    const beam = p.scene.getObjectByName("lantern-beam");
    assert(beam.visible, "the lantern on the rig cast no beam");
    click("autoBtn");
    settle();
    assert(
      !disc.visible && !beam.visible,
      "stopping autoplay left the projection on",
    );
    log("composer projection follows autoplay", { pass: true });

    // Credits roll up the same disc, end on the developer's card, and give
    // way to autoplay.
    const creditsBtn = d.querySelector("#creditsBtn");
    click("creditsBtn");
    for (let i = 0; i < 50 && !disc.visible; i++) {
      await wait(100);
      settle();
    }
    const roll = disc.material.uniforms.map.value;
    assert(
      disc.visible && creditsBtn.getAttribute("aria-pressed") === "true",
      "the credits did not roll",
    );
    for (let i = 0; i < 2000; i++) roll.userData.tick(0.1);
    const card = roll.image.getContext("2d").getImageData(412, 300, 200, 200);
    assert(
      card.data.some((v, i) => i % 4 === 0 && v > 60),
      "the credits did not end on the developer's card",
    );
    click("autoBtn");
    assert(
      creditsBtn.getAttribute("aria-pressed") === "false",
      "autoplay left the credits button pressed",
    );
    click("autoBtn");
    click("creditsBtn");
    click("creditsBtn");
    settle();
    assert(!disc.visible, "closing the credits left the projection on");
    log("credits roll on the projection", { pass: true });
  }

  // The open score follows the music.
  {
    const book = p.piano.scoreBook;
    book.turnTo(1);
    book.update(1, true);
    assert(book.follow(0.05) !== null, "the score did not mark the first bar");
    assert(book.follow(-1) === null, "the score marked a bar before the music");
    log("the score follows the music", { pass: true });
  }

  // Styled dropdowns drive their native select by mouse and keyboard.
  {
    const select = d.querySelector("#qualitySelect");
    const trigger = d.querySelector("#qualitySelectButton");
    const list = d.querySelector("#qualitySelectList");
    const press = (key) =>
      trigger.dispatchEvent(
        new w.KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
        }),
      );
    let changes = 0;
    const count = () => changes++;
    select.addEventListener("change", count);
    trigger.click();
    assert(
      !list.hidden && list.children.length === select.options.length,
      "dropdown did not open with every option",
    );
    press("ArrowDown");
    press("Enter");
    assert(
      list.hidden &&
        select.value === "ultra" &&
        changes === 1 &&
        trigger.textContent === "Graphics: Ultra",
      "keyboard choice did not reach the select",
    );
    select.value = "high"; // programmatic: no event, label must follow
    assert(trigger.textContent === "Graphics: High", "label missed a set");
    select.dispatchEvent(new w.Event("change"));
    trigger.click();
    list.children[1].click();
    assert(select.value === "medium" && list.hidden, "click choice failed");
    select.removeEventListener("change", count);
    select.value = "high";
    select.dispatchEvent(new w.Event("change"));
    log("styled dropdown: mouse, keyboard, programmatic", { pass: true });
  }

  // Bench knobs step the seat up and back down.
  let knob;
  p.bench.traverse((o) => (knob ??= o.userData.onPick && o));
  const seatTop = () => new p.THREE.Box3().setFromObject(p.bench).max.y;
  const rest = seatTop();
  const heights = [1, 2, 3, 4].map(() => {
    knob.userData.onPick();
    p.bench.userData.update(100);
    return seatTop() - rest;
  });
  assert(
    [0.1, 0.2, 0.1, 0].every((h, i) => Math.abs(heights[i] - h) < 0.01),
    `bench lift steps ${heights.map((h) => h.toFixed(2))}`,
  );
  log("bench knobs raise and lower the seat", { pass: true, heights });

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
        [1.7, -1.05, 5],
        [0, -1.45, 2.45],
      ],
    };
    const [position, target] = views[button.dataset.view];
    p.camera.position.copy(
      p.piano.group.localToWorld(new p.THREE.Vector3(...position)),
    );
    p.controls.target.copy(
      p.piano.group.localToWorld(new p.THREE.Vector3(...target)),
    );
    p.controls.update();
  };
}
