import * as THREE from "three";

/**
 * Sainte-Chapelle-style lancets: a dense mosaic ground, jewelled borders, a
 * tiered rose in the arch and a column of medallions, each a kaleidoscope of
 * concentric rings. A shader lets the panes twinkle, sweeps a sheen across
 * the glass and shifts it through an iridescent sheen with the viewing angle;
 * the wall round it takes on their light.
 *
 * Everything is authored in the opening's own units: x −2.5…2.5, y 0…16.
 */

const W = 5;
const H = 16;
const SPRING = H - W / 2; // where the arch springs
const PX = 512 / W; // canvas pixels per unit
const CANVAS_H = Math.round(H * PX);

const JEWELS = {
  ruby: "#b3122c",
  sapphire: "#1846b8",
  gold: "#eab53a",
  emerald: "#1f8a4c",
  amethyst: "#7a2ca3",
  rose: "#d8457a",
  turquoise: "#1aa3a8",
  pearl: "#f3ead2",
};
const PALETTES = [
  ["sapphire", "ruby", "gold", "emerald", "pearl"],
  ["ruby", "sapphire", "amethyst", "gold", "turquoise"],
  ["sapphire", "amethyst", "ruby", "turquoise", "gold"],
  ["emerald", "ruby", "sapphire", "gold", "rose"],
  ["amethyst", "sapphire", "rose", "gold", "emerald"],
].map((names) => names.map((n) => JEWELS[n]));
const GROUNDS = ["checker", "scales", "lozenges", "roundels", "checker"];
const SHAPES = ["circle", "quatrefoil", "lozenge", "star"];

