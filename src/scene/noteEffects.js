import * as THREE from "three";

/**
 * Autoplay visuals: precious-metal light columns fall from above onto the key
 * that will sound, the key glows in its hand's colour while the note lasts, and
 * each strike throws up twinkling star dust. Driven by song time, so the
 * visuals stay locked to the scheduled notes.
 */
export const HAND_COLORS = {
  right: new THREE.Color("#ffc65c"), // gold
  left: new THREE.Color("#c9d6ea"), // platinum: a cool silver against the gold
};

const FALL_SPEED = 1.7; // world units per second
const FALL_HEIGHT = 3.4; // columns appear this far above the keys
const MAX_COLUMNS = 48;
const MAX_PARTICLES = 1600;

const columnVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vWorldY;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldY = world.y;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
const columnFragment = /* glsl */ `
  uniform vec3 color;
  uniform float fadeTop;
  uniform float keyTop;
  uniform float halo;
  varying vec2 vUv;
  varying float vWorldY;
  void main() {
    float fadeIn = 1.0 - smoothstep(fadeTop - 1.1, fadeTop, vWorldY);
    if (halo > 0.5) {
      // Soft outer glow shell: a cheap stand-in for bloom.
      float g = 1.0 - abs(vUv.x - 0.5) * 2.0;
      g *= g;
      gl_FragColor = vec4(color * g * 0.8, g * 0.8 * fadeIn);
      return;
    }
    // Bright facet edges and a faint inner facet: a cut crystal bar.
    float edge = 1.0 - smoothstep(0.0, 0.16, min(vUv.x, 1.0 - vUv.x));
    float facet = 1.0 - smoothstep(0.0, 0.05, abs(vUv.x - 0.32));
    float body = 0.45 + 0.7 * edge + 0.35 * facet;
    float impact = 1.0 + 1.6 * (1.0 - smoothstep(keyTop, keyTop + 0.35, vWorldY));
    vec3 tint = mix(color, vec3(1.0), 0.55 * edge + 0.25 * facet);
    gl_FragColor = vec4(tint * body * impact * 1.35, body * fadeIn);
  }
`;

const waveVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const waveFragment = /* glsl */ `
  uniform sampler2D energy;
  uniform vec3 right;
  uniform vec3 left;
  uniform float time;
  uniform float opacity;
  varying vec2 vUv;
  const float BARS = 180.0;
  void main() {
    float bar = floor(vUv.x * BARS);
    float u = (bar + 0.5) / BARS;
    vec2 e = texture2D(energy, vec2(u, 0.5)).rg;
    float sum = e.r + e.g;
    // A quiet travelling ripple, and louder bars that shimmer as they ring.
    float idle = 0.05 + 0.035 * sin(u * 26.0 - time * 2.2) * sin(u * 7.0 + time * 0.9);
    float amp = idle + sum * (0.75 + 0.25 * sin(bar * 1.7 + time * 11.0));
    amp *= smoothstep(0.0, 0.05, u) * smoothstep(1.0, 0.95, u);
    amp = min(amp, 0.98);
    // Antialiased round-ended bars, brightest at the centre line.
    float fx = abs(fract(vUv.x * BARS) - 0.5);
    float aa = fwidth(vUv.x * BARS);
    float column = 1.0 - smoothstep(0.2 - aa, 0.2 + aa, fx);
    float y = abs(vUv.y - 0.5) * 2.0;
    float body = 1.0 - smoothstep(amp - 0.04, amp, y);
    float core = exp(-y * 5.0 / max(amp, 0.05));
    float line = exp(-y * 60.0) * 0.35;
    vec3 hand = sum > 0.001 ? mix(right, left, e.g / sum) : vec3(1.0, 0.88, 0.66);
    vec3 color = mix(hand, vec3(1.0), 0.45 * core);
    float a = (column * body * (0.55 + 1.1 * core) + line) * opacity;
    gl_FragColor = vec4(color * a * 1.8, a);
  }
`;

const particleVertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  uniform float scale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * scale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const particleFragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    float core = exp(-r2 * 38.0);
    // Four-point diffraction spikes: the "diamond" glint.
    float spikes = max(0.0, 1.0 - abs(d.x) * 16.0) * max(0.0, 1.0 - abs(d.y) * 2.1)
                 + max(0.0, 1.0 - abs(d.y) * 16.0) * max(0.0, 1.0 - abs(d.x) * 2.1);
    float a = (core + 0.75 * spikes) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(vColor, vec3(1.0), core) * a * 1.6, a);
  }