function drawWindow(variant) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = CANVAS_H;
  const g = canvas.getContext("2d");
  const palette = PALETTES[variant];
  const [ground, field, accent, deep, light] = palette;
  let seed = 9001 + variant * 7919;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const X = (x) => (x / W + 0.5) * 512;
  const Y = (y) => (1 - y / H) * CANVAS_H;
  const lancet = (inset) => {
    const p = new Path2D();
    p.moveTo(X(-W / 2 + inset), Y(inset));
    p.lineTo(X(-W / 2 + inset), Y(SPRING));
    p.arc(X(0), Y(SPRING), (W / 2 - inset) * PX, Math.PI, 0);
    p.lineTo(X(W / 2 - inset), Y(inset));
    p.closePath();
    return p;
  };
  // Hand-made glass: every pane a little lighter or darker than its sheet.
  const pane = (path, color) => {
    g.fillStyle = color;
    g.fill(path);
    g.globalAlpha = 0.28 * rnd();
    g.fillStyle = rnd() > 0.55 ? "#fff" : "#000";
    g.fill(path);
    g.globalAlpha = 1;
    g.stroke(path);
  };
  const circle = (x, y, r) => {
    const p = new Path2D();
    p.arc(X(x), Y(y), r * PX, 0, 2 * Math.PI);
    return p;
  };
  g.fillStyle = "#100a07";
  g.fillRect(0, 0, 512, CANVAS_H);
  g.strokeStyle = "#100a07";
  g.lineJoin = "round";
  g.lineWidth = 2.5;

  // Border first: a band of jewels round the lancet; the field covers its inside.
  pane(lancet(0), deep);
  g.save();
  g.clip(lancet(0.05));
  const along = [];
  for (let y = 0.2; y < SPRING; y += 0.32)
    along.push([-W / 2 + 0.2, y], [W / 2 - 0.2, y]);
  for (let a = Math.PI; a <= 2 * Math.PI; a += Math.PI / 24)
    along.push([
      Math.cos(a) * (W / 2 - 0.2),
      SPRING - Math.sin(a) * (W / 2 - 0.2),
    ]);
  along.forEach(([x, y], i) => {
    const p = new Path2D();
    p.rect(X(x) - 0.11 * PX, Y(y) - 0.11 * PX, 0.22 * PX, 0.22 * PX);
    pane(p, i % 4 < 2 ? ground : field);
    pane(circle(x, y, 0.05), accent);
  });
  g.restore();
  // Ground: a fine mosaic clipped to the field.
  g.save();
  g.clip(lancet(0.36));
  const step = 0.26;
  const kind = GROUNDS[variant];
  for (let y = 0, row = 0; y < H + step; y += step, row++)
    for (let x = -W / 2, col = 0; x < W / 2 + step; x += step, col++) {
      const p = new Path2D();
      if (kind === "checker") {
        p.rect(X(x), Y(y + step), step * PX, step * PX);
        pane(p, (row + col) % 2 ? ground : field);
      } else if (kind === "scales") {
        const cx = x + (row % 2 ? step / 2 : 0);
        p.arc(X(cx), Y(y), (step / 1.6) * PX, Math.PI, 0);
        p.closePath();
        pane(p, col % 3 ? ground : field);
      } else if (kind === "lozenges") {
        const cx = x + (row % 2 ? step / 2 : 0);
        p.moveTo(X(cx), Y(y + step * 0.75));
        p.lineTo(X(cx + step / 2), Y(y));
        p.lineTo(X(cx), Y(y - step * 0.75));
        p.lineTo(X(cx - step / 2), Y(y));
        p.closePath();
        pane(p, (row + col) % 3 ? ground : accent);
      } else {
        p.rect(X(x), Y(y + step), step * PX, step * PX);
        pane(p, ground);
        pane(
          circle(x + step / 2, y + step / 2, step * 0.36),
          (row + col) % 2 ? field : light,
        );
      }
    }
  g.restore();

  // A kaleidoscope: concentric rings of wedges whose colours step round with
  // each ring, so neighbouring rings never line up.
  const rings = (x, y, r, count, colors) => {
    for (let k = count - 1; k >= 0; k--) {
      const r1 = (r * (k + 1)) / count;
      const r0 = (r * k) / count;
      const n = k === 0 ? 1 : 6 * k + (variant % 2 ? 6 : 0);
      for (let s = 0; s < n; s++) {
        const a0 = (s / n) * 2 * Math.PI + k * 0.4;
        const a1 = ((s + 1) / n) * 2 * Math.PI + k * 0.4;
        const p = new Path2D();
        if (n === 1) p.arc(X(x), Y(y), r1 * PX, 0, 2 * Math.PI);
        else {
          p.arc(X(x), Y(y), r1 * PX, a0, a1);
          p.arc(X(x), Y(y), r0 * PX, a1, a0, true);
          p.closePath();
        }
        pane(p, colors[(s + k * 2) % colors.length]);
      }
    }
  };
  const medallion = (x, y, r, shape) => {
    // Frame: a pearl-studded rim in the medallion's outline.
    const outline = new Path2D();
    if (shape === "quatrefoil")
      for (const [dx, dy] of [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ])
        outline.addPath(circle(x + dx * r * 0.45, y + dy * r * 0.45, r * 0.58));
    else if (shape === "lozenge") {
      outline.moveTo(X(x), Y(y + r * 1.15));
      outline.lineTo(X(x + r), Y(y));
      outline.lineTo(X(x), Y(y - r * 1.15));
      outline.lineTo(X(x - r), Y(y));
      outline.closePath();
    } else if (shape === "star")
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * 2 * Math.PI;
        const rr = i % 2 ? r * 0.72 : r * 1.05;
        const px = X(x + Math.sin(a) * rr);
        const py = Y(y + Math.cos(a) * rr);
        i ? outline.lineTo(px, py) : outline.moveTo(px, py);
      }
    else outline.addPath(circle(x, y, r));
    pane(outline, deep);
    g.save();
    g.lineWidth = 0.14 * PX;
    g.strokeStyle = accent;
    g.stroke(outline);
    g.restore();
    g.stroke(outline);
    const core = shape === "circle" ? r * 0.9 : r * 0.66;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * 2 * Math.PI;
      pane(
        circle(
          x + Math.cos(a) * core * 1.06,
          y + Math.sin(a) * core * 1.06,
          0.045,
        ),
        light,
      );
    }
    const count = shape === "circle" ? 5 : 4;
    rings(x, y, core, count, palette);
  };

  // Rose in the arch: the grandest wheel.
  pane(circle(0, SPRING, W / 2 - 0.36), accent);
  rings(0, SPRING, W / 2 - 0.5, 6, palette);
  // A column of medallions, shapes cycling from window to window.
  const ys = [10.0, 6.9, 3.8]; // the top one clears the rose (its foot at 11.5)
  ys.forEach((y, i) =>
    medallion(0, y, 1.4, SHAPES[(variant + i) % SHAPES.length]),
  );
  medallion(0, 1.3, 0.9, "circle");
  // Small jewelled roundels in the spandrels between them.
  for (const y of [11.2, 8.45, 5.35, 2.55])
    for (const x of [-1.62, 1.62]) {
      pane(circle(x, y, 0.4), accent);
      rings(x, y, 0.32, 2, [light, ground, deep]);
    }

  // Lead the field's edge and the outline.
  g.lineWidth = 5;
  g.stroke(lancet(0.36));
  g.stroke(lancet(0.04));

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  // The window's average colour, for the light it throws on the wall.
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const pg = probe.getContext("2d");
  pg.drawImage(canvas, 40, CANVAS_H * 0.2, 432, CANVAS_H * 0.75, 0, 0, 1, 1);
  const [r, gr, b] = pg.getImageData(0, 0, 1, 1).data;
  const tint = new THREE.Color().setRGB(
    r / 255,
    gr / 255,
    b / 255,
    THREE.SRGBColorSpace,
  );
  return { map, tint };
}