`;

export function createNoteEffects(scene, piano, renderer, camera) {
  const group = new THREE.Group();
  group.name = "note-effects";
  scene.add(group);

  // Anchor on each key in its own space, so columns follow the key's dip and
  // the exploded layout.
  scene.updateMatrixWorld(true);
  const keyInfo = new Map();
  for (const key of piano.keyMeshes) {
    const { width, height, depth } = key.geometry.parameters;
    keyInfo.set(key.userData.midi, {
      key,
      // Land on the playable front of white keys, the middle of black keys.
      local: new THREE.Vector3(
        0,
        height / 2,
        key.userData.isBlack ? 0 : depth * 0.2,
      ),
      width,
      original: key.material,
    });
  }
  const anchor = new THREE.Vector3();
  const anchorOf = (info) => info.key.localToWorld(anchor.copy(info.local));
  const keyTop = Math.max(...[...keyInfo.values()].map((k) => anchorOf(k).y));
  // The key line lives in the keyboard's own frame, so it turns with the
  // piano on stage and follows the keyboard in the exploded layout.
  const keyboard = piano.explodedComponents.find(
    (c) => c.id === "keyboard",
  ).object;
  const toKeyboard = (info) => keyboard.worldToLocal(anchorOf(info).clone());
  const whites = [...keyInfo.values()].filter((k) => !k.key.userData.isBlack);
  const lineY = Math.max(...whites.map((k) => toKeyboard(k).y));
  const whiteBack = Math.min(...whites.map((k) => toKeyboard(k).z));

  // --- Key glow ---------------------------------------------------------------
  const glowMaterials = new Map();
  function glowFor(info, hand) {
    const id = `${hand}:${info.key.userData.isBlack}`;
    if (!glowMaterials.has(id)) {
      const material = info.original.clone();
      material.emissive = HAND_COLORS[hand].clone();
      material.emissiveIntensity = info.key.userData.isBlack ? 2.2 : 1.25;
      material.color.lerp(HAND_COLORS[hand], 0.6);
      glowMaterials.set(id, material);
    }
    return glowMaterials.get(id);
  }
  const lit = new Map(); // midi -> hand
  function setLit(next) {
    for (const [midi] of lit)
      if (!next.has(midi))
        keyInfo.get(midi).key.material = keyInfo.get(midi).original;
    for (const [midi, hand] of next) {
      const info = keyInfo.get(midi);
      if (info) info.key.material = glowFor(info, hand);
    }
    lit.clear();
    for (const entry of next) lit.set(...entry);
  }

  // --- Falling crystal columns ------------------------------------------------
  const columnGeometry = new THREE.BoxGeometry(1, 1, 1);
  columnGeometry.translate(0, 0.5, 0); // grow upward from the base
  // The glow is a flat card turned toward the camera: a box shell showed its
  // side faces edge-on as a stray line beside each column.
  const haloGeometry = new THREE.PlaneGeometry(1, 1);
  haloGeometry.translate(0, 0.5, 0);
  const columnMaterial = (color, halo) =>
    new THREE.ShaderMaterial({
      uniforms: {
        color: { value: color },
        fadeTop: { value: keyTop + FALL_HEIGHT },
        keyTop: { value: keyTop },
        halo: { value: halo },
      },
      vertexShader: columnVertex,
      fragmentShader: columnFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
  const columnMaterials = {};
  const haloMaterials = {};
  for (const [hand, color] of Object.entries(HAND_COLORS)) {
    columnMaterials[hand] = columnMaterial(color, 0);
    haloMaterials[hand] = columnMaterial(color, 1);
  }
  const columns = Array.from({ length: MAX_COLUMNS }, () => {
    const mesh = new THREE.Mesh(columnGeometry, columnMaterials.right);
    const shell = new THREE.Mesh(haloGeometry, haloMaterials.right);
    shell.scale.set(3.2, 1, 1);
    mesh.add(shell);
    mesh.visible = false;
    mesh.renderOrder = 5;
    group.add(mesh);
    return mesh;
  });

  // --- Soundwave ribbon ----------------------------------------------------------
  // Stands along the back of the keys: glowing bars swell over the keys that
  // sound, tinted by hand, and ripple softly between notes.
  const WAVE_W = 6.2;
  const WAVE_H = 0.28;
  const WAVE_TEXELS = 128;
  const energy = new Uint8Array(WAVE_TEXELS * 4);
  const energyTexture = new THREE.DataTexture(energy, WAVE_TEXELS, 1);
  energyTexture.magFilter = energyTexture.minFilter = THREE.LinearFilter;
  const wave = new THREE.Mesh(
    new THREE.PlaneGeometry(WAVE_W, WAVE_H),
    new THREE.ShaderMaterial({
      uniforms: {
        energy: { value: energyTexture },
        right: { value: HAND_COLORS.right },
        left: { value: HAND_COLORS.left },
        time: { value: 0 },
        opacity: { value: 0 },
      },
      vertexShader: waveVertex,
      fragmentShader: waveFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  wave.renderOrder = 5;
  wave.raycast = () => {}; // light, not a part: clicks pass through to the keys
  wave.position.set(0, lineY + 0.13, whiteBack - 0.42);
  keyboard.add(wave);

  // --- The lane, for the games: a dark screen standing behind the keys, so
  // the falling lights read clearly against it rather than the music desk.
  const desk = piano.explodedComponents.find(
    (c) => c.id === "musicDesk",
  ).object;
  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(WAVE_W + 0.6, FALL_HEIGHT + 0.4),
    new THREE.ShaderMaterial({
      vertexShader: waveVertex,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          float edge = smoothstep(0.0, 0.03, vUv.x) * (1.0 - smoothstep(0.97, 1.0, vUv.x));
          float a = 0.82 * (1.0 - smoothstep(0.72, 1.0, vUv.y)) * edge;
          gl_FragColor = vec4(0.025, 0.02, 0.03, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      // Over the music desk standing just behind it; nothing else on the
      // keys' side comes between it and the player.
      depthTest: false,
      side: THREE.DoubleSide,
    }),
  );
  lane.renderOrder = 4; // under the lights, over everything behind
  lane.raycast = () => {};
  lane.visible = false;
  lane.position.set(0, lineY + (FALL_HEIGHT + 0.4) / 2 - 0.05, whiteBack - 0.3);
  keyboard.add(lane);
  const keyU = new Map(
    [...keyInfo].map(([midi, info]) => [
      midi,
      toKeyboard(info).x / WAVE_W + 0.5,
    ]),
  );
  const envelope = new Map(); // midi -> [level, hand]

  function updateWave(dt, next) {
    for (const [midi, hand] of next)
      if (!envelope.has(midi)) envelope.set(midi, [1.4, hand]); // strike
    for (const [midi, entry] of envelope) {
      // Held notes settle to a steady swell; released ones ring away.
      entry[0] = THREE.MathUtils.damp(
        entry[0],
        next.has(midi) ? 1 : 0,
        next.has(midi) ? 3 : 2.4,
        dt,
      );
      if (next.has(midi)) entry[1] = next.get(midi);
      else if (entry[0] < 0.01) envelope.delete(midi);
    }
    for (let i = 0; i < WAVE_TEXELS; i++) {
      const u = (i + 0.5) / WAVE_TEXELS;
      let r = 0;
      let l = 0;
      for (const [midi, [level, hand]] of envelope) {
        const e = level * Math.exp(-(((u - keyU.get(midi)) / 0.035) ** 2));
        if (hand === "left") l += e;
        else r += e;
      }
      energy[i * 4] = Math.min(255, r * 180);
      energy[i * 4 + 1] = Math.min(255, l * 180);
    }
    energyTexture.needsUpdate = true;
  }

  // --- Star dust ----------------------------------------------------------------
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const sizes = new Float32Array(MAX_PARTICLES);
  const alphas = new Float32Array(MAX_PARTICLES);
  const velocity = new Float32Array(MAX_PARTICLES * 3);
  const life = new Float32Array(MAX_PARTICLES);
  const maxLife = new Float32Array(MAX_PARTICLES);
  const baseSize = new Float32Array(MAX_PARTICLES);
  const phase = new Float32Array(MAX_PARTICLES);
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  particleGeometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  particleGeometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  particleGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
  const particleMaterial = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 400 } },
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(particleGeometry, particleMaterial);
  points.frustumCulled = false;
  points.renderOrder = 6;
  group.add(points);
  let nextParticle = 0;
  const white = new THREE.Color(1, 1, 1);
  const tint = new THREE.Color();

  function emit(info, hand, count, burst) {
    for (let n = 0; n < count; n++) {
      const i = nextParticle;
      nextParticle = (nextParticle + 1) % MAX_PARTICLES;
      const at = anchorOf(info);
      positions[i * 3] = at.x + (Math.random() - 0.5) * info.width * 0.8;
      positions[i * 3 + 1] = at.y + 0.01;
      positions[i * 3 + 2] = at.z + (Math.random() - 0.5) * 0.12;
      const speed = burst
        ? 0.5 + Math.random() * 1.3
        : 0.25 + Math.random() * 0.5;
      velocity[i * 3] = (Math.random() - 0.5) * (burst ? 0.9 : 0.3);
      velocity[i * 3 + 1] = speed;
      velocity[i * 3 + 2] = (Math.random() - 0.5) * 0.35;
      maxLife[i] = life[i] = 0.7 + Math.random() * (burst ? 1.4 : 0.9);
      baseSize[i] =
        (burst && n === 0 ? 0.55 : 0.035 + Math.random() * 0.07) *
        (Math.random() < 0.08 ? 2.4 : 1);
      phase[i] = Math.random() * Math.PI * 2;
      tint.copy(HAND_COLORS[hand]).lerp(white, Math.random() * 0.6);
      tint.toArray(colors, i * 3);
    }
  }

  function updateParticles(dt, time) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (life[i] <= 0) {
        alphas[i] = 0;
        continue;
      }
      life[i] -= dt;
      const k = i * 3;
      // Gentle drag and a slow swirl: dust drifting up like a nebula.
      velocity[k] =
        velocity[k] * (1 - 0.9 * dt) +
        Math.sin(time * 1.3 + phase[i]) * 0.12 * dt;
      velocity[k + 1] *= 1 - 0.55 * dt;
      velocity[k + 2] =
        velocity[k + 2] * (1 - 0.9 * dt) +
        Math.cos(time * 1.1 + phase[i]) * 0.08 * dt;
      positions[k] += velocity[k] * dt;
      positions[k + 1] += velocity[k + 1] * dt;
      positions[k + 2] += velocity[k + 2] * dt;
      const t = life[i] / maxLife[i];
      const twinkle = 0.55 + 0.45 * Math.sin(time * 14 + phase[i] * 3);
      alphas[i] = Math.max(0, t) * twinkle * (baseSize[i] > 0.3 ? t * t : 1);
      sizes[i] = baseSize[i] * (baseSize[i] > 0.3 ? 0.6 + 0.4 * t : 1);
    }
    particleGeometry.attributes.position.needsUpdate = true;
    particleGeometry.attributes.aAlpha.needsUpdate = true;
    particleGeometry.attributes.aSize.needsUpdate = true;
    particleGeometry.attributes.aColor.needsUpdate = true;
  }

  // --- Timeline -----------------------------------------------------------------
  let events = [];
  let cursor = 0;
  let lastElapsed = -Infinity;
  let clock = 0;
  const drawingSize = new THREE.Vector2();

  function start(songEvents) {
    events = songEvents;
    cursor = 0;
    lastElapsed = -Infinity;
  }

  function stop() {
    events = [];
    setLit(new Map());
    for (const column of columns) column.visible = false;
  }

  function update(dt, elapsed, reducedMotion = false) {
    clock += dt;
    const playing = elapsed !== null && events.length > 0;
    const waveUniforms = wave.material.uniforms;
    waveUniforms.opacity.value = THREE.MathUtils.damp(
      waveUniforms.opacity.value,
      playing && !reducedMotion ? 1 : 0,
      4,
      dt,
    );
    waveUniforms.time.value = clock;

    const next = new Map();
    let used = 0;
    if (playing) {
      for (const event of events) {
        const info = keyInfo.get(event.midi);
        if (!info) continue;
        const bottom = (event.time - elapsed) * FALL_SPEED;
        if (bottom > FALL_HEIGHT) break; // events are time-sorted
        const top = (event.time + event.duration - elapsed) * FALL_SPEED;
        if (top <= 0) continue;
        if (bottom <= 0) next.set(event.midi, event.hand);
        if (reducedMotion || used >= MAX_COLUMNS) continue;
        const column = columns[used++];
        const base = Math.max(0, bottom);
        column.material = columnMaterials[event.hand];
        const at = anchorOf(info);
        const shell = column.children[0];
        shell.material = haloMaterials[event.hand];
        shell.rotation.y = Math.atan2(
          camera.position.x - at.x,
          camera.position.z - at.z,
        );
        column.position.set(at.x, at.y + base, at.z);
        column.scale.set(
          info.width * 0.86,
          Math.max(0.02, top - base),
          info.width * 0.5,
        );
        column.visible = true;
      }
      // Strikes that happened since the last frame throw up star dust.
      while (cursor < events.length && events[cursor].time <= elapsed) {
        const event = events[cursor++];
        const info = keyInfo.get(event.midi);
        if (info && !reducedMotion && event.time > lastElapsed)
          emit(info, event.hand, 22, true);
      }
      if (!reducedMotion)
        for (const [midi, hand] of next)
          if (Math.random() < dt * 40) emit(keyInfo.get(midi), hand, 1, false);
      lastElapsed = elapsed;
    }
    for (let i = used; i < MAX_COLUMNS; i++) columns[i].visible = false;
    setLit(next);
    if (waveUniforms.opacity.value > 0.005) updateWave(dt, next);

    renderer.getDrawingBufferSize(drawingSize);
    particleMaterial.uniforms.scale.value =
      (drawingSize.y /
        (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))) *
      camera.zoom;
    updateParticles(dt, clock);
  }

  return {
    start,
    stop,
    update,
    group,
    /** Stand the dark lane behind the keys (for the games), the music desk
     *  folded away so nothing on it shows through, or put both back. */
    setLane(on) {
      lane.visible = on;
      desk.visible = !on;
    },
  };
}