const vertexShader = /* glsl */ `
  varying vec2 vShape;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vShape = position.xy;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const common = /* glsl */ `
  uniform sampler2D map;
  uniform float time;
  uniform float level;
  varying vec2 vShape;
  varying vec3 vWorld;
  varying vec3 vNormal;
  vec2 toUv(vec2 p) { return vec2(p.x / ${W.toFixed(1)} + 0.5, p.y / ${H.toFixed(1)}); }
  vec3 hue(float h) {
    return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  }
`;

const glassFragment = /* glsl */ `
  ${common}
  void main() {
    vec3 glass = texture2D(map, toUv(vShape)).rgb;
    float lum = dot(glass, vec3(0.299, 0.587, 0.114));
    // Panes twinkle on their own clocks.
    vec2 cell = floor(vShape * 5.0);
    float seed = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    float twinkle = 0.8 + 0.35 * sin(time * (1.2 + seed * 2.6) + seed * 6.283);
    // A slow band of light sweeps up across the glass.
    float sweep = pow(0.5 + 0.5 * sin(vShape.y * 0.45 - vShape.x * 0.3 - time * 0.7), 10.0);
    // Holographic sheen: hue shifts with the viewing angle and height.
    float facing = dot(normalize(cameraPosition - vWorld), normalize(vNormal));
    vec3 iris = hue(facing * 1.8 + vShape.y * 0.06 - time * 0.04);
    // Multiplying the sheen in keeps every jewel colour saturated.
    vec3 color = glass * (twinkle + 0.9 * sweep) * (0.75 + 0.9 * iris) + lum * sweep * 0.25;
    gl_FragColor = vec4(color * level, 1.0);
    #include <colorspace_fragment>
  }
`;

/**
 * The light each window throws on the wall, computed in the wall's own
 * shader from its distance to the lancet: it lies on the surface, so frames
 * and columns in front occlude it as they would real light.
 */
function glowOnto(material, bays, tints, time, level, strength) {
  const n = bays.length;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      glowBays: { value: bays.map(([x, y, z]) => new THREE.Vector3(x, y, z)) },
      glowTints: { value: tints },
      glowTime: time,
      glowLevel: level,
      glowStrength: strength,
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vGlowWorld;",
      )
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvGlowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vGlowWorld;
        uniform vec3 glowBays[${n}];
        uniform vec3 glowTints[${n}];
        uniform float glowTime, glowLevel, glowStrength;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float pulse = 0.9 + 0.1 * sin(glowTime * 0.9);
        for (int i = 0; i < ${n}; i++) {
          vec3 b = glowBays[i];
          if (abs(vGlowWorld.x - b.x) > 1.0) continue; // this wall only
          // Signed distance to the lancet: a rectangle and its half circle.
          vec2 p = vec2(vGlowWorld.z - b.z, vGlowWorld.y - b.y);
          vec2 q = vec2(abs(p.x) - ${(W / 2).toFixed(2)}, max(-p.y, p.y - ${SPRING.toFixed(2)}));
          float rect = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
          float cap = length(p - vec2(0.0, ${SPRING.toFixed(2)})) - ${(W / 2).toFixed(2)};
          float d = max(min(rect, cap), 0.0);
          totalEmissiveRadiance += glowTints[i] * 1.5 * exp(-d * 1.1) * pulse * glowLevel * glowStrength;
        }`,
      );
  };
  material.customProgramCacheKey = () => "stained-glass-glow";
  material.userData.glassGlow = strength; // for inspection and tests
  material.needsUpdate = true;
}

/**
 * Glaze each bay ([x, y, z, yaw]) with a lancet, and light the `wall`
 * material round it.
 * @returns setLevel(0..1) to follow the house lights, setGlow(on) for the
 *   wall light, update(dt) to animate.
 */
export function buildStainedGlass(parent, bays, shape, wall) {
  const variants = PALETTES.map((_, i) => drawWindow(i));
  const glassGeometry = new THREE.ShapeGeometry(shape, 32);
  const time = { value: 0 };
  const level = { value: 1 };
  const strength = { value: 1 };
  bays.forEach(([x, y, z, yaw], i) => {
    const glass = new THREE.Mesh(
      glassGeometry,
      new THREE.ShaderMaterial({
        uniforms: {
          map: { value: variants[i % variants.length].map },
          time,
          level,
        },
        vertexShader,
        fragmentShader: glassFragment,
      }),
    );
    glass.position.set(x, y, z);
    glass.rotation.y = yaw;
    parent.add(glass);
  });
  glowOnto(
    wall,
    bays,
    bays.map((_, i) => variants[i % variants.length].tint),
    time,
    level,
    strength,
  );
  return {
    setLevel(value) {
      level.value = 0.1 + 0.9 * value;
    },
    /** The wall light is the glass's one optional cost: off at Low quality. */
    setGlow(on) {
      strength.value = on ? 1 : 0;
    },
    update(dt) {
      time.value += dt;
    },
  };
}
